// Une carte en erreur dans un flux qui adresse un suivi de la veille tarifaire doit
// laisser une trace dans le journal des pannes (`recordIncident`) — un flux SANS suivi
// n'a rien à y faire. Cf. reference client `firstWatchId.ts`, jumeau du serveur.
//
// ⚠ Fichier séparé de `executor.test.ts` : les mocks ci-dessous (uid, publication du run,
// historique client) sont GLOBAUX au fichier — les mélanger aux nombreux autres tests de
// `executor.test.ts` en changerait le comportement (un uid non nul y déclencherait de
// vraies écritures Firestore côté `publishClientRun`/`persistClientRun`).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Box } from 'lucide-react'

vi.mock('./publishClientRun', () => ({
  startClientRunBeat: vi.fn(async () => {}),
  stopClientRunBeat: vi.fn(),
}))
vi.mock('../persistence/runHistoryClient', () => ({
  persistClientRun: vi.fn(async () => {}),
}))
vi.mock('@/features/access/useWorkspaceUid', () => ({
  getWorkspaceUid: () => 'test-uid',
}))
vi.mock('@/features/priceWatch/ops/incidents', () => ({
  recordIncident: vi.fn(async () => {}),
  pruneExpiredIncidents: vi.fn(async () => {}),
}))

const { executeWorkflow } = await import('./executor')
const { nodeRegistry } = await import('../registry')
const { portTypeRegistry, registerBuiltinPorts } = await import('./ports')
const { useRunContext } = await import('./runContext')
const { recordIncident, pruneExpiredIncidents } = await import('@/features/priceWatch/ops/incidents')
const { deriveWatchId } = await import('@/features/priceWatch/sourceSites')
const { t } = await import('@/lib/i18n')
import type { NodeSpec, Workflow } from '../types'

const makeWorkflow = (nodes: Workflow['nodes'], edges: Workflow['edges']): Workflow => ({
  id: 'wf-incidents', schemaVersion: 1, name: 'test', description: '', ownerId: 'u',
  createdAt: 0, updatedAt: 0, nodes, edges,
})

const throwingSpec = (type: string): NodeSpec => ({
  type, category: 'utility', labelKey: 'node.upload.label', icon: Box,
  inputs: [], outputs: [{ name: 'out', type: 'sheet' }],
  configSchema: [], defaultConfig: {}, runtime: 'client',
  run: async () => { throw new Error('panne de carte') },
})

describe('executeWorkflow — journal des incidents (navigateur)', () => {
  beforeEach(() => {
    nodeRegistry.clear()
    portTypeRegistry.clear()
    registerBuiltinPorts()
    useRunContext.getState().resetRun()
    vi.clearAllMocks()
  })

  it('une carte en erreur dans un flux de veille tarifaire consigne un incident', async () => {
    nodeRegistry.register(throwingSpec('harvest-competitor'))
    const wf = makeWorkflow(
      [{ id: 'n1', type: 'harvest-competitor', position: { x: 0, y: 0 }, config: {} }], [],
    )
    await executeWorkflow(wf)

    expect(recordIncident).toHaveBeenCalledTimes(1)
    expect(recordIncident).toHaveBeenCalledWith(
      'test-uid', deriveWatchId('', wf.id),
      expect.objectContaining({
        message: expect.stringContaining('panne de carte'),
        nodeLabel: t('node.upload.label'),
        origin: 'client',
      }),
    )
    // Purgée UNE fois pour tout le run — pas une fois par incident (cf. incidents.ts).
    expect(pruneExpiredIncidents).toHaveBeenCalledTimes(1)
    expect(pruneExpiredIncidents).toHaveBeenCalledWith('test-uid', deriveWatchId('', wf.id))
  })

  it("une carte en erreur dans un flux SANS suivi ne consigne rien, et ne purge rien", async () => {
    nodeRegistry.register(throwingSpec('send-gmail'))
    const wf = makeWorkflow(
      [{ id: 'n1', type: 'send-gmail', position: { x: 0, y: 0 }, config: {} }], [],
    )
    await executeWorkflow(wf)

    expect(recordIncident).not.toHaveBeenCalled()
    expect(pruneExpiredIncidents).not.toHaveBeenCalled()
  })

  it('plusieurs cartes en erreur dans le MÊME run ne purgent qu’une seule fois', async () => {
    nodeRegistry.register(throwingSpec('harvest-competitor'))
    nodeRegistry.register(throwingSpec('compare-catalog'))
    const wf = makeWorkflow(
      [
        { id: 'n1', type: 'harvest-competitor', position: { x: 0, y: 0 }, config: {} },
        { id: 'n2', type: 'compare-catalog', position: { x: 0, y: 0 }, config: {} },
      ],
      [],
    )
    await executeWorkflow(wf)

    expect(recordIncident).toHaveBeenCalledTimes(2)
    expect(pruneExpiredIncidents).toHaveBeenCalledTimes(1)
  })
})
