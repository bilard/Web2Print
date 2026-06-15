// src/features/workflows/registry/comparePricesNode.ts
// Node « Comparer les prix » : compare les produits d'une SOURCE (port `source`)
// aux mêmes produits chez un ou plusieurs CONCURRENTS (port `concurrents`).
// Sortie ANCRÉE SOURCE : une ligne par produit source (TOUS conservés), avec le
// prix source, une colonne de prix par site concurrent, le meilleur prix
// concurrent, l'écart (€/%) et la position. Les deux entrées acceptent n'importe
// quelle feuille : « Produits d'une page liste » (URL) ou un import Excel/Google
// Sheets. Appariement robuste : EAN → code modèle (ex RLM18E40H) → nom normalisé.
import { Scale } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'
import { parsePrice } from '@/features/priceWatch/core'

interface ComparePricesConfig {
  nameColumn: string
  priceColumn: string
  eanColumn: string
  referenceColumn: string
  siteColumn: string
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

/** Extrait un code modèle/SKU d'un intitulé (généraliste, sans dico marque) :
 *  le plus long token alphanumérique mêlant ≥2 lettres et ≥2 chiffres, longueur
 *  6-24 (ex RLM18E40H, RY36LMXSP53A160, FXE1RM20). Évite les unités (1800W, 18V). */
export function extractReference(name: string): string {
  const tokens = String(name).toUpperCase().match(/[A-Z0-9][A-Z0-9-]{4,}/g) ?? []
  let best = ''
  for (const raw of tokens) {
    const t = raw.replace(/-/g, '')
    const letters = (t.match(/[A-Z]/g) ?? []).length
    const digits = (t.match(/\d/g) ?? []).length
    if (t.length >= 6 && t.length <= 24 && letters >= 2 && digits >= 2 && t.length > best.length) best = t
  }
  return best
}

interface Keys { ean: string; ref: string; name: string }
function keysOf(row: Record<string, unknown>, c: ComparePricesConfig): Keys {
  const nameVal = String(row[c.nameColumn] ?? '')
  return {
    ean: String(row[c.eanColumn] ?? '').replace(/\D/g, '').slice(0, 13),
    ref: (c.referenceColumn && String(row[c.referenceColumn] ?? '')) || extractReference(nameVal),
    name: normName(nameVal),
  }
}

interface CompetitorMatch { site: string; price: number }

export interface CompareResult {
  columns: ExcelColumn[]
  rows: ExcelRow[]
  sites: string[]
  matched: number
}

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
  const push = (m: Map<string, CompetitorMatch[]>, key: string, site: string, price: number) => {
    if (!key) return
    const list = m.get(key) ?? []
    const found = list.find((x) => x.site === site)
    if (found) { if (price < found.price) found.price = price }
    else list.push({ site, price })
    m.set(key, list)
  }
  for (const row of competitorRows) {
    const site = String(row[c.siteColumn] ?? '').trim() || 'concurrent'
    const price = parsePrice(row[c.priceColumn])
    if (!compSites.includes(site)) compSites.push(site)
    if (!(Number.isFinite(price) && price > 0)) continue
    const k = keysOf(row, c)
    push(byEan, k.ean, site, price)
    push(byRef, k.ref, site, price)
    push(byName, k.name, site, price)
  }

  const priceCols = compSites.map((s) => ({ site: s, key: `prix_${slug(s)}` }))
  const columns: ExcelColumn[] = [
    { key: 'produit', label: 'Produit', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 320 },
    { key: 'reference', label: 'Réf.', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 },
    { key: 'ean', label: 'EAN', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 130 },
    { key: 'source', label: 'Source', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 140 },
    { key: 'prix_source', label: 'Prix source', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 110 },
    ...priceCols.map((c2) => ({
      key: c2.key, label: `Prix ${c2.site}`, fieldType: 'number' as const, detectedType: 'number' as const,
      isPrimary: false, width: 120,
    })),
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
    // Concurrents appariés : EAN puis référence puis nom (premier non vide).
    const comp = (k.ean && byEan.get(k.ean)) || (k.ref && byRef.get(k.ref)) || (k.name && byName.get(k.name)) || []

    const r: ExcelRow = {
      _id: `cmp_${id++}`,
      produit: nameVal,
      reference: k.ref,
      ean: k.ean,
      source: sourceSite,
      prix_source: Number.isFinite(srcPrice) && srcPrice > 0 ? String(srcPrice) : '',
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

  return { columns, rows: out, sites: compSites, matched }
}

const comparePricesNode: NodeSpec<ComparePricesConfig, ComparePricesInputs, ComparePricesOutputs> = {
  type: 'compare-prices',
  category: 'logic',
  label: 'Comparer les prix',
  description:
    'Compare les produits d’une SOURCE aux mêmes produits chez des CONCURRENTS (deux entrées). ' +
    'Sortie : une ligne par produit source (tous conservés), prix par concurrent, écart et position. ' +
    'Appariement EAN → code modèle → nom. Les deux entrées acceptent une page liste (URL) ou un import Excel/Sheets.',
  icon: Scale,
  inputs: [
    { name: 'source', type: 'sheet', required: true },
    { name: 'concurrents', type: 'sheet', required: true },
  ],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    { name: 'nameColumn', kind: 'columnRef', label: 'Colonne Nom', default: 'name' },
    { name: 'priceColumn', kind: 'columnRef', label: 'Colonne Prix', default: 'price' },
    { name: 'eanColumn', kind: 'columnRef', label: 'Colonne EAN', default: 'ean', help: 'Clé d’appariement prioritaire.' },
    { name: 'referenceColumn', kind: 'columnRef', label: 'Colonne Référence', default: '', help: 'Vide = code modèle déduit du nom.' },
    { name: 'siteColumn', kind: 'columnRef', label: 'Colonne Site', default: 'site', help: 'Identifie source et concurrents.' },
    { name: 'onlyMatched', kind: 'checkbox', label: 'Seulement les produits trouvés chez un concurrent', default: false },
  ],
  defaultConfig: {
    nameColumn: 'name', priceColumn: 'price', eanColumn: 'ean',
    referenceColumn: '', siteColumn: 'site', onlyMatched: false,
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
    const { columns, rows, sites, matched } = compareSourceToCompetitors(sourceRows, competitorRows, config)
    ctx.log('info', `${rows.length} produit(s) source — ${matched} apparié(s) chez ${sites.length} concurrent(s) : ${sites.join(', ') || '—'}.`)
    return { sheet: { name: 'Comparaison de prix', columns, rows, taxonomy: [] } }
  },
}

nodeRegistry.register(comparePricesNode)
