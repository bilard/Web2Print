// src/features/priceWatch/dashboard/analytics.ts
// Dérivations analytiques du cockpit Veille tarifaire. PUR (sans React, testable).
//
// ⚠ Garde-fou `truncated` : `report.products` est RANGÉ par écart le plus négatif
// puis PLAFONNÉ à 1000 (cf. reportStore). Donc toute stat recalculée à partir de
// `products[].competitors[]` (distribution, heatmap, médianes) est BIAISÉE vers les
// produits les moins bien positionnés quand `truncated=true`. Les métriques FIABLES
// en toute circonstance sont `report.kpis` et `byCompetitor.avgGapPct` (agrégés
// serveur sur l'ENSEMBLE, avant plafonnement). Le champ `truncated` exposé ici doit
// être affiché à côté des stats recalculées pour ne pas mentir sur un vrai catalogue.
import type { StoredReport, KpiHistoryPoint } from '../reportStore'
import type { ProductRow, ReportKpis, CompetitorStat } from '../catalog/report'

type Cell = ProductRow['competitors'][number]
type Tone = 'cheaper' | 'aligned' | 'dearer'

/** Bande d'alignement (points de %) pour classer un écart en cheaper/aligned/dearer. */
const ALIGN_BAND = 3

function toneOf(gapPct: number | null): Tone | null {
  if (gapPct == null) return null
  if (gapPct < -ALIGN_BAND) return 'cheaper'
  if (gapPct > ALIGN_BAND) return 'dearer'
  return 'aligned'
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

// --- Interfaces exposées ---

interface HistBin {
  label: string
  lo: number
  hi: number
  count: number
  tone: Tone
}

export interface CompetitorAnalytics {
  siteId: string
  domain: string
  matched: number
  cheaper: number
  /** Part de produits appariés où CE concurrent est moins cher que moi (0..1). */
  cheaperRate: number
  ruptures: number
  avgGapPct: number | null // FIABLE (serveur, ensemble)
  medianGapPct: number | null // recalc (biaisé si truncated)
  minGapPct: number | null
  maxGapPct: number | null
}

interface FamilyStat {
  famille: string
  products: number
  undercut: number
  avgGapPct: number | null
}

interface HeatCell {
  avgGapPct: number | null
  n: number
}

interface Opportunity {
  id: string
  name: string
  reference: string | null
  famille: string | null
  myPriceHt: number | null
  minPriceHt: number | null
  minDomain: string | null
  gapPct: number | null // = bestGapPct (le plus négatif)
  /** Écart UNITAIRE € (mon prix HT − meilleur prix concurrent HT). PAS un revenu. */
  gapEur: number | null
}

export interface Cockpit {
  kpis: ReportKpis
  truncated: boolean
  totalMatched: number
  runAt: number
  competitorsCount: number

  // Headline FIABLE (depuis kpis, non biaisé)
  /** Part de comparaisons où je tiens le prix (aligné ou moins cher). % 0..100. */
  priceHoldPct: number | null
  /** Part de PRODUITS exposés (≥1 concurrent moins cher). % 0..100. */
  exposedPct: number | null

  // Recalc depuis products (marqué truncated)
  gapValues: number[]
  histogram: HistBin[]
  medianGapPct: number | null
  meanGapPct: number | null
  worstGapPct: number | null // plus négatif
  bestGapPct: number | null // plus positif

  competitors: CompetitorAnalytics[] // trié agressivité (avgGap asc)
  families: FamilyStat[] // trié n desc
  familyKeys: string[] // colonnes heatmap (familles retenues)
  heatmap: Record<string, Record<string, HeatCell>> // [siteId][familyKey]
  opportunities: Opportunity[] // je suis trop cher, trié impact desc
  totalGapEur: number // somme des écarts unitaires € (produits sous-cotés)
}

const HIST_EDGES = [-30, -20, -10, -ALIGN_BAND, ALIGN_BAND, 10, 20, 30]

function buildHistogram(values: number[]): HistBin[] {
  const edges = HIST_EDGES
  const bins: HistBin[] = []
  const bounds = [-Infinity, ...edges, Infinity]
  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i]
    const hi = bounds[i + 1]
    const center = lo === -Infinity ? hi - 1 : hi === Infinity ? lo + 1 : (lo + hi) / 2
    const tone = toneOf(center) ?? 'aligned'
    const label =
      lo === -Infinity ? `< ${hi}%` : hi === Infinity ? `> ${lo}%` : `${lo} à ${hi}%`
    bins.push({ label, lo, hi, count: 0, tone })
  }
  for (const v of values) {
    let idx = bounds.findIndex((b, i) => i < bounds.length - 1 && v > bounds[i] && v <= bounds[i + 1])
    if (idx < 0) idx = v <= bounds[1] ? 0 : bins.length - 1
    bins[idx].count++
  }
  return bins
}

