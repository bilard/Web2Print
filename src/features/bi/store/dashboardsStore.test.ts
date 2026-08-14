import { describe, it, expect } from 'vitest'
import { assertWritable, dashboardDoc } from './dashboardsStore'
import { DASHBOARD_VERSION, MAX_DASHBOARD_BYTES, type Dashboard } from '../types'

const base: Dashboard = {
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
    const fat: Dashboard = { ...base, description: 'x'.repeat(MAX_DASHBOARD_BYTES) }
    expect(() => assertWritable(fat)).toThrow(/trop volumineux/i)
  })

  it('range les tableaux de bord sous l’ESPACE DE TRAVAIL, pas sous l’identité', () => {
    expect(dashboardDoc('workspace-1', 'd1')).toBe('users/workspace-1/biDashboards/d1')
  })
})
