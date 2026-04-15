import type { ProductPrice } from './types'

/**
 * Extrait les images marquées "principales" par le site depuis le HTML rendu.
 * Sources génériques (par priorité) :
 *   1. og:image  /  og:image:secure_url
 *   2. twitter:image  /  twitter:image:src
 *   3. JSON-LD schema.org (Product.image, offers.image, @graph[].image)
 *   4. <link rel="image_src" href>
 * Filtrage : data:, blob:, pixels de tracking, dimensions < 200px quand connues.
 */
export function extractPrimaryImagesFromHtml(html: string | null, baseUrl: string): string[] {
  if (!html) return []
  const out: string[] = []
  const seen = new Set<string>()
  const rejected: string[] = []

  const toAbs = (u: string): string | null => {
    try { return new URL(u, baseUrl).toString() } catch { return null }
  }
  const reject = (url: string, reason: string) => { rejected.push(`${reason}: ${url.slice(0, 120)}`) }
  const acceptable = (url: string): boolean => {
    if (!url) return false
    if (/^data:/i.test(url)) { reject(url, 'data'); return false }
    if (/^blob:/i.test(url)) { reject(url, 'blob'); return false }
    if (/[?&](?:utm_|ga_|gclid|fbclid)/i.test(url) && /\/(?:track|pixel|beacon|1x1|spacer)/i.test(url)) { reject(url, 'tracker'); return false }
    if (/(?:^|[/_-])(?:1x1|pixel|spacer|blank|transparent|beacon)[._-]/i.test(url)) { reject(url, 'pixel'); return false }
    // Rejeter logos, pictos, icônes, favicons (souvent og:image par défaut ou éléments déco)
    // On scanne TOUTE la pathname (segments dossiers + filename) car beaucoup de sites
    // rangent ces assets sous /pictos/, /logos/, /brand/, /icons/, etc.
    try {
      const pathLower = new URL(url).pathname.toLowerCase()
      const NOISE_RE = /(?:^|[\/_\-.])(?:logo|logos|picto|pictos|pictogram[a-z]*|icon|icons|icone|icones|favicon|apple-touch-icon|badge|badges|brand|brands|social|share|og-default|default|label|sticker|flag|flags)(?:[\/_\-.]|$)/i
      if (NOISE_RE.test(pathLower)) { reject(url, 'logo-picto'); return false }
    } catch { /* URL invalide — laisser passer */ }
    return true
  }
  const push = (raw: string) => {
    const abs = toAbs(raw.trim())
    if (!abs || !acceptable(abs)) return
    if (seen.has(abs)) return
    seen.add(abs)
    out.push(abs)
  }

  // 1. og:image (name|property)
  const metaRe = /<meta[^>]+(?:property|name)\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/gi
  const metaReRev = /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["']([^"']+)["'][^>]*>/gi
  const metaKey = (k: string) => /^(og:image(?::secure_url|:url)?|twitter:image(?::src)?)$/i.test(k)
  for (const m of html.matchAll(metaRe)) {
    if (metaKey(m[1])) push(m[2])
  }
  for (const m of html.matchAll(metaReRev)) {
    if (metaKey(m[2])) push(m[1])
  }

  // 2. <link rel="image_src">
  for (const m of html.matchAll(/<link[^>]+rel\s*=\s*["']image_src["'][^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    push(m[1])
  }
  for (const m of html.matchAll(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']image_src["']/gi)) {
    push(m[1])
  }

  // 3. JSON-LD (Product.image et variantes)
  const ldBlocks = [...html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const visit = (node: unknown): void => {
    if (!node) return
    if (Array.isArray(node)) { for (const n of node) visit(n); return }
    if (typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    const img = obj.image
    if (typeof img === 'string') push(img)
    else if (Array.isArray(img)) for (const v of img) { if (typeof v === 'string') push(v); else if (v && typeof v === 'object') visit(v) }
    else if (img && typeof img === 'object') {
      const url = (img as Record<string, unknown>).url
      if (typeof url === 'string') push(url)
    }
    for (const v of Object.values(obj)) if (v && typeof v === 'object') visit(v)
  }
  for (const b of ldBlocks) {
    try { visit(JSON.parse(b[1].trim())) } catch { /* JSON-LD invalide — ignorer */ }
  }

  // 4. Fallback : <img> dans conteneurs produit/gallery/zoom
  // (indispensable quand la page n'a pas de og:image ni JSON-LD Product)
  if (out.length === 0) {
    const galleryHtmlRe = /<(?:div|section|figure|ul|ol|picture)[^>]*(?:class|id)\s*=\s*["']([^"']*)["'][^>]*>([\s\S]{0,15000}?)<\/(?:div|section|figure|ul|ol|picture)>/gi
    const GALLERY_TOKENS = /product[_-]?(?:image|photo|gallery|media)|gallery|zoom|main[_-]?image|hero[_-]?image|visual|carousel|slider|pdp[_-]?(?:image|media)|fiche[_-]?(?:image|produit)/i
    const imgTagRe = /<img[^>]+(?:src|data-src|data-zoom-src|data-large|data-original|data-lazy)\s*=\s*["']([^"'#]+)["'][^>]*>/gi
    const seenInGallery = new Set<string>()
    for (const gm of html.matchAll(galleryHtmlRe)) {
      if (!GALLERY_TOKENS.test(gm[1])) continue
      for (const im of gm[2].matchAll(imgTagRe)) {
        const src = im[1].trim()
        if (!src || seenInGallery.has(src)) continue
        seenInGallery.add(src)
        // Rejeter SVG icônes et très petits (si dimensions visibles dans attrs)
        if (/\.svg(\?|$)/i.test(src)) continue
        const parent = im[0]
        const wMatch = parent.match(/\bwidth\s*=\s*["']?(\d+)/i)
        const hMatch = parent.match(/\bheight\s*=\s*["']?(\d+)/i)
        if (wMatch && parseInt(wMatch[1], 10) < 150) continue
        if (hMatch && parseInt(hMatch[1], 10) < 150) continue
        push(src)
      }
    }
  }

  // 5. Dernier recours : <img> dont src pointe vers /products/, /product/, /media/, /assets/
  if (out.length === 0) {
    const productPathRe = /\/(products?|media|assets|uploads?|files|catalog)\/[^"']*\.(?:jpe?g|png|webp|avif)(?:\?[^"']*)?$/i
    const imgAllRe = /<img[^>]+(?:src|data-src|data-zoom-src|data-original)\s*=\s*["']([^"'#]+)["'][^>]*>/gi
    for (const m of html.matchAll(imgAllRe)) {
      const src = m[1].trim()
      if (productPathRe.test(src)) push(src)
      if (out.length >= 8) break
    }
  }

  if (out.length === 0) {
    // Diagnostic : si rien n'a été trouvé, dumper un échantillon du <head> pour comprendre pourquoi
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
    const headStr = headMatch ? headMatch[1] : html.slice(0, 4000)
    const metaMatches = [...headStr.matchAll(/<meta[^>]*>/gi)].map(m => m[0]).slice(0, 10)
    console.log('[primary-images] ⚠ zero extracted — htmlLen=', html.length, 'head sample meta tags:', metaMatches)
  } else {
    console.log('[primary-images] extracted:', out.length, 'rejected:', rejected.length, 'sample:', out.slice(0, 3))
  }
  return out
}

/**
 * Extrait le fil d'Ariane (breadcrumb) depuis le HTML.
 * Sources (par priorité) :
 *  1. JSON-LD BreadcrumbList
 *  2. <nav aria-label="breadcrumb"> / <ol class="breadcrumb">
 *  3. microdata [itemtype="BreadcrumbList"]
 * Retourne la liste des segments du plus général au plus spécifique.
 */
/** Décode les entités HTML standard (&gt; &lt; &amp; &quot; &#39; &nbsp; &eacute; etc.)
 *  en utilisant un élément DOM temporaire (gère aussi les entités numériques &#NN; / &#xNN;). */
function decodeHtmlEntities(s: string): string {
  if (!s || !/&[a-z#0-9]+;/i.test(s)) return s
  try {
    const el = document.createElement('textarea')
    el.innerHTML = s
    return el.value
  } catch {
    return s
      .replace(/&gt;/gi, '>')
      .replace(/&lt;/gi, '<')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/gi, ' ')
  }
}

export function extractBreadcrumbFromHtml(html: string | null): string[] {
  if (!html) return []
  const segments: string[] = []
  const seen = new Set<string>()
  const push = (t: string) => {
    const decoded = decodeHtmlEntities(t)
    const s = decoded.replace(/\s+/g, ' ').trim()
    if (!s || s.length > 80) return
    if (seen.has(s.toLowerCase())) return
    seen.add(s.toLowerCase())
    segments.push(s)
  }

  // 1) JSON-LD BreadcrumbList
  const ldBlocks = [...html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const b of ldBlocks) {
    try {
      const parsed = JSON.parse(b[1].trim()) as unknown
      const visit = (n: unknown): void => {
        if (!n) return
        if (Array.isArray(n)) { for (const x of n) visit(x); return }
        if (typeof n !== 'object') return
        const obj = n as Record<string, unknown>
        const type = String(obj['@type'] ?? '')
        if (type === 'BreadcrumbList' && Array.isArray(obj.itemListElement)) {
          for (const it of obj.itemListElement as unknown[]) {
            if (!it || typeof it !== 'object') continue
            const rec = it as Record<string, unknown>
            const name = typeof rec.name === 'string' ? rec.name : ''
            const item = rec.item
            const itemName = item && typeof item === 'object' ? String((item as Record<string, unknown>).name ?? '') : ''
            push(name || itemName)
          }
        }
        for (const v of Object.values(obj)) if (v && typeof v === 'object') visit(v)
      }
      visit(parsed)
    } catch { /* ignore */ }
  }
  if (segments.length > 0) return segments

  // 2) <nav/ol class*=breadcrumb> : extraire textes d'anchor + span terminal
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const containers = doc.querySelectorAll('[class*="breadcrumb" i],[id*="breadcrumb" i],nav[aria-label*="breadcrumb" i],nav[aria-label*="fil" i]')
    for (const c of containers) {
      // Items = <li>, <a>, <span>
      const items = c.querySelectorAll('li, a, span')
      if (items.length < 2) continue
      const local: string[] = []
      items.forEach(el => {
        // Éviter les nodes wrappers (qui répètent tout le texte)
        if (el.querySelector('li,a,span')) return
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t && t.length <= 80 && !/^[/>›»|,]$/.test(t)) local.push(t)
      })
      for (const t of local) push(t)
      if (segments.length >= 2) break
    }
  } catch { /* ignore */ }
  return segments
}

/**
 * Extrait un prix depuis le HTML (schema.org Product/Offer) puis depuis le markdown.
 * Retourne le premier prix plausible trouvé, ou null.
 *
 * Stratégie :
 *  1. JSON-LD : Product.offers.price / AggregateOffer.lowPrice
 *  2. Markdown : "XXX,XX €", "€XXX.XX" ou "XXX EUR" proches de mots-clés TTC/HT
 */
export function extractProductPrice(
  html: string | null,
  markdown: string | null,
): ProductPrice | null {
  const CURRENCY_MAP: Record<string, string> = {
    '€': 'EUR', 'eur': 'EUR',
    '$': 'USD', 'usd': 'USD',
    '£': 'GBP', 'gbp': 'GBP',
    'tnd': 'TND',
  }

  const normalize = (raw: string): number | null => {
    const cleaned = raw.replace(/\s+/g, '').replace(/\u00A0/g, '')
    const m = cleaned.match(/^([0-9]+)([.,]([0-9]{1,3}))?$/)
    if (m) {
      const intPart = m[1]
      const frac = m[3] ?? ''
      return parseFloat(`${intPart}.${frac || '0'}`)
    }
    const numeric = parseFloat(cleaned.replace(',', '.'))
    return Number.isFinite(numeric) ? numeric : null
  }

  // ── 1) JSON-LD ────────────────────────────────────────────────────────
  if (html) {
    const ldMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    for (const m of ldMatches) {
      try {
        const parsed = JSON.parse(m[1].trim())
        const candidates = Array.isArray(parsed) ? parsed : [parsed]
        for (const node of candidates) {
          const offers = node?.offers
          const offerList = Array.isArray(offers) ? offers : offers ? [offers] : []
          for (const offer of offerList) {
            const raw = offer?.price ?? offer?.lowPrice ?? offer?.highPrice
            if (raw == null) continue
            const amount = typeof raw === 'number' ? raw : normalize(String(raw))
            if (amount == null || amount <= 0 || amount > 1_000_000) continue
            const cur = String(offer?.priceCurrency ?? 'EUR').toUpperCase()
            return { amount, currency: cur, source: 'schema.org' }
          }
        }
      } catch { /* continue */ }
    }
  }

  // ── 2) Markdown ──────────────────────────────────────────────────────
  if (markdown) {
    // Chercher motifs "123,45 €" ou "€123.45" dans les 40k premiers chars (zones de prix en début de page)
    const scope = markdown.slice(0, 40000)
    const re = /(?<![\w.-])(\d{1,4}(?:[ \u00A0.,]\d{2,3}){0,3}(?:[.,]\d{1,2})?)\s*(€|eur|\$|usd|£|gbp|tnd)\b/gi
    const hits: Array<{ amount: number; currency: string; ttcScore: number; htScore: number; idx: number }> = []
    for (const match of scope.matchAll(re)) {
      const amount = normalize(match[1])
      if (amount == null || amount < 1 || amount > 100_000) continue
      const curRaw = match[2].toLowerCase()
      const currency = CURRENCY_MAP[curRaw] ?? 'EUR'
      const ctx = scope.slice(Math.max(0, match.index! - 40), match.index! + match[0].length + 40).toLowerCase()
      const ttcScore = /ttc|tva\s*incl|incl\.\s*vat/i.test(ctx) ? 2 : 0
      const htScore = /\bht\b|hors\s*taxe|excl\.\s*vat/i.test(ctx) ? 1 : 0
      hits.push({ amount, currency, ttcScore, htScore, idx: match.index! })
    }
    if (hits.length > 0) {
      // Préférer TTC, sinon premier match
      hits.sort((a, b) => b.ttcScore - a.ttcScore || a.idx - b.idx)
      const best = hits[0]
      const priceType: ProductPrice['priceType'] = best.ttcScore > 0 ? 'TTC' : best.htScore > 0 ? 'HT' : 'unit'
      return { amount: best.amount, currency: best.currency, priceType, source: 'markdown' }
    }
  }

  return null
}
