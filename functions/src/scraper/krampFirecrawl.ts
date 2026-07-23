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
import { creditsExhausted, isCreditError, tripCredits } from './creditBreaker'

const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape'

/** UN appel Firecrawl : login kramp puis navigation vers `target` → markdown de la page.
 *  Le `signal` du run (timeout serveur / STOP) interrompt aussi le fetch en vol. */
async function scrapeOne(target: string, creds: SiteCredentials, firecrawlKey: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
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
  const onAbort = () => ctrl.abort()
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', onAbort) }
  try {
    const res = await fetch(FIRECRAWL_SCRAPE, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({
        url: creds.loginUrl || 'https://login.kramp.com/',
        proxy: 'stealth', waitFor: 2000, actions, formats: ['markdown'],
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (isCreditError(res.status, body)) tripCredits('firecrawl', `${res.status} ${body.slice(0, 120)}`)
      else logger.warn(`[kramp] Firecrawl ${res.status}`)
      return ''
    }
    const json = (await res.json()) as { data?: { markdown?: string; metadata?: { sourceURL?: string; url?: string; statusCode?: number; title?: string } } }
    const md = json.data?.markdown ?? ''
    // DIAGNOSTIC (sûr : markdown = donnée produit, PAS les creds). Répond à la seule
    // question discriminante : Firecrawl a-t-il rendu la PAGE DE RECHERCHE (produits/prix)
    // ou est-il resté sur login.kramp.com ? metadata.sourceURL/statusCode = page finale
    // réellement capturée. has€ + longueur + tête = login OK ? navigation OK ? prix présents ?
    const meta = json.data?.metadata ?? {}
    logger.info('[kramp][diag]', {
      cible: target,
      pageCapturee: meta.sourceURL || meta.url || '?',
      statusPage: meta.statusCode,
      titre: meta.title,
      mdLen: md.length,
      aEuro: md.includes('€'),
      tete: md.slice(0, 400).replace(/\s+/g, ' '),
    })
    return md
  } catch (e) {
    logger.warn(`[kramp] Firecrawl erreur réseau : ${e instanceof Error ? e.message : e}`)
    return ''
  } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', onAbort) }
}

/** Login + scrape, UNE page (une requête réseau) par URL cible. Renvoie map(url → markdown).
 *  Interrompt la boucle dès que `signal` est aborté (ne brûle plus de crédits). */
export async function krampBatchScrape(
  targetUrls: string[], creds: SiteCredentials, firecrawlKey: string, timeoutMs = 90_000, signal?: AbortSignal,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!firecrawlKey || targetUrls.length === 0) return out
  for (const u of targetUrls) {
    if (signal?.aborted || creditsExhausted('firecrawl')) break
    out.set(u, await scrapeOne(u, creds, firecrawlKey, timeoutMs, signal))
  }
  return out
}
