// C2 — après la fin d'un run client, l'écho TERMINAL (le dernier `setDoc`, reçu via
// `onSnapshot` dans CE MÊME onglet) doit rester reconnu comme le nôtre. Sinon
// `useServerRunLive` le traite comme un run étranger tout juste apparu : `reset` devient
// vrai, et le run se fait hydrater par SON PROPRE écho — journaux et aperçus de cartes
// écrasés à la seconde même où il se termine. C'est une régression sur l'EXISTANT (la
// console/les aperçus de tout run lancé depuis l'éditeur), pas seulement sur la nouvelle
// fonctionnalité.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: {} }))
vi.mock('@/features/access/useWorkspaceUid', () => ({ getWorkspaceUid: () => 'u1' }))
vi.mock('./runContext', () => ({ useRunContext: { getState: () => ({ nodeStates: {} }) } }))
vi.mock('../persistence/workflow.store', () => ({ useWorkflowStore: { getState: () => ({ current: null }) } }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  getDoc: vi.fn(async () => ({ data: () => undefined })),
  setDoc: vi.fn(async () => {}),
}))

const { startClientRunBeat, stopClientRunBeat, activeClientRunId, isOwnEcho } = await import('./publishClientRun')

beforeEach(() => { vi.clearAllMocks() })

describe('activeClientRunId — l’écho terminal reste reconnu comme le nôtre', () => {
  it('isOwnEcho reste vrai pour notre dernier document écrit, MÊME après stopClientRunBeat', async () => {
    await startClientRunBeat('wf-1', 'run-1')
    stopClientRunBeat('wf-1', 'run-1', 'success')
    await Promise.resolve()   // laisse l'écriture finale (fire-and-forget) partir

    // L'écho Firestore de CETTE écriture arrive après coup, dans ce même onglet — c'est
    // exactement le document que `useServerRunLive` recevrait ici.
    expect(isOwnEcho({ origin: 'client', runId: 'run-1' }, activeClientRunId())).toBe(true)
  })

  it('un run étranger (autre onglet ou cron) n’est jamais confondu avec notre dernier run', async () => {
    await startClientRunBeat('wf-1', 'run-1')
    stopClientRunBeat('wf-1', 'run-1', 'success')
    await Promise.resolve()

    expect(isOwnEcho({ origin: 'server', runId: 'cron-9' }, activeClientRunId())).toBe(false)
    expect(isOwnEcho({ origin: 'client', runId: 'run-2' }, activeClientRunId())).toBe(false)
  })
})
