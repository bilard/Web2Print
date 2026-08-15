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
// ⚠⚠ Chaque source déclare ses champs UNE fois (`WATCH_*_FIELDS`) et en tire ses dimensions
// ET ses mesures dérivées : toute colonne réellement portée par la donnée est donc groupable
// et, si elle est numérique, agrégeable (somme, moyenne, médiane, extrema, décomptes, taux
// de remplissage) sans qu'aucune mesure ne soit écrite à la main. Les sept mesures nommées
// qui subsistent sont celles qu'un moteur générique calculerait FAUX (part pondérée par les
// fiches indexées, médiane d'écarts) : elles restent déclarées, et affichées en premier.
//
// ⚠⚠ Un champ n'est exposé que s'il EXISTE dans la donnée relue. Deux informations souvent
// réclamées n'y sont pas et n'apparaissent donc nulle part : la DATE de la dernière passe de
// moisson (elle vit dans la méta live `competitors/{siteId}`, jamais dans `CompetitorStat`)
// et la date du rapport (`StoredReport.runAt`, que `summaryRows` ne reçoit pas). Les poser à
// zéro ou à « aujourd'hui » les rendrait crédibles ; elles seraient fausses.
import type { CompetitorStat, ProductRow } from '@/features/priceWatch/catalog/report'
import type { SourceProduct } from '@/features/priceWatch/catalog/match'
import type { CompetitorListing } from '@/features/priceWatch/catalog/competitorListing'
import { deriveMeasures, type DerivableColumn } from './deriveMeasures'
import type { DataSource, Dimension, FieldKind, Measure, MeasureFormat, Row } from './types'
import type { TranslationKey } from '@/lib/i18n'

/** Une colonne d'une source de veille, déclarée UNE fois : elle devient une dimension (on
 *  groupe par) et, selon son type, toutes les mesures que ce type autorise (on agrège).
 *  ⚠ `labelKey` et non `label` : ces colonnes viennent d'un type TypeScript, pas d'un
 *  fichier de l'utilisateur — leur nom est traduit, jamais lu dans la donnée. */
interface WatchField {
  key: string
  labelKey: TranslationKey
  kind: FieldKind
  /** Unité, quand elle est connue : elle décide des agrégations offertes (jamais de somme
   *  sur un taux) et de celles qui restent recomposables entre groupes. */
  format?: MeasureFormat
}

const dimensionsOf = (fields: WatchField[]): Dimension[] => fields.map((f) => ({
  id: f.key, labelKey: f.labelKey, kind: f.kind, format: f.format, get: (r: Row) => r[f.key],
}))

const derivableOf = (fields: WatchField[]): DerivableColumn[] => fields.map((f) => ({
  key: f.key, labelKey: f.labelKey, kind: f.kind, format: f.format,
}))

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

/** Booléen DÉCLARÉ, ou `null` quand le site ne dit rien. ⚠ « Non déclaré » n'est pas
 *  « faux » : les confondre ferait passer pour HT tous les prix dont on ignore le régime. */
const bool = (v: boolean | undefined | null): boolean | null =>
  typeof v === 'boolean' ? v : null

// ── watch.summary — une ligne par concurrent, tirée de `reports/latest` ────────────────

/**
 * Champs RÉELLEMENT portés par `CompetitorStat` : identité du site, appariement, écart,
 * audit des fiches collectées, moisson.
 *
 * ⚠⚠ `avgGapPct` n'y figure pas, alors qu'il existe : `report.ts` l'a explicitement retiré
 * de l'affichage (l'écart est un ratio non borné vers le haut, sa moyenne dérive — « +313 % »
 * relevé en prod sur 32 produits). Il ne sert plus que de REPLI à `medGapPct` pour les
 * rapports persistés avant la médiane, ci-dessous.
 */
