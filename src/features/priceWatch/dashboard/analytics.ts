// Dérivations analytiques du cockpit Veille tarifaire. PUR (sans React, testable).
//
// ⚠ Garde-fou `truncated` : `report.products` est RANGÉ par écart le plus négatif puis
// PLAFONNÉ à 1000 (cf. reportStore). Donc toute stat recalculée à partir de
// `products[].competitors[]` (distribution, heatmap, médianes, scatter) est BIAISÉE vers
// les produits les moins bien positionnés quand `truncated=true`. Les métriques FIABLES
// en toute circonstance sont `report.kpis` (headline) et `byCompetitor.avgGapPct`. Le
// FILTRE global ne touche QUE les blocs dérivés — les headline restent globaux (kpis).
import { median } from '../catalog/report'
import type { StoredReport } from '../reportStore'
import type { KpiHistoryPoint } from '../types'
import type { ProductRow, ReportKpis } from '../catalog/report'
import { foldText } from '../catalog/categories'

type Cell = ProductRow['competitors'][number]
type Tone = 'cheaper' | 'aligned' | 'dearer'

const ALIGN_BAND = 3

function toneOf(gapPct: number | null): Tone | null {
  if (gapPct == null) return null
  if (gapPct < -ALIGN_BAND) return 'cheaper'
  if (gapPct > ALIGN_BAND) return 'dearer'
  return 'aligned'
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

/** Recherche FULL-TEXT insensible aux accents/casse : chaque mot de la requête doit se
 *  retrouver dans le nom, la réf, l'EAN ou la famille (« courroie 5304 » = ET logique). */
export function matchesQuery(
  p: { name: string; reference: string | null; ean: string | null; famille: string | null },
  q: string,
): boolean {
  const tokens = foldText(q).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const hay = foldText([p.name, p.reference ?? '', p.ean ?? '', p.famille ?? ''].join(' '))
  return tokens.every((t) => hay.includes(t))
}

export function filterProducts(products: ProductRow[], f: CockpitFilter): ProductRow[] {
  return products.filter((p) => {
    if (f.position !== 'all' && toneOf(p.bestGapPct) !== f.position) return false
    if (f.famille !== 'all' && familyKey(p.famille) !== f.famille) return false
    if (f.competitor !== 'all' && !p.competitors.some((c) => c.siteId === f.competitor)) return false
    return matchesQuery(p, f.q)
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
  /** Fiche produit chez la source (null si non renseignée) — vérifier MON prix. */
  sourceUrl: string | null
  /** Fiche scrapée qui porte `minPriceHt` — vérifier LE prix concurrent le plus bas. */
  minUrl: string | null
}
interface ScatterPoint {
  x: number; y: number; tone: Tone; name: string
  /** Concurrent qui PORTE l'écart affiché (celui du gapPct le plus bas, = `bestGapPct`).
   *  Sans lui, le point disait « -55 % » sans dire face à qui. */
  domain: string | null
}

export interface TableRow {
  id: string; name: string; reference: string | null; ean: string | null; famille: string | null
  myPriceHt: number | null; bestGapPct: number | null; tone: Tone | null; nComp: number
  gapBySite: Record<string, number | null>; priceBySite: Record<string, number | null>
  ttcBySite: Record<string, number | null> // prix TTC AFFICHÉ sur le site concurrent (le HT en est dérivé)
  urlBySite: Record<string, string | null> // fiche concurrent (pour vérifier le prix en 1 clic)
  sourceUrl: string | null // fiche produit sur le site de la source
}

export interface Cockpit {
  kpis: ReportKpis
  truncated: boolean
  totalMatched: number
  runAt: number
  competitorsCount: number
  /** Concurrents ayant AU MOINS un produit apparié — ceux qui pèsent réellement dans les
   *  comparaisons. Les autres sont déclarés mais muets : un total seul les compte pareil. */
  competitorsMatched: number
  // vue filtrée
  filterActive: boolean
  filteredCount: number
  totalCount: number
  // Headline FIABLE (kpis, jamais filtré)
  priceHoldPct: number | null
  exposedPct: number | null
  /** Indice tarif base 100 vs médiane marché. 100 = au niveau du marché, > 100 = plus cher. */
  priceIndex: number | null
  /** Indice tarif vs le MEILLEUR prix marché (exposition au discounter). */
  priceIndexBest: number | null
  /** L'indice vient d'un repli calculé sur `products[]` (rapport antérieur à `kpis.priceIndex`)
   *  → BIAISÉ vers les produits les moins bien positionnés quand `truncated`. À signaler en UI. */
  priceIndexBiased: boolean
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

/**
 * Repli d'indice tarif pour les rapports écrits AVANT `kpis.priceIndex` : recalcul depuis
 * `products[]`. ⚠ Biaisé vers les moins bien positionnés quand `truncated` — l'appelant
 * lève `priceIndexBiased`. Même formule que `priceIndices` de catalog/report.ts.
 */
function priceIndexFallback(rows: ProductRow[]): { priceIndex: number | null; priceIndexBest: number | null } {
  const vsMedian: number[] = []
  const vsBest: number[] = []
  for (const r of rows) {
    if (r.myPriceHt == null || r.myPriceHt <= 0) continue
    const prices = r.competitors.map((c) => c.priceHt).filter((p): p is number => p != null && p > 0)
    if (prices.length === 0) continue
    const mkt = median(prices)
    if (mkt != null && mkt > 0) vsMedian.push((r.myPriceHt / mkt) * 100)
    vsBest.push((r.myPriceHt / Math.min(...prices)) * 100)
  }
  const round = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10)
  return { priceIndex: round(median(vsMedian)), priceIndexBest: round(median(vsBest)) }
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
    const ttcBySite: Record<string, number | null> = {}
    for (const c of p.competitors) { gapBySite[c.siteId] = c.gapPct; priceBySite[c.siteId] = c.priceHt; ttcBySite[c.siteId] = c.priceTtc; urlBySite[c.siteId] = c.url || null }
    return {
      id: p.id, name: p.name, reference: p.reference, ean: p.ean, famille: p.famille,
      myPriceHt: p.myPriceHt, bestGapPct: p.bestGapPct, tone: toneOf(p.bestGapPct),
      nComp: p.competitors.length, gapBySite, priceBySite, ttcBySite, urlBySite, sourceUrl: p.sourceUrl,
    }
  })
}

/** Index des pages scrapées, pour les listes qui ne portent que des IDENTIFIANTS (le
 *  journal des mouvements ne stocke que `pid`/`sid` — une URL par événement gonflerait
 *  le doc Firestore, déjà plafonné en octets). */
export interface ProductLinkIndex {
  /** `productId` → fiche produit chez la source. */
  source: Map<string, string>
  /** `productId|siteId` → fiche relevée chez le concurrent. */
  competitor: Map<string, string>
}

/**
 * Construit l'index depuis le rapport courant.
 *
 * ⚠ BIAIS DE SURVIE assumé : `report.products` est plafonné (`truncated`), donc un
 * mouvement portant sur un produit hors plafond ne trouvera pas d'URL. Le rendu retombe
 * alors sur du texte simple — jamais sur un lien deviné, qui enverrait vers la mauvaise
 * fiche et ferait exactement le contraire de « vérifier la justesse du prix ».
 */
export function buildLinkIndex(products: ProductRow[]): ProductLinkIndex {
  const source = new Map<string, string>()
  const competitor = new Map<string, string>()
  for (const p of products) {
    if (p.sourceUrl) source.set(p.id, p.sourceUrl)
    for (const c of p.competitors) if (c.url) competitor.set(`${p.id}|${c.siteId}`, c.url)
  }
  return { source, competitor }
}

const csvCell = (v: string | number | null): string => {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Export CSV (séparateur `;`, décimales FR) : produit + écart par concurrent. */
export interface FamilyGroup { famille: string; rows: TableRow[] }

/** Groupe les lignes du tableau par famille, familles en ordre alphabétique (fr).
 *  L'ordre des lignes DANS chaque groupe est préservé (tri fait par l'appelant). */
export function groupRowsByFamily(rows: TableRow[]): FamilyGroup[] {
  const by = new Map<string, TableRow[]>()
  for (const r of rows) {
    const k = familyKey(r.famille)
    const arr = by.get(k)
    if (arr) arr.push(r)
    else by.set(k, [r])
  }
  return [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
    .map(([famille, grouped]) => ({ famille, rows: grouped }))
}

export function rowsToCsv(rows: TableRow[], competitors: { siteId: string; domain: string }[]): string {
  // Les liens sont REJETÉS EN FIN de ligne : les colonnes chiffrées gardent leur ordre
  // (et leur index) pour qui a déjà des tableurs branchés sur cet export.
  const head = [
    'Référence', 'EAN', 'Produit', 'Famille', 'Mon prix HT', 'Meilleur écart %',
    ...competitors.map((c) => `${c.domain} (prix HT)`),
    'Fiche source', ...competitors.map((c) => `${c.domain} (lien)`),
  ]
  const dec = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
  const lines = rows.map((r) =>
    [csvCell(r.reference), csvCell(r.ean), csvCell(r.name), csvCell(r.famille ?? ''), dec(r.myPriceHt), dec(r.bestGapPct),
      ...competitors.map((c) => dec(r.priceBySite[c.siteId] ?? null)),
      csvCell(r.sourceUrl), ...competitors.map((c) => csvCell(r.urlBySite[c.siteId] ?? null))].join(';'),
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

  // Indice tarif : PRIORITÉ à la valeur pré-calculée par buildReport (catalogue complet,
  // non biaisée par le plafond). Repli sur `products[]` uniquement pour les rapports
  // antérieurs à ce champ — signalé par `priceIndexBiased`.
  const hasStoredIndex = kpis.priceIndex != null || kpis.priceIndexBest != null
  const fallbackIndex = hasStoredIndex ? null : priceIndexFallback(products)
  const priceIndex = hasStoredIndex ? (kpis.priceIndex ?? null) : (fallbackIndex?.priceIndex ?? null)
  const priceIndexBest = hasStoredIndex ? (kpis.priceIndexBest ?? null) : (fallbackIndex?.priceIndexBest ?? null)

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
        // Hors filtre, la médiane vient de l'agrégat SERVEUR (calculé sur TOUS les
        // produits appariés, avant le plafond PRODUCT_CAP) : recalculée ici elle
        // hériterait du biais décrit en tête de fichier. Repli sur l'échantillon pour
        // les rapports persistés avant `medGapPct`.
        medianGapPct: active ? median(gaps) : (s.medGapPct ?? median(gaps)),
        minGapPct: gaps.length ? Math.min(...gaps) : null,
        maxGapPct: gaps.length ? Math.max(...gaps) : null,
      }
    })
    // Trié sur la MÉDIANE : la moyenne d'un ratio non borné en haut classe en tête
    // un concurrent qui n'a que quelques appariements aberrants.
    .sort((a, b) => (a.medianGapPct ?? 0) - (b.medianGapPct ?? 0))

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
      sourceUrl: p.sourceUrl, minUrl: best?.url || null,
    })
  }
  opportunities.sort((a, b) => (b.gapEur ?? -Infinity) - (a.gapEur ?? -Infinity))

  // Scatter prix × écart (un point par produit chiffré de la vue).
  const scatter: ScatterPoint[] = []
  for (const p of view) {
    if (p.myPriceHt == null || p.bestGapPct == null) continue
    // `bestGapPct` = min(gapPct) sur les concurrents chiffrés (cf. report.ts) : on reprend
    // LA cellule de ce minimum, jamais « le moins cher » recalculé autrement — deux règles
    // différentes afficheraient un domaine incohérent avec le pourcentage du point.
    const holder = p.competitors.reduce<Cell | null>(
      (m, c) => (c.gapPct != null && (m == null || (c.gapPct as number) < (m.gapPct as number)) ? c : m), null)
    scatter.push({
      x: p.myPriceHt, y: p.bestGapPct, tone: toneOf(p.bestGapPct) ?? 'aligned', name: p.name,
      domain: holder?.domain ?? null,
    })
  }

  return {
    kpis, truncated, totalMatched, runAt, competitorsCount: sites.length,
    competitorsMatched: byCompetitor.filter((c) => c.matched > 0).length,
    filterActive: active, filteredCount: view.length, totalCount: products.length,
    priceHoldPct, exposedPct,
    priceIndex, priceIndexBest, priceIndexBiased: !hasStoredIndex && priceIndex != null,
    gapValues, histogram: buildHistogram(gapValues), medianGapPct: median(gapValues), meanGapPct: mean(gapValues),
    competitors, families, familyKeys, allFamilies, heatmap, opportunities,
    totalGapEur: Math.round(totalGapEur * 100) / 100,
    scatter, tableRows: buildTableRows(view),
  }
}

