// functions/src/scraper/firecrawlProduct.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { firecrawlScrapeProduct } from './firecrawlProduct'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks() })

const ok = (json: unknown) => ({
  ok: true, status: 200,
  json: async () => ({ data: { json } }),
  text: async () => '',
}) as unknown as Response

const err = (status: number, body = 'bad request') => ({
  ok: false, status,
  json: async () => ({}),
  text: async () => body,
}) as unknown as Response

describe('firecrawlScrapeProduct', () => {
  it('remonte vendeur, visuel et prix barré, en normalisant les nombres', async () => {
    globalThis.fetch = vi.fn(async () => ok({
      name: '  Courroie MTD  ', price: '19,90', listPrice: '24.90', currency: 'EUR',
      inStock: true, reference: 'MTD754', seller: '  Ets Dupont  ',
      image: 'https://m.test/i/1.jpg',
    })) as unknown as typeof fetch
    expect(await firecrawlScrapeProduct('https://m.test/p/1', 'k')).toEqual({
      name: 'Courroie MTD', price: 19.9, listPrice: 24.9, currency: 'EUR',
      inStock: true, reference: 'MTD754', seller: 'Ets Dupont', image: 'https://m.test/i/1.jpg',
    })
  })

  it('écarte une image relative — elle pointerait vers l’application elle-même', async () => {
    globalThis.fetch = vi.fn(async () => ok({ price: 9, image: '/img/p/1.jpg' })) as unknown as typeof fetch
    expect((await firecrawlScrapeProduct('https://m.test/p/1', 'k'))?.image).toBeUndefined()
  })

  /** Installe un faux `fetch` et RETIENT les corps envoyés, dans l'ordre des appels. */
  function capture(...responses: Response[]): { bodies: Record<string, unknown>[]; calls: () => number } {
    const bodies: Record<string, unknown>[] = []
    let n = 0
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      return responses[Math.min(n++, responses.length - 1)]
    }) as unknown as typeof fetch
    return { bodies, calls: () => n }
  }

  it('envoie l’action anti-mur-de-consentement avant l’extraction', async () => {
    const cap = capture(ok({ price: 9 }))
    await firecrawlScrapeProduct('https://www.amazon.fr/dp/B000', 'k')
    const body = cap.bodies[0] as { actions: { type: string; script: string }[]; location: unknown }
    expect(body.actions[0].type).toBe('executeJavascript')
    expect(body.actions[0].script).toContain('sp-cc-accept')
    expect(body.location).toEqual({ country: 'FR', languages: ['fr-FR'] })
  })

  it('⚠ REJOUE SANS ACTIONS si l’API les refuse — ne jamais casser ce qui marchait', async () => {
    // cdiscount et manomano passaient déjà sans actions : une tentative refusée ne doit
    // pas les faire tomber. Deux appels, le second nu, et le résultat est bien rendu.
    const cap = capture(err(400, 'actions not supported'), ok({ price: 12.5, name: 'X' }))
    expect(await firecrawlScrapeProduct('https://www.cdiscount.com/f-1.html', 'k')).toMatchObject({ price: 12.5 })
    expect(cap.calls()).toBe(2)
    expect(cap.bodies[1].actions).toBeUndefined()
    expect(cap.bodies[1].location).toBeUndefined()
  })

  it('ne rejoue PAS sur un 429 : ce n’est pas la requête qui est en cause', async () => {
    const cap = capture(err(429, 'rate limited'))
    expect(await firecrawlScrapeProduct('https://m.test/p/1', 'k')).toBeNull()
    expect(cap.calls()).toBe(1)
  })
})
