// src/features/priceWatch/catalog/genericCards.ts
// Extraction GÉNÉRIQUE des produits d'une page liste, en 3ᵉ palier (après le parseur
// PrestaShop et le JSON-LD ItemList) pour les sites qui exposent des cartes en HTML
// SANS données structurées (ex. PrestaShop 1.6, thèmes maison). Trois signaux, du plus
// fiable au plus heuristique :
//   1. microdata schema.org/Product (itemprop) — structuré, sûr ;
//   2. payload produit JSON porté par un attribut `data-*` (datalayer / ajout au panier) ;
//   3. cartes DOM répétées (conteneur class~=product contenant prix + lien) — best-effort.
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

/** HT / TTC lu dans le TEXTE de la carte (« 9,33 € HT » vs « 12,50 € TTC ») — pour que
 *  la comparaison de prix soit alignée (comparePrices divise par la TVA seulement si TTC). */
function extractTaxIncluded(block: string): boolean | undefined {
  const txt = block.replace(/<[^>]+>/g, ' ')
  if (/\bTTC\b/i.test(txt)) return true
  if (/\bHT\b/.test(txt)) return false
  return undefined
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
  const sku = block.match(/itemprop=["']sku["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim()
  if (sku && /\d/.test(sku)) return sku
  // Repli label. Le label peut être HTML-ENCODÉ (« R&eacute;f. 07-17-703-25 » chez
  // 190cc) → regex sur la version décodée. Séparateur ([:.] ou espace) OBLIGATOIRE
  // après le mot : sans lui, `class="referal"` matcherait « ref » + « eral ». On
  // balaie TOUTES les occurrences : un vrai code produit contient au moins un chiffre.
  for (const m of decode(block).matchAll(/\b(?:r[ée]f(?:\.|[ée]rence)?|sku|mpn|code)(?:\s*[:.]\s*|\s+)(?:<[^>]+>[\s:]*)?([A-Z0-9][A-Z0-9._/-]{2,30})/gi)) {
    const ref = m[1]?.trim()
    if (ref && /\d/.test(ref)) return ref
  }
  return undefined
}

/** Palier 1 — microdata schema.org/Product (blocs itemscope).
 *  Découpage d'un début d'itemscope Product au SUIVANT (borné), jamais par appariement
 *  de balise fermante : une carte réelle contient des dizaines de <div> imbriqués et le
 *  `[\s\S]*?<\/div>` non-greedy s'arrêtait au premier </div> — bloc tronqué sans nom ni
 *  prix, 0 produit extrait (constaté sur 190cc.fr, 48 cartes ignorées). */
function parseMicrodataProducts(html: string, baseUrl?: string): CompetitorListing[] {
  const out: CompetitorListing[] = []
  const starts = [...html.matchAll(/<[a-z0-9]+\b[^>]*itemscope[^>]*itemtype=["'][^"']*schema\.org\/Product["'][^>]*>/gi)]
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index ?? 0
    const to = i + 1 < starts.length ? (starts[i + 1].index ?? html.length) : Math.min(from + 8000, html.length)
    const block = html.slice(from, Math.min(to, from + 8000))
    const name = extractCardName(block) ?? (block.match(/itemprop=["']name["'][^>]*content=["']([^"']+)["']/i)?.[1])
    const priceAttr = block.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1]
    const price = priceAttr ? parsePriceFragment(priceAttr) : extractCardPrice(block).price
    const url = extractCardUrl(block, baseUrl)
      ?? absUrl(block.match(/itemprop=["']url["'][^>]*(?:href|content)=["']([^"']+)["']/i)?.[1] ?? '', baseUrl)
    if (name && price != null && url) {
      out.push({ url, name, price, ref: extractCardRef(block), image: extractCardImage(block, baseUrl), currency: 'EUR', ...(extractTaxIncluded(block) !== undefined ? { taxIncluded: extractTaxIncluded(block) } : {}) })
    }
  }
  return out
}

/**
 * Lit l'objet JSON qui commence à `start` (un `{`) en suivant l'imbrication et les chaînes.
 *
 * ⚠ La valeur de l'attribut ne peut PAS servir de délimiteur : un thème qui sérialise un
 * nom contenant une apostrophe casse son propre `data-x='…'` (relevé sur swap-europe :
 * `data-piece='{"name":"Poire d'amorçage…'` — l'attribut se ferme au milieu du JSON, et
 * un découpage par quotes rendait un fragment inparsable). Les chaînes JSON, elles, sont
 * toujours entre guillemets doubles échappés : l'imbrication est un délimiteur fiable.
 */
function readJsonObject(html: string, start: number, max = 4000): string | null {
  let depth = 0
  let inStr = false
  let esc = false
  const end = Math.min(html.length, start + max)
  for (let i = start; i < end; i++) {
    const ch = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return html.slice(start, i + 1)
  }
  return null
}

/** Clés admises pour chaque champ d'un payload produit, toutes conventions confondues. */
const KEY_NAME = ['name', 'title', 'item_name', 'productname', 'label', 'libelle']
const KEY_URL = ['url', 'link', 'href', 'producturl', 'permalink']
const KEY_PRICE = ['price', 'user_price', 'unit_price', 'value', 'amount', 'prix']
const KEY_REF = ['ref', 'sku', 'reference', 'mpn', 'code', 'item_id']
const KEY_IMAGE = ['image', 'img', 'picture', 'thumbnail', 'photo']

/** Première valeur non vide parmi `keys` (comparaison de clés insensible à la casse). */
function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]))
  for (const k of keys) {
    const real = lower.get(k)
    const v = real != null ? obj[real] : undefined
    if (v != null && v !== '') return v
  }
  return undefined
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return isFinite(v) && v > 0 ? v : undefined
  if (typeof v !== 'string') return undefined
  const n = parsePriceFragment(v)
  return n != null && n > 0 ? n : undefined
}

/** Combien de caractères, avant le payload, forment le texte visible de la carte. */
const CARD_LOOKBEHIND = 4000

/**
 * Palier 2 — payload produit JSON porté par un attribut `data-*` (convention datalayer /
 * ajout au panier : `data-product`, `data-item`, `data-gtm-product`, `data-piece`…).
 *
 * Le signal n'est PAS le nom de l'attribut mais son CONTENU : un objet JSON portant à la
 * fois un nom, une URL de fiche et un prix. C'est souvent la seule structure exploitable
 * des plateformes maison, qui ne publient ni microdata ni classe « product » — sur
 * swap-europe les cartes s'appellent `piecePlug`, et les trois paliers rendaient 0.
 *
 * Le prix RETENU reste celui LU DANS LE TEXTE de la carte (et avec lui la mention TTC/HT) :
 * le payload transporte fréquemment le prix HT du back-office alors que la grille affiche
 * le TTC. Le prix du payload ne sert que de repli.
 */
function parseDataPayloadProducts(html: string, baseUrl?: string): CompetitorListing[] {
  const out: CompetitorListing[] = []
  let prevEnd = 0
  for (const m of html.matchAll(/\bdata-[a-z0-9-]+\s*=\s*["']?\s*(?=\{)/gi)) {
    const at = (m.index ?? 0) + m[0].length
    const raw = readJsonObject(html, at)
    if (!raw) continue
    let obj: unknown
    // Un attribut en guillemets doubles encode ses propres `"` en entités : 2ᵉ tentative.
    try { obj = JSON.parse(raw) } catch { try { obj = JSON.parse(decode(raw)) } catch { continue } }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue
    const rec = obj as Record<string, unknown>
    const name = pick(rec, KEY_NAME)
    const url = pick(rec, KEY_URL)
    const payloadPrice = asNumber(pick(rec, KEY_PRICE))
    if (typeof name !== 'string' || name.trim().length < 4) continue
    if (typeof url !== 'string' || !url.includes('/')) continue
    if (payloadPrice == null) continue
    const abs = absUrl(url, baseUrl)
    if (!abs) continue
    // Texte visible de la carte : du payload précédent (ou d'une fenêtre bornée) jusqu'ici.
    const block = html.slice(Math.max(prevEnd, at - CARD_LOOKBEHIND), at)
    prevEnd = at + raw.length
    const { price, listPrice } = extractCardPrice(block)
    const ref = pick(rec, KEY_REF)
    const image = pick(rec, KEY_IMAGE)
    const taxIncluded = extractTaxIncluded(block)
    out.push({
      url: abs,
      name: decode(name.trim()).slice(0, 200),
      price: price ?? payloadPrice,
      listPrice,
      ref: ref != null && String(ref).trim() ? String(ref).trim() : undefined,
      image: typeof image === 'string' ? absUrl(image, baseUrl) : undefined,
      currency: 'EUR',
      ...(taxIncluded !== undefined ? { taxIncluded } : {}),
    })
  }
  return out
}

/** Une carte par tranche, entre deux positions de découpe. */
function cutCards(html: string, starts: number[], baseUrl?: string): CompetitorListing[] {
  const out: CompetitorListing[] = []
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]
    const to = i + 1 < starts.length ? starts[i + 1] : Math.min(from + 4000, html.length)
    const block = html.slice(from, Math.min(to, from + 4000))
    const url = extractCardUrl(block, baseUrl)
    const { price, listPrice } = extractCardPrice(block)
    const name = extractCardName(block)
    if (url && price != null && name) {
      out.push({ url, name, price, listPrice, ref: extractCardRef(block), image: extractCardImage(block, baseUrl), currency: 'EUR', ...(extractTaxIncluded(block) !== undefined ? { taxIncluded: extractTaxIncluded(block) } : {}) })
    }
  }
  return out
}

/**
 * Palier 3 — cartes DOM répétées (conteneur class~=product). Best-effort, borné.
 *
 * ⚠ Découper sur TOUS les conteneurs « product… » à la fois FRAGMENTE les cartes. Un thème
 * qui pose un `<div class="product-flag">Produit conseillé</div>` AU MILIEU de sa carte y
 * ouvre une fausse carte : le morceau qui porte le nom et le prix ne contient plus le
 * visuel, resté en amont — et c'est ce morceau-là que la dédup par URL retient, puisque le
 * fragment complet, lui, se fait couper avant d'avoir un nom. Mesuré sur une page réelle :
 * 100 fiches relevées mais 63 visuels seulement, sans rien pour l'expliquer à l'écran.
 *
 * On découpe donc avec UN SEUL mot de classe à la fois. Le conteneur RÉEL se répète une
 * fois par produit, là où un élément décoratif interne n'apparaît que sur certaines cartes.
 * La découpe groupée reste en lice : sur un thème qui alterne les noms de classe d'une
 * carte à l'autre, c'est elle qui en trouve le plus.
 */
function parseDomCards(html: string, baseUrl?: string): CompetitorListing[] {
  // Débuts de carte : <li|article|div class="…product…"> (mot « product » dans une classe).
  const starts = [...html.matchAll(/<(?:li|article|div)\b[^>]*class=["'][^"']*\b(product[a-z0-9_-]*)\b[^"']*["'][^>]*>/gi)]
  if (starts.length < 2) return []

  const byToken = new Map<string, number[]>()
  for (const m of starts) {
    const bucket = byToken.get((m[1] ?? '').toLowerCase())
    if (bucket) bucket.push(m.index ?? 0)
    else byToken.set((m[1] ?? '').toLowerCase(), [m.index ?? 0])
  }

  let best: CompetitorListing[] = []
  let bestImages = -1
  const candidates = [starts.map((m) => m.index ?? 0), ...byToken.values()]
  for (const positions of candidates) {
    if (positions.length < 2) continue
    const cards = cutCards(html, positions, baseUrl)
    const images = cards.filter((c) => c.image).length
    // ⚠ Jamais troquer des PRODUITS contre des visuels : perdre une fiche coûte plus cher
    // que perdre sa photo. Le nombre de cartes prime ; les visuels ne départagent qu'à
    // égalité — ce qui suffit à écarter la découpe fragmentée, à cartes égales.
    if (cards.length > best.length || (cards.length === best.length && images > bestImages)) {
      best = cards
      bestImages = images
    }
  }
  return best
}

/** Dédup par URL (les conteneurs imbriqués peuvent produire des doublons). */
function dedupe(cards: CompetitorListing[]): CompetitorListing[] {
  const seen = new Set<string>()
  return cards.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
}

/**
 * Extrait les produits d'une page liste sans données structurées JSON-LD : microdata,
 * puis payload `data-*`, puis cartes DOM. Le premier palier à ≥ 2 produits gagne.
 * Renvoie [] (pas un demi-résultat douteux) si aucun n'atteint 2 — garde-fou : soit ce
 * n'est pas une page liste, soit la techno n'est pas couverte.
 */
export function parseListingDomCards(html: string, baseUrl?: string): CompetitorListing[] {
  for (const tier of [parseMicrodataProducts, parseDataPayloadProducts, parseDomCards]) {
    const cards = dedupe(tier(html, baseUrl))
    if (cards.length >= 2) return cards
  }
  return []
}
