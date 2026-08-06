/** Related-URL discovery utilities (pure, testable). */

import { detectTabKeyFromUrl, extractTabId, isInsideNav, normalizeUrl } from '@/features/scraping/core/urlHeuristics'

import { buildDocument } from './documentUtils'
import type { EnrichedDocument } from './types'

export interface RelatedUrls {
  tabs: string[]
  /** Documents PDF découverts dans la page (avec libellé du <a> et basename) */
  pdfs: EnrichedDocument[]
  subpages: string[]
}

/** Patterns qui indiquent une page d'avis clients — jamais utile pour l'enrichissement produit. */
const REVIEW_URL_RE = /\/(?:avis|reviews?|opinions?|ratings?|notes?|feedbacks?|evaluations?|customer-reviews?|kundenbewertung|bewertungen|recensioni|resenas?)(?:\/|$|\?)|[?&](?:bvstate|productcode|pgnum|pgsize|rtype|ctype)=/i

function isReviewUrl(url: URL): boolean {
  return REVIEW_URL_RE.test(url.pathname + url.search)
}

/** Pages TRANSVERSES d'un site e-commerce (CGV, mentions légales, compte,
 *  panier, contact, magasins…) : jamais des sous-pages PRODUIT — les fusionner
 *  au bundle noie la fiche (fixture réelle Trafic : 28 Ko de CGV fusionnés, la
 *  garantie légale devenait LA description). Segments EXACTS, jamais par site. */
const NON_PRODUCT_SEGMENT_RE = /(?:^|\/)(?:conditions-?generales?(?:-de-vente)?|cgv|cgu|mentions-?legales?|legal(?:-notices?)?|privacy(?:-policy)?|politique-[a-z-]+|cookies?|contact(?:ez-nous|s)?|aide|help|faqs?|livraisons?|delivery|retours?|returns?|customer|account|mon-compte|login|connexion|panier|cart|checkout|wishlist|newsletter|magasins?|stores?|store-locator|a-propos|about(?:-us)?|qui-sommes-nous|recrutement|jobs?|carrieres?|sitemap|plan-du-site)(?:$|\/|\?)/i

function isNonProductUrl(url: URL): boolean {
  return NON_PRODUCT_SEGMENT_RE.test(url.pathname)
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

    if (isReviewUrl(resolved)) continue
    if (isNonProductUrl(resolved)) continue

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
      if (isReviewUrl(candidate)) continue
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

