// functions/src/scraper/krampFirecrawl.ts
// Fetcher AUTHENTIFIÉ kramp via Firecrawl /v2/scrape `actions` : UN appel = login kramp
// une seule fois, puis navigation `executeJavascript` (location.assign) + `scrape` par
// cible → prix connectés. Firecrawl renvoie data.actions.scrapes[] dans l'ORDRE des
// actions scrape (mapping par index, fiable). Bright Data est INUTILISABLE ici (il
// interdit la saisie de mot de passe). Ne JAMAIS journaliser creds.
import * as logger from 'firebase-functions/logger'
import type { SiteCredentials } from './siteCredentials'

const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape'
// Nb de pages par appel Firecrawl : chaque page = ~8 s d'attente ; au-delà de ~6 la
// chaîne d'actions devient trop longue (timeout Firecrawl). Le login est réamorti par
// chunk — reste très inférieur au login-par-réf.
const CHUNK = 6

/** UN appel Firecrawl par chunk : login kramp puis, pour chaque URL du chunk,
 *  navigation `executeJavascript` + `scrape`. Renvoie map(url cible → markdown). */
async function scrapeChunk(chunk: string[], creds: SiteCredentials, firecrawlKey: string, timeoutMs: number): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const actions: Record<string, unknown>[] = [
    { type: 'wait', milliseconds: 2500 },
    { type: 'click', selector: '#username' }, { type: 'write', text: creds.login },
    { type: 'click', selector: 'input[type=password]' }, { type: 'write', text: creds.password },
    { type: 'click', selector: 'button[name=login-btn]' }, { type: 'wait', milliseconds: 6000 },
  ]
  for (const u of chunk) {
    actions.push({ type: 'executeJavascript', script: `window.location.assign(${JSON.stringify(u)})` })
    actions.push({ type: 'wait', milliseconds: 8000 })
    actions.push({ type: 'scrape' })
  }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(FIRECRAWL_SCRAPE, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({
        url: creds.loginUrl || 'https://login.kramp.com/',
        proxy: 'stealth', waitFor: 2000, actions, formats: ['markdown'],
      }),
    })
    if (!res.ok) { logger.warn(`[kramp] Firecrawl ${res.status}`); return out }
    const json = (await res.json()) as { data?: { actions?: { scrapes?: { markdown?: string }[] } } }
    const scrapes = json.data?.actions?.scrapes ?? []
    scrapes.forEach((s, i) => { const key = chunk[i]; if (key) out.set(key, s.markdown ?? '') })
    return out
  } catch (e) {
    logger.warn(`[kramp] Firecrawl erreur réseau : ${e instanceof Error ? e.message : e}`)
    return out
  } finally { clearTimeout(t) }
}

/** Login amorti + scrape par lots (chunks de CHUNK pages). Renvoie map(url → markdown). */
export async function krampBatchScrape(
  targetUrls: string[], creds: SiteCredentials, firecrawlKey: string, timeoutMs = 200_000,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!firecrawlKey || targetUrls.length === 0) return out
  for (let i = 0; i < targetUrls.length; i += CHUNK) {
    const part = await scrapeChunk(targetUrls.slice(i, i + CHUNK), creds, firecrawlKey, timeoutMs)
    for (const [k, v] of part) out.set(k, v)
  }
  return out
}
