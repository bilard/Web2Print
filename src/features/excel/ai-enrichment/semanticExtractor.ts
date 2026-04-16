/**
 * Extracteur sémantique typé : classifie les blocs HTML par TYPE (titre, specs,
 * images, prix, …) en se basant sur la FORME DOM (JSON-LD, OG meta, `<table>`,
 * `<dl>`, itemprop, classes génériques) et non sur le contenu. Zéro logique
 * par fournisseur, zéro LLM pour classifier.
 *
 * Passes (ordre de priorité décroissante) :
 *   1. JSON-LD Product schema       → confidence 0.95
 *   2. OpenGraph / meta tags        → confidence 0.85
 *   3. Signaux structurels DOM      → confidence 0.75
 *   4. Heuristique / regex          → confidence 0.55
 *
 * Un champ peut recevoir des contributions de plusieurs passes ; on garde la
 * plus haute confidence. Un champ < 0.5 est rapporté comme null explicite
 * (fail-loud : on ne hallucine rien).
 */

export interface SemanticField<T> {
  value: T | null
  confidence: number
  source: string
}

export interface SemanticSpec {
  name: string
  value: string
  group?: string
  source: string
}

export interface SemanticImage {
  url: string
  alt?: string
  priority: number
}

export interface SemanticDocument {
  label: string
  url: string
}

export interface SemanticMarketing {
  heading: string | null
  paragraphs: string[]
}

export interface SemanticPrice {
  amount: number
  currency: string
}

export interface SemanticVariant {
  sku: string
  properties: Record<string, string>
}

export interface SemanticResult {
  title: SemanticField<string>
  description: SemanticField<string>
  marketing: SemanticMarketing[]
  specs: SemanticSpec[]
  images: SemanticImage[]
  documents: SemanticDocument[]
  price: SemanticField<SemanticPrice>
  variants: SemanticVariant[]
  confidence: Record<string, number>
  diagnostics: string[]
}

// ─── Junk detection (partagé par tous les extracteurs) ──────────────────────
// Un élément est "junk" si l'un de ses ancêtres est nav/header/footer/aside,
// ou si une classe/id contient un mot-clé de consentement, menu, modale, etc.
// Aucun sélecteur spécifique à un fournisseur.

// Classes/ids qui disqualifient l'élément et ses descendants.
// Matching par TOKEN (classList) — pas par substring — pour éviter les
// faux-positifs comme Drupal `dialog-off-canvas-main-canvas` qui wrappe la
// page entière sans être un vrai modal.
const JUNK_EXACT_TOKENS = new Set([
  'nav', 'navigation', 'menu', 'header', 'footer', 'sidebar', 'breadcrumb',
  'breadcrumbs', 'newsletter', 'cart', 'panier', 'login', 'account',
  'cookie', 'consent', 'gdpr', 'rgpd',
])
// Fragments qui, s'ils apparaissent comme segment d'un token, marquent junk.
// Restreints aux patterns sans ambiguïté connue.
const JUNK_SUBSTR_RE =
  /(^|-)(cookie|cookies|consent|gdpr|rgpd|megamenu|mega-menu|mega-nav|submenu|sub-menu|skip-nav|utility-nav|search-overlay|jw-player|kaltura|wistia|newsletter|mini-cart|mega-footer|social-share|social-media)($|-)/i

const JUNK_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'dialog', 'alertdialog'])

function hasJunkClass(el: Element): boolean {
  const classList = (el as HTMLElement).classList
  if (classList && classList.length > 0) {
    for (let i = 0; i < classList.length; i++) {
      const tok = classList[i].toLowerCase()
      if (JUNK_EXACT_TOKENS.has(tok)) return true
      if (JUNK_SUBSTR_RE.test(tok)) return true
    }
  }
  const id = (el.id || '').toLowerCase()
  if (id && (JUNK_EXACT_TOKENS.has(id) || JUNK_SUBSTR_RE.test(id))) return true
  return false
}

function isJunk(el: Element | null): boolean {
  let cur: Element | null = el
  let depth = 0
  while (cur && cur.tagName !== 'BODY' && depth < 20) {
    const tag = cur.tagName
    if (tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'ASIDE') return true
    if (tag === 'DIALOG' || tag === 'TEMPLATE') return true
    const role = cur.getAttribute('role')
    if (role && JUNK_ROLES.has(role)) return true
    if (hasJunkClass(cur)) return true
    cur = cur.parentElement
    depth++
  }
  return false
}

function cleanText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

