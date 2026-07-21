// functions/src/workflow/nodes/directedSearch.ts
// Jumeau SERVEUR (headless/cron) du node « Recherche dirigée »
// (src/features/workflows/registry/directedSearchNode.ts). Pour chaque produit source,
// interroge le moteur de recherche de chaque concurrent (réf puis EAN) et apparie par
// PREUVE EXACTE (proveMatch), puis persiste le hit dans l'index → « Comparer catalogue »
// l'affiche dans le dashboard. Curseur persistant : le cron accumule tick après tick.
//
// Différences client : fetch HTML DIRECT (même IP CF), store admin-SDK, pas de
// reportConnector/reportCount. Logique partagée via les modules purs dupliqués.
import { registerServerNode } from '../registry'
import { fetchHtml } from '../../scraper/fetchHtml'
import { parseSitesConfig, stableId } from '../../priceWatch/helpers'
import { DEFAULT_WATCH_ID } from '../../priceWatch/paths'
import { savePage, loadCompetitorMeta, saveCompetitorMeta } from '../../priceWatch/catalog/store'
import { directedPass, type DirectedSourceProduct, type DirectedSite } from '../../priceWatch/catalog/searchDirected'

const VAT = 0.2

const RESULT_COLUMNS = [
  { key: 'produit', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 220 },
  { key: 'ref', label: 'Référence', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
  { key: 'ean', label: 'EAN', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 130 },
  { key: 'site', label: 'Concurrent', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 180 },
  { key: 'prixTtc', label: 'Prix TTC', fieldType: 'currency', detectedType: 'currency', isPrimary: false, width: 100 },
  { key: 'prixHt', label: 'Prix HT', fieldType: 'currency', detectedType: 'currency', isPrimary: false, width: 100 },
  { key: 'preuve', label: 'Appariement', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 110 },
  { key: 'lien', label: 'Lien', fieldType: 'url', detectedType: 'url', isPrimary: false, width: 240 },
]

function resultsSheet(rows: Record<string, unknown>[]) {
  return { name: 'Prix trouvés (recherche dirigée)', columns: RESULT_COLUMNS, rows, taxonomy: [] }
}

interface SheetLike { rows?: Record<string, unknown>[] }

registerServerNode({
  type: 'directed-search',
  run: async (ctx, config, inputs) => {
    const watchId = stableId(String(config.watchId || '').trim() || ctx.workflowId || DEFAULT_WATCH_ID)
    const sheet = (inputs.products ?? {}) as SheetLike
    if (!sheet.rows || sheet.rows.length === 0) {
      throw new Error('Recherche dirigée : aucune donnée produit en entrée.')
    }
    const sites: DirectedSite[] = parseSitesConfig(String(config.sites ?? '')).map((s) => ({ siteId: stableId(s.domain), domain: s.domain }))
    if (sites.length === 0) { ctx.log('warn', 'Aucun site concurrent configuré.'); return { results: resultsSheet([]) } }

    const refCol = String(config.refColumn ?? '').trim()
    const eanCol = String(config.eanColumn ?? '').trim()
    const nameCol = String(config.nameColumn ?? '').trim()
    if (!refCol && !eanCol) throw new Error('Recherche dirigée : renseigne au moins une colonne Référence ou EAN.')

    const products: DirectedSourceProduct[] = sheet.rows
      .map((r, i) => ({
        id: String((r as { _id?: unknown })._id ?? i),
        ref: refCol ? String(r[refCol] ?? '').trim() || undefined : undefined,
        ean: eanCol ? String(r[eanCol] ?? '').trim() || undefined : undefined,
      }))
      .filter((p) => p.ref || p.ean)

    const budget = Math.max(1, Number(config.productBudget) || 20)
    const CURSOR_META = 'directed_cursor' // pas de __…__ : Firestore réserve ces ids
    const startCursor = (await loadCompetitorMeta(ctx.uid, watchId, CURSOR_META))?.productCount ?? 0
    const pass = await directedPass(products, sites, startCursor % Math.max(1, products.length), budget, {
      fetchHtml: async (url) => { try { return await fetchHtml(url, 20000) } catch { return null } },
      signal: ctx.signal,
      log: (m) => ctx.log('info', m),
    })

    for (const res of pass.results) {
      const l = res.hit.listing
      await savePage(ctx.uid, watchId, res.siteId, `search-${res.productId}`, l.url ?? '', 1, [l])
    }
    await saveCompetitorMeta(ctx.uid, watchId, CURSOR_META, { domain: 'directed-cursor', productCount: pass.nextCursor })

    const nameById = new Map(sheet.rows.map((r, i) => [String((r as { _id?: unknown })._id ?? i), nameCol ? String(r[nameCol] ?? '') : '']))
    const srcById = new Map(products.map((p) => [p.id, p]))
    const domainById = new Map(sites.map((s) => [s.siteId, s.domain]))

    const rows = pass.results.map((res, i) => {
      const l = res.hit.listing
      const src = srcById.get(res.productId)
      const ttc = l.price ?? null
      return {
        _id: `hit_${i}`,
        produit: nameById.get(res.productId) || l.name || src?.ref || '',
        ref: src?.ref ?? '', ean: src?.ean ?? '',
        site: domainById.get(res.siteId) ?? res.siteId,
        prixTtc: ttc,
        prixHt: ttc != null ? Math.round((ttc / (1 + VAT)) * 100) / 100 : null,
        preuve: res.hit.evidence,
        lien: l.url ?? '',
      }
    })
    ctx.log('info', `${rows.length} prix trouvé(s) sur ${pass.processed} produit(s) [curseur ${startCursor} → ${pass.nextCursor} / ${products.length}] × ${sites.length} site(s).`)
    return { results: resultsSheet(rows) }
  },
})
