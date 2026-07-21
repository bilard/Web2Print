// src/features/priceWatch/dashboard/analytics.ts
// Dérivations analytiques du cockpit Veille tarifaire. PUR (sans React, testable).
//
// ⚠ Garde-fou `truncated` : `report.products` est RANGÉ par écart le plus négatif puis
// PLAFONNÉ à 1000 (cf. reportStore). Donc toute stat recalculée à partir de
// `products[].competitors[]` (distribution, heatmap, médianes, scatter) est BIAISÉE vers
// les produits les moins bien positionnés quand `truncated=true`. Les métriques FIABLES
// en toute circonstance sont `report.kpis` (headline) et `byCompetitor.avgGapPct`. Le
// FILTRE global ne touche QUE les blocs dérivés — les headline restent globaux (kpis).
import type { StoredReport, KpiHistoryPoint } from '../reportStore'
import type { ProductRow, ReportKpis } from '../catalog/report'

type Cell = ProductRow['competitors'][number]
type Tone = 'cheaper' | 'aligned' | 'dearer'

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
const familyKey = (f: string | null): string => (f && f.trim()) || 'Autres'

// --- Filtre global BI ---

export interface CockpitFilter {
  q: string
  famille: string // 'all' | nom de famille
  position: 'all' | Tone
  competitor: string // 'all' | siteId
}

export const EMPTY_FILTER: CockpitFilter = { q: '', famille: 'all', position: 'all', competitor: 'all' }

function isFilterActive(f: CockpitFilter): boolean {
  return !!f.q.trim() || f.famille !== 'all' || f.position !== 'all' || f.competitor !== 'all'
}

export function filterProducts(products: ProductRow[], f: CockpitFilter): ProductRow[] {
  const needle = f.q.trim().toLowerCase()
  return products.filter((p) => {
    if (f.position !== 'all' && toneOf(p.bestGapPct) !== f.position) return false
    if (f.famille !== 'all' && familyKey(p.famille) !== f.famille) return false
    if (f.competitor !== 'all' && !p.competitors.some((c) => c.siteId === f.competitor)) return false
    if (needle && ![p.name, p.reference, p.ean].some((s) => s?.toLowerCase().includes(needle))) return false
    return true
  })
}

// --- Interfaces exposées ---

interface HistBin { label: string; lo: number; hi: number; count: number; tone: Tone }

export interface CompetitorAnalytics {
  siteId: string
  domain: string
  matched: number
  cheaper: number
  cheaperRate: number
  ruptures: number
  avgGapPct: number | null
  medianGapPct: number | null
  minGapPct: number | null
  maxGapPct: number | null
}

interface FamilyStat { famille: string; products: number; undercut: number; avgGapPct: number | null }
interface HeatCell { avgGapPct: number | null; n: number }
interface Opportunity {
  id: string; name: string; reference: string | null; famille: string | null
  myPriceHt: number | null; minPriceHt: number | null; minDomain: string | null
  gapPct: number | null; gapEur: number | null
}
interface ScatterPoint { x: number; y: number; tone: Tone; name: string }

export interface TableRow {
  id: string; name: string; reference: string | null; ean: string | null; famille: string | null
  myPriceHt: number | null; bestGapPct: number | null; tone: Tone | null; nComp: number
  gapBySite: Record<string, number | null>; priceBySite: Record<string, number | null>
  urlBySite: Record<string, string | null> // fiche concurrent (pour vérifier le prix en 1 clic)
}

export interface Cockpit {
  kpis: ReportKpis
  truncated: boolean
  totalMatched: number
  runAt: number
  competitorsCount: number
  // vue filtrée
  filterActive: boolean
  filteredCount: number
  totalCount: number
  // Headline FIABLE (kpis, jamais filtré)
  priceHoldPct: number | null
  exposedPct: number | null
  // Recalc depuis products (filtrés) — biais truncated marqué en UI
  gapValues: number[]
  histogram: HistBin[]
  medianGapPct: number | null
  meanGapPct: number | null
  competitors: CompetitorAnalytics[]
  families: FamilyStat[]
  familyKeys: string[]
  /** Familles du catalogue COMPLET (non filtré) pour la navigation — stable au filtrage. */
  allFamilies: { famille: string; count: number; undercut: number }[]
  heatmap: Record<string, Record<string, HeatCell>>
  opportunities: Opportunity[]
  totalGapEur: number
  scatter: ScatterPoint[]
  tableRows: TableRow[]
}

const HIST_EDGES = [-30, -20, -10, -ALIGN_BAND, ALIGN_BAND, 10, 20, 30]

function buildHistogram(values: number[]): HistBin[] {
  const bounds = [-Infinity, ...HIST_EDGES, Infinity]
  const bins: HistBin[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i], hi = bounds[i + 1]
    const center = lo === -Infinity ? hi - 1 : hi === Infinity ? lo + 1 : (lo + hi) / 2
    const label = lo === -Infinity ? `< ${hi}%` : hi === Infinity ? `> ${lo}%` : `${lo} à ${hi}%`
    bins.push({ label, lo, hi, count: 0, tone: toneOf(center) ?? 'aligned' })
  }
  for (const v of values) {
    let idx = bounds.findIndex((_, i) => i < bounds.length - 1 && v > bounds[i] && v <= bounds[i + 1])
    if (idx < 0) idx = v <= bounds[1] ? 0 : bins.length - 1
    bins[idx].count++
  }
  return bins
}