function resolveUrl(href: string, base: string): string | null {
  if (!href) return null
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

// ─── Pass 1 : JSON-LD Product schema ────────────────────────────────────────

interface JsonLdData {
  title?: string
  description?: string
  specs: SemanticSpec[]
  images: string[]
  documents: SemanticDocument[]
  price: SemanticPrice | null
  variants: SemanticVariant[]
}

function extractJsonLd(doc: Document): JsonLdData {
  const out: JsonLdData = {
    specs: [],
    images: [],
    documents: [],
    price: null,
    variants: [],
  }
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  for (const script of Array.from(scripts)) {
    let data: unknown
    try {
      data = JSON.parse(script.textContent || '')
    } catch {
      continue
    }
    const items = flattenJsonLd(data)
    for (const item of items) {
      if (!isProduct(item)) continue
      if (typeof item.name === 'string' && !out.title) out.title = cleanText(item.name)
      if (typeof item.description === 'string' && !out.description) {
        out.description = cleanText(item.description)
      }
      if (Array.isArray(item.additionalProperty)) {
        for (const prop of item.additionalProperty) {
          if (!prop || typeof prop !== 'object') continue
          const p = prop as Record<string, unknown>
          const name = typeof p.name === 'string' ? cleanText(p.name) : ''
          const value = p.value != null ? String(p.value) : ''
          if (name && value) {
            const unit = typeof p.unitText === 'string' ? ` ${p.unitText}` : ''
            out.specs.push({ name, value: cleanText(value + unit), source: 'json-ld' })
          }
        }
      }
      for (const dim of ['weight', 'width', 'height', 'depth'] as const) {
        const val = (item as Record<string, unknown>)[dim]
        if (val && typeof val === 'object') {
          const v = val as Record<string, unknown>
          if (v.value != null) {
            const unit = typeof v.unitText === 'string' ? ` ${v.unitText}` : ''
            out.specs.push({ name: dim, value: cleanText(String(v.value) + unit), source: 'json-ld' })
          }
        }
      }
      const imageField = (item as Record<string, unknown>).image
      if (typeof imageField === 'string') out.images.push(imageField)
      else if (Array.isArray(imageField)) {
        for (const img of imageField) {
          if (typeof img === 'string') out.images.push(img)
          else if (img && typeof img === 'object' && 'url' in img && typeof (img as Record<string, unknown>).url === 'string') {
            out.images.push((img as Record<string, string>).url)
          }
        }
      }
      const offers = (item as Record<string, unknown>).offers
      const offersList = Array.isArray(offers) ? offers : offers ? [offers] : []
      for (const offer of offersList) {
        if (!offer || typeof offer !== 'object') continue
        const o = offer as Record<string, unknown>
        const rawPrice = o.price ?? o.lowPrice
        const currency = typeof o.priceCurrency === 'string' ? o.priceCurrency : 'EUR'
        const num = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice ?? '').replace(',', '.'))
        if (isFinite(num) && num > 0 && !out.price) {
          out.price = { amount: num, currency }
        }
      }
      const variants = (item as Record<string, unknown>).hasVariant
      if (Array.isArray(variants)) {
        for (const v of variants) {
          if (!v || typeof v !== 'object') continue
          const variant = v as Record<string, unknown>
          const sku = typeof variant.sku === 'string' ? variant.sku : typeof variant.mpn === 'string' ? variant.mpn : ''
          if (!sku) continue
          const props: Record<string, string> = {}
          if (Array.isArray(variant.additionalProperty)) {
            for (const prop of variant.additionalProperty) {
              if (!prop || typeof prop !== 'object') continue
              const p = prop as Record<string, unknown>
              if (typeof p.name === 'string' && p.value != null) props[p.name] = String(p.value)
            }
          }
          out.variants.push({ sku, properties: props })
        }
      }
    }
  }
  return out
}

function flattenJsonLd(data: unknown): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = []
  const stack = [data]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur) continue
    if (Array.isArray(cur)) {
      stack.push(...cur)
      continue
    }
    if (typeof cur !== 'object') continue
    const obj = cur as Record<string, unknown>
    items.push(obj)
    if (obj['@graph']) stack.push(obj['@graph'])
  }
  return items
}

function isProduct(obj: Record<string, unknown>): boolean {
  const type = obj['@type']
  if (typeof type === 'string') return /product/i.test(type)
  if (Array.isArray(type)) return type.some((t) => typeof t === 'string' && /product/i.test(t))
  return false
}

// ─── Pass 2 : meta tags (OpenGraph, Twitter, itemprop) ──────────────────────

function getMeta(doc: Document, selector: string): string | null {
  const el = doc.querySelector(selector)
  if (!el) return null
  const content = el.getAttribute('content') || el.getAttribute('value') || el.textContent
  return content ? cleanText(content) : null
}

