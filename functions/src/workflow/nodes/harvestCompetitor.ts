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
import { getFirestore } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { fetchHtml } from '../../scraper/fetchHtml'
import { stableId } from '../../priceWatch/helpers'
import { resolveSitesInput } from '../../priceWatch/sourceSites'
import { harvestPass, type CompetitorConfig, type HarvestDeps } from '../../priceWatch/catalog/runHarvest'
import { loadCompetitorMeta, saveCompetitorMeta, savePage, countPages, touchWatch } from '../../priceWatch/catalog/store'
import { harvestProgress } from '../../priceWatch/catalog/harvest'

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
    const sites = resolved.sites
    if (sites.length === 0) {
      ctx.log('warn', 'Aucun site concurrent configuré.')
      return { status: statusSheet([]) }
    }
    const families = String(config.families ?? '').split(',').map((f) => f.trim()).filter(Boolean)
    const pageBudget = Math.max(1, Number(config.pageBudget) || 40)
    // Budget réparti équitablement entre les sites (au moins 1 page chacun).
    const perSite = Math.max(1, Math.floor(pageBudget / sites.length))

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
    if (cycleMode && allDoneBefore) ctx.log('info', 'Nouveau cycle : réouverture des balayages de tous les sites.')

    let doneCount = 0
    const rows: Record<string, unknown>[] = []
    for (const site of sites) {
      if (ctx.signal.aborted) break
      // Fenêtre AVAL atteinte : on rend la main — le curseur persiste, la moisson des
      // sites restants reprend au prochain tick, et « Comparer » a sa fenêtre CE run.
      if (ctx.deadlineAt && Date.now() > ctx.deadlineAt) {
        ctx.log('info', `Budget réservé au comparatif — moisson interrompue proprement (${rows.length}/${sites.length} site(s) ce run, la suite au prochain tick).`)
        break
      }
      const cfg: CompetitorConfig = { siteId: stableId(site.domain), domain: site.domain, families }
      const prevMeta = metas.get(cfg.siteId)
      if (cycleMode && !allDoneBefore && prevMeta?.cursor?.done) {
        doneCount++
        const pagesTotal = await countPages(ctx.uid, watchId, cfg.siteId)
        rows.push({ site: site.domain, pagesFetched: 0, productsIndexed: 0, pagesTotal, progress: 'complet' })
        ctx.log('info', `${site.domain} : balayage terminé — en attente de la fin du cycle.`)
        continue
      }
      const t0 = Date.now()
      // % de prix de la passe : accumulé au fil des pages sauvées (aucune lecture en plus).
      let passProducts = 0
      let passWithPrice = 0
      const deps: HarvestDeps = {
        // Fetch DIRECT : sur le runtime CF c'est la même IP que fetchPageHtml (validé live).
        fetchHtml: async (url) => {
          try { return await fetchHtml(url, 20000) } catch { return null }
        },
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
          productCount: (prevMeta?.productCount ?? 0) + productsIndexed, // fait ticker « Fiches collectées »
          harvestProgress: harvestProgress(cursor),
          harvestSweeps: cursor.sweeps,
          cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + (Date.now() - t0),
        }),
        log: (m) => ctx.log('info', m),
        signal: ctx.signal,
      }
      const res = await harvestPass(cfg, deps, perSite)
      if (res.sweepComplete) doneCount++
      const elapsedMs = Date.now() - t0
      const pagesTotal = await countPages(ctx.uid, watchId, cfg.siteId)
      await saveCompetitorMeta(ctx.uid, watchId, cfg.siteId, {
        pageCount: pagesTotal,
        productCount: (prevMeta?.productCount ?? 0) + res.productsIndexed,
        lastHarvestMs: elapsedMs,
        cumulHarvestMs: (prevMeta?.cumulHarvestMs ?? 0) + elapsedMs,
        harvestProgress: res.sweepComplete ? 1 : harvestProgress(res.cursor),
        harvestSweeps: res.cursor.sweeps,
        // Chip « prix % » live (parité moisson manuelle ▶) : % sur la passe courante ;
        // passe sans produit → on garde l'ancien % (pas de 0 trompeur).
        ...(passProducts > 0 ? { pctPrice: Math.round((passWithPrice / passProducts) * 100) } : {}),
        lastEngine: 'cloudFunction',
        lastPassPages: res.pagesFetched,
        lastPassProducts: res.productsIndexed,
        lastPassAt: Date.now(),
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
    // Cycle complet : TOUS les sites à 100 % ce run → le scheduler bascule sur
    // l'échéance calendaire de relance au lieu d'enchaîner à la cadence rapide.
    if (cycleMode && !ctx.signal.aborted && doneCount === sites.length) {
      ctx.reportCycleComplete?.()
      ctx.log('info', `Cycle complet : ${sites.length} site(s) à 100 % — prochaine relance à l'échéance calendaire.`)
    }
    return { status: statusSheet(rows) }
  },
})
