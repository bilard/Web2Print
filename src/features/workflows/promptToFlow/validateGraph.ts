// src/features/workflows/promptToFlow/validateGraph.ts
import { nodeRegistry } from '../registry'
import { isCompatible } from '../runtime/ports'
import { topoSort } from '../runtime/topo'
import type { WorkflowNode, WorkflowEdge } from '../types'
import type { RawGraph, GraphIssue, ValidatedGraph } from './types'

function defaultGenId(i: number): string {
  return `n_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Matérialise un graphe brut (ref→id, merge config sur defaults) et le valide :
 * types connus, ports existants, compatibilité des ports, absence de cycle,
 * entrées requises connectées. Les éléments invalides sont écartés et listés
 * dans `issues` (level `error`), les manques non bloquants en `warning`.
 */
export function validateGraph(
  raw: RawGraph,
  genId: (i: number) => string = defaultGenId,
): ValidatedGraph {
  const issues: GraphIssue[] = []
  const refToId = new Map<string, string>()
  const nodes: WorkflowNode[] = []

  raw.nodes.forEach((rn, i) => {
    const spec = nodeRegistry.get(rn.type)
    if (!spec) {
      issues.push({ level: 'error', message: `Node inconnu ignoré : "${rn.type}" (ref ${rn.ref}).` })
      return
    }
    if (refToId.has(rn.ref)) {
      issues.push({ level: 'error', message: `Ref dupliquée ignorée : "${rn.ref}" (index ${i}).` })
      return
    }
    const id = genId(i)
    refToId.set(rn.ref, id)
    nodes.push({
      id,
      type: rn.type,
      position: { x: 0, y: 0 },
      config: { ...structuredClone(spec.defaultConfig as Record<string, unknown>), ...(rn.config ?? {}) },
    })
  })

  const resolve = (ref: string) => {
    const id = refToId.get(ref)
    if (!id) return undefined
    const n = nodes.find((x) => x.id === id)
    if (!n) return undefined
    return { id, spec: nodeRegistry.get(n.type)! }
  }

  const edges: WorkflowEdge[] = []
  for (const re of raw.edges) {
    const src = resolve(re.from)
    const tgt = resolve(re.to)
    if (!src || !tgt) {
      issues.push({ level: 'error', message: `Edge ignorée : ref introuvable (${re.from} → ${re.to}).` })
      continue
    }
    const out = src.spec.outputs.find((p) => p.name === re.fromPort)
    const inp = tgt.spec.inputs.find((p) => p.name === re.toPort)
    if (!out) {
      issues.push({ level: 'error', message: `Port de sortie "${re.fromPort}" absent de ${src.spec.type}.` })
      continue
    }
    if (!inp) {
      issues.push({ level: 'error', message: `Port d'entrée "${re.toPort}" absent de ${tgt.spec.type}.` })
      continue
    }
    if (!isCompatible(out.type, inp.type)) {
      issues.push({ level: 'error', message: `Types incompatibles ${out.type} → ${inp.type} (${src.spec.type} → ${tgt.spec.type}).` })
      continue
    }
    edges.push({
      id: `e_${src.id}_${re.fromPort}_${tgt.id}_${re.toPort}`,
      source: src.id,
      sourceHandle: re.fromPort,
      target: tgt.id,
      targetHandle: re.toPort,
    })
  }

  try {
    topoSort(nodes, edges)
  } catch {
    issues.push({ level: 'error', message: 'Le graphe contient un cycle.' })
  }

  for (const n of nodes) {
    const spec = nodeRegistry.get(n.type)!
    for (const p of spec.inputs) {
      if (p.required && !edges.some((e) => e.target === n.id && e.targetHandle === p.name)) {
        issues.push({ level: 'warning', message: `Entrée requise "${p.name}" non connectée sur ${spec.label}.` })
      }
    }
  }

  return { title: raw.title, summary: raw.summary, nodes, edges, issues }
}