export function buildTableRows(products: ProductRow[]): TableRow[] {
  return products.map((p) => {
    const gapBySite: Record<string, number | null> = {}
    const priceBySite: Record<string, number | null> = {}
    const urlBySite: Record<string, string | null> = {}
    for (const c of p.competitors) { gapBySite[c.siteId] = c.gapPct; priceBySite[c.siteId] = c.priceHt; urlBySite[c.siteId] = c.url || null }
    return {
      id: p.id, name: p.name, reference: p.reference, ean: p.ean, famille: p.famille,
      myPriceHt: p.myPriceHt, bestGapPct: p.bestGapPct, tone: toneOf(p.bestGapPct),
      nComp: p.competitors.length, gapBySite, priceBySite, urlBySite,
    }
  })
}

const csvCell = (v: string | number | null): string => {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Export CSV (séparateur `;`, décimales FR) : produit + écart par concurrent. */
export function rowsToCsv(rows: TableRow[], competitors: { siteId: string; domain: string }[]): string {
  const head = ['Référence', 'EAN', 'Produit', 'Famille', 'Mon prix HT', 'Meilleur écart %', ...competitors.map((c) => `${c.domain} (prix HT)`)]
  const dec = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
  const lines = rows.map((r) =>
    [csvCell(r.reference), csvCell(r.ean), csvCell(r.name), csvCell(r.famille ?? ''), dec(r.myPriceHt), dec(r.bestGapPct),
      ...competitors.map((c) => dec(r.priceBySite[c.siteId] ?? null))].join(';'),
  )
  return [head.join(';'), ...lines].join('\n')
}

export function buildCockpit(report: StoredReport, filter: CockpitFilter = EMPTY_FILTER, maxFamilies = 8): Cockpit {
  const { kpis, byCompetitor, products, totalMatched, truncated, runAt, sites } = report
  const active = isFilterActive(filter)
  const view = active ? filterProducts(products, filter) : products

  // Headline TOUJOURS depuis kpis (global, non biaisé, jamais filtré).
  const priceHoldPct = kpis.comparisons > 0 ? ((kpis.aligned + kpis.dearerThanMe) / kpis.comparisons) * 100 : null
  const exposedPct = kpis.products > 0 ? (kpis.productsUndercut / kpis.products) * 100 : null

  // Cellules chiffrées de la VUE.
  const cells: { p: ProductRow; c: Cell }[] = []
  for (const p of view) for (const c of p.competitors) if (c.gapPct != null) cells.push({ p, c })
  const gapValues = cells.map((x) => x.c.gapPct as number)

  // Par concurrent : agrégats depuis la vue (matched/cheaper/median) ; avgGap FIABLE
  // (byCompetitor) sans filtre, recalculé sur la vue si filtre actif.
  const bySite = new Map<string, { matched: number; cheaper: number; gaps: number[] }>()
  for (const p of view) for (const c of p.competitors) {
    const e = bySite.get(c.siteId) ?? { matched: 0, cheaper: 0, gaps: [] }
    e.matched++
    if (c.gapPct != null) { e.gaps.push(c.gapPct); if (c.gapPct < -ALIGN_BAND) e.cheaper++ }
    bySite.set(c.siteId, e)
  }
  const competitors: CompetitorAnalytics[] = byCompetitor
    .map((s) => {
      const e = bySite.get(s.siteId)
      const matched = active ? (e?.matched ?? 0) : s.matched
      const cheaper = active ? (e?.cheaper ?? 0) : s.cheaper
      const gaps = e?.gaps ?? []
      return {
        siteId: s.siteId, domain: s.domain, matched, cheaper,
        cheaperRate: matched > 0 ? cheaper / matched : 0,
        ruptures: s.ruptures,
        avgGapPct: active ? mean(gaps) : s.avgGapPct,
        medianGapPct: median(gaps),
        minGapPct: gaps.length ? Math.min(...gaps) : null,
        maxGapPct: gaps.length ? Math.max(...gaps) : null,
      }
    })
    .sort((a, b) => (a.avgGapPct ?? 0) - (b.avgGapPct ?? 0))

  // Familles (centré produit, sur la vue).
  const famAgg = new Map<string, { n: number; undercut: number; gaps: number[] }>()
  for (const p of view) {
    const k = familyKey(p.famille)
    const a = famAgg.get(k) ?? { n: 0, undercut: 0, gaps: [] }
    a.n++; if (p.undercut) a.undercut++; if (p.bestGapPct != null) a.gaps.push(p.bestGapPct)
    famAgg.set(k, a)
  }
  const families: FamilyStat[] = [...famAgg.entries()]
    .map(([famille, a]) => ({ famille, products: a.n, undercut: a.undercut, avgGapPct: mean(a.gaps) }))
    .sort((a, b) => b.products - a.products)
  // Familles du catalogue COMPLET (navigation + colonnes heatmap) — stables au filtrage.
  const allFamAgg = new Map<string, { count: number; undercut: number }>()
  for (const p of products) {
    const k = familyKey(p.famille)
    const e = allFamAgg.get(k) ?? { count: 0, undercut: 0 }
    e.count++; if (p.undercut) e.undercut++
    allFamAgg.set(k, e)
  }
  const allFamilies = [...allFamAgg.entries()].map(([famille, e]) => ({ famille, count: e.count, undercut: e.undercut })).sort((a, b) => b.count - a.count)
  const familyKeys = allFamilies.slice(0, maxFamilies).map((f) => f.famille)

  const heatAgg = new Map<string, Map<string, number[]>>()
  for (const { p, c } of cells) {
    const fk = familyKey(p.famille)
    if (!familyKeys.includes(fk)) continue
    const row = heatAgg.get(c.siteId) ?? new Map<string, number[]>()
    row.set(fk, [...(row.get(fk) ?? []), c.gapPct as number]); heatAgg.set(c.siteId, row)
  }
  const heatmap: Record<string, Record<string, HeatCell>> = {}
  for (const s of competitors) {
    heatmap[s.siteId] = {}
    for (const fk of familyKeys) {
      const arr = heatAgg.get(s.siteId)?.get(fk) ?? []
      heatmap[s.siteId][fk] = { avgGapPct: mean(arr), n: arr.length }
    }
  }

  // Opportunités (sur la vue) : je suis trop cher, triées par impact unitaire €.
  const opportunities: Opportunity[] = []
  let totalGapEur = 0
  for (const p of view) {
    if (!p.undercut) continue
    const priced = p.competitors.filter((c) => c.priceHt != null)
    const best = priced.reduce<Cell | null>((m, c) => (m == null || (c.priceHt as number) < (m.priceHt as number) ? c : m), null)
    const minPriceHt = best?.priceHt ?? null
    const gapEur = p.myPriceHt != null && minPriceHt != null ? Math.round((p.myPriceHt - minPriceHt) * 100) / 100 : null
    if (gapEur != null && gapEur > 0) totalGapEur += gapEur
    opportunities.push({
      id: p.id, name: p.name, reference: p.reference, famille: p.famille,
      myPriceHt: p.myPriceHt, minPriceHt, minDomain: best?.domain ?? null, gapPct: p.bestGapPct, gapEur,
    })
  }
  opportunities.sort((a, b) => (b.gapEur ?? -Infinity) - (a.gapEur ?? -Infinity))

  // Scatter prix × écart (un point par produit chiffré de la vue).
  const scatter: ScatterPoint[] = []
  for (const p of view) {
    if (p.myPriceHt == null || p.bestGapPct == null) continue
    scatter.push({ x: p.myPriceHt, y: p.bestGapPct, tone: toneOf(p.bestGapPct) ?? 'aligned', name: p.name })
  }

  return {
    kpis, truncated, totalMatched, runAt, competitorsCount: sites.length,
    filterActive: active, filteredCount: view.length, totalCount: products.length,
    priceHoldPct, exposedPct,
    gapValues, histogram: buildHistogram(gapValues), medianGapPct: median(gapValues), meanGapPct: mean(gapValues),
    competitors, families, familyKeys, allFamilies, heatmap, opportunities,
    totalGapEur: Math.round(totalGapEur * 100) / 100,
    scatter, tableRows: buildTableRows(view),
  }
}

// --- Séries temporelles ---

export function trendDelta(history: KpiHistoryPoint[]): { prev: KpiHistoryPoint; last: KpiHistoryPoint } | null {
  if (history.length < 2) return null
  return { prev: history[history.length - 2], last: history[history.length - 1] }
}

/** Séries scalaires pour les sparklines des KPIs (dérivées des points d'historique). */
export function sparkSeries(history: KpiHistoryPoint[]): { undercut: number[]; hold: number[]; products: number[] } {
  return {
    undercut: history.map((h) => h.productsUndercut),
    products: history.map((h) => h.products),
    hold: history.map((h) => {
      const comp = h.aligned + h.dearerThanMe + h.cheaperThanMe
      return comp > 0 ? Math.round(((h.aligned + h.dearerThanMe) / comp) * 100) : 0
    }),
  }
}

export interface CompetitorSeries { siteId: string; domain: string; points: (number | null)[] }

/** Écart moyen par concurrent dans le temps (depuis history[].comp). null = trou (jamais 0).
 *  Ne remonte que les points portant `comp` (écrits depuis la feature). */
export function competitorSeries(
  history: KpiHistoryPoint[],
  sites: { siteId: string; domain: string }[],
): { at: number[]; series: CompetitorSeries[] } {
  const pts = history.filter((h) => Array.isArray(h.comp))
  const at = pts.map((h) => h.at)
  const series = sites.map((s) => ({
    siteId: s.siteId,
    domain: s.domain,
    points: pts.map((h) => {
      const found = h.comp?.find((c) => c.s === s.siteId)
      return found ? found.g : null
    }),
  }))
  return { at, series }
}
