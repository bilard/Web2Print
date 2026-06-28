import { describe, it, expect } from 'vitest'
import { deriveArea, deriveDevice, normalizeRef, isBot, buildEventDoc } from './derive'

describe('deriveArea', () => {
  it('classe /promo et ses sous-pages', () => {
    expect(deriveArea('/promo')).toBe('promo')
    expect(deriveArea('/promo/offre')).toBe('promo')
  })
  it('classe /docs', () => expect(deriveArea('/docs/intro')).toBe('docs'))
  it('classe les routes app connues', () => {
    expect(deriveArea('/dashboard')).toBe('app')
    expect(deriveArea('/editor/abc')).toBe('app')
  })
  it('tombe sur other pour l\'inconnu', () => expect(deriveArea('/xyz')).toBe('other'))
})

describe('deriveDevice', () => {
  it('détecte mobile', () =>
    expect(deriveDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('mobile'))
  it('détecte tablet', () =>
    expect(deriveDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet'))
  it('défaut desktop', () =>
    expect(deriveDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')).toBe('desktop'))
})

describe('normalizeRef', () => {
  it('extrait le domaine sans www', () =>
    expect(normalizeRef('https://www.google.com/search?q=x')).toBe('google.com'))
  it('null si vide', () => expect(normalizeRef(undefined)).toBeNull())
})

describe('isBot', () => {
  it('repère googlebot', () => expect(isBot('Googlebot/2.1')).toBe(true))
  it('laisse passer un vrai navigateur', () =>
    expect(isBot('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(false))
})

describe('buildEventDoc', () => {
  const headers = { ua: 'Mozilla/5.0 (iPhone)', referer: 'https://google.com/', country: 'FR' }
  it('construit un doc valide', () => {
    const doc = buildEventDoc(
      { path: '/promo', vid: 'v1', sid: 's1', src: null, uid: null }, headers,
    )
    expect(doc).toMatchObject({ path: '/promo', area: 'promo', device: 'mobile', ref: 'google.com', country: 'FR', vid: 'v1', sid: 's1' })
  })
  it('rejette un payload sans path', () =>
    expect(buildEventDoc({ vid: 'v1', sid: 's1' }, headers)).toBeNull())
  it('rejette un bot', () =>
    expect(buildEventDoc({ path: '/promo', vid: 'v1', sid: 's1' }, { ...headers, ua: 'Googlebot/2.1' })).toBeNull())
})
