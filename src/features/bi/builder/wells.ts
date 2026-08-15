// Ce qu'une ZONE de dépôt contient, et combien elle peut en porter. PUR : ni React, ni i18n.
//
// ⚠⚠ Les cinq zones du volet n'existent PAS au contrat : `QuerySpec` ne connaît que
// `dimensions`, `measures` et `filters`. Ce module est la table de correspondance UNIQUE
// entre ce que l'utilisateur voit (Axe, Légende…) et ce que la tuile enregistre. Deux
// traductions divergentes de cette correspondance — une pour lire, une pour écrire —
// afficheraient une configuration qui n'est pas celle que le moteur calcule.
import { allowedAggregations } from '../registry/aggregations'
import type { DataSource, FieldKind } from '../registry/types'
import {
  isDerivedMeasure, measureKey,
  type Aggregation, type FilterClause, type MeasureRef, type Tile, type TileKind,
} from '../types'
import type { TranslationKey } from '@/lib/i18n'

export type WellId = 'axis' | 'values' | 'legend' | 'tooltips' | 'visualFilters'

/** Les cinq zones, dans l'ordre du volet. */
export const WELL_IDS: readonly WellId[] = ['axis', 'values', 'legend', 'tooltips', 'visualFilters']

/** Libellé de la zone au catalogue. */
export const WELL_LABEL_KEY: Record<WellId, TranslationKey> = {
  axis: 'bi.well.axis', values: 'bi.well.values', legend: 'bi.well.legend',
  tooltips: 'bi.well.tooltips', visualFilters: 'bi.well.visualFilters',
}

/** Ce qu'une puce du volet « Champs » emporte avec elle pendant le glissement. */
export interface DraggedField {
  /** `dimension` = une colonne de la donnée ; `measure` = une mesure du registre. */
  role: 'dimension' | 'measure'
  /** Identifiant dans la source : clé de colonne, ou identifiant de mesure. */
  id: string
  /** Libellé DÉJÀ traduit — pour le fantôme de glissement, jamais pour décider. */
  label: string
}

/** Une puce POSÉE dans une zone. `index` désigne son rang dans le tableau du contrat. */
export interface WellChip {
  /** Unique DANS la zone : clé dnd-kit et clé React. */
  id: string
  labelKey: TranslationKey
  /** Nom qui vient de la DONNÉE (une colonne de feuille), prioritaire sur `labelKey`. */
  label?: string
  /** Clé de catalogue de la COLONNE agrégée, quand son nom ne vient pas de la donnée. Le
   *  composant compose alors « Somme · Ruptures » — `labelKey` porte l'agrégation. */
  columnLabelKey?: TranslationKey
  index: number
  /** Agrégation courante d'une mesure DÉRIVÉE. Absente = puce sans menu d'agrégation. */
  agg?: Aggregation
  /** Agrégations que le TYPE de la colonne autorise. Vide = pas de menu. */
  aggOptions: Aggregation[]
  /** ⚠⚠ `false` sur la DERNIÈRE mesure : `querySchema.measures` est `.min(1)`, une zone
   *  « Valeurs » vidée rendrait le tableau de bord non enregistrable. */
  removable: boolean
  /** Présente sur les puces de la zone « Filtres du visuel ». */
  filter?: FilterClause
  /** Type de la colonne, quand elle est connue de la source : c'est lui qui décide des
   *  opérateurs de filtre proposés. Absent = colonne absente de la feuille active. */
  kind?: FieldKind
}

const INF = Number.POSITIVE_INFINITY

/**
 * Combien de champs une zone porte AU PLUS, pour ce type de visuel. `0` = la zone n'a pas
 * de sens ici et refuse tout.
 *
 * ⚠⚠ Les plafonds à 1 ne sont pas décoratifs, ils suivent ce que les composants RENDENT
 * vraiment : `KpiTile` n'affiche que la première mesure, `ChartTile` ne lit qu'un axe, et
 * deux jeux de données sur un camembert donnent deux anneaux concentriques illisibles.
 * Accepter au-delà afficherait un champ configuré que personne ne voit.
 */
export function wellCapacity(well: WellId, kind: TileKind): number {
  const chart = kind === 'bar' || kind === 'line' || kind === 'area'
  const round = kind === 'pie' || kind === 'doughnut'
  const grid = kind === 'table' || kind === 'pivot'
  switch (well) {
    case 'axis': return kind === 'kpi' ? 0 : grid ? INF : 1
    // ⚠ Le NUAGE l'accepte aussi : ses deux mesures sont ses AXES, pas des séries — une
    // dimension de légende y colorie les points par catégorie sans rien lui prendre.
    case 'legend': return kind === 'pivot' || kind === 'scatter' ? 1 : chart || round ? 1 : 0
    case 'values': return kind === 'kpi' || round ? 1 : INF
    // Une info-bulle suppose un point à survoler : ni un tableau ni un indicateur n'en ont.
    case 'tooltips': return chart || round ? INF : 0
    case 'visualFilters': return INF
  }
}

/**
 * Rangs de `query.dimensions` que chaque zone présente.
 *
 * ⚠ Le tableau croisé désigne sa colonne par `options.pivotColumn`, jamais par le RANG :
 * la déduire de la position ferait basculer l'axe et la légende au premier réordonnancement.
 */