// ─── Pass 3 : title ─────────────────────────────────────────────────────────

function extractTitle(doc: Document, jsonLd: JsonLdData): SemanticField<string> {
  if (jsonLd.title) return { value: jsonLd.title, confidence: 0.95, source: 'json-ld' }
  const og = getMeta(doc, 'meta[property="og:title"], meta[name="og:title"]')
  if (og && og.length > 2 && og.length < 200) return { value: og, confidence: 0.85, source: 'og:title' }
  // H1 le plus proéminent hors zones junk. On évalue par longueur texte (entre 5 et 200).
  const h1s = Array.from(doc.querySelectorAll('h1'))
    .filter((h) => !isJunk(h))
    .map((h) => cleanText(h.textContent))
    .filter((t) => t.length >= 5 && t.length <= 200)
  if (h1s.length > 0) {
    const best = h1s.sort((a, b) => b.length - a.length)[0]
    return { value: best, confidence: 0.75, source: 'h1' }
  }
  const docTitle = cleanText(doc.querySelector('title')?.textContent || '')
  if (docTitle.length > 2) {
    // Strip suffix après pipe ou tiret (convention "Produit | Marque")
    const cleaned = docTitle.split(/\s[-|•—]\s/)[0].trim()
    return { value: cleaned || docTitle, confidence: 0.55, source: 'title-tag' }
  }
  return { value: null, confidence: 0, source: 'none' }
}

// ─── Pass 4 : description ───────────────────────────────────────────────────

function extractDescription(doc: Document, jsonLd: JsonLdData): SemanticField<string> {
  if (jsonLd.description && jsonLd.description.length > 30) {
    return { value: jsonLd.description, confidence: 0.95, source: 'json-ld' }
  }
  const og = getMeta(doc, 'meta[property="og:description"], meta[name="og:description"]')
  if (og && og.length > 30) return { value: og, confidence: 0.85, source: 'og:description' }
  const meta = getMeta(doc, 'meta[name="description"]')
  if (meta && meta.length > 30) return { value: meta, confidence: 0.8, source: 'meta-description' }
  const twitter = getMeta(doc, 'meta[name="twitter:description"]')
  if (twitter && twitter.length > 30) return { value: twitter, confidence: 0.75, source: 'twitter:description' }
  // Conteneur explicitement nommé description / intro / lead / summary.
  const descSel =
    '[class*="description" i] p, [class*="description" i] li, ' +
    '[class*="intro" i] p, [class*="lead" i], [class*="summary" i] p, ' +
    '[itemprop="description"]'
  const descEls = Array.from(doc.querySelectorAll(descSel))
  for (const el of descEls) {
    if (isJunk(el)) continue
    const t = cleanText(el.textContent)
    if (t.length >= 40 && t.length <= 1200 && !GARBAGE_PROSE_RE.test(t)) {
      return { value: t, confidence: 0.65, source: 'desc-container' }
    }
  }
  // 1er <p> suffisamment long et non junk.
  const ps = Array.from(doc.querySelectorAll('p'))
  for (const p of ps) {
    if (isJunk(p)) continue
    const t = cleanText(p.textContent)
    if (t.length >= 60 && t.length <= 1200 && !GARBAGE_PROSE_RE.test(t)) {
      return { value: t, confidence: 0.55, source: 'first-paragraph' }
    }
  }
  return { value: null, confidence: 0, source: 'none' }
}

const GARBAGE_PROSE_RE =
  /\b(cookies?|consent|privacy|politique|javascript|activez|enable javascript|your browser|this site uses)\b/i

// ─── Pass 5 : specs (tables, dl, grids) ─────────────────────────────────────

