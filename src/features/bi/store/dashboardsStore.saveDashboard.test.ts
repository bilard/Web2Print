// ⚠ Fichier séparé de `dashboardsStore.test.ts` : `saveDashboard` traverse `firebase/firestore`,
// qu'il faut mocker AVANT l'import (top-level `vi.mock`) — mélanger avec les tests purs de
// `assertWritable`/`dashboardDoc` aurait forcé à mocker Firestore pour rien.
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Dernier payload passé à `setDoc`, tel qu'écrit — sert à vérifier l'absence des clés `undefined`. */
let written: Record<string, unknown> | null = null

vi.mock('@/lib/firebase/config', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  setDoc: vi.fn(async (_ref: unknown, data: Record<string, unknown>) => { written = data }),
  deleteDoc: vi.fn(async () => {}),
}))

const { saveDashboard } = await import('./dashboardsStore')
const { DASHBOARD_VERSION } = await import('../types')

beforeEach(() => { written = null })

describe('saveDashboard — undefined et Firestore', () => {
  it('écrit sans lever un tableau de bord dont un champ optionnel vaut `undefined`, et le retire du payload', async () => {
    const withExplicitUndefined = {
      id: 'd1', name: 'Complétude', description: undefined, accountId: 'acme', workspaceUid: 'u1',
      version: DASHBOARD_VERSION, createdAt: 1, updatedAt: 2, createdBy: 'u1',
      tiles: [], layout: [], filters: [],
    } as unknown as import('../types').Dashboard

    await expect(saveDashboard('u1', withExplicitUndefined)).resolves.not.toThrow()

    expect(written).not.toBeNull()
    // ⚠ Firestore refuse tout `setDoc` contenant une clé à valeur `undefined` : la clé
    // doit être ABSENTE du payload, pas seulement valoir `undefined`.
    expect(Object.prototype.hasOwnProperty.call(written!, 'description')).toBe(false)
  })
})
