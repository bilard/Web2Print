// functions/src/workflow/runLive.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeRunLive, humanizeError } from './runLive'

// `vi.hoisted` : le spy doit exister AVANT le `vi.mock`, lui-même remonté au-dessus des imports.
const { setSpy } = vi.hoisted(() => ({ setSpy: vi.fn() }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: () => ({ set: setSpy }) }),
  FieldValue: { arrayUnion: (v: unknown) => v },
}))

describe('writeRunLive', () => {
  beforeEach(() => { setSpy.mockReset(); setSpy.mockResolvedValue(undefined) })

  it('fusionne par défaut (progression d’un run en cours)', async () => {
    await writeRunLive('u', 'wf', { status: 'running' })
    expect(setSpy).toHaveBeenCalledWith({ status: 'running' }, { merge: true })
  })

  it('REMPLACE le doc au démarrage d’un run neuf', async () => {
    // Sans remplacement, le merge Firestore conserve les entrées `nodeStates` de nodes
    // SUPPRIMÉS du graphe (affichés « en erreur » à jamais) et un `endedAt` périmé
    // coexistant avec le nouveau `startedAt`.
    await writeRunLive('u', 'wf', { runId: 'r2', nodeStates: { a: 'pending' } }, { replace: true })
    expect(setSpy).toHaveBeenCalledWith({ runId: 'r2', nodeStates: { a: 'pending' } })
  })

  it('n’échoue jamais, même si Firestore lève', async () => {
    setSpy.mockRejectedValueOnce(new Error('boom'))
    await expect(writeRunLive('u', 'wf', { status: 'error' })).resolves.toBeUndefined()
  })
})

describe('humanizeError', () => {
  it('traduit les motifs connus en conservant l’original', () => {
    expect(humanizeError('Insufficient credits')).toContain('Crédits épuisés')
    expect(humanizeError('Insufficient credits')).toContain('Insufficient credits')
  })
  it('renvoie tel quel un motif inconnu', () => {
    expect(humanizeError('erreur maison')).toBe('erreur maison')
  })
})
