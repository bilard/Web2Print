// src/features/workflows/registry/comparePricesNode.ts
// Node « Comparer les prix » : compare les produits d'une SOURCE (port `source`)
// aux mêmes produits chez un ou plusieurs CONCURRENTS (port `concurrents`).
// Sortie ANCRÉE SOURCE : une ligne par produit source (TOUS conservés), avec le
// prix source, une colonne de prix par site concurrent, le meilleur prix
// concurrent, l'écart (€/%) et la position. Les deux entrées acceptent n'importe
// quelle feuille : « Produits d'une page liste » (URL) ou un import Excel/Google
// Sheets. Appariement robuste, ANCRÉ RÉFÉRENCE (clé fiable cross-enseigne, l'EAN
// diffère fabricant/distributeur) : réf exacte → réf tolérante (préfixe/troncature,
// RBC36X2↔RBC36X26B) → EAN identique (secours) → nom normalisé.
import { Scale } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelColumn, ExcelRow, ExcelSheet, SheetColorRule } from '@/features/excel/types'
import { parsePrice } from '@/features/priceWatch/core'

interface ComparePricesConfig {
  nameColumn: string
  priceColumn: string
  eanColumn: string
  referenceColumn: string
  urlColumn: string
  siteColumn: string
  brandColumn: string
  originalColumn: string
  onlyMatched: boolean
}

interface ComparePricesInputs {
  source: { rows?: Array<Record<string, unknown>> } | null
  concurrents: { rows?: Array<Record<string, unknown>> } | null
}

interface ComparePricesOutputs {
  sheet: ExcelSheet
}

function slug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'site'
}

