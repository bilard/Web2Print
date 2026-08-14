import { describe, it, expect } from 'vitest'
import { ageLabel } from './age'

describe('ageLabel', () => {
  const now = 1_000_000

  it('rend un tiret quand RIEN n’est encore arrivé — jamais « 0 s »', () => {
    // ⚠ « 0 s » certifierait une fraîcheur que personne n'a vérifiée.
    expect(ageLabel(null, now)).toBe('—')
  })

  it('compte en secondes sous la minute', () => {
    expect(ageLabel(now - 12_000, now)).toBe('12 s')
  })

  it('passe aux minutes, puis aux heures', () => {
    expect(ageLabel(now - 120_000, now)).toBe('2 min')
    expect(ageLabel(now - 7_200_000, now)).toBe('2 h')
  })

  it('ne descend jamais sous zéro — une horloge en avance ne rend pas un âge négatif', () => {
    expect(ageLabel(now + 5_000, now)).toBe('0 s')
  })
})
