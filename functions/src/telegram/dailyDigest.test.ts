import { describe, it, expect } from 'vitest'
import { buildDigestText } from './dailyDigest'

describe('buildDigestText', () => {
  it('null quand il n’y a rien à signaler (pas de spam)', () => {
    expect(buildDigestText({ ok: 0, errors: 0, failedNames: [], pendingInbox: 0 })).toBeNull()
  })

  it('résume runs + échecs nommés + inbox', () => {
    const text = buildDigestText({ ok: 3, errors: 2, failedNames: ['Veille prix', 'Export catalogue'], pendingInbox: 1 })
    expect(text).toContain('3 réussis, 2 en échec (Veille prix, Export catalogue)')
    expect(text).toContain('1 message en attente')
  })

  it('limite les noms en échec à 5', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const text = buildDigestText({ ok: 0, errors: 7, failedNames: names, pendingInbox: 0 })!
    expect(text).toContain('(a, b, c, d, e)')
    expect(text).not.toContain('f')
  })

  it('inbox seule suffit à déclencher le digest', () => {
    const text = buildDigestText({ ok: 0, errors: 0, failedNames: [], pendingInbox: 2 })!
    expect(text).toContain('2 messages en attente')
    expect(text).not.toContain('Workflows')
  })
})
