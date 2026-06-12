import { useCallback, useRef, useState } from 'react'
import { fetchSourceHtml } from '@/features/scraping-templates/fetchSourceHtml'
import { parseStructuredDataAny } from './core/structuredData'
import { parsePromoPricing } from './core/parsers/parseOriginalPrice'

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
  /** Prix de vente (JSON-LD `offers.price`). */
  value?: string
  /** Prix barré / avant promo repéré dans le markup (`<del>`, classes old/barré…). */
  original?: string
  /** Nom produit (JSON-LD `name`) — remplace les titres reconstruits depuis l'URL. */
  name?: string
}

const CONCURRENCY = 3

function formatPrice(n: number, currency: string): string {
  try {
    return n.toLocaleString('fr-FR', { style: 'currency', currency })
  } catch {
    return `${n} ${currency}`
  }
}

async function fetchPriceForUrl(url: string): Promise<Pick<PriceProbe, 'value' | 'original' | 'name'>> {
  const html = await fetchSourceHtml(url, 12_000)
  if (!html) return {}
  const data = parseStructuredDataAny(html)
  if (!data) return {}
  const name = data.name?.trim() || undefined
  if (data.offers?.price == null) return { name }
  const currency = data.offers.priceCurrency || 'EUR'
  // Le JSON-LD peut porter le prix AVANT promo (ex. Jardiland) → réconciliation
  // avec le markup (barré + badge remise) pour retrouver le prix payé.
  const { selling, original } = parsePromoPricing(html, data.offers.price)
  return {
    name,
    value: formatPrice(selling, currency),
    original: original != null ? formatPrice(original, currency) : undefined,
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
        let prices: Pick<PriceProbe, 'value' | 'original' | 'name'> = {}
        try {
          prices = await fetchPriceForUrl(url)
        } catch { /* pas de prix structuré — la cellule garde le prix snippet */ }
        if (runIdRef.current !== runId) return
        const u = url
        setPriceByUrl((prev) => ({ ...prev, [u]: { status: 'done', ...prices } }))
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
