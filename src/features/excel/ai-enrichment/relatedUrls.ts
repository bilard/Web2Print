/** Related-URL discovery utilities (pure, testable). */

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

export function discoverRelatedUrls(html: string, baseUrl: URL): RelatedUrls {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const baseKey = normalizeUrl(baseUrl.toString())
  const baseHost = baseUrl.hostname.toLowerCase()
  const basePath = baseUrl.pathname

  const tabs = new Set<string>()
  const pdfs = new Set<string>()
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
        if (n) pdfs.add(n)
      }
      continue
    }

    if (isInsideNav(a)) continue

    const normalized = normalizeUrl(resolved.toString())
    if (!normalized || normalized === baseKey) continue

    // PDFs
    if (/\.pdf($|\?)/i.test(resolved.pathname + resolved.search)) {
      pdfs.add(normalized)
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

  return {
    tabs: Array.from(tabs),
    pdfs: Array.from(pdfs),
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
