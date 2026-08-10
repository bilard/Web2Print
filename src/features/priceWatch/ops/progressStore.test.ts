import { describe, it, expect } from 'vitest'
import { shouldPublish, OPS_WRITE_INTERVAL_MS } from './progressStore'

describe('shouldPublish — un run d’une heure ne doit pas écrire des milliers de fois', () => {
  it('publie la première fois', () => {
    expect(shouldPublish(0, 1_000, false)).toBe(true)
  })

  it('se tait avant l’intervalle', () => {
    expect(shouldPublish(1_000, 1_000 + OPS_WRITE_INTERVAL_MS - 1, false)).toBe(false)
  })

  it('publie une fois l’intervalle écoulé', () => {
    expect(shouldPublish(1_000, 1_000 + OPS_WRITE_INTERVAL_MS, false)).toBe(true)
  })

  it('publie TOUJOURS quand on force — la fin d’un passage ne s’attend pas', () => {
    expect(shouldPublish(1_000, 1_001, true)).toBe(true)
  })
})
