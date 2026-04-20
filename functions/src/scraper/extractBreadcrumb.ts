import { onCall, HttpsError } from 'firebase-functions/v2/https'
import type { Browser } from 'puppeteer-core'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { addExtra } = require('puppeteer-extra')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteerCore = require('puppeteer-core')

// Wrap puppeteer-core avec puppeteer-extra pour bénéficier du plugin stealth
// (contourne les détections anti-bot courantes : Akamai, DataDome, Cloudflare).
const puppeteer = addExtra(puppeteerCore)
puppeteer.use(StealthPlugin())

/**
 * Extrait le fil d'Ariane visible d'une page produit via Puppeteer en mode
 * headless (Chromium). Contourne les protections anti-bot qui servent aux
 * crawlers un HTML différent (cas Decathlon et consorts).
 *
 * Stratégie côté browser :
 *   1. Charger l'URL, attendre `networkidle2` pour laisser le SPA s'hydrater.
 *   2. Essayer une série de sélecteurs breadcrumb standards dans la page.
 *   3. Retourner la chaîne la plus courte trouvée ≥ 2 items (visible > SEO).
 */

interface ExtractBreadcrumbRequest {
  url: string
}

interface ExtractBreadcrumbResponse {
  items: string[]
  selector: string | null
  /** URLs d'images produit détectées après scroll (lazy-load hydraté).
   *  Fallback déterministe pour les revendeurs dont Jina ne capte pas les
   *  images rendues côté client (Boulanger, Darty, Fnac). */
  images: string[]
}

// Cache le browser entre invocations chaudes pour amortir le coût de lancement.
let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise
  // Dynamic import : @sparticuz/chromium est un module ESM-only.
  const chromium = (await import('@sparticuz/chromium')).default
  browserPromise = puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: true,
  }) as Promise<Browser>
  return browserPromise
}

