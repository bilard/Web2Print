import { parseStructuredDataFromHtml, type StructuredProductData } from './structuredData'
import { getApiKey } from '@/lib/apiKeys'

const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
]

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<string | null> => {
  const ctrl = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => {
      try { ctrl.abort() } catch { /* ignore */ }
      resolve(null)
    }, timeoutMs)
  })
  try {
    const fetchPromise = (async (): Promise<string | null> => {
      try {
        const r = await fetch(url, { signal: ctrl.signal })
        if (!r || !r.ok) return null
        return await r.text()
      } catch {
        return null
      }
    })()
    return await Promise.race([fetchPromise, timeoutPromise])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

export interface ExtractOptions {
  timeoutMs?: number
}

/**
 * Fetch raw HTML for a URL via CORS proxy cascade and extract JSON-LD Product data.
 * Returns null if no Product found or all fetches fail.
 *
 * Cascade :
 *   1. allorigins (CORS proxy gratuit)
 *   2. corsproxy.io (CORS proxy gratuit)
 *   3. Jina Reader avec X-Return-Format: html (paid si clé)
 */
export async function extractStructuredDataFromUrl(
  url: string,
  opts: ExtractOptions = {},
): Promise<StructuredProductData | null> {
  const timeoutMs = opts.timeoutMs ?? 15_000

  // 1. CORS proxies
  for (const proxy of CORS_PROXIES) {
    const html = await fetchWithTimeout(proxy(url), timeoutMs)
    if (html) {
      const data = parseStructuredDataFromHtml(html)
      if (data) return data
    }
  }

  // 2. Jina HTML mode (fallback)
  const jinaKey = getApiKey('jina')
  const headers: Record<string, string> = {
    'X-Return-Format': 'html',
    'Accept': 'text/html',
  }
  if (jinaKey) headers['Authorization'] = 'Bearer ' + jinaKey
  const jinaCtrl = new AbortController()
  let jinaTimeout: ReturnType<typeof setTimeout> | undefined
  const jinaTimeoutPromise = new Promise<null>((resolve) => {
    jinaTimeout = setTimeout(() => {
      try { jinaCtrl.abort() } catch { /* ignore */ }
      resolve(null)
    }, timeoutMs)
  })
  try {
    const jinaFetchPromise = (async (): Promise<string | null> => {
      try {
        const r = await fetch('https://r.jina.ai/' + url, { headers, signal: jinaCtrl.signal })
        if (!r || !r.ok) return null
        return await r.text()
      } catch {
        return null
      }
    })()
    const html = await Promise.race([jinaFetchPromise, jinaTimeoutPromise])
    if (html) {
      const data = parseStructuredDataFromHtml(html)
      if (data) return data
    }
  } finally {
    if (jinaTimeout) clearTimeout(jinaTimeout)
  }

  return null
}
