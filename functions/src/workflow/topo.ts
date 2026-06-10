// functions/src/workflow/topo.ts
import type { ServerNode, ServerEdge } from './types'

export function topoSort(nodes: ServerNode[], edges: ServerEdge[]): ServerNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const indeg = new Map<string, number>(nodes.map((node) => [node.id, 0]))
  const out = new Map<string, string[]>(nodes.map((node) => [node.id, []]))
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    out.get(edge.source)!.push(edge.target)
    indeg.set(edge.target, (indeg.get(edge.target) ?? 0) + 1)
  }
  const queue: string[] = []
  for (const [id, d] of indeg) if (d === 0) queue.push(id)
  const result: ServerNode[] = []
  while (queue.length) {
    const id = queue.shift()!
    result.push(byId.get(id)!)
    for (const next of out.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1
      indeg.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  if (result.length !== nodes.length) throw new Error('Workflow contains a cycle')
  return result
}
