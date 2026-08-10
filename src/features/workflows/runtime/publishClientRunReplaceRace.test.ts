// C1 — fenêtre DIFFÉRENTE de celle couverte par publishClientRunRace.test.ts : ici, le run
// se termine PENDANT que le tout premier `setDoc` (le `replace` de démarrage, déjà "owned")
// est encore en vol — pas pendant le `getDoc` qui précède. `owned` est déjà vrai à ce
// moment-là, donc `stopClientRunBeat` écrit directement l'issue ; sans garde après ce
// `await`, `startClientRunBeat` reprenait la main ensuite et posait un minuteur qui
// républie "running" toutes les 5 s pour toujours (le doc ne se stabilise jamais).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const writes: Record<string, unknown>[] = []
/** Résolveurs des `setDoc` volontairement laissés EN VOL, pour rejouer la course. */
const pendingSetDoc: (() => void)[] = []

vi.mock('@/lib/firebase/config', () => ({ db: {} }))
vi.mock('@/features/access/useWorkspaceUid', () => ({ getWorkspaceUid: () => 'u1' }))
vi.mock('./runContext', () => ({ useRunContext: { getState: () => ({ nodeStates: {} }) } }))
vi.mock('../persistence/workflow.store', () => ({ useWorkflowStore: { getState: () => ({ current: null }) } }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  getDoc: vi.fn(async () => ({ data: () => undefined })),   // document libre : la place est gagnée
  setDoc: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
    writes.push({ ...data, __path: ref.path })
    return new Promise<void>((resolve) => { pendingSetDoc.push(resolve) })
  }),
}))

const { startClientRunBeat, stopClientRunBeat, CLIENT_BEAT_INTERVAL_MS } = await import('./publishClientRun')

beforeEach(() => {
  writes.length = 0
  pendingSetDoc.length = 0
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers() })

describe('run terminé pendant le setDoc de démarrage (place déjà gagnée)', () => {
  it('ne pose jamais le minuteur : "running" n’est jamais républié par-dessus l’issue', async () => {
    const started = startClientRunBeat('wf-1', 'run-1')
    // Laisse le `getDoc` résoudre et le premier `setDoc` (replace, "running") s'engager.
    await vi.advanceTimersByTimeAsync(0)
    expect(writes).toHaveLength(1)
    expect(writes[0].status).toBe('running')

    // Le run se termine MAINTENANT — pendant que ce premier setDoc est encore en vol.
    stopClientRunBeat('wf-1', 'run-1', 'success')
    expect(writes).toHaveLength(2)   // l'issue a été écrite tout de suite (owned était vrai)

    // Libère les deux écritures en vol : `startClientRunBeat` reprend la main.
    pendingSetDoc.splice(0).forEach((resolve) => resolve())
    await vi.advanceTimersByTimeAsync(0)
    await started

    // Si le minuteur avait quand même été posé, il aurait républié "running" ici.
    await vi.advanceTimersByTimeAsync(CLIENT_BEAT_INTERVAL_MS + 1_000)
    expect(writes).toHaveLength(2)
    expect(writes[1].status).toBe('success')
    expect(writes[1].endedAt).toBeDefined()
  })
})
