// Node « Moisson concurrents » : parcourt les catalogues concurrents (pages liste) et
// alimente un index Firestore persistant, un lot borné de pages par run. Sur cron, les
// ticks successifs accumulent puis rafraîchissent l'index. Aucune donnée volumineuse ne
// transite par la mémoire du run — le matching relira l'index (cf. audit scalabilité).
import { TrendingUpDown } from 'lucide-react'
import { z } from 'zod'
import { doc, getDoc } from 'firebase/firestore'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelSheet } from '@/features/excel/types'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { buildSiteFetcher } from '@/features/priceWatch/catalog/siteFetch'
import { parseSitesConfig, stableId } from '@/features/priceWatch/core'
import { resolveSitesInput, sitesForRole, splitPageBudget } from '@/features/priceWatch/sourceSites'
import { generateJson } from '@/features/ai/llmRouter'
import { applyTargetingBuckets, buildTargetingPrompt, familiesFromRows, TARGETING_SCHEMA_FOR_LLM } from '@/features/priceWatch/catalog/categoryTargeting'
import { harvestPass, type CompetitorConfig, type HarvestDeps } from '@/features/priceWatch/catalog/runHarvest'
import { loadCompetitorMeta, saveCompetitorMeta, savePage, countPages, touchWatch } from '@/features/priceWatch/catalog/store'
import { harvestProgress } from '@/features/priceWatch/catalog/harvest'
import { mapWithConcurrency, HARVEST_CONCURRENCY } from '@/features/priceWatch/concurrency'

/** Fenêtre d'un run lancé depuis le NAVIGATEUR. Un run planifié est borné par le serveur
 *  (`ctx.deadlineAt` = RUN_TIMEOUT − RESERVE) ; côté client, RIEN ne bornait la passe. */
const HARVEST_CLIENT_WINDOW_MS = 10 * 60_000

interface HarvestConfig {
  watchId: string
  sites: string
  families: string
  /** Colonne de la feuille source d'où lire les familles (si `families` est vide). */
  familyColumn: string
  pageBudget: number
}
interface HarvestInputs { sites?: unknown; products?: ExcelSheet }
type HarvestOutputs = { status: ExcelSheet }

/** Réponse attendue du ciblage IA : des INDEX dans la liste soumise (jamais des URLs,
 *  que le modèle pourrait inventer). Le tri en trois seaux est décrit dans
 *  `categoryTargeting.ts` — on ne garde ici que `pertinent` + `incertain`. */
const targetingSchema = z.object({
  pertinent: z.array(z.number()).default([]),
  incertain: z.array(z.number()).default([]),
  horsSujet: z.array(z.number()).default([]),
})

/** Mode « cycle calendaire » (parité serveur) : porté par le doc workflowSchedules du
 *  workflow (champ `cycle` posé par le node Cron). En mode cycle, un site terminé ATTEND
 *  les autres au lieu de rouvrir son balayage. Fail-open : doc absent = mode continu. */
async function isCycleMode(workflowId: string | undefined): Promise<boolean> {
  if (!workflowId) return false
  try {
    const snap = await getDoc(doc(db, 'workflowSchedules', workflowId))
    return !!(snap.exists() && (snap.data()?.cycle as { enabled?: boolean } | undefined)?.enabled)
  } catch { return false }
}

