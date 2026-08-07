// src/features/priceWatch/catalog/prestashop.ts
// Extracteur de catalogue PrestaShop 1.7. PUR : entrée = HTML, sortie = données.
//
// UN SEUL extracteur pour tous les sites (cf. « pas de scrapers par fournisseur ») :
// les 5 concurrents relevés sur le terrain sont des PrestaShop 1.7 et partagent les
// mêmes classes (`product-miniature`, `product-reference`, `product-price`). Les
// thèmes diffèrent (habillage, obfuscation base64 des liens chez l'un, référence en
// tête de titre chez un autre) — ce sont des VARIANTES gérées par des replis
// successifs, pas des implémentations séparées.
//
// Volontairement en expressions régulières et non via DOMParser : le même code doit
// tourner dans le navigateur ET dans une Cloud Function (pas de DOM côté serveur).

/** Un produit relevé chez un concurrent, tel qu'affiché. Prix VERBATIM, non converti. */
export interface CompetitorListing {
  url: string
  name: string
  /** Référence telle qu'affichée par le site (« Réf : 21130-2056 » → `21130-2056`). */
  ref?: string
  /** Prix affiché. Chez ces marchands B2C, c'est du TTC. */
  price?: number
  /** Prix barré (avant remise), quand le site en affiche un. */
  listPrice?: number
  currency?: string
  /** `true` si le site déclare explicitement un prix TTC, `false` si HT, sinon absent. */
  taxIncluded?: boolean
  availability?: Availability
  gtin13?: string
  /** URL de l'image principale du produit chez le concurrent. */
  image?: string
  /**
   * VENDEUR de l'offre — le marchand tiers sur une marketplace (Amazon, Cdiscount,
   * ManoMano), où le domaine ne dit plus qui vend : « vendu par Ets Dupont, expédié par
   * Amazon » n'est pas la même offre que celle d'Amazon lui-même.
   *
   * ⚠ AFFICHAGE SEUL. Sur les marketplaces cette valeur est extraite par un MODÈLE
   * (Firecrawl json+schema), pas lue dans un champ structuré : elle n'entre jamais dans
   * `toIdentity`, `proveMatch` ni `scorePair`. Un nom de marchand halluciné ne doit
   * pouvoir ni prouver ni condamner un appariement.
   */
  seller?: string
}

export type Availability = 'in-stock' | 'out-of-stock' | 'on-order'

