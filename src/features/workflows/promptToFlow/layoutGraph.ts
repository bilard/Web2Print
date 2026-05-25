// src/features/workflows/promptToFlow/layoutGraph.ts
import type { WorkflowNode, WorkflowEdge } from '../types'

const COL_W = 320
const ROW_H = 160

/**
 * Layout en couches gauche→droite. couche(n) = max(couche(prédécesseurs)) + 1.
 * Dans une couche, les nœuds sont empilés verticalement dans l'ordre du tableau
 * `nodes` (déterministe). Tolère un éventuel cycle résiduel via un garde `computing`.
 */
export function layoutGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Record<string, { x: number; y: number }> {
  const preds = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (preds.has(e.target) && preds.has(e.source)) preds.get(e.target)!.push(e.source)
  }
  const layer = new Map<string, number>()
  const computing = new Set<string>()
  const layerOf = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!
    if (computing.has(id)) return 0
    computing.add(id)
    const ps = preds.get(id) ?? []
    const v = ps.length === 0 ? 0 : Math.max(...ps.map(layerOf)) + 1
    computing.delete(id)
    layer.set(id, v)
    return v
  }
  for (const n of nodes) layerOf(n.id)

  const rankInLayer = new Map<number, number>()
  const pos: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    const l = layer.get(n.id)!
    const r = rankInLayer.get(l) ?? 0
    rankInLayer.set(l, r + 1)
    pos[n.id] = { x: l * COL_W, y: r * ROW_H }
  }
  return pos
}
