// functions/src/workflow/nodes/harvestCompetitor.ts
// Jumeau SERVEUR (headless/cron) du node « Moisson concurrents »
// (src/features/workflows/registry/harvestCompetitorNode.ts). Parcourt les pages
// liste des catalogues concurrents et alimente l'index Firestore persistant, un lot
// borné de pages par tick. Sur cron, les ticks accumulent puis rafraîchissent.
//
// Différences avec le client : fetch HTML DIRECT (fetchHtml) au lieu de la CF
// fetchPageHtml — c'est la MÊME IP datacenter que la CF, donc le même comportement
// que la validation live. Persistance via l'adaptateur admin-SDK. Pas de reportCount
// (absent du ctx serveur). Toute la logique métier est partagée avec le client via
// les modules purs dupliqués sous functions/src/priceWatch/catalog/.
import { registerServerNode } from '../registry'
import { fetchHtml } from '../../scraper/fetchHtml'
import { parseSitesConfig, stableId } from '../../priceWatch/helpers'
import { DEFAULT_WATCH_ID } from '../../priceWatch/paths'
import { harvestPass, type CompetitorConfig, type HarvestDeps } from '../../priceWatch/catalog/runHarvest'
import { loadCompetitorMeta, saveCompetitorMeta, savePage, countPages } from '../../priceWatch/catalog/store'
import { harvestProgress } from '../../priceWatch/catalog/harvest'

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
  run: async (ctx, config) => {
    // Identité du suivi : l'id du workflow par défaut (partagé avec « Comparer catalogue »
    // du même workflow, sans saisie). Override manuel possible pour partager entre workflows.
    const watchId = stableId(String(config.watchId || '').trim() || ctx.workflowId || DEFAULT_WATCH_ID)
    const sites = parseSitesConfig(String(config.sites ?? ''))
    if (sites.length === 0) {
      ctx.log('warn', 'Aucun site concurrent configuré.')
      return { status: statusSheet([]) }
    }
    const families = String(config.families ?? '').split(',').map((f) => f.trim()).filter(Boolean)
    const pageBudget = Math.max(1, Number(config.pageBudget) || 40)
    // Budget réparti équitablement entre les sites (au moins 1 page chacun).
    const perSite = Math.max(1, Math.floor(pageBudget / sites.length))

    const rows: Record<string, unknown>[] = []
    for (const site of sites) {
      if (ctx.signal.aborted) break
      const cfg: CompetitorConfig = { siteId: stableId(site.domain), domain: site.domain, families }
      const prevMeta = await loadCompetitorMeta(ctx.uid, watchId, cfg.siteId)
      const deps: HarvestDeps = {
        // Fetch DIRECT : sur le runtime CF c'est la même IP que fetchPageHtml (validé live).
        fetchHtml: async (url) => {
          try { return await fetchHtml(url, 20000) } catch { return null }
        },
        loadCursor: async () => prevMeta?.cursor ?? null,
        saveCursor: (siteId, cursor) => saveCompetitorMeta(ctx.uid, watchId, siteId, { domain: site.domain, cursor }),
        savePage: (siteId, pageId, url, page, products) => savePage(ctx.uid, watchId, siteId, pageId, url, page, products),
        log: (m) => ctx.log('info', m),
        signal: ctx.signal,
      }
      const t0 = Date.now()
      const res = await harvestPass(cfg, deps, perSite)
      const elapsedMs = Date.now() - t0
      const pagesTotal = await countPages(ctx.uid, watchId, cfg.siteId)
      await saveCompetitorMeta(ctx.uid, watchId, cfg.siteId, {
        pageCount: pagesTotal,
        lastHarvestMs: elapsedMs,
        cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + elapsedMs,
        harvestProgress: res.sweepComplete ? 1 : harvestProgress(res.cursor),
      })
      rows.push({
        site: site.domain,
        pagesFetched: res.pagesFetched,
        productsIndexed: res.productsIndexed,
        pagesTotal,
        progress: res.sweepComplete ? 'complet' : `${Math.round(harvestProgress(res.cursor) * 100)} %`,
      })
      ctx.log('info', `${site.domain} : +${res.productsIndexed} produit(s) sur ${res.pagesFetched} page(s) (index : ${pagesTotal} pages).`)
    }
    return { status: statusSheet(rows) }
  },
})
