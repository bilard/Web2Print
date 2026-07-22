// src/features/priceWatch/catalog/siteFetch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const jinaMock = vi.hoisted(() => vi.fn())
const cascadeMock = vi.hoisted(() => vi.fn())
const bdMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/scraping-templates/fetchSourceHtml', () => ({
  fetchJinaHtml: jinaMock,
  fetchSourceHtmlWithEngine: cascadeMock,
}))
vi.mock('@/features/scraping/core/brightDataFallback', () => ({
  brightDataScrapeHtml: bdMock,
}))

import { buildSiteFetcher } from './siteFetch'

beforeEach(() => {
  jinaMock.mockReset(); cascadeMock.mockReset(); bdMock.mockReset()
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

  it('échec : lastEngine reste undefined (rien à persister)', async () => {
    cascadeMock.mockResolvedValue(null)
    const f = buildSiteFetcher(undefined)
    expect(await f.fetchHtml('https://a.fr')).toBeNull()
    expect(f.lastEngine()).toBeUndefined()
  })
})