const WATCH_SUMMARY_FIELDS: WatchField[] = [
  { key: 'domain', labelKey: 'bi.dim.competitor', kind: 'text' },
  { key: 'siteId', labelKey: 'bi.dim.watchSiteId', kind: 'text' },
  { key: 'matched', labelKey: 'bi.measure.watchMatched', kind: 'number' },
  { key: 'cheaper', labelKey: 'bi.measure.watchCheaper', kind: 'number' },
  { key: 'ruptures', labelKey: 'bi.measure.watchRuptures', kind: 'number' },
  { key: 'medGapPct', labelKey: 'bi.measure.watchMedGap', kind: 'number', format: 'pct' },
  { key: 'indexed', labelKey: 'bi.measure.watchIndexed', kind: 'number' },
  { key: 'pctPrice', labelKey: 'bi.measure.watchPctPrice', kind: 'number', format: 'pct' },
  { key: 'pctListPrice', labelKey: 'bi.dim.watchPctListPrice', kind: 'number', format: 'pct' },
  { key: 'pctStock', labelKey: 'bi.dim.watchPctStock', kind: 'number', format: 'pct' },
  { key: 'pctName', labelKey: 'bi.dim.watchPctName', kind: 'number', format: 'pct' },
  { key: 'pctImage', labelKey: 'bi.dim.watchPctImage', kind: 'number', format: 'pct' },
  { key: 'pctRef', labelKey: 'bi.dim.watchPctRef', kind: 'number', format: 'pct' },
  { key: 'harvestProgress', labelKey: 'bi.dim.watchProgress', kind: 'number', format: 'pct' },
  { key: 'harvestSweeps', labelKey: 'bi.dim.watchSweeps', kind: 'number' },
  { key: 'harvestLastMs', labelKey: 'bi.dim.watchLastMs', kind: 'number', format: 'ms' },
  { key: 'harvestCumulMs', labelKey: 'bi.dim.watchCumulMs', kind: 'number', format: 'ms' },
]

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
    pctListPrice: s.audit.pctListPrice,
    pctStock: s.audit.pctStock,
    pctName: s.audit.pctName,
    pctImage: s.audit.pctImage,
    pctRef: s.audit.pctRef,
    // ⚠ L'avancement est stocké en FRACTION (0..1) et exposé en POURCENTAGE : tout le module
    // rend ses taux sur 0-100 (`formatMeasure` divise par cent). Le laisser tel quel
    // afficherait « 1 % » pour un balayage terminé.
    // ⚠ La moisson est FACULTATIVE (`CompetitorStat.harvest`) : jamais mesurée = `null`, et
    // surtout pas 0, qui se lirait « n'a rien collecté » au lieu de « on n'en sait rien ».
    harvestProgress: s.harvest ? s.harvest.progress * 100 : null,
    harvestSweeps: num(s.harvest?.sweeps),
    harvestLastMs: num(s.harvest?.lastMs),
    harvestCumulMs: num(s.harvest?.cumulMs),
  }))
}