const SPEC_UI_LABEL_RE =
  /^(documents?|t[eé]l[eé]chargements?|downloads?|sp[eé]cifications?|specs?|inclus|included|accessoires?|accessories|avis|reviews?|notes?(?:\s*[&et]+\s*avis)?|o[uù]\s*acheter|where\s*to\s*buy|services?|support|garantie|warranty|videos?|vid[eé]os?|galerie|gallery|questions?|faq|contact|le\s+produit\s+contient|what's\s+in\s+the\s+box|choisir\s+le\s+mod[èe]le|select\s+model|donner\s+votre\s+avis|leave\s+review)$/i

/** Valeurs clairement non-techniques (ratings, quantités de packaging
 *  seules). Rejette "4.9/5 from 113 reviews", "(113 AVIS)", etc. */
const NON_SPEC_VALUE_RE =
  /(\bavis\b|\breview(s|ers?)?\b|\bnote\s*\/\s*\d|\d\s*[,.]\s*\d+\s*\/\s*\d+|\bdonner\s+votre\b)/i

/** Clés marketing : contiennent marque/trademark, ou sont des phrases
 *  complètes (>5 mots). Rejette "Perceuse à percussion M18 FUEL™". */
function isMarketingKey(k: string): boolean {
  if (/[™®©]/.test(k)) return true
  if (k.split(/\s+/).length > 5) return true
  return false
}

const PRODUCT_CODE_RE = /^[A-Z][A-Z0-9]{3,}[A-Z0-9]$/
const VARIANT_HEADER_RE = /^(r[eé]f\.?|ref[eé]rence|sku|code(\s*(produit|article|ean))?|gencod|ean|gtin)$/i
const COOKIE_CATEGORY_RE =
  /^(strictement\s+n[eé]cessaire|fonctionnel|statistiques?|marketing|publicit(?:é|aire)|analytique|performance|pr[eé]f[eé]rences?|ciblage|targeting|essential|necessary|functional|analytics|advertising)$/i

function nearestHeading(el: Element): string {
  let cur: Element | null = el
  for (let i = 0; i < 5 && cur; i++) {
    let sib: Element | null = cur.previousElementSibling
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName)) {
        const t = cleanText(sib.textContent)
        if (t && t.length <= 80) return t
      }
      sib = sib.previousElementSibling
    }
    cur = cur.parentElement
  }
  return ''
}

/**
 * Détecte si un élément vit dans un conteneur piloté par un combobox/select
 * avec plusieurs options **SKU-likes** (dropdown de variantes/accessoires avec
 * codes produit). Dans ce cas les specs/docs affichés sont scopés à l'option
 * active (souvent un accessoire par défaut, pas le produit principal) — les
 * ignorer évite d'injecter les specs d'un foret/accessoire dans l'enrichissement
 * d'une perceuse.
 *
 * Seuils combinés pour éviter les faux-positifs (ex: Bosch select de livraison
 * avec 3 options textuelles) :
 *   - au moins 5 options listées, OU
 *   - au moins 3 options avec `data-key` numérique (pattern SKU).
 */
function hasVariantDropdownAncestor(el: Element): boolean {
  // Restreindre la recherche au <section>/<article>/[role="region"] le plus
  // proche, sinon on remonte jusqu'au body et on attrape le dropdown de TOUT le
  // site (tuant l'extraction des variantes situées dans une autre section).
  const scope = el.closest('section, article, [role="region"]')
  if (!scope) return false
  const combobox = scope.querySelector('[role="combobox"],select')
  if (!combobox) return false
  const skuLikeOptions = scope.querySelectorAll('[data-key][data-value]').length
  const ariaOptions = scope.querySelector('[role="listbox"]')?.querySelectorAll('[role="option"]').length ?? 0
  const selectOptions = combobox.tagName === 'SELECT' ? combobox.querySelectorAll('option').length : 0
  return skuLikeOptions >= 3 || ariaOptions >= 5 || selectOptions >= 5
}

/** Valeur concat/garbage : longue séquence numérique sans unité ni espace,
 *  avec plusieurs points décimaux. Signe d'une concat de valeurs multiples
 *  (ex: "3455.566.5781012" = concat des diamètres de 20 forets).
 *  Légitime (rejet = false) : "1,5 kg", "12.5 mm", "0 - 2,100 rpm". */
function isGarbageConcatValue(v: string): boolean {
  if (v.length < 8) return false
  if (!/^[\d.,\s]+$/.test(v)) return false
  const dots = (v.match(/\./g) || []).length
  const commas = (v.match(/,/g) || []).length
  return dots + commas >= 3
}

function isVariantTable(tbl: Element): boolean {
  const rows = tbl.querySelectorAll('tr')
  if (rows.length < 2) return false
  const headerCells = rows[0].querySelectorAll('td, th')
  if (headerCells.length >= 2) {
    const h0 = cleanText(headerCells[0].textContent)
    if (VARIANT_HEADER_RE.test(h0)) return true
  }
  let codeHits = 0
  for (let i = 1; i < Math.min(rows.length, 4); i++) {
    const cells = rows[i].querySelectorAll('td, th')
    if (cells.length < 2) continue
    const k = cleanText(cells[0].textContent).replace(/^(r[eé]f\.?|ref[eé]rence|sku|code)\s*/i, '')
    if (PRODUCT_CODE_RE.test(k)) codeHits++
  }
  return codeHits >= 2
}