export const extractBreadcrumb = onCall<ExtractBreadcrumbRequest, Promise<ExtractBreadcrumbResponse>>(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '1GiB',
    cors: true,
  },
  async (request) => {
    const { url } = request.data || {}
    if (!url || typeof url !== 'string') {
      throw new HttpsError('invalid-argument', 'url requise')
    }
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }
    try {
      new URL(url)
    } catch {
      throw new HttpsError('invalid-argument', 'URL invalide')
    }

    const browser = await getBrowser()
    const page = await browser.newPage()
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      )
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.5,en;q=0.3',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      })

      // Masquer les signatures Puppeteer/HeadlessChrome détectées par les sites
      // anti-bot (window.navigator.webdriver, chrome runtime, plugins vides).
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
        Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en-US', 'en'] })
        Object.defineProperty(navigator, 'plugins', {
          get: () => [
            { name: 'Chrome PDF Plugin' },
            { name: 'Chrome PDF Viewer' },
            { name: 'Native Client' },
          ],
        })
      })

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

      const pageTitle = await page.title().catch(() => '')
      const pageUrl = page.url()
      console.log('[extractBreadcrumb] page loaded:', { pageUrl, title: pageTitle })

      // Scroll progressif pour déclencher le lazy-load des images produit
      // (Boulanger/Darty utilisent Intersection Observer — sans scroll, les
      // images ne sont jamais rendues et Jina retourne du vide).
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let total = 0
          const step = 500
          const max = Math.min(document.body.scrollHeight ?? 0, 10000)
          const timer = setInterval(() => {
            window.scrollBy(0, step)
            total += step
            if (total >= max) {
              clearInterval(timer)
              window.scrollTo(0, 0)
              resolve()
            }
          }, 120)
        })
      })
      // Laisser le temps aux requêtes d'images déclenchées par le scroll d'arriver.
      await new Promise((r) => setTimeout(r, 800))

      const result = await page.evaluate(() => {
        const containerSelectors = [
          'nav[aria-label*="breadcrumb" i]',
          'nav[aria-label*="fil d" i]',
          '[data-testid*="breadcrumb" i]',
          '[itemtype*="BreadcrumbList" i]',
          'nav[class*="breadcrumb" i]',
          'ol[class*="breadcrumb" i]',
          'ul[class*="breadcrumb" i]',
          '[class*="breadcrumbs__list" i]',
          '[class*="breadcrumb" i]',
        ]

        const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim()

        const isVisible = (el: Element): boolean => {
          if (el.getAttribute('aria-hidden') === 'true') return false
          const style = window.getComputedStyle(el as HTMLElement)
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
        }

        const extractItems = (container: Element): string[] => {
          const anchors = Array.from(container.querySelectorAll('a'))
          const microdata = Array.from(container.querySelectorAll('[itemprop="name"]'))
          const lis = Array.from(container.querySelectorAll('li'))
          const sources = anchors.length >= 2 ? anchors : microdata.length >= 2 ? microdata : lis
          const items = sources
            .map((n) => cleanText(n.textContent ?? ''))
            .filter((t) => t.length > 0 && t.length < 80 && !/^[>\u203a/\\|]+$/.test(t))
          const seen = new Set<string>()
          const out: string[] = []
          for (const it of items) {
            const key = it.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            out.push(it)
          }
          return out
        }

        const candidates: { items: string[]; selector: string }[] = []
        const visited = new Set<Element>()
        for (const sel of containerSelectors) {
          const els = Array.from(document.querySelectorAll(sel))
          for (const el of els) {
            if (visited.has(el)) continue
            visited.add(el)
            if (!isVisible(el)) continue
            const items = extractItems(el)
            if (items.length >= 2) candidates.push({ items, selector: sel })
          }
        }

        // BEM individuel : grouper par parent si on a plusieurs items-frères.
        const bemItems = Array.from(
          document.querySelectorAll(
            '[class*="breadcrumb" i][class*="item" i], [class*="BreadcrumbItem"]',
          ),
        )
        if (bemItems.length >= 2) {
          const byParent = new Map<Element | null, Element[]>()
          for (const it of bemItems) {
            if (!isVisible(it)) continue
            const p = it.parentElement
            if (!byParent.has(p)) byParent.set(p, [])
            byParent.get(p)!.push(it)
          }
          for (const siblings of byParent.values()) {
            if (siblings.length < 2) continue
            const items = siblings
              .map((el) => cleanText(el.textContent ?? ''))
              .filter((t) => t.length > 0 && t.length < 80)
            const seen = new Set<string>()
            const out: string[] = []
            for (const it of items) {
              const key = it.toLowerCase()
              if (seen.has(key)) continue
              seen.add(key)
              out.push(it)
            }
            if (out.length >= 2) candidates.push({ items: out, selector: 'bem-siblings' })
          }
        }

        // Diagnostic : compter les éléments breadcrumb-related pour savoir si
        // la page est bien rendue hydratée côté Puppeteer.
        const diagnostic = {
          totalCandidates: candidates.length,
          bemItemsCount: bemItems.length,
          hasBemClass: !!document.querySelector('[class*="breadcrumb" i]'),
          hasHommeLink: !!document.querySelector('a[href$="/homme"]'),
          bodyLength: document.body?.innerHTML?.length ?? 0,
        }

        if (candidates.length === 0) return { items: [], selector: null, diagnostic }

        // Le breadcrumb visible est typiquement le plus court ; les breadcrumbs
        // SEO / category path sont plus longs. À égalité, garde le premier.
        candidates.sort((a, b) => a.items.length - b.items.length)
        return { items: candidates[0].items, selector: candidates[0].selector, diagnostic, allCandidates: candidates }
      })

      console.log('[extractBreadcrumb] page.evaluate result:', JSON.stringify(result, null, 2))

      // Collecte des images produit après hydratation + scroll. Filtre :
      //   - pas de data:URI (placeholders inline)
      //   - taille naturelle ≥ 200×200 (exclut icônes, pixels tracking, logos)
      //   - dédup par URL sans query string (mêmes images en tailles différentes)
      const images = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[]
        const out: string[] = []
        const seen = new Set<string>()
        for (const img of imgs) {
          const src = img.currentSrc || img.src
          if (!src || src.length < 20) continue
          if (src.startsWith('data:')) continue
          // Pas de srcset minuscule : si naturalWidth est connu et petit, skip.
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            if (img.naturalWidth < 200 || img.naturalHeight < 200) continue
          }
          // Dédup insensible aux query params (?width=500 vs ?width=1000)
          const key = src.replace(/\?.*$/, '').replace(/#.*$/, '')
          if (seen.has(key)) continue
          seen.add(key)
          out.push(src)
        }
        return out
      })
      console.log('[extractBreadcrumb] images collected:', images.length)

      return { items: result.items, selector: result.selector, images }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new HttpsError('internal', `Extraction breadcrumb échouée : ${msg}`)
    } finally {
      await page.close().catch(() => {})
    }
  },
)