/**
 * Part de fiches portant un prix, sur l'ENSEMBLE des fiches du groupe.
 *
 * ⚠⚠ Pondérée par le nombre de fiches indexées, jamais une moyenne des pourcentages : un
 * concurrent à 12 fiches pèserait alors autant qu'un concurrent à 40 000. `null` — et non 0 —
 * quand le groupe n'indexe aucune fiche : une part de rien n'existe pas.
 *
 * ⚠ La dérivation propose aussi « Moyenne · Part de fiches avec prix », qui est cette
 * moyenne non pondérée. Les mesures DÉCLARÉES passant en tête de liste, c'est celle-ci que
 * l'on rencontre d'abord — et la seule qui réponde à « quelle part du relevé porte un prix ».
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
  dimensions: dimensionsOf(WATCH_SUMMARY_FIELDS),
  // ⚠⚠ Les mesures DÉCLARÉES d'abord, les dérivées ensuite : `AddTileMenu` et `newTile` se
  // replient sur `measures[0]` quand un identifiant n'existe plus. Ce repli doit rester le
  // décompte, valable partout — jamais une agrégation sur une colonne particulière.
  measures: [
    // ⚠ Une ligne = un CONCURRENT ici. Le décompte gardait le libellé par défaut, « Nombre
    // de produits » : la première mesure de la source, celle que toute tuile propose, se
    // trompait d'objet. L'identifiant, lui, reste `count` partout (repli du constructeur).
    { ...countMeasure, labelKey: 'bi.measure.watchCompetitors' },
    sumMeasure('watch.matched', 'bi.measure.watchMatched', 'matched'),
    sumMeasure('watch.cheaper', 'bi.measure.watchCheaper', 'cheaper'),
    sumMeasure('watch.ruptures', 'bi.measure.watchRuptures', 'ruptures'),
    sumMeasure('watch.indexed', 'bi.measure.watchIndexed', 'indexed'),
    // ⚠⚠ MÉDIANE d'écarts : non agrégeable, sans quoi une tuile en ferait une somme et
    // afficherait « −312 % » pour vingt-quatre concurrents. La dérivation, elle, n'offre
    // AUCUNE somme sur une colonne de pourcentage (`allowedAggregationsFor`) : l'invariant
    // tient des deux côtés.
    medianMeasure('watch.medGap', 'bi.measure.watchMedGap', 'medGapPct', 'pct'),
    pctPriceMeasure,
    ...deriveMeasures(derivableOf(WATCH_SUMMARY_FIELDS)),
  ],
}

// ── watch.catalog — le catalogue source du suivi, relu par tranches ────────────────────

/**
 * Niveaux de taxonomie exposés. QUATRE, comme la source PIM (`TAXO_LEVELS`) et comme la
 * taxonomie du suivi (Univers › Famille › Sous-famille › Groupe) : à trois, le dernier
 * niveau des catalogues qui en portent quatre disparaissait sans un mot.
 *
 * ⚠ Les trois premiers identifiants gardent leur nom historique (`famille`, `sousFamille`,
 * `groupe`) : ils sont PERSISTÉS dans les tuiles déjà enregistrées.
 */
const TAXO_FIELDS: WatchField[] = [
  { key: 'famille', labelKey: 'bi.dim.watchFamily', kind: 'text' },
  { key: 'sousFamille', labelKey: 'bi.dim.watchSubFamily', kind: 'text' },
  { key: 'groupe', labelKey: 'bi.dim.watchGroup', kind: 'text' },
  { key: 'taxo4', labelKey: 'bi.dim.watchTaxo4', kind: 'text' },
]

/** Toutes les colonnes d'un `SourceProduct`, celles de l'appariement comme celles
 *  d'affichage (description, visuel, textes d'avant enrichissement). */
const WATCH_CATALOG_FIELDS: WatchField[] = [
  ...TAXO_FIELDS,
  { key: 'name', labelKey: 'bi.dim.watchName', kind: 'text' },
  { key: 'ref', labelKey: 'bi.dim.watchRef', kind: 'text' },
  { key: 'ref2', labelKey: 'bi.dim.watchRef2', kind: 'text' },
  { key: 'ean', labelKey: 'bi.dim.watchEan', kind: 'text' },
  { key: 'price', labelKey: 'bi.dim.watchPrice', kind: 'number', format: 'eur' },
  { key: 'hasPrice', labelKey: 'bi.dim.watchHasPrice', kind: 'bool' },
  { key: 'hasRef', labelKey: 'bi.dim.watchHasRef', kind: 'bool' },
  { key: 'id', labelKey: 'bi.dim.watchProductId', kind: 'text' },
  { key: 'originRefs', labelKey: 'bi.dim.watchOriginRefs', kind: 'text' },
  { key: 'originRefsCount', labelKey: 'bi.dim.watchOriginRefsCount', kind: 'number' },
  { key: 'url', labelKey: 'bi.dim.watchUrl', kind: 'text' },
  { key: 'description', labelKey: 'bi.dim.watchDescription', kind: 'text' },
  { key: 'image', labelKey: 'bi.dim.watchImage', kind: 'text' },
  { key: 'nameSource', labelKey: 'bi.dim.watchNameSource', kind: 'text' },
  { key: 'descriptionSource', labelKey: 'bi.dim.watchDescriptionSource', kind: 'text' },
]

