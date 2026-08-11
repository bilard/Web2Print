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
    expect(setSpy).toHaveBeenCalledWith({ status: 'running', beatAt: expect.any(Number) }, { merge: true })
  })

  it('REMPLACE le doc au démarrage d’un run neuf', async () => {
    // Sans remplacement, le merge Firestore conserve les entrées `nodeStates` de nodes
    // SUPPRIMÉS du graphe (affichés « en erreur » à jamais) et un `endedAt` périmé
    // coexistant avec le nouveau `startedAt`.
    await writeRunLive('u', 'wf', { runId: 'r2', nodeStates: { a: 'pending' } }, { replace: true })
    expect(setSpy).toHaveBeenCalledWith({ runId: 'r2', nodeStates: { a: 'pending' }, beatAt: expect.any(Number) })
  })

  // ⚠ Le champ qui manquait : sans lui, le serveur n'horodatait JAMAIS ses écritures et
  // deux écrans se contredisaient sur « est-ce que ça tourne » — un run cron silencieux
  // (le node « Textes » ne journalise que tous les 500 champs) passait pour interrompu.
  it('estampille beatAt à CHAQUE écriture, quelle qu’elle soit', async () => {
    const before = Date.now()
    await writeRunLive('u', 'wf', { status: 'running' })
    const written = setSpy.mock.calls[0]?.[0] as { beatAt: number }
    expect(written.beatAt).toBeGreaterThanOrEqual(before)
  })

  it('ignore un beatAt d’appelant — l’estampille de l’écriture fait foi', async () => {
    // Posé APRÈS `...data` : un appelant qui recopierait un `beatAt` ancien (relecture,
    // rejeu) ferait sinon passer pour muet un run qui vient d'écrire.
    await writeRunLive('u', 'wf', { status: 'running', beatAt: 1 })
    const written = setSpy.mock.calls[0]?.[0] as { beatAt: number }
    expect(written.beatAt).toBeGreaterThan(1)
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
