// Les GESTES du constructeur, sous forme de fonctions PURES : une tuile entre, une tuile
// sort. Aucune écriture, aucun React — c'est ce qui les rend testables une par une.
//
// ⚠⚠ Chaque résultat DOIT rester valide au sens de `querySchema` : au moins une mesure, une
// colonne de tri qui existe encore, pas de colonne de croisement fantôme. Une tuile invalide
// ne serait refusée qu'à l'enregistrement — c'est-à-dire une fois le geste déjà fait.
import { isDerivedMeasure, measureKey, type Aggregation, type FilterClause, type MeasureRef, type Tile, type TileKind } from '../types'
import type { DataSource } from '../registry/types'
import { measureRefOf, wellCapacity, type DraggedField, type WellId } from './wells'

type Dims = Tile['query']['dimensions']

/** La tuile dont la requête a été retouchée, avec le tri REMIS D'APLOMB. */
function withQuery(
  tile: Tile, patch: Partial<Tile['query']>, options: Tile['options'] = tile.options,
): Tile {
  const query = { ...tile.query, ...patch }
  // ⚠ Un `sort.by` qui désigne une mesure retirée ne lève pas : le moteur compare des
  // `undefined` et l'ordre devient arbitraire, ce qui est pire — un tri silencieusement faux.
  const keys = new Set<string>([
    ...query.dimensions.map((d) => d.id),
    ...query.measures.map((m) => measureKey(m)),
  ])
  const sort = query.sort?.filter((s) => keys.has(s.by))
  return { ...tile, query: { ...query, sort: sort?.length ? sort : undefined }, options }
}

/** Pose une dimension dans l'axe ou la légende. */
function dropDimension(tile: Tile, well: 'axis' | 'legend', id: string): Tile {
  const dims = tile.query.dimensions
  if (tile.kind === 'pivot') {
    if (well === 'legend') {
      // La colonne du croisé est DÉSIGNÉE (`options.pivotColumn`), jamais déduite du rang.
      const rest = dims.filter((d) => d.id !== tile.options?.pivotColumn)
      return withQuery(tile, { dimensions: [...rest, { id }] },
        { ...tile.options, pivotColumn: id })
    }
    return withQuery(tile, { dimensions: [...dims, { id }] }, tile.options)
  }
  if (wellCapacity(well, tile.kind) === Number.POSITIVE_INFINITY) {
    return withQuery(tile, { dimensions: [...dims, { id }] }, tile.options)
  }
  // ⚠ Plafond à 1 : le champ lâché REMPLACE celui en place plutôt que d'être refusé — rien
  // n'est perdu (le champ sortant reste dans le volet), et c'est le geste attendu.
  const next: Dims = well === 'axis'
    ? [{ id }, ...dims.slice(1)]
    : [...(dims.length ? [dims[0]] : []), { id }]
  return withQuery(tile, { dimensions: next }, tile.options)
}

/** Pose un champ dans une zone. ⚠ N'A PAS À VÉRIFIER : `acceptField` a déjà tranché. */
export function dropInWell(tile: Tile, well: WellId, field: DraggedField, source: DataSource): Tile {
  if (well === 'axis' || well === 'legend') return dropDimension(tile, well, field.id)

  if (well === 'visualFilters') {
    const column = field.role === 'dimension'
      ? field.id
      : source.measures.find((m) => m.id === field.id)?.derivedFrom?.field
    if (!column) return tile
    // ⚠ `notEmpty` d'office : c'est le seul opérateur qui ait un sens SANS valeur saisie.
    // Un `eq` sur une valeur vide retirerait toutes les lignes dès le lâcher.
    const filters: FilterClause[] = [...tile.query.filters, { field: column, op: 'notEmpty' }]
    return withQuery(tile, { filters }, tile.options)
  }

  const ref = measureRefOf(field, source)
  if (!ref) return tile
  if (well === 'tooltips') {
    return withQuery(tile, { tooltips: [...(tile.query.tooltips ?? []), ref] }, tile.options)
  }
  const measures = wellCapacity('values', tile.kind) === 1
    ? [ref]
    : [...tile.query.measures, ref]
  return withQuery(tile, { measures }, tile.options)
}

/**
 * Retire la puce de rang `index`.
 *
 * ⚠⚠ La DERNIÈRE mesure ne part pas : `querySchema.measures` est `.min(1)`, et un document
 * sans mesure serait refusé à l'écriture — le geste échouerait après coup, sans rien dire.
 * L'interface désactive déjà la croix (`WellChip.removable`) ; cette garde est la seconde.
 */
