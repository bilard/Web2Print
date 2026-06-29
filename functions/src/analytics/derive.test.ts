import { describe, it, expect } from 'vitest'
import { deriveArea, deriveDevice, deriveOs, deriveBrowser, normalizeCity, normalizeRef, isBot, buildEventDoc } from './derive'

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

describe('deriveOs', () => {
  it('détecte iOS', () => expect(deriveOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('iOS'))
  it('détecte Android', () => expect(deriveOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('Android'))
  it('détecte Windows', () => expect(deriveOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows'))
  it('détecte macOS', () => expect(deriveOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macOS'))
  it('détecte Linux', () => expect(deriveOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux'))
  it('null si inconnu', () => expect(deriveOs('curl/8.0')).toBeNull())
})

describe('deriveBrowser', () => {
  it('détecte Edge avant Chrome', () =>
    expect(deriveBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120')).toBe('Edge'))
  it('détecte Chrome', () =>
    expect(deriveBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36')).toBe('Chrome'))
  it('détecte Safari (pas Chrome)', () =>
    expect(deriveBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605 Version/17.0 Safari/605')).toBe('Safari'))
  it('détecte Firefox', () => expect(deriveBrowser('Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/121.0')).toBe('Firefox'))
  it('null si inconnu', () => expect(deriveBrowser('curl/8.0')).toBeNull())
})

describe('normalizeCity', () => {
  it('décode et met en titre', () => expect(normalizeCity('san%20francisco')).toBe('San Francisco'))
  it('null si vide', () => expect(normalizeCity('')).toBeNull())
  it('null si absent', () => expect(normalizeCity(undefined)).toBeNull())
})

describe('normalizeRef', () => {
  it('extrait le domaine sans www', () =>
    expect(normalizeRef('https://www.google.com/search?q=x')).toBe('google.com'))
  it('null si vide', () => expect(normalizeRef(undefined)).toBeNull())
  it('ne jette pas sur une entrée invalide', () => expect(normalizeRef('pas-une-url')).toBeNull())
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
    expect(doc).toMatchObject({ path: '/promo', area: 'promo', device: 'mobile', os: 'iOS', browser: null, ref: 'google.com', country: 'FR', city: null, vid: 'v1', sid: 's1' })
  })
  it('dérive os/navigateur et ville depuis les en-têtes', () => {
    const doc = buildEventDoc(
      { path: '/promo', vid: 'v1', sid: 's1' },
      { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', referer: undefined, country: 'FR', city: 'lyon' },
    )
    expect(doc).toMatchObject({ os: 'Windows', browser: 'Chrome', city: 'Lyon' })
  })
  it('rejette un payload sans path', () =>
    expect(buildEventDoc({ vid: 'v1', sid: 's1' }, headers)).toBeNull())
  it('rejette un bot', () =>
    expect(buildEventDoc({ path: '/promo', vid: 'v1', sid: 's1' }, { ...headers, ua: 'Googlebot/2.1' })).toBeNull())
  it('rejette un payload sans vid', () =>
    expect(buildEventDoc({ path: '/promo', sid: 's1' }, headers)).toBeNull())
  it('rejette un payload sans sid', () =>
    expect(buildEventDoc({ path: '/promo', vid: 'v1' }, headers)).toBeNull())
  it('rejette un path non-string', () =>
    expect(buildEventDoc({ path: 42, vid: 'v1', sid: 's1' } as any, headers)).toBeNull())
  it('rejette un path sans slash initial', () =>
    expect(buildEventDoc({ path: 'promo', vid: 'v1', sid: 's1' }, headers)).toBeNull())
})
