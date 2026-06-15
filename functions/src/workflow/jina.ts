// functions/src/workflow/jina.ts
import { getUserApiKey } from './apiKeys'

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
  if (!res.ok) throw new Error(`Jina read ${res.status}`)
  const json = (await res.json()) as { data?: { title?: string; content?: string } }
  return { title: json.data?.title ?? '', content: json.data?.content ?? '' }
}

export async function jinaSearch(uid: string, query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers: await jinaHeaders(uid) })
  if (!res.ok) throw new Error(`Jina search ${res.status}`)
  const json = (await res.json()) as { data?: { title?: string; url?: string; content?: string }[] }
  return (json.data ?? []).map((d) => ({ title: d.title ?? '', url: d.url ?? '', snippet: (d.content ?? '').slice(0, 500) }))
}
