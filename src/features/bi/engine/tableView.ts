// Ce qu'un tableau doit MONTRER : ses colonnes utiles, et l'échelle de ses barres. PUR.
//
// ⚠⚠ Une colonne dont AUCUNE ligne ne porte de valeur n'apprend rien et coûte une largeur :
// dans le détail d'un catalogue, « Référence secondaire » affichait cinq cents tirets à la
// suite. Elle est retirée de l'AFFICHAGE — jamais de la donnée, que l'export conserve.
//
// ⚠⚠ Les barres se lisent DEPUIS ZÉRO, pas depuis le minimum observé. Une échelle qui part
// du plus petit ferait paraître minuscule une valeur qui vaut 95 % de la plus grande, et
// ferait disparaître l'écart réel entre deux lignes.
import type { AggregateResult } from './aggregate'

type Column = AggregateResult['columns'][number]
/** Lignes de n'importe quelle provenance : le résultat d'une agrégation comme les lignes
 *  brutes du détail. Seule la PRÉSENCE d'une valeur compte ici. */
type AnyRow = Record<string, unknown>

/** Au moins une ligne renseigne-t-elle cette colonne ? */
export function hasAnyValue(rows: AnyRow[], key: string): boolean {
  return rows.some((r) => {
    const v = r[key]
    return v !== null && v !== undefined && v !== ''
  })
}

/** Colonnes réellement porteuses. Une dimension vide reste affichée : c'est l'axe du
 *  tableau, et le lecteur doit voir que le groupe existe même sans nom. */
export function usefulColumns(columns: Column[], rows: AnyRow[]): Column[] {
  if (rows.length === 0) return columns
  return columns.filter((c) => c.role === 'dimension' || hasAnyValue(rows, c.key))
}

export interface BarScale {
  /** Borne haute de l'échelle (toujours ≥ 0). */
  max: number
  /** Borne basse (≤ 0), non nulle seulement si la colonne porte des valeurs négatives. */
  min: number
}

/**
 * Échelle d'une colonne, bornée par zéro d'un côté au moins.
 *
 * `null` quand il n'y a rien à comparer : aucune valeur lisible, ou — et c'est le cas
 * fréquent — une colonne CONSTANTE. ⚠ « 100 % » sur toutes les lignes tracerait vingt barres
 * pleines, qui n'apprennent rien et masquent les colonnes qui, elles, varient.
 */
export function barScale(rows: AnyRow[], key: string): BarScale | null {
  let max = 0
  let min = 0
  let seen = false
  let first: number | null = null
  let varies = false
  for (const r of rows) {
    const v = r[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    seen = true
    if (first === null) first = v
    else if (v !== first) varies = true
    if (v > max) max = v
    if (v < min) min = v
  }
  if (!seen || !varies || (max === 0 && min === 0)) return null
  return { max, min }
}

export interface BarGeometry {
  /** Bord gauche de la barre, en pourcentage de la cellule. */
  left: number
  /** Largeur de la barre, en pourcentage. */
  width: number
  /** La valeur est négative : l'appelant peut la teinter autrement. */
  negative: boolean
}

/**
 * Position et largeur de la barre d'une valeur.
 *
 * ⚠ Le zéro garde sa place quand la colonne mélange les signes : une barre négative part du
 * zéro vers la GAUCHE. Sans cela, « −5 % » et « +5 % » se dessineraient identiques.
 */
export function barGeometry(value: number, scale: BarScale): BarGeometry {
  const span = scale.max - scale.min
  if (span <= 0) return { left: 0, width: 0, negative: false }
  const zero = (-scale.min / span) * 100
  if (value >= 0) {
    return { left: zero, width: (value / span) * 100, negative: false }
  }
  const width = (-value / span) * 100
  return { left: zero - width, width, negative: true }
}
