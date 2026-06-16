/**
 * Bright Data Scraping Browser — escalade pour les anti-bot les PLUS durs (DataDome agressif,
 * ex : Leroy Merlin) que le Web Unlocker HTTP ne passe pas. On pilote un vrai Chrome distant
 * (chez Bright Data) via Puppeteer over WebSocket : le navigateur résout les challenges JS +
 * fingerprinting que la requête HTTP ne reproduit pas.
 *
 * ⚠️ PRÉREQUIS (sinon cette fonction renvoie failed-precondition) :
 *   1. Dashboard Bright Data → créer une zone « Scraping Browser » (distincte du Web Unlocker).
 *   2. Récupérer l'endpoint WSS : wss://brd-customer-<ID>-zone-<ZONE>:<PASSWORD>@brd.superproxy.io:9222
 *   3. Le coller dans l'app : Settings → Connecteurs → Bright Data → champ « Scraping Browser (WSS) »
 *      (stocké dans Firestore config/brightdata.browserWs, lu ici — pas de redéploiement nécessaire).
 *   Pas de secret Secret Manager : le WSS contient un mot de passe et se gère 100 % via l'UI/Firestore.
 *
 * Coût : significativement plus élevé que le Web Unlocker (navigateur réel + temps de session).
 * Appelé UNIQUEMENT en dernier recours (cf. callScrape côté client).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { getBrightDataBrowserWs } from './brightDataToken'
import { scrapeViaScrapingBrowser } from './scrapingBrowserCore'

interface ScrapingBrowserRequest {
  url: string
}
interface ScrapingBrowserResponse {
  html: string
  durationMs: number
}

export const scrapeWithScrapingBrowser = onCall<ScrapingBrowserRequest, Promise<ScrapingBrowserResponse>>(
  {
    region: 'europe-west1',
    timeoutSeconds: 540, // navigateur réel + résolution challenge JS → long
    memory: '1GiB',
    maxInstances: 5,
  },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }
    const url = req.data?.url
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new HttpsError('invalid-argument', 'URL invalide ou manquante')
    }
    // WSS lu UNIQUEMENT depuis Firestore (Settings → Connecteurs, sans redéploiement ni secret CLI).
    const wsEndpoint = await getBrightDataBrowserWs(undefined)
    if (!wsEndpoint) {
      throw new HttpsError(
        'failed-precondition',
        'Scraping Browser non configuré — crée une zone « Scraping Browser » sur Bright Data et colle son lien WSS dans Settings → Connecteurs → Bright Data.',
      )
    }

    const t0 = Date.now()
    try {
      const html = await scrapeViaScrapingBrowser(url, wsEndpoint)
      const durationMs = Date.now() - t0
      logger.info('[scraping-browser] OK', { url, length: html.length, durationMs })
      return { html, durationMs }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      logger.warn('[scraping-browser] échec', { url, msg: msg.slice(0, 200) })
      throw new HttpsError('internal', `Scraping Browser échoué : ${msg.slice(0, 200)}`)
    }
  },
)
