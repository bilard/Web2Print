import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'

const callFetchPageHtml = httpsCallable<{ url: string }, { html: string; length: number }>(
  functions,
  'fetchPageHtml',
  { timeout: 35_000 },
)

/**
 * Fetch le HTML rendu d'une URL. Voie principale : la Cloud Function serveur
 * `fetchPageHtml` (pas de CORS, fiable pour les sites SSR/statiques). Secours :
 * proxies CORS publics (allorigins/corsproxy) — devenus instables (522, plus
 * d'en-tête Access-Control-Allow-Origin), gardés en filet uniquement. Les SPA à
 * challenge anti-bot nécessitent Bright Data (tier 2) ou l'extension Chrome.
 */
export async function fetchSourceHtml(url: string, timeoutMs = 20_000): Promise<string | null> {
  // 1) Cloud Function serveur (gratuite, sans CORS).
  try {
    const res = await callFetchPageHtml({ url })
    const html = res.data?.html
    if (html && html.length > 500) return html
  } catch {
    /* fallback proxies publics */
  }

  // 2) Proxies CORS publics (filet de sécurité).
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ]
  for (const proxyUrl of proxies) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      const res = await fetch(proxyUrl, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) continue
      const html = await res.text()
      if (html && html.length > 500) return html
    } catch {
      /* try next proxy */
    }
  }
  return null
}
