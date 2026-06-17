// functions/src/workflow/nodes/comparePrices.ts
// Jumeau SERVEUR (headless) du node client « Comparer les prix »
// (src/features/workflows/registry/comparePricesNode.ts). Logique dupliquée (le
// serveur ne peut pas importer src/). Deux entrées : source + concurrents. Sortie
// ANCRÉE SOURCE (tous les produits source conservés). Appariement EAN → code
// modèle → nom normalisé. Sortie { sheet: { columns, rows } } pour gsheets-export.
import { registerServerNode } from '../registry'

interface SheetLike { rows?: Record<string, unknown>[]; [k: string]: unknown }
interface Cfg {
  nameColumn: string; priceColumn: string; eanColumn: string
  referenceColumn: string; urlColumn: string; siteColumn: string; onlyMatched: boolean
}

function slug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'site'
}
function normName(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
function referenceTokens(text: string): string[] {
  const out = new Set<string>()
  for (const tok of String(text).toUpperCase().split(/[^A-Z0-9]+/)) {
    const letters = (tok.match(/[A-Z]/g) ?? []).length
    const digits = (tok.match(/\d/g) ?? []).length
    if (tok.length >= 5 && tok.length <= 15 && letters >= 2 && digits >= 2) out.add(tok)
  }
  return [...out]
}
function normalizePriceToken(tok: string): number {
  let s = tok
  if (s.includes('.') && s.includes(',')) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.')
  } else if (s.includes(',')) {
    const parts = s.split(',')
    s = parts.length === 2 && parts[parts.length - 1].length <= 2 ? parts.join('.') : parts.join('')
  } else if (s.includes('.')) {
    const parts = s.split('.')
    if (parts.length > 2 || parts[parts.length - 1].length === 3) s = parts.join('')
  }
  return parseFloat(s)
}
// Séparateurs FR/EN ; sur une paire promo (« 304,38€284,41€ ») renvoie le PLUS BAS
// (prix facturé). (Aligné sur priceWatch/core.parsePrice.)
function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const tokens = [...v.replace(/\s/g, '').matchAll(/-?\d[\d.,]*\d|-?\d/g)]
    .map((m) => normalizePriceToken(m[0]))
    .filter((n) => Number.isFinite(n))
  return tokens.length ? Math.min(...tokens) : NaN
}
function keysOf(row: Record<string, unknown>, c: Cfg) {
  const nameVal = String(row[c.nameColumn] ?? '')
  const urlVal = String(row[c.urlColumn] ?? '')
  const explicit = c.referenceColumn ? String(row[c.referenceColumn] ?? '').trim() : ''
  const refs = explicit ? [explicit.toUpperCase()] : referenceTokens(`${nameVal} ${urlVal}`)
  return {
    ean: String(row[c.eanColumn] ?? '').replace(/\D/g, '').slice(0, 13),
    refs,
    name: normName(nameVal),
  }
}

interface CMatch { site: string; price: number }

