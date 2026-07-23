// functions/src/workflow/brightData.ts
// Escalade Bright Data Web Unlocker pour un node workflow headless quand Jina ne
// rend AUCUN contenu (SPA / anti-bot dur, ex : Leroy Merlin). Token + zone GLOBAUX
// lus dans Firestore `config/brightdata` — JAMAIS via defineSecret : un secret
// partagé attaché au scheduler serait lisible par un node `pipe` (cf. mémoire).
import { getFirestore } from 'firebase-admin/firestore'
import { callBrightData, detectCountry } from '../scraper/brightDataUnlocker'
import { scrapeViaScrapingBrowser } from '../scraper/scrapingBrowserCore'
import { creditsExhausted, isCreditError, tripCredits } from '../scraper/creditBreaker'

/** En dessous de ce nombre de chars de TEXTE UTILE (après htmlToText), le tier 1 est
 *  probablement une page de blocage/challenge (DataDome) — gros HTML mais ~aucun texte
 *  exploitable — plutôt qu'une vraie page liste → on escalade vers le Scraping Browser. */
const TIER1_MIN_TEXT = 800

/** Récupère le HTML d'une URL via Bright Data, avec escalade automatique :
 *  tier 1 = Web Unlocker (HTTP, rapide, moins cher) → tier 2 = Scraping Browser
 *  (Puppeteer, anti-bot durs) si le tier 1 ne ramène pas de texte exploitable. */
export async function brightDataRead(url: string): Promise<{ html: string }> {
  // Circuit ouvert (solde à sec / compte suspendu) : on saute AUSSI le tier 2 — le
  // Scraping Browser est facturé sur le même compte, inutile de payer un échec de plus.
  if (creditsExhausted('brightdata')) {
    throw new Error('Bright Data : crédits épuisés — appel sauté (reprise auto ≤ 15 min après recharge).')
  }
  const data = (await getFirestore().doc('config/brightdata').get()).data() ?? {}
  const token = String(data.apiToken ?? '').trim()
  const zone = String(data.zone ?? '').trim() || 'web_unlocker1'
  const browserWs = String(data.browserWs ?? '').trim()

  // Tier 1 : Web Unlocker.
  let html = ''
  if (token) {
    try { html = (await callBrightData(url, token, zone, detectCountry(url))).html } catch (e) {
      console.warn('[bd] tier1 Web Unlocker KO :', e instanceof Error ? e.message.slice(0, 400) : e)
    }
  }

  // Décision d'escalade fondée sur le TEXTE utile, PAS le HTML brut (page de blocage =
  // gros HTML, peu de texte).
  const tier1Text = htmlToText(html).length
  if (tier1Text < TIER1_MIN_TEXT) {
    if (browserWs) {
      try {
        const t2 = await scrapeViaScrapingBrowser(url, browserWs)
        const t2Text = htmlToText(t2).length
        console.log(`[bd] escalade Scraping Browser : ${t2Text} chars utiles (tier1 : ${tier1Text}).`)
        if (t2Text > tier1Text) html = t2
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isCreditError(0, msg)) tripCredits('brightdata', msg.slice(0, 120))
        console.warn('[bd] tier2 Scraping Browser KO :', msg.slice(0, 400))
      }
    } else {
      console.warn(`[bd] tier1 insuffisant (${tier1Text} chars utiles) et Scraping Browser NON configuré (config/brightdata.browserWs) → pas d'escalade.`)
    }
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

/** Lit le HTML RENDU (JavaScript exécuté) d'une URL via le Scraping Browser Bright Data
 *  (Chrome distant piloté en Puppeteer). À utiliser quand le Web Unlocker HTTP ramène un
 *  contenu volumineux mais SANS produits : grille e-commerce injectée 100 % côté client
 *  (ex Leroy Merlin /search) que la requête HTTP ne matérialise pas. Renvoie '' si le
 *  Scraping Browser n'est pas configuré (config/brightdata.browserWs) ou s'il échoue —
 *  l'appelant garde alors son résultat précédent. Coûteux : navigateur réel → dernier recours. */
export async function scrapingBrowserRead(url: string): Promise<{ html: string }> {
  const browserWs = String((await getFirestore().doc('config/brightdata').get()).data()?.browserWs ?? '').trim()
  if (!browserWs) {
    console.warn('[bd] Scraping Browser non configuré (config/brightdata.browserWs) — pas de rendu JS.')
    return { html: '' }
  }
  try {
    const html = await scrapeViaScrapingBrowser(url, browserWs)
    console.log(`[bd] Scraping Browser (rendu JS) : ${htmlToText(html).length} chars utiles pour ${url}.`)
    return { html }
  } catch (e) {
    console.warn('[bd] Scraping Browser KO :', e instanceof Error ? e.message.slice(0, 400) : e)
    return { html: '' }
  }
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