function extractSpecs(doc: Document, jsonLd: JsonLdData): SemanticSpec[] {
  const seen = new Set<string>()
  const out: SemanticSpec[] = []
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

  function addSpec(s: SemanticSpec) {
    const k = norm(s.name)
    if (!k || seen.has(k)) return
    if (s.group && COOKIE_CATEGORY_RE.test(cleanText(s.group))) return
    if (SPEC_UI_LABEL_RE.test(s.name)) return
    // Rejet universel : valeur manifestement concat/garbage (chiffres sans
    // unité avec ≥3 séparateurs — typiquement une concat de valeurs multiples
    // rassemblées par un dropdown de variantes/accessoires).
    if (isGarbageConcatValue(s.value)) return
    // Filtres anti-junk appliqués aux paires issues du scan générique (body *).
    // Les sources structurées (json-ld, table, dl, grid) sont déjà fiables.
    if (s.source === 'generic-scan') {
      if (isMarketingKey(s.name)) return
      if (NON_SPEC_VALUE_RE.test(s.value)) return
      if (s.name.length > 50) return
      if (s.value.length > 120) return
    }
    seen.add(k)
    out.push(s)
  }

  for (const s of jsonLd.specs) addSpec(s)

  doc.querySelectorAll('table').forEach((tbl) => {
    if (isJunk(tbl)) return
    if (isVariantTable(tbl)) return
    if (hasVariantDropdownAncestor(tbl)) return
    const rows = tbl.querySelectorAll('tr')
    if (rows.length < 2) return
    const group = cleanText(tbl.querySelector('caption')?.textContent || '') || nearestHeading(tbl) || 'Spécifications'
    const localPairs: SemanticSpec[] = []
    rows.forEach((tr, rowIdx) => {
      const cells = tr.querySelectorAll('td, th')
      if (cells.length < 2) return
      if (rowIdx === 0) {
        const allTh = Array.from(cells).every((c) => c.tagName === 'TH')
        const h0 = cleanText(cells[0].textContent)
        if (allTh || /^(r[eé]f\.?|libell[eé]|nom|description|caract[eé]ristiques?)$/i.test(h0)) return
      }
      const k = cleanText(cells[0].textContent)
      let v = cleanText(cells[1].textContent)
      if (!v && cells[1].querySelector('svg, [class*="check"]')) v = 'Oui'
      if (!k || !v || k === v || k.length > 80 || v.length > 200) return
      if (PRODUCT_CODE_RE.test(k)) return
      localPairs.push({ name: k, value: v, group, source: 'table' })
    })
    // Table de consentement RGPD : group = catégorie cookie → rejet total.
    if (COOKIE_CATEGORY_RE.test(group)) return
    // Table UI onglets : toutes les clés sont des libellés d'onglet → rejet.
    if (localPairs.length >= 2 && localPairs.every((p) => SPEC_UI_LABEL_RE.test(p.name))) return
    localPairs.forEach(addSpec)
  })

  doc.querySelectorAll('dl').forEach((dl) => {
    if (isJunk(dl)) return
    if (hasVariantDropdownAncestor(dl)) return
    const dts = dl.querySelectorAll('dt')
    const dds = dl.querySelectorAll('dd')
    if (dts.length < 2 || dts.length !== dds.length) return
    const group = nearestHeading(dl) || 'Spécifications'
    for (let i = 0; i < dts.length; i++) {
      const k = cleanText(dts[i].textContent)
      const v = cleanText(dds[i].textContent)
      if (!k || !v || k.length > 80 || v.length > 200) continue
      addSpec({ name: k, value: v, group, source: 'dl' })
    }
  })

  // Conteneurs explicitement nommés specs/tech/caracteristic.
  const prioritySel =
    '[class*="techspec" i], [class*="tech-spec" i], [class*="specification" i], [class*="product-spec" i], ' +
    '[class*="caracteris" i], [class*="features-list" i], [class*="attributes" i], ' +
    '[id*="specification" i], [id*="techspec" i], [id*="caracteris" i], [class*="datasheet" i]'
  let priorityHit = false
  doc.querySelectorAll(prioritySel).forEach((el) => {
    if (isJunk(el)) return
    if (hasVariantDropdownAncestor(el)) return
    const pairs = extractGridPairs(el)
    if (pairs.length === 0) return
    priorityHit = true
    pairs.forEach((p) =>
      addSpec({ name: p[0], value: p[1], group: nearestHeading(el) || 'Caractéristiques', source: 'grid' }),
    )
  })

  // Fallback générique : scan de tout le body à la recherche de conteneurs
  // dont ≥50% des enfants sont des paires label/value. Actif uniquement si
  // aucun conteneur prioritaire n'a livré de specs ET si on n'a pas déjà
  // assez de signal (tables + dl + JSON-LD). Évite de polluer quand le
  // signal est déjà fort.
  if (!priorityHit && out.length < 5) {
    const SKIP_TAGS = new Set([
      'TABLE', 'DL', 'TR', 'THEAD', 'TBODY', 'TFOOT', 'SCRIPT', 'STYLE',
      'NOSCRIPT', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'DIALOG', 'TEMPLATE',
      'FORM', 'BUTTON', 'SELECT', 'OPTION', 'OPTGROUP', 'IFRAME', 'SVG',
    ])
    doc.querySelectorAll('body *').forEach((el) => {
      if (SKIP_TAGS.has(el.tagName)) return
      if (isJunk(el)) return
      if (hasVariantDropdownAncestor(el)) return
      const kids = Array.from(el.children)
      if (kids.length < 3 || kids.length > 80) return
      const localPairs: Array<[string, string]> = []
      for (const row of kids) {
        const p = pairFromRow(row)
        if (p) localPairs.push(p)
      }
      if (localPairs.length < 3) return
      if (localPairs.length / kids.length < 0.5) return
      const group = nearestHeading(el) || 'Spécifications'
      for (const p of localPairs) {
        addSpec({ name: p[0], value: p[1], group, source: 'generic-scan' })
      }
    })
  }

  return out
}