registerServerNode({
  type: 'compare-prices',
  run: async (ctx, config, inputs) => {
    const c = config as unknown as Cfg
    const cfg: Cfg = {
      nameColumn: c.nameColumn || 'name', priceColumn: c.priceColumn || 'price',
      eanColumn: c.eanColumn || 'ean', referenceColumn: c.referenceColumn || '',
      urlColumn: c.urlColumn || 'url', siteColumn: c.siteColumn || 'site', onlyMatched: c.onlyMatched === true,
    }
    const sourceRows = (((inputs.source ?? {}) as SheetLike).rows ?? []) as Record<string, unknown>[]
    const competitorRows = (((inputs.concurrents ?? {}) as SheetLike).rows ?? []) as Record<string, unknown>[]
    if (sourceRows.length === 0) {
      ctx.log('warn', 'Aucun produit source (port « source »).')
      return { sheet: { columns: [], rows: [] } }
    }

    const compSites: string[] = []
    const byEan = new Map<string, CMatch[]>()
    const byRef = new Map<string, CMatch[]>()
    const byName = new Map<string, CMatch[]>()
    const push = (m: Map<string, CMatch[]>, key: string, site: string, price: number) => {
      if (!key) return
      const list = m.get(key) ?? []
      const found = list.find((x) => x.site === site)
      if (found) { if (price < found.price) found.price = price }
      else list.push({ site, price })
      m.set(key, list)
    }
    for (const row of competitorRows) {
      const site = String(row[cfg.siteColumn] ?? '').trim() || 'concurrent'
      const price = parsePrice(row[cfg.priceColumn])
      if (!compSites.includes(site)) compSites.push(site)
      if (!(Number.isFinite(price) && price > 0)) continue
      const k = keysOf(row, cfg)
      push(byEan, k.ean, site, price)
      for (const ref of k.refs) push(byRef, ref, site, price)
      push(byName, k.name, site, price)
    }

    const priceCols = compSites.map((s) => ({ site: s, key: `prix_${slug(s)}` }))
    const columns = [
      { key: 'produit', label: 'Produit' },
      { key: 'reference', label: 'Réf.' },
      { key: 'ean', label: 'EAN' },
      { key: 'source', label: 'Source' },
      { key: 'prix_source', label: 'Prix source' },
      ...priceCols.map((p) => ({ key: p.key, label: `Prix ${p.site}` })),
      { key: 'meilleur_concurrent', label: 'Concurrent le moins cher' },
      { key: 'prix_concurrent', label: 'Prix concurrent' },
      { key: 'ecart_eur', label: 'Écart €' },
      { key: 'ecart_pct', label: 'Écart %' },
      { key: 'position', label: 'Position' },
    ]

    const out: Record<string, unknown>[] = []
    let id = 0
    let matched = 0
    for (const row of sourceRows) {
      const k = keysOf(row, cfg)
      const nameVal = String(row[cfg.nameColumn] ?? '').trim()
      const sourceSite = String(row[cfg.siteColumn] ?? '').trim() || 'source'
      const srcPrice = parsePrice(row[cfg.priceColumn])
      let comp: CMatch[] = (k.ean && byEan.get(k.ean)) || []
      if (comp.length === 0) {
        const seen = new Set<string>()
        for (const ref of k.refs) for (const m of byRef.get(ref) ?? []) {
          const sig = `${m.site}|${m.price}`
          if (!seen.has(sig)) { seen.add(sig); comp.push(m) }
        }
      }
      if (comp.length === 0) comp = (k.name && byName.get(k.name)) || []

      const r: Record<string, unknown> = {
        _id: `cmp_${id++}`, produit: nameVal, reference: k.refs[0] ?? '', ean: k.ean,
        source: sourceSite, prix_source: Number.isFinite(srcPrice) && srcPrice > 0 ? String(srcPrice) : '',
      }
      const bySite = new Map<string, number>()
      for (const m of comp) {
        const prev = bySite.get(m.site)
        if (prev === undefined || m.price < prev) bySite.set(m.site, m.price)
      }
      for (const pc of priceCols) {
        const p = bySite.get(pc.site)
        r[pc.key] = p !== undefined ? String(p) : ''
      }
      if (bySite.size > 0) {
        matched++
        let best: [string, number] | null = null
        for (const e of bySite.entries()) if (!best || e[1] < best[1]) best = e
        r.meilleur_concurrent = best![0]
        r.prix_concurrent = String(best![1])
        if (Number.isFinite(srcPrice) && srcPrice > 0) {
          const ecart = Math.round((srcPrice - best![1]) * 100) / 100
          r.ecart_eur = String(ecart)
          r.ecart_pct = best![1] > 0 ? String(Math.round((ecart / best![1]) * 1000) / 10) : ''
          r.position = ecart > 0 ? 'plus cher' : ecart < 0 ? 'moins cher' : 'égalité'
        } else { r.ecart_eur = ''; r.ecart_pct = ''; r.position = '' }
      } else {
        r.meilleur_concurrent = ''; r.prix_concurrent = ''
        r.ecart_eur = ''; r.ecart_pct = ''; r.position = 'non trouvé'
      }
      if (cfg.onlyMatched && bySite.size === 0) continue
      out.push(r)
    }
    out.sort((a, b) => (Number(b.ecart_pct) || -1e9) - (Number(a.ecart_pct) || -1e9))

    ctx.log('info', `${out.length} produit(s) source — ${matched} apparié(s) chez ${compSites.length} concurrent(s) : ${compSites.join(', ') || '—'}.`)
    return { sheet: { columns, rows: out } }
  },
})
