/** Related-URL discovery utilities (pure, testable). */

const TAB_QUERY_KEYS = ['tab', 'section', 'view', 'pane', 'content']

function detectTabKeyFromUrl(baseUrl: URL): string | null {
  for (const [k] of baseUrl.searchParams) {
    if (TAB_QUERY_KEYS.includes(k.toLowerCase())) return k
  }
  return null
}

const TAB_ID_ATTRS = ['aria-controls', 'data-tab-id', 'data-tab', 'data-view', 'data-pane', 'data-section', 'data-qa']
const TAB_ID_STRIP = /^(cmp-tab-|tab-|nav-item-|panel-)/i

function extractTabId(el: Element): string | null {
  for (const attr of TAB_ID_ATTRS) {
    const raw = el.getAttribute(attr)
    if (!raw) continue
    const cleaned = raw.replace(TAB_ID_STRIP, '').trim()
    if (cleaned && cleaned.length > 0 && cleaned.length < 80) return cleaned
  }
  const id = el.id
  if (id && id.length < 80 && /tab|panel/i.test(id)) {
    return id.replace(TAB_ID_STRIP, '')
  }
  return null
}

export interface RelatedUrls {
  tabs: string[]
  pdfs: string[]
  subpages: string[]
}

const NAV_ANCESTOR_SELECTORS = [
  'header', 'footer',
  'nav[role="navigation"]',
  '[class*="breadcrumb" i]',
  '[class*="sidebar" i]',
  '[class*="mega-menu" i]',
  '[class*="site-nav" i]',
]

function isInsideNav(el: Element): boolean {
  let cur: Element | null = el
  while (cur) {
    for (const sel of NAV_ANCESTOR_SELECTORS) {
      if (cur.matches?.(sel)) return true
    }
    cur = cur.parentElement
  }
  return false
}

const GENERIC_LINK_TEXT = /^(pdf|download|t[ée]l[ée]charger|voir|view|open|ouvrir|link|file|document|more|plus)\.?$/i

