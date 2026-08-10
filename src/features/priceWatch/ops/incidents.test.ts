import { describe, it, expect } from 'vitest'
import { expiredIncidents } from './incidents'
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
