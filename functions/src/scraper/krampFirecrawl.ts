// functions/src/scraper/krampFirecrawl.ts
// Fetcher AUTHENTIFIÉ kramp via Firecrawl /v2/scrape `actions` : login kramp (Bright Data
// est INUTILISABLE — il interdit la saisie de mot de passe), puis navigation
// `executeJavascript` (location.assign) vers la page cible, et lecture de `data.markdown`
// (top-level, la page FINALE de la chaîne).
// ⚠ Une page par appel : le multi-`scrape` par appel (data.actions.scrapes) est devenu
// NON FIABLE côté Firecrawl (renvoie du markdown vide) → on lit le markdown top-level de
// la dernière page. Le login est donc réamorti à chaque page. Ne JAMAIS journaliser creds.
import * as logger from 'firebase-functions/logger'
import type { SiteCredentials } from './siteCredentials'

const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape'

/** UN appel Firecrawl : login kramp puis navigation vers `target` → markdown de la page. */
async function scrapeOne(target: string, creds: SiteCredentials, firecrawlKey: string, timeoutMs: number): Promise<string> {
  const actions: Record<string, unknown>[] = [
    { type: 'wait', milliseconds: 2500 },
    { type: 'click', selector: '#username' }, { type: 'write', text: creds.login },
    { type: 'click', selector: 'input[type=password]' }, { type: 'write', text: creds.password },
    { type: 'click', selector: 'button[name=login-btn]' }, { type: 'wait', milliseconds: 6000 },
    { type: 'executeJavascript', script: `window.location.assign(${JSON.stringify(target)})` },
    { type: 'wait', milliseconds: 9000 },
  ]
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
    if (!res.ok) { logger.warn(`[kramp] Firecrawl ${res.status}`); return '' }
    const json = (await res.json()) as { data?: { markdown?: string } }
    return json.data?.markdown ?? ''
  } catch (e) {
    logger.warn(`[kramp] Firecrawl erreur réseau : ${e instanceof Error ? e.message : e}`)
    return ''
  } finally { clearTimeout(t) }
}

/** Login + scrape, UNE page (une requête réseau) par URL cible. Renvoie map(url → markdown). */
export async function krampBatchScrape(
  targetUrls: string[], creds: SiteCredentials, firecrawlKey: string, timeoutMs = 90_000,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!firecrawlKey || targetUrls.length === 0) return out
  for (const u of targetUrls) out.set(u, await scrapeOne(u, creds, firecrawlKey, timeoutMs))
  return out
}
