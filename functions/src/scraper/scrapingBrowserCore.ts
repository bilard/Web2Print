// functions/src/scraper/scrapingBrowserCore.ts
// Cœur réutilisable du Scraping Browser Bright Data (Puppeteer over WSS) : pilote un
// Chrome distant pour résoudre les anti-bot durs (DataDome, ex Leroy Merlin). Utilisé
// par le callable scrapeWithScrapingBrowser ET par l'escalade tier-2 des nodes workflow.
//
// ⚠️ require() PARESSEUX (dans la fonction, pas au top-level) : puppeteer-extra + stealth
// sont lourds ; les charger à l'import alourdirait le cold-start de TOUTES les Functions
// qui importent ce module (scheduler workflow inclus), même sans jamais escalader.
import type { Browser } from 'puppeteer-core'

/** Récupère le HTML rendu d'une URL via le Scraping Browser Bright Data. Throw si la
 *  connexion/navigation échoue. `disconnect` (pas `close`) : c'est le Chrome de BD. */
export async function scrapeViaScrapingBrowser(url: string, wsEndpoint: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { addExtra } = require('puppeteer-extra')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StealthPlugin = require('puppeteer-extra-plugin-stealth')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const puppeteerCore = require('puppeteer-core')
  const puppeteer = addExtra(puppeteerCore)
  puppeteer.use(StealthPlugin())

  let browser: Browser | null = null
  try {
    browser = (await puppeteer.connect({ browserWSEndpoint: wsEndpoint })) as Browser
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    // Laisse le challenge JS (DataDome/Cloudflare) se résoudre puis la page s'hydrater.
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30_000 }).catch(() => {})
    const html = await page.content()
    await page.close().catch(() => {})
    return html
  } finally {
    if (browser) {
      try { browser.disconnect() } catch { /* ignore */ }
    }
  }
}
