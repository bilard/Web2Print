import { describe, it, expect } from 'vitest'
import { expiredIncidents, newIncidentsSince } from './incidents'
import { OPS_INCIDENT_MAX_AGE_MS } from './opsTypes'

const NOW = 1_700_000_000_000

describe('expiredIncidents', () => {
  it('garde ce qui est dans la fenêtre', () => {
    const list = [{ id: 'a', ts: NOW - 1_000 }, { id: 'b', ts: NOW - OPS_INCIDENT_MAX_AGE_MS + 1 }]
    expect(expiredIncidents(list, NOW)).toEqual([])
  })

  it('désigne ce qui a dépassé quatre-vingt-dix jours', () => {
    const list = [{ id: 'a', ts: NOW - 1_000 }, { id: 'vieux', ts: NOW - OPS_INCIDENT_MAX_AGE_MS - 1 }]
    expect(expiredIncidents(list, NOW)).toEqual(['vieux'])
  })
})

describe('newIncidentsSince', () => {
  it('ne signale RIEN au premier chargement, même avec un journal existant', () => {
    // Liste précédente vide (état initial du hook) + incidents tous antérieurs au montage.
    const current = [{ id: 'a', ts: NOW - 1_000 }, { id: 'b', ts: NOW - OPS_INCIDENT_MAX_AGE_MS }]
    expect(newIncidentsSince([], current, NOW)).toEqual([])
  })

  it('signale un incident survenu après le montage', () => {
    const previous = [{ id: 'a', ts: NOW - 1_000 }]
    const current = [{ id: 'b', ts: NOW + 500 }, ...previous]
    expect(newIncidentsSince(previous, current, NOW)).toEqual([{ id: 'b', ts: NOW + 500 }])
  })

  it('ne resignale pas un incident déjà vu à la comparaison suivante', () => {
    const previous = [{ id: 'b', ts: NOW + 500 }, { id: 'a', ts: NOW - 1_000 }]
    expect(newIncidentsSince(previous, previous, NOW)).toEqual([])
  })

  it("ignore un id nouveau mais horodaté avant le montage (répagination du journal)", () => {
    const previous = [{ id: 'a', ts: NOW - 1_000 }]
    const current = [{ id: 'vieux-pas-encore-vu', ts: NOW - 2_000 }, ...previous]
    expect(newIncidentsSince(previous, current, NOW)).toEqual([])
  })
})
