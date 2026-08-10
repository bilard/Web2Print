// Le catch dédié dans `executeWorkflow` : un run qui explose avant le résumé (cycle détecté
// par `topoSort`, loop mal formé…) n'a pas d'autre occasion de publier son issue. Sans ce
// `catch`, le document live resterait « en cours » pour toujours ailleurs (autres onglets,
// PWA), battu toutes les 5 s pour rien. `publishClientRun` est mocké : son comportement
// propre (course start/stop) est déjà couvert par publishClientRun(Race).test.ts — on
// vérifie ici seulement le CÂBLAGE : l'executor appelle bien `stopClientRunBeat` sur throw,
// avec le même `workflowId`/`runId` que celui donné à `startClientRunBeat`, et rethrow.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Box } from 'lucide-react'
import { nodeRegistry } from '../registry'
import { portTypeRegistry, registerBuiltinPorts } from './ports'
import { useRunContext } from './runContext'
import type { NodeSpec, Workflow } from '../types'

const startCalls: { workflowId: string; runId: string }[] = []
const stopCalls: { workflowId: string; runId: string; status: string }[] = []

vi.mock('./publishClientRun', () => ({
  startClientRunBeat: vi.fn(async (workflowId: string, runId: string) => {
    startCalls.push({ workflowId, runId })
  }),
  stopClientRunBeat: vi.fn((workflowId: string, runId: string, status: string) => {
    stopCalls.push({ workflowId, runId, status })
  }),
}))

const { executeWorkflow } = await import('./executor')

const makeWorkflow = (nodes: Workflow['nodes'], edges: Workflow['edges']): Workflow => ({
  id: 'wf', schemaVersion: 1, name: 'test', description: '', ownerId: 'u',
  createdAt: 0, updatedAt: 0, nodes, edges,
})

const noopSpec = (type: string): NodeSpec => ({
  type, category: 'utility', labelKey: 'node.upload.label', icon: Box,
  inputs: [{ name: 'in', type: 'sheet', required: false }],
  outputs: [{ name: 'out', type: 'sheet' }],
  configSchema: [], defaultConfig: {}, runtime: 'client',
  run: async (_ctx, _config, inputs) => ({ out: inputs }),
})

beforeEach(() => {
  nodeRegistry.clear()
  portTypeRegistry.clear()
  registerBuiltinPorts()
  useRunContext.getState().resetRun()
  startCalls.length = 0
  stopCalls.length = 0
})

describe('executeWorkflow — battement publié même quand le graphe explose avant le résumé', () => {
  it('appelle stopClientRunBeat(status: "error") avec le runId de départ, puis rethrow', async () => {
    nodeRegistry.register(noopSpec('a'))
    nodeRegistry.register(noopSpec('b'))
    // Cycle : n1 → n2 → n1. `topoSort` lève AVANT le bloc de résumé qui calcule le statut.
    const wf = makeWorkflow(
      [
        { id: 'n1', type: 'a', position: { x: 0, y: 0 }, config: {} },
        { id: 'n2', type: 'b', position: { x: 0, y: 0 }, config: {} },
      ],
      [
        { id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
        { id: 'e2', source: 'n2', sourceHandle: 'out', target: 'n1', targetHandle: 'in' },
      ]
    )

    await expect(executeWorkflow(wf)).rejects.toThrow(/cycle/i)

    expect(startCalls).toHaveLength(1)
    expect(stopCalls).toHaveLength(1)
    expect(stopCalls[0].workflowId).toBe(startCalls[0].workflowId)
    expect(stopCalls[0].runId).toBe(startCalls[0].runId)
    expect(stopCalls[0].status).toBe('error')
  })

  it('ne double-publie pas : la voie normale (sans throw) n’appelle stopClientRunBeat qu’une fois', async () => {
    nodeRegistry.register(noopSpec('a'))
    const wf = makeWorkflow([{ id: 'n1', type: 'a', position: { x: 0, y: 0 }, config: {} }], [])

    await executeWorkflow(wf)

    expect(startCalls).toHaveLength(1)
    expect(stopCalls).toHaveLength(1)
    expect(stopCalls[0].status).toBe('success')
  })
})
