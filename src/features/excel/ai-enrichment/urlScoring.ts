// ── URL scoring & filtering : tri des résultats de recherche web ────────────
//
// Module dédié aux utilitaires de filtrage/scoring des URLs issues des
// moteurs de recherche (DuckDuckGo via Jina). Détection des domaines
// e-commerce de confiance, des sites fabricants officiels, scoring
// sémantique des résultats et normalisation des URLs multi-locales.
// Aucune dépendance runtime (pas de fetch, pas de store).

// ── Types pour la recherche ─────────────────────────────────────────────────

export interface SearchResult {
  url: string
  title?: string
  description?: string
}

// ── Filtrage & scoring des résultats de recherche ───────────────────────────

/** Domaines/TLDs à rejeter systématiquement — non pertinents pour une fiche produit. */
export const JUNK_DOMAINS = [
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
export const TRUSTED_ECOM_DOMAINS = [
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
export function isTrustedEcom(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  return TRUSTED_ECOM_DOMAINS.some((d) => h === d || h.endsWith('.' + d))
}

/** Signaux positifs dans l'URL indiquant une fiche produit e-commerce. */
export const ECOM_POSITIVE_RE = /\/(product|produit|products|produits|p\/|item|items|sku|ref|shop|boutique|catalogue|fiche|article|achat)\b/i
/** Signaux négatifs — blog, news, CGV, aide… */
export const ECOM_NEGATIVE_RE = /\/(blog|news|actualites?|article[s]?\/|help|aide|support|forum|cgv|legal|policy|privacy|terms)\b/i
/** Pages de recherche / listes / catégories — PAS des fiches produit.
 *  ex: amazon.com/s?, /b?, /search, /c/, /category/, /nos-librairies */
export const ECOM_LISTING_RE = /(\?|\/)(s|b|search|recherche|list|liste|c|category|categorie|dept|department|browse)(\/|\?|$)|\/nos-|\/contact|\/pages\/contact/i

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
export const STOPWORDS = new Set([
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

export function scoreResult(r: SearchResult, sourceTokens: string[], brand?: string, reference?: string, modelFromTitle?: string): number {
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
        // Site officiel de la marque → bonus massif, surtout FR
        s += isFr ? 40 : 20
      }
    } catch { /* ignore */ }
  }

  // ── CRITIQUE : la référence/SKU/modèle apparaît dans l'URL (+25) ────
  //    Ex: URL .../m18-fpd3/ contient "m18fpd3" → c'est LA page produit.
  //    La page catégorie .../perceuses-a-percussion/ ne contiendra PAS la ref.
  //    On teste reference (SKU fourni) ET modelFromTitle (extrait du titre : "DUH752Z").
  const refCandidates = [reference, modelFromTitle].filter((x): x is string => !!x && x.length >= 3)
  let refHit = false
  for (const candidate of refCandidates) {
    const refNorm = candidate.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (refNorm.length >= 3 && pathNorm.includes(refNorm)) {
      s += 25
      refHit = true
      console.log('[scoring] ref in URL! +25:', candidate, '→', pathname)
      break
    }
  }

  // ── Pénalité catégorie : URL contient /products/ ou /categorie/ mais
  //    AUCUN code modèle. Les pages fiche produit ont toujours la ref dans le slug. ──
  if (!refHit && refCandidates.length > 0) {
    if (/\/(products?|categories?|categorie|gamme|collection)\//i.test(pathname)) {
      s -= 15
      console.log('[scoring] category path, no ref in URL! −15:', pathname)
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

// ── Détection site fabricant officiel ────────────────────────────────────────

/** Domaines connus des sites fabricants officiels (clé = slug marque). */
export const MANUFACTURER_DOMAINS: Record<string, string[]> = {
  milwaukee:  ['milwaukeetool.eu', 'milwaukeetool.com'],
  ryobi:      ['ryobitools.eu', 'ryobitools.com'],
  aeg:        ['aeg-powertools.eu'],
  dewalt:     ['dewalt.fr', 'dewalt.com', 'dewalt.eu'],
  makita:     ['makita.fr', 'makita.com'],
  bosch:      ['bosch-professional.com', 'bosch-home.fr'],
  metabo:     ['metabo.com'],
  hikoki:     ['hikoki-powertools.fr', 'hikoki-powertools.com'],
  festool:    ['festool.fr', 'festool.com'],
  stihl:      ['stihl.fr', 'stihl.com'],
  husqvarna:  ['husqvarna.com'],
  stanley:    ['stanleyoutillage.fr', 'stanleytools.com'],
  karcher:    ['kaercher.com'],
  einhell:    ['einhell.fr', 'einhell.com'],
  flex:       ['flex-tools.com'],
  worx:       ['worx.com'],
  hilti:      ['hilti.fr', 'hilti.com'],
  facom:      ['facom.fr', 'facom.com'],
}

/** Retourne le slug de la marque si l'URL est un site fabricant officiel, null sinon. */
export function detectManufacturerSite(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const [brand, domains] of Object.entries(MANUFACTURER_DOMAINS)) {
      if (domains.some(d => host === d || host.endsWith('.' + d))) return brand
    }
    return null
  } catch { return null }
}

/**
 * Réécrit le premier segment locale d'une URL vers `/fr/` quand il s'agit
 * d'un code locale non-français (us, en, de, …). Règle générique applicable
 * à tout site multi-locale : pour une recherche française, on préfère la
 * version française de la même page.
 *
 * Exemples :
 *   /us/products/x → /fr/products/x
 *   /en-gb/p/y     → /fr/p/y
 *   /fr/produits/z → inchangé
 *   /products/a    → inchangé (pas de segment locale)
 */
export const KNOWN_LOCALE_SEGMENTS = /^(us|en|en-[a-z]{2}|de|de-[a-z]{2}|es|es-[a-z]{2}|it|it-[a-z]{2}|nl|pt|pt-[a-z]{2}|pl|ja|zh|zh-[a-z]{2}|ko|ru|tr|ar|he|hi|uk|cs|da|sv|no|fi|hu|ro|bg|hr|sk|sl|lt|lv|et|mt|el|ga|is|ch|at|be|lu|dk|ie|gb|au|nz|ca|mx|br)$/i
export function preferFrenchUrl(url: string): string {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/^\/([a-z]{2,3}(?:-[a-z]{2,3})?)(\/|$)/i)
    if (!m) return url
    const locale = m[1].toLowerCase()
    if (locale === 'fr' || locale.startsWith('fr-')) return url
    if (!KNOWN_LOCALE_SEGMENTS.test(locale)) return url
    u.pathname = '/fr' + m[2] + u.pathname.slice(m[0].length)
    return u.toString()
  } catch {
    return url
  }
}
