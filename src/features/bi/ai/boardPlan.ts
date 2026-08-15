// Du langage naturel à un tableau de bord : la partie PURE — traduire un plan en tuiles.
//
// ⚠⚠ Rien n'est deviné. Une mesure ou une dimension que la source ne déclare PAS fait
// écarter la tuile, et l'écarté est RAPPORTÉ. Se rabattre sur « la première mesure venue »
// donnerait un tableau qui répond à côté de la question posée, sans que rien ne le dise —
// et c'est exactement ce qu'on ne pardonne pas à un outil décisionnel.
import { SIZES } from '../engine/newTile'
import type { DataSource } from '../registry/types'
import { TILE_KINDS } from '../types'
import type { SourceId, Tile, TileKind, TilePlacement } from '../types'

/** Une tuile telle que le modèle la propose : des IDENTIFIANTS, jamais des libellés.
 *  ⚠ `kind` est une CHAÎNE : le modèle peut proposer un type qui n'existe pas, et ce refus
 *  doit coûter une tuile, pas l'appel entier. */
interface PlannedTile {
  kind: string
  title: string
  measure: string
  dimension?: string
  limit?: number
  sortDesc?: boolean
}

export interface BoardPlan {
  name: string
  tiles: PlannedTile[]
}

export interface PlannedBoard {
  name: string
  tiles: Tile[]
  layout: TilePlacement[]
  /** Ce que le modèle a proposé et qu'on a REFUSÉ, en clair, pour le dire à l'écran. */
  rejected: string[]
}

const COLS = 12

/** Range les tuiles de gauche à droite, en passant à la ligne quand la largeur est prise.
 *  Les indicateurs, étroits, se retrouvent naturellement côte à côte en tête. */
function layoutOf(tiles: Tile[]): TilePlacement[] {
  const out: TilePlacement[] = []
  let x = 0, y = 0, rowH = 0
  for (const tile of tiles) {
    const { w, h } = SIZES[tile.kind]
    if (x + w > COLS) { x = 0; y += rowH; rowH = 0 }
    out.push({ tileId: tile.id, x, y, w, h })
    x += w
    rowH = Math.max(rowH, h)
  }
  return out
}

/**
 * Traduit le plan du modèle en tuiles VALIDES pour cette source.
 *
 * `idOf` fabrique les identifiants : injecté pour que le test soit déterministe — et parce
 * qu'un identifiant tiré de l'horloge ferait deux tuiles jumelles dans la même milliseconde.
 */
export function planToBoard(
  plan: BoardPlan, source: DataSource, sourceId: SourceId, idOf: (i: number) => string,
): PlannedBoard {
  const measures = new Set(source.measures.map((m) => m.id))
  const dimensions = new Set(source.dimensions.map((d) => d.id))
  const tiles: Tile[] = []
  const rejected: string[] = []

  plan.tiles.forEach((p, i) => {
    if (!(TILE_KINDS as readonly string[]).includes(p.kind)) {
      rejected.push(`${p.title || '?'} — visuel inconnu : ${p.kind}`)
      return
    }
    const kind = p.kind as TileKind
    if (!measures.has(p.measure)) {
      rejected.push(`${p.title || kind} — mesure inconnue : ${p.measure}`)
      return
    }
    // ⚠ Un indicateur montre UNE valeur : lui laisser une dimension afficherait la première
    // ligne d'un regroupement, c'est-à-dire un chiffre faux sans avertissement.
    const wantsDim = kind !== 'kpi' && kind !== 'gauge'
    if (wantsDim && (!p.dimension || !dimensions.has(p.dimension))) {
      rejected.push(`${p.title || kind} — dimension inconnue : ${p.dimension ?? '—'}`)
      return
    }
    tiles.push({
      id: idOf(i),
      kind,
      title: p.title.trim() || p.measure,
      query: {
        source: sourceId,
        measures: [{ id: p.measure }],
        dimensions: wantsDim && p.dimension ? [{ id: p.dimension }] : [],
        filters: [],
        // Un classement sans mesure de tri n'a pas de sens : on trie sur CE qu'on mesure.
        ...(wantsDim ? { sort: [{ by: p.measure, dir: p.sortDesc === false ? 'asc' as const : 'desc' as const }] } : {}),
        ...(p.limit && wantsDim ? { limit: p.limit } : {}),
      },
    })
  })

  return { name: plan.name.trim() || 'Sans titre', tiles, layout: layoutOf(tiles), rejected }
}
