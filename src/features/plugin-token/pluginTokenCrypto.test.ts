import { describe, it, expect } from 'vitest'
import { generatePluginToken, sha256Hex } from './pluginTokenCrypto'

describe('generatePluginToken', () => {
  it('préfixe w2p_ et base64url (pas de +/= )', () => {
    const t = generatePluginToken()
    expect(t.startsWith('w2p_')).toBe(true)
    expect(t.slice(4)).toMatch(/^[A-Za-z0-9_-]+$/)
  })
  it('est aléatoire (deux appels diffèrent)', () => {
    expect(generatePluginToken()).not.toBe(generatePluginToken())
  })
})

describe('sha256Hex', () => {
  it('hash sha256 connu de "abc"', async () => {
    expect(await sha256Hex('abc'))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('64 chars hex', async () => {
    expect(await sha256Hex('w2p_xyz')).toMatch(/^[0-9a-f]{64}$/)
  })
})
