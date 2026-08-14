// Source « produits du PIM » : ses colonnes sont DYNAMIQUES (elles viennent du schéma du
// projet), ses dimensions fixes sont la taxonomie et les dates.
import type { Product } from '@/features/pim/types'
import type { ExcelColumn, ExcelSheet, FieldTypeId } from '@/features/excel/types'
import type { DataSource, Dimension, FieldKind, Measure, Row } from './types'

/** Profondeur de taxonomie exposée en dimensions (cf. taxonomie à 4 niveaux). Exportée :
 *  `rowsFromSheet` (feuille active) doit compter les mêmes niveaux que `productToRow`. */
export const TAXO_LEVELS = 4

/**
 * Clés que le moteur pose LUI-MÊME sur chaque ligne et qu'une colonne de données ne doit
 * jamais occuper : identité, complétude, taxonomie.
 *
 * ⚠⚠ Une colonne nommée `_total` écrasait la complétude POSÉE APRÈS la copie des colonnes —
 * la mesure « Complétude » rendait alors un pourcentage faux, sans le moindre bruit. Un
 * chiffre faux est pire qu'une erreur : on refuse la ligne plutôt que de la mesurer de
 * travers.
 *
 * ⚠ Renommer ces clés (préfixe) était l'autre voie possible ; elle est écartée à dessein :
 * `taxo.1`…`taxo.4` sont des identifiants de dimension DÉJÀ PERSISTÉS dans les `QuerySpec`
 * enregistrées (cf. `taxoDimensions`), et les colonnes de feuille portent leur propre clé
 * telle quelle (`pimSourceFromSheet`). Les préfixer casserait toutes les tuiles en base.
 */
const RESERVED_ROW_KEYS: readonly string[] = [
  '_id', '_sku', '_createdAt', '_updatedAt', '_filled', '_total',
  ...Array.from({ length: TAXO_LEVELS }, (_, i) => `taxo.${i + 1}`),
]

/**
 * Lève si une colonne de données porte une clé réservée. Appelée par les DEUX fabriques de
 * lignes : `useTileData` attrape et la tuile affiche la cause, colonne nommée.
 */
export function assertNoReservedColumn(columns: string[]): void {
  const clash = columns.find((c) => RESERVED_ROW_KEYS.includes(c))
  if (clash) {
    throw new Error(
      `Colonne « ${clash} » réservée au moteur : renommez-la, sinon la complétude serait fausse.`,
    )
  }
}

/**
 * Produit → ligne plate consommable par le moteur.
 *
 * ⚠ `_filled` / `_total` sont calculés ICI, une fois, plutôt que dans chaque mesure : la
 * complétude se lit sur les colonnes DEMANDÉES, pas sur les clés présentes — un produit
 * sans le champ « poids » doit compter comme non renseigné, pas être ignoré.
 */
export function productToRow(p: Product, columns: string[]): Row {
  assertNoReservedColumn(columns)
  const row: Row = { _id: p._id, _sku: p.masterSku, _createdAt: p.createdAt, _updatedAt: p.updatedAt }
  let filled = 0
  for (const c of columns) {
    const v = p.fields[c]?.value ?? null
    row[c] = v
    if (v !== null && v !== undefined && String(v).trim() !== '') filled++
  }
  for (let i = 0; i < TAXO_LEVELS; i++) row[`taxo.${i + 1}`] = p.taxonomyPath[i] ?? null
  row._filled = filled
  row._total = columns.length
  return row
}

const taxoDimensions: Dimension[] = Array.from({ length: TAXO_LEVELS }, (_, i) => ({
  id: `taxo.${i + 1}`,
  labelKey: `bi.dim.taxo${i + 1}` as Dimension['labelKey'],
  kind: 'text' as const,
  get: (r: Row) => r[`taxo.${i + 1}`],
}))

const numbersOf = (rows: Row[], key: string): number[] =>
  rows.map((r) => Number(r[key])).filter((n) => Number.isFinite(n))

/** Mesures valables pour TOUTE ligne PIM, feuille ou produit master : elles ne dépendent
 *  que de `_filled`/`_total`, posés par `productToRow` et `rowsFromSheet` de la même façon. */