/** Décode les entités HTML rencontrées dans les libellés marchands. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&(?:eacute|#233);/g, 'é').replace(/&(?:egrave|#232);/g, 'è')
    .replace(/&(?:agrave|#224);/g, 'à').replace(/&(?:ccedil|#231);/g, 'ç')
    .replace(/&(?:ecirc|#234);/g, 'ê').replace(/&(?:ocirc|#244);/g, 'ô')
    .replace(/&(?:ugrave|#249);/g, 'ù').replace(/&(?:icirc|#238);/g, 'î')
    .replace(/&(?:amp|#38);/g, '&').replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:#0?39|apos|rsquo|#8217);/g, "'")
    .replace(/&(?:lt|#60);/g, '<').replace(/&(?:gt|#62);/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
}

/** Texte visible d'un fragment HTML, espaces normalisés. */
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Prix depuis un fragment CIBLÉ (contenu d'une balise de prix), jamais depuis un bloc
 * entier : une carte produit contient un sélecteur de quantité « 1 2 3 … 25 » qui
 * ferait passer n'importe quel entier pour un prix.
 * Gère « 1 299,90 € », « 98.00 », « 4,67 € TTC ».
 */
export function parsePriceFragment(fragment: string): number | undefined {
  const txt = textOf(fragment)
  const m = txt.match(/-?\d[\d\s.,\u00a0\u202f]*\d|-?\d/)
  if (!m) return undefined
  let s = m[0].replace(/[\s\u00a0\u202f]/g, '')
  if (s.includes('.') && s.includes(',')) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.')
  } else if (s.includes(',')) {
    const parts = s.split(',')
    s = parts.length === 2 && parts[1].length <= 2 ? parts.join('.') : parts.join('')
  } else if (s.includes('.')) {
    const parts = s.split('.')
    // « 1.299 » = séparateur de milliers ; « 284.41 » = décimal.
    if (parts.length > 2 || parts[parts.length - 1].length === 3) s = parts.join('')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : undefined
}

/** Découpe une page liste en cartes produit. */
export function splitProductBlocks(html: string): string[] {
  const blocks = [...html.matchAll(/<article[^>]*\bproduct-miniature\b[\s\S]*?<\/article>/gi)]
    .map((m) => m[0])
  if (blocks.length) return blocks
  // Thèmes qui rendent les cartes en <div> plutôt qu'en <article>.
  return [...html.matchAll(/<div[^>]*\bproduct-miniature\b[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi)]
    .map((m) => m[0])
}

const REF_LABEL = /(?:r[ée]f(?:[ée]rence)?\s*[:.]?\s*)/i

/** Référence d'une carte : `product-reference`, sinon `itemprop="sku"`. */
function extractRef(block: string): string | undefined {
  const zone = block.match(/<[^>]*\bproduct-reference\b[^>]*>([\s\S]*?)<\/(?:div|span|p)>/i)
  if (zone) {
    const t = textOf(zone[1]).replace(REF_LABEL, '').trim()
    if (t) return t
  }
  const sku = block.match(/itemprop=["']sku["'][^>]*>([^<]+)</i)
    ?? block.match(/<[^>]*itemprop=["']sku["'][^>]*content=["']([^"']+)["']/i)
  if (sku) return textOf(sku[1]) || undefined
  // Label « Référence: X » en texte libre (jardimax : simple <p> stylé, sans classe ni
  // itemprop). Strict : le code doit contenir un chiffre — « référence, une pièce… »
  // (texte marketing) ne matche pas.
  const label = textOf(block).match(/\br[ée]f(?:\.|[ée]rence)?\s*[:.]\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,30})/i)
  const code = label?.[1]?.trim()
  return code && /\d/.test(code) ? code : undefined
}

/**
 * URL de la fiche. Un des thèmes relevés encode le lien en base64 dans `data-o`
 * (obfuscation anti-scraping légère) : on prend d'abord un `href` produit lisible,
 * puis on décode `data-o` en repli.
 */
function extractUrl(block: string, baseUrl?: string): string | undefined {
  const href = block.match(/<a[^>]+href=["'](https?:\/\/[^"']*?\/[^"']*?\.html)["']/i)
    ?? block.match(/<a[^>]+href=["'](\/[^"']*?\.html)["']/i)
  if (href) return absolutize(href[1], baseUrl)
  const dataO = block.match(/data-o=["']?([A-Za-z0-9+/=]{20,})["'\s>]/)
  if (dataO) {
    const decoded = decodeBase64(dataO[1])
    if (decoded?.startsWith('http')) return decoded
  }
  return undefined
}

function decodeBase64(b64: string): string | null {
  try {
    if (typeof atob === 'function') return atob(b64)
    // Cloud Functions : pas d'atob global sur les runtimes anciens.
    const B = (globalThis as { Buffer?: { from(s: string, e: string): { toString(e: string): string } } }).Buffer
    return B ? B.from(b64, 'base64').toString('utf8') : null
  } catch { return null }
}

function absolutize(url: string, baseUrl?: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (!baseUrl) return url
  try { return new URL(url, baseUrl).toString() } catch { return url }
}

/** Titre de la carte. */
function extractName(block: string): string {
  const t = block.match(/<[^>]*\bproduct-title\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|h4|p|div|span)>/i)
  if (t) return textOf(t[1])
  const img = block.match(/<img[^>]+alt=["']([^"']+)["']/i)
  return img ? decodeEntities(img[1]).trim() : ''
}

/**
 * URL de l'image principale d'une carte/fiche. PrestaShop charge l'image en lazy :
 * l'URL réelle est dans `data-src` / `data-full-size-image-url` ; `src` porte souvent
 * un placeholder SVG en `data:` — qu'on ignore. Prend la première image http(s).
 */
function extractImage(block: string, baseUrl?: string): string | undefined {
  const attrs = ['data-full-size-image-url', 'data-src', 'data-original', 'src']
  for (const attr of attrs) {
    const re = new RegExp(`<img[^>]+${attr}=["']([^"']+)["']`, 'i')
    const m = block.match(re)
    const raw = m?.[1]
    if (raw && !raw.startsWith('data:') && /\.(?:jpe?g|png|webp|gif)/i.test(raw)) {
      return absolutize(decodeEntities(raw), baseUrl)
    }
  }
  return undefined
}

/** Disponibilité déclarée. `null` si le site n'en affiche pas sur la liste. */
export function extractAvailability(html: string): Availability | undefined {
  const schema = html.match(/schema\.org\/(InStock|OutOfStock|PreOrder|BackOrder|SoldOut|LimitedAvailability)/i)
  if (schema) {
    const v = schema[1].toLowerCase()
    if (v === 'instock' || v === 'limitedavailability') return 'in-stock'
    if (v === 'preorder' || v === 'backorder') return 'on-order'
    return 'out-of-stock'
  }
  if (/\bproduct-unavailable\b|\brupture\b|\bépuis[ée]\b|\bindisponible\b/i.test(html)) return 'out-of-stock'
  if (/\bproduct-available\b|\ben stock\b|\bdisponible\b/i.test(html)) return 'in-stock'
  if (/\bsur commande\b|\bd[ée]lai\b/i.test(html)) return 'on-order'
  return undefined
}

/** Prix affiché + prix barré éventuel, depuis les zones de prix de la carte. */
function extractPrices(block: string): Pick<CompetitorListing, 'price' | 'listPrice' | 'taxIncluded' | 'currency'> {
  const out: Pick<CompetitorListing, 'price' | 'listPrice' | 'taxIncluded' | 'currency'> = {}

  // `content="98"` est la valeur machine, préférable au texte rendu.
  const contentAttr = block.match(/<[^>]*\bproduct-price\b[^>]*\bcontent=["']([\d.,]+)["']/i)
  if (contentAttr) out.price = parsePriceFragment(contentAttr[1])

  // Microdata schema.org : `<span itemprop="price" content="2.18">` (les deux ordres
  // d'attributs). Signal générique, gardé (ne s'active que si aucun prix trouvé).
  if (out.price == null) {
    const micro = block.match(/itemprop=["']price["'][^>]*\bcontent=["']([\d.,]+)["']/i)
      ?? block.match(/\bcontent=["']([\d.,]+)["'][^>]*itemprop=["']price["']/i)
    if (micro) out.price = parsePriceFragment(micro[1])
  }

  if (out.price == null) {
    // Itère les éléments de classe `price` et garde le PREMIER qui donne un nombre :
    // un libellé `sr-only` « Prix » précède parfois le vrai prix (emc), et une capture
    // naïve s'arrêterait dessus. On saute donc les fragments sans chiffre.
    // Cap large (800) : certains thèmes bourrent le span de blancs — le prix de
    // pieces-tracteur est à ~222 car. de l'ouverture, un cap à 160 le manquait.
    // `(?:\b|_)` : les thèmes BEM nomment la classe `…__price` (matijardin) — un
    // underscore est un caractère de MOT, `\bprice\b` ne le matche pas.
    for (const m of block.matchAll(/<(?:span|div|p)[^>]*class=["'][^"']*(?:\b|_)price(?:\b|_)[^"']*["'][^>]*>([\s\S]{0,800}?)<\/(?:span|div|p)>/gi)) {
      const p = parsePriceFragment(m[1])
      if (p != null) { out.price = p; break }
    }
  }

  const regular = block.match(/<[^>]*\b(?:regular-price|product-price--old|old-price)\b[^>]*>([\s\S]{0,200}?)<\/(?:span|div)>/i)
  if (regular) out.listPrice = parsePriceFragment(regular[1])

  const txt = textOf(block)
  if (/\bTTC\b/i.test(txt)) out.taxIncluded = true
  else if (/\bHT\b/.test(txt)) out.taxIncluded = false
  if (/€|EUR/i.test(txt)) out.currency = 'EUR'
  return out
}

/** Extrait toutes les fiches d'une page liste. */
/**
 * Le marchand publie-t-il ses prix ? (jumeau du client)
 *
 * PrestaShop expose sa configuration dans le JSON injecté de chaque page : `is_catalog` et
 * `show_prices: false` signifient que le serveur n'envoie AUCUN prix, à personne. Signal de
 * CMS standard, valable partout où ce moteur tourne — pas une particularité d'un site.
 */
export function detectCatalogMode(html: string): boolean {
  return /"is_catalog"\s*:\s*true/.test(html) || /"show_prices"\s*:\s*false/.test(html)
}

export function parseListingPage(html: string, baseUrl?: string): CompetitorListing[] {
  const out: CompetitorListing[] = []
  const seen = new Set<string>()
  for (const block of splitProductBlocks(html)) {
    const url = extractUrl(block, baseUrl)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const name = extractName(block)
    if (!name) continue
    out.push({
      url, name,
      ref: extractRef(block),
      availability: extractAvailability(block),
      image: extractImage(block, baseUrl),
      ...extractPrices(block),
    })
  }
  return out
}

/**
 * Objets JSON-LD d'une page. Parseur TOLÉRANT : le JSON-LD d'un des sites relevés est
 * syntaxiquement invalide (JSON.parse échoue) — on ne peut pas se reposer dessus seul.
 */
export function parseJsonLdObjects(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(m[1].trim())
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && typeof node === 'object') out.push(node as Record<string, unknown>)
      }
    } catch { /* bloc invalide : les replis regex prennent le relais */ }
  }
  return out
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined
  if (typeof v === 'number') return String(v)
  return undefined
}

/**
 * Extrait la fiche produit d'une page. JSON-LD `Product` en premier, replis regex
 * ensuite — pour les sites dont le JSON-LD est absent ou invalide.
 */
export function parseProductPage(html: string, url: string): CompetitorListing | null {
  const product = parseJsonLdObjects(html).find((o) => {
    const t = o['@type']
    return t === 'Product' || (Array.isArray(t) && t.includes('Product'))
  })

  const out: CompetitorListing = { url, name: '' }

  if (product) {
    out.name = str(product.name) ?? ''
    out.ref = str(product.sku) ?? str(product.mpn)
    out.gtin13 = str(product.gtin13) ?? str(product.gtin)
    const img = product.image
    out.image = str(Array.isArray(img) ? img[0] : img)
    const offersRaw = product.offers
    const offer = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as Record<string, unknown> | undefined
    if (offer) {
      const p = str(offer.price)
      if (p) out.price = parsePriceFragment(p)
      out.currency = str(offer.priceCurrency)
      const avail = str(offer.availability)
      if (avail) out.availability = extractAvailability(avail)
      // Vendeur DÉCLARÉ dans l'offre — `offers.seller.name` sur les marketplaces. Lu ici
      // il est structuré, donc fiable, contrairement à l'extraction par modèle du palier
      // Firecrawl. Absent chez un marchand qui vend son propre stock : c'est normal.
      const sellerRaw = offer.seller
      const seller = (typeof sellerRaw === 'object' && sellerRaw !== null)
        ? str((sellerRaw as Record<string, unknown>).name)
        : str(sellerRaw)
      if (seller) out.seller = seller
    }
  }

  if (!out.name) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    out.name = h1 ? textOf(h1[1]) : ''
  }
  if (!out.ref) out.ref = extractRef(html)
  if (!out.image) out.image = extractImage(html, url)
  if (out.price == null) {
    const zone = html.match(/<[^>]*\bcurrent-price\b[\s\S]{0,300}?<\/div>/i)
      ?? html.match(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i)
    if (zone) out.price = parsePriceFragment(zone[1] ?? zone[0])
  }
  if (out.listPrice == null) {
    const regular = html.match(/<[^>]*\bregular-price\b[^>]*>([\s\S]{0,200}?)<\/span>/i)
    if (regular) out.listPrice = parsePriceFragment(regular[1])
  }
  if (out.availability == null) out.availability = extractAvailability(html)
  if (out.taxIncluded == null) {
    // Mention lue près du prix uniquement : « TTC » apparaît dans les CGV de toute page.
    const near = html.match(/<[^>]*\b(?:current-price|product-price|price)\b[\s\S]{0,300}?<\/(?:div|span)>/i)
    if (near) {
      const t = textOf(near[0])
      if (/\bTTC\b/i.test(t)) out.taxIncluded = true
      else if (/\bHT\b/.test(t)) out.taxIncluded = false
    }
  }

  return out.name || out.ref ? out : null
}

/**
 * URL de la page suivante d'une liste paginée. PrestaShop expose `rel="next"` ;
 * repli sur le paramètre `?page=`.
 */
export function nextListingUrl(html: string, currentUrl: string): string | null {
  const rel = html.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<a[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<a[^>]+href=["']([^"']+)["'][^>]*rel=["']next["']/i)
  if (rel) return absolutize(decodeEntities(rel[1]), currentUrl)
  return null
}

/** Ajoute/incrémente `?page=N` — repli quand le thème n'expose pas `rel="next"`. */
export function pageUrl(baseUrl: string, page: number): string {
  try {
    const u = new URL(baseUrl)
    u.searchParams.set('page', String(page))
    return u.toString()
  } catch {
    return baseUrl
  }
}
