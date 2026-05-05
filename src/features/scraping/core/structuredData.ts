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

/**
 * Parse les microdata Schema.org embarquées dans le HTML
 * (`<div itemscope itemtype="https://schema.org/Product">`).
 *
 * Beaucoup de sites e-commerce utilisent microdata au lieu (ou en plus) du
 * JSON-LD : Magento legacy, Prestashop, certains Shopify, sites custom.
 * Ce parser couvre ce cas — appelé en fallback de `parseStructuredDataFromHtml`.
 */
export function parseMicrodataFromHtml(html: string): StructuredProductData | null {
  if (typeof DOMParser === 'undefined') return null
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }

  // Trouve le scope Product (peut être imbriqué dans une page avec plusieurs)
  const productScopes = doc.querySelectorAll('[itemscope][itemtype*="schema.org/Product" i]')
  if (productScopes.length === 0) return null

  // Choisit le scope avec le plus de itemprop renseignés
  let bestScope: Element | null = null
  let bestCount = 0
  for (const scope of Array.from(productScopes)) {
    const count = scope.querySelectorAll('[itemprop]').length
    if (count > bestCount) {
      bestCount = count
      bestScope = scope
    }
  }
  if (!bestScope || bestCount === 0) return null

  /** Extrait la valeur d'un itemprop (gère content="", value attr, ou textContent) */
  const getItemprop = (root: Element, name: string): string | null => {
    // Prend le premier itemprop direct (pas dans un sub-scope imbriqué)
    const all = root.querySelectorAll(`[itemprop~="${name}" i]`)
    for (const el of Array.from(all)) {
      // Ignore si dans un sub-scope (ex: brand → on veut l'extérieur)
      let parent = el.parentElement
      let inSubScope = false
      while (parent && parent !== root) {
        if (parent.hasAttribute('itemscope')) { inSubScope = true; break }
        parent = parent.parentElement
      }
      if (inSubScope) continue

      const tag = el.tagName.toLowerCase()
      let val: string | null = null
      if (tag === 'meta') val = el.getAttribute('content')
      else if (tag === 'img') val = el.getAttribute('src') || el.getAttribute('content')
      else if (tag === 'a' || tag === 'link') val = el.getAttribute('href')
      else if (tag === 'time') val = el.getAttribute('datetime') || el.textContent
      else if (tag === 'data' || tag === 'meter') val = el.getAttribute('value') || el.textContent
      else val = el.getAttribute('content') || el.textContent
      val = val?.trim() ?? null
      if (val) return val
    }
    return null
  }

  /** Extrait les images : tous les itemprop="image" + meta images */
  const getImages = (root: Element): string[] => {
    const out: string[] = []
    for (const el of Array.from(root.querySelectorAll('[itemprop~="image" i]'))) {
      const tag = el.tagName.toLowerCase()
      const u = tag === 'img' ? el.getAttribute('src')
        : tag === 'meta' ? el.getAttribute('content')
        : el.getAttribute('href') || el.getAttribute('content')
      if (u && /^https?:\/\//.test(u) && !out.includes(u)) out.push(u)
    }
    return out
  }

  /** additionalProperty : <div itemprop="additionalProperty" itemscope itemtype="...PropertyValue">
   *    <meta itemprop="name" content="..."/>
   *    <meta itemprop="value" content="..."/>
   *  </div>
   */
  const getSpecs = (root: Element): Array<{ name: string; value: string }> => {
    const out: Array<{ name: string; value: string }> = []
    const propScopes = root.querySelectorAll('[itemprop~="additionalProperty" i][itemscope]')
    for (const scope of Array.from(propScopes)) {
      const name = getItemprop(scope, 'name')
      const value = getItemprop(scope, 'value')
      if (name && value) out.push({ name: name.trim(), value: value.trim() })
    }
    return out
  }

  const name = getItemprop(bestScope, 'name') ?? undefined
  const descRaw = getItemprop(bestScope, 'description') ?? undefined
  const description = descRaw ? stripHtml(descRaw) : undefined

  // Brand : peut être un sub-scope avec name, ou une string directe
  let brand: string | undefined
  const brandScope = bestScope.querySelector('[itemprop~="brand" i][itemscope]')
  if (brandScope) {
    const bn = brandScope.querySelector('[itemprop~="name" i]')
    brand = bn?.getAttribute('content') ?? bn?.textContent ?? undefined
  } else {
    brand = getItemprop(bestScope, 'brand') ?? undefined
  }
  brand = brand?.trim() || undefined

  const sku = getItemprop(bestScope, 'sku') ?? undefined
  const mpn = getItemprop(bestScope, 'mpn') ?? undefined
  const gtin = getItemprop(bestScope, 'gtin13')
    ?? getItemprop(bestScope, 'gtin')
    ?? getItemprop(bestScope, 'gtin12')
    ?? getItemprop(bestScope, 'gtin8')
    ?? undefined
  const category = getItemprop(bestScope, 'category') ?? undefined

  const images = getImages(bestScope)
  const specs = getSpecs(bestScope)

  // Pas de produit si aucune donnée utile
  if (!name && !description && images.length === 0 && specs.length === 0) return null

  return {
    name: name?.trim(),
    description: description?.trim(),
    brand,
    sku: sku?.trim(),
    gtin: gtin?.trim(),
    mpn: mpn?.trim(),
    category: category?.trim(),
    images,
    specs,
  }
}

/** Try JSON-LD then microdata. Returns first non-null result. */
export function parseStructuredDataAny(html: string): StructuredProductData | null {
  return parseStructuredDataFromHtml(html) ?? parseMicrodataFromHtml(html)
}