/**
 * Produits du catalogue source → lignes.
 *
 * ⚠ `taxo` est un CHEMIN (`Univers › Famille › Sous-famille › Groupe`) : il est éclaté en
 * dimensions distinctes, sans quoi « Filtration › Air » et « Filtration › Huile » seraient
 * deux modalités étrangères l'une à l'autre et aucun regroupement par famille ne serait
 * possible.
 */
export function catalogRows(products: SourceProduct[]): Row[] {
  return products.map((p) => ({
    id: p.id,
    name: text(p.name),
    ref: text(p.ref),
    ref2: text(p.ref2),
    ean: text(p.ean),
    // ⚠ Les références d'ORIGINE sont une LISTE (« remplace : 754-04038, 954-04038 »).
    // Rendues en texte joint pour se compter et se filtrer, et comptées à part : « combien
    // de références d'origine cette fiche cite-t-elle » est la question qui se pose.
    originRefs: text(p.originRefs?.join(' · ')),
    // ⚠ `null` — et non 0 — quand le champ est ABSENT : la plupart des fiches n'en citent
    // aucune, et un zéro partout ferait dire au taux de remplissage « 100 % renseigné » sur
    // un catalogue qui ne porte l'information nulle part. Une liste VIDE, elle, compte 0 :
    // là, on sait qu'aucune référence d'origine n'est citée.
    originRefsCount: p.originRefs ? p.originRefs.length : null,
    url: text(p.url),
    description: text(p.description),
    image: text(p.image),
    nameSource: text(p.nameSource),
    descriptionSource: text(p.descriptionSource),
    price: num(p.price),
    hasPrice: num(p.price) != null,
    hasRef: text(p.ref) != null || text(p.ref2) != null || text(p.ean) != null,
    famille: text(p.taxo?.[0]),
    sousFamille: text(p.taxo?.[1]),
    groupe: text(p.taxo?.[2]),
    taxo4: text(p.taxo?.[3]),
  }))
}

export const watchCatalogSource: DataSource = {
  id: 'watch.catalog',
  labelKey: 'bi.source.watchCatalog',
  engine: 'client',
  dimensions: dimensionsOf(WATCH_CATALOG_FIELDS),
  measures: [
    { ...countMeasure, labelKey: 'bi.measure.watchProducts' },
    // ⚠ Le prix source est un TARIF hors taxes (convention ERP) : la médiane, pas la moyenne
    // — un catalogue mêle des articles à 2 € et des machines à 8 000 €.
    medianMeasure('watch.medianPrice', 'bi.measure.medianPrice', 'price', 'eur'),
    ...deriveMeasures(derivableOf(WATCH_CATALOG_FIELDS)),
  ],
}

// ── watch.site — les fiches collectées chez UN concurrent ──────────────────────────────

/**
 * Toutes les colonnes d'un `CompetitorListing`.
 *
 * ⚠⚠ `netPrice` — le prix d'ACHAT du professionnel connecté — est exposé, mais sous un
 * libellé qui ne peut pas se confondre avec le prix de vente (« Prix d'achat pro. (HT) ») :
 * comparer un prix d'achat à un prix de vente annonce des écarts de 150 % qui n'existent
 * pas. Il était auparavant caché pour cette raison ; le taire ne protégeait de rien — le
 * champ existe, il finissait par être reconstruit ailleurs, sans l'avertissement.
 */
