// functions/src/workflow/nodes/harvestCompetitor.ts
// Jumeau SERVEUR (headless/cron) du node « Moisson concurrents »
// (src/features/workflows/registry/harvestCompetitorNode.ts). Parcourt les pages
// liste des catalogues concurrents et alimente l'index Firestore persistant, un lot
// borné de pages par tick. Sur cron, les ticks accumulent puis rafraîchissent.
//
// Le canal de lecture suit la config du site (accès connecté / moteur forcé) via
// `buildServerFetcher` — parité avec le client. En direct, c'est la MÊME IP datacenter
// que la CF fetchPageHtml, donc le même comportement que la validation live. Persistance via l'adaptateur admin-SDK. Pas de reportCount
// (absent du ctx serveur). Toute la logique métier est partagée avec le client via
// les modules purs dupliqués sous functions/src/priceWatch/catalog/.
import { getFirestore } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { stableId } from '../../priceWatch/helpers'
import { resolveSitesInput, sitesForRole, splitPageBudget } from '../../priceWatch/sourceSites'
import { harvestPass, type CompetitorConfig, type HarvestDeps } from '../../priceWatch/catalog/runHarvest'
import {
  loadCompetitorMeta, saveCompetitorMeta, savePage, countPages, touchWatch, loadSourceFamilies,
  loadIndexPages, saveIndexPageProducts,
} from '../../priceWatch/catalog/store'
import { refEnrichPass } from '../../priceWatch/catalog/refEnrichPass'
import { harvestProgress } from '../../priceWatch/catalog/harvest'
import { mapWithConcurrency, HARVEST_CONCURRENCY } from '../../priceWatch/concurrency'
import { buildServerFetcher } from '../../priceWatch/catalog/serverFetcher'
import { loadAllListings } from '../../priceWatch/catalog/store'
import { loadSourceCatalog, saveCatalogReport } from '../../priceWatch/reportStore'
import { buildReport } from '../../priceWatch/catalog/report'
import type { CompetitorListing } from '../../priceWatch/catalog/competitorListing'
import { applyTargeting, buildTargetingPrompt, familiesFromRows, detectFamilyColumn } from '../../priceWatch/catalog/categoryTargeting'
import { callLlm } from '../llm'
import { t } from '../../i18n'

/** Mode « cycle calendaire » : porté par le doc workflowSchedules du workflow (champ
 *  `cycle` posé par le node Cron). En mode cycle, un site terminé ATTEND les autres au
 *  lieu de rouvrir son balayage — le cycle a une fin globale (→ relance au calendrier).
 *  Fail-open : doc absent/illisible = comportement continu historique. */
async function isCycleMode(workflowId: string | undefined): Promise<boolean> {
  if (!workflowId) return false
  try {
    const snap = await getFirestore().doc(`workflowSchedules/${workflowId}`).get()
    return !!(snap.exists && (snap.data()?.cycle as { enabled?: boolean } | undefined)?.enabled)
  } catch { return false }
}

/** Sous ce taux de fiches identifiées, la passe d'enrichissement des clés se déclenche.
 *  Un tiers : au-delà, l'index a déjà de quoi s'apparier et les visites coûteraient plus
 *  qu'elles ne rapportent. */
const REF_ENRICH_THRESHOLD = 0.33

/**
 * Fiches ouvertes par tick.
 *
 * ⚠ Passé de 150 à 800 le 2026-08-12, une fois les visites PARALLÉLISÉES (huit de front).
 * En série, cent cinquante fiches occupaient quatre minutes pour couvrir 2 % d'un index de
 * sept mille : il fallait une nuit entière avant que les appariements ne bougent. À huit de
 * front, huit cents fiches tiennent dans la même fenêtre — l'index entier en une poignée de
 * runs. Le garde-fou reste le temps (`deadlineAt`), pas ce nombre.
 */
const REF_ENRICH_BUDGET = 800

/** Temps qu'il doit rester dans la fenêtre pour ouvrir la passe. Sous ce seuil, elle
 *  n'aurait le temps que de quelques fiches et risquerait de faire dépasser le segment —
 *  ce qui perdrait le curseur de la moisson, bien plus précieux. */
const REF_ENRICH_MIN_MS = 90_000