export function removeFromWell(tile: Tile, well: WellId, index: number): Tile {
  if (well === 'visualFilters') {
    return withQuery(tile, { filters: tile.query.filters.filter((_, i) => i !== index) }, tile.options)
  }
  if (well === 'tooltips') {
    const tips = (tile.query.tooltips ?? []).filter((_, i) => i !== index)
    return withQuery(tile, { tooltips: tips.length ? tips : undefined }, tile.options)
  }
  if (well === 'values') {
    if (tile.query.measures.length <= 1) return tile
    return withQuery(tile, { measures: tile.query.measures.filter((_, i) => i !== index) }, tile.options)
  }
  // ⚠ Retirer l'axe d'un graphe qui porte une légende PROMEUT la légende en axe : les deux
  // vivent dans le même tableau, et laisser un trou ferait grouper sur rien.
  const dims = tile.query.dimensions.filter((_, i) => i !== index)
  const removed = tile.query.dimensions[index]?.id
  const options = removed && tile.options?.pivotColumn === removed
    ? { ...tile.options, pivotColumn: undefined }
    : tile.options
  return withQuery(tile, { dimensions: dims }, options)
}

/** Déplace une puce à l'intérieur de sa zone. Seules les zones à plusieurs puces l'exposent. */
export function reorderWell(tile: Tile, well: WellId, from: number, to: number): Tile {
  const move = <T,>(list: T[]): T[] => {
    const out = [...list]
    const [x] = out.splice(from, 1)
    out.splice(to, 0, x)
    return out
  }
  if (from === to) return tile
  if (well === 'values') return withQuery(tile, { measures: move(tile.query.measures) }, tile.options)
  if (well === 'tooltips') return withQuery(tile, { tooltips: move(tile.query.tooltips ?? []) }, tile.options)
  if (well === 'visualFilters') return withQuery(tile, { filters: move(tile.query.filters) }, tile.options)
  // Axe d'un tableau ou d'un croisé : l'ordre des dimensions est l'ordre des colonnes.
  return withQuery(tile, { dimensions: move(tile.query.dimensions) }, tile.options)
}

/** Change l'agrégation d'une mesure DÉRIVÉE. ⚠ Sans effet sur une mesure déclarée : son
 *  calcul est une fonction de l'application, pas une agrégation de colonne. */
export function setChipAggregation(
  tile: Tile, well: WellId, index: number, agg: Aggregation,
): Tile {
  const swap = (refs: MeasureRef[]): MeasureRef[] => refs.map((r, i) => {
    if (i !== index || !isDerivedMeasure(r)) return r
    return { ...r, agg }
  })
  if (well === 'tooltips') {
    return withQuery(tile, { tooltips: swap(tile.query.tooltips ?? []) }, tile.options)
  }
  return withQuery(tile, { measures: swap(tile.query.measures) }, tile.options)
}

/** Retouche un filtre du visuel — son opérateur, sa valeur. */
export function updateFilter(tile: Tile, index: number, patch: Partial<FilterClause>): Tile {
  const filters = tile.query.filters.map((f, i) => (i === index ? { ...f, ...patch } : f))
  return withQuery(tile, { filters }, tile.options)
}

/**
 * Change le TYPE du visuel et REMET SA REQUÊTE D'APLOMB.
 *
 * ⚠⚠ La requête ne peut pas rester intacte : une tuile à barres réglée sur une dimension,
 * passée en indicateur, produirait une ligne par groupe dont `KpiTile` n'afficherait que la
 * PREMIÈRE — un chiffre faux, sans le moindre avertissement. On tronque donc chaque zone au
 * plafond du nouveau type, ce que l'utilisateur voit immédiatement dans les zones.
 */
export function retypeTile(tile: Tile, kind: TileKind): Tile {
  const cut = <T,>(list: T[], max: number): T[] =>
    Number.isFinite(max) ? list.slice(0, max) : list
  const dimMax = wellCapacity('axis', kind) + wellCapacity('legend', kind)
  const dimensions = cut(tile.query.dimensions, dimMax)
  const measures = cut(tile.query.measures, wellCapacity('values', kind))
  const tooltips = wellCapacity('tooltips', kind) === 0 ? undefined : tile.query.tooltips
  // La colonne du croisé se REDÉSIGNE : gardée si elle survit à la coupe, sinon la seconde
  // dimension. Un `pivotColumn` qui ne désigne aucune dimension ne croiserait rien.
  const kept = tile.options?.pivotColumn
  const pivotColumn = kind !== 'pivot'
    ? undefined
    : dimensions.some((d) => d.id === kept) ? kept : dimensions[1]?.id
  const options = { ...tile.options, pivotColumn }
  const hasOptions = Object.values(options).some((v) => v !== undefined)
  return withQuery({ ...tile, kind }, { dimensions, measures, tooltips },
    hasOptions ? options : undefined)
}
