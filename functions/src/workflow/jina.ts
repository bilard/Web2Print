// functions/src/workflow/jina.ts
import { getUserApiKey } from './apiKeys'
import { creditsExhausted, isCreditError, tripCredits } from '../scraper/creditBreaker'

async function jinaHeaders(uid: string): Promise<Record<string, string>> {
  const key = await getUserApiKey(uid, 'jina')
  const h: Record<string, string> = { Accept: 'application/json' }
  if (key) h.Authorization = `Bearer ${key}`
  return h
}

export async function jinaRead(
  uid: string,
  url: string,
  opts: { listing?: boolean } = {},
): Promise<{ title: string; content: string }> {
  if (creditsExhausted('jina')) throw new Error('Jina : crédits épuisés — appel sauté (reprise auto ≤ 15 min après recharge).')
  const headers = await jinaHeaders(uid)
  // Mode `listing` : page catégorie/recherche en lazy-load → forcer le moteur
  // navigateur (Puppeteer headless Jina) + attendre la grille produit + timeout
  // long. Aligné sur le `jinaRead({ listing })` client (useJina.ts).
  if (opts.listing) {
    headers['X-Engine'] = 'browser'
    headers['X-Timeout'] = '30'
    headers['X-Wait-For-Selector'] =
      'a[href*="/product" i], a[href*="/produit" i], [class*="product" i], [class*="card" i], main'
  }
  const res = await fetch(`https://r.jina.ai/${url}`, { headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (isCreditError(res.status, body)) tripCredits('jina', `${res.status} ${body.slice(0, 120)}`)
    throw new Error(`Jina read ${res.status}`)
  }
  const json = (await res.json()) as { data?: { title?: string; content?: string } }
  return { title: json.data?.title ?? '', content: json.data?.content ?? '' }
}

// Borne de temps d'une recherche Jina : sans elle, un `fetch` vers s.jina.ai qui pend
// (moteur navigateur headless bloqué) ne revient JAMAIS — pas de timeout par défaut. Sous
// cron, ça fait dépasser le timeout de la Function → run tué par la plateforme, checkpoint
// non purgé, dashboard figé. On combine ce timeout interne au signal d'abort du run.
const JINA_SEARCH_TIMEOUT_MS = 30_000

export async function jinaSearch(uid: string, query: string, signal?: AbortSignal): Promise<{ title: string; url: string; snippet: string }[]> {
  if (creditsExhausted('jina')) throw new Error('Jina : crédits épuisés — appel sauté (reprise auto ≤ 15 min après recharge).')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), JINA_SEARCH_TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', onAbort) }
  try {
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers: await jinaHeaders(uid), signal: ctrl.signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (isCreditError(res.status, body)) tripCredits('jina', `${res.status} ${body.slice(0, 120)}`)
      throw new Error(`Jina search ${res.status}`)
    }
    const json = (await res.json()) as { data?: { title?: string; url?: string; content?: string }[] }
    return (json.data ?? []).map((d) => ({ title: d.title ?? '', url: d.url ?? '', snippet: (d.content ?? '').slice(0, 500) }))
  } finally {
    clearTimeout(t)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}