// --- Séries temporelles ---

/**
 * Rupture de PÉRIMÈTRE : au-delà de ce facteur, deux analyses ne portent pas sur
 * le même catalogue et ne se comparent pas.
 *
 * ⚠️ Sans ce garde-fou, un catalogue source réduit de 20 856 à 72 produits
 * affichait « ▼20 784 » sur les tuiles : un chiffre exact, une information
 * fausse — la variation mesurait le changement de périmètre, pas les prix. Les
 * KPI, eux, étaient justes ; c'est le rapprochement qui ne l'était pas.
 */
const SCOPE_RATIO = 2

/**
 * Queue d'historique COMPARABLE au dernier point : on remonte tant que le nombre
 * de produits reste dans un facteur 2. Une analyse sur un autre catalogue coupe
 * la série au lieu de la fausser.
 */
export function comparableTail(history: KpiHistoryPoint[]): KpiHistoryPoint[] {
  if (history.length === 0) return []
  const ref = history[history.length - 1].products
  if (ref <= 0) return history.slice(-1)
  const out: KpiHistoryPoint[] = []
  for (let i = history.length - 1; i >= 0; i--) {
    const p = history[i].products
    const ratio = p > 0 ? Math.max(p / ref, ref / p) : Infinity
    if (ratio > SCOPE_RATIO) break
    out.unshift(history[i])
  }
  return out
}

