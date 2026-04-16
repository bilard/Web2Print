/**
 * Fetch le HTML rendu d'une URL via des CORS proxies publics. Suffit pour
 * les sites statiques/SSR ; les SPA qui requièrent JS nécessiteront la
 * Cloud Function Puppeteer ajoutée en Phase 3.
 */
export async function fetchSourceHtml(url: string, timeoutMs = 20_000): Promise<string | null> {
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
