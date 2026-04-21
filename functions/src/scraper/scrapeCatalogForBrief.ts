import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { fetchHtml } from './fetchHtml'
import { discoverCategories } from './discoverCategories'
import { extractProducts } from './extractProducts'
import type { ScrapeRequest, ScrapeResponse, ScrapedProduct } from './types'

if (!getApps().length) initializeApp()

const CACHE_TTL_MS = 60 * 60 * 1000 // 1h
const MAX_CATEGORIES = 8
const DEFAULT_MAX_PRODUCTS = 200

// Versionne le cache : toute modif de la stratégie de scraping bump ce numéro
// → clé de cache différente → ancien cache ignoré sans purge manuelle.
const SCRAPE_STRATEGY_VERSION = 'v2-search-per-keyword'

/**
 * Patterns d'endpoint de recherche courants (Magento 2, Shopify, WooCommerce,
 * Prestashop). On essaie le premier qui répond en 200 + HTML pour éviter le
 * 404 systématique. `{q}` = placeholder du keyword URL-encodé.
 */
const SEARCH_URL_TEMPLATES = [
  '/catalogsearch/result/?q={q}', // Magento 2 (Doublet, etc.)
  '/search?q={q}',                 // Shopify / generic
  '/?s={q}&post_type=product',     // WooCommerce
  '/recherche?search_query={q}',   // Prestashop
]

/**
 * Callable générique : scrape n'importe quel site e-commerce pour remonter
 * un échantillon de produits pertinents à un brief.
 *
 * Flux :
 *   1. Cache Firestore (clé = hash sourceUrl + keywords)
 *   2. Fetch homepage → discoverCategories(keywords) → top 3 liens
 *   3. Pour chaque catégorie → fetch → extractProducts()
 *   4. Concat + dédup + cap à maxProducts
 *   5. Cache Firestore TTL 1h
 */
