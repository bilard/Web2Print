// Filtrage et classement des résultats de recherche web, en amont du scraping
// d'une fiche produit.
//
// Le score décide QUELLE page sera scrapée : une page catégorie ou une locale
// étrangère retenue à tort fait dérailler tout l'enrichissement en aval. Les
// pondérations encodent des cas réels — elles se modifient avec précaution.
//
// Module pur (aucun réseau, aucun état) : testable seul.
import { debugLog } from '@/lib/debugLog'

// ── Types pour la recherche ─────────────────────────────────────────────────

export interface SearchResult {
  url: string
  title?: string
  description?: string
}

// ── Filtrage & scoring des résultats de recherche ───────────────────────────

/** Domaines/TLDs à rejeter systématiquement — non pertinents pour une fiche produit. */
const JUNK_DOMAINS = [
  'facebook.com', 'm.facebook.com', 'twitter.com', 'x.com', 'instagram.com',
  'pinterest.com', 'pinterest.fr', 'reddit.com', 'linkedin.com', 'tiktok.com',
  'youtube.com', 'youtu.be',
  'archive.org', 'wikipedia.org', 'wikimedia.org',
  'hal.science', 'pastel.hal.science', 'studylib.net', 'scribd.com',
  'academia.edu', 'researchgate.net',
  // Administrations & publications gouvernementales
  'gov.uk', '.gov', 'publishing.service.gov.uk',
  'gc.ca', 'canada.ca', 'publications.gc.ca',
  '.gouv.fr', 'service-public.fr', 'legifrance.gouv.fr',
  // Librairies en ligne (livres — pas des fiches produit e-commerce pertinentes)
  'leslibraires.ca', 'leslibraires.fr', 'librairie', 'babelio.com', 'goodreads.com',
]

/**
 * Liste blanche des domaines e-commerce prioritaires.
 * Ordre = ordre de préférence pour les queries `site:` (essais séquentiels).
 * Regroupés par zone géographique : .tn > .fr > international.
 */
const TRUSTED_ECOM_DOMAINS = [
  // ── Tunisie ────────────────────────────────────────────
  'monoprix.tn', 'carrefour.tn', 'mytek.tn', 'tunisianet.com.tn',
  'jumia.com.tn', 'wifaq.tn', 'electroshop.tn', 'sbs.com.tn',
  // ── France ─────────────────────────────────────────────
  'amazon.fr', 'fnac.com', 'darty.com', 'boulanger.com',
  'cdiscount.com', 'rakuten.com', 'leroymerlin.fr', 'castorama.fr',
  'manomano.fr', 'e.leclerc', 'carrefour.fr', 'auchan.fr',
  'monoprix.fr', 'but.fr', 'conforama.fr', 'ikea.com',
  // ── International ──────────────────────────────────────
  'amazon.com', 'amazon.co.uk', 'ebay.fr', 'ebay.com',
  'aliexpress.com', 'walmart.com', 'target.com',
]

/** Match rapide : le host appartient-il à la liste blanche ? */
function isTrustedEcom(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  return TRUSTED_ECOM_DOMAINS.some((d) => h === d || h.endsWith('.' + d))
}

/** Signaux positifs dans l'URL indiquant une fiche produit e-commerce. */
const ECOM_POSITIVE_RE = /\/(product|produit|products|produits|p\/|item|items|sku|ref|shop|boutique|catalogue|fiche|article|achat)\b/i
/** Signaux négatifs — blog, news, CGV, aide… */
const ECOM_NEGATIVE_RE = /\/(blog|news|actualites?|article[s]?\/|help|aide|support|forum|cgv|legal|policy|privacy|terms)\b/i
/** Pages de recherche / listes / catégories — PAS des fiches produit.
 *  ex: amazon.com/s?, /b?, /search, /c/, /category/, /nos-librairies */
const ECOM_LISTING_RE = /(\?|\/)(s|b|search|recherche|list|liste|c|category|categorie|dept|department|browse)(\/|\?|$)|\/nos-|\/contact|\/pages\/contact/i

export function isJunkUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (JUNK_DOMAINS.some((d) => host === d || host.endsWith('.' + d) || host.endsWith(d))) return true
    // PDFs + documents bureautiques
    if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt|csv)(\?|$)/i.test(u.pathname)) return true
    return false
  } catch {
    return true
  }
}

