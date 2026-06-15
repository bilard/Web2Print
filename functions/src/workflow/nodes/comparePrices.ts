// functions/src/workflow/nodes/comparePrices.ts
// Jumeau SERVEUR (headless) du node client « Comparer les prix »
// (src/features/workflows/registry/comparePricesNode.ts). Logique de pivot PURE
// dupliquée (le serveur ne peut pas importer src/, comme priceWatchTrack). Mêmes
// clés de config et même forme de sortie { sheet: { columns, rows } } pour rester
// wire-compatible avec gsheets-export / send-telegram en aval.
import { registerServerNode } from '../registry'

interface SheetLike { rows?: Record<string, unknown>[]; [k: string]: unknown }

function slug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'site'
}
function normName(s: string): string {
  return String(s).toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim()
}
function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const cleaned = v.replace(/[\s€$£]/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  return cleaned ? parseFloat(cleaned) : NaN
}

interface Group { key: string; label: string; ean: string; prices: Map<string, number> }

registerServerNode({
  type: 'compare-prices',
  run: async (ctx, config, inputs) => {
    const sheet = (inputs.sheet ?? { rows: [] }) as SheetLike
    const rows = Array.isArray(sheet.rows) ? sheet.rows : []
    if (rows.length === 0) {
      ctx.log('warn', 'Aucune ligne en entrée.')
      return { sheet: { columns: [], rows: [] } }
    }
    const keyColumn = String(config.keyColumn ?? 'ean')
    const fallbackKeyColumn = String(config.fallbackKeyColumn ?? 'name')
    const siteColumn = String(config.siteColumn ?? 'site')
    const priceColumn = String(config.priceColumn ?? 'price')
    const labelColumn = String(config.labelColumn ?? 'name')
    const onlyCommon = config.onlyCommon !== false

    const sites: string[] = []
    const groups = new Map<string, Group>()
    for (const row of rows) {
      const eanRaw = String(row[keyColumn] ?? '').replace(/\D/g, '')
      const labelRaw = String(row[labelColumn] ?? row[fallbackKeyColumn] ?? '').trim()
      const key = eanRaw || normName(String(row[fallbackKeyColumn] ?? labelRaw))
      if (!key) continue
      const site = String(row[siteColumn] ?? '').trim() || 'site'
      const price = parsePrice(row[priceColumn])
      if (!sites.includes(site)) sites.push(site)

      let g = groups.get(key)
      if (!g) { g = { key, label: labelRaw || key, ean: eanRaw, prices: new Map() }; groups.set(key, g) }
      if (labelRaw.length > g.label.length) g.label = labelRaw
      if (eanRaw && !g.ean) g.ean = eanRaw
      if (Number.isFinite(price) && price > 0) {
        const prev = g.prices.get(site)
        if (prev === undefined || price < prev) g.prices.set(site, price)
      }
    }

    const priceCols = sites.map((s) => ({ site: s, key: `prix_${slug(s)}` }))
    const columns = [
      { key: 'produit', label: 'Produit' },
      { key: 'ean', label: 'EAN' },
      ...priceCols.map((c) => ({ key: c.key, label: `Prix ${c.site}` })),
      { key: 'ecart_eur', label: 'Écart €' },
      { key: 'ecart_pct', label: 'Écart %' },
      { key: 'moins_cher', label: 'Moins cher' },
    ]

    const out: Record<string, unknown>[] = []
    let id = 0
    let compared = 0
    for (const g of groups.values()) {
      if (onlyCommon && g.prices.size < 2) continue
      const row: Record<string, unknown> = { _id: `cmp_${id++}`, produit: g.label, ean: g.ean }
      for (const c of priceCols) {
        const p = g.prices.get(c.site)
        row[c.key] = p !== undefined ? String(p) : ''
      }
      const priced = [...g.prices.entries()]
      if (priced.length >= 2) {
        let lo = priced[0], hi = priced[0]
        for (const e of priced) { if (e[1] < lo[1]) lo = e; if (e[1] > hi[1]) hi = e }
        const ecart = Math.round((hi[1] - lo[1]) * 100) / 100
        row.ecart_eur = String(ecart)
        row.ecart_pct = lo[1] > 0 ? String(Math.round((ecart / lo[1]) * 1000) / 10) : ''
        row.moins_cher = ecart > 0 ? lo[0] : 'égalité'
        compared++
      } else {
        row.ecart_eur = ''
        row.ecart_pct = ''
        row.moins_cher = priced.length === 1 ? `seul ${priced[0][0]}` : ''
      }
      out.push(row)
    }
    out.sort((a, b) => (Number(b.ecart_pct) || 0) - (Number(a.ecart_pct) || 0))

    ctx.log('info', `${out.length} produit(s) — ${compared} comparable(s) sur ${sites.length} site(s) : ${sites.join(', ')}.`)
    return { sheet: { columns, rows: out } }
  },
})