function dimensionSlots(tile: Tile): { axis: number[]; legend: number[] } {
  const dims = tile.query.dimensions
  if (tile.kind === 'pivot') {
    const col = tile.options?.pivotColumn
    const axis: number[] = []
    const legend: number[] = []
    dims.forEach((d, i) => (d.id === col ? legend : axis).push(i))
    return { axis, legend }
  }
  if (tile.kind === 'table') return { axis: dims.map((_, i) => i), legend: [] }
  return { axis: dims.length ? [0] : [], legend: dims.length > 1 ? [1] : [] }
}

/** Puce d'une mesure : son libellé, son agrégation et les agrégations que sa colonne permet. */
function measureChip(
  ref: MeasureRef, source: DataSource, index: number, removable: boolean,
): WellChip {
  const key = measureKey({ ...ref, alias: undefined })
  const found = source.measures.find((m) => m.id === key)
  const derived = isDerivedMeasure(ref) ? ref : undefined
  // ⚠ Les agrégations proposées viennent du TYPE de la colonne, jamais d'une liste figée :
  // sommer une colonne de texte n'a pas de sens, et le moteur le refuserait au calcul.
  const dim = derived ? source.dimensions.find((d) => d.id === derived.field) : undefined
  // ⚠⚠ Nom de la COLONNE agrégée, en trois recours. Vu à l'écran : la puce affichait « Somme »
  // toute seule. Une colonne de FEUILLE porte son nom dans la donnée (`label`), mais une
  // colonne DÉCLARÉE par une source (les champs de la veille) ne le porte que dans le
  // CATALOGUE — et un module pur ne traduit pas. On rend donc la clé, et le composant compose.
  const columnLabel = found?.label ?? dim?.label
  const columnLabelKey = columnLabel ? undefined : dim?.labelKey
  return {
    id: key,
    // ⚠ Repli sur le nom BRUT de la colonne : une tuile bâtie sur une feuille et rouverte
    // avec une autre porte une colonne absente. Le dire vaut mieux qu'une puce sans nom.
    labelKey: found?.labelKey ?? 'bi.dim.column',
    label: columnLabel ?? (columnLabelKey ? undefined : derived?.field),
    columnLabelKey,
    index,
    agg: derived?.agg,
    aggOptions: dim ? allowedAggregations(dim.kind) : [],
    removable,
  }
}

/** Agrégation posée d'office quand on lâche une COLONNE dans une zone de mesures.
 *  ⚠ `sum` sur un nombre, `count` partout ailleurs : c'est le geste Power BI, et les deux
 *  sont agrégeables — aucune zone ne peut donc devenir fausse par ce chemin. */
function defaultAggregation(kind: FieldKind): Aggregation {
  return kind === 'number' ? 'sum' : 'count'
}

/**
 * La `MeasureRef` qu'un champ lâché dans une zone de mesures ferait enregistrer.
 * `null` = le champ n'existe pas dans la source (feuille changée en cours de route).
 */
export function measureRefOf(field: DraggedField, source: DataSource): MeasureRef | null {
  if (field.role === 'measure') {
    const m = source.measures.find((x) => x.id === field.id)
    if (!m) return null
    // Une mesure DÉRIVÉE réenregistre sa colonne et son agrégation ; une mesure DÉCLARÉE
    // son seul identifiant (cf. l'union ordonnée de `MeasureRef`).
    return m.derivedFrom ?? { id: m.id }
  }
  const dim = source.dimensions.find((d) => d.id === field.id)
  return dim ? { field: dim.id, agg: defaultAggregation(dim.kind) } : null
}

/** Les puces d'une zone, dans l'ordre où elles sont enregistrées. */
export function wellChips(well: WellId, tile: Tile, source: DataSource): WellChip[] {
  if (well === 'visualFilters') {
    return tile.query.filters.map((f, i) => {
      const dim = source.dimensions.find((d) => d.id === f.field)
      return {
        id: `${f.field}:${i}`, labelKey: dim?.labelKey ?? 'bi.dim.column',
        // ⚠⚠ `label` ne se REPLIE sur la clé brute que si la colonne est INTROUVABLE. Vu à
        // l'écran : une dimension déclarée (dont le nom vient du catalogue, pas de la donnée)
        // porte `label: undefined`, et un `??` sur l'identifiant affichait « domain » là où
        // toute l'application lit « Concurrent ».
        label: dim ? dim.label : f.field, index: i, aggOptions: [], removable: true,
        filter: f, kind: dim?.kind,
      }
    })
  }
  if (well === 'values' || well === 'tooltips') {
    const refs = well === 'values' ? tile.query.measures : tile.query.tooltips ?? []
    // ⚠⚠ La dernière mesure de « Valeurs » n'est PAS retirable : le contrat exige au moins
    // une mesure, et un document sans mesure serait refusé à l'enregistrement.
    return refs.map((ref, i) => measureChip(ref, source, i, well === 'tooltips' || refs.length > 1))
  }
  const slots = dimensionSlots(tile)[well === 'axis' ? 'axis' : 'legend']
  return slots.map((i) => {
    const d = tile.query.dimensions[i]
    const dim = source.dimensions.find((x) => x.id === d.id)
    return {
      id: d.id, labelKey: dim?.labelKey ?? 'bi.dim.column', label: dim ? dim.label : d.id,
      index: i, aggOptions: [], removable: true,
    }
  })
}
