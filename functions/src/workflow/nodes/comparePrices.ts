// functions/src/workflow/nodes/comparePrices.ts
// Jumeau SERVEUR (headless) du node client « Comparer les prix »
// (src/features/workflows/registry/comparePricesNode.ts). Logique dupliquée (le
// serveur ne peut pas importer src/). Deux entrées : source + concurrents. Sortie
// ANCRÉE SOURCE (tous les produits source conservés). Appariement ANCRÉ RÉFÉRENCE :
// réf exacte → réf tolérante (préfixe, RBC36X2↔RBC36X26B) → EAN identique (secours)
// → nom normalisé. Sortie { sheet: { columns, rows } } pour gsheets-export.
import { registerServerNode } from '../registry'
import { t } from '../../i18n'

interface SheetLike { rows?: Record<string, unknown>[]; [k: string]: unknown }
interface Cfg {
  nameColumn: string; priceColumn: string; eanColumn: string
  referenceColumn: string; urlColumn: string; siteColumn: string
  brandColumn: string; originalColumn: string; onlyMatched: boolean
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

interface CMatch { site: string; price: number; original?: number; url?: string }

// Coloration de la colonne « position » (tons sémantiques mappés par chaque rendu/export).
const POSITION_COLOR_RULES = [
  { column: 'position', equals: 'moins cher', tone: 'positive' as const },
  { column: 'position', equals: 'plus cher', tone: 'negative' as const },
  { column: 'position', equals: 'égalité', tone: 'neutral' as const },
  { column: 'position', equals: 'non trouvé', tone: 'muted' as const },
]

// Préfixe de référence minimal pour apparier deux codes modèle (anti faux positifs).
const MIN_REF_PREFIX = 6
/** Appariement TOLÉRANT par préfixe de référence (RBC36X2 ↔ RBC36X26B) : la plus
 *  courte doit être un préfixe de la plus longue et faire ≥ MIN_REF_PREFIX chars. */
function matchByRefPrefix(refs: string[], byRef: Map<string, CMatch[]>): CMatch[] {
  const out: CMatch[] = []
  const seen = new Set<string>()
  for (const sref of refs) {
    for (const [cref, matches] of byRef) {
      if (cref === sref) continue
      const [short, long] = sref.length <= cref.length ? [sref, cref] : [cref, sref]
      if (short.length < MIN_REF_PREFIX || !long.startsWith(short)) continue
      for (const m of matches) {
        const sig = `${m.site}|${m.price}`
        if (!seen.has(sig)) { seen.add(sig); out.push(m) }
      }
    }
  }
  return out
}

interface PeerGroup { name: string; brand: string; ref: string; ean: string; sites: Map<string, { price: number; original?: number }> }

/** Mode PAIRS (sans source) : regroupe les produits de TOUTES les enseignes (EAN →
 *  code modèle → nom), 1 ligne/produit, 1 colonne prix par enseigne + meilleur prix + écart. */
function comparePeers(rows: Record<string, unknown>[], cfg: Cfg) {
  const groups: PeerGroup[] = []
  const eanIdx = new Map<string, PeerGroup>()
  const refIdx = new Map<string, PeerGroup>()
  const nameIdx = new Map<string, PeerGroup>()
  const allSites: string[] = []
  for (const row of rows) {
    const site = String(row[cfg.siteColumn] ?? '').trim() || 'site'
    if (!allSites.includes(site)) allSites.push(site)
    const k = keysOf(row, cfg)
    const price = parsePrice(row[cfg.priceColumn])
    const origRaw = parsePrice(row[cfg.originalColumn])
    const original = Number.isFinite(origRaw) && origRaw > price ? origRaw : undefined
    const nameVal = String(row[cfg.nameColumn] ?? '').trim()
    const brand = String(row[cfg.brandColumn] ?? '').trim()
    let g: PeerGroup | undefined = (k.ean && eanIdx.get(k.ean)) || undefined
    if (!g) for (const r of k.refs) { const hit = refIdx.get(r); if (hit) { g = hit; break } }
    if (!g && k.name) g = nameIdx.get(k.name)
    if (!g) { g = { name: nameVal, brand, ref: k.refs[0] ?? '', ean: k.ean, sites: new Map() }; groups.push(g) }
    if (k.ean) eanIdx.set(k.ean, g)
    for (const r of k.refs) refIdx.set(r, g)
    if (k.name) nameIdx.set(k.name, g)
    if (!g.name) g.name = nameVal
    if (!g.brand) g.brand = brand
    if (!g.ref) g.ref = k.refs[0] ?? ''
    if (!g.ean) g.ean = k.ean
    if (Number.isFinite(price) && price > 0) {
      const prev = g.sites.get(site)
      if (prev === undefined || price < prev.price) g.sites.set(site, { price, original })
    }
  }
  const priceCols = allSites.map((s) => ({ site: s, key: `prix_${slug(s)}`, barreKey: `prix_barre_${slug(s)}`, reducKey: `reduc_${slug(s)}` }))
  const columns = [
    { key: 'produit', label: 'Produit' }, { key: 'marque', label: 'Marque' },
    { key: 'reference', label: 'Réf.' }, { key: 'ean', label: 'EAN' },
    ...priceCols.flatMap((pc) => [
      { key: pc.key, label: `Prix ${pc.site}` },
      { key: pc.barreKey, label: `Prix barré ${pc.site}` },
      { key: pc.reducKey, label: `Réduc % ${pc.site}` },
    ]),
    { key: 'meilleur_prix', label: 'Meilleur prix' },
    { key: 'enseigne_moins_chere', label: 'Enseigne la moins chère' },
    { key: 'ecart_eur', label: 'Écart max €' }, { key: 'ecart_pct', label: 'Écart max %' },
  ]
  const out: Record<string, unknown>[] = []
  let id = 0
  let matched = 0
  for (const g of groups) {
    const r: Record<string, unknown> = { _id: `peer_${id++}`, produit: g.name, marque: g.brand, reference: g.ref, ean: g.ean }
    for (const pc of priceCols) {
      const e = g.sites.get(pc.site)
      r[pc.key] = e ? String(e.price) : ''
      r[pc.barreKey] = e?.original != null ? String(e.original) : ''
      r[pc.reducKey] = e?.original != null && e.original > 0 ? String(Math.round(((e.original - e.price) / e.original) * 1000) / 10) : ''
    }
    const prices = [...g.sites.values()].map((e) => e.price)
    if (prices.length > 0) {
      const min = Math.min(...prices); const max = Math.max(...prices)
      let cheapest = ''; for (const [s, e] of g.sites) if (e.price === min) { cheapest = s; break }
      r.meilleur_prix = String(min); r.enseigne_moins_chere = cheapest
      r.ecart_eur = String(Math.round((max - min) * 100) / 100)
      r.ecart_pct = min > 0 ? String(Math.round(((max - min) / min) * 1000) / 10) : ''
      if (g.sites.size >= 2) matched++
    } else { r.meilleur_prix = ''; r.enseigne_moins_chere = ''; r.ecart_eur = ''; r.ecart_pct = '' }
    out.push(r)
  }
  out.sort((a, b) => (Number(b.ecart_pct) || -1e9) - (Number(a.ecart_pct) || -1e9))
  return { columns, rows: out, sites: allSites, matched }
}

registerServerNode({
  type: 'compare-prices',
  run: async (ctx, config, inputs) => {
    const c = config as unknown as Cfg & { noSource?: boolean }
    const cfg: Cfg = {
      nameColumn: c.nameColumn || 'name', priceColumn: c.priceColumn || 'price',
      eanColumn: c.eanColumn || 'ean', referenceColumn: c.referenceColumn || '',
      urlColumn: c.urlColumn || 'url', siteColumn: c.siteColumn || 'site',
      brandColumn: c.brandColumn || 'brand', originalColumn: c.originalColumn || 'originalPrice',
      onlyMatched: c.onlyMatched === true,
    }
    const sourceRows = (((inputs.source ?? {}) as SheetLike).rows ?? []) as Record<string, unknown>[]
    const competitorRows = (((inputs.concurrents ?? {}) as SheetLike).rows ?? []) as Record<string, unknown>[]

    // Mode « entre pairs » (sans source).
    if (c.noSource === true) {
      const all = [...sourceRows, ...competitorRows]
      if (all.length === 0) { ctx.log('warn', t(ctx.locale, 'run.noProduct')); return { sheet: { columns: [], rows: [] } } }
      const { columns, rows, sites, matched } = comparePeers(all, cfg)
      ctx.log('info', `${rows.length} produit(s) distinct(s) sur ${sites.length} enseigne(s) (${matched} chez ≥2).`)
      return { sheet: { columns, rows } }
    }

    if (sourceRows.length === 0) {
      ctx.log('warn', 'Aucun produit source (port « source »).')
      return { sheet: { columns: [], rows: [] } }
    }

    const compSites: string[] = []
    const byEan = new Map<string, CMatch[]>()
    const byRef = new Map<string, CMatch[]>()
    const byName = new Map<string, CMatch[]>()
    const push = (m: Map<string, CMatch[]>, key: string, site: string, price: number, original?: number, url?: string) => {
      if (!key) return
      const list = m.get(key) ?? []
      const found = list.find((x) => x.site === site)
      if (found) { if (price < found.price) { found.price = price; found.original = original; found.url = url } }
      else list.push({ site, price, original, url })
      m.set(key, list)
    }
    for (const row of competitorRows) {
      const site = String(row[cfg.siteColumn] ?? '').trim() || 'concurrent'
      const price = parsePrice(row[cfg.priceColumn])
      if (!compSites.includes(site)) compSites.push(site)
      if (!(Number.isFinite(price) && price > 0)) continue
      const origRaw = parsePrice(row[cfg.originalColumn])
      const original = Number.isFinite(origRaw) && origRaw > price ? origRaw : undefined
      const url = String(row[cfg.urlColumn] ?? '').trim()
      const k = keysOf(row, cfg)
      push(byEan, k.ean, site, price, original, url)
      for (const ref of k.refs) push(byRef, ref, site, price, original, url)
      push(byName, k.name, site, price, original, url)
    }

    // 3 colonnes par concurrent : prix actuel, prix barré, % de réduction.
    const priceCols = compSites.map((s) => ({
      site: s, key: `prix_${slug(s)}`, barreKey: `prix_barre_${slug(s)}`, reducKey: `reduc_${slug(s)}`,
    }))
    const columns = [
      { key: 'produit', label: 'Produit' },
      { key: 'marque', label: 'Marque' },
      { key: 'reference', label: 'Réf.' },
      { key: 'ean', label: 'EAN' },
      { key: 'source', label: 'Source' },
      { key: 'prix_source', label: 'Prix source' },
      { key: 'prix_barre_source', label: 'Prix barré source' },
      { key: 'reduc_source', label: 'Réduc % source' },
      { key: 'lien_source', label: 'Lien source' },
      ...priceCols.flatMap((p) => [
        { key: p.key, label: `Prix ${p.site}` },
        { key: p.barreKey, label: `Prix barré ${p.site}` },
        { key: p.reducKey, label: `Réduc % ${p.site}` },
      ]),
      { key: 'meilleur_concurrent', label: 'Concurrent le moins cher' },
      { key: 'prix_concurrent', label: 'Prix concurrent' },
      { key: 'lien_concurrent', label: 'Lien concurrent' },
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
      // Réf modèle = clé cross-enseigne fiable (EAN diffère fabricant/distributeur) :
      // réf exacte → réf tolérante (préfixe) → EAN (secours) → nom.
      let comp: CMatch[] = []
      const seen = new Set<string>()
      for (const ref of k.refs) for (const m of byRef.get(ref) ?? []) {
        const sig = `${m.site}|${m.price}`
        if (!seen.has(sig)) { seen.add(sig); comp.push(m) }
      }
      if (comp.length === 0) comp = matchByRefPrefix(k.refs, byRef)
      if (comp.length === 0) comp = (k.ean && byEan.get(k.ean)) || []
      if (comp.length === 0) comp = (k.name && byName.get(k.name)) || []

      // Prix barré source (promo) : prix d'origine SI affiché barré et > prix actuel.
      const srcOrig = parsePrice(row[cfg.originalColumn])
      const srcBarre = Number.isFinite(srcOrig) && srcOrig > srcPrice ? srcOrig : NaN
      const r: Record<string, unknown> = {
        _id: `cmp_${id++}`, produit: nameVal, marque: String(row[cfg.brandColumn] ?? '').trim(),
        reference: k.refs[0] ?? '', ean: k.ean,
        source: sourceSite, prix_source: Number.isFinite(srcPrice) && srcPrice > 0 ? String(srcPrice) : '',
        prix_barre_source: Number.isFinite(srcBarre) ? String(srcBarre) : '',
        reduc_source: Number.isFinite(srcBarre) && srcBarre > 0
          ? String(Math.round(((srcBarre - srcPrice) / srcBarre) * 1000) / 10) : '',
        lien_source: String(row[cfg.urlColumn] ?? '').trim(),
      }
      const bySite = new Map<string, { price: number; original?: number; url?: string }>()
      for (const m of comp) {
        const prev = bySite.get(m.site)
        if (prev === undefined || m.price < prev.price) bySite.set(m.site, { price: m.price, original: m.original, url: m.url })
      }
      for (const pc of priceCols) {
        const e = bySite.get(pc.site)
        r[pc.key] = e ? String(e.price) : ''
        r[pc.barreKey] = e?.original != null ? String(e.original) : ''
        r[pc.reducKey] = e?.original != null && e.original > 0
          ? String(Math.round(((e.original - e.price) / e.original) * 1000) / 10)
          : ''
      }
      if (bySite.size > 0) {
        matched++
        let best: [string, number] | null = null
        for (const [s, e] of bySite.entries()) if (!best || e.price < best[1]) best = [s, e.price]
        r.meilleur_concurrent = best![0]
        r.prix_concurrent = String(best![1])
        r.lien_concurrent = bySite.get(best![0])?.url ?? ''
        if (Number.isFinite(srcPrice) && srcPrice > 0) {
          const ecart = Math.round((srcPrice - best![1]) * 100) / 100
          r.ecart_eur = String(ecart)
          r.ecart_pct = best![1] > 0 ? String(Math.round((ecart / best![1]) * 1000) / 10) : ''
          r.position = ecart > 0 ? 'plus cher' : ecart < 0 ? 'moins cher' : 'égalité'
        } else { r.ecart_eur = ''; r.ecart_pct = ''; r.position = '' }
      } else {
        r.meilleur_concurrent = ''; r.prix_concurrent = ''; r.lien_concurrent = ''
        r.ecart_eur = ''; r.ecart_pct = ''; r.position = 'non trouvé'
      }
      if (cfg.onlyMatched && bySite.size === 0) continue
      out.push(r)
    }
    out.sort((a, b) => (Number(b.ecart_pct) || -1e9) - (Number(a.ecart_pct) || -1e9))

    ctx.log('info', `${t(ctx.locale, 'run.matched', { count: out.length, matched, sites: compSites.length })} : ${compSites.join(', ') || '—'}.`)
    return { sheet: { columns, rows: out, colorRules: POSITION_COLOR_RULES } }
  },
})
