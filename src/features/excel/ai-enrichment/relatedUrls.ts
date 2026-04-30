/** Related-URL discovery utilities (pure, testable). */

import { buildDocument } from './documentUtils'
import type { EnrichedDocument } from './types'

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
  /** Documents PDF découverts dans la page (avec libellé du <a> et basename) */
  pdfs: EnrichedDocument[]
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

export function discoverRelatedUrls(html: string, baseUrl: URL): RelatedUrls {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const baseKey = normalizeUrl(baseUrl.toString())
  const baseHost = baseUrl.hostname.toLowerCase()
  const basePath = baseUrl.pathname

  const tabs = new Set<string>()
  const pdfsByUrl = new Map<string, EnrichedDocument>()
  const subpages = new Set<string>()

  const linkLabel = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  const addPdf = (url: string, label: string) => {
    if (pdfsByUrl.has(url)) return
    pdfsByUrl.set(url, buildDocument(url, label))
  }

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
        if (n) addPdf(n, linkLabel(a))
      }
      continue
    }

    if (isInsideNav(a)) continue

    const normalized = normalizeUrl(resolved.toString())
    if (!normalized || normalized === baseKey) continue

    // PDFs
    if (/\.pdf($|\?)/i.test(resolved.pathname + resolved.search)) {
      addPdf(normalized, linkLabel(a))
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
  const tabKey = detectTabKeyFromUrl(baseUrl)
  if (tabKey) {
    const currentValue = baseUrl.searchParams.get(tabKey)
    const tabElements = doc.querySelectorAll('[role="tab"], [data-qa^="cmp-tab-"], [data-tab], [data-tab-id]')
    for (const el of Array.from(tabElements)) {
      if (isInsideNav(el)) continue
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
    pdfs: Array.from(pdfsByUrl.values()),
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
