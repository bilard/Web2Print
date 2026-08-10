// Course entre `startClientRunBeat` (asynchrone : un `getDoc` en travers) et
// `stopClientRunBeat` (synchrone). Un run assez court pour se terminer avant que le
// `getDoc` ne réponde ne doit JAMAIS produire un `running` par-dessus l'issue déjà connue,
// ni écraser un run serveur qui aurait entre-temps gagné la place (trap #2).
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Documents `setDoc` observés, dans l'ordre. */
const writes: Record<string, unknown>[] = []
/** Résout manuellement le `getDoc` de `startClientRunBeat`, pour rejouer la course. */
let resolveGetDoc: ((v: { data: () => unknown }) => void) | null = null

vi.mock('@/lib/firebase/config', () => ({ db: {} }))
vi.mock('@/features/access/useWorkspaceUid', () => ({ getWorkspaceUid: () => 'u1' }))
vi.mock('./runContext', () => ({ useRunContext: { getState: () => ({ nodeStates: {} }) } }))
vi.mock('../persistence/workflow.store', () => ({ useWorkflowStore: { getState: () => ({ current: null }) } }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  getDoc: vi.fn(() => new Promise((resolve) => { resolveGetDoc = resolve })),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    writes.push({ ...data, __path: ref.path })
  }),
}))

const { startClientRunBeat, stopClientRunBeat } = await import('./publishClientRun')

beforeEach(() => { writes.length = 0; resolveGetDoc = null })

describe('course entre startClientRunBeat et stopClientRunBeat', () => {
  it('un run terminé avant la réponse du getDoc n’écrit jamais "running" ensuite', async () => {
    const started = startClientRunBeat('wf-1', 'run-1')
    stopClientRunBeat('wf-1', 'run-1', 'success')      // la place n'est pas encore confirmée
    resolveGetDoc?.({ data: () => undefined })          // document libre : la place est gagnée
    await started

    expect(writes).toHaveLength(1)
    expect(writes[0].status).toBe('success')
    expect(writes[0].endedAt).toBeDefined()
  })

  it('ne piétine pas un run serveur vivant même si stop() a couru pendant la lecture', async () => {
    const started = startClientRunBeat('wf-1', 'run-1')
    stopClientRunBeat('wf-1', 'run-1', 'success')
    // Un cron a gagné la place entre-temps : document occupé, battement récent.
    resolveGetDoc?.({ data: () => ({ runId: 'cron-9', origin: 'server', beatAt: Date.now() }) })
    await started

    expect(writes).toHaveLength(0)
  })
})
