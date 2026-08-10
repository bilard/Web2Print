import { describe, it, expect } from 'vitest'
import { etaParts } from './opsFormat'

describe('etaParts — une estimation se lit, elle ne se déchiffre pas', () => {
  it('rend heures et minutes au-delà d’une heure', () => {
    expect(etaParts(3 * 3_600_000 + 25 * 60_000)).toEqual({ h: 3, m: 25 })
  })

  it('rend les seules minutes en dessous', () => {
    expect(etaParts(42 * 60_000)).toEqual({ h: 0, m: 42 })
  })

  it('arrondit à la minute supérieure — « 0 min » sur un travail en cours est un mensonge', () => {
    expect(etaParts(20_000)).toEqual({ h: 0, m: 1 })
  })
})
