// functions/src/workflow/brightData.ts
// Escalade Bright Data Web Unlocker pour un node workflow headless quand Jina ne
// rend AUCUN contenu (SPA / anti-bot dur, ex : Leroy Merlin). Token + zone GLOBAUX
// lus dans Firestore `config/brightdata` — JAMAIS via defineSecret : un secret
// partagé attaché au scheduler serait lisible par un node `pipe` (cf. mémoire).
import { getFirestore } from 'firebase-admin/firestore'
import { callBrightData, detectCountry } from '../scraper/brightDataUnlocker'

/** Récupère le HTML d'une URL via Bright Data Web Unlocker (gère l'anti-bot). */
export async function brightDataRead(url: string): Promise<{ html: string }> {
  const snap = await getFirestore().doc('config/brightdata').get()
  const token = String(snap.data()?.apiToken ?? '').trim()
  if (!token) throw new Error('Bright Data non configuré (config/brightdata.apiToken).')
  const zone = String(snap.data()?.zone ?? '').trim() || 'web_unlocker1'
  const { html } = await callBrightData(url, token, zone, detectCountry(url))
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