export const scrapeCatalogForBrief = onCall<ScrapeRequest, Promise<ScrapeResponse>>(
  { region: 'europe-west1', timeoutSeconds: 60, memory: '512MiB', cors: true },
  async (request) => {
    const { sourceUrl, keywords = [], maxProducts = DEFAULT_MAX_PRODUCTS } = request.data || {}
    if (!sourceUrl || typeof sourceUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'sourceUrl requis')
    }
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }

    const cleanKeywords = (keywords || []).map((k) => String(k).trim()).filter(Boolean).slice(0, 10)
    const cacheKey = hashKey(sourceUrl, cleanKeywords)
    const db = getFirestore()
    const cacheRef = db.collection('scrapeCache').doc(cacheKey)

    // 1. Cache
    const cached = await cacheRef.get()
    if (cached.exists) {
      const data = cached.data() as { updatedAt: number; response: ScrapeResponse } | undefined
      if (data && Date.now() - data.updatedAt < CACHE_TTL_MS) {
        return { ...data.response, cacheHit: true }
      }
    }

    const warnings: string[] = []
    let homeHtml: string
    try {
      homeHtml = await fetchHtml(sourceUrl)
    } catch (err) {
      throw new HttpsError('unavailable', `Impossible de joindre le site source: ${(err as Error).message}`)
    }

    const allProducts: ScrapedProduct[] = []
    const crawledCategories: string[] = []

    // 2a. STRATÉGIE PRIMAIRE : recherche par mot-clé sur l'endpoint interne du
    //     site (Magento `/catalogsearch/result/?q=...`, etc). Chaque keyword
    //     ramène typiquement 10-30 produits → avec 10 keywords on couvre toute
    //     la largeur pertinente du catalogue au lieu de ~1 produit par catégorie
    //     homepage.
    const baseOrigin = new URL(sourceUrl).origin
    const template =
      cleanKeywords.length > 0
        ? await detectSearchTemplate(baseOrigin, encodeURIComponent(cleanKeywords[0]), warnings)
        : null

    if (template) {
      const searchUrls = cleanKeywords.map(
        (kw) => `${baseOrigin}${template.replace('{q}', encodeURIComponent(kw))}`,
      )
      const searchResults = await Promise.allSettled(
        searchUrls.map(async (url) => {
          const html = await fetchHtml(url)
          return { url, products: extractProducts(html, url) }
        }),
      )
      for (const r of searchResults) {
        if (r.status === 'fulfilled') {
          crawledCategories.push(r.value.url)
          allProducts.push(...r.value.products)
        } else {
          warnings.push(`Erreur recherche: ${r.reason?.message || r.reason}`)
        }
      }
    }

    // 2b. STRATÉGIE FALLBACK : discovery par homepage. Utile si aucun template
    //     de recherche n'a fonctionné (sites custom), ou en complément pour
    //     ramasser quelques produits supplémentaires.
    if (allProducts.length < 20) {
      let categories = discoverCategories(homeHtml, sourceUrl, cleanKeywords)
      if (categories.length === 0) {
        warnings.push('Aucune catégorie matchée sur la homepage.')
        categories = [{ url: sourceUrl, label: 'home', score: 0 }]
      }
      const topCategories = categories.slice(0, MAX_CATEGORIES)
      const results = await Promise.allSettled(
        topCategories.map(async (cat) => {
          const html = cat.url === sourceUrl ? homeHtml : await fetchHtml(cat.url)
          return { url: cat.url, products: extractProducts(html, cat.url) }
        }),
      )
      for (const r of results) {
        if (r.status === 'fulfilled') {
          crawledCategories.push(r.value.url)
          allProducts.push(...r.value.products)
        } else {
          warnings.push(`Erreur catégorie: ${r.reason?.message || r.reason}`)
        }
      }
    }

    // 4. Dedup + cap + sanitize (Firestore refuse les champs `undefined`)
    const seen = new Set<string>()
    const deduped: ScrapedProduct[] = []
    for (const p of allProducts) {
      const key = p.sku || p.url
      if (!key || seen.has(key)) continue
      seen.add(key)
      deduped.push(sanitizeProduct(p))
      if (deduped.length >= maxProducts) break
    }

    const response: ScrapeResponse = {
      products: deduped,
      crawledCategories,
      cacheHit: false,
      warnings,
    }

    // 5. Cache write (best-effort : on ne fait pas échouer la requête si le cache échoue)
    try {
      await cacheRef.set({
        sourceUrl,
        keywords: cleanKeywords,
        updatedAt: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
        response: stripUndefined(response),
      })
    } catch (err) {
      console.warn('[scrapeCatalogForBrief] cache write échoué', err)
      response.warnings.push(`Cache write échoué: ${(err as Error).message}`)
    }

    return response
  },
)

function sanitizeProduct(p: ScrapedProduct): ScrapedProduct {
  return {
    sku: p.sku || '',
    name: p.name || '',
    description: p.description || '',
    price: Number.isFinite(p.price) ? p.price : 0,
    imageUrl: p.imageUrl || '',
    url: p.url || '',
    magentoCategoryIds: p.magentoCategoryIds ?? [],
    attributes: p.attributes ? stripUndefined(p.attributes) : {},
  }
}

/** Retire récursivement les `undefined` (Firestore les refuse). */
function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map((v) => stripUndefined(v)) as unknown as T
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out as T
  }
  return obj
}

function hashKey(sourceUrl: string, keywords: string[]): string {
  const raw = `${SCRAPE_STRATEGY_VERSION}::${sourceUrl}::${[...keywords].sort().join('|')}`
  return createHash('sha1').update(raw).digest('hex')
}

/**
 * Détecte le pattern d'URL de recherche interne du site en essayant chaque
 * template jusqu'à en trouver un qui renvoie du HTML exploitable (≥ 1 produit
 * dans la page). Appelé une seule fois par run — le template validé est
 * réutilisé pour tous les keywords.
 */
async function detectSearchTemplate(
  origin: string,
  encodedQ: string,
  warnings: string[],
): Promise<string | null> {
  for (const tpl of SEARCH_URL_TEMPLATES) {
    const url = `${origin}${tpl.replace('{q}', encodedQ)}`
    try {
      const html = await fetchHtml(url)
      const found = extractProducts(html, url)
      if (found.length >= 1) return tpl
    } catch {
      /* template non supporté, on continue */
    }
  }
  warnings.push(
    "Aucun endpoint de recherche interne détecté sur ce site. Fallback sur la discovery homepage uniquement.",
  )
  return null
}