const WATCH_SITE_FIELDS: WatchField[] = [
  { key: 'name', labelKey: 'bi.dim.watchName', kind: 'text' },
  { key: 'ref', labelKey: 'bi.dim.watchRef', kind: 'text' },
  { key: 'ean', labelKey: 'bi.dim.watchEan', kind: 'text' },
  { key: 'price', labelKey: 'bi.dim.watchPrice', kind: 'number', format: 'eur' },
  { key: 'listPrice', labelKey: 'bi.dim.watchListPrice', kind: 'number', format: 'eur' },
  { key: 'discountPct', labelKey: 'bi.dim.watchDiscount', kind: 'number', format: 'pct' },
  { key: 'availability', labelKey: 'bi.dim.watchAvailability', kind: 'text' },
  { key: 'seller', labelKey: 'bi.dim.watchSeller', kind: 'text' },
  { key: 'hasPrice', labelKey: 'bi.dim.watchHasPrice', kind: 'bool' },
  { key: 'hasRef', labelKey: 'bi.dim.watchHasRef', kind: 'bool' },
  { key: 'netPrice', labelKey: 'bi.dim.watchNetPrice', kind: 'number', format: 'eur' },
  { key: 'advisedPrice', labelKey: 'bi.dim.watchAdvisedPrice', kind: 'number', format: 'eur' },
  { key: 'currency', labelKey: 'bi.dim.watchCurrency', kind: 'text' },
  { key: 'taxIncluded', labelKey: 'bi.dim.watchTaxIncluded', kind: 'bool' },
  { key: 'url', labelKey: 'bi.dim.watchUrl', kind: 'text' },
  { key: 'image', labelKey: 'bi.dim.watchImage', kind: 'text' },
  { key: 'enriched', labelKey: 'bi.dim.watchEnriched', kind: 'bool' },
]

/** Fiches d'un concurrent → lignes. */
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
    // ⚠⚠ Prix d'ACHAT professionnel : jamais comparable au prix de vente ci-dessus.
    netPrice: num(l.netPrice),
    advisedPrice: num(l.advisedPrice),
    currency: text(l.currency),
    // ⚠ Régime de TVA DÉCLARÉ par le site : absent = inconnu, jamais « HT ».
    taxIncluded: bool(l.taxIncluded),
    image: text(l.image),
    // ⚠ « La fiche a été OUVERTE par la passe d'enrichissement », pas « elle a livré un
    // prix d'achat » : c'est la question à laquelle ce drapeau répond (cf. `enriched`).
    enriched: bool(l.enriched),
    hasPrice: num(l.price) != null,
    hasRef: text(l.ref) != null || text(l.gtin13) != null,
  }))
}

export const watchSiteSource: DataSource = {
  id: 'watch.site',
  labelKey: 'bi.source.watchSite',
  engine: 'client',
  dimensions: dimensionsOf(WATCH_SITE_FIELDS),
  measures: [
    { ...countMeasure, labelKey: 'bi.measure.watchListings' },
    // ⚠ Prix AFFICHÉ (TTC chez ces marchands B2C), jamais le prix d'achat professionnel.
    medianMeasure('watch.medianPrice', 'bi.measure.medianPrice', 'price', 'eur'),
    ...deriveMeasures(derivableOf(WATCH_SITE_FIELDS)),
  ],
}


/**
 * Le PRODUIT apparié : mon prix face au meilleur prix concurrent.
 *
 * ⚠⚠ La seule source de veille à la maille PRODUIT — les deux autres décrivent les
 * concurrents (`watch.summary`) ou le catalogue brut (`watch.catalog`). Sans elle, une
 * question aussi simple que « quels produits vends-je plus cher que le marché ? » n'avait
 * aucune source capable d'y répondre, et le tableau composé par prompt répondait à côté :
 * par concurrent, faute de mieux.
 */