function extractGridPairs(container: Element): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  const kids = Array.from(container.children)
  if (kids.length < 2 || kids.length > 80) return pairs
  for (const row of kids) {
    const p = pairFromRow(row)
    if (p) pairs.push(p)
  }
  // Ratio : au moins 50% des enfants doivent être des paires valides.
  if (pairs.length >= 2 && pairs.length / kids.length >= 0.5) return pairs
  return []
}

function pairFromRow(row: Element): [string, string] | null {
  const hasContent = (e: Element) =>
    cleanText(e.textContent).length > 0 || !!e.querySelector('svg, [class*="check" i], [class*="tick" i]')
  let cur: Element = row
  for (let u = 0; u < 6; u++) {
    const ch = Array.from(cur.children).filter(hasContent)
    if (ch.length >= 2) break
    if (ch.length === 1) {
      cur = ch[0]
      continue
    }
    break
  }
  const subs = Array.from(cur.children).filter(hasContent)
  if (subs.length >= 2) {
    const k = cleanText(subs[0].textContent)
    let v = cleanText(subs[1].textContent)
    if (!v && subs[1].querySelector('svg, [class*="check"]')) v = 'Oui'
    if (k && v && k !== v && k.length <= 80 && v.length <= 200) return [k, v]
  }
  const flat = cleanText(row.textContent)
  const m = flat.match(/^([^:：]{2,60})\s*[:：]\s*(.{1,200})$/)
  if (m) return [m[1].trim(), m[2].trim()]
  return null
}

// ─── Pass 6 : images ────────────────────────────────────────────────────────

const LOGO_URL_RE =
  /[-_](logo|picto|pictogram|icon|avatar|favicon|sprite|spacer|pixel|tracking|beacon|badge|flag|usp|feature|benefit|campaign|promo|banner|overlay|award|seal|trust)(?:[-_.\d]|$)/i

function extractImages(doc: Document, url: string, jsonLd: JsonLdData): SemanticImage[] {
  const seen = new Set<string>()
  const out: SemanticImage[] = []

  function add(img: { url: string; alt?: string; priority: number }) {
    const abs = resolveUrl(img.url, url)
    if (!abs) return
    if (seen.has(abs)) return
    const fn = abs.split('/').pop() || ''
    if (LOGO_URL_RE.test(fn)) return
    if (!/^https?:/i.test(abs)) return
    seen.add(abs)
    out.push({ url: abs, alt: img.alt, priority: img.priority })
  }

  // JSON-LD Product.image : priorité haute
  for (const i of jsonLd.images) add({ url: i, priority: 100 })

  // OG:image
  const og = getMeta(doc, 'meta[property="og:image"], meta[name="og:image"]')
  if (og) add({ url: og, priority: 90 })

  // itemprop="image"
  doc.querySelectorAll('[itemprop="image"]').forEach((el) => {
    if (isJunk(el)) return
    const src = el.getAttribute('content') || el.getAttribute('src') || el.getAttribute('href')
    if (src) add({ url: src, priority: 85 })
  })

  // Galeries : conteneurs class ~ gallery|product-image|hero|main-image|media|carousel
  const GALLERY_SEL =
    '[class*="gallery" i] img, [class*="product-image" i] img, [class*="hero" i] img, ' +
    '[class*="main-image" i] img, [class*="media" i] img, [class*="carousel" i] img, ' +
    '[class*="slider" i] img, [class*="pdp" i] img, [id*="gallery" i] img, figure img'
  doc.querySelectorAll(GALLERY_SEL).forEach((img) => {
    if (isJunk(img)) return
    const src = pickImgSrc(img as HTMLImageElement)
    if (!src) return
    add({ url: src, alt: (img as HTMLImageElement).alt || undefined, priority: 70 })
  })

  // Reste des <img> (filtré : taille raisonnable, pas caché, pas logo)
  doc.querySelectorAll('img').forEach((img) => {
    if (isJunk(img)) return
    const src = pickImgSrc(img as HTMLImageElement)
    if (!src) return
    const w = parseInt(img.getAttribute('width') || '0', 10)
    const h = parseInt(img.getAttribute('height') || '0', 10)
    if (w > 0 && h > 0 && (w < 100 || h < 100)) return
    add({ url: src, alt: (img as HTMLImageElement).alt || undefined, priority: 40 })
  })

  out.sort((a, b) => b.priority - a.priority)
  return out
}

