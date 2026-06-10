// functions/src/workflow/execute.test.ts
import { describe, it, expect } from 'vitest'
import './nodes/index'
import { executeWorkflowHeadless } from './execute'
import type { ServerWorkflow } from './types'

const wf: ServerWorkflow = {
  id: 'w', name: 'T', ownerId: 'u',
  nodes: [
    { id: 'a', type: 'text-input', config: { text: 'Bonjour' } },
    { id: 'b', type: 'if-else', config: { expression: "value === 'Bonjour'" } },
  ],
  edges: [{ id: 'e', source: 'a', sourceHandle: 'text', target: 'b', targetHandle: 'value' }],
}

describe('executeWorkflowHeadless', () => {
  it('exécute en ordre topo et câble les ports', async () => {
    const res = await executeWorkflowHeadless(wf, { uid: 'u', signal: new AbortController().signal })
    expect(res.status).toBe('success')
    expect(res.nodeOutputs.b).toEqual({ then: 'Bonjour' })
  })
  it('marque un type refusé en erreur', async () => {
    const bad: ServerWorkflow = { ...wf, nodes: [{ id: 'x', type: 'export-pdf', config: {} }], edges: [] }
    const res = await executeWorkflowHeadless(bad, { uid: 'u', signal: new AbortController().signal })
    expect(res.status).toBe('error')
    expect(res.errorCount).toBe(1)
  })
})
