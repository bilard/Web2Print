// Les trois sources « veille tarifaire » du module BI. PUR : ni React, ni Firestore, ni i18n
// — le chargement vit dans `hooks/useWatchData.ts`, ce module ne fait que DÉCRIRE.
//
// ⚠⚠ Trois sources et non une, parce que leur COÛT diffère radicalement (cf. spec lot 2, D2
// et l'en-tête de `priceWatch/explorer/useSiteExplorer.ts`) :
//   `watch.summary` — le rapport `reports/latest`, UN document, instantané ;
//   `watch.catalog` — le catalogue source (115 814 produits chez F1), relu par TRANCHES ;
//   `watch.site`    — les fiches d'UN concurrent, plusieurs Mo, un seul site en mémoire.
// Les fondre en une seule source ferait payer le coût du catalogue à qui ne veut qu'un
// compteur de concurrents.
//
// ⚠⚠ Aucune mesure ne se replie sur zéro : un groupe sans le moindre prix comparé n'a PAS
// un écart de 0 % — « 0 % » se lit « aligné sur le marché », soit le contraire de « aucun
// prix comparé ». Ces mesures rendent `null`, que `formatMeasure` affiche « — ».
//
// ⚠ Les champs numériques (écart, prix, remise) sont AUSSI exposés en dimensions : le moteur
// sait en dériver toutes les agrégations que leur type autorise (`resolveMeasure`), sans
// qu'aucune ne soit écrite ici.
import type { CompetitorStat } from '@/features/priceWatch/catalog/report'
import type { SourceProduct } from '@/features/priceWatch/catalog/match'
import type { CompetitorListing } from '@/features/priceWatch/catalog/competitorListing'
import type { DataSource, Dimension, Measure, Row } from './types'

/** Somme d'une colonne numérique sur les lignes d'un groupe. Les valeurs illisibles sont
 *  ÉCARTÉES, jamais comptées zéro — une absence ne doit pas peser dans un total. */
function sumOf(rows: Row[], key: string): number {
  let total = 0
  for (const r of rows) {
    const n = Number(r[key])
    if (Number.isFinite(n)) total += n
  }
  return total
}

/** Mesure « somme d'une colonne », la forme que prennent tous les compteurs du rapport. */
function sumMeasure(id: string, labelKey: Measure['labelKey'], key: string): Measure {
  return { id, labelKey, format: 'int', aggregable: true, compute: (rows) => sumOf(rows, key) }
}

/** Les nombres LISIBLES d'une colonne. Les absents sont ÉCARTÉS, jamais comptés zéro. */
function numbersOf(rows: Row[], key: string): number[] {
  const out: number[] = []
  for (const r of rows) {
    const n = Number(r[key])
    if (r[key] != null && Number.isFinite(n)) out.push(n)
  }
  return out
}

/** Médiane, `null` si aucune valeur. ⚠ Effectif PAIR : moyenne des deux valeurs centrales. */
function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length / 2
  return s.length % 2 === 1 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2
}

/** Mesure « médiane d'une colonne » : jamais sommable entre groupes (spec, D1). */
function medianMeasure(
  id: string, labelKey: Measure['labelKey'], key: string, format: Measure['format'],
): Measure {
  return { id, labelKey, format, aggregable: false, compute: (rows) => median(numbersOf(rows, key)) }
}

/** Décompte des lignes du groupe. Même identifiant que la source PIM (`count`) : c'est la
 *  mesure que toute tuile propose par défaut, elle doit s'appeler pareil partout. */
const countMeasure: Measure = {
  id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true,
  compute: (rows) => rows.length,
}

/** Texte présent, ou `null`. ⚠ `null` fait un groupe « valeur absente » à part entière dans
 *  le moteur ; une chaîne vide se fondrait dans les valeurs renseignées. */
const text = (v: string | undefined | null): string | null => {
  const s = (v ?? '').trim()
  return s === '' ? null : s
}

