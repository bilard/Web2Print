import { useCallback, useRef, useState } from 'react'
import { fetchSourceHtml } from '@/features/scraping-templates/fetchSourceHtml'
import { getApiKey } from '@/lib/apiKeys'
import { recordScrapeUsage } from '@/features/stats/aiUsageTracking'
import { RESELLER_HOSTS } from './useJina'
import { parseStructuredDataAny } from './core/structuredData'
import { parsePromoPricing } from './core/parsers/parseOriginalPrice'

/**
 * Sondeur de prix des résultats de recherche : scrape RÉEL mais léger.
 * 1. HTML via la Cloud Function `fetchPageHtml` (gratuit) → prix JSON-LD
 *    (Schema.org `offers`) + barré réconcilié depuis le markup.
 * 2. Si le site bloque le fetch serveur (anti-bot Castorama/LM…) ou n'expose
 *    pas son prix : escalade Jina Reader en mode HTML (rendu navigateur,
 *    usage compté dans le chip coût). Pas de Firecrawl/Bright Data ici —
 *    le scrape « Produit complet » garde la cascade lourde.
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

/** HTML rendu via Jina Reader (escalade anti-bot). Usage Jina comptabilisé.
 *  Même traitement que `jinaRead` : les gros revendeurs FR (Leroy Merlin,
 *  Castorama…) sont derrière DataDome/Akamai → moteur navigateur Chromium de
 *  Jina + attente d'un conteneur produit hydraté, sinon page challenge vide. */
async function fetchHtmlViaJina(url: string, timeoutMs: number): Promise<string | null> {
  const headers: Record<string, string> = { 'X-Return-Format': 'html', Accept: 'text/html' }
  let isProtected = false
  try { isProtected = RESELLER_HOSTS.test(new URL(url).hostname) } catch { /* URL invalide */ }
  if (isProtected) {
    headers['X-Engine'] = 'browser'
    headers['X-Wait-For-Selector'] = 'main, [itemtype*="Product" i], [class*="product" i]'
    headers['X-Timeout'] = '30'
  }
  const jinaKey = getApiKey('jina')
  if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), isProtected ? Math.max(timeoutMs, 45_000) : timeoutMs)
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers, signal: ctrl.signal })
    if (!res.ok) return null
    const html = await res.text()
    recordScrapeUsage({ platform: 'jina', tokens: Math.ceil(html.length / 4) })
    return html
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchPriceForUrl(url: string): Promise<Pick<PriceProbe, 'value' | 'original' | 'name'>> {
  let html = await fetchSourceHtml(url, 12_000)
  let data = html ? parseStructuredDataAny(html) : null
  // Pas de prix via le fetch serveur (anti-bot ou JSON-LD absent) → Jina HTML.
  if (data?.offers?.price == null) {
    const jinaHtml = await fetchHtmlViaJina(url, 30_000)
    const jinaData = jinaHtml ? parseStructuredDataAny(jinaHtml) : null
    if (jinaData) {
      html = jinaHtml
      data = jinaData
    }
  }
  if (!html || !data) return {}
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