const WATCH_PRODUCTS_FIELDS: WatchField[] = [
  { key: 'name', labelKey: 'bi.dim.watchName', kind: 'text' },
  { key: 'reference', labelKey: 'bi.dim.watchRef', kind: 'text' },
  { key: 'ean', labelKey: 'bi.dim.watchEan', kind: 'text' },
  { key: 'famille', labelKey: 'bi.dim.taxo1', kind: 'text' },
  { key: 'position', labelKey: 'bi.dim.watchPosition', kind: 'text' },
  { key: 'cheapest', labelKey: 'bi.dim.watchCheapestSite', kind: 'text' },
  { key: 'undercut', labelKey: 'bi.dim.watchUndercut', kind: 'bool' },
  { key: 'myPriceHt', labelKey: 'bi.dim.watchMyPrice', kind: 'number', format: 'eur' },
  { key: 'minPriceHt', labelKey: 'bi.dim.watchMinPrice', kind: 'number', format: 'eur' },
  { key: 'gapEur', labelKey: 'bi.dim.watchGapEur', kind: 'number', format: 'eur' },
  { key: 'gapPct', labelKey: 'bi.dim.watchGapPct', kind: 'number', format: 'pct' },
  { key: 'pricedCompetitors', labelKey: 'bi.dim.watchPricedCount', kind: 'number' },
  { key: 'url', labelKey: 'bi.dim.watchUrl', kind: 'text' },
]

/**
 * Produits appariés → lignes.
 *
 * ⚠⚠ `gapEur` et `gapPct` sont l'écart de MON prix au MEILLEUR prix concurrent, positif
 * quand je suis plus cher. `bestGapPct` du rapport dit l'inverse (l'écart du concurrent vu
 * de moi, négatif quand il est moins cher) : le retourner ici évite qu'un « top des écarts »
 * classe à l'envers, ce qui ne se verrait pas.
 * ⚠ Un produit sans aucun prix concurrent garde `null` partout plutôt que zéro : il n'est
 * pas « à égalité », il est incomparable.
 */
export function productRows(products: ProductRow[]): Row[] {
  return products.map((p) => {
    const priced = p.competitors.filter((c) => c.priceHt != null)
    const best = priced.reduce<number | null>(
      (min, c) => (min == null || (c.priceHt as number) < min ? (c.priceHt as number) : min), null)
    const cheapest = best == null
      ? null
      : priced.find((c) => c.priceHt === best)?.domain ?? null
    const gapEur = p.myPriceHt != null && best != null
      ? Math.round((p.myPriceHt - best) * 100) / 100
      : null
    return {
      name: text(p.name),
      reference: text(p.reference),
      ean: text(p.ean),
      famille: text(p.famille),
      // Trois états nommés, comme le cockpit : c'est la lecture que l'acheteur fait.
      position: best == null
        ? null
        : p.undercut ? 'Concurrent moins cher' : (p.bestGapPct ?? 0) > 0 ? 'Je suis moins cher' : 'Aligné',
      cheapest,
      undercut: bool(p.undercut),
      myPriceHt: num(p.myPriceHt),
      minPriceHt: best,
      gapEur,
      gapPct: p.bestGapPct == null ? null : -p.bestGapPct,
      pricedCompetitors: priced.length,
      url: text(p.sourceUrl),
    }
  })
}

const watchProductsSource: DataSource = {
  id: 'watch.products',
  labelKey: 'bi.source.watchProducts',
  engine: 'client',
  dimensions: dimensionsOf(WATCH_PRODUCTS_FIELDS),
  measures: [
    { ...countMeasure, labelKey: 'bi.measure.watchMatchedProducts' },
    ...deriveMeasures(derivableOf(WATCH_PRODUCTS_FIELDS)),
  ],
}

/** Les sources, dans l'ordre où le sélecteur les présente (du moins cher au plus cher).
 *  ⚠ `watch.products` suit la synthèse : toutes deux se lisent dans le rapport déjà chargé,
 *  quand le catalogue et les fiches d'un site demandent une relecture par tranches. */
export const WATCH_SOURCES: DataSource[] = [
  watchSummarySource, watchProductsSource, watchCatalogSource, watchSiteSource,
]
