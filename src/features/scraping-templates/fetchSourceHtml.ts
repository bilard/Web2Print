import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { getApiKey } from '@/lib/apiKeys'
import { recordScrapeUsage } from '@/features/stats/aiUsageTracking'
import { firecrawlScrapeHtml } from '@/features/scraping/core/firecrawlFallback'
import { brightDataScrapeHtml } from '@/features/scraping/core/brightDataFallback'
import { looksLikeBotChallenge } from '@/features/excel/ai-enrichment/markdownSanitize'

const callFetchPageHtml = httpsCallable<{ url: string }, { html: string; length: number }>(
  functions,
  'fetchPageHtml',
  { timeout: 35_000 },
)

/** Signatures de pages « challenge » anti-bot (DataDome, Cloudflare) : un HTML
 *  qui les porte n'est pas la page demandée — le repli doit continuer. */
const CHALLENGE_RE = /captcha-delivery\.com|__cf_chl|cf-challenge|Just a moment|geo\.captcha/i

/** Palier de la cascade ayant réellement fourni le HTML (télémétrie moteur par site). */
export type SourceFetchEngine = 'cloudFunction' | 'jina' | 'firecrawl' | 'brightdata' | 'proxy'

/** HTML exploitable ? (taille suffisante + pas une page de challenge anti-bot). */
function usableHtml(html: string | null | undefined): html is string {
  return !!html && html.length > 500 && !CHALLENGE_RE.test(html.slice(0, 3000)) && !looksLikeBotChallenge(html)
}

/** Étape 2 de la cascade, exposée pour le forçage « Jina seul » (node Sites sources). */
export async function fetchJinaHtml(url: string, timeoutMs = 20_000): Promise<string | null> {
  try {
    const key = getApiKey('jina').trim()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), Math.max(timeoutMs, 30_000))
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'X-Return-Format': 'html',
        Accept: 'text/html',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (res.ok) {
      const html = await res.text()
      if (html && html.length > 500 && !CHALLENGE_RE.test(html.slice(0, 3000))) {
        // Facturation Jina réelle. Tokens estimés chars/4 quand l'API ne les renvoie pas.
        recordScrapeUsage({ platform: 'jina', tokens: Math.ceil(html.length / 4) })
        return html
      }
    }
  } catch {
    /* null → l'appelant continue sa cascade */
  }
  return null
}

/** Tente Firecrawl (rendu JS + anti-bot, scroll grille) si la clé est configurée. */
async function tryFirecrawl(url: string): Promise<string | null> {
  const key = getApiKey('firecrawl').trim()
  if (!key) return null
  try {
    const html = await firecrawlScrapeHtml(url, key, { scroll: true })
    return usableHtml(html) ? html : null
  } catch { return null }
}

/** Tente Bright Data (Web Unlocker → Scraping Browser). Renvoie null si non configuré. */
async function tryBrightData(url: string): Promise<string | null> {
  try {
    const html = await brightDataScrapeHtml(url)
    return usableHtml(html) ? html : null
  } catch { return null }
}

/**
 * Fetch le HTML rendu d'une URL, en ESCALADANT le connecteur selon le blocage, et en
 * rapportant QUEL outil a servi (affiché « via … » dans « Sites sources »). Cascade Auto :
 *   1. Cloud Function serveur (gratuit, sans CORS) — sites SSR/statiques ;
 *   2. Jina Reader (navigateur rendu) — WAF qui filtrent par IP ;
 *   3. Firecrawl (rendu JS + stealth, si clé) — anti-bot standard, grilles lazy-load ;
 *   4. Bright Data (si configuré) — anti-bot durs (DataDome/Akamai) ;
 *   5. proxies CORS publics (filet).
 * `prefer` : moteur à essayer EN PREMIER (mémoïsation par site — évite de re-payer
 * l'échec des paliers gratuits à chaque page une fois qu'un moteur payant a débloqué).
 * Les paliers payants (3-4) ne sont atteints que si les gratuits ont échoué/été bloqués.
 */
export async function fetchSourceHtmlWithEngine(
  url: string, timeoutMs = 20_000, prefer?: SourceFetchEngine,
): Promise<{ html: string; engine: SourceFetchEngine } | null> {
  // Mémoïsation : réutilise directement le moteur qui a débloqué ce site au passage précédent.
  if (prefer === 'firecrawl') { const h = await tryFirecrawl(url); if (h) return { html: h, engine: 'firecrawl' } }
  if (prefer === 'brightdata') { const h = await tryBrightData(url); if (h) return { html: h, engine: 'brightdata' } }

  // 1) Cloud Function serveur (gratuite, sans CORS).
  try {
    const res = await callFetchPageHtml({ url })
    if (usableHtml(res.data?.html)) return { html: res.data.html, engine: 'cloudFunction' }
  } catch {
    /* repli Jina */
  }

  // 2) Jina Reader mode HTML (navigateur rendu, passe les WAF qui filtrent par IP).
  const jina = await fetchJinaHtml(url, timeoutMs)
  if (jina) return { html: jina, engine: 'jina' }

  // 3) Firecrawl — rendu JS + stealth (payant/crédit). Seulement si clé configurée.
  const fc = await tryFirecrawl(url)
  if (fc) return { html: fc, engine: 'firecrawl' }

  // 4) Bright Data — anti-bot durs (payant). Silencieux si non configuré.
  const bd = await tryBrightData(url)
  if (bd) return { html: bd, engine: 'brightdata' }

  // 5) Proxies CORS publics (filet de sécurité).
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
      if (usableHtml(html)) return { html, engine: 'proxy' }
    } catch {
      /* try next proxy */
    }
  }
  return null
}

/** Variante historique sans télémétrie (signature intacte pour les autres appelants). */
export async function fetchSourceHtml(url: string, timeoutMs = 20_000): Promise<string | null> {
  return (await fetchSourceHtmlWithEngine(url, timeoutMs))?.html ?? null
}
