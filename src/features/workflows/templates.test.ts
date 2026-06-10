// src/features/workflows/templates.test.ts
// Intégrité de la galerie : chaque template ne référence que des types de nodes
// enregistrés, des ports existants et des connexions compatibles.
import { describe, it, expect, beforeAll } from 'vitest'
import { WORKFLOW_TEMPLATES, workflowFromTemplate } from './templates'
import { initWorkflowsRegistry } from './registry/builtin'
import { nodeRegistry } from './registry'
import { isCompatible } from './runtime/ports'

beforeAll(() => {
  initWorkflowsRegistry()
})

describe('WORKFLOW_TEMPLATES', () => {
  it.each(WORKFLOW_TEMPLATES.map((t) => [t.id, t] as const))('%s : nodes connus et edges valides', (_id, t) => {
    const byId = new Map(t.nodes.map((n) => [n.id, n]))
    for (const n of t.nodes) {
      expect(nodeRegistry.get(n.type), `type inconnu : ${n.type}`).toBeDefined()
    }
    for (const e of t.edges) {
      const src = byId.get(e.source)
      const tgt = byId.get(e.target)
      expect(src, `source absente : ${e.source}`).toBeDefined()
      expect(tgt, `cible absente : ${e.target}`).toBeDefined()
      const srcSpec = nodeRegistry.get(src!.type)!
      const tgtSpec = nodeRegistry.get(tgt!.type)!
      const out = srcSpec.outputs.find((p) => p.name === e.sourceHandle)
      const inp = tgtSpec.inputs.find((p) => p.name === e.targetHandle)
      expect(out, `port sortant absent : ${src!.type}.${e.sourceHandle}`).toBeDefined()
      expect(inp, `port entrant absent : ${tgt!.type}.${e.targetHandle}`).toBeDefined()
      expect(
        isCompatible(out!.type, inp!.type),
        `ports incompatibles : ${src!.type}.${e.sourceHandle} (${out!.type}) → ${tgt!.type}.${e.targetHandle} (${inp!.type})`,
      ).toBe(true)
    }
  })

  it('workflowFromTemplate instancie un workflow indépendant (deep clone)', () => {
    const t = WORKFLOW_TEMPLATES[0]
    const wf = workflowFromTemplate(t, 'uid-1')
    expect(wf.ownerId).toBe('uid-1')
    expect(wf.name).toBe(t.name)
    expect(wf.nodes).toHaveLength(t.nodes.length)
    ;(wf.nodes[0].config as Record<string, unknown>).urls = 'modifié'
    expect((t.nodes[0].config as Record<string, unknown>).urls).toBe('')
  })
})
