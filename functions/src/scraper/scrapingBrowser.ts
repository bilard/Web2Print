/**
 * Bright Data Scraping Browser — escalade pour les anti-bot les PLUS durs (DataDome agressif,
 * ex : Leroy Merlin) que le Web Unlocker HTTP ne passe pas. On pilote un vrai Chrome distant
 * (chez Bright Data) via Puppeteer over WebSocket : le navigateur résout les challenges JS +
 * fingerprinting que la requête HTTP ne reproduit pas.
 *
 * ⚠️ PRÉREQUIS MANUELS (sinon cette fonction renvoie failed-precondition) :
 *   1. Dashboard Bright Data → créer une zone « Scraping Browser » (distincte du Web Unlocker).
 *   2. Récupérer l'endpoint WSS : wss://brd-customer-<ID>-zone-<ZONE>:<PASSWORD>@brd.superproxy.io:9222
 *   3. firebase functions:secrets:set BRIGHTDATA_BROWSER_WS   (coller l'endpoint complet)
 *   4. firebase deploy --only functions:scrapeWithScrapingBrowser
 *
 * Coût : significativement plus élevé que le Web Unlocker (navigateur réel + temps de session).
 * Appelé UNIQUEMENT en dernier recours (cf. callScrape côté client).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import type { Browser } from 'puppeteer-core'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addExtra } = require('puppeteer-extra')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const puppeteerCore = require('puppeteer-core')
const puppeteer = addExtra(puppeteerCore)
puppeteer.use(StealthPlugin())

const BRIGHTDATA_BROWSER_WS = defineSecret('BRIGHTDATA_BROWSER_WS')

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
    secrets: [BRIGHTDATA_BROWSER_WS],
  },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }
    const url = req.data?.url
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new HttpsError('invalid-argument', 'URL invalide ou manquante')
    }
    const wsEndpoint = BRIGHTDATA_BROWSER_WS.value()
    if (!wsEndpoint) {
      throw new HttpsError(
        'failed-precondition',
        'BRIGHTDATA_BROWSER_WS non configuré — crée une zone « Scraping Browser » sur le dashboard Bright Data, puis: firebase functions:secrets:set BRIGHTDATA_BROWSER_WS',
      )
    }

    const t0 = Date.now()
    let browser: Browser | null = null
    try {
      browser = (await puppeteer.connect({ browserWSEndpoint: wsEndpoint })) as Browser
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      // Laisse le challenge JS (DataDome/Cloudflare) se résoudre puis la page s'hydrater.
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30_000 }).catch(() => {})
      const html = await page.content()
      await page.close().catch(() => {})
      const durationMs = Date.now() - t0
      logger.info('[scraping-browser] OK', { url, length: html.length, durationMs })
      return { html, durationMs }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      logger.warn('[scraping-browser] échec', { url, msg: msg.slice(0, 200) })
      throw new HttpsError('internal', `Scraping Browser échoué : ${msg.slice(0, 200)}`)
    } finally {
      // disconnect (PAS close) : c'est le navigateur de Bright Data, on ne le ferme pas.
      if (browser) {
        try {
          browser.disconnect()
        } catch {
          /* ignore */
        }
      }
    }
  },
)
