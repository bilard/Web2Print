import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { getApiKey } from '@/lib/apiKeys'
import { recordScrapeUsage } from '@/features/stats/aiUsageTracking'

const callFetchPageHtml = httpsCallable<{ url: string }, { html: string; length: number }>(
  functions,
  'fetchPageHtml',
  { timeout: 35_000 },
)

/** Signatures de pages « challenge » anti-bot (DataDome, Cloudflare) : un HTML
 *  qui les porte n'est pas la page demandée — le repli doit continuer. */
const CHALLENGE_RE = /captcha-delivery\.com|__cf_chl|cf-challenge|Just a moment|geo\.captcha/i

/**
 * Fetch le HTML rendu d'une URL. Voie principale : la Cloud Function serveur
 * `fetchPageHtml` (pas de CORS, fiable pour les sites SSR/statiques). Repli :
 * Jina Reader en mode HTML (navigateur rendu) — certains WAF (Akamai/Kingfisher,
 * ex. castorama = HTTP 503) bloquent les IP des datacenters Google utilisées par
 * la CF mais laissent passer Jina ; clé optionnelle (tier anonyme accepté).
 * Dernier filet : proxies CORS publics (instables depuis 2026-06). Les SPA à
 * challenge anti-bot dur nécessitent Bright Data (tier 2) ou l'extension Chrome.
 */
export async function fetchSourceHtml(url: string, timeoutMs = 20_000): Promise<string | null> {
  // 1) Cloud Function serveur (gratuite, sans CORS).
  try {
    const res = await callFetchPageHtml({ url })
    const html = res.data?.html
    if (html && html.length > 500) return html
  } catch {
    /* repli Jina */
  }

  // 2) Jina Reader mode HTML (navigateur rendu, passe les WAF qui filtrent par IP).
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
        // Facturation Jina réelle (le CF gratuit a échoué → on a payé du Reader).
        // Tokens estimés chars/4 quand l'API ne les renvoie pas.
        recordScrapeUsage({ platform: 'jina', tokens: Math.ceil(html.length / 4) })
        return html
      }
    }
  } catch {
    /* repli proxies publics */
  }

  // 3) Proxies CORS publics (filet de sécurité).
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
