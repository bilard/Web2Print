import { describe, it, expect, beforeEach, vi } from 'vitest'

const jinaRead = vi.fn()
const brightDataScrapeWithDocs = vi.fn()

vi.mock('./useJina', () => ({ jinaRead: (...a: unknown[]) => jinaRead(...a) }))
vi.mock('./core/brightDataFallback', () => ({
  brightDataScrapeWithDocs: (...a: unknown[]) => brightDataScrapeWithDocs(...a),
}))
// Un markdown contenant 'CHALLENGE' est considéré comme un blocage anti-bot.
vi.mock('@/features/excel/ai-enrichment/markdownSanitize', () => ({
  looksLikeBotChallenge: (md: string) => md.includes('CHALLENGE'),
}))

import { readPageWithEscalation } from './readPageWithEscalation'

describe('readPageWithEscalation', () => {
  const log = vi.fn()
  beforeEach(() => {
    jinaRead.mockReset()
    brightDataScrapeWithDocs.mockReset()
    log.mockReset()
  })

  it('renvoie le contenu Jina sans escalade quand Jina marche', async () => {
    jinaRead.mockResolvedValue({ content: 'Produits OK' })
    const res = await readPageWithEscalation('https://x.fr', { listing: true, log })
    expect(res).toEqual({ markdown: 'Produits OK', source: 'jina' })
    expect(brightDataScrapeWithDocs).not.toHaveBeenCalled()
  })

  it('escalade vers Bright Data quand Jina lève une erreur (et expose le HTML brut)', async () => {
    jinaRead.mockRejectedValue(new Error('429 rate limited'))
    brightDataScrapeWithDocs.mockResolvedValue({ markdown: 'Débloqué BD', pdfLinks: [], structuredData: null, html: '<html>brut</html>' })
    const res = await readPageWithEscalation('https://x.fr', { log })
    // Le HTML brut BD est propagé pour le parsing déterministe (JSON-LD ItemList + datalayer).
    expect(res).toEqual({ markdown: 'Débloqué BD', source: 'brightdata', html: '<html>brut</html>' })
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('Jina a échoué'))
  })

  it('escalade quand Jina renvoie une page de challenge anti-bot', async () => {
    jinaRead.mockResolvedValue({ content: 'CHALLENGE please verify' })
    brightDataScrapeWithDocs.mockResolvedValue({ markdown: 'Vrai contenu', pdfLinks: [], structuredData: null })
    const onConnector = vi.fn()
    const res = await readPageWithEscalation('https://x.fr', { log, onConnector })
    expect(res.source).toBe('brightdata')
    expect(res.markdown).toBe('Vrai contenu')
    // Le connecteur est remonté en live : Jina tenté, puis Bright Data.
    expect(onConnector.mock.calls.map((c) => c[0])).toEqual(['jina', 'brightdata'])
  })

  it('renvoie vide/null quand tous les connecteurs restent bloqués', async () => {
    jinaRead.mockResolvedValue({ content: '' })
    brightDataScrapeWithDocs.mockResolvedValue({ markdown: 'CHALLENGE', pdfLinks: [], structuredData: null })
    const res = await readPageWithEscalation('https://x.fr', { log })
    expect(res).toEqual({ markdown: '', source: null })
  })
})
