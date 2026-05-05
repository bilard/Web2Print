import { parseStructuredDataAny, type StructuredProductData } from './structuredData'
import { looksLikeBotChallenge } from '@/features/excel/ai-enrichment/markdownSanitize'
import { firecrawlScrapeHtml } from './firecrawlFallback'
import { isHostKnownBlocked, markHostBlocked } from './brightDataFallback'
import { brightDataScrapeHtml, getLastBrightDataError } from './brightDataFallback'
import { getApiKey } from '@/lib/apiKeys'

const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
]

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<string | null> => {
  const ctrl = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => {
      try { ctrl.abort() } catch { /* ignore */ }
      resolve(null)
    }, timeoutMs)
  })
  try {
    const fetchPromise = (async (): Promise<string | null> => {
      try {
        const r = await fetch(url, { signal: ctrl.signal })
        if (!r || !r.ok) return null
        return await r.text()
      } catch {
        return null
      }
    })()
    return await Promise.race([fetchPromise, timeoutPromise])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

export interface ExtractOptions {
  timeoutMs?: number
}

/** Détecte si un HTML est en fait une page CAPTCHA / challenge bot.
 *  Combine détection sur le markdown extrait ET sur le HTML brut.
 *
 *  Marqueurs URL spécifiques au CHALLENGE (pas au framework) :
 *    - `captcha-delivery.com`, `geo.captcha-delivery` : iframe DataDome challenge
 *    - `cf-browser-verification`, `cdn-cgi/challenge-platform` : Cloudflare challenge
 *    - `js_challenge` : Cloudflare ancienne forme
 *    - `hcaptcha.com`, `recaptcha.net` : iframes de captcha tiers
 *
 *  Note : on ne match PAS le mot brut `datadome` car les sites protégés
 *  injectent le bundle DataDome (`<script src="...datadome.js">`) sur TOUTES
 *  leurs pages, même celles qui passent. C'est uniquement la présence du
 *  challenge actif (iframe `captcha-delivery.com`) qui signale un blocage. */
function htmlLooksLikeChallenge(html: string): boolean {
  if (!html) return false
  const lower = html.slice(0, 4000).toLowerCase()
  if (/captcha-delivery\.com|geo\.captcha|cf-browser-verification|hcaptcha\.com|recaptcha\.net|js_challenge|cdn-cgi\/challenge-platform/.test(lower)) {
    return true
  }
  const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000)
  return looksLikeBotChallenge(bodyText)
}

/**
 * Fetch raw HTML for a URL via cascade de sources et extrait le produit
 * structuré (JSON-LD prioritaire, microdata en fallback).
 *
 * Cascade :
 *   1. CORS proxies gratuits (allorigins, corsproxy.io) — rapide, pas d'auth
 *   2. Jina Reader avec X-Return-Format: html
 *   3. Firecrawl HTML mode — anti-bot stealth (IPs résidentielles, headless réel)
 *   4. Bright Data Web Unlocker (via Cloud Function) — anti-bot premium
 *
 * Court-circuit : si le host est déjà connu pour renvoyer DataDome (cache 24h),
 * on saute directement à Bright Data pour économiser les crédits Firecrawl.
 *
 * Détection captcha : si une source renvoie une page challenge DataDome /
 * Akamai / Cloudflare, on passe à la source suivante immédiatement (au lieu
 * de retourner null sur le parser).
 */
export async function extractStructuredDataFromUrl(
  url: string,
  opts: ExtractOptions = {},
): Promise<StructuredProductData | null> {
  const timeoutMs = opts.timeoutMs ?? 15_000

  // Short-circuit : host déjà identifié comme DataDome → on saute à Bright Data.
  const knownBlocked = isHostKnownBlocked(url)
  if (knownBlocked) {
    console.log('[structured-data] host known blocked, skipping to Bright Data')
  }

  if (!knownBlocked) {
    // 1. CORS proxies gratuits
    for (const proxy of CORS_PROXIES) {
      const html = await fetchWithTimeout(proxy(url), timeoutMs)
      if (!html) continue
      if (htmlLooksLikeChallenge(html)) {
        console.log('[structured-data] CORS proxy returned challenge page — skipping')
        continue
      }
      const data = parseStructuredDataAny(html)
      if (data) return data
    }

    // 2. Jina HTML mode
    const jinaKey = getApiKey('jina')
    const jinaHeaders: Record<string, string> = {
      'X-Return-Format': 'html',
      'Accept': 'text/html',
    }
    if (jinaKey) jinaHeaders['Authorization'] = 'Bearer ' + jinaKey
    const jinaCtrl = new AbortController()
    let jinaTimeout: ReturnType<typeof setTimeout> | undefined
    const jinaTimeoutPromise = new Promise<null>((resolve) => {
      jinaTimeout = setTimeout(() => {
        try { jinaCtrl.abort() } catch { /* ignore */ }
        resolve(null)
      }, timeoutMs)
    })
    try {
      const jinaFetchPromise = (async (): Promise<string | null> => {
        try {
          const r = await fetch('https://r.jina.ai/' + url, { headers: jinaHeaders, signal: jinaCtrl.signal })
          if (!r || !r.ok) return null
          return await r.text()
        } catch {
          return null
        }
      })()
      const html = await Promise.race([jinaFetchPromise, jinaTimeoutPromise])
      if (html && !htmlLooksLikeChallenge(html)) {
        const data = parseStructuredDataAny(html)
        if (data) return data
      } else if (html) {
        console.log('[structured-data] Jina returned challenge page — trying Firecrawl')
      }
    } finally {
      if (jinaTimeout) clearTimeout(jinaTimeout)
    }

    // 3. Firecrawl HTML mode — IPs résidentielles + Stealth
    const firecrawlKey = getApiKey('firecrawl')
    if (firecrawlKey) {
      try {
        const html = await firecrawlScrapeHtml(url, firecrawlKey)
        if (html && !htmlLooksLikeChallenge(html)) {
          const data = parseStructuredDataAny(html)
          if (data) {
            console.log('[structured-data] ✓ Firecrawl HTML mode extracted product data')
            return data
          }
        } else if (html) {
          console.log('[structured-data] Firecrawl also returned challenge page — escalating to Bright Data')
          markHostBlocked(url)
        }
      } catch (err) {
        console.warn('[structured-data] Firecrawl HTML fetch failed:', err)
      }
    }
  }

  // 4. Bright Data Web Unlocker (anti-bot premium via Cloud Function)
  let bdNotConfigured = false
  try {
    const html = await brightDataScrapeHtml(url)
    if (html && !htmlLooksLikeChallenge(html)) {
      const data = parseStructuredDataAny(html)
      if (data) {
        console.log('[structured-data] ✓ Bright Data extracted product data')
        return data
      }
    } else if (html) {
      console.log('[structured-data] Bright Data also returned challenge')
    } else {
      // Pas de HTML → vérifier si c'est parce que BD n'est pas configurée
      const bdErr = getLastBrightDataError()
      if (bdErr?.code === 'not_configured') bdNotConfigured = true
    }
  } catch (err) {
    console.warn('[structured-data] Bright Data fetch failed:', err)
  }

  return null
}