function isGoodLabel(s: string): boolean {
  if (!s) return false
  if (s.length < 5 || s.length > 200) return false
  if (GENERIC_LINK_TEXT.test(s)) return false
  if (/^https?:\/\//i.test(s)) return false
  return true
}

function siblingLabel(a: Element): string | null {
  // Cherche un label dans un conteneur "ligne" (tr, li, row, grid-item) en
  // retirant le contenu de tous les liens/boutons/images pour isoler le texte.
  let cur: Element | null = a.parentElement
  for (let i = 0; i < 5 && cur; i++) {
    const tag = cur.tagName
    if (tag === 'BODY' || tag === 'HTML' || tag === 'MAIN' || tag === 'SECTION' || tag === 'ARTICLE') break
    const clone = cur.cloneNode(true) as Element
    clone.querySelectorAll('a, button, img, svg, script, style, noscript').forEach((e) => e.remove())
    const txt = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (isGoodLabel(txt)) return txt
    cur = cur.parentElement
  }
  return null
}

function extractAnchorName(a: Element, resolved: URL): string {
  // 1) Texte visible direct de l'anchor — ignorer si générique ("PDF", "Télécharger"…)
  const txt = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (isGoodLabel(txt)) return txt

  // 2) aria-label puis title (meta accessibles)
  const aria = a.getAttribute('aria-label')?.trim() ?? ''
  if (isGoodLabel(aria)) return aria
  const title = a.getAttribute('title')?.trim() ?? ''
  if (isGoodLabel(title)) return title

  // 3) Remonter dans les ancêtres pour trouver le label "ligne" (tr, li, row, card)
  const sib = siblingLabel(a)
  if (sib) return sib

  // 4) Derniers recours : texte court direct (ex: "PDF") puis filename
  if (txt && txt.length >= 2 && txt.length <= 120 && !/^https?:\/\//i.test(txt)) return txt
  const filename = resolved.pathname.split('/').pop() ?? ''
  return decodeURIComponent(filename.replace(/\.pdf$/i, '')).replace(/[_-]+/g, ' ').trim() || 'Document PDF'
}

function pdfEntry(url: string, name: string): string {
  const cleanName = name.replace(/\s+/g, ' ').trim()
  return cleanName ? `${cleanName}##${url}` : url
}

export function discoverRelatedUrls(html: string, baseUrl: URL): RelatedUrls {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const baseKey = normalizeUrl(baseUrl.toString())
  const baseHost = baseUrl.hostname.toLowerCase()
  const basePath = baseUrl.pathname

  const tabs = new Set<string>()
  // Map : url normalisée → entry "nom##url" (pour dédupliquer par URL, pas par nom)
  const pdfMap = new Map<string, string>()
  const subpages = new Set<string>()

  const anchors = doc.querySelectorAll('a[href]')
  for (const a of Array.from(anchors)) {
    const href = a.getAttribute('href') ?? ''
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue
    if (href === '#' || href.startsWith('?lang=') || href.startsWith('?currency=')) continue

    let resolved: URL
    try { resolved = new URL(href, baseUrl) } catch { continue }
    if (resolved.hostname.toLowerCase() !== baseHost) {
      // PDFs externes sur CDN documentaire
      if (/\.pdf($|\?)/i.test(resolved.pathname + resolved.search)) {
        const n = normalizeUrl(resolved.toString())
        if (n && !pdfMap.has(n)) pdfMap.set(n, pdfEntry(n, extractAnchorName(a, resolved)))
      }
      continue
    }

    if (isInsideNav(a)) continue

    const normalized = normalizeUrl(resolved.toString())
    if (!normalized || normalized === baseKey) continue

    // PDFs
    if (/\.pdf($|\?)/i.test(resolved.pathname + resolved.search)) {
      if (!pdfMap.has(normalized)) pdfMap.set(normalized, pdfEntry(normalized, extractAnchorName(a, resolved)))
      continue
    }

    // Tabs : même pathname, query ou hash différent
    if (resolved.pathname === basePath && (resolved.search || resolved.hash)) {
      tabs.add(normalized)
      continue
    }

    // Subpages : même dossier racine, profondeur ≤ +1
    const baseSegs = basePath.split('/').filter(Boolean)
    const curSegs = resolved.pathname.split('/').filter(Boolean)
    if (baseSegs.length > 0 && curSegs.length <= baseSegs.length + 1) {
      const sharedPrefix = baseSegs.slice(0, baseSegs.length - 1).join('/')
      if (sharedPrefix && resolved.pathname.startsWith('/' + sharedPrefix + '/')) {
        subpages.add(normalized)
      }
    }
  }

  // ── ARIA role="tab" synthesis (for SPAs where tabs are buttons, not anchors) ──
  // Collect button-like tab elements (excludes anchors so we don't double-count the link case)
  const tabElements = Array.from(doc.querySelectorAll(
    'button[role="tab"], [role="tab"]:not(a), [data-qa^="cmp-tab-"], button[data-tab], button[data-tab-id]'
  )).filter(el => !isInsideNav(el))
  if (tabElements.length > 0) {
    // Tab key: prefer an existing query key from the URL (tab, section, view…), otherwise default to 'tab'
    const tabKey = detectTabKeyFromUrl(baseUrl) ?? 'tab'
    const currentValue = baseUrl.searchParams.get(tabKey)
    for (const el of tabElements) {
      // Skip the currently selected tab
      if (el.getAttribute('aria-selected') === 'true') continue
      const tabId = extractTabId(el)
      if (!tabId || tabId === currentValue) continue
      const candidate = new URL(baseUrl.toString())
      candidate.searchParams.set(tabKey, tabId)
      candidate.hash = ''
      const normalized = normalizeUrl(candidate.toString())
      if (normalized && normalized !== baseKey) tabs.add(normalized)
    }
  }

  return {
    tabs: Array.from(tabs),
    pdfs: Array.from(pdfMap.values()),
    subpages: Array.from(subpages),
  }
}

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'msclkid', 'dclid',
])

export interface NormalizeOptions {
  keepHash?: boolean
}

export function normalizeUrl(raw: string, opts: NormalizeOptions = {}): string | null {
  try {
    const u = new URL(raw)
    u.hostname = u.hostname.toLowerCase()
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    const params = Array.from(u.searchParams.entries())
      .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b))
    u.search = ''
    for (const [k, v] of params) u.searchParams.append(k, v)
    if (!opts.keepHash) u.hash = ''
    return u.toString().replace(/\/$/, '') // second trim for root
  } catch {
    return null
  }
}