/** Nombre lisible, ou `null`. ⚠ Jamais 0 : un prix absent pèserait dans les moyennes. */
const num = (v: number | undefined | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

// ── watch.summary — une ligne par concurrent, tirée de `reports/latest` ────────────────

/**
 * Stats par concurrent → lignes. Un seul document est lu : c'est la source à privilégier
 * pour tout ce qui se raisonne « par concurrent ».
 */
export function summaryRows(stats: CompetitorStat[]): Row[] {
  return stats.map((s) => ({
    siteId: s.siteId,
    domain: text(s.domain) ?? s.siteId,
    matched: s.matched,
    cheaper: s.cheaper,
    ruptures: s.ruptures,
    // ⚠⚠ MÉDIANE, jamais la moyenne : l'écart est un ratio non borné vers le haut, et trois
    // valeurs aberrantes suffisent à afficher « +313 % » (cf. `CompetitorStat.medGapPct`).
    // Repli sur la moyenne pour les rapports persistés AVANT l'introduction de la médiane —
    // c'est le seul chiffre qu'ils portent. `null` reste `null` : aucun écart chiffré.
    medGapPct: num(s.medGapPct) ?? num(s.avgGapPct),
    indexed: s.audit.indexed,
    pctPrice: s.audit.pctPrice,
  }))
}

const summaryDimensions: Dimension[] = [
  { id: 'domain', labelKey: 'bi.dim.competitor', kind: 'text', get: (r) => r.domain },
  // Champs NUMÉRIQUES : ce sont les mesures dérivées (médiane, moyenne, min, max) qui les
  // agrègent — voir l'en-tête pour la raison de ne pas les déclarer en mesures nommées.
  { id: 'medGapPct', labelKey: 'bi.measure.watchMedGap', kind: 'number', get: (r) => r.medGapPct },
  { id: 'pctPrice', labelKey: 'bi.measure.watchPctPrice', kind: 'number', get: (r) => r.pctPrice },
]

/**
 * Part de fiches portant un prix, sur l'ENSEMBLE des fiches du groupe.
 *
 * ⚠⚠ Pondérée par le nombre de fiches indexées, jamais une moyenne des pourcentages : un
 * concurrent à 12 fiches pèserait alors autant qu'un concurrent à 40 000. `null` — et non 0 —
 * quand le groupe n'indexe aucune fiche : une part de rien n'existe pas.
 */
const pctPriceMeasure: Measure = {
  id: 'watch.pctPrice', labelKey: 'bi.measure.watchPctPrice', format: 'pct', aggregable: false,
  compute: (rows) => {
    const indexed = sumOf(rows, 'indexed')
    if (indexed === 0) return null
    const withPrice = rows.reduce((n, r) => n + (Number(r.indexed) || 0) * (Number(r.pctPrice) || 0), 0)
    return withPrice / indexed
  },
}

export const watchSummarySource: DataSource = {
  id: 'watch.summary',
  labelKey: 'bi.source.watchSummary',
  engine: 'client',
  dimensions: summaryDimensions,
  measures: [
    countMeasure,
    sumMeasure('watch.matched', 'bi.measure.watchMatched', 'matched'),
    sumMeasure('watch.cheaper', 'bi.measure.watchCheaper', 'cheaper'),
    sumMeasure('watch.ruptures', 'bi.measure.watchRuptures', 'ruptures'),
    sumMeasure('watch.indexed', 'bi.measure.watchIndexed', 'indexed'),
    // ⚠⚠ MÉDIANE d'écarts : non agrégeable, sans quoi une tuile en ferait une somme et
    // afficherait « −312 % » pour vingt-quatre concurrents.
    medianMeasure('watch.medGap', 'bi.measure.watchMedGap', 'medGapPct', 'pct'),
    pctPriceMeasure,
  ],
}

// ── watch.catalog — le catalogue source du suivi, relu par tranches ────────────────────

/**
 * Produits du catalogue source → lignes.
 *
 * ⚠ `taxo` est un CHEMIN (`Famille › Sous-famille › Groupe produit`) : il est éclaté en
 * trois dimensions distinctes, sans quoi « Filtration › Air » et « Filtration › Huile »
 * seraient deux modalités étrangères l'une à l'autre et aucun regroupement par famille ne
 * serait possible.
 */
export function catalogRows(products: SourceProduct[]): Row[] {
  return products.map((p) => ({
    id: p.id,
    name: text(p.name),
    ref: text(p.ref),
    ref2: text(p.ref2),
    ean: text(p.ean),
    price: num(p.price),
    hasPrice: num(p.price) != null,
    hasRef: text(p.ref) != null || text(p.ref2) != null || text(p.ean) != null,
    famille: text(p.taxo?.[0]),
    sousFamille: text(p.taxo?.[1]),
    groupe: text(p.taxo?.[2]),
  }))
}

const catalogDimensions: Dimension[] = [
  { id: 'famille', labelKey: 'bi.dim.watchFamily', kind: 'text', get: (r) => r.famille },
  { id: 'sousFamille', labelKey: 'bi.dim.watchSubFamily', kind: 'text', get: (r) => r.sousFamille },
  { id: 'groupe', labelKey: 'bi.dim.watchGroup', kind: 'text', get: (r) => r.groupe },
  { id: 'name', labelKey: 'bi.dim.watchName', kind: 'text', get: (r) => r.name },
  { id: 'ref', labelKey: 'bi.dim.watchRef', kind: 'text', get: (r) => r.ref },
  { id: 'ref2', labelKey: 'bi.dim.watchRef2', kind: 'text', get: (r) => r.ref2 },
  { id: 'ean', labelKey: 'bi.dim.watchEan', kind: 'text', get: (r) => r.ean },
  { id: 'price', labelKey: 'bi.dim.watchPrice', kind: 'number', get: (r) => r.price },
  { id: 'hasPrice', labelKey: 'bi.dim.watchHasPrice', kind: 'bool', get: (r) => r.hasPrice },
  { id: 'hasRef', labelKey: 'bi.dim.watchHasRef', kind: 'bool', get: (r) => r.hasRef },
]

export const watchCatalogSource: DataSource = {
  id: 'watch.catalog',
  labelKey: 'bi.source.watchCatalog',
  engine: 'client',
  dimensions: catalogDimensions,
  measures: [
    { ...countMeasure, labelKey: 'bi.measure.watchProducts' },
    // ⚠ Le prix source est un TARIF hors taxes (convention ERP) : la médiane, pas la moyenne
    // — un catalogue mêle des articles à 2 € et des machines à 8 000 €.
    medianMeasure('watch.medianPrice', 'bi.measure.medianPrice', 'price', 'eur'),
  ],
}

// ── watch.site — les fiches collectées chez UN concurrent ──────────────────────────────

/**
 * Fiches d'un concurrent → lignes.
 *
 * ⚠ `netPrice` (prix d'achat professionnel) n'est PAS exposé à côté de `price` : les
 * confondre annonce des écarts de 150 % qui n'existent pas (cf. `CompetitorListing`).
 */
export function listingRows(listings: CompetitorListing[]): Row[] {
  return listings.map((l) => ({
    url: l.url,
    name: text(l.name),
    ref: text(l.ref),
    ean: text(l.gtin13),
    price: num(l.price),
    listPrice: num(l.listPrice),
    discountPct: num(l.discountPct),
    availability: text(l.availability),
    seller: text(l.seller),
    hasPrice: num(l.price) != null,
    hasRef: text(l.ref) != null || text(l.gtin13) != null,
  }))
}

const siteDimensions: Dimension[] = [
  { id: 'name', labelKey: 'bi.dim.watchName', kind: 'text', get: (r) => r.name },
  { id: 'ref', labelKey: 'bi.dim.watchRef', kind: 'text', get: (r) => r.ref },
  { id: 'ean', labelKey: 'bi.dim.watchEan', kind: 'text', get: (r) => r.ean },
  { id: 'price', labelKey: 'bi.dim.watchPrice', kind: 'number', get: (r) => r.price },
  { id: 'listPrice', labelKey: 'bi.dim.watchListPrice', kind: 'number', get: (r) => r.listPrice },
  { id: 'discountPct', labelKey: 'bi.dim.watchDiscount', kind: 'number', get: (r) => r.discountPct },
  { id: 'availability', labelKey: 'bi.dim.watchAvailability', kind: 'text', get: (r) => r.availability },
  { id: 'seller', labelKey: 'bi.dim.watchSeller', kind: 'text', get: (r) => r.seller },
  { id: 'hasPrice', labelKey: 'bi.dim.watchHasPrice', kind: 'bool', get: (r) => r.hasPrice },
  { id: 'hasRef', labelKey: 'bi.dim.watchHasRef', kind: 'bool', get: (r) => r.hasRef },
]

export const watchSiteSource: DataSource = {
  id: 'watch.site',
  labelKey: 'bi.source.watchSite',
  engine: 'client',
  dimensions: siteDimensions,
  measures: [
    { ...countMeasure, labelKey: 'bi.measure.watchListings' },
    // ⚠ Prix AFFICHÉ (TTC chez ces marchands B2C), jamais le prix d'achat professionnel.
    medianMeasure('watch.medianPrice', 'bi.measure.medianPrice', 'price', 'eur'),
  ],
}

/** Les trois sources, dans l'ordre où le sélecteur les présente (du moins cher au plus cher). */
export const WATCH_SOURCES: DataSource[] = [
  watchSummarySource, watchCatalogSource, watchSiteSource,
]