/** Tokenise un titre produit en mots significatifs (>= 3 chars, hors stopwords). */
const STOPWORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'pour', 'avec',
  'sur', 'par', 'en', 'au', 'aux', 'the', 'and', 'for', 'with', 'from', 'acheter',
  'achat', 'buy', 'product', 'produit', 'online', 'ligne',
])
export function tokenizeTitle(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

export function scoreResult(r: SearchResult, sourceTokens: string[], brand?: string, reference?: string): number {
  let s = 0
  const url = r.url
  let pathname = ''
  try { pathname = new URL(url).pathname.toLowerCase() } catch { /* */ }
  const pathNorm = pathname.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

  // ── Bonus prioritaire : site officiel de la marque ────
  if (brand) {
    const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]/g, '')
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
      const fullUrl = url.toLowerCase()
      if (brandSlug && host.includes(brandSlug)) {
        const isFr = host.endsWith('.fr')
          || host.startsWith('fr.')
          || fullUrl.includes('/fr-fr/')
          || fullUrl.includes('/fr/')
          || fullUrl.includes('/fr-be/')
          || fullUrl.includes('/fr-ch/')
        // Site officiel de la marque → bonus massif, surtout FR
        s += isFr ? 40 : 20
      }
    } catch { /* ignore */ }
  }

  // ── Pénalité locale non-FR : /id/, /en-us/, /de-de/, /es-es/, /ja-jp/, etc.
  //    Les sites fabricants multilingues exposent le même produit sur plusieurs
  //    paths localisés. On veut la version FR par défaut — un /id/ (Indonésie)
  //    ou /en-us/ (États-Unis) renvoie un contenu + prix + specs en langue/marché
  //    étrangers. Rejet par pénalité forte si aucun marqueur FR dans l'URL.
  {
    const lowUrl = url.toLowerCase()
    const NON_FR_LOCALE_RE = /\/(id|de|es|it|pt|pl|ru|ja|ko|zh|nl|sv|no|da|fi|tr|ar|he|cs|sk|hu|ro|bg|hr|el|uk|vi|th|ms)(-[a-z]{2})?\//
    const NON_FR_EN_US_RE = /\/(en-us|en-ca|en-au|en-in|en-za|en-ph|en-gb)\//
    const hasFrMarker = /\/(fr|fr-fr|fr-be|fr-ch|fr-ca)\//.test(lowUrl) || /\.fr[\/$]/.test(lowUrl) || /\/\/fr\./.test(lowUrl)
    if (!hasFrMarker) {
      if (NON_FR_LOCALE_RE.test(lowUrl)) s -= 20
      else if (NON_FR_EN_US_RE.test(lowUrl)) s -= 12
    }
  }

  // ── CRITIQUE : la référence/SKU/modèle apparaît dans l'URL (+20) ────
  //    Ex: URL .../m18-fpd3/ contient "m18fpd3" → c'est LA page produit.
  //    La page catégorie .../perceuses-a-percussion/ ne contiendra PAS la ref.
  if (reference) {
    const refNorm = reference.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (refNorm.length >= 3 && pathNorm.includes(refNorm)) {
      s += 20
      debugLog('[scoring] ref in URL! +20:', reference, '→', pathname)
    }
  }

  // ── Bonus massif si domaine e-commerce de confiance ────
  try {
    const host = new URL(url).hostname
    if (isTrustedEcom(host)) s += 10
  } catch {
    /* ignore */
  }
  if (ECOM_POSITIVE_RE.test(url)) s += 5
  if (ECOM_NEGATIVE_RE.test(url)) s -= 3
  // ── Pénalité massive : pages de recherche / catégorie / contact ────
  if (ECOM_LISTING_RE.test(url)) s -= 15

  // ── Pénalité pour pages catégorie sur sites marque ────
  //    URLs terminant par un nom de catégorie pluriel (perceuses-a-percussion, meuleuses, etc.)
  const lastSegment = pathname.split('/').filter(Boolean).pop() ?? ''
  if (/^[a-z]+-(?:a|de|et|en)-[a-z]+$/.test(lastSegment) || /s$/.test(lastSegment)) {
    // Pattern catégorie probable — pénaliser sauf si la ref est dedans
    const refInLast = reference
      ? lastSegment.replace(/[^a-z0-9]/g, '').includes(reference.toLowerCase().replace(/[^a-z0-9]/g, ''))
      : false
    if (!refInLast) s -= 5
  }

  // Pages racines/accueil : pénalisées
  if (pathname === '/' || /^\/(fr|en|home|index)\/?$/i.test(pathname)) s -= 2
  // Chemins profonds = probablement une fiche précise
  const depth = pathname.split('/').filter(Boolean).length
  s += Math.min(depth, 4)

  // Titre contenant "produit" / "acheter" = bon signe
  const title = (r.title ?? '').toLowerCase()
  if (/\b(produit|product|acheter|achat|buy|prix|price|€|eur|tnd)\b/i.test(title)) s += 2
  // ── Score sémantique : combien de tokens du titre source apparaissent dans
  //    le titre/description du résultat ? Sans au moins 1 match, on pénalise fort. ──
  if (sourceTokens.length > 0) {
    const haystack = `${title} ${(r.description ?? '').toLowerCase()}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    const matched = sourceTokens.filter((t) => haystack.includes(t)).length
    if (matched === 0) s -= 10
    else s += Math.min(matched * 3, 9)
  }

  // ── Tokens source dans l'URL aussi (ex: "m18" "fpd3" dans le path) ────
  if (sourceTokens.length > 0) {
    const urlMatched = sourceTokens.filter(t => t.length >= 3 && pathNorm.includes(t)).length
    s += urlMatched * 3
  }

  return s
}
