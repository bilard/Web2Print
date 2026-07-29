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
import { loadCompetitorMeta, saveCompetitorMeta, savePage, countPages, touchWatch } from '../../priceWatch/catalog/store'
import { harvestProgress } from '../../priceWatch/catalog/harvest'
import { mapWithConcurrency, HARVEST_CONCURRENCY } from '../../priceWatch/concurrency'
import { buildServerFetcher } from '../../priceWatch/catalog/serverFetcher'
import { applyTargeting, buildTargetingPrompt, familiesFromRows } from '../../priceWatch/catalog/categoryTargeting'
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
    const familyColumn = String(config.familyColumn ?? '').trim()
    const families = typedFamilies.length ? typedFamilies : familiesFromRows(sourceRows, familyColumn)
    if (!typedFamilies.length && families.length) ctx.log('info', t(ctx.locale, 'run.harvest.familiesRead', { count: families.length, column: familyColumn }))
    const pageBudget = Math.max(1, Number(config.pageBudget) || 160)
    // Budget réparti équitablement entre les sites (au moins 1 page chacun).
    // Budget : un site peut RÉSERVER ses pages (concurrent coûteux à brider) ; le reste
    // est partagé équitablement entre les autres.
    const budgets = splitPageBudget(sites, pageBudget)

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
        onProgress: (_p, productsIndexed, cursor) => saveCompetitorMeta(ctx.uid, watchId, cfg.siteId, {
          domain: site.domain,
          harvestBeatAt: Date.now(), // battement de MOISSON (le « Comparer » ne l'écrit jamais)
          productCount: (prevMeta?.productCount ?? 0) + productsIndexed, // fait ticker « Fiches collectées »
          harvestProgress: harvestProgress(cursor),
          harvestSweeps: cursor.sweeps,
          cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + (Date.now() - t0),
        }),
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
    return { status: statusSheet(rows) }
  },
})