/** Colonnes de la feuille de statut (parité avec le node client). */
const STATUS_COLUMNS = [
  { key: 'site', label: 'Concurrent', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 200 },
  { key: 'pagesFetched', label: 'Pages ce run', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 120 },
  { key: 'productsIndexed', label: 'Produits ce run', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
  { key: 'pagesTotal', label: 'Pages indexées', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
  { key: 'progress', label: 'Balayage', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
]

function statusSheet(rows: Record<string, unknown>[]) {
  return {
    name: 'Index concurrents',
    columns: STATUS_COLUMNS,
    rows: rows.map((r, i) => ({ _id: `site_${i}`, ...r })),
    taxonomy: [],
  }
}

registerServerNode({
  type: 'harvest-competitor',
  run: async (ctx, config, inputs) => {
    // Sites + watchId : le port `sites` (node « Sites sources ») GAGNE, sinon config locale.
    const resolved = resolveSitesInput(inputs.sites, {
      sitesText: String(config.sites ?? ''), watchIdRaw: String(config.watchId ?? ''), workflowId: ctx.workflowId,
    })
    const watchId = resolved.watchId
    // Un site marqué « recherche dirigée » n'est PAS balayé par catégories (généraliste
    // dont le catalogue est sans rapport avec la source : coût énorme, rendement nul).
    const sites = sitesForRole(resolved.sites, 'harvest')
    const skipped = resolved.sites.length - sites.length
    if (skipped > 0) ctx.log('info', t(ctx.locale, 'run.harvest.directedOnly', { skipped }))
    if (sites.length === 0) {
      ctx.log('warn', t(ctx.locale, 'run.noCompetitor'))
      return { status: statusSheet([]) }
    }
    // Familles ciblées : le champ texte est un OVERRIDE explicite ; sinon elles sont
    // dérivées de la feuille source branchée (colonne Famille) — parité client.
    const typedFamilies = String(config.families ?? '').split(',').map((f) => f.trim()).filter(Boolean)
    const sourceRows = ((inputs.products ?? {}) as { rows?: Record<string, unknown>[] }).rows ?? []
    // ⚠⚠ Colonne DÉDUITE quand elle n'est pas saisie. Sans elle, `familiesFromRows` rendait
    // [] et la moisson balayait le catalogue ENTIER de chaque concurrent — outillage,
    // vêtements, consommables — pendant que la source ne vend que quelques familles. Le
    // filtre existait, l'écran l'annonçait, et il ne s'appliquait jamais faute d'un nom de
    // colonne saisi à la main.
    const familyColumn = String(config.familyColumn ?? '').trim() || detectFamilyColumn(sourceRows)
    let families = typedFamilies.length ? typedFamilies : familiesFromRows(sourceRows, familyColumn)
    // ⚠⚠ Dernier recours : les familles publiées par le dernier « Comparer ». Le port
    // `products` de CE node n'est pas toujours branché — il ne l'était pas dans le flux de
    // production — et sans feuille en entrée, aucune famille n'est lue : la moisson balayait
    // le catalogue entier de chaque concurrent, rayons que la source ne vend pas compris.
    if (families.length === 0) families = await loadSourceFamilies(ctx.uid, watchId)
    if (!typedFamilies.length && families.length) ctx.log('info', t(ctx.locale, 'run.harvest.familiesRead', { count: families.length, column: familyColumn || '—' }))
    const pageBudget = Math.max(1, Number(config.pageBudget) || 160)
    // Budget réparti équitablement entre les sites (au moins 1 page chacun).
    // Budget : un site peut RÉSERVER ses pages (concurrent coûteux à brider) ; le reste
    // est partagé équitablement entre les autres.
    // ⚠ Budget PONDÉRÉ par la saturation : les metas sont chargées juste après, mais la
    // répartition en a besoin maintenant — on les précharge donc ici.
    const satBySite = new Map<string, number>()
    // ⚠⚠ Un site dont les fiches n'ont pas de clé voit son budget de MOISSON réduit de
    // moitié : le temps ainsi libéré va à la passe d'enrichissement. Sans cette réserve,
    // elle n'avait que les restes de la fenêtre — et il n'en restait jamais, les quatre
    // sites la consommant en entier, une URL morte réessayée sur tous les moteurs pouvant à
    // elle seule coûter quatre-vingt-dix secondes. Collecter plus de fiches SANS clé
    // n'apporte rien : mieux vaut identifier celles qu'on a déjà.
    const needKeysBySite = new Set<string>()
    for (const site of sites) {
      const m = await loadCompetitorMeta(ctx.uid, watchId, stableId(site.domain))
      if (m?.saturatedSweeps) satBySite.set(site.id, m.saturatedSweeps)
      if ((m?.productCount ?? 0) >= 50 && (m?.pctRef ?? 100) < REF_ENRICH_THRESHOLD * 100) {
        needKeysBySite.add(site.id)
      }
    }
    const budgets = splitPageBudget(
      sites.map((s) => ({ ...s, saturatedSweeps: satBySite.get(s.id) })), pageBudget,
    )
    for (const id of needKeysBySite) {
      const b = budgets.get(id)
      if (b != null) budgets.set(id, Math.max(10, Math.floor(b / 2)))
    }

    // Le suivi existe dès la 1ʳᵉ moisson (liste + dashboard), sans attendre « Comparer ».
    await touchWatch(ctx.uid, watchId, ctx.workflowName)

    // Mode cycle : metas préchargées pour décider GLOBALEMENT — tous les balayages
    // terminés = le run d'échéance calendaire rouvre un cycle pour TOUS en même temps ;
    // sinon les sites terminés attendent (skip) que les retardataires finissent.
    const cycleMode = await isCycleMode(ctx.workflowId)
    const metas = new Map<string, Awaited<ReturnType<typeof loadCompetitorMeta>>>()
    for (const site of sites) {
      const siteId = stableId(site.domain)
      metas.set(siteId, await loadCompetitorMeta(ctx.uid, watchId, siteId))
    }
    const allDoneBefore = sites.every((s) => metas.get(stableId(s.domain))?.cursor?.done === true)
    if (cycleMode && allDoneBefore) ctx.log('info', t(ctx.locale, 'run.harvest.newCycle'))

    let doneCount = 0
    let skippedByDeadline = 0
    // Sites moissonnés EN PARALLÈLE BORNÉ. Ils sont indépendants (chacun son fetcher, son
    // curseur, son document `competitors/{siteId}`) : les enchaîner séquentiellement ne
    // laissait qu'UN SEUL fetch en vol pour tout le système, alors qu'une page liste coûte
    // plusieurs secondes chez le fournisseur. Le plafond évite la rafale (limites de débit
    // + Bright Data facturé à la requête).
    const results = await mapWithConcurrency(sites, HARVEST_CONCURRENCY, async (site) => {
      if (ctx.signal.aborted) return null
      // Fenêtre AVAL atteinte : ce site ne DÉMARRE pas — son curseur persiste et il
      // reprendra au prochain tick, « Comparer » gardant sa fenêtre CE run. ⚠ En
      // parallèle, ce contrôle doit vivre DANS la tâche : une sortie de boucle ne dirait
      // rien aux sites déjà en vol (ceux-là s'arrêtent sur `ctx.signal`, vérifié page
      // par page par harvestPass).
      if (ctx.deadlineAt && Date.now() > ctx.deadlineAt) {
        skippedByDeadline++
        return null
      }
      const cfg: CompetitorConfig = { siteId: stableId(site.domain), domain: site.domain, families }
      const prevMeta = metas.get(cfg.siteId)
      if (cycleMode && !allDoneBefore && prevMeta?.cursor?.done) {
        doneCount++
        const pagesTotal = await countPages(ctx.uid, watchId, cfg.siteId)
        // Marqueur d'ATTENTE (parité client) : la carte doit dire « attend le cycle »
        // plutôt que d'afficher « OK » avec un horodatage de plusieurs jours.
        await saveCompetitorMeta(ctx.uid, watchId, cfg.siteId, { domain: site.domain, cycleWaitingAt: Date.now() })
        ctx.log('info', t(ctx.locale, 'run.harvest.siteSweepDone', { domain: site.domain }))
        return { site: site.domain, pagesFetched: 0, productsIndexed: 0, pagesTotal, progress: 'complet' }
      }
      const t0 = Date.now()
      // % de prix de la passe : accumulé au fil des pages sauvées (aucune lecture en plus).
      let passProducts = 0
      let passWithPrice = 0
      // Cumul du volume moissonné sur ce site, pour la barre de progression.
      let harvested = 0
      // ⚠ Le canal de lecture suit la CONFIG du site (accès connecté, moteur forcé).
      // Avant, le serveur lisait toujours en direct et anonyme : les sites à prix
      // connectés (progarden, sodipieces) indexaient des milliers de fiches à « prix
      // 0 % » sur chaque tick de cron, et un site en Bright Data restait bloqué.
      const fetcher = buildServerFetcher(ctx.uid, site)
      const deps: HarvestDeps = {
        fetchHtml: fetcher.fetchHtml,
        // Ciblage IA du plan de moisson (parité client) : appariement des vocabulaires.
        // `targetPlan` rattrape toute erreur → le plan complet, jamais un plan vide.
        selectCategories: async (fams, urls) =>
          applyTargeting((await callLlm(ctx.uid, buildTargetingPrompt(fams, urls))).text, urls),
        loadCursor: async () => prevMeta?.cursor ?? null,
        saveCursor: (siteId, cursor) => saveCompetitorMeta(ctx.uid, watchId, siteId, { domain: site.domain, cursor }),
        savePage: (siteId, pageId, url, page, products) => {
          passProducts += products.length
          passWithPrice += products.filter((p) => p.price != null).length
          return savePage(ctx.uid, watchId, siteId, pageId, url, page, products)
        },
        // Progression live (toutes les 15 pages) : jauge Balayage + heartbeat avancent
        // pendant le run cron, sans attendre la fin du site.
        onProgress: (_p, productsIndexed, cursor) => {
          // Volume remonté à la barre de progression, comme le fait le navigateur : sans
          // lui, un run planifié affiche « en cours » pendant une heure sans un chiffre.
          harvested += productsIndexed
          ctx.reportCount?.(harvested)
          return saveCompetitorMeta(ctx.uid, watchId, cfg.siteId, {
          domain: site.domain,
          harvestBeatAt: Date.now(), // battement de MOISSON (le « Comparer » ne l'écrit jamais)
          productCount: (prevMeta?.productCount ?? 0) + productsIndexed, // fait ticker « Fiches collectées »
          harvestProgress: harvestProgress(cursor),
          harvestSweeps: cursor.sweeps,
          cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + (Date.now() - t0),
          })
        },
        log: (m) => ctx.log('info', m),
        // Le moteur logue dans le MÊME panneau : il doit parler la langue du run.
        locale: ctx.locale,
        signal: ctx.signal,
        // Le TEMPS gouverne la passe ; `pageBudget` n'est plus qu'un plafond de sécurité.
        deadlineAt: ctx.deadlineAt,
      }
      const res = await harvestPass(cfg, deps, budgets.get(site.id) ?? 1)
      if (res.sweepComplete) doneCount++
      const elapsedMs = Date.now() - t0
      const pagesTotal = await countPages(ctx.uid, watchId, cfg.siteId)
      // % de prix CUMULÉ sur le balayage courant, pas sur la seule passe : une passe qui
      // tombe sur des catégories sans prix statiques (promos AJAX…) affichait « 0 % »
      // alors que l'index du site est sain. Compteurs remis à zéro quand la passe a
      // ROUVERT un balayage (le curseur précédent était done).
      const newSweep = prevMeta?.cursor?.done === true
      const sweepProducts = (newSweep ? 0 : prevMeta?.sweepProducts ?? 0) + passProducts
      const sweepWithPrice = (newSweep ? 0 : prevMeta?.sweepWithPrice ?? 0) + passWithPrice
      await saveCompetitorMeta(ctx.uid, watchId, cfg.siteId, {
        pageCount: pagesTotal,
        harvestBeatAt: Date.now(), // battement de MOISSON (le « Comparer » ne l'écrit jamais)
        productCount: (prevMeta?.productCount ?? 0) + res.productsIndexed,
        lastHarvestMs: elapsedMs,
        cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + elapsedMs,
        harvestProgress: res.sweepComplete ? 1 : harvestProgress(res.cursor),
        harvestSweeps: res.cursor.sweeps,
        sweepProducts,
        sweepWithPrice,
        ...(sweepProducts > 0 ? { pctPrice: Math.round((sweepWithPrice / sweepProducts) * 100) } : {}),
        lastEngine: fetcher.lastEngine() ?? 'cloudFunction',
        lastPassPages: res.pagesFetched,
        lastPassProducts: res.productsIndexed,
        lastPassAt: Date.now(),
      })
      ctx.log('info', t(ctx.locale, 'run.harvest.siteIndexed', {
        domain: site.domain, indexed: res.productsIndexed, pages: res.pagesFetched, total: pagesTotal,
      }))
      // ⚠⚠ Un site entièrement protégé rendait « 50 page(s) · 0 produit » — le même
      // message qu'un catalogue vide ou qu'un extracteur cassé, alors que la cause et le
      // remède n'ont rien à voir. Mesuré sur granit-parts.fr : Cloudflare répondait à la
      // place du site sur toutes les grilles, et pas une ligne ne le disait.
      // ⚠ Condition sur `got === 0`, PAS sur « 0 produit » : swap-europe, qui indexe des
      // milliers de fiches, rencontre un défi de temps en temps et se voyait annoncé
      // « bloqué » dès qu'une passe finissait sans produit (fenêtre de run atteinte). Un
      // avertissement qui crie au loup sur un site sain fait ignorer les vrais.
      const { asked, got } = fetcher.stats()
      // ⚠⚠ SATURATION : un balayage complet qui ne rapporte aucune fiche nouvelle signale
      // un catalogue épuisé. On le compte pour rendre son budget aux autres au prochain
      // run (cf. `splitPageBudget`) — jamais pour l'arrêter : les prix, eux, bougent encore.
      if (res.sweepComplete) {
        const before = prevMeta?.lastSweepIndexed
        const stale = before != null && pagesTotal > 0 && (prevMeta?.productCount ?? 0) <= before
        await saveCompetitorMeta(ctx.uid, watchId, cfg.siteId, {
          lastSweepIndexed: prevMeta?.productCount ?? 0,
          saturatedSweeps: stale ? (prevMeta?.saturatedSweeps ?? 0) + 1 : 0,
        })
      }
      // ⚠⚠ ENRICHISSEMENT DES CLÉS. Un site peut indexer des milliers de fiches sans
      // qu'AUCUNE ne porte de référence : progarden.fr, 6 982 fiches, 0 % — son thème n'en
      // affiche pas sur les pages de rayon. Ces fiches ne s'apparient alors que par
      // libellé. La clé existe pourtant, une page plus loin, sur la fiche produit.
      //
      // La passe ne se déclenche QUE là où la clé manque vraiment (moins d'un tiers des
      // fiches identifiées) et seulement quand le balayage a fini le sien : elle emprunte
      // le temps qui reste, jamais celui de la moisson.
      const listings = await loadAllListings(ctx.uid, watchId, cfg.siteId)
      const withRef = listings.filter((l) => l.ref || l.gtin13).length
      const needsKeys = listings.length >= 50 && withRef / listings.length < REF_ENRICH_THRESHOLD
      // ⚠ Pas « balayage terminé » : sur un plan de 250 rayons et 166 pages par tick, il ne
      // se termine jamais dans le même run, et la passe n'aurait jamais tourné. La bonne
      // condition est « la moisson a fini SON tick et il reste du temps » — elle prend le
      // temps résiduel, celui qui serait sinon rendu inutilisé.
      const timeLeft = ctx.deadlineAt == null || ctx.deadlineAt - Date.now() > REF_ENRICH_MIN_MS
      if (needsKeys && timeLeft && !ctx.signal.aborted) {
        const enr = await refEnrichPass({
          loadPages: () => loadIndexPages(ctx.uid, watchId, cfg.siteId),
          fetchHtml: fetcher.fetchHtml,
          savePage: (pg) => saveIndexPageProducts(ctx.uid, watchId, cfg.siteId, pg.id, pg.products),
          signal: ctx.signal,
          // Accès connecté : la fiche porte aussi le prix d'achat, le conseillé et la
          // remise — invisibles sur les pages de rayon.
          wantB2BPrices: !!site.auth,
          ...(ctx.deadlineAt ? { deadlineAt: ctx.deadlineAt } : {}),
        }, REF_ENRICH_BUDGET, prevMeta?.refEnrichCursor ?? null)
        if (enr.visited > 0) {
          await saveCompetitorMeta(ctx.uid, watchId, cfg.siteId, { refEnrichCursor: enr.cursor })
          ctx.log('info', t(ctx.locale, 'run.harvest.refEnriched', {
            domain: site.domain, visited: enr.visited, enriched: enr.enriched,
          }))
        }
      }
      const blocker = fetcher.blockedBy()
      if (blocker && got === 0 && asked > 0) {
        ctx.log('warn', t(ctx.locale, 'run.harvest.antiBotBlocked', { domain: site.domain, protection: blocker }))
      }
      // ⚠⚠ Aucune page N'EST ARRIVÉE. Distinct du cas précédent : là, une protection a
      // répondu ; ici le moteur n'a rien rendu du tout — clé absente, service en panne,
      // budget épuisé. Mesuré sur granit-parts.fr forcé sur Firecrawl pendant une avarie
      // de ce service : « +0 produit(s) sur 82 page(s) », et pas un mot sur les
      // quatre-vingt-deux lectures refusées.
      if (!blocker && asked > 0 && got === 0) {
        ctx.log('warn', t(ctx.locale, 'run.harvest.engineSilent', {
          domain: site.domain, engine: site.engine ?? 'auto', asked,
        }))
      }
      return {
        site: site.domain,
        pagesFetched: res.pagesFetched,
        productsIndexed: res.productsIndexed,
        pagesTotal,
        progress: res.sweepComplete ? 'complet' : `${Math.round(harvestProgress(res.cursor) * 100)} %`,
      }
    })
    // `mapWithConcurrency` préserve l'ordre d'entrée : le tableau de statut reste stable
    // d'un run à l'autre malgré des fins dans le désordre.
    const rows: Record<string, unknown>[] = results.filter((r): r is NonNullable<typeof r> => r != null)
    if (skippedByDeadline > 0) {
      ctx.log('info', t(ctx.locale, 'run.harvest.budgetReserved', { skipped: skippedByDeadline }))
    }
    // Cycle complet : TOUS les sites à 100 % ce run → le scheduler bascule sur
    // l'échéance calendaire de relance au lieu d'enchaîner à la cadence rapide.
    if (cycleMode && !ctx.signal.aborted && doneCount === sites.length) {
      ctx.reportCycleComplete?.()
      ctx.log('info', t(ctx.locale, 'run.harvest.cycleComplete', { count: sites.length }))
    }
    // ⚠ FILET (jumeau du client). « Comparer catalogue » est en AVAL : sur un catalogue
    // de centaines de milliers de fiches, la moisson consomme toute la fenêtre du run et
    // le node reste `pending`, run après run. Constaté en production : appariés gelés
    // pendant des heures sur la valeur d'un seul site, alors que la collecte tournait.
    // Fenêtre épuisée → on recalcule le benchmark ICI.
    if (ctx.deadlineAt && Date.now() > ctx.deadlineAt) {
      try {
        const src = await loadSourceCatalog(ctx.uid, watchId)
        if (src && src.products.length > 0 && !src.partial) {
          const siteRefs = sites.map((s) => ({ siteId: stableId(s.domain), domain: s.domain }))
          const indexBySite = new Map<string, CompetitorListing[]>()
          for (const ref of siteRefs) {
            indexBySite.set(ref.siteId, await loadAllListings(ctx.uid, watchId, ref.siteId))
          }
          const report = buildReport(src.products, siteRefs, indexBySite, { vatRate: src.vatRate })
          // `trend: false` — recalcul PARTIEL par nature (index encore en cours de
          // remplissage) : il rafraîchit le tableau de bord, jamais l'historique.
          await saveCatalogReport(ctx.uid, watchId, report, siteRefs, Date.now(), { trend: false })
          ctx.log('info', t(ctx.locale, 'run.harvest.benchmarkRefreshed', {
            count: report.kpis.products, sites: siteRefs.length,
          }))
        }
      } catch (e) {
        ctx.log('warn', t(ctx.locale, 'run.harvest.benchmarkSkipped', {
          message: e instanceof Error ? e.message : String(e),
        }))
      }
    }
    return { status: statusSheet(rows) }
  },
})
