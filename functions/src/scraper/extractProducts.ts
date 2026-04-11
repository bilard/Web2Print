import { load } from 'cheerio'
import type { ScrapedProduct } from './types'

/**
 * Extrait les produits d'une page HTML de manière générique, en priorité
 * via les données structurées (JSON-LD schema.org/Product), puis via des
 * heuristiques CSS communes aux boutiques e-commerce (Magento, Shopify,
 * WooCommerce, Prestashop).
 *
 * Aucune configuration spécifique par site — tout est heuristique.
 */
export function extractProducts(html: string, baseUrl: string): ScrapedProduct[] {
  const $ = load(html)
  const products: ScrapedProduct[] = []
  const seenSkus = new Set<string>()

  const push = (p: ScrapedProduct | null) => {
    if (!p || !p.name || !p.url) return
    if (seenSkus.has(p.sku)) return
    seenSkus.add(p.sku)
    products.push(p)
  }

  // 1. JSON-LD schema.org/Product (standard e-commerce)
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text()
    if (!raw) return
    try {
      const data = JSON.parse(raw)
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const graph = item?.['@graph']
        const candidates = Array.isArray(graph) ? graph : [item]
        for (const c of candidates) {
          const type = c?.['@type']
          const isProduct =
            type === 'Product' || (Array.isArray(type) && type.includes('Product'))
          if (!isProduct) continue
          push(productFromJsonLd(c, baseUrl))
        }
      }
    } catch {
      /* ignore JSON-LD parse errors */
    }
  })

  // 2. Fallback CSS : liens vers des pages produit
  if (products.length === 0) {
    const selectors = [
      'a.product-item-link',          // Magento
      'li.product a.woocommerce-LoopProduct-link', // WooCommerce
      'a.product-item-photo',         // Magento gallery
      '.product-card a',              // générique
      'article.product a',            // générique
      'a[href*="/product/"]',
      'a[href*="/produit/"]',
    ]
    const cards = $(selectors.join(', '))
    cards.each((_, el) => {
      const $a = $(el)
      const href = $a.attr('href')
      if (!href) return
      const url = absolutize(href, baseUrl)
      const card = $a.closest('.product-item, li.product, .product-card, article.product, .item')
      const scope = card.length > 0 ? card : $a
      const name =
        scope.find('.product-item-name, .woocommerce-loop-product__title, h2, h3').first().text().trim() ||
        $a.attr('title') ||
        $a.text().trim()
      const priceText = scope.find('.price, .price-box, .woocommerce-Price-amount').first().text().trim()
      const price = parsePrice(priceText)
      const img = scope.find('img').first()
      const imageUrl = absolutize(
        img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '',
        baseUrl,
      )
      const description = scope.find('.description, .product-item-description, p').first().text().trim()
      push({
        sku: slugify(url),
        name: name.slice(0, 180),
        description: description.slice(0, 500),
        price: price ?? 0,
        imageUrl,
        url,
      })
    })
  }

  return products
}

function productFromJsonLd(c: any, baseUrl: string): ScrapedProduct | null {
  const name: string = typeof c.name === 'string' ? c.name : ''
  if (!name) return null

  const sku: string =
    (typeof c.sku === 'string' && c.sku) ||
    (typeof c.mpn === 'string' && c.mpn) ||
    (typeof c['@id'] === 'string' && slugify(c['@id'])) ||
    slugify(name)

  const url = absolutize(
    typeof c.url === 'string' ? c.url : typeof c['@id'] === 'string' ? c['@id'] : '',
    baseUrl,
  )

  const image = Array.isArray(c.image) ? c.image[0] : c.image
  const imageUrl = absolutize(typeof image === 'string' ? image : image?.url ?? '', baseUrl)

  let price = 0
  const offers = Array.isArray(c.offers) ? c.offers[0] : c.offers
  if (offers) {
    const p = offers.price ?? offers.lowPrice ?? offers.highPrice
    if (p != null) price = parseFloat(String(p))
  }

  const description =
    typeof c.description === 'string' ? c.description.replace(/\s+/g, ' ').trim() : ''

  return {
    sku,
    name,
    description: description.slice(0, 800),
    price: Number.isFinite(price) ? price : 0,
    imageUrl,
    url,
    attributes: {
      brand: typeof c.brand === 'object' ? c.brand?.name : c.brand,
      category: c.category,
    },
  }
}

function absolutize(href: string, baseUrl: string): string {
  if (!href) return ''
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return href
  }
}

function parsePrice(text: string): number | null {
  if (!text) return null
  // prend le premier nombre (avec , ou .) dans le texte, ignore devise
  const m = text.replace(/\s/g, '').match(/(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  return parseFloat(m[1].replace(',', '.'))
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}
