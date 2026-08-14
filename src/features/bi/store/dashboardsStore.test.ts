import { describe, it, expect } from 'vitest'
import { assertWritable, dashboardDoc } from './dashboardsStore'
import { DASHBOARD_VERSION, MAX_DASHBOARD_BYTES, parseDashboard, replacePage, type Dashboard, type DashboardDraft } from '../types'

const base: DashboardDraft = {
  id: 'd1', name: 'Complétude', accountId: 'acme', workspaceUid: 'u1',
  version: DASHBOARD_VERSION, createdAt: 1, updatedAt: 2, createdBy: 'u1',
  tiles: [], layout: [], filters: [],
}

describe('garde-fous d’écriture', () => {
  it('laisse passer un tableau de bord ordinaire', () => {
    expect(() => assertWritable(base)).not.toThrow()
  })

  it('REFUSE un document trop lourd AVANT l’envoi, avec un message lisible', () => {
    // ⚠ Firestore refuse tout document au-delà de 1 048 576 octets. Sans ce garde-fou,
    // l'écriture échouerait côté serveur et l'écran laisserait croire à un enregistrement.
    const fat: DashboardDraft = { ...base, description: 'x'.repeat(MAX_DASHBOARD_BYTES) }
    expect(() => assertWritable(fat)).toThrow(/trop volumineux/i)
  })

  it('range les tableaux de bord sous l’ESPACE DE TRAVAIL, pas sous l’identité', () => {
    expect(dashboardDoc('workspace-1', 'd1')).toBe('users/workspace-1/biDashboards/d1')
  })
})

// ⚠⚠ Ce que l'ÉCRITURE conserve. Toute écriture du module passe par `saveDashboard`, donc
// par `parseDashboard` : un champ absent du schéma zod y serait retiré EN SILENCE, et pas
// seulement lors de l'écriture qui le pose — n'importe quel déplacement de tuile
// (`persistLayout` → `setDoc`, qui REMPLACE) effacerait le choix de base fait juste avant.
describe('Base source retenue par le tableau de bord', () => {
  const board: Dashboard = {
    ...base, pages: [{ id: 'p1', name: 'Complétude', tiles: [], layout: [] }],
    sourceDbId: 'db1', sourceDbName: 'Catalogue_GSB_2026', sourceSheetName: 'Prix',
  }

  it('⚠⚠ survit à une écriture qui ne la concerne pas (déplacement d’une tuile)', () => {
    const written = parseDashboard({ ...replacePage(board, 'p1', { layout: [] }), updatedAt: 3 })
    expect(written.sourceDbId).toBe('db1')
    expect(written.sourceDbName).toBe('Catalogue_GSB_2026')
  })

  it('⚠ un tableau enregistré AVANT ce champ reste lisible', () => {
    const { sourceDbId: _a, sourceDbName: _b, ...legacy } = board
    const parsed = parseDashboard(legacy)
    expect(parsed.sourceDbId).toBeUndefined()
    expect(parsed.name).toBe('Complétude')
  })

  it('le choix s’efface : le champ part du document, on retombe sur la feuille ouverte', () => {
    expect(parseDashboard({ ...board, sourceDbId: undefined }).sourceDbId).toBeUndefined()
  })
})