/** Deux derniers points COMPARABLES. `null` si le périmètre vient de changer :
 *  mieux vaut pas de variation qu'une variation trompeuse. */
export function trendDelta(history: KpiHistoryPoint[]): { prev: KpiHistoryPoint; last: KpiHistoryPoint } | null {
  const tail = comparableTail(history)
  if (tail.length < 2) return null
  return { prev: tail[tail.length - 2], last: tail[tail.length - 1] }
}

/** Série de l'INDICE TARIF dans le temps. Ne remonte que les points portant `pi`
 *  (analyses postérieures à la feature) — un point sans indice est un trou, pas un 0. */
export function priceIndexSeries(history: KpiHistoryPoint[]): { at: number[]; values: number[] } {
  const pts = history.filter((h) => h.pi != null)
  return { at: pts.map((h) => h.at), values: pts.map((h) => h.pi as number) }
}

/** Séries scalaires pour les sparklines des KPIs (dérivées des points d'historique). */
export function sparkSeries(history: KpiHistoryPoint[]): { undercut: number[]; hold: number[]; products: number[]; index: number[] } {
  // Même périmètre que les variations : une courbe qui plonge de 20 000 à 72 ne
  // raconte pas une baisse, mais un changement de catalogue.
  history = comparableTail(history)
  return {
    undercut: history.map((h) => h.productsUndercut),
    products: history.map((h) => h.products),
    index: history.filter((h) => h.pi != null).map((h) => h.pi as number),
    hold: history.map((h) => {
      const comp = h.aligned + h.dearerThanMe + h.cheaperThanMe
      return comp > 0 ? Math.round(((h.aligned + h.dearerThanMe) / comp) * 100) : 0
    }),
  }
}

