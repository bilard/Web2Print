const DEFAULT_UA =
  'Mozilla/5.0 (compatible; Web2PrintBot/1.0; +https://web2print.app/bot)'

export async function fetchHtml(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}