const baseMeasures: Measure[] = [
  { id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true,
    compute: (rows) => rows.length },
  // Complétude = champs renseignés / champs attendus, sur l'ensemble des lignes du groupe.
  { id: 'pim.completeness', labelKey: 'bi.measure.completeness', format: 'pct', aggregable: false,
    compute: (rows) => {
      const total = rows.reduce((n, r) => n + Number(r._total ?? 0), 0)
      if (total === 0) return 0
      return (rows.reduce((n, r) => n + Number(r._filled ?? 0), 0) / total) * 100
    } },
  { id: 'pim.filled', labelKey: 'bi.measure.filled', format: 'int', aggregable: true,
    compute: (rows) => rows.reduce((n, r) => n + Number(r._filled ?? 0), 0) },
]

/** ⚠⚠ Jamais de repli à zéro : sans `_updatedAt` (produit master uniquement — une feuille
 *  n'a pas cette notion), une ancienneté à 0 se lirait « mis à jour aujourd'hui », ce qui
 *  est faux. Réservée à `pimSource` ; absente de `pimSourceFromSheet`. */
const freshnessMeasure: Measure = {
  id: 'pim.freshnessDays', labelKey: 'bi.measure.freshness', format: 'float', aggregable: false,
  compute: (rows) => {
    const ages = numbersOf(rows, '_updatedAt').map((ts) => (Date.now() - ts) / 86_400_000)
    if (!ages.length) return 0
    const sorted = ages.sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  },
}

const dateDimensions: Dimension[] = [
  { id: '_createdAt', labelKey: 'bi.dim.createdAt', kind: 'date', get: (r) => r._createdAt },
  { id: '_updatedAt', labelKey: 'bi.dim.updatedAt', kind: 'date', get: (r) => r._updatedAt },
]

export const pimSource: DataSource = {
  id: 'pim.products',
  labelKey: 'bi.source.pim',
  engine: 'client',
  dimensions: [...taxoDimensions, ...dateDimensions],
  measures: [...baseMeasures, freshnessMeasure],
}

const NUMBER_FIELD_TYPES: FieldTypeId[] = ['number', 'currency', 'rating', 'percent', 'auto_number']
const DATE_FIELD_TYPES: FieldTypeId[] = ['date', 'duration']

/** Type de colonne DÉCLARÉ (`fieldType`, éventuellement corrigé par l'utilisateur) plutôt
 *  que redéduit des valeurs : c'est l'information qui fait autorité dans le module Données. */
function dimensionKindOf(col: ExcelColumn): FieldKind {
  if (DATE_FIELD_TYPES.includes(col.fieldType)) return 'date'
  if (NUMBER_FIELD_TYPES.includes(col.fieldType)) return 'number'
  if (col.fieldType === 'checkbox') return 'bool'
  return 'text'
}

/**
 * Source PIM branchée sur la feuille ACTIVE du module Données : ses dimensions sont les
 * colonnes RÉELLES de la feuille (libellé et type qui viennent de la donnée), plus la
 * taxonomie déjà exposée par `pimSource`. Ni `_createdAt`/`_updatedAt` ni
 * `pim.freshnessDays` : une feuille n'a pas cette notion (cf. `freshnessMeasure`).
 */
export function pimSourceFromSheet(sheet: ExcelSheet | null): DataSource {
  const columnDimensions: Dimension[] = (sheet?.columns ?? []).map((c) => ({
    id: c.key,
    labelKey: 'bi.dim.column',
    label: c.label,
    kind: dimensionKindOf(c),
    get: (r: Row) => r[c.key],
  }))
  return {
    ...pimSource,
    dimensions: [...columnDimensions, ...taxoDimensions],
    measures: baseMeasures,
  }
}

/**
 * Source PIM RÉELLEMENT utilisée par le moteur : la feuille active si elle porte des
 * colonnes, sinon le catalogue PIM déclaratif complet (avec dates et ancienneté).
 *
 * ⚠⚠ Point de décision UNIQUE, appelé à la fois par `useTileData` (pour le calcul) et par
 * `AddTileMenu` (pour la liste des dimensions/mesures proposées) : les faire diverger
 * proposerait des colonnes que le moteur ne connaît pas, et la tuile créée tomberait en
 * erreur (« Dimension inconnue pour cette source »).
 */
export function effectivePimSource(sheet: ExcelSheet | null): DataSource {
  return sheet && sheet.columns.length > 0 ? pimSourceFromSheet(sheet) : pimSource
}
