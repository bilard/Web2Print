import { useCallback, useRef, useState } from 'react'
import { fetchSourceHtml } from '@/features/scraping-templates/fetchSourceHtml'
import { parseStructuredDataAny } from './core/structuredData'

/**
 * Sondeur de prix des résultats de recherche : scrape RÉEL mais léger.
 * HTML via la Cloud Function `fetchPageHtml` (gratuit, pas de crédits
 * Jina/Firecrawl/Bright Data) puis prix JSON-LD (Schema.org `offers`) —
 * présent sur l'immense majorité des sites e-commerce. Les sites derrière
 * un anti-bot dur n'exposent pas leur JSON-LD ici : la cellule garde alors
 * le prix repéré dans le snippet, et le prix fiable vient du scrape complet.
 */

export interface PriceProbe {
  status: 'loading' | 'done'
  value?: string
}

const CONCURRENCY = 3

async function fetchPriceForUrl(url: string): Promise<string | undefined> {
  const html = await fetchSourceHtml(url, 12_000)
  if (!html) return undefined
  const offers = parseStructuredDataAny(html)?.offers
  if (offers?.price == null) return undefined
  const currency = offers.priceCurrency || 'EUR'
  try {
    return offers.price.toLocaleString('fr-FR', { style: 'currency', currency })
  } catch {
    return `${offers.price} ${currency}`
  }
}

export function useResultPrices() {
  const [priceByUrl, setPriceByUrl] = useState<Record<string, PriceProbe>>({})
  // Invalide les workers d'une recherche précédente (nouvelle recherche = nouveau run)
  const runIdRef = useRef(0)

  const probePrices = useCallback((urls: string[]) => {
    const runId = ++runIdRef.current
    setPriceByUrl(Object.fromEntries(urls.map((u) => [u, { status: 'loading' as const }])))
    const queue = [...urls]
    const worker = async () => {
      for (let url = queue.shift(); url && runIdRef.current === runId; url = queue.shift()) {
        let value: string | undefined
        try {
          value = await fetchPriceForUrl(url)
        } catch { /* pas de prix structuré — la cellule garde le prix snippet */ }
        if (runIdRef.current !== runId) return
        const u = url
        setPriceByUrl((prev) => ({ ...prev, [u]: { status: 'done', value } }))
      }
    }
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker))
  }, [])

  const resetPrices = useCallback(() => {
    runIdRef.current++
    setPriceByUrl({})
  }, [])

  return { priceByUrl, probePrices, resetPrices }
}
