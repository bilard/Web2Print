import { describe, it, expect } from 'vitest'
import { layoutGraph } from './layoutGraph'
import type { WorkflowNode, WorkflowEdge } from '../types'

const node = (id: string): WorkflowNode => ({ id, type: 'noop', position: { x: 0, y: 0 }, config: {} })
const edge = (s: string, t: string): WorkflowEdge => ({ id: `${s}->${t}`, source: s, sourceHandle: 'o', target: t, targetHandle: 'i' })

describe('layoutGraph', () => {
  it('aligne une chaîne en colonnes croissantes', () => {
    const pos = layoutGraph([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'c')])
    expect(pos.a.x).toBe(0)
    expect(pos.b.x).toBe(320)
    expect(pos.c.x).toBe(640)
    expect(pos.a.y).toBe(0)
  })

  it('place le nœud de jointure du diamant après ses deux prédécesseurs', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
    const pos = layoutGraph(nodes, edges)
    expect(pos.a.x).toBe(0)
    expect(pos.b.x).toBe(320)
    expect(pos.c.x).toBe(320)
    expect(pos.d.x).toBe(640)
    expect(pos.b.y).not.toBe(pos.c.y)
  })

  it('est déterministe', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('a', 'b')]
    expect(layoutGraph(nodes, edges)).toEqual(layoutGraph(nodes, edges))
  })
})