function pickImgSrc(img: HTMLImageElement): string | null {
  const ds = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original')
  const src = ds || img.getAttribute('src')
  if (src && !src.startsWith('data:')) return src
  const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset')
  if (srcset) {
    const first = srcset.split(',')[0].trim().split(/\s+/)[0]
    if (first && !first.startsWith('data:')) return first
  }
  return null
}

// ─── Pass 7 : documents PDF ─────────────────────────────────────────────────

const GENERIC_DOC_LABEL_RE =
  /^(pdf|download|t[eé]l[eé]charger|voir|view|open|ouvrir|link|file|document|here|ici|more)\.?$/i

function extractDocuments(doc: Document, url: string): SemanticDocument[] {
  const seen = new Set<string>()
  const out: SemanticDocument[] = []
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || ''
    if (!/\.(pdf|docx?|xlsx?)(\?|#|$)/i.test(href)) return
    if (isJunk(a)) return
    const abs = resolveUrl(href, url)
    if (!abs || seen.has(abs)) return
    seen.add(abs)
    let label = cleanText(a.textContent) || cleanText(a.getAttribute('aria-label') || '') || cleanText(a.getAttribute('title') || '')
    if (!label || GENERIC_DOC_LABEL_RE.test(label)) {
      // Chercher un heading ancêtre ou voisin
      const heading = findAncestorHeading(a) || filenameToLabel(abs)
      label = heading || filenameToLabel(abs)
    }
    if (!label || label.length > 150) label = filenameToLabel(abs)
    out.push({ label, url: abs })
  })
  return out
}

function findAncestorHeading(el: Element): string {
  let cur: Element | null = el.parentElement
  for (let i = 0; i < 6 && cur; i++) {
    const h = cur.querySelector('h1, h2, h3, h4, h5, h6, [class*="title" i], [class*="heading" i]')
    if (h) {
      const t = cleanText(h.textContent)
      if (t && t.length >= 3 && t.length <= 100) return t
    }
    cur = cur.parentElement
  }
  return ''
}

function filenameToLabel(url: string): string {
  try {
    const p = new URL(url).pathname.split('/').pop() || ''
    return p.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'Document'
  } catch {
    return 'Document'
  }
}

// ─── Pass 8 : prix ──────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  CHF: 'CHF',
}

function extractPrice(doc: Document, jsonLd: JsonLdData): SemanticField<SemanticPrice> {
  if (jsonLd.price) return { value: jsonLd.price, confidence: 0.95, source: 'json-ld' }
  // meta itemprop="price"
  const metaPrice = doc.querySelector('[itemprop="price"]')
  if (metaPrice && !isJunk(metaPrice)) {
    const raw = metaPrice.getAttribute('content') || metaPrice.textContent || ''
    const num = parseFloat(raw.replace(',', '.'))
    if (isFinite(num) && num > 0) {
      const cur = doc.querySelector('[itemprop="priceCurrency"]')?.getAttribute('content') || 'EUR'
      return { value: { amount: num, currency: cur }, confidence: 0.85, source: 'itemprop' }
    }
  }
  // Regex : nombre + symbole devise dans un élément avec class containing price/prix.
  const priceEls = doc.querySelectorAll('[class*="price" i], [class*="prix" i], [id*="price" i]')
  for (const el of Array.from(priceEls)) {
    if (isJunk(el)) continue
    const txt = cleanText(el.textContent)
    const m = txt.match(/([€$£]|EUR|USD|GBP|CHF)\s?(\d{1,6}(?:[.,]\d{2})?)|\b(\d{1,6}(?:[.,]\d{2})?)\s?([€$£]|EUR|USD|GBP|CHF)\b/)
    if (!m) continue
    const amountStr = m[2] || m[3]
    const symStr = m[1] || m[4]
    const num = parseFloat(amountStr.replace(',', '.'))
    if (!isFinite(num) || num <= 0) continue
    const currency = CURRENCY_SYMBOLS[symStr] || symStr
    return { value: { amount: num, currency }, confidence: 0.65, source: 'regex' }
  }
  return { value: null, confidence: 0, source: 'none' }
}

