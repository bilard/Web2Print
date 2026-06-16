// functions/src/workflow/brightData.ts
// Escalade Bright Data Web Unlocker pour un node workflow headless quand Jina ne
// rend AUCUN contenu (SPA / anti-bot dur, ex : Leroy Merlin). Token + zone GLOBAUX
// lus dans Firestore `config/brightdata` — JAMAIS via defineSecret : un secret
// partagé attaché au scheduler serait lisible par un node `pipe` (cf. mémoire).
import { getFirestore } from 'firebase-admin/firestore'
import { callBrightData, detectCountry } from '../scraper/brightDataUnlocker'
import { scrapeViaScrapingBrowser } from '../scraper/scrapingBrowserCore'

/** En dessous de ce seuil, le HTML du Web Unlocker est probablement une page de
 *  blocage/challenge (DataDome) plutôt qu'une vraie page liste → on escalade tier-2. */
const TIER1_MIN_HTML = 15_000

/** Récupère le HTML d'une URL via Bright Data, avec escalade automatique :
 *  tier 1 = Web Unlocker (HTTP, rapide, moins cher) → tier 2 = Scraping Browser
 *  (Puppeteer, anti-bot durs) si le tier 1 est vide/trop court ou échoue. */
export async function brightDataRead(url: string): Promise<{ html: string }> {
  const data = (await getFirestore().doc('config/brightdata').get()).data() ?? {}
  const token = String(data.apiToken ?? '').trim()
  const zone = String(data.zone ?? '').trim() || 'web_unlocker1'
  const browserWs = String(data.browserWs ?? '').trim()

  // Tier 1 : Web Unlocker.
  let html = ''
  if (token) {
    try { html = (await callBrightData(url, token, zone, detectCountry(url))).html } catch { /* → tier 2 */ }
  }

  // Tier 2 : Scraping Browser (dernier recours, plus coûteux) si tier 1 insuffisant.
  if (html.trim().length < TIER1_MIN_HTML && browserWs) {
    try {
      const t2 = await scrapeViaScrapingBrowser(url, browserWs)
      if (t2.trim().length > html.trim().length) html = t2
    } catch { /* on garde le tier 1 s'il existe */ }
  }

  if (!html.trim()) {
    throw new Error(
      token || browserWs
        ? 'Bright Data : aucun contenu (Web Unlocker + Scraping Browser).'
        : 'Bright Data non configuré (config/brightdata.apiToken / browserWs).',
    )
  }
  return { html }
}

/** Réduit du HTML brut au texte significatif pour l'extraction LLM : retire
 *  script/style/head/commentaires, conserve les liens et les sources d'images
 *  en `[url]` (le chemin image porte souvent l'EAN), aplatit les espaces. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, ' [$1] ')
    .replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, ' [$1] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&euro;/gi, '€')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}
