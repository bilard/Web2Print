// Extracteur LISTE GÉNÉRIQUE (toute techno de site), SERVER-SAFE : regex + JSON, AUCUN
// DOMParser (contrairement à features/scraping/core/structuredData.ts, client-only). Lit le
// JSON-LD schema.org (`ItemList`/`Product`/`ProductGroup.hasVariant`/`@graph`) qu'exposent la
// plupart des e-commerce ET marketplaces (Shopify, WooCommerce, Magento, Amazon, Cdiscount…).
// Utilisé en FALLBACK de parseListingPage (PrestaShop) : quand ce dernier ne trouve rien,
// on tente l'extraction générique → la moisson n'est plus liée à une seule techno.
import type { CompetitorListing } from './prestashop'

type Availability = NonNullable<CompetitorListing['availability']>

const LD_JSON_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

/** Aplati @graph, mainEntity (CollectionPage/SearchResultsPage), ItemList.itemListElement
 *  (+ ListItem.item) et ProductGroup.hasVariant. */
function flatten(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) { for (const n of node) flatten(n, out); return }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (Array.isArray(obj['@graph'])) flatten(obj['@graph'], out)
  // `CollectionPage`/`SearchResultsPage` rangent leur ItemList sous `mainEntity` : sans
  // cette descente, une page catégorie entière rendait 0 produit (constaté sur castorama,
  // 51 Product publiés et invisibles). Mot-clé schema.org standard, pas un cas par-site.
  if (obj.mainEntity && typeof obj.mainEntity === 'object') flatten(obj.mainEntity, out)
  if (Array.isArray(obj.itemListElement)) flatten(obj.itemListElement, out)
  if (obj.item && typeof obj.item === 'object') flatten(obj.item, out) // ListItem → item
  if (Array.isArray(obj.hasVariant)) flatten(obj.hasVariant, out)
  out.push(obj)
}

const typesOf = (o: Record<string, unknown>): string[] => {
  const t = o['@type']
  return typeof t === 'string' ? [t] : Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : []
}
const isProduct = (o: Record<string, unknown>): boolean => typesOf(o).some((t) => /product/i.test(t))

/** Décode les entités HTML des chaînes JSON-LD (`&apos;`, `&amp;`, `&#39;`, `&eacute;`…).
 *  Le JSON-LD transporte du texte HTML-échappé : sans ça, les noms sortaient avec
 *  « &apos; » et les URLs d'image avec « &amp; » (image cassée à l'affichage). */
const NAMED: Record<string, string> = {
  amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ', eacute: 'é', egrave: 'è',
  agrave: 'à', ccedil: 'ç', ocirc: 'ô', ecirc: 'ê', ugrave: 'ù', deg: '°', euro: '€',
}
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[String(n).toLowerCase()] ?? m)
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? decodeEntities(v.trim()) : undefined)

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
    return isFinite(n) && n > 0 ? n : undefined
  }
  return undefined
}

function firstOffer(o: Record<string, unknown>): Record<string, unknown> | undefined {
  const off = o.offers
  if (Array.isArray(off)) return off.find((x) => x && typeof x === 'object') as Record<string, unknown> | undefined
  if (off && typeof off === 'object') return off as Record<string, unknown>
  return undefined
}

function mapAvailability(v: unknown): Availability | undefined {
  const s = str(v)?.toLowerCase()
  if (!s) return undefined
  if (/outofstock|soldout|discontinued/.test(s)) return 'out-of-stock'
  if (/preorder|backorder|presale/.test(s)) return 'on-order'
  if (/instock|onlineonly|instoreonly|limitedavailability/.test(s)) return 'in-stock'
  return undefined
}

function imageOf(v: unknown): string | undefined {
  if (Array.isArray(v)) return imageOf(v[0])
  if (typeof v === 'string') return str(v)
  if (v && typeof v === 'object') return str((v as Record<string, unknown>).url)
  return undefined
}

/** URL rendue absolue contre la page d'origine. Laisse passer `data:` (image inline). */
function absolutize(raw: string | undefined, baseUrl?: string): string | undefined {
  if (!raw || !baseUrl || /^(?:https?:|data:)/i.test(raw)) return raw
  try { return new URL(raw, baseUrl).toString() } catch { return raw }
}

function toListing(o: Record<string, unknown>, baseUrl?: string): CompetitorListing | null {
  const name = str(o.name)
  if (!name) return null
  const offer = firstOffer(o)
  const price = offer ? num(offer.price ?? offer.lowPrice) : undefined
  let url = str(o.url) ?? (offer ? str(offer.url) : undefined)
  if (url && baseUrl && !/^https?:\/\//i.test(url)) { try { url = new URL(url, baseUrl).toString() } catch { /* garde tel quel */ } }
  // L'image du JSON-LD est relative aussi souvent que l'URL produit (« /img/p/12.jpg »,
  // « //cdn.site.fr/… »). Oubliée ici, elle était stockée telle quelle et TOUTES les
  // vignettes du concurrent restaient cassées dans l'explorateur.
  const image = absolutize(imageOf(o.image), baseUrl)
  const currency = offer ? str(offer.priceCurrency) : undefined
  return {
    url: url ?? baseUrl ?? '',
    name,
    ref: str(o.sku) ?? str(o.mpn),
    price,
    currency,
    taxIncluded: currency ? true : undefined, // B2C schema.org = prix TTC affiché
    availability: offer ? mapAvailability(offer.availability) : undefined,
    gtin13: str(o.gtin13) ?? str(o.gtin) ?? str(o.gtin14),
    image,
  }
}

/**
 * Toutes les fiches d'une page (liste OU fiche) via le JSON-LD schema.org. Générique,
 * sans hypothèse de techno. Dédupliqué par URL (sinon par nom). [] si aucun Product JSON-LD.
 */
export function parseListingGeneric(html: string, baseUrl?: string): CompetitorListing[] {
  const items: Record<string, unknown>[] = []
  for (const m of html.matchAll(LD_JSON_RE)) {
    let parsed: unknown
    try { parsed = JSON.parse(m[1].trim()) } catch { continue }
    flatten(parsed, items)
  }
  const seen = new Set<string>()
  const out: CompetitorListing[] = []
  for (const o of items) {
    if (!isProduct(o)) continue
    const l = toListing(o, baseUrl)
    if (!l) continue
    const key = l.url || l.name
    if (seen.has(key)) continue
    seen.add(key)
    out.push(l)
  }
  return out
}