/** Normalise un nom (casse/accents/ponctuation) pour clé de repli. */
export function normName(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extrait les codes modèle/SKU candidats d'un texte (nom + URL), sans dico marque.
 *  Découpe sur tout non-alphanumérique (donc gère les slugs d'URL hyphénés comme
 *  « …-rlm18e40h-ryobi-… ») et retient les tokens mêlant ≥2 lettres et ≥2 chiffres,
 *  longueur 5-15 (ex RLM18E40H, OLM1833B, RY36LMXSP53A). Écarte les unités
 *  (1800W, 40CM, 18V) et les ids purement numériques. */
export function referenceTokens(text: string): string[] {
  const out = new Set<string>()
  for (const tok of String(text).toUpperCase().split(/[^A-Z0-9]+/)) {
    const letters = (tok.match(/[A-Z]/g) ?? []).length
    const digits = (tok.match(/\d/g) ?? []).length
    if (tok.length >= 5 && tok.length <= 15 && letters >= 2 && digits >= 2) out.add(tok)
  }
  return [...out]
}

interface Keys { ean: string; refs: string[]; name: string }
function keysOf(row: Record<string, unknown>, c: ComparePricesConfig): Keys {
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

interface CompetitorMatch { site: string; price: number; original?: number }

/** Longueur minimale d'un préfixe de référence commun pour apparier deux codes
 *  modèle (en deçà, trop de faux positifs). */
const MIN_REF_PREFIX = 6

/** Appariement TOLÉRANT par préfixe de référence : relie une réf tronquée à la
 *  source (« RBC36X2 » chez jardiland) à sa réf complète chez le concurrent
 *  (« RBC36X26B »). Exige que la plus courte soit un préfixe de la plus longue et
 *  fasse ≥ MIN_REF_PREFIX caractères. Ne matche PAS deux variantes qui divergent
 *  (RY36LMXSP53A ≠ RY36LMXP46A). */
function matchByRefPrefix(refs: string[], byRef: Map<string, CompetitorMatch[]>): CompetitorMatch[] {
  const out: CompetitorMatch[] = []
  const seen = new Set<string>()
  for (const sref of refs) {
    for (const [cref, matches] of byRef) {
      if (cref === sref) continue // l'exact est traité avant
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

export interface CompareResult {
  columns: ExcelColumn[]
  rows: ExcelRow[]
  sites: string[]
  matched: number
  colorRules: SheetColorRule[]
}

/** Coloration de la colonne « position » : moins cher = bien (vert), plus cher =
 *  cher (rouge), égalité = neutre, non trouvé = estompé. Tons sémantiques mappés
 *  par chaque rendu (aperçu sombre / Google Sheets clair). */
const POSITION_COLOR_RULES: SheetColorRule[] = [
  { column: 'position', equals: 'moins cher', tone: 'positive' },
  { column: 'position', equals: 'plus cher', tone: 'negative' },
  { column: 'position', equals: 'égalité', tone: 'neutral' },
  { column: 'position', equals: 'non trouvé', tone: 'muted' },
]

/** Cœur PUR : compare chaque produit source aux concurrents. */
export function compareSourceToCompetitors(
  sourceRows: Array<Record<string, unknown>>,
  competitorRows: Array<Record<string, unknown>>,
  c: ComparePricesConfig,
): CompareResult {
  // Index concurrents par EAN, par référence, par nom — chaque entrée porte le
  // site + le prix le plus bas observé pour ce (clé, site).
  const compSites: string[] = []
  const byEan = new Map<string, CompetitorMatch[]>()
  const byRef = new Map<string, CompetitorMatch[]>()
  const byName = new Map<string, CompetitorMatch[]>()
  const push = (m: Map<string, CompetitorMatch[]>, key: string, site: string, price: number, original?: number) => {
    if (!key) return
    const list = m.get(key) ?? []
    const found = list.find((x) => x.site === site)
    // On conserve l'entrée au prix le plus bas pour ce (clé, site) — et SON prix barré.
    if (found) { if (price < found.price) { found.price = price; found.original = original } }
    else list.push({ site, price, original })
    m.set(key, list)
  }
  for (const row of competitorRows) {
    const site = String(row[c.siteColumn] ?? '').trim() || 'concurrent'
    const price = parsePrice(row[c.priceColumn])
    if (!compSites.includes(site)) compSites.push(site)
    if (!(Number.isFinite(price) && price > 0)) continue
    // Prix barré = prix d'origine SI présent et strictement supérieur au prix actuel.
    const origRaw = parsePrice(row[c.originalColumn])
    const original = Number.isFinite(origRaw) && origRaw > price ? origRaw : undefined
    const k = keysOf(row, c)
    push(byEan, k.ean, site, price, original)
    for (const ref of k.refs) push(byRef, ref, site, price, original)
    push(byName, k.name, site, price, original)
  }

  // 3 colonnes par concurrent : prix actuel, prix barré, % de réduction.
  const priceCols = compSites.map((s) => ({
    site: s, key: `prix_${slug(s)}`, barreKey: `prix_barre_${slug(s)}`, reducKey: `reduc_${slug(s)}`,
  }))
  const columns: ExcelColumn[] = [
    { key: 'produit', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 320 },
    { key: 'marque', label: 'Marque', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
    { key: 'reference', label: 'Réf.', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
    { key: 'ean', label: 'EAN', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 130 },
    { key: 'source', label: 'Source', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 140 },
    { key: 'prix_source', label: 'Prix source', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 110 },
    ...priceCols.flatMap((c2) => [
      { key: c2.key, label: `Prix ${c2.site}`, fieldType: 'number' as const, detectedType: 'number' as const, isPrimary: false, width: 120 },
      { key: c2.barreKey, label: `Prix barré ${c2.site}`, fieldType: 'number' as const, detectedType: 'number' as const, isPrimary: false, width: 110 },
      { key: c2.reducKey, label: `Réduc % ${c2.site}`, fieldType: 'number' as const, detectedType: 'number' as const, isPrimary: false, width: 90 },
    ]),
    { key: 'meilleur_concurrent', label: 'Concurrent le moins cher', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 180 },
    { key: 'prix_concurrent', label: 'Prix concurrent', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 120 },
    { key: 'ecart_eur', label: 'Écart €', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 100 },
    { key: 'ecart_pct', label: 'Écart %', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 90 },
    { key: 'position', label: 'Position', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 130 },
  ]

  const out: ExcelRow[] = []
  let id = 0
  let matched = 0
  for (const row of sourceRows) {
    const k = keysOf(row, c)
    const nameVal = String(row[c.nameColumn] ?? '').trim()
    const sourceSite = String(row[c.siteColumn] ?? '').trim() || 'source'
    const srcPrice = parsePrice(row[c.priceColumn])
    // Appariement cross-enseigne : la RÉFÉRENCE MODÈLE est la clé fiable (l'EAN
    // diffère entre enseignes : fabricant vs distributeur). Ordre : réf exacte →
    // réf tolérante (préfixe/troncature) → EAN identique (secours) → nom normalisé.
    let comp: CompetitorMatch[] = []
    const seen = new Set<string>()
    for (const ref of k.refs) for (const m of byRef.get(ref) ?? []) {
      const sig = `${m.site}|${m.price}`
      if (!seen.has(sig)) { seen.add(sig); comp.push(m) }
    }
    if (comp.length === 0) comp = matchByRefPrefix(k.refs, byRef)
    if (comp.length === 0) comp = (k.ean && byEan.get(k.ean)) || []
    if (comp.length === 0) comp = (k.name && byName.get(k.name)) || []

    const r: ExcelRow = {
      _id: `cmp_${id++}`,
      produit: nameVal,
      marque: String(row[c.brandColumn] ?? '').trim(),
      reference: k.refs[0] ?? '',
      ean: k.ean,
      source: sourceSite,
      prix_source: Number.isFinite(srcPrice) && srcPrice > 0 ? String(srcPrice) : '',
    }
    // Par site : prix le plus bas + son prix barré (le cas échéant).
    const bySite = new Map<string, { price: number; original?: number }>()
    for (const m of comp) {
      const prev = bySite.get(m.site)
      if (prev === undefined || m.price < prev.price) bySite.set(m.site, { price: m.price, original: m.original })
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
      if (Number.isFinite(srcPrice) && srcPrice > 0) {
        const ecart = Math.round((srcPrice - best![1]) * 100) / 100
        r.ecart_eur = String(ecart)
        r.ecart_pct = best![1] > 0 ? String(Math.round((ecart / best![1]) * 1000) / 10) : ''
        r.position = ecart > 0 ? 'plus cher' : ecart < 0 ? 'moins cher' : 'égalité'
      } else {
        r.ecart_eur = ''; r.ecart_pct = ''; r.position = ''
      }
    } else {
      r.meilleur_concurrent = ''; r.prix_concurrent = ''
      r.ecart_eur = ''; r.ecart_pct = ''; r.position = 'non trouvé'
    }
    if (c.onlyMatched && bySite.size === 0) continue
    out.push(r)
  }
  // Tri : les produits où je suis le plus cher d'abord (écart % décroissant), non trouvés à la fin.
  out.sort((a, b) => (Number(b.ecart_pct) || -1e9) - (Number(a.ecart_pct) || -1e9))

  return { columns, rows: out, sites: compSites, matched, colorRules: POSITION_COLOR_RULES }
}

const comparePricesNode: NodeSpec<ComparePricesConfig, ComparePricesInputs, ComparePricesOutputs> = {
  type: 'compare-prices',
  category: 'logic',
  label: 'Comparer les prix',
  description:
    'Compare les produits d’une SOURCE aux mêmes produits chez des CONCURRENTS (deux entrées). ' +
    'Sortie : une ligne par produit source (tous conservés), prix par concurrent, écart et position. ' +
    'Appariement par référence modèle (tolérant aux troncatures, ex RBC36X2↔RBC36X26B), EAN en secours. ' +
    'Les deux entrées acceptent une page liste (URL) ou un import Excel/Sheets.',
  icon: Scale,
  inputs: [
    { name: 'source', type: 'sheet', required: true },
    { name: 'concurrents', type: 'sheet', required: true },
  ],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  // Colonnes fixes de sortie (les `prix_<concurrent>` dynamiques s'ajoutent après un run).
  outputColumns: ['produit', 'marque', 'reference', 'ean', 'source', 'prix_source', 'meilleur_concurrent', 'prix_concurrent', 'ecart_eur', 'ecart_pct', 'position'],
  configSchema: [
    { name: 'nameColumn', kind: 'columnRef', label: 'Colonne Nom', default: 'name' },
    { name: 'priceColumn', kind: 'columnRef', label: 'Colonne Prix', default: 'price' },
    { name: 'eanColumn', kind: 'columnRef', label: 'Colonne EAN', default: 'ean', help: 'Clé d’appariement prioritaire.' },
    { name: 'referenceColumn', kind: 'columnRef', label: 'Colonne Référence', default: '', help: 'Vide = code modèle déduit du nom + URL.' },
    { name: 'urlColumn', kind: 'columnRef', label: 'Colonne URL', default: 'url', help: 'Le slug d’URL porte souvent le code modèle (appariement).' },
    { name: 'siteColumn', kind: 'columnRef', label: 'Colonne Site', default: 'site', help: 'Identifie source et concurrents.' },
    { name: 'brandColumn', kind: 'columnRef', label: 'Colonne Marque', default: 'brand', help: 'Marque affichée dans la colonne « Marque ».' },
    { name: 'originalColumn', kind: 'columnRef', label: 'Colonne Prix barré', default: 'originalPrice', help: 'Prix d’origine/barré — sert au calcul du % de réduction par concurrent.' },
    { name: 'onlyMatched', kind: 'checkbox', label: 'Seulement les produits trouvés chez un concurrent', default: false },
  ],
  defaultConfig: {
    nameColumn: 'name', priceColumn: 'price', eanColumn: 'ean',
    referenceColumn: '', urlColumn: 'url', siteColumn: 'site',
    brandColumn: 'brand', originalColumn: 'originalPrice', onlyMatched: false,
  },
  runtime: 'any',
  run: async (ctx, config, inputs) => {
    const sourceRows = Array.isArray(inputs.source?.rows) ? inputs.source!.rows! : []
    const competitorRows = Array.isArray(inputs.concurrents?.rows) ? inputs.concurrents!.rows! : []
    if (sourceRows.length === 0) {
      ctx.log('warn', 'Aucun produit source en entrée (port « source »).')
      return { sheet: { name: 'Comparaison de prix', columns: [], rows: [], taxonomy: [] } }
    }
    if (competitorRows.length === 0) {
      ctx.log('warn', 'Aucun produit concurrent en entrée (port « concurrents »).')
    }
    const { columns, rows, sites, matched, colorRules } = compareSourceToCompetitors(sourceRows, competitorRows, config)
    ctx.log('info', `${rows.length} produit(s) source — ${matched} apparié(s) chez ${sites.length} concurrent(s) : ${sites.join(', ') || '—'}.`)
    return { sheet: { name: 'Comparaison de prix', columns, rows, taxonomy: [], colorRules } }
  },
}

nodeRegistry.register(comparePricesNode)
