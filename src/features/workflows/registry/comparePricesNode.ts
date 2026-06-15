// src/features/workflows/registry/comparePricesNode.ts
// Node « Comparer les prix » : prend une feuille où chaque ligne est un produit
// taggé par site (typiquement la sortie de « Produits d'une page liste » avec
// plusieurs URLs), et PIVOTE par produit → une ligne par produit avec une
// colonne de prix par site, l'écart absolu, l'écart %, et le site le moins cher.
// Logique PURE (aucun réseau / LLM) : regroupe par clé (EAN sinon nom normalisé).
import { Scale } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'
import { parsePrice } from '@/features/priceWatch/core'

interface ComparePricesConfig {
  /** Colonne identifiant le produit (clé de regroupement). */
  keyColumn: string
  /** Colonne de repli si la clé est vide (ex : nom). */
  fallbackKeyColumn: string
  /** Colonne du site / source. */
  siteColumn: string
  /** Colonne du prix. */
  priceColumn: string
  /** Colonne du libellé affiché. */
  labelColumn: string
  /** Ne garder que les produits présents sur au moins 2 sites. */
  onlyCommon: boolean
}

interface ComparePricesInputs {
  sheet: { rows?: Array<Record<string, unknown>> } | null
}

interface ComparePricesOutputs {
  sheet: ExcelSheet
}

/** Slug sûr pour une clé de colonne (prix par site). */
function slug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'site'
}

/** Normalise un nom pour servir de clé de repli (insensible casse/espaces/ponctuation). */
function normName(s: string): string {
  return String(s).toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim()
}

interface Group {
  key: string
  label: string
  ean: string
  /** site → prix (le plus bas observé pour ce site). */
  prices: Map<string, number>
}

export interface CompareFields {
  keyColumn: string
  fallbackKeyColumn: string
  siteColumn: string
  priceColumn: string
  labelColumn: string
  onlyCommon: boolean
}

export interface CompareResult {
  columns: ExcelColumn[]
  rows: ExcelRow[]
  sites: string[]
  /** Nb de produits réellement comparés (prix sur ≥ 2 sites). */
  compared: number
}

/**
 * Cœur PUR : pivote des lignes « un produit sur un site » en une ligne par
 * produit avec une colonne de prix par site + écart (€/%) + site le moins cher.
 * Regroupe par EAN (chiffres uniquement) sinon par nom normalisé. Retient le
 * prix le plus bas par site et le libellé le plus informatif.
 */
export function pivotCompare(rows: Array<Record<string, unknown>>, f: CompareFields): CompareResult {
  const sites: string[] = []
  const groups = new Map<string, Group>()

  for (const row of rows) {
    const eanRaw = String(row[f.keyColumn] ?? '').replace(/\D/g, '')
    const labelRaw = String(row[f.labelColumn] ?? row[f.fallbackKeyColumn] ?? '').trim()
    const key = eanRaw || normName(String(row[f.fallbackKeyColumn] ?? labelRaw))
    if (!key) continue
    const site = String(row[f.siteColumn] ?? '').trim() || 'site'
    const price = parsePrice(row[f.priceColumn])
    if (!sites.includes(site)) sites.push(site)

    let g = groups.get(key)
    if (!g) {
      g = { key, label: labelRaw || key, ean: eanRaw, prices: new Map() }
      groups.set(key, g)
    }
    // Conserver le libellé le plus informatif (le plus long) et l'EAN s'il apparaît.
    if (labelRaw.length > g.label.length) g.label = labelRaw
    if (eanRaw && !g.ean) g.ean = eanRaw
    if (Number.isFinite(price) && price > 0) {
      const prev = g.prices.get(site)
      if (prev === undefined || price < prev) g.prices.set(site, price)
    }
  }

  const priceCols = sites.map((s) => ({ site: s, key: `prix_${slug(s)}` }))
  const columns: ExcelColumn[] = [
    { key: 'produit', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 340 },
    { key: 'ean', label: 'EAN', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 140 },
    ...priceCols.map((c) => ({
      key: c.key, label: `Prix ${c.site}`, fieldType: 'number' as const, detectedType: 'number' as const,
      isPrimary: false, width: 130,
    })),
    { key: 'ecart_eur', label: 'Écart €', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 100 },
    { key: 'ecart_pct', label: 'Écart %', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 90 },
    { key: 'moins_cher', label: 'Moins cher', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 160 },
  ]

  const out: ExcelRow[] = []
  let id = 0
  let compared = 0
  for (const g of groups.values()) {
    if (f.onlyCommon && g.prices.size < 2) continue
    const row: ExcelRow = { _id: `cmp_${id++}`, produit: g.label, ean: g.ean }
    for (const c of priceCols) {
      const p = g.prices.get(c.site)
      row[c.key] = p !== undefined ? String(p) : ''
    }
    const priced = [...g.prices.entries()]
    if (priced.length >= 2) {
      let lo = priced[0], hi = priced[0]
      for (const e of priced) {
        if (e[1] < lo[1]) lo = e
        if (e[1] > hi[1]) hi = e
      }
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

  // Tri : plus gros écart % d'abord (les opportunités de repositionnement en haut).
  out.sort((a, b) => (Number(b.ecart_pct) || 0) - (Number(a.ecart_pct) || 0))

  return { columns, rows: out, sites, compared }
}

const comparePricesNode: NodeSpec<ComparePricesConfig, ComparePricesInputs, ComparePricesOutputs> = {
  type: 'compare-prices',
  category: 'logic',
  label: 'Comparer les prix',
  description:
    'Pivote une feuille de produits multi-sites (une ligne = un produit sur un site) en un tableau ' +
    'de comparaison : une ligne par produit, une colonne de prix par site, plus l’écart (€ et %) et le ' +
    'site le moins cher. Regroupe par EAN, à défaut par nom. Idéal après « Produits d’une page liste ».',
  icon: Scale,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    { name: 'keyColumn', kind: 'columnRef', label: 'Colonne clé (EAN)', default: 'ean', help: 'Clé de regroupement entre sites.' },
    { name: 'fallbackKeyColumn', kind: 'columnRef', label: 'Colonne de repli (Nom)', default: 'name', help: 'Utilisée si la clé est vide.' },
    { name: 'siteColumn', kind: 'columnRef', label: 'Colonne Site', default: 'site' },
    { name: 'priceColumn', kind: 'columnRef', label: 'Colonne Prix', default: 'price' },
    { name: 'labelColumn', kind: 'columnRef', label: 'Colonne Libellé', default: 'name' },
    { name: 'onlyCommon', kind: 'checkbox', label: 'Seulement les produits présents sur ≥ 2 sites', default: true },
  ],
  defaultConfig: {
    keyColumn: 'ean', fallbackKeyColumn: 'name', siteColumn: 'site',
    priceColumn: 'price', labelColumn: 'name', onlyCommon: true,
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const rows = Array.isArray(inputs.sheet?.rows) ? inputs.sheet!.rows! : []
    if (rows.length === 0) {
      ctx.log('warn', 'Aucune ligne en entrée.')
      return { sheet: { name: 'Comparaison de prix', columns: [], rows: [], taxonomy: [] } }
    }
    const { columns, rows: out, sites, compared } = pivotCompare(rows, config)
    ctx.log('info', `${out.length} produit(s) en sortie — ${compared} comparable(s) sur ${sites.length} site(s) : ${sites.join(', ')}.`)
    return { sheet: { name: 'Comparaison de prix', columns, rows: out, taxonomy: [] } }
  },
}

nodeRegistry.register(comparePricesNode)
