// functions/src/workflow/jina.ts
import { getUserApiKey } from './apiKeys'

async function jinaHeaders(uid: string): Promise<Record<string, string>> {
  const key = await getUserApiKey(uid, 'jina')
  const h: Record<string, string> = { Accept: 'application/json' }
  if (key) h.Authorization = `Bearer ${key}`
  return h
}

export async function jinaRead(uid: string, url: string): Promise<{ title: string; content: string }> {
  const res = await fetch(`https://r.jina.ai/${url}`, { headers: await jinaHeaders(uid) })
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
