// src/features/priceWatch/catalog/runSingleSite.ts
// Moisson d'UN SEUL concurrent, à la demande (bouton ▶ dans « Sites sources »).
// Réutilise exactement le moteur du node « Moisson concurrents » (harvestPass +
// buildSiteFetcher + store), mais pour un site isolé — pour tester/relancer un
// concurrent sans lancer tout le workflow (ex. vérifier progarden en accès connecté).
import { harvestPass, type CompetitorConfig } from './runHarvest'
import { buildSiteFetcher } from './siteFetch'
import { loadCompetitorMeta, saveCompetitorMeta, savePage, countPages, loadAllListings } from './store'
import { harvestProgress } from './harvest'
import { stableId } from '../core'
import type { CompetitorSite } from '../types'

export interface SingleHarvestResult {
  productsIndexed: number
  pagesFetched: number
  engine?: string
  /** % de fiches avec prix dans l'index (diagnostic immédiat des prix). */
  pctPrice: number
}

/**
 * Lance une passe de moisson pour un seul concurrent (budget borné, curseur repris).
 * Persiste la méta comme le node (lastEngine, lastPass*, progress…) → le tableau
 * « Sites sources » se met à jour en direct (onSnapshot). Ne lève jamais sur un site :
 * renvoie 0 produit et laisse le verdict s'afficher.
 */
export async function harvestOneSite(
  uid: string,
  watchId: string,
  site: CompetitorSite,
  opts: { pageBudget?: number; families?: string[]; signal?: AbortSignal; log?: (m: string) => void } = {},
): Promise<SingleHarvestResult> {
  const pageBudget = opts.pageBudget ?? 10
  const families = opts.families ?? []
  const siteId = stableId(site.domain)
  const fetcher = buildSiteFetcher(site.engine, { auth: site.auth, host: site.domain })
  const prevMeta = await loadCompetitorMeta(uid, watchId, siteId)
  const t0 = Date.now()

  const cfg: CompetitorConfig = { siteId, domain: site.domain, families }
  const res = await harvestPass(cfg, {
    fetchHtml: fetcher.fetchHtml,
    loadCursor: async () => prevMeta?.cursor ?? null,
    saveCursor: (id, cursor) => saveCompetitorMeta(uid, watchId, id, { domain: site.domain, cursor }),
    savePage: (id, pageId, url, page, products) => savePage(uid, watchId, id, pageId, url, page, products),
    // Remontée LIVE à CHAQUE page (progressEvery: 1) : le tableau bouge en direct.
    onProgress: (pagesFetched, productsIndexed, cursor) => saveCompetitorMeta(uid, watchId, siteId, {
      domain: site.domain,
      harvestBeatAt: Date.now(), // battement de MOISSON (le « Comparer » ne l'écrit jamais)
      productCount: (prevMeta?.productCount ?? 0) + productsIndexed,
      harvestProgress: harvestProgress(cursor),
      harvestSweeps: cursor.sweeps,
      lastPassPages: pagesFetched,
      lastPassProducts: productsIndexed,
    }),
    log: opts.log,
    signal: opts.signal,
  }, pageBudget, 1)

  const elapsedMs = Date.now() - t0
  const pagesTotal = await countPages(uid, watchId, siteId)
  // % de prix EN DIRECT depuis l'index (le chip n'attend plus « Comparer catalogue »).
  const listings = await loadAllListings(uid, watchId, siteId)
  const withPrice = listings.filter((l) => l.price != null).length
  const pctPrice = listings.length ? Math.round((withPrice / listings.length) * 100) : 0
  await saveCompetitorMeta(uid, watchId, siteId, {
    domain: site.domain,
    pageCount: pagesTotal,
    harvestBeatAt: Date.now(), // battement de MOISSON (le « Comparer » ne l'écrit jamais)
    productCount: (prevMeta?.productCount ?? 0) + res.productsIndexed,
    lastHarvestMs: elapsedMs,
    cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + elapsedMs,
    harvestProgress: res.sweepComplete ? 1 : harvestProgress(res.cursor),
    harvestSweeps: res.cursor.sweeps,
    ...(fetcher.lastEngine() ? { lastEngine: fetcher.lastEngine() } : {}),
    lastPassPages: res.pagesFetched,
    lastPassProducts: res.productsIndexed,
    lastPassAt: Date.now(),
    pctPrice,
  })
  return { productsIndexed: res.productsIndexed, pagesFetched: res.pagesFetched, engine: fetcher.lastEngine(), pctPrice }
}