function statusSheet(rows: Record<string, unknown>[]): ExcelSheet {
  return {
    name: 'Index concurrents',
    columns: [
      { key: 'site', label: 'Concurrent', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 200 },
      { key: 'pagesFetched', label: 'Pages ce run', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 120 },
      { key: 'productsIndexed', label: 'Produits ce run', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
      { key: 'pagesTotal', label: 'Pages indexées', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 140 },
      { key: 'progress', label: 'Familles', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
    ],
    rows: rows.map((r, i) => ({ _id: `site_${i}`, ...r })),
    taxonomy: [],
  }
}

const harvestCompetitorNode: NodeSpec<HarvestConfig, HarvestInputs, HarvestOutputs> = {
  type: 'harvest-competitor',
  category: 'import',
  labelKey: 'node.harvest-competitor.label',
  descriptionKey: 'node.harvest-competitor.desc',
  icon: TrendingUpDown,
  connectors: ['jina'],
  // Port `sites` (facultatif) : brancher un node « Sites sources » remplace la textarea
  // ci-dessous ET l'identifiant de suivi — une seule liste à maintenir.
  inputs: [{ name: 'products', type: 'sheet' }, { name: 'sites', type: 'sites' }],
  outputs: [{ name: 'status', type: 'sheet' }],
  configSchema: [
    {
      name: 'sites', kind: 'textarea', label: 'Sites concurrents (un par ligne)',
      help: 'Domaine par ligne. Ex : « pro-motoculture.com ». PrestaShop supporté nativement. IGNORÉ si un node « Sites sources » est branché sur le port sites.',
      disabledWhen: (_c, wired) => wired('sites'),
      disabledNote: 'fourni par « Sites sources »',
    },
    {
      name: 'families', kind: 'text', label: 'Familles ciblées (séparées par des virgules)',
      help: 'Laisse VIDE si tu branches ta feuille source sur le port « products » : les familles sont alors lues dans la colonne ci-dessous, toujours à jour. Remplis-le pour FORCER un ciblage précis (« COURROIES, FILTRATION »). Vide et sans feuille = catalogue complet.',
    },
    {
      name: 'familyColumn', kind: 'text', label: 'Colonne Famille de la source',
      help: 'Ex : Famille. Utilisée quand la feuille source est branchée : les familles distinctes en sont extraites, puis une IA apparie VOTRE vocabulaire à celui du concurrent (« COURROIES » retrouve son rayon « transmission »). Sans IA disponible, le catalogue complet est balayé — jamais moins.',
    },
    {
      name: 'pageBudget', kind: 'number', label: 'Pages par run',
      help: 'Pages liste moissonnées à chaque exécution, partagées entre les sites. Un site peut RÉSERVER son propre budget (champ « pages » de sa carte dans « Sites sources ») — utile pour brider un concurrent payant sans rationner les gratuits. ⚠ C\'est LE plafond du débit. Sur un run PLANIFIÉ (cron), la fenêtre de temps borne désormais la passe d\'elle-même : ce champ n\'est plus qu\'un plafond de sécurité, voyez large. Sur un run lancé depuis le navigateur, il n\'y a pas d\'échéance — c\'est lui qui décide de la durée.',
    },
    {
      name: 'watchId', kind: 'text', label: 'Identifiant du suivi (avancé)',
      help: 'Laisse VIDE : le suivi est automatiquement celui du workflow (partagé avec « Comparer catalogue » du même workflow). Ne remplis que pour partager un même suivi entre plusieurs workflows.',
      disabledWhen: (_c, wired) => wired('sites'),
      disabledNote: 'fourni par « Sites sources »',
    },
  ],
  // 800 pages : la fenêtre de moisson d'un run planifié est d'environ 18 min
  // (RUN_TIMEOUT 1700 s − RESERVE 600 s) et un tour à 160 pages n'en consommait que 3.
  // La restitution sur échéance (`deadlineAt`) garantit qu'un budget large ne déborde pas.
  defaultConfig: { watchId: '', sites: '', families: '', familyColumn: 'Famille', pageBudget: 800 },
  cardSummary: (c) => {
    const n = parseSitesConfig(c.sites).length
    return n ? `${n} site(s) · ${c.pageBudget}/run${c.families.trim() ? ` · ${c.families.trim()}` : ''}` : ''
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const uid = useAuthStore.getState().user?.uid
    if (!uid) throw new Error('Utilisateur non connecté.')
    // Sites + identité du suivi : le port `sites` (node « Sites sources ») GAGNE ;
    // sinon repli sur la config locale historique (textarea + watchId, dérivé de
    // l'id du workflow par défaut → Moisson & Comparer partagent le même suivi).
    const { watchId, sites: allSites, fromPort } = resolveSitesInput(inputs.sites, {
      sitesText: config.sites, watchIdRaw: config.watchId, workflowId: ctx.workflowId,
    })
    // Un site marqué « recherche dirigée » n'est PAS balayé par catégories (généraliste
    // dont le catalogue est sans rapport avec la source : coût énorme, rendement nul).
    const sites = sitesForRole(allSites, 'harvest')
    const skipped = allSites.length - sites.length
    if (fromPort) ctx.log('info', `Liste reçue du node « Sites sources » : ${sites.length} site(s) à moissonner${skipped > 0 ? ` (${skipped} en recherche dirigée seule)` : ''}.`)
    if (sites.length === 0) {
      ctx.log('warn', 'Aucun site concurrent configuré.')
      return { status: statusSheet([]) }
    }
    // Familles ciblées : le champ texte est un OVERRIDE explicite ; sinon elles sont
    // dérivées de la feuille source branchée (colonne Famille) — le vocabulaire vient
    // ainsi de la source elle-même, sans ressaisie ni dérive.
    const typed = config.families.split(',').map((f) => f.trim()).filter(Boolean)
    const families = typed.length
      ? typed
      : familiesFromRows(inputs.products?.rows ?? [], config.familyColumn?.trim() ?? '')
    if (!typed.length && families.length) ctx.log('info', `${families.length} famille(s) lues dans la colonne « ${config.familyColumn?.trim()} ».`)
    // Budget : un site peut RÉSERVER ses pages (concurrent coûteux à brider) ; le reste
    // est partagé équitablement entre les autres.
    const budgets = splitPageBudget(sites, config.pageBudget)
    // ⚠ Échéance CLIENT. Un run planifié est borné par le serveur (`ctx.deadlineAt`) ;
    // un run lancé depuis le navigateur ne l'était par RIEN — un site lent pouvait le
    // faire durer des heures, sans résultat visible et sans rendre la main. Le curseur
    // étant persisté page par page, s'arrêter à l'échéance ne perd aucun travail : la
    // passe suivante reprend exactement où celle-ci s'arrête.
    const deadlineAt = Date.now() + HARVEST_CLIENT_WINDOW_MS

    // Le suivi existe dès la 1ʳᵉ moisson (liste + dashboard), sans attendre « Comparer ».
    await touchWatch(uid, watchId, ctx.workflowName)

    // Mode cycle (parité serveur) : metas préchargées pour décider GLOBALEMENT — tous
    // les balayages terminés = réouverture d'un cycle pour TOUS en même temps ; sinon
    // les sites terminés attendent (skip) que les retardataires finissent.
    const cycleMode = await isCycleMode(ctx.workflowId)
    const metas = new Map<string, Awaited<ReturnType<typeof loadCompetitorMeta>>>()
    for (const site of sites) {
      const siteId = stableId(site.domain)
      metas.set(siteId, await loadCompetitorMeta(uid, watchId, siteId))
    }
    const allDoneBefore = sites.every((s) => metas.get(stableId(s.domain))?.cursor?.done === true)
    if (cycleMode && allDoneBefore) ctx.log('info', 'Nouveau cycle : réouverture des balayages de tous les sites.')

    // Sites moissonnés EN PARALLÈLE BORNÉ (parité serveur). Ils sont indépendants —
    // chacun son fetcher, son curseur, son document `competitors/{siteId}` — et les
    // enchaîner ne laissait qu'UN SEUL fetch en vol pour tout le système alors qu'une
    // page liste coûte plusieurs secondes. Le plafond évite la rafale (limites de débit
    // des fournisseurs, Bright Data facturé à la requête).
    let indexedSoFar = 0
    const results = await mapWithConcurrency(sites, HARVEST_CONCURRENCY, async (site) => {
      if (ctx.signal.aborted) return null
      const cfg: CompetitorConfig = { siteId: stableId(site.domain), domain: site.domain, families }
      const prevMeta = metas.get(cfg.siteId)
      if (cycleMode && !allDoneBefore && prevMeta?.cursor?.done) {
        const pagesTotal = await countPages(uid, watchId, cfg.siteId)
        // Marqueur d'ATTENTE : sans lui la carte reste « OK » avec un scrape vieux de
        // plusieurs jours, et rien n'explique pourquoi le site ne part pas.
        await saveCompetitorMeta(uid, watchId, cfg.siteId, { domain: site.domain, cycleWaitingAt: Date.now() })
        ctx.log('info', `${site.domain} : balayage terminé — en attente de la fin du cycle.`)
        return { site: site.domain, pagesFetched: 0, productsIndexed: 0, pagesTotal, progress: 'complet' }
      }
      // Moteur par site : site authentifié (login cookie) sinon moteur forcé
      // (jina | firecrawl | brightdata) sinon cascade auto.
      const fetcher = buildSiteFetcher(site.engine, { auth: site.auth, host: site.domain })
      ctx.reportConnector?.(fetcher.connectorId)
      if (site.auth) ctx.log('info', `${site.domain} : accès authentifié (login cookie).`)
      else if (site.engine) ctx.log('info', `${site.domain} : moteur forcé « ${site.engine} ».`)
      const t0 = Date.now()
      // % de prix de la passe : accumulé au fil des pages sauvées (aucune lecture en plus).
      let passProducts = 0
      let passWithPrice = 0
      const deps: HarvestDeps = {
        fetchHtml: fetcher.fetchHtml,
        // Ciblage IA du plan de moisson : appariement des vocabulaires (familles source ↔
        // catégories réelles du concurrent). Une erreur ici ne doit jamais réduire la
        // moisson — `targetPlan` rattrape et rend le plan complet.
        selectCategories: async (fams, urls) => applyTargetingBuckets(
          await generateJson<Record<string, number[]>>({
            task: 'web.discoveryFilter',
            version: 'priceWatch.categoryTargeting.v1',
            prompt: buildTargetingPrompt(fams, urls),
            schema: targetingSchema,
            schemaForLLM: TARGETING_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
          }),
          urls,
        ),
        loadCursor: async () => prevMeta?.cursor ?? null,
        saveCursor: (siteId, cursor) => saveCompetitorMeta(uid, watchId, siteId, { domain: site.domain, cursor }),
        savePage: (siteId, pageId, url, page, products) => {
          passProducts += products.length
          passWithPrice += products.filter((p) => p.price != null).length
          return savePage(uid, watchId, siteId, pageId, url, page, products)
        },
        // Progression live (toutes les 15 pages) : la jauge Balayage avance et le heartbeat
        // reste vert pendant le run, sans attendre la fin du site.
        onProgress: (_p, productsIndexed, cursor) => saveCompetitorMeta(uid, watchId, cfg.siteId, {
          domain: site.domain,
          harvestBeatAt: Date.now(), // battement de MOISSON (le « Comparer » ne l'écrit jamais)
          productCount: (prevMeta?.productCount ?? 0) + productsIndexed, // fait ticker « Fiches collectées »
          harvestProgress: harvestProgress(cursor),
          harvestSweeps: cursor.sweeps,
          cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + (Date.now() - t0),
        }),
        log: (m) => ctx.log('info', m),
        signal: ctx.signal,
        deadlineAt,
      }
      const res = await harvestPass(cfg, deps, budgets.get(site.id) ?? 1)
      const elapsedMs = Date.now() - t0
      const pagesTotal = await countPages(uid, watchId, cfg.siteId)
      // % de prix CUMULÉ sur le balayage courant, pas sur la seule passe : une passe qui
      // tombe sur des catégories sans prix statiques (promos AJAX…) affichait « 0 % »
      // alors que l'index du site est sain. Compteurs remis à zéro quand la passe a
      // ROUVERT un balayage (le curseur précédent était done).
      const newSweep = prevMeta?.cursor?.done === true
      const sweepProducts = (newSweep ? 0 : prevMeta?.sweepProducts ?? 0) + passProducts
      const sweepWithPrice = (newSweep ? 0 : prevMeta?.sweepWithPrice ?? 0) + passWithPrice
      await saveCompetitorMeta(uid, watchId, cfg.siteId, {
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
        // Télémétrie moteur : quel palier a réellement servi (affiché dans « Sites sources »).
        ...(fetcher.lastEngine() ? { lastEngine: fetcher.lastEngine() } : {}),
        // Verdict de la passe (✓/⚠/✗ dans « Sites sources ») : pages lues + produits.
        lastPassPages: res.pagesFetched,
        lastPassProducts: res.productsIndexed,
        lastPassAt: Date.now(),
      })
      // Compteur CUMULÉ partagé : en parallèle, dériver le total d'un tableau en cours
      // de remplissage donnerait une valeur différente selon l'ordre d'arrivée.
      indexedSoFar += res.productsIndexed
      ctx.reportCount?.(indexedSoFar)
      ctx.log('info', `${site.domain} : +${res.productsIndexed} produit(s) sur ${res.pagesFetched} page(s) (index : ${pagesTotal} pages).`)
      return {
        site: site.domain,
        pagesFetched: res.pagesFetched,
        productsIndexed: res.productsIndexed,
        pagesTotal,
        progress: res.sweepComplete ? 'complet' : `${Math.round(harvestProgress(res.cursor) * 100)} %`,
      }
    })
    // L'ordre d'entrée est préservé : le tableau de statut reste stable d'un run à l'autre.
    const rows: Record<string, unknown>[] = results.filter((r): r is NonNullable<typeof r> => r != null)
    return { status: statusSheet(rows) }
  },
}

nodeRegistry.register(harvestCompetitorNode)
