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

  it('envoie l’action anti-mur-de-consentement avant l’extraction', async () => {
    const spy = vi.fn(async () => ok({ price: 9 }))
    globalThis.fetch = spy as unknown as typeof fetch
    await firecrawlScrapeProduct('https://www.amazon.fr/dp/B000', 'k')
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.actions[0].type).toBe('executeJavascript')
    expect(body.actions[0].script).toContain('sp-cc-accept')
    expect(body.location).toEqual({ country: 'FR', languages: ['fr-FR'] })
  })

  it('⚠ REJOUE SANS ACTIONS si l’API les refuse — ne jamais casser ce qui marchait', async () => {
    // cdiscount et manomano passaient déjà sans actions : une tentative refusée ne doit
    // pas les faire tomber. Deux appels, le second nu, et le résultat est bien rendu.
    const spy = vi.fn()
      .mockResolvedValueOnce(err(400, 'actions not supported'))
      .mockResolvedValueOnce(ok({ price: 12.5, name: 'X' }))
    globalThis.fetch = spy as unknown as typeof fetch
    expect(await firecrawlScrapeProduct('https://www.cdiscount.com/f-1.html', 'k')).toMatchObject({ price: 12.5 })
    expect(spy).toHaveBeenCalledTimes(2)
    expect(JSON.parse((spy.mock.calls[1][1] as RequestInit).body as string).actions).toBeUndefined()
  })

  it('ne rejoue PAS sur un 429 : ce n’est pas la requête qui est en cause', async () => {
    const spy = vi.fn().mockResolvedValue(err(429, 'rate limited'))
    globalThis.fetch = spy as unknown as typeof fetch
    expect(await firecrawlScrapeProduct('https://m.test/p/1', 'k')).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
