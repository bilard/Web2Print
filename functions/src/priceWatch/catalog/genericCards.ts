// src/features/priceWatch/catalog/genericCards.ts
// Extraction GÉNÉRIQUE des produits d'une page liste, en 3ᵉ palier (après le parseur
// PrestaShop et le JSON-LD ItemList) pour les sites qui exposent des cartes en HTML
// SANS données structurées (ex. PrestaShop 1.6, thèmes maison). Deux signaux, du plus
// fiable au plus heuristique :
//   1. microdata schema.org/Product (itemprop) — structuré, sûr ;
//   2. cartes DOM répétées (conteneur class~=product contenant prix + lien) — best-effort.
// PUR + server-safe (regex, pas de DOMParser). Garde-fous stricts : un item n'est retenu
// que s'il a URL + prix + nom ; il faut ≥ 2 items (une liste en a plusieurs) ; dédup URL.
import { parsePriceFragment, type CompetitorListing } from './prestashop'

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è')

function absUrl(href: string, baseUrl?: string): string | undefined {
  const h = href.trim()
  if (!h || h.startsWith('#') || h.startsWith('javascript:')) return undefined
  if (/^https?:\/\//i.test(h)) return h
  if (baseUrl) { try { return new URL(h, baseUrl).href } catch { return undefined } }
  return undefined
}

/** Liens à IGNORER : panier/ajout, compte, navigation — jamais la fiche produit. */
const NON_PRODUCT_HREF = /[?&]add=|[?&]id_product=\d+[^"']*add|\/panier|\/cart|addtocart|\/wishlist|\/comparer|\/login|\/connexion|\/compte|\/account|mailto:|\/recherche|\/search/i
/** Textes de BOUTON / réassurance à ne jamais prendre pour un nom de produit. */
const BUTTON_TEXT = /^(?:ajouter au panier|add to cart|acheter|commander|voir(?: le produit| plus| détails)?|détails|en stock|rupture|disponible|quantit|nouveau|promo|-?\d+ ?%|aperçu|comparer|favoris)/i

/** Lien FICHE produit d'un bloc : href vers une fiche (.html, /id-slug, /product…),
 *  jamais un lien panier/compte. Repli : 1er lien interne non-nav. */
function extractCardUrl(block: string, baseUrl?: string): string | undefined {
  const hrefs = [...block.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)]
    .map((m) => m[1].trim())
    .filter((h) => h && !NON_PRODUCT_HREF.test(h))
  const product = hrefs.find((h) =>
    /\.html?(?:[?#]|$)|\/(?:product|produit|prod|item|article)[-/]|\/\d+-[a-z0-9-]+/i.test(h))
  return absUrl(product ?? hrefs[0] ?? '', baseUrl)
}

/** Nom : classe product-name / alt image / heading / titre — jamais un bouton ni un prix. */
function extractCardName(block: string): string | undefined {
  const candidates: string[] = []
  const push = (m: RegExpMatchArray | null) => { if (m) candidates.push(decode(stripTags(m[1]))) }
  push(block.match(/class="[^"]*(?:product-?(?:name|title))[^"]*"[^>]*>([\s\S]*?)</i))
  push(block.match(/<a\b[^>]*class="[^"]*(?:product|name|title)[^"]*"[^>]*\btitle=["']([^"']{3,140})["']/i))
  push(block.match(/<img\b[^>]*\balt=["']([^"']{3,140})["']/i))
  push(block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i))
  push(block.match(/<a\b[^>]*\btitle=["']([^"']{3,140})["']/i))
  for (const m of block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) push(m as unknown as RegExpMatchArray)
  for (const raw of candidates) {
    const txt = raw.slice(0, 160)
    if (txt.length >= 4 && !/^\d[\d\s.,]*€?$/.test(txt) && !BUTTON_TEXT.test(txt)) return txt
  }
  return undefined
}

/** Prix : 1er fragment « 1 299,90 € » du bloc (le prix produit est en tête ; le barré suit). */
function extractCardPrice(block: string): { price?: number; listPrice?: number } {
  const frags = [...block.matchAll(/(\d[\d\s .,]*\s*€|€\s*\d[\d\s .,]*)/g)].map((m) => m[1])
  const prices = frags.map(parsePriceFragment).filter((p): p is number => p != null && p > 0)
  if (prices.length === 0) return {}
  if (prices.length === 1) return { price: prices[0] }
  // Deux prix : le plus BAS = prix de vente, le plus HAUT = prix barré (remise).
  const sorted = [...prices].sort((a, b) => a - b)
  return { price: sorted[0], listPrice: sorted[sorted.length - 1] }
}

function extractCardImage(block: string, baseUrl?: string): string | undefined {
  const m = block.match(/<img\b[^>]*\b(?:data-(?:full-size-image-url|src|original|lazy)|src)=["']([^"']+)["']/i)
  const src = m?.[1]
  if (!src || src.startsWith('data:')) return undefined
  return absUrl(src, baseUrl)
}

/** Référence : label EXPLICITE « Réf/Référence/SKU » suivi d'un code contenant un chiffre.
 *  Strict pour éviter les faux positifs (« quantité » → « ity », etc.). */
function extractCardRef(block: string): string | undefined {
  const m = block.match(/itemprop=["']sku["'][^>]*content=["']([^"']+)["']/i)
    || block.match(/\b(?:r[ée]f(?:\.|érence)?|sku|mpn|code)\b[\s:]*(?:<[^>]+>[\s:]*)?([A-Z0-9][A-Z0-9._/-]{2,30})/i)
  const ref = m?.[1]?.trim()
  // Un vrai code produit contient au moins un chiffre.
  return ref && /\d/.test(ref) ? ref : undefined
}

/** Palier 1 — microdata schema.org/Product (blocs itemscope). */
function parseMicrodataProducts(html: string, baseUrl?: string): CompetitorListing[] {
  const out: CompetitorListing[] = []
  const re = /<([a-z0-9]+)\b[^>]*itemscope[^>]*itemtype=["'][^"']*schema\.org\/Product["'][\s\S]*?<\/\1>/gi
  for (const m of html.matchAll(re)) {
    const block = m[0]
    const name = extractCardName(block) ?? (block.match(/itemprop=["']name["'][^>]*content=["']([^"']+)["']/i)?.[1])
    const priceAttr = block.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1]
    const price = priceAttr ? parsePriceFragment(priceAttr) : extractCardPrice(block).price
    const url = extractCardUrl(block, baseUrl)
      ?? absUrl(block.match(/itemprop=["']url["'][^>]*(?:href|content)=["']([^"']+)["']/i)?.[1] ?? '', baseUrl)
    if (name && price != null && url) {
      out.push({ url, name, price, ref: extractCardRef(block), image: extractCardImage(block, baseUrl), currency: 'EUR' })
    }
  }
  return out
}

/** Palier 2 — cartes DOM répétées (conteneur class~=product). Best-effort, borné. */
function parseDomCards(html: string, baseUrl?: string): CompetitorListing[] {
  // Débuts de carte : <li|article|div class="…product…"> (mot « product » dans une classe).
  const starts = [...html.matchAll(/<(?:li|article|div)\b[^>]*class=["'][^"']*\bproduct[a-z0-9_-]*\b[^"']*["'][^>]*>/gi)]
  if (starts.length < 2) return []
  const out: CompetitorListing[] = []
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index ?? 0
    const to = i + 1 < starts.length ? (starts[i + 1].index ?? html.length) : Math.min(from + 4000, html.length)
    const block = html.slice(from, Math.min(to, from + 4000))
    const url = extractCardUrl(block, baseUrl)
    const { price, listPrice } = extractCardPrice(block)
    const name = extractCardName(block)
    if (url && price != null && name) {
      out.push({ url, name, price, listPrice, ref: extractCardRef(block), image: extractCardImage(block, baseUrl), currency: 'EUR' })
    }
  }
  return out
}

/**
 * Extrait les produits d'une page liste sans données structurées JSON-LD.
 * Renvoie [] (pas un demi-résultat douteux) si moins de 2 produits complets trouvés —
 * garde-fou : soit ce n'est pas une page liste, soit la techno n'est pas couverte.
 */
export function parseListingDomCards(html: string, baseUrl?: string): CompetitorListing[] {
  const micro = parseMicrodataProducts(html, baseUrl)
  const cards = micro.length >= 2 ? micro : parseDomCards(html, baseUrl)
  // Dédup par URL (les conteneurs imbriqués peuvent produire des doublons).
  const seen = new Set<string>()
  const deduped = cards.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
  return deduped.length >= 2 ? deduped : []
}
