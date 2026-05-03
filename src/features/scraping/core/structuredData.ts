/**
 * Parse les données Schema.org/JSON-LD embarquées dans le HTML d'une page produit.
 * Source de vérité quand disponible (90%+ des sites e-commerce sérieux).
 */

export interface StructuredProductData {
  name?: string
  description?: string
  brand?: string
  manufacturer?: { name: string; url?: string }
  sku?: string
  gtin?: string
  mpn?: string
  category?: string
  images: string[]
  specs: Array<{ name: string; value: string }>
}

const stripHtml = (s: string): string => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()

const isProduct = (item: unknown): item is Record<string, unknown> => {
  if (!item || typeof item !== 'object') return false
  const t = (item as Record<string, unknown>)['@type']
  if (typeof t === 'string') return t === 'Product'
  if (Array.isArray(t)) return t.includes('Product')
  return false
}

const flattenItems = (items: unknown[]): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    if (Array.isArray(obj['@graph'])) {
      out.push(...flattenItems(obj['@graph']))
    } else {
      out.push(obj)
    }
  }
  return out
}

const scoreProduct = (p: Record<string, unknown>): number => {
  let s = 0
  if (p.name) s++
  if (p.description) s++
  if (p.sku) s++
  if (p.gtin13 || p.gtin || p.gtin12 || p.gtin8) s++
  if (p.mpn) s++
  if (p.brand) s++
  if (p.image) s++
  if (Array.isArray(p.additionalProperty) && p.additionalProperty.length > 0) s += p.additionalProperty.length
  return s
}

const extractImages = (img: unknown): string[] => {
  if (!img) return []
  if (typeof img === 'string') return /^https?:\/\//.test(img) ? [img] : []
  if (Array.isArray(img)) {
    return img
      .map(x => typeof x === 'string' ? x : (x && typeof x === 'object' && typeof (x as Record<string, unknown>).url === 'string' ? (x as Record<string, string>).url : null))
      .filter((u): u is string => !!u && /^https?:\/\//.test(u))
  }
  if (typeof img === 'object' && typeof (img as Record<string, unknown>).url === 'string') {
    const u = (img as Record<string, string>).url
    return /^https?:\/\//.test(u) ? [u] : []
  }
  return []
}

const extractBrand = (brand: unknown): string | undefined => {
  if (!brand) return undefined
  if (typeof brand === 'string') return brand
  if (typeof brand === 'object' && typeof (brand as Record<string, unknown>).name === 'string') {
    return (brand as Record<string, string>).name
  }
  return undefined
}

const extractSpecs = (props: unknown): Array<{ name: string; value: string }> => {
  if (!Array.isArray(props)) return []
  return props
    .map(p => {
      if (!p || typeof p !== 'object') return null
      const obj = p as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name : null
      const valueRaw = obj.value
      const unit = typeof obj.unitText === 'string' ? ' ' + obj.unitText : ''
      const value = valueRaw == null ? '' : String(valueRaw) + unit
      if (!name || !value) return null
      return { name: name.trim(), value: value.trim() }
    })
    .filter((x): x is { name: string; value: string } => x !== null)
}

export function parseStructuredDataFromHtml(html: string): StructuredProductData | null {
  if (typeof DOMParser === 'undefined') return null
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }

  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  const allItems: Record<string, unknown>[] = []
  for (const s of Array.from(scripts)) {
    try {
      const parsed = JSON.parse(s.textContent ?? '')
      if (Array.isArray(parsed)) {
        allItems.push(...flattenItems(parsed))
      } else {
        allItems.push(...flattenItems([parsed]))
      }
    } catch {
      // JSON malformé : skip ce <script>
    }
  }

  const products = allItems.filter(isProduct)
  if (products.length === 0) return null

  // Plusieurs Products : pick celui avec le plus de champs renseignés
  const product = products.length === 1
    ? products[0]
    : products.slice().sort((a, b) => scoreProduct(b) - scoreProduct(a))[0]

  const nameRaw = product.name
  const name = typeof nameRaw === 'string'
    ? nameRaw
    : Array.isArray(nameRaw) && typeof nameRaw[0] === 'string'
      ? nameRaw[0]
      : undefined

  const descRaw = typeof product.description === 'string' ? product.description : undefined
  const description = descRaw ? stripHtml(descRaw) : undefined

  const sku = typeof product.sku === 'string' ? product.sku : undefined
  const gtin = (typeof product.gtin13 === 'string' && product.gtin13)
    || (typeof product.gtin === 'string' && product.gtin)
    || (typeof product.gtin12 === 'string' && product.gtin12)
    || (typeof product.gtin8 === 'string' && product.gtin8)
    || undefined
  const mpn = typeof product.mpn === 'string' ? product.mpn : undefined
  const category = typeof product.category === 'string' ? product.category : undefined

  const brand = extractBrand(product.brand)
  const manufacturerRaw = product.manufacturer
  const manufacturer = (manufacturerRaw && typeof manufacturerRaw === 'object'
    && typeof (manufacturerRaw as Record<string, unknown>).name === 'string')
    ? {
        name: (manufacturerRaw as Record<string, string>).name,
        url: typeof (manufacturerRaw as Record<string, unknown>).url === 'string'
          ? (manufacturerRaw as Record<string, string>).url
          : undefined,
      }
    : undefined

  const images = extractImages(product.image)
  const specs = extractSpecs(product.additionalProperty)

  return { name, description, brand, manufacturer, sku, gtin: gtin || undefined, mpn, category, images, specs }
}