// ─── Pass 9 : variantes ─────────────────────────────────────────────────────

const SKU_RE = /\b[A-Z][A-Z0-9]{3,}[A-Z0-9]\b/

function extractVariants(doc: Document, jsonLd: JsonLdData): SemanticVariant[] {
  if (jsonLd.variants.length > 0) return jsonLd.variants
  const out: SemanticVariant[] = []
  const seen = new Set<string>()

  // <table> avec header "Réf." ou codes produit
  doc.querySelectorAll('table').forEach((tbl) => {
    if (isJunk(tbl)) return
    if (!isVariantTable(tbl)) return
    const rows = Array.from(tbl.querySelectorAll('tr'))
    if (rows.length < 2) return
    const headerCells = Array.from(rows[0].querySelectorAll('td, th')).map((c) => cleanText(c.textContent))
    for (let i = 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll('td, th')).map((c) => cleanText(c.textContent))
      if (cells.length < 2) continue
      const sku = (cells[0].match(SKU_RE) || [])[0]
      if (!sku || seen.has(sku)) continue
      seen.add(sku)
      const props: Record<string, string> = {}
      for (let j = 1; j < cells.length && j < headerCells.length; j++) {
        if (headerCells[j] && cells[j]) props[headerCells[j]] = cells[j]
      }
      out.push({ sku, properties: props })
    }
  })

  return out
}

// ─── Pass 10 : marketing ────────────────────────────────────────────────────

function extractMarketing(doc: Document): SemanticMarketing[] {
  const out: SemanticMarketing[] = []
  const headings = doc.querySelectorAll('h2, h3')
  for (const h of Array.from(headings)) {
    if (isJunk(h)) continue
    const heading = cleanText(h.textContent)
    if (!heading || heading.length < 3 || heading.length > 120) continue
    if (SPEC_UI_LABEL_RE.test(heading)) continue
    if (COOKIE_CATEGORY_RE.test(heading)) continue
    // Collecter les <p> jusqu'au prochain heading de même niveau ou supérieur.
    const paragraphs: string[] = []
    let sib: Element | null = h.nextElementSibling
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName)) {
        const lvl = parseInt(sib.tagName.slice(1), 10)
        const curLvl = parseInt(h.tagName.slice(1), 10)
        if (lvl <= curLvl) break
      }
      const ps = sib.tagName === 'P' ? [sib] : Array.from(sib.querySelectorAll('p'))
      for (const p of ps) {
        if (isJunk(p)) continue
        const t = cleanText(p.textContent)
        if (t.length >= 40 && t.length <= 800 && !GARBAGE_PROSE_RE.test(t)) paragraphs.push(t)
      }
      sib = sib.nextElementSibling
    }
    if (paragraphs.length > 0) out.push({ heading, paragraphs })
  }
  return out
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function extractSemantic(html: string, url: string): SemanticResult {
  const diagnostics: string[] = []
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const jsonLd = extractJsonLd(doc)
  if (jsonLd.title) diagnostics.push(`json-ld: title found`)
  if (jsonLd.specs.length > 0) diagnostics.push(`json-ld: ${jsonLd.specs.length} specs`)
  if (jsonLd.images.length > 0) diagnostics.push(`json-ld: ${jsonLd.images.length} images`)

  const title = extractTitle(doc, jsonLd)
  const description = extractDescription(doc, jsonLd)
  const specs = extractSpecs(doc, jsonLd)
  const images = extractImages(doc, url, jsonLd)
  const documents = extractDocuments(doc, url)
  const price = extractPrice(doc, jsonLd)
  const variants = extractVariants(doc, jsonLd)
  const marketing = extractMarketing(doc)

  const confidence: Record<string, number> = {
    title: title.confidence,
    description: description.confidence,
    specs: specs.length >= 5 ? 0.9 : specs.length >= 2 ? 0.65 : specs.length > 0 ? 0.4 : 0,
    images: images.length >= 3 ? 0.9 : images.length >= 1 ? 0.7 : 0,
    documents: documents.length >= 1 ? 0.8 : 0,
    price: price.confidence,
    variants: variants.length >= 1 ? 0.8 : 0,
    marketing: marketing.length >= 1 ? 0.7 : 0,
  }

  return {
    title,
    description,
    marketing,
    specs,
    images,
    documents,
    price,
    variants,
    confidence,
    diagnostics,
  }
}
