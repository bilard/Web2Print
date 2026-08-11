// functions/src/priceWatch/catalog/serverFetcher.test.ts
// PARITÉ du canal de lecture entre le cron et le run interactif. Le lecteur serveur
// ignorait le moteur « Firecrawl » : un site ainsi réglé était lu en DIRECT et anonyme
// à chaque tick, sans avertissement — le réglage n'existait que dans le navigateur.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const bdMock = vi.hoisted(() => vi.fn())
const fcMock = vi.hoisted(() => vi.fn())
const keyMock = vi.hoisted(() => vi.fn())
const plainMock = vi.hoisted(() => vi.fn())
vi.mock('../../workflow/brightData', () => ({ brightDataRead: bdMock }))
vi.mock('../../scraper/firecrawlHtml', () => ({ firecrawlScrapeHtml: fcMock }))
vi.mock('../../workflow/apiKeys', () => ({ getUserApiKey: keyMock }))
vi.mock('../../scraper/fetchHtml', () => ({ fetchHtml: plainMock }))
vi.mock('../../scraper/prestashopLogin', () => ({ prestashopLogin: vi.fn(), fetchWithJar: vi.fn() }))
vi.mock('../../scraper/siteCredentials', () => ({ getSiteCredentials: vi.fn() }))

import { buildServerFetcher } from './serverFetcher'

const site = (engine?: string) => ({ id: 's', domain: 'a.fr', fields: ['price'], ...(engine ? { engine } : {}) }) as never

beforeEach(() => {
  bdMock.mockReset(); fcMock.mockReset(); keyMock.mockReset(); plainMock.mockReset()
})

describe('buildServerFetcher', () => {
  it('sans moteur forcé : lecture directe, pastille cloudFunction', async () => {
    plainMock.mockResolvedValue('<html>direct</html>')
    const f = buildServerFetcher('u1', site())
    expect(await f.fetchHtml('https://a.fr')).toBe('<html>direct</html>')
    expect(f.lastEngine()).toBe('cloudFunction')
    expect(fcMock).not.toHaveBeenCalled()
  })

  it("forçage 'firecrawl' : clé de l'utilisateur, défilement de grille, pastille firecrawl", async () => {
    keyMock.mockResolvedValue('fc-key')
    fcMock.mockResolvedValue('<html>fc</html>')
    const f = buildServerFetcher('u1', site('firecrawl'))
    expect(await f.fetchHtml('https://a.fr/cat')).toBe('<html>fc</html>')
    expect(f.lastEngine()).toBe('firecrawl')
    expect(keyMock).toHaveBeenCalledWith('u1', 'firecrawl')
    expect(fcMock).toHaveBeenCalledWith('https://a.fr/cat', 'fc-key', { scroll: true })
    // Le moteur forcé est EXCLUSIF : jamais de repli direct silencieux.
    expect(plainMock).not.toHaveBeenCalled()
  })

  it("forçage 'firecrawl' sans clé : rien, et surtout PAS une lecture directe", async () => {
    keyMock.mockResolvedValue('')
    const f = buildServerFetcher('u1', site('firecrawl'))
    expect(await f.fetchHtml('https://a.fr')).toBeNull()
    expect(fcMock).not.toHaveBeenCalled()
    expect(plainMock).not.toHaveBeenCalled()
  })

  it("forçage 'firecrawl' en échec : page abandonnée, la moisson enchaîne", async () => {
    keyMock.mockResolvedValue('fc-key')
    fcMock.mockRejectedValue(new Error('402'))
    const f = buildServerFetcher('u1', site('firecrawl'))
    expect(await f.fetchHtml('https://a.fr')).toBeNull()
    expect(plainMock).not.toHaveBeenCalled()
  })

  it("forçage 'brightdata' : Bright Data seul", async () => {
    bdMock.mockResolvedValue({ html: '<html>bd</html>' })
    const f = buildServerFetcher('u1', site('brightdata'))
    expect(await f.fetchHtml('https://a.fr')).toBe('<html>bd</html>')
    expect(f.lastEngine()).toBe('brightdata')
    expect(plainMock).not.toHaveBeenCalled()
  })
})


// ⚠⚠ Le cron rendait 0 fiche sur tout site derrière un anti-bot, pendant que le même
// site se moissonnait sans peine depuis l'onglet : en mode AUTO, le serveur tentait UN
// fetch direct et abandonnait, là où le navigateur enchaîne direct → Jina → Firecrawl →
// Bright Data. Mesuré sur granit-parts.fr (Cloudflare) : « via Jina, 12 pages » à la
// main, rien du tout la nuit.
describe('mode AUTO — cascade complète, comme au navigateur', () => {
  beforeEach(() => {
    plainMock.mockReset(); fcMock.mockReset(); bdMock.mockReset(); keyMock.mockReset()
    global.fetch = vi.fn(async () => ({ ok: false })) as unknown as typeof fetch
  })

  it('se rabat sur Jina quand le fetch direct est bloqué', async () => {
    plainMock.mockResolvedValue(null)
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => '<html>' + 'x'.repeat(900) + '</html>' })) as unknown as typeof fetch
    const f = buildServerFetcher('u', { id: 's', domain: 'granit-parts.fr' } as never)
    expect(await f.fetchHtml('https://granit-parts.fr/p')).toContain('<html>')
    expect(f.lastEngine()).toBe('jina')
  })

  it('descend jusqu’à Bright Data quand tout le gratuit échoue', async () => {
    plainMock.mockResolvedValue(null)
    keyMock.mockResolvedValue('')            // pas de clé Firecrawl
    bdMock.mockResolvedValue({ html: '<html>bd</html>' })
    const f = buildServerFetcher('u', { id: 's', domain: 'granit-parts.fr' } as never)
    expect(await f.fetchHtml('https://granit-parts.fr/p')).toBe('<html>bd</html>')
    expect(f.lastEngine()).toBe('brightdata')
  })

  it('⚠ ne paie pas un moteur payant quand le direct répond', async () => {
    plainMock.mockResolvedValue('<html>direct</html>')
    const f = buildServerFetcher('u', { id: 's', domain: 'exemple.fr' } as never)
    await f.fetchHtml('https://exemple.fr/p')
    expect(f.lastEngine()).toBe('cloudFunction')
    expect(fcMock).not.toHaveBeenCalled()
    expect(bdMock).not.toHaveBeenCalled()
  })

  it('reste COLLANT sur le moteur payant retenu — sans repayer le gratuit à chaque page', async () => {
    plainMock.mockResolvedValue(null)
    keyMock.mockResolvedValue('')
    bdMock.mockResolvedValue({ html: '<html>bd</html>' })
    const f = buildServerFetcher('u', { id: 's', domain: 'granit-parts.fr' } as never)
    await f.fetchHtml('https://granit-parts.fr/1')
    plainMock.mockClear()
    await f.fetchHtml('https://granit-parts.fr/2')
    expect(plainMock).not.toHaveBeenCalled()
  })
})
