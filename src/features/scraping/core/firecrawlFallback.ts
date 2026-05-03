/**
 * Firecrawl v2 scrape API wrapper.
 * Utilisé en fallback quand Jina retourne un markdown trop pauvre (anti-bot Akamai).
 */

export interface FirecrawlExtract {
  description?: string
  advantages?: string[]
  specs?: Array<{ name: string; value: string }>
}

export interface FirecrawlResult {
  markdown: string
  extract?: FirecrawlExtract
}

const FIRECRAWL_API = 'https://api.firecrawl.dev/v2/scrape'
const TIMEOUT_MS = 60_000

export async function firecrawlScrape(
  url: string,
  apiKey: string,
): Promise<FirecrawlResult | null> {
  if (!apiKey) return null

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(FIRECRAWL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'extract'],
        onlyMainContent: true,
        extract: {
          schema: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              advantages: { type: 'array', items: { type: 'string' } },
              specs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['name', 'value'],
                },
              },
            },
          },
        },
      }),
      signal: ctrl.signal,
    })
    if (!r.ok) return null
    const json = await r.json() as { data?: { markdown?: string; extract?: FirecrawlExtract } }
    const markdown = json.data?.markdown ?? ''
    if (!markdown && !json.data?.extract) return null
    return { markdown, extract: json.data?.extract }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
