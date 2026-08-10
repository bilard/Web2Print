// Une carte en erreur dans un flux qui adresse un suivi de la veille tarifaire doit
// laisser une trace dans le journal des pannes (`recordIncident`) — MÊME granularité que
// côté navigateur (src/features/workflows/runtime/executorIncidents.test.ts). Un flux
// SANS suivi n'a rien à y faire.
//
// ⚠ Preuve, pas seulement affirmation, que `executeWorkflowHeadless` ne « rethrow » JAMAIS
// pour l'échec d'un node : `await` ci-dessous ne lève pas, le run se termine normalement
// (`status: 'error'`/`'partial'`) — c'est précisément ce qui écarte la double
// consignation avec le `catch` de `scheduler.ts` (réservé aux runs qui plantent
// ENTIÈREMENT, un événement d'un autre ordre).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeWorkflowHeadless } from './execute'
import { registerServerNode } from './registry'
import { recordIncident, pruneExpiredIncidents } from '../priceWatch/opsIncidents'
import { deriveWatchId } from '../priceWatch/sourceSites'
import type { ServerWorkflow } from './types'

vi.mock('../priceWatch/opsIncidents', () => ({
  recordIncident: vi.fn(async () => {}),
  pruneExpiredIncidents: vi.fn(async () => {}),
}))

beforeEach(() => { vi.clearAllMocks() })

describe('executeWorkflowHeadless — journal des incidents (serveur)', () => {
  it('une carte en erreur dans un flux de veille tarifaire consigne un incident', async () => {
    registerServerNode({ type: 'harvest-competitor', run: async () => { throw new Error('panne serveur') } })
    const wf: ServerWorkflow = {
      id: 'wf-srv-incidents', name: 'T', ownerId: 'u',
      nodes: [{ id: 'n1', type: 'harvest-competitor', config: {} }], edges: [],
    }
    const res = await executeWorkflowHeadless(
      wf, { uid: 'u1', signal: new AbortController().signal, runId: 'srv-run-1' },
    )

    // Pas de rethrow : le catch de scheduler.ts n'est JAMAIS atteint pour cette raison.
    expect(res.status).toBe('error')
    expect(recordIncident).toHaveBeenCalledTimes(1)
    expect(recordIncident).toHaveBeenCalledWith(
      'u1', deriveWatchId('', wf.id),
      expect.objectContaining({
        message: expect.stringContaining('panne serveur'),
        nodeLabel: 'Moisson concurrents', origin: 'server', runId: 'srv-run-1',
      }),
    )
  })

  it("une carte en erreur dans un flux SANS suivi ne consigne rien", async () => {
    registerServerNode({ type: 'test-no-watch-fail', run: async () => { throw new Error('panne hors sujet') } })
    const wf: ServerWorkflow = {
      id: 'wf-srv-no-watch', name: 'T', ownerId: 'u',
      nodes: [{ id: 'n1', type: 'test-no-watch-fail', config: {} }], edges: [],
    }
    await executeWorkflowHeadless(wf, { uid: 'u1', signal: new AbortController().signal })

    expect(recordIncident).not.toHaveBeenCalled()
  })

  it('deux cartes en erreur consignent deux incidents mais ne purgent qu\'UNE fois (pas par carte)', async () => {
    registerServerNode({ type: 'harvest-competitor', run: async () => { throw new Error('panne A') } })
    registerServerNode({ type: 'directed-search', run: async () => { throw new Error('panne B') } })
    const wf: ServerWorkflow = {
      id: 'wf-srv-two-fail', name: 'T', ownerId: 'u',
      nodes: [
        { id: 'n1', type: 'harvest-competitor', config: {} },
        { id: 'n2', type: 'directed-search', config: {} },
      ],
      edges: [],
    }
    await executeWorkflowHeadless(wf, { uid: 'u1', signal: new AbortController().signal })

    expect(recordIncident).toHaveBeenCalledTimes(2)
    // Purge coûte une lecture Firestore de 500 documents : la faire une fois par carte en
    // erreur (au lieu d'une fois par run) viderait vite le budget d'un cron qui échoue
    // souvent sur les mêmes sites — cf. commentaire d'en-tête de opsIncidents.ts.
    expect(pruneExpiredIncidents).toHaveBeenCalledTimes(1)
  })

  it('un run sans aucune panne ne déclenche aucune purge', async () => {
    registerServerNode({ type: 'harvest-competitor', run: async () => ({}) })
    const wf: ServerWorkflow = {
      id: 'wf-srv-no-fail', name: 'T', ownerId: 'u',
      nodes: [{ id: 'n1', type: 'harvest-competitor', config: {} }], edges: [],
    }
    await executeWorkflowHeadless(wf, { uid: 'u1', signal: new AbortController().signal })

    expect(recordIncident).not.toHaveBeenCalled()
    expect(pruneExpiredIncidents).not.toHaveBeenCalled()
  })
})