export interface CompetitorSeries { siteId: string; domain: string; points: (number | null)[] }

/** Écart par concurrent dans le temps (depuis history[].comp) : MÉDIANE quand le point
 *  la porte (`gm`), moyenne pour les points antérieurs. null = trou (jamais 0).
 *
 *  ⚠ Filtré sur la PRÉSENCE de `pi`, pas seulement de `comp`. Les points écrits avant
 *  l'assainissement de l'axe temps portaient `comp` mais provenaient pour beaucoup de
 *  recalculs PARTIELS (relancés toutes les 4 min pendant une moisson) : l'écart moyen y
 *  bougeait parce que l'index grossissait, pas parce qu'un prix avait bougé. Tout point
 *  écrit depuis porte `pi` (toujours sérialisé, `?? null`) — c'est le marqueur
 *  « analyse complète » qui nettoie la courbe sans migration de données. */
export function competitorSeries(
  history: KpiHistoryPoint[],
  sites: { siteId: string; domain: string }[],
): { at: number[]; series: CompetitorSeries[] } {
  const pts = history.filter((h) => Array.isArray(h.comp) && 'pi' in h)
  const at = pts.map((h) => h.at)
  const series = sites.map((s) => ({
    siteId: s.siteId,
    domain: s.domain,
    points: pts.map((h) => {
      const found = h.comp?.find((c) => c.s === s.siteId)
      // `gm` (médiane) prime ; `g` (moyenne) ne sert qu'aux points écrits avant elle.
      return found ? (found.gm ?? found.g) : null
    }),
  }))
  return { at, series }
}
