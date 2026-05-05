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

/**
 * Tente un scrape Firecrawl avec un body donné. Retourne le HTML ou null.
 * Loggue l'erreur API si le statut n'est pas OK pour permettre le diagnostic.
 */
async function firecrawlPostHtml(
  body: Record<string, unknown>,
  apiKey: string,
): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(FIRECRAWL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!r.ok) {
      // Loggue le détail pour diagnostic (proxy non supporté, plan, etc.)
      const errText = await r.text().catch(() => '')
      console.warn(`[firecrawl] HTML scrape ${r.status} for ${body.url}:`, errText.slice(0, 300))
      return null
    }
    const json = await r.json() as { data?: { rawHtml?: string; html?: string } }
    return json.data?.rawHtml ?? json.data?.html ?? null
  } catch (e) {
    console.warn('[firecrawl] HTML scrape network error:', e)
    return null
  } finally {
    clearTimeout(t)
  }
}

/**
 * Récupère le HTML rendu d'une page via Firecrawl (post-JS, après hydratation).
 * Utile pour extraire JSON-LD / microdata Schema.org sur les sites où Jina
 * et les CORS proxies gratuits sont bloqués par anti-bot.
 *
 * Stratégie en 2 essais :
 *   1. **Mode `proxy: 'stealth'`** (IPs résidentielles, ~5x crédits) — passe
 *      DataDome / Akamai / Cloudflare. Disponible sur Standard / Growth.
 *   2. **Fallback mode basic** si le 1er échoue (400 = plan insuffisant ou
 *      paramètre rejeté). Coûte 1 crédit, passe les sites anti-bot standard.
 */
export async function firecrawlScrapeHtml(
  url: string,
  apiKey: string,
): Promise<string | null> {
  if (!apiKey) return null

  // Essai 1 : stealth + waitFor (premium)
  const stealthBody = {
    url,
    formats: ['rawHtml'],
    onlyMainContent: false,
    proxy: 'stealth',
    waitFor: 3000,
  }
  const stealthResult = await firecrawlPostHtml(stealthBody, apiKey)
  if (stealthResult) return stealthResult

  // Essai 2 : basic (fallback gracieux si stealth pas disponible / payload invalide)
  console.log('[firecrawl] stealth failed, trying basic mode')
  const basicBody = {
    url,
    formats: ['rawHtml'],
    onlyMainContent: false,
  }
  return firecrawlPostHtml(basicBody, apiKey)
}

async function firecrawlPost(
  body: Record<string, unknown>,
  apiKey: string,
): Promise<FirecrawlResult | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(FIRECRAWL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      console.warn(`[firecrawl] scrape ${r.status} for ${body.url}:`, errText.slice(0, 300))
      return null
    }
    // v2 retourne `data.json` (et plus `data.extract`). On normalise.
    const json = await r.json() as { data?: { markdown?: string; json?: FirecrawlExtract; extract?: FirecrawlExtract } }
    const markdown = json.data?.markdown ?? ''
    const extract = json.data?.json ?? json.data?.extract
    if (!markdown && !extract) return null
    return { markdown, extract }
  } catch (e) {
    console.warn('[firecrawl] scrape network error:', e)
    return null
  } finally {
    clearTimeout(t)
  }
}

export async function firecrawlScrape(
  url: string,
  apiKey: string,
): Promise<FirecrawlResult | null> {
  if (!apiKey) return null

  // Format v2 : `json` (anciennement `extract`) avec schéma INLINE dans le format object.
  // La clé `extract` top-level a disparu, le schema doit être DANS l'item format.
  const jsonFormat = {
    type: 'json',
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
    prompt: 'Extrait la description produit, les avantages clés (bullet points), et toutes les spécifications techniques.',
  }

  // Essai 1 : stealth (premium plan) → bypass DataDome / Akamai
  const stealthBody = {
    url,
    formats: ['markdown', jsonFormat],
    onlyMainContent: true,
    proxy: 'stealth',
    waitFor: 3000,
  }
  const stealthResult = await firecrawlPost(stealthBody, apiKey)
  if (stealthResult) return stealthResult

  // Essai 2 : basic (fallback gracieux — fonctionne sur Hobby tier)
  console.log('[firecrawl] stealth failed, trying basic mode')
  const basicBody = {
    url,
    formats: ['markdown', jsonFormat],
    onlyMainContent: true,
  }
  return firecrawlPost(basicBody, apiKey)
}
