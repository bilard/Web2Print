// functions/src/scraper/firecrawlHtml.ts
// Récupération du HTML RENDU (post-JS) d'une page via Firecrawl v2 /scrape — jumeau
// SERVEUR de `src/features/scraping/core/firecrawlFallback.ts`.
//
// Le client savait déjà lire une page liste en Firecrawl (moteur forcé d'un site), pas le
// cron : `serverFetcher` ne connaissait que l'accès connecté, Bright Data et Jina, et
// retombait donc en lecture DIRECTE et anonyme pour un site réglé sur Firecrawl — sans
// rien dire. Même famille de panne que le budget de pages perdu par le jumeau serveur :
// un réglage qui a l'air appliqué, mais que seul le run interactif honore.
import * as logger from 'firebase-functions/logger'
import { creditsExhausted, isCreditError, tripCredits } from './creditBreaker'

const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape'

/** Rendu JS + défilement : bien plus lent qu'un fetch HTTP. Aligné sur `firecrawlProduct`. */
const DEFAULT_TIMEOUT_MS = 70_000

/**
 * Actions de défilement pour une page LISTE : une grille lazy-load n'affiche que son haut
 * tant qu'on n'a pas fait défiler. Sans ça, la moisson n'indexerait qu'une poignée de
 * fiches par page — le contraire du but recherché.
 */
const SCROLL_ACTIONS = [
  { type: 'wait', milliseconds: 2500 },
  ...Array.from({ length: 10 }, () => [
    { type: 'scroll', direction: 'down' },
    { type: 'wait', milliseconds: 1200 },
  ]).flat(),
  { type: 'wait', milliseconds: 1500 },
]

async function postHtml(body: Record<string, unknown>, apiKey: string, timeoutMs: number): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(FIRECRAWL_SCRAPE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (isCreditError(res.status, text)) tripCredits('firecrawl', `${res.status} ${text.slice(0, 120)}`)
      else logger.warn(`[firecrawl-html] ${res.status} pour ${String(body.url)} : ${text.slice(0, 200)}`)
      return null
    }
    const json = (await res.json()) as { data?: { rawHtml?: string; html?: string } }
    const html = json.data?.rawHtml ?? json.data?.html ?? ''
    return html.length > 500 ? html : null
  } catch (e) {
    logger.warn(`[firecrawl-html] erreur réseau pour ${String(body.url)} : ${e instanceof Error ? e.message : e}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * HTML rendu d'une page. Deux essais, comme côté client : `stealth` (IPs résidentielles,
 * ~5× crédits — franchit DataDome/Akamai/Cloudflare) puis repli `basic` si le plan ne
 * l'autorise pas. Renvoie null sans clé, sur crédits épuisés, ou si rien d'exploitable :
 * l'appelant décide alors s'il cascade ou s'il abandonne la page.
 */
export async function firecrawlScrapeHtml(
  url: string,
  apiKey: string,
  opts: { scroll?: boolean; timeoutMs?: number } = {},
): Promise<string | null> {
  if (!apiKey || creditsExhausted('firecrawl')) return null
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const actions = opts.scroll ? { actions: SCROLL_ACTIONS } : {}
  const stealth = await postHtml(
    { url, formats: ['rawHtml'], onlyMainContent: false, proxy: 'stealth', waitFor: 3000, ...actions },
    apiKey, timeoutMs,
  )
  if (stealth) return stealth
  if (creditsExhausted('firecrawl')) return null // disjoncté pendant l'essai stealth
  return postHtml({ url, formats: ['rawHtml'], onlyMainContent: false, waitFor: 3000, ...actions }, apiKey, timeoutMs)
}