const familyKey = (f: string | null): string => (f && f.trim()) || 'Autres'

export function buildCockpit(report: StoredReport, maxFamilies = 8): Cockpit {
  const { kpis, byCompetitor, products, totalMatched, truncated, runAt, sites } = report

  const priceHoldPct =
    kpis.comparisons > 0 ? ((kpis.aligned + kpis.dearerThanMe) / kpis.comparisons) * 100 : null
  const exposedPct = kpis.products > 0 ? (kpis.productsUndercut / kpis.products) * 100 : null

  // Toutes les cellules chiffrées (paires produit×concurrent).
  const cells: { p: ProductRow; c: Cell }[] = []
  for (const p of products) for (const c of p.competitors) if (c.gapPct != null) cells.push({ p, c })
  const gapValues = cells.map((x) => x.c.gapPct as number)

  // Par concurrent : avgGap FIABLE via byCompetitor ; médiane/min/max recalculés.
  const byGap = new Map<string, number[]>()
  for (const { c } of cells) {
    const arr = byGap.get(c.siteId) ?? []
    arr.push(c.gapPct as number)
    byGap.set(c.siteId, arr)
  }
  const competitors: CompetitorAnalytics[] = byCompetitor
    .map((s: CompetitorStat) => {
      const g = byGap.get(s.siteId) ?? []
      return {
        siteId: s.siteId,
        domain: s.domain,
        matched: s.matched,
        cheaper: s.cheaper,
        cheaperRate: s.matched > 0 ? s.cheaper / s.matched : 0,
        ruptures: s.ruptures,
        avgGapPct: s.avgGapPct,
        medianGapPct: median(g),
        minGapPct: g.length ? Math.min(...g) : null,
        maxGapPct: g.length ? Math.max(...g) : null,
      }
    })
    .sort((a, b) => (a.avgGapPct ?? 0) - (b.avgGapPct ?? 0)) // plus agressif (négatif) en tête

  // Par famille (centré produit).
  const famAgg = new Map<string, { n: number; undercut: number; gaps: number[] }>()
  for (const p of products) {
    const k = familyKey(p.famille)
    const a = famAgg.get(k) ?? { n: 0, undercut: 0, gaps: [] }
    a.n++
    if (p.undercut) a.undercut++
    if (p.bestGapPct != null) a.gaps.push(p.bestGapPct)
    famAgg.set(k, a)
  }
  const families: FamilyStat[] = [...famAgg.entries()]
    .map(([famille, a]) => ({ famille, products: a.n, undercut: a.undercut, avgGapPct: mean(a.gaps) }))
    .sort((a, b) => b.products - a.products)

  const familyKeys = families.slice(0, maxFamilies).map((f) => f.famille)

  // Heatmap concurrent × famille (moyenne des écarts cellule).
  const heatAgg = new Map<string, Map<string, number[]>>()
  for (const { p, c } of cells) {
    const fk = familyKey(p.famille)
    if (!familyKeys.includes(fk)) continue
    const row = heatAgg.get(c.siteId) ?? new Map<string, number[]>()
    const arr = row.get(fk) ?? []
    arr.push(c.gapPct as number)
    row.set(fk, arr)
    heatAgg.set(c.siteId, row)
  }
  const heatmap: Record<string, Record<string, HeatCell>> = {}
  for (const s of competitors) {
    heatmap[s.siteId] = {}
    const row = heatAgg.get(s.siteId)
    for (const fk of familyKeys) {
      const arr = row?.get(fk) ?? []
      heatmap[s.siteId][fk] = { avgGapPct: mean(arr), n: arr.length }
    }
  }

  // Opportunités : je suis trop cher (undercut), triées par impact unitaire €.
  const opportunities: Opportunity[] = []
  let totalGapEur = 0
  for (const p of products) {
    if (!p.undercut) continue
    const priced = p.competitors.filter((c) => c.priceHt != null)
    const best = priced.reduce<Cell | null>((m, c) => (m == null || (c.priceHt as number) < (m.priceHt as number) ? c : m), null)
    const minPriceHt = best?.priceHt ?? null
    const gapEur = p.myPriceHt != null && minPriceHt != null ? Math.round((p.myPriceHt - minPriceHt) * 100) / 100 : null
    if (gapEur != null && gapEur > 0) totalGapEur += gapEur
    opportunities.push({
      id: p.id,
      name: p.name,
      reference: p.reference,
      famille: p.famille,
      myPriceHt: p.myPriceHt,
      minPriceHt,
      minDomain: best?.domain ?? null,
      gapPct: p.bestGapPct,
      gapEur,
    })
  }
  opportunities.sort((a, b) => (b.gapEur ?? -Infinity) - (a.gapEur ?? -Infinity))

  return {
    kpis,
    truncated,
    totalMatched,
    runAt,
    competitorsCount: sites.length,
    priceHoldPct,
    exposedPct,
    gapValues,
    histogram: buildHistogram(gapValues),
    medianGapPct: median(gapValues),
    meanGapPct: mean(gapValues),
    worstGapPct: gapValues.length ? Math.min(...gapValues) : null,
    bestGapPct: gapValues.length ? Math.max(...gapValues) : null,
    competitors,
    families,
    familyKeys,
    heatmap,
    opportunities,
    totalGapEur: Math.round(totalGapEur * 100) / 100,
  }
}

