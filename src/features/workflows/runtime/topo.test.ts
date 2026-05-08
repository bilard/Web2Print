import { describe, it, expect } from 'vitest'
import { topoSort } from './topo'
import type { WorkflowEdge, WorkflowNode } from '../types'

const node = (id: string): WorkflowNode => ({ id, type: 'noop', position: { x: 0, y: 0 }, config: {} })
const edge = (source: string, target: string): WorkflowEdge => ({
  id: `${source}->${target}`,
  source,
  sourceHandle: 'out',
  target,
  targetHandle: 'in',
})

describe('topoSort', () => {
  it('returns empty array for empty graph', () => {
    expect(topoSort([], [])).toEqual([])
  })

  it('orders simple chain', () => {
    const nodes = [node('c'), node('a'), node('b')]
    const edges = [edge('a', 'b'), edge('b', 'c')]
    expect(topoSort(nodes, edges).map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('orders diamond', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
    const order = topoSort(nodes, edges).map((n) => n.id)
    expect(order[0]).toBe('a')
    expect(order[3]).toBe('d')
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'))
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'))
  })

  it('throws on cycle', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('a', 'b'), edge('b', 'a')]
    expect(() => topoSort(nodes, edges)).toThrow(/cycle/i)
  })
})
