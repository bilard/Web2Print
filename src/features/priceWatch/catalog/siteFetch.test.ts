import { beforeEach, describe, expect, it, vi } from 'vitest'

const jinaMock = vi.hoisted(() => vi.fn())
const cascadeMock = vi.hoisted(() => vi.fn())
const bdMock = vi.hoisted(() => vi.fn())
const fcMock = vi.hoisted(() => vi.fn())
const keyMock = vi.hoisted(() => vi.fn(() => ''))
vi.mock('@/features/scraping-templates/fetchSourceHtml', () => ({
  fetchJinaHtml: jinaMock,
  fetchSourceHtmlWithEngine: cascadeMock,
}))
vi.mock('@/features/scraping/core/brightDataFallback', () => ({
  brightDataScrapeHtml: bdMock,
}))
vi.mock('@/features/scraping/core/firecrawlFallback', () => ({
  firecrawlScrapeHtml: fcMock,
}))
vi.mock('@/lib/apiKeys', () => ({ getApiKey: keyMock }))
const baMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/scraping/core/browserAct', () => ({ runBrowserActWorkflow: baMock }))
const authMock = vi.hoisted(() => vi.fn())
vi.mock('./authFetchClient', () => ({ fetchAuthHtml: authMock }))

import { buildSiteFetcher } from './siteFetch'
import { parseListingGeneric } from './genericListing'

beforeEach(() => {
  jinaMock.mockReset(); cascadeMock.mockReset(); bdMock.mockReset(); fcMock.mockReset()
  authMock.mockReset(); baMock.mockReset(); keyMock.mockReset(); keyMock.mockReturnValue('')
})

describe('buildSiteFetcher', () => {
  it('défaut (auto) : cascade standard, moteur rapporté depuis le palier utilisé', async () => {
    cascadeMock.mockResolvedValue({ html: '<html>ok</html>', engine: 'cloudFunction' })
    const f = buildSiteFetcher(undefined)
    expect(f.connectorId).toBe('jina')
    expect(await f.fetchHtml('https://a.fr')).toBe('<html>ok</html>')
    expect(f.lastEngine()).toBe('cloudFunction')
    expect(jinaMock).not.toHaveBeenCalled()
    expect(bdMock).not.toHaveBeenCalled()
  })

  it("forçage 'jina' : Jina seul, jamais la cascade", async () => {
    jinaMock.mockResolvedValue('<html>jina</html>')
    const f = buildSiteFetcher('jina')
    expect(await f.fetchHtml('https://a.fr')).toBe('<html>jina</html>')
    expect(f.lastEngine()).toBe('jina')
    expect(cascadeMock).not.toHaveBeenCalled()
  })

  it("forçage 'brightdata' : Bright Data seul, pastille brightdata", async () => {
    bdMock.mockResolvedValue('<html>bd</html>')
    const f = buildSiteFetcher('brightdata')
    expect(f.connectorId).toBe('brightdata')
    expect(await f.fetchHtml('https://a.fr')).toBe('<html>bd</html>')
    expect(f.lastEngine()).toBe('brightdata')
    expect(cascadeMock).not.toHaveBeenCalled()
    expect(jinaMock).not.toHaveBeenCalled()
  })

  it("forçage 'firecrawl' : scroll grille + pastille firecrawl", async () => {
    keyMock.mockReturnValue('fc-key')
    fcMock.mockResolvedValue('<html>fc</html>')
    const f = buildSiteFetcher('firecrawl')
    expect(f.connectorId).toBe('firecrawl')
    expect(await f.fetchHtml('https://a.fr')).toBe('<html>fc</html>')
    expect(fcMock).toHaveBeenCalledWith('https://a.fr', 'fc-key', { scroll: true })
    expect(f.lastEngine()).toBe('firecrawl')
    expect(cascadeMock).not.toHaveBeenCalled()
  })

  it("forçage 'firecrawl' sans clé : erreur claire (pas de repli silencieux)", async () => {
    const f = buildSiteFetcher('firecrawl')
    await expect(f.fetchHtml('https://a.fr')).rejects.toThrow(/clé absente/i)
  })

  it('auth : passe par la CF authentifiée avec le host configuré (pas dérivé de l’URL)', async () => {
    authMock.mockResolvedValue('<html>connecté</html>')
    const f = buildSiteFetcher(undefined, { auth: true, host: 'progarden.fr' })
    expect(await f.fetchHtml('https://www.progarden.fr/101-abc')).toBe('<html>connecté</html>')
    expect(authMock).toHaveBeenCalledWith('https://www.progarden.fr/101-abc', 'progarden.fr')
    expect(f.lastEngine()).toBe('authenticated')
    expect(cascadeMock).not.toHaveBeenCalled()
  })

  it('auth prime sur le moteur forcé (les prix ne sont visibles que connecté)', async () => {
    authMock.mockResolvedValue('<html>ok</html>')
    const f = buildSiteFetcher('brightdata', { auth: true, host: 'progarden.fr' })
    await f.fetchHtml('https://progarden.fr/x')
    expect(authMock).toHaveBeenCalled()
    expect(bdMock).not.toHaveBeenCalled()
  })

  it('échec : lastEngine reste undefined (rien à persister)', async () => {
    cascadeMock.mockResolvedValue(null)
    const f = buildSiteFetcher(undefined)
    expect(await f.fetchHtml('https://a.fr')).toBeNull()
    expect(f.lastEngine()).toBeUndefined()
  })
})

describe('moteur BrowserAct', () => {
  it('exige un bot : sans lui, l’erreur explique POURQUOI (pas de primitive « lis cette URL »)', () => {
    expect(() => buildSiteFetcher('browseract')).toThrow(/bot/i)
  })

  it('annonce la pastille de connecteur BrowserAct', () => {
    expect(buildSiteFetcher('browseract', { botId: 'wf_123' }).connectorId).toBe('browseract')
  })
})

describe('BrowserAct — disjoncteur', () => {
  // Relevé en prod : un bot qui n'aboutit jamais coûtait 5 min PAR PAGE, soit 100 min
  // pour un seul site avant d'atteindre le plafond d'appels — run bloqué, aucun résultat.
  it('abandonne le site dès la PREMIÈRE exécution non terminée', async () => {
    const calls: string[] = []
    keyMock.mockReturnValue('k')
    baMock.mockImplementation(async (_k: string, _b: string, p: Record<string, string>) => {
      calls.push(p.url)
      return { status: 'running' } // jamais 'finished' : bot non publié / paramètre absent
    })
    const f = buildSiteFetcher('browseract', { botId: 'wf_1' })
    expect(await f.fetchHtml('https://x.fr/1')).toBeNull()
    expect(await f.fetchHtml('https://x.fr/2')).toBeNull()
    expect(await f.fetchHtml('https://x.fr/3')).toBeNull()
    expect(calls).toEqual(['https://x.fr/1']) // une seule tentative, pas trois
  })

  it('une exécution aboutie alimente la moisson (fiches déduites)', async () => {
    keyMock.mockReturnValue('k')
    baMock.mockResolvedValue({
      status: 'finished',
      output: JSON.stringify([
        { designation: 'Courroie A97', montant: '24,90 €', page: 'https://x.fr/a97' },
        { designation: 'Lame 45 cm', montant: '18,00 €', page: 'https://x.fr/l45' },
      ]),
    })
    const html = await buildSiteFetcher('browseract', { botId: 'wf_1' }).fetchHtml('https://x.fr/liste')
    expect(html).toBeTruthy()
    expect(parseListingGeneric(html!, 'https://x.fr/liste')).toHaveLength(2)
  })
})