/** Dernier point de tendance vs l'avant-dernier (pour deltas KPI). null si <2 points. */
export function trendDelta(history: KpiHistoryPoint[]): { prev: KpiHistoryPoint; last: KpiHistoryPoint } | null {
  if (history.length < 2) return null
  return { prev: history[history.length - 2], last: history[history.length - 1] }
}

// --- Tableau maître (une ligne par produit, colonnes concurrents) ---

export interface TableRow {
  id: string
  name: string
  reference: string | null
  ean: string | null
  famille: string | null
  myPriceHt: number | null
  bestGapPct: number | null
  tone: Tone | null
  nComp: number
  /** Écart % par siteId concurrent (null si non apparié / non chiffré). */
  gapBySite: Record<string, number | null>
  /** Prix HT concurrent par siteId (pour l'export/tooltip). */
  priceBySite: Record<string, number | null>
}

export function buildTableRows(products: ProductRow[]): TableRow[] {
  return products.map((p) => {
    const gapBySite: Record<string, number | null> = {}
    const priceBySite: Record<string, number | null> = {}
    for (const c of p.competitors) {
      gapBySite[c.siteId] = c.gapPct
      priceBySite[c.siteId] = c.priceHt
    }
    return {
      id: p.id,
      name: p.name,
      reference: p.reference,
      ean: p.ean,
      famille: p.famille,
      myPriceHt: p.myPriceHt,
      bestGapPct: p.bestGapPct,
      tone: toneOf(p.bestGapPct),
      nComp: p.competitors.length,
      gapBySite,
      priceBySite,
    }
  })
}

const csvCell = (v: string | number | null): string => {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Export CSV (séparateur `;`, décimales FR) : produit + prix + écart par concurrent. */
export function rowsToCsv(rows: TableRow[], competitors: { siteId: string; domain: string }[]): string {
  const head = ['Référence', 'EAN', 'Produit', 'Famille', 'Mon prix HT', 'Meilleur écart %', ...competitors.map((c) => `${c.domain} (écart %)`)]
  const lines = rows.map((r) =>
    [
      csvCell(r.reference), csvCell(r.ean), csvCell(r.name), csvCell(r.famille ?? ''),
      csvCell(r.myPriceHt == null ? '' : r.myPriceHt.toString().replace('.', ',')),
      csvCell(r.bestGapPct == null ? '' : String(r.bestGapPct).replace('.', ',')),
      ...competitors.map((c) => csvCell(r.gapBySite[c.siteId] == null ? '' : String(r.gapBySite[c.siteId]).replace('.', ','))),
    ].join(';'),
  )
  return [head.join(';'), ...lines].join('\n')
}
