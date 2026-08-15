// Les LIGNES derrière un chiffre. PUR : aucun React, aucun accès réseau.
//
// ⚠⚠ Le filtrage passe par `matches`, la fonction même du moteur d'agrégation. Réécrire ici
// une lecture « équivalente » ferait tôt ou tard diverger le détail du total : on cliquerait
// « 22 509 » pour lire 22 400 lignes, sans savoir laquelle des deux vues ment.
//
// ⚠⚠ L'échantillon est PLAFONNÉ, et le dit. Rendre 500 000 lignes dans un tableau fige
// l'onglet ; les rendre en silence ferait croire que le détail est complet — d'où `total`
// (le vrai décompte, toujours calculé) à côté de `rows` (ce qu'on montre).
import { matches } from './aggregate'
import type { FilterClause } from '../types'
import type { DataSource, Dimension, Row } from '../registry/types'

/** Colonne du détail : toutes les dimensions DÉCLARÉES par la source, dans son ordre. */
interface DetailColumn {
  key: string
  labelKey: Dimension['labelKey']
  /** Nom venu de la DONNÉE (colonne de feuille) : préféré au libellé de catalogue. */
  label?: string
}

export interface UnderlyingRows {
  columns: DetailColumn[]
  /** Les lignes montrées — au plus `limit`. */
  rows: Row[]
  /** Décompte RÉEL des lignes retenues, plafond compris. */
  total: number
  truncated: boolean
}

export function underlyingRows(
  rows: Row[], filters: FilterClause[], source: DataSource, limit = 200,
): UnderlyingRows {
  const dimById = new Map(source.dimensions.map((d) => [d.id, d]))
  const kept = filters.length
    ? rows.filter((r) => filters.every((f) => matches(r, f, dimById.get(f.field))))
    : rows
  const columns: DetailColumn[] = source.dimensions.map((d) => ({
    key: d.id, labelKey: d.labelKey, label: d.label,
  }))
  // ⚠ Les valeurs sont lues par le `get` de la dimension, jamais dans la ligne brute : une
  // source peut exposer un champ calculé (taux en pourcentage, libellé recomposé), et le
  // détail doit montrer ce que la tuile a mesuré, pas la donnée d'avant transformation.
  const shown = kept.slice(0, limit).map((r) => {
    const out: Row = {}
    for (const d of source.dimensions) out[d.id] = d.get(r) ?? null
    return out
  })
  return { columns, rows: shown, total: kept.length, truncated: kept.length > limit }
}
