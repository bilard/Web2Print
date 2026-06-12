import { onCall, HttpsError } from 'firebase-functions/v2/https'
import type { Browser } from 'puppeteer-core'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addExtra } = require('puppeteer-extra')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
// eslint-disable-next-line @typescript-eslint/no-require-imports
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
  /** Tous les liens <a href> absolus de la page APRÈS scroll (lazy-load
   *  hydraté). Sert d'escalade déterministe à la découverte de produits
   *  (Crawl) quand Jina ne rend pas la grille — cas Makita & co. */
  links: string[]
  /** Ancres situées dans les zones de navigation (header/nav/footer/aside/
   *  [role=navigation]) — le méga-menu et le footer. La découverte de
   *  produits (Crawl) les SOUSTRAIT des candidats : sans ça, les centaines
   *  de liens de catégories du menu consomment tout le quota `limit` avant
   *  les vraies fiches. */
  navLinks: string[]
  /** Ancres « carte produit » : groupes répétés (≥ 3 frères de même
   *  signature structurelle) en zone contenu, priorité aux groupes avec
   *  image — c'est la grille produit. Quand ce champ est non-vide, c'est la
   *  source la plus fiable pour la découverte. */
  cardLinks: { url: string; title: string }[]
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

      // Fermer la bannière de consentement (CMP) AVANT de scroller : en session
      // headless vierge elle est toujours ouverte et verrouille souvent le
      // scroll du body (overflow:hidden) → le lazy-load/infinite-scroll ne se
      // déclenche jamais (symptôme : images collected: 0, batches AJAX absents).
      // Liste générique des CMP standards + fallback texte ; on préfère
      // « Refuser » (privacy) et on accepte seulement à défaut.
      await page.evaluate(() => {
        const clickFirst = (sels: string[]): boolean => {
          for (const sel of sels) {
            const el = document.querySelector<HTMLElement>(sel)
            if (el) { el.click(); return true }
          }
          return false
        }
        const declined = clickFirst([
          '#onetrust-reject-all-handler',
          '#didomi-notice-disagree-button',
          '#CybotCookiebotDialogBodyButtonDecline',
          '.coi-banner__decline', '[data-coi="decline"]',
          '#axeptio_btn_dismiss', '[data-testid="uc-deny-all-button"]',
          '.tarteaucitronDeny', '#tarteaucitronAllDenied2',
        ])
        const accepted = declined || clickFirst([
          '#onetrust-accept-btn-handler',
          '#didomi-notice-agree-button',
          '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
          '.coi-banner__accept', '[data-coi="accept"]',
          '#axeptio_btn_acceptAll', '[data-testid="uc-accept-all-button"]',
          '.tarteaucitronAllow', '#tarteaucitronPersonalize2',
        ])
        if (!accepted) {
          // Fallback texte : bouton dont le libellé évoque refus puis acceptation.
          const btns = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'))
          const byText = (re: RegExp) => btns.find((b) => re.test((b.textContent ?? '').trim()))
          const hit = byText(/^(tout\s+)?refuser$|continuer sans accepter|reject all|decline/i)
            ?? byText(/^(tout\s+)?accepter$|accept all|j'accepte|^agree$/i)
          hit?.click()
        }
        // Dans tous les cas : déverrouiller le scroll si la bannière l'a figé.
        document.documentElement.style.overflow = ''
        document.body.style.overflow = ''
      })
      await new Promise((r) => setTimeout(r, 600))

      // Scroll progressif pour déclencher le lazy-load des images produit
      // (Boulanger/Darty utilisent Intersection Observer — sans scroll, les
      // images ne sont jamais rendues et Jina retourne du vide).
      // ⚠️ Les listings à INFINITE SCROLL (Magento loadmoreajaxloader & co)
      // injectent des lots de cartes en AJAX quand on approche du bas : la
      // hauteur de page GRANDIT pendant le scroll. On re-mesure donc à chaque
      // passage en bas et on continue tant que la page s'allonge (2 passes
      // stables = fini), avec garde-fous 60000px / 20s pour rester sous le
      // timeout de la function.
      await page.evaluate(async () => {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
        const step = 600
        let scrolled = 0
        let stable = 0
        let lastHeight = document.body.scrollHeight ?? 0
        const t0 = Date.now()
        while (stable < 2 && scrolled < 60000 && Date.now() - t0 < 20000) {
          window.scrollBy(0, step)
          scrolled += step
          const atBottom = window.scrollY + window.innerHeight >= (document.body.scrollHeight ?? 0) - 10
          if (atBottom) {
            // En bas : laisser le batch AJAX éventuel arriver puis re-mesurer.
            await sleep(900)
            const h = document.body.scrollHeight ?? 0
            if (h <= lastHeight) stable += 1
            else { stable = 0; lastHeight = h }
          } else {
            await sleep(100)
          }
        }
        window.scrollTo(0, 0)
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

      // Collecte de TOUS les liens <a href> absolus après hydratation + scroll.
      // Escalade déterministe pour la découverte de produits (Crawl) : le caller
      // filtre ensuite par host + regex include/exclude. On résout en absolu et
      // on dédoublonne pour limiter la charge réseau.
      const links = await page.evaluate(() => {
        const out: string[] = []
        const seen = new Set<string>()
        for (const a of Array.from(document.querySelectorAll('a[href]'))) {
          const raw = (a as HTMLAnchorElement).href // déjà absolu via la résolution DOM
          if (!raw || !/^https?:\/\//.test(raw)) continue
          const key = raw.replace(/#.*$/, '')
          if (seen.has(key)) continue
          seen.add(key)
          out.push(key)
        }
        return out
      })
      console.log('[extractBreadcrumb] links collected:', links.length)

      // Classification des ancres par contexte DOM — générique, aucun code
      // par-vendeur. Deux familles :
      //   navLinks  : ancres sous header/nav/footer/aside/[role=navigation]
      //               (méga-menu, footer) → la découverte de produits les exclut.
      //   cardLinks : ancres de la zone contenu appartenant à des groupes
      //               répétés ≥ 3 de même signature structurelle (tag+classes
      //               du parent + classe de l'ancre). Les groupes contenant
      //               une image passent en premier : c'est la grille produit
      //               (cartes hydratées en AJAX, jamais dans le menu).
      const { navLinks, cardLinks } = await page.evaluate(() => {
        const NAV_SEL = 'header, nav, footer, aside, [role="navigation"]'
        // Bannières cookies/consent : leurs listes de liens d'aide (« gérer les
        // cookies dans Chrome/Firefox… ») forment un groupe répété qui passerait
        // pour une grille. Ni nav ni carte — on les ignore complètement.
        const CMP_SEL = '[id*="cookie" i], [class*="cookie" i], [id*="coi" i], [class*="consent" i], [id*="onetrust" i], [id*="didomi" i]'
        const pageHost = location.hostname.replace(/^www\./, '')
        const navSet = new Set<string>()
        interface Group { hasImg: boolean; items: { url: string; title: string }[]; urls: Set<string> }
        const groups = new Map<string, Group>()
        for (const el of Array.from(document.querySelectorAll('a[href]'))) {
          const a = el as HTMLAnchorElement
          const raw = a.href
          if (!raw || !/^https?:\/\//.test(raw)) continue
          const url = raw.replace(/#.*$/, '')
          if (a.closest(CMP_SEL)) continue
          if (a.closest(NAV_SEL)) { navSet.add(url); continue }
          // Une carte produit pointe vers le même site — les liens externes
          // (réseaux sociaux, aide navigateur…) ne sont jamais des fiches.
          try {
            const linkHost = new URL(url).hostname.replace(/^www\./, '')
            if (linkHost !== pageHost && !linkHost.endsWith('.' + pageHost) && !pageHost.endsWith('.' + linkHost)) continue
          } catch { continue }
          const p = a.parentElement
          const pCls = p && typeof p.className === 'string'
            ? p.className.trim().split(/\s+/).slice(0, 2).join('.')
            : ''
          const aCls = typeof a.className === 'string'
            ? a.className.trim().split(/\s+/).slice(0, 2).join('.')
            : ''
          const key = `${p?.tagName ?? ''}.${pCls}|A.${aCls}`
          let g = groups.get(key)
          if (!g) { g = { hasImg: false, items: [], urls: new Set() }; groups.set(key, g) }
          if (g.urls.has(url)) continue
          g.urls.add(url)
          if (a.querySelector('img, picture')) g.hasImg = true
          const title = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
            || (a.querySelector('img')?.getAttribute('alt') ?? '').trim()
          g.items.push({ url, title })
        }
        // Groupes répétés uniquement (≥ 3 URLs distinctes), image d'abord,
        // puis taille décroissante — la grille produit domine naturellement.
        const ranked = Array.from(groups.values())
          .filter((g) => g.items.length >= 3)
          .sort((x, y) => (Number(y.hasImg) - Number(x.hasImg)) || (y.items.length - x.items.length))
        const cards: { url: string; title: string }[] = []
        const seenCards = new Set<string>()
        for (const g of ranked) {
          for (const it of g.items) {
            if (seenCards.has(it.url)) continue
            seenCards.add(it.url)
            cards.push(it)
            if (cards.length >= 300) break
          }
          if (cards.length >= 300) break
        }
        return { navLinks: Array.from(navSet), cardLinks: cards }
      })
      console.log('[extractBreadcrumb] navLinks:', navLinks.length, '— cardLinks:', cardLinks.length)

      return { items: result.items, selector: result.selector, images, links, navLinks, cardLinks }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new HttpsError('internal', `Extraction breadcrumb échouée : ${msg}`)
    } finally {
      await page.close().catch(() => {})
    }
  },
)
