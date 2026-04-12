import { useCallback, useState } from 'react'
import { z } from 'zod'
import { getApiKey } from '@/lib/apiKeys'
import { generateJson } from '@/features/ai/llmRouter'
import { useFirecrawl, FIELD_TEMPLATES, type ScrapeResult } from '@/features/scraping/useFirecrawl'
import { useEnrichmentStore } from './enrichmentStore'
import type { EnrichedProduct } from './types'

/**
 * Hook d'enrichissement IA en live d'un produit individuel.
 *
 * Flux :
 *  1. Firecrawl /v1/search pour trouver la meilleure page produit
 *  2. Firecrawl scrape sur l'URL trouvée (template product_full)
 *  3. Claude via llmRouter pour reformuler et structurer les données
 *
 * Tolérant aux échecs : si le scraping rate, on envoie quand-même au LLM
 * les infos de la ligne source pour qu'il génère un enrichissement basé
 * sur ses connaissances.
 */

// ── Filtrage des contenus parasites (cookie banners, GDPR, reCAPTCHA) ───────

const GARBAGE_RE = /\b(cookie[s ]?|gdpr|your privacy|recaptcha|captcha|consent manager|targeting cookies?|functional cookies?|performance cookies?|strictly necessary|necessary cookies?|checkbox.?label|onetrust|cookiebot|manage preferences|cookie settings|politique de confidentialit[eé]|param[eè]tres? des? cookies?|refuser les cookies?|accepter les cookies?|we use cookies|this site is exceeding)\b/i

/** Détecte si un texte est du contenu parasite (cookie banner, GDPR, reCAPTCHA) */
function isGarbageContent(text: string): boolean {
  return GARBAGE_RE.test(text)
}

/**
 * Post-processing : enrichit un EnrichedProduct avec les données du markdown source.
 * Le markdown est la SOURCE DE VÉRITÉ pour les groupes, les items manquants et les variantes.
 * Le LLM et le schema Firecrawl retournent tout à plat — le markdown conserve la structure.
 */
function enrichWithMarkdownGroups(enriched: EnrichedProduct, markdownContent: string | null): EnrichedProduct {
  if (!markdownContent || markdownContent.length < 100) {
    console.log('[post-process] no markdown content, skipping')
    return enriched
  }

  console.log('[post-process] markdown length:', markdownContent.length, 'chars')
  // Log les lignes contenant des keywords features/avantages pour debug
  const featureLines = markdownContent.split('\n')
    .filter(l => /les\s*\+|avantage|caract[eé]ristique|points?\s*forts?|features?/i.test(l))
    .slice(0, 10)
  if (featureLines.length > 0) {
    console.log('[post-process] feature-related lines in markdown:', featureLines.map(l => l.trim().slice(0, 80)))
  }

  let { advantages, specifications, variants } = enriched

  // ── 1. Advantages : le markdown fait autorité (groupes + complétude) ──
  const mdAdvantages = parseAdvantagesFromMarkdown(markdownContent)
  console.log('[post-process] markdown advantages:', mdAdvantages.length, 'items,', mdAdvantages.filter(a => a.group).length, 'grouped')
  if (mdAdvantages.length > 0) {
    // Le markdown a plus d'items OU a des groupes → le préférer
    if (mdAdvantages.length >= advantages.length || mdAdvantages.some(a => a.group)) {
      advantages = mdAdvantages
      console.log('[post-process] ✓ using markdown advantages:', advantages.length, 'items')
    }
  }

  // ── 2. Specs : attribuer les groupes du markdown ──
  const mdSpecs = parseSpecsFromMarkdown(markdownContent)
  if (mdSpecs.length > 0 && mdSpecs.some(s => s.group) && !specifications.some(s => s.group)) {
    specifications = specifications.map(spec => {
      const match = mdSpecs.find(ms => {
        const a = ms.name.toLowerCase().replace(/\s+/g, ' ')
        const b = spec.name.toLowerCase().replace(/\s+/g, ' ')
        return a === b || a.includes(b) || b.includes(a)
      })
      return match?.group ? { ...spec, group: match.group } : spec
    })
    console.log('[post-process] ✓ specs grouped:', specifications.filter(s => s.group).length, '/', specifications.length)
  }

  // ── 3. Variants : extraire du markdown ──
  if (!variants || variants.length === 0) {
    variants = parseVariantsFromMarkdown(markdownContent)
    if (variants.length > 0) {
      console.log('[post-process] ✓ variants:', variants.length)
    }
  }

  return { ...enriched, advantages, specifications, variants }
}

/** Nettoie un EnrichedProduct en retirant les contenus parasites */
function sanitizeEnriched(enriched: EnrichedProduct): EnrichedProduct {
  return {
    ...enriched,
    advantages: enriched.advantages.filter(a => !isGarbageContent(a.text)),
    specifications: enriched.specifications.filter(s => !isGarbageContent(s.name) && !isGarbageContent(s.value)),
    // Ne vider la description que si elle est courte ET garbage (éviter faux positifs sur du vrai contenu)
    description: isGarbageContent(enriched.description) && enriched.description.length < 300
      ? ''
      : enriched.description,
  }
}

/**
 * Actions Firecrawl pour fermer les cookie banners courants.
 * UNIQUEMENT des sélecteurs CSS valides (pas de :has-text Playwright).
 */
const COOKIE_DISMISS_ACTIONS = [
  { type: 'wait', milliseconds: 2000 },
  {
    type: 'click',
    selector: [
      '#onetrust-reject-all-handler',
      '#CybotCookiebotDialogBodyButtonDecline',
      '#didomi-notice-disagree-button',
      '[data-axeptio-action="reject"]',
      'button[data-action="reject"]',
      'button[data-action="refuse"]',
      '.cookie-reject',
      '.refuse-cookies',
      '.decline-cookies',
      '.cc-deny',
      '.js-decline-cookies',
    ].join(', '),
  },
  { type: 'wait', milliseconds: 1000 },
]

/**
 * Actions Firecrawl pour un scrape complet : fermer cookies + scroller la page
 * entière pour déclencher le contenu lazy-loaded (IntersectionObserver).
 * Critique pour les sites comme Milwaukee qui chargent les specs au scroll.
 */
const FULL_PAGE_SCRAPE_ACTIONS = [
  ...COOKIE_DISMISS_ACTIONS,
  // Scroll progressif pour déclencher les IntersectionObserver
  { type: 'scroll', direction: 'down', amount: 2000 },
  { type: 'wait', milliseconds: 1500 },
  { type: 'scroll', direction: 'down', amount: 2000 },
  { type: 'wait', milliseconds: 1500 },
  // Accordéons génériques (fonctionne sur la plupart des sites e-commerce)
  { type: 'click', selector: 'details summary, .accordion-trigger, .specs-toggle, [data-toggle="collapse"], [role="tab"], .tab-trigger' },
  { type: 'wait', milliseconds: 1500 },
  { type: 'scroll', direction: 'down', amount: 2000 },
  { type: 'wait', milliseconds: 1000 },
  { type: 'scroll', direction: 'down', amount: 2000 },
  { type: 'wait', milliseconds: 1000 },
]

// ── Schemas Zod pour la réponse LLM ─────────────────────────────────────────

const enrichedSpecSchema = z.object({
  name: z.string(),
  value: z.string(),
})

const enrichedProductSchema = z.object({
  description: z.string(),
  advantages: z.array(z.string()),
  specifications: z.array(enrichedSpecSchema),
  images: z.array(z.string()),
  documents: z.array(z.string()),
})

const enrichedProductJsonSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'Description marketing riche (2 à 4 phrases), en français, ton professionnel et engageant.',
    },
    advantages: {
      type: 'array',
      items: { type: 'string' },
      description: 'Liste de 3 à 6 points forts / bénéfices utilisateur, phrase courte chacun.',
    },
    specifications: {
      type: 'array',
      description: 'TOUTES les spécifications techniques disponibles au format {name, value}. Ne pas limiter : inclure chaque caractéristique trouvée (dimensions, poids, matériaux, composition, couleur, capacité, puissance, normes, etc.).',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['name', 'value'],
      },
    },
    images: {
      type: 'array',
      items: { type: 'string' },
      description: 'URLs complètes des meilleures images produit trouvées (reprendre telles quelles depuis les données scrapées).',
    },
    documents: {
      type: 'array',
      items: { type: 'string' },
      description: 'URLs complètes des documents téléchargeables (PDF, notices, fiches techniques, déclarations CE). Reprendre les URLs telles quelles depuis les données scrapées.',
    },
  },
  required: ['description', 'advantages', 'specifications', 'images', 'documents'],
} as const

// ── Types d'input ───────────────────────────────────────────────────────────

export interface EnrichmentInput {
  sheetName: string
  rowId: string
  /** Nom / titre du produit (obligatoire pour la recherche) */
  title: string
  brand?: string
  sku?: string
  reference?: string
  /** Description existante (utilisée en contexte pour le LLM) */
  description?: string
  /** Chemin de catégorie taxonomique (ex: "Textile > Linge de lit > Couettes") —
   *  donne au LLM un signal fort pour détecter une incohérence avec le scraping. */
  category?: string
  /** URL d'origine déjà connue — si fournie, on saute l'étape de recherche */
  knownUrl?: string
}

// ── Firecrawl Search (endpoint non exposé par le hook existant) ─────────────

interface SearchResult {
  url: string
  title?: string
  description?: string
}

/**
 * Récupère le HTML brut d'une page via Firecrawl et extrait toutes les URLs d'images pertinentes.
 * Utilisé comme fallback si l'extraction schématique n'a pas retourné d'images.
 */
async function firecrawlFetchImages(pageUrl: string): Promise<string[]> {
  const apiKey = getApiKey('firecrawl')
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: pageUrl,
        formats: ['html'],
        onlyMainContent: true,
        waitFor: 1500,
        excludeTags: ['nav', 'header', 'footer', 'script', 'style', 'noscript'],
        actions: COOKIE_DISMISS_ACTIONS,
      }),
    })
    if (!res.ok) return []
    const json = (await res.json()) as { success?: boolean; data?: { html?: string } }
    const html = json.data?.html ?? ''
    if (!html) return []

    const base = new URL(pageUrl)
    const urls = new Set<string>()

    // <img src="…"> et data-src/srcset
    const imgTagMatches = [...html.matchAll(/<img\b[^>]*>/gi)]
    for (const tag of imgTagMatches) {
      const tagStr = tag[0]
      const attrs: string[] = []
      const srcMatch = tagStr.match(/\b(?:data-src|src)=["']([^"']+)["']/i)
      if (srcMatch) attrs.push(srcMatch[1])
      const srcsetMatch = tagStr.match(/\bsrcset=["']([^"']+)["']/i)
      if (srcsetMatch) {
        srcsetMatch[1].split(',').forEach((part) => {
          const u = part.trim().split(/\s+/)[0]
          if (u) attrs.push(u)
        })
      }
      for (const raw of attrs) {
        try {
          const abs = new URL(raw, base).toString()
          if (/^https?:\/\//.test(abs)) urls.add(abs)
        } catch {
          /* ignore */
        }
      }
    }

    // Filtre : on vire les assets manifestement non-produit (icônes, sprites, logos, pixels)
    const filtered = [...urls].filter((u) => {
      if (/\.svg(\?|$)/i.test(u)) return false
      if (/\bdata:image\b/i.test(u)) return false
      if (/(sprite|favicon|pixel|blank-|placeholder|1x1|loader|spinner|tracking)/i.test(u)) return false
      // Petites tailles typiques d'icônes (16/24/32/48px)
      if (/[_-](16|24|32|48)x(16|24|32|48)\b/.test(u)) return false
      return true
    })

    // Tri : on privilégie les URLs qui ressemblent à des photos produit
    filtered.sort((a, b) => {
      const score = (u: string) => {
        let s = 0
        if (/\.(jpe?g|png|webp|avif)(\?|$)/i.test(u)) s += 3
        if (/\/(product|produit|media|upload|catalog|assets\/images?)/i.test(u)) s += 2
        if (/(large|zoom|full|hd|original|detail)/i.test(u)) s += 2
        if (/(thumb|mini|small|sm_)/i.test(u)) s -= 1
        return s
      }
      return score(b) - score(a)
    })

    console.log('[enrichment] fallback HTML images →', filtered.length, 'candidates')
    return filtered.slice(0, 20)
  } catch (err) {
    console.warn('[enrichment] HTML image fallback failed', err)
    return []
  }
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

function isJunkUrl(url: string): boolean {
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
function tokenizeTitle(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

function scoreResult(r: SearchResult, sourceTokens: string[], brand?: string, reference?: string): number {
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
        s += isFr ? 25 : 12
      }
    } catch { /* ignore */ }
  }

  // ── CRITIQUE : la référence/SKU/modèle apparaît dans l'URL (+20) ────
  //    Ex: URL .../m18-fpd3/ contient "m18fpd3" → c'est LA page produit.
  //    La page catégorie .../perceuses-a-percussion/ ne contiendra PAS la ref.
  if (reference) {
    const refNorm = reference.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (refNorm.length >= 3 && pathNorm.includes(refNorm)) {
      s += 20
      console.log('[scoring] ref in URL! +20:', reference, '→', pathname)
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

async function firecrawlSearch(query: string, limit = 5): Promise<SearchResult[]> {
  const apiKey = getApiKey('firecrawl')
  if (!apiKey) throw new Error('Clé Firecrawl absente. Configurez-la dans Réglages.')

  console.log('[firecrawl-search] →', { query, limit, hasKey: !!apiKey, keyPrefix: apiKey.slice(0, 6) })
  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, limit }),
  })
  console.log('[firecrawl-search] response status', res.status)
  if (!res.ok) {
    const body = await res.text()
    console.error('[firecrawl-search] HTTP error body', body.slice(0, 500))
    throw new Error(`Firecrawl search ${res.status} : ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    success?: boolean
    data?: SearchResult[] | { web?: SearchResult[] }
    web?: SearchResult[]
    error?: string
  }
  console.log('[firecrawl-search] raw response', JSON.stringify(json).slice(0, 800))
  if (json.error) {
    throw new Error(`Firecrawl search a renvoyé une erreur : ${json.error}`)
  }
  // Firecrawl a fait évoluer la forme : legacy = data: SearchResult[]
  // nouveau = data: { web: SearchResult[] }
  const dataField = json.data
  const candidates: SearchResult[] = Array.isArray(dataField)
    ? dataField
    : dataField && Array.isArray(dataField.web)
      ? dataField.web
      : Array.isArray(json.web)
        ? json.web
        : []
  const filtered = candidates.filter((r) => r.url && /^https?:\/\//.test(r.url))
  console.log('[firecrawl-search] parsed', { candidates: candidates.length, filtered: filtered.length, urls: filtered.map((r) => r.url) })
  return filtered
}

// ── Firecrawl markdown fallback ─────────────────────────────────────────────

/**
 * Scrape une page via Firecrawl en mode markdown pur (pas d'extraction schema).
 * Plus fiable sur les SPA car on récupère le contenu rendu tel quel,
 * puis le LLM parsera les specs depuis le texte brut.
 */
async function firecrawlScrapeMarkdown(pageUrl: string): Promise<string | null> {
  const apiKey = getApiKey('firecrawl')
  if (!apiKey) return null

  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url: pageUrl,
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 1000,
      excludeTags: ['nav', 'header', 'footer', 'noscript'],
      actions: FULL_PAGE_SCRAPE_ACTIONS,
    }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { success?: boolean; data?: { markdown?: string } }
  let md = json.data?.markdown
  if (!md || md.length < 50) return null

  // Retirer les sections cookie/GDPR/reCAPTCHA du markdown
  md = md
    .replace(/#{1,4}\s*(Your Privacy|Cookie|GDPR|Manage Preferences)[\s\S]*?(?=\n#{1,4}\s|\n\n---|\n\n\*\*|$)/gi, '')
    .replace(/^[-*•]\s*.*?(cookie|privacy|captcha|recaptcha|consent|targeting|functional|necessary).*$/gim, '')
    .replace(/checkbox\s*label\s*label/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  console.log('[firecrawl-markdown] got', md.length, 'chars (after cookie cleanup)')
  return md
}

// ── Extraction générique de données SPA depuis le HTML brut ───────────────

/**
 * Scrape le HTML brut d'une page via Firecrawl et extrait les données produit
 * depuis les data stores SPA courants (__NEXT_DATA__, __NUXT__, __REDUX_STORE__,
 * window.Relay, application/ld+json, etc.).
 *
 * Fonctionne sur n'importe quel site React/Next/Nuxt/Vue — pas spécifique à
 * une marque. Retourne un BrandApiResult compatible pour réutiliser le même
 * pipeline de parsing.
 */
async function extractSpaDataFromHtml(pageUrl: string): Promise<BrandApiResult | null> {
  const apiKey = getApiKey('firecrawl')
  if (!apiKey) return null

  console.log('[spa-extract] fetching page rawHtml…')
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url: pageUrl,
      formats: ['rawHtml'],
      onlyMainContent: false,
      waitFor: 3000,
      actions: COOKIE_DISMISS_ACTIONS,
    }),
  })
  if (!res.ok) {
    console.warn('[spa-extract] Firecrawl rawHtml scrape failed:', res.status)
    return null
  }
  const json = (await res.json()) as { success?: boolean; data?: { rawHtml?: string; html?: string } }
  const html = json.data?.rawHtml || json.data?.html || ''
  if (html.length < 500) return null
  console.log('[spa-extract] got', html.length, 'chars of HTML')

  const sections: BrandApiResult['sections'] = []
  const textParts: string[] = []

  // ── 1. JSON-LD (schema.org) — le plus universel ──
  const jsonLdRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let ldMatch: RegExpExecArray | null
  while ((ldMatch = jsonLdRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(ldMatch[1])
      // Chercher un objet Product dans le JSON-LD (peut être un tableau ou imbriqué dans @graph)
      const products = findJsonLdProducts(data)
      for (const product of products) {
        if (product.name || product.description) {
          sections.push({ label: 'jsonld-product', raw: JSON.stringify(product), parsed: product })
          textParts.push(`=== jsonld-product ===\n${JSON.stringify(product)}`)
          console.log('[spa-extract] found JSON-LD Product:', product.name)
        }
      }
    } catch { /* invalid JSON-LD, skip */ }
  }

  // ── 2. __NEXT_DATA__ (Next.js) ──
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/)
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1])
      const props = nextData?.props?.pageProps
      if (props && typeof props === 'object') {
        // Chercher des clés contenant "product", "item", "data"
        const productData = findProductInObject(props)
        if (productData) {
          sections.push({ label: 'nextjs-product', raw: JSON.stringify(productData), parsed: productData })
          textParts.push(`=== nextjs-product ===\n${JSON.stringify(productData)}`)
          console.log('[spa-extract] found Next.js product data')
        }
      }
    } catch { /* invalid JSON */ }
  }

  // ── 3. __NUXT__ / __NUXT_DATA__ (Nuxt.js) ──
  const nuxtMatch = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)
  if (nuxtMatch) {
    try {
      // Nuxt state can be complex, try to eval-safe parse
      const nuxtData = JSON.parse(nuxtMatch[1].replace(/undefined/g, 'null'))
      const productData = findProductInObject(nuxtData)
      if (productData) {
        sections.push({ label: 'nuxt-product', raw: JSON.stringify(productData), parsed: productData })
        textParts.push(`=== nuxt-product ===\n${JSON.stringify(productData)}`)
        console.log('[spa-extract] found Nuxt product data')
      }
    } catch { /* invalid data */ }
  }

  // ── 4. Pattern générique : gros blocs JSON dans les <script> ──
  //    Chercher des scripts contenant "specifications" ou "productFeatures" etc.
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi
  let scriptMatch: RegExpExecArray | null
  while ((scriptMatch = scriptRe.exec(html)) !== null) {
    const content = scriptMatch[1]
    if (content.length < 100 || content.length > 500000) continue
    // Seulement si le script contient des mots-clés produit
    if (!/specification|productFeature|productDetail|"description"|"advantages"|"features"/i.test(content)) continue
    // Éviter les scripts déjà traités
    if (content.includes('__NEXT_DATA__') || content.includes('application/ld+json')) continue

    // Chercher des assignations JSON : window.X = {...} ou var X = {...}
    const jsonAssignRe = /(?:window\.[\w.]+|var\s+\w+)\s*=\s*(\{[\s\S]*?\});?\s*$/gm
    let assignMatch: RegExpExecArray | null
    while ((assignMatch = jsonAssignRe.exec(content)) !== null) {
      try {
        const data = JSON.parse(assignMatch[1])
        const productData = findProductInObject(data)
        if (productData) {
          sections.push({ label: 'spa-inline-product', raw: JSON.stringify(productData), parsed: productData })
          textParts.push(`=== spa-inline-product ===\n${JSON.stringify(productData)}`)
          console.log('[spa-extract] found inline SPA product data')
          break // One is enough per script
        }
      } catch { /* not valid JSON */ }
    }
  }

  // ── 5. Extraire les features depuis les patterns Relay/Redux ──
  const featuresMatch = html.match(/"(?:productFeatures|features|keyFeatures)"\s*:\s*(\[[^\]]*\])/)
  if (featuresMatch && !sections.some(s => s.label === 'features')) {
    try {
      const features = JSON.parse(featuresMatch[1])
      if (Array.isArray(features) && features.length > 0) {
        sections.push({ label: 'features', raw: JSON.stringify(features), parsed: features })
        textParts.push(`=== features ===\n${JSON.stringify(features)}`)
        console.log('[spa-extract] found features array:', features.length, 'items')
      }
    } catch { /* ignore */ }
  }

  // ── 6. Extraire les images produit haute qualité ──
  const imageUrls: string[] = []
  // Pattern générique : URLs d'images dans des attributs JSON (pas les tiny icons)
  const imgUrlRe = /https?:\/\/[^\s"'\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'\\]*)*/gi
  let imgMatch: RegExpExecArray | null
  const seen = new Set<string>()
  while ((imgMatch = imgUrlRe.exec(html)) !== null) {
    let url = imgMatch[0].replace(/\\u0026/g, '&').replace(/\\/g, '')
    // Filtrer les icons, tracking pixels, etc.
    if (url.length < 30 || /icon|logo|avatar|pixel|tracking|1x1|spacer|blank/i.test(url)) continue
    // Dé-dupliquer par nom de fichier
    const filename = url.split('/').pop()?.split('?')[0] || ''
    if (filename && !seen.has(filename)) {
      seen.add(filename)
      imageUrls.push(url)
    }
  }
  if (imageUrls.length > 0 && !sections.some(s => s.label === 'images')) {
    // Garder max 30 images pertinentes
    const filtered = imageUrls.slice(0, 30)
    sections.push({ label: 'images', raw: JSON.stringify(filtered), parsed: filtered })
    textParts.push(`=== images ===\n${JSON.stringify(filtered)}`)
    console.log('[spa-extract] found', filtered.length, 'product images')
  }

  if (sections.length === 0) {
    console.log('[spa-extract] no SPA data found')
    return null
  }

  const combinedText = textParts.join('\n\n')
  console.log('[spa-extract] ✓', sections.length, 'sections →', combinedText.length, 'chars')
  return { combinedText, sections }
}

/**
 * Cherche les objets Product dans un JSON-LD (peut être un objet, un tableau,
 * ou un @graph contenant plusieurs entités).
 */
function findJsonLdProducts(data: unknown): Record<string, unknown>[] {
  const products: Record<string, unknown>[] = []

  function walk(obj: unknown) {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item)
      return
    }
    const rec = obj as Record<string, unknown>
    const type = String(rec['@type'] || '').toLowerCase()
    if (type === 'product' || type === 'individualproduct' || type === 'productmodel') {
      products.push(rec)
    }
    // @graph contient un tableau d'entités
    if (Array.isArray(rec['@graph'])) {
      for (const item of rec['@graph']) walk(item)
    }
  }

  walk(data)
  return products
}

/**
 * Recherche récursive d'un objet contenant des données produit
 * dans un arbre JSON arbitraire. Cherche des clés comme "product",
 * "productDetail", "item", etc. et retourne le sous-objet le plus pertinent.
 */
function findProductInObject(obj: unknown, depth = 0): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object' || depth > 5) return null
  if (Array.isArray(obj)) return null

  const rec = obj as Record<string, unknown>

  // Score l'objet courant : plus il a de clés produit, plus il est pertinent
  const productKeys = ['name', 'title', 'description', 'specifications', 'features',
    'productFeatures', 'variants', 'sku', 'price', 'images', 'brand']
  const matchCount = productKeys.filter(k => k in rec).length

  if (matchCount >= 3) return rec

  // Chercher dans les sous-clés qui ressemblent à "product"
  const priorityKeys = ['product', 'productDetail', 'productData', 'item', 'data',
    'pageData', 'initialData', 'props', 'state']
  for (const key of priorityKeys) {
    if (rec[key] && typeof rec[key] === 'object' && !Array.isArray(rec[key])) {
      const found = findProductInObject(rec[key], depth + 1)
      if (found) return found
    }
  }

  // Fallback : explorer toutes les clés
  for (const [key, val] of Object.entries(rec)) {
    if (priorityKeys.includes(key)) continue // Déjà testé
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = findProductInObject(val, depth + 1)
      if (found) return found
    }
  }

  return null
}

// ── Scraping via API interne des marques (passé par Firecrawl pour bypass CORS)

/**
 * APIs internes connues des sites de marques.
 * Pour chaque marque, on connaît le pattern d'URL de l'API qui retourne
 * les specs produit en JSON structuré — beaucoup plus fiable que le scraping HTML.
 */
interface BrandApiConfig {
  /** Construit les URLs d'API à tester à partir du slug produit */
  buildApiUrls: (slug: string, origin: string) => { label: string; url: string }[]
  /** Extrait le slug produit depuis l'URL de la page */
  extractSlug: (pageUrl: string) => string | null
}

/** Résultat structuré d'un appel aux APIs internes d'une marque */
interface BrandApiResult {
  /** Texte combiné pour debug / fallback LLM */
  combinedText: string
  /** Sections individuelles avec leur contenu brut (potentiellement JSON) */
  sections: { label: string; raw: string; parsed: unknown }[]
}

const BRAND_API_CONFIGS: Record<string, BrandApiConfig> = {
  milwaukeetool: {
    extractSlug: (url) => {
      // https://fr.milwaukeetool.eu/fr-fr/perceuse-a-percussion-m18-fuel/m18-fpd3/
      // On veut le dernier segment non-vide du path (après split et filtre)
      try {
        const pathname = new URL(url).pathname
        const segments = pathname.split('/').filter(Boolean)
        // Dernier segment = slug produit (ex: "m18-fpd3")
        const slug = segments[segments.length - 1]
        console.log('[brand-api] extractSlug:', url, '→ segments:', segments, '→ slug:', slug)
        return slug ?? null
      } catch {
        return null
      }
    },
    buildApiUrls: (_slug, origin) => {
      // Les vrais endpoints Milwaukee utilisent modelAgilityId + variantAgilityId.
      // On ne peut pas les construire depuis le slug seul — il faut d'abord
      // scraper la page HTML. On retourne un tableau vide ici ; la logique
      // spéciale Milwaukee est gérée dans scrapeMilwaukee() ci-dessous.
      void origin
      return []
    },
  },
}

// ── Milwaukee : scraping spécialisé via __REDUX_STORE + API interne ────────

interface MilwaukeeIds {
  modelAgilityId: number
  variantAgilityId: number
  cultureCode: string
}

/**
 * Extrait les IDs Agility Milwaukee depuis le HTML de la page (scrape Firecrawl).
 * Cherche dans window.Relay / window.__REDUX_STORE (sérialisé dans <script>)
 * et dans les <input type="hidden">.
 */
function extractMilwaukeeIds(html: string): MilwaukeeIds | null {
  let modelAgilityId: number | null = null
  let variantAgilityId: number | null = null

  // 1. Chercher dans les props Relay sérialisées (ProductToolOverview ou ProductDetails)
  //    Pattern: "modelAgilityId":542654 et "initialVariantAgilityId":542661
  const modelMatch = html.match(/"modelAgilityId"\s*:\s*(\d+)/)
  const variantMatch = html.match(/"(?:initialVariantAgilityId|selectedVariantAgilityId)"\s*:\s*(\d+)/)

  if (modelMatch) modelAgilityId = parseInt(modelMatch[1], 10)
  if (variantMatch) variantAgilityId = parseInt(variantMatch[1], 10)

  // 2. Fallback : chercher dans les champs hidden du formulaire ASP.NET
  //    <input name="hdnNodeId" value="304458">
  if (!modelAgilityId) {
    const nodeIdMatch = html.match(/name=["']hdnNodeId["'][^>]*value=["'](\d+)["']/)
    if (nodeIdMatch) {
      console.log('[milwaukee] found nodeId from hidden input:', nodeIdMatch[1])
    }
  }

  if (!modelAgilityId || !variantAgilityId) {
    console.warn('[milwaukee] could not extract IDs from page HTML — model:', modelAgilityId, 'variant:', variantAgilityId)
    return null
  }

  // Culture code depuis l'URL ou le HTML
  const cultureMatch = html.match(/name=["'](?:lng|hdnCulture)["'][^>]*value=["']([a-z]{2}-[A-Z]{2})["']/)
  const cultureCode = cultureMatch ? cultureMatch[1] : 'fr-FR'

  console.log('[milwaukee] extracted IDs:', { modelAgilityId, variantAgilityId, cultureCode })
  return { modelAgilityId, variantAgilityId, cultureCode }
}

/**
 * Scrape complet Milwaukee : appels API directs (CORS ouvert) + fetch page HTML.
 *
 * Milwaukee expose des API JSON avec `Access-Control-Allow-Origin: *` :
 *   - /api/product-detail/product-specifications → toutes les specs (29+)
 *   - /api/product-detail/product-downloads      → tous les PDFs (7)
 *   - /api/product-detail/product-assets          → toutes les images
 *   - /api/product-detail/whats-included          → contenu du kit
 *
 * Les features et la description ne sont PAS dans l'API — elles sont dans
 * le script Relay de la page HTML (également fetchable directement, CORS ouvert).
 *
 * → Zéro Firecrawl nécessaire pour Milwaukee.
 */
async function scrapeMilwaukee(productUrl: string): Promise<BrandApiResult | null> {
  // ── Étape 1 : fetch la page HTML directement (CORS ouvert) pour Relay data ──
  console.log('[milwaukee] fetching page HTML directly (no Firecrawl) …')
  let pageHtml = ''
  try {
    const pageRes = await fetch(productUrl)
    if (pageRes.ok) {
      pageHtml = await pageRes.text()
      console.log('[milwaukee] got', pageHtml.length, 'chars of HTML')
    }
  } catch (err) {
    console.warn('[milwaukee] direct fetch failed:', err)
  }
  if (pageHtml.length < 500) {
    console.warn('[milwaukee] page HTML too short or failed:', pageHtml.length)
    return null
  }

  // ── Extraire les IDs pour les appels API ──
  const ids = extractMilwaukeeIds(pageHtml)
  if (!ids) {
    console.warn('[milwaukee] could not extract IDs from page HTML')
    return null
  }

  // Déterminer l'origine réelle (www redirige → fr/de/etc.)
  const resolvedOrigin = (() => {
    try {
      const canonMatch = pageHtml.match(/rel="canonical"[^>]*href="(https?:\/\/[^"]+)"/i)
        || pageHtml.match(/href="(https?:\/\/[^"]*milwaukeetool[^"]*)"[^>]*rel="canonical"/i)
      if (canonMatch) return new URL(canonMatch[1]).origin
    } catch { /* ignore */ }
    return new URL(productUrl).origin
  })()

  // CultureCode depuis l'URL (/fr-fr/, /de-de/, etc.)
  const cultureFromUrl = productUrl.match(/\/([a-z]{2}-[a-z]{2})\//i)
  const cultureCode = ids.cultureCode
    || (cultureFromUrl ? cultureFromUrl[1].replace(/^(..)-(..)/,
      (_, a: string, b: string) => `${a.toLowerCase()}-${b.toUpperCase()}`) : 'fr-FR')

  const apiBase = `${resolvedOrigin}/api/product-detail`
  const apiParams = `modelAgilityId=${ids.modelAgilityId}&variantAgilityId=${ids.variantAgilityId}&cultureCode=${cultureCode}&published=true`

  // ── Helper pour les appels API Milwaukee ──
  async function milwaukeeApi<T>(endpoint: string): Promise<T | null> {
    const url = `${apiBase}/${endpoint}?${apiParams}`
    try {
      console.log(`[milwaukee] API → ${endpoint}`)
      const res = await fetch(url)
      if (!res.ok) { console.warn(`[milwaukee] ${endpoint} → HTTP ${res.status}`); return null }
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('json')) { console.warn(`[milwaukee] ${endpoint} → not JSON: ${ct}`); return null }
      return await res.json() as T
    } catch (err) {
      console.warn(`[milwaukee] ${endpoint} failed:`, err)
      return null
    }
  }

  const sections: BrandApiResult['sections'] = []
  const textParts: string[] = []

  // ── Lancer les appels API en parallèle ──
  const [specsData, downloadsData, assetsData, includedData] = await Promise.all([
    milwaukeeApi<Array<{ setId: number; title: string; specifications: Array<{ title: string; value: string }> }>>('product-specifications'),
    milwaukeeApi<Array<{ title: string; url: string; modelNumber?: string }>>('product-downloads'),
    milwaukeeApi<{ hero?: Array<{ imageUrl: string }>; feature?: Array<{ imageUrl: string }>; app?: Array<{ imageUrl: string }> }>('product-assets'),
    milwaukeeApi<Array<{ title: string; quantity: number; modelCode?: string }>>('whats-included'),
  ])

  // ── 1. Features + Description + Product-info depuis le script Relay ──
  // Le HTML brut contient des guillemets échappés dans les props Relay.
  // Les données peuvent être à n'importe quel niveau de profondeur dans les props
  // (ex: props.productFeatures OU props.reduxContext.productDetail.productFeatures).
  // On cherche récursivement.
  const relayScriptMatch = pageHtml.match(/<script[^>]*id=["']relay["'][^>]*>([\s\S]*?)<\/script>/i)
  if (relayScriptMatch) {
    try {
      const scriptContent = relayScriptMatch[1].trim()
      const jsonStr = scriptContent.replace(/^window\.Relay\s*=\s*/, '').replace(/;\s*$/, '')
      const relay = JSON.parse(jsonStr) as { components?: Array<{ name: string; props: string }> }

      // Recherche récursive d'une clé dans un objet (profondeur max 6)
      const findInRelay = (obj: unknown, key: string, depth = 0): unknown | undefined => {
        if (depth > 6 || obj == null || typeof obj !== 'object') return undefined
        const rec = obj as Record<string, unknown>
        if (key in rec) return rec[key]
        for (const v of Object.values(rec)) {
          if (v && typeof v === 'object') {
            const found = findInRelay(v, key, depth + 1)
            if (found !== undefined) return found
          }
        }
        return undefined
      }

      for (const comp of relay.components ?? []) {
        if (!comp.props || typeof comp.props !== 'string') continue
        let props: Record<string, unknown>
        try { props = JSON.parse(comp.props) } catch { continue }

        console.log('[milwaukee] Relay component:', comp.name, '— top keys:', Object.keys(props).slice(0, 10).join(', '))

        // Features — chercher productFeatures récursivement
        if (!sections.some(s => s.label === 'features')) {
          const rawFeatures = findInRelay(props, 'productFeatures')
          if (Array.isArray(rawFeatures) && rawFeatures.length > 0) {
            const features = (rawFeatures as string[]).filter(s => typeof s === 'string' && s.trim())
            if (features.length > 0) {
              sections.push({ label: 'features', raw: JSON.stringify(features), parsed: features })
              textParts.push(`=== features ===\n${JSON.stringify(features)}`)
              console.log('[milwaukee] ✓ features:', features.length, 'items from', comp.name)
            }
          }
        }

        // Description — chercher metaDescription récursivement
        if (!sections.some(s => s.label === 'overview')) {
          const desc = findInRelay(props, 'metaDescription')
          if (typeof desc === 'string' && desc.length > 20) {
            sections.push({ label: 'overview', raw: desc, parsed: { description: desc } })
            textParts.push(`=== overview ===\n${desc}`)
            console.log('[milwaukee] ✓ description:', desc.length, 'chars from', comp.name)
          }
        }

        // Product info — chercher modelCode récursivement
        if (!sections.some(s => s.label === 'product-info')) {
          const modelCode = findInRelay(props, 'modelCode')
          if (typeof modelCode === 'string' && modelCode.length > 0) {
            const info: Record<string, string> = { modelCode }
            const articleNumber = findInRelay(props, 'articleNumber')
            if (typeof articleNumber === 'string') info.articleNumber = articleNumber
            const system = findInRelay(props, 'system')
            if (typeof system === 'string') info.system = system
            const title = findInRelay(props, 'title')
            if (typeof title === 'string' && title.length > 3 && title.length < 80) {
              info.title = title
            }
            sections.push({ label: 'product-info', raw: JSON.stringify(info), parsed: info })
            textParts.push(`=== product-info ===\n${JSON.stringify(info)}`)
            console.log('[milwaukee] ✓ product info:', Object.keys(info), 'from', comp.name)
          }
        }
      }
    } catch (err) {
      console.warn('[milwaukee] Relay script parse failed:', err)
    }
  }

  // ── 2. Spécifications via API ──
  if (specsData && specsData.length > 0) {
    sections.push({ label: 'specifications', raw: JSON.stringify(specsData), parsed: specsData })
    textParts.push(`=== specifications ===\n${JSON.stringify(specsData)}`)
    const totalSpecs = specsData.reduce((n, s) => n + (s.specifications?.length ?? 0), 0)
    console.log('[milwaukee] ✓ specs:', specsData.length, 'sections,', totalSpecs, 'total')
  }

  // ── 3. Downloads via API — encoder comme "titre##url" pour conserver les noms ──
  if (downloadsData && downloadsData.length > 0) {
    const downloadItems = downloadsData.filter(d => d.url).map(d => ({ title: d.title || 'Document', url: d.url, modelNumber: d.modelNumber }))
    if (downloadItems.length > 0) {
      // Format "titre##url" pour que l'UI puisse afficher le bon nom
      const encodedUrls = downloadItems.map(d => `${d.title}##${d.url}`)
      sections.push({ label: 'downloads', raw: JSON.stringify(downloadItems), parsed: encodedUrls })
      textParts.push(`=== downloads ===\n${downloadItems.map(d => `${d.title}: ${d.url}`).join('\n')}`)
      console.log('[milwaukee] ✓ downloads:', downloadItems.length, 'documents')
    }
  }

  // ── 4. Images via API — seulement les images hero (produit entier) ──
  if (assetsData) {
    const imageUrls: string[] = []
    // Hero = photos produit principales (ce qu'on veut pour un catalogue)
    if (Array.isArray(assetsData.hero)) {
      for (const img of assetsData.hero) {
        if (img.imageUrl && !imageUrls.includes(img.imageUrl)) imageUrls.push(img.imageUrl)
      }
    }
    // App = photos d'application/mise en situation (utiles aussi)
    if (Array.isArray(assetsData.app)) {
      for (const img of assetsData.app) {
        if (img.imageUrl && !imageUrls.includes(img.imageUrl)) imageUrls.push(img.imageUrl)
      }
    }
    // PAS les feature (close-ups détails) — trop zoomées pour un catalogue
    if (imageUrls.length > 0) {
      sections.push({ label: 'images', raw: JSON.stringify(imageUrls), parsed: imageUrls })
      textParts.push(`=== images ===\n${JSON.stringify(imageUrls)}`)
      console.log('[milwaukee] ✓ images:', imageUrls.length, '(hero + app, sans feature close-ups)')
    }
  }

  // ── 5. Contenu du kit via API ──
  if (includedData && includedData.length > 0) {
    sections.push({ label: 'whats-included', raw: JSON.stringify(includedData), parsed: includedData })
    const summary = includedData.map(i => `${i.quantity}x ${i.title}`).join(', ')
    textParts.push(`=== whats-included ===\n${summary}`)
    console.log('[milwaukee] ✓ whats-included:', includedData.length, 'items')
  }

  if (sections.length === 0) return null
  const combinedText = textParts.join('\n\n')
  console.log('[milwaukee] ✓ TOTAL:', sections.length, 'sections →', combinedText.length, 'chars (0 Firecrawl calls)')
  return { combinedText, sections }
}

function findBrandApiConfig(hostname: string): { key: string; config: BrandApiConfig } | null {
  for (const [key, config] of Object.entries(BRAND_API_CONFIGS)) {
    if (hostname.includes(key)) return { key, config }
  }
  return null
}

/**
 * Fetch un endpoint API via Firecrawl (bypass CORS).
 * Firecrawl scrape l'URL et retourne le markdown — pour une API JSON,
 * le "markdown" sera le JSON brut en texte.
 */
async function firecrawlFetchRaw(url: string): Promise<string | null> {
  const apiKey = getApiKey('firecrawl')
  if (!apiKey) return null

  console.log('[brand-api] fetching via Firecrawl →', url)
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['rawHtml', 'markdown'],
      onlyMainContent: false,
      waitFor: 2000,
    }),
  })
  if (!res.ok) {
    console.warn('[brand-api] Firecrawl returned', res.status)
    return null
  }
  const json = (await res.json()) as { success?: boolean; data?: { rawHtml?: string; markdown?: string; html?: string } }

  // Pour les endpoints API JSON : le navigateur rend le JSON dans <pre> tags.
  // rawHtml contient le HTML brut → on extrait le JSON pur.
  const rawHtml = json.data?.rawHtml || ''
  if (rawHtml) {
    // 1. Extraire depuis <pre> (format navigateur standard pour JSON)
    const preMatch = rawHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
    if (preMatch) {
      const stripped = preMatch[1].replace(/<[^>]+>/g, '').trim()
      try {
        JSON.parse(stripped)
        console.log('[brand-api] ✓ extracted JSON from <pre> tag:', stripped.length, 'chars')
        return stripped
      } catch { /* not JSON in pre */ }
    }
    // 2. Stripper TOUT le HTML et tester si c'est du JSON brut
    const stripped = rawHtml.replace(/<[^>]+>/g, '').trim()
    if (stripped.length > 10 && (stripped.startsWith('[') || stripped.startsWith('{'))) {
      try {
        JSON.parse(stripped)
        console.log('[brand-api] ✓ extracted JSON from raw HTML:', stripped.length, 'chars')
        return stripped
      } catch { /* not pure JSON */ }
    }
  }

  // Fallback : markdown (pour les pages non-JSON)
  const content = json.data?.markdown || json.data?.html || ''
  if (content.length < 10) return null
  console.log('[brand-api] got markdown/html:', content.length, 'chars')
  return content
}

/**
 * Scrape les données d'un produit via les APIs internes connues de la marque.
 * Utilise Firecrawl comme proxy HTTP pour bypass CORS.
 * Retourne les sections individuelles parsées + le texte combiné.
 */
async function scrapeBrandApis(productUrl: string): Promise<BrandApiResult | null> {
  const parsed = new URL(productUrl)
  const hostname = parsed.hostname.toLowerCase()

  // ── Milwaukee : logique spécialisée (IDs Agility depuis la page) ──
  if (hostname.includes('milwaukeetool')) {
    return scrapeMilwaukee(productUrl)
  }

  // ── Autres marques : logique générique slug-based ──
  const brandApi = findBrandApiConfig(hostname)
  if (!brandApi) return null

  const slug = brandApi.config.extractSlug(productUrl)
  if (!slug) {
    console.warn('[brand-api] could not extract slug from', productUrl)
    return null
  }

  const origin = parsed.origin
  const apiEndpoints = brandApi.config.buildApiUrls(slug, origin)
  console.log('[brand-api] slug:', slug, '→', apiEndpoints.length, 'API endpoints to try')

  const sections: BrandApiResult['sections'] = []
  const textParts: string[] = []

  for (const { label, url } of apiEndpoints) {
    try {
      const content = await firecrawlFetchRaw(url)
      if (content && content.length > 20) {
        const isHtmlPage = content.length > 5000
          && (/^#\s|^\*\*|^\[.*\]\(|^!\[/m.test(content) || /<html|<body|<!DOCTYPE/i.test(content))
        if (isHtmlPage) {
          console.warn('[brand-api] endpoint returned HTML page, not JSON:', label, content.length, 'chars → skipping')
          continue
        }

        let parsedJson: unknown = null
        try {
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
          const rawJson = jsonMatch ? jsonMatch[1].trim() : content.trim()
          parsedJson = JSON.parse(rawJson)
        } catch {
          // Pas du JSON pur — on garde le texte brut
        }
        sections.push({ label, raw: content, parsed: parsedJson })
        textParts.push(`=== ${label} ===\n${content}`)
      }
    } catch (err) {
      console.warn('[brand-api] endpoint failed:', url, err)
    }
  }

  if (sections.length === 0) return null
  const combinedText = textParts.join('\n\n')
  console.log('[brand-api] ✓', sections.length, 'API responses →', combinedText.length, 'chars')
  console.log('[brand-api] parsed sections:', sections.map(s => ({ label: s.label, hasParsed: !!s.parsed, rawLen: s.raw.length })))
  return { combinedText, sections }
}

// ── Construction directe de EnrichedProduct depuis les APIs marque ──────────

/**
 * Extrait les specs depuis un objet/tableau JSON d'API marque.
 * Gère les formats courants : tableau d'objets, objet clé→valeur,
 * objet avec sections/groupes imbriqués.
 */
function extractSpecsFromJson(data: unknown): Array<{ name: string; value: string; group?: string }> {
  const specs: Array<{ name: string; value: string; group?: string }> = []

  function walk(obj: unknown, group?: string) {
    if (!obj || typeof obj !== 'object') return

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (!item || typeof item !== 'object') continue
        const rec = item as Record<string, unknown>

        // Format {name/label/title/key, value} — très courant
        // Note : rec.key est souvent un index numérique (ex: 0), pas un nom → on le prend seulement s'il est string
        const nameKey = rec.name ?? rec.label ?? rec.title ?? (typeof rec.key === 'string' ? rec.key : undefined) ?? rec.attributeName
        const valKey = rec.value ?? rec.values ?? rec.attributeValue ?? rec.text
        if (nameKey && valKey != null) {
          const n = String(nameKey).trim()
          const v = Array.isArray(valKey) ? valKey.join(', ') : String(valKey).trim()
          if (n) specs.push({ name: n, value: v, group })
          continue
        }

        // Format groupe : {groupName/sectionTitle/title, items/specifications/attributes: [...]}
        // On n'arrive ici que si valKey était null → title sert de groupName, pas de conflit.
        const groupName = rec.groupName ?? rec.sectionTitle ?? rec.sectionName ?? rec.category ?? rec.header ?? rec.title
        const items = rec.items ?? rec.specifications ?? rec.attributes ?? rec.values ?? rec.specs
        if (groupName && Array.isArray(items)) {
          walk(items, String(groupName).trim())
          continue
        }

        // Objet plat → chaque paire clé/valeur est une spec
        for (const [k, v] of Object.entries(rec)) {
          if (typeof v === 'string' || typeof v === 'number') {
            specs.push({ name: k, value: String(v), group })
          }
        }
      }
      return
    }

    // Objet unique (pas tableau)
    const rec = obj as Record<string, unknown>
    // Peut contenir un sous-tableau "data", "results", "specifications", etc.
    for (const key of ['data', 'results', 'specifications', 'specs', 'attributes', 'items', 'sections', 'groups']) {
      if (Array.isArray(rec[key])) {
        walk(rec[key], group)
        return
      }
    }
    // Objet plat → chaque paire clé/valeur
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v === 'string' || typeof v === 'number') {
        specs.push({ name: k, value: String(v), group })
      } else if (typeof v === 'object') {
        walk(v, k)
      }
    }
  }

  walk(data)
  return specs.filter(s => s.name && s.value)
}

/**
 * Extrait les avantages/features depuis un objet JSON d'API marque.
 */
function extractFeaturesFromJson(data: unknown): Array<{ text: string; group?: string }> {
  const features: Array<{ text: string; group?: string }> = []

  function walk(obj: unknown, group?: string) {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'string' && item.trim()) {
          features.push({ text: item.trim(), group })
        } else if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>

          // Format groupé : {groupName/sectionTitle, items/features: [...]}
          const grpName = rec.groupName ?? rec.sectionTitle ?? rec.sectionName ?? rec.category ?? rec.header
          const items = rec.items ?? rec.features ?? rec.benefits ?? rec.list
          if (grpName && Array.isArray(items)) {
            walk(items, String(grpName).trim())
            continue
          }

          // Format {title, description/text/body}
          const title = rec.title ?? rec.name ?? rec.heading
          const desc = rec.description ?? rec.text ?? rec.body ?? rec.content ?? rec.summary
          if (title && desc) {
            features.push({ text: `${String(title).trim()} : ${String(desc).trim()}`, group })
          } else if (title) {
            features.push({ text: String(title).trim(), group })
          } else if (desc) {
            features.push({ text: String(desc).trim(), group })
          }
        }
      }
      return
    }
    // Objet avec sous-tableau
    const rec = obj as Record<string, unknown>
    for (const key of ['data', 'results', 'features', 'items', 'list', 'benefits']) {
      if (Array.isArray(rec[key])) { walk(rec[key], group); return }
    }
  }

  walk(data)
  return features.filter(f => f.text)
}

/**
 * Extrait la description overview depuis un objet JSON d'API marque.
 */
function extractOverviewFromJson(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const rec = data as Record<string, unknown>
  // Chercher dans les clés classiques
  for (const key of ['data', 'result', 'content']) {
    if (rec[key] && typeof rec[key] === 'object') {
      return extractOverviewFromJson(rec[key])
    }
  }
  // Texte direct
  for (const key of ['description', 'overview', 'body', 'content', 'text', 'summary', 'html']) {
    if (typeof rec[key] === 'string' && rec[key]) {
      // Nettoyer le HTML basique si présent
      return String(rec[key]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
  }
  return ''
}

/**
 * Extrait les URLs de documents (PDF) depuis un objet JSON d'API marque.
 */
function extractDocumentsFromJson(data: unknown): string[] {
  const docs: string[] = []

  function walk(obj: unknown) {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'string' && /^https?:\/\//.test(item)) {
          // Accepter les URLs de documents (pas seulement .pdf)
          if (/\.(pdf|doc[x]?|xls[x]?|ppt[x]?|zip)/i.test(item)
            || /\/download|\/document|\/media|\/file/i.test(item)) {
            docs.push(item)
          }
        } else if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>
          const url = rec.url ?? rec.href ?? rec.downloadUrl ?? rec.fileUrl ?? rec.link ?? rec.path ?? rec.documentUrl
          if (typeof url === 'string' && /^https?:\/\//.test(url)) {
            docs.push(url)
          }
          // Milwaukee format: {title, documentGuid, ...} sans URL directe
          // Construire l'URL de téléchargement depuis le GUID
          const guid = rec.documentGuid ?? rec.guid ?? rec.id
          if (typeof guid === 'string' && /^[0-9a-f]{8}-/.test(guid) && guid !== '00000000-0000-0000-0000-000000000000') {
            const title = rec.title ?? rec.name ?? rec.label ?? ''
            const titleStr = typeof title === 'string' ? title : ''
            // Stocker comme URL descriptive pour affichage
            docs.push(`document:${guid}:${titleStr}`)
          }
          // Fouiller plus profond
          walk(item)
        }
      }
      return
    }
    const rec = obj as Record<string, unknown>
    // Sous-tableaux de données
    for (const key of ['data', 'results', 'downloads', 'documents', 'files', 'items', 'sections', 'categories']) {
      if (Array.isArray(rec[key])) { walk(rec[key]); return }
    }
    // URL directe dans les propriétés
    for (const [, v] of Object.entries(rec)) {
      if (typeof v === 'string' && /^https?:\/\//.test(v)) {
        if (/\.(pdf|doc[x]?|xls[x]?|ppt[x]?|zip)/i.test(v)
          || /\/download|\/document|\/media|\/file/i.test(v)) {
          docs.push(v)
        }
      } else if (typeof v === 'object') {
        walk(v)
      }
    }
  }

  walk(data)
  return [...new Set(docs)]
}

// ── Parsing markdown robuste ────────────────────────────────────────────────

/**
 * Extrait les spécifications techniques depuis un markdown de page produit.
 * Gère de multiples formats :
 * - Tableaux markdown : | Nom | Valeur |
 * - Clé : valeur sur une ligne
 * - **Clé** Valeur
 * - Sections à deux colonnes (texte gras suivi de texte normal)
 * - Listes de définition
 */
function parseSpecsFromMarkdown(md: string): Array<{ name: string; value: string; group?: string }> {
  const specs: Array<{ name: string; value: string; group?: string }> = []
  const seen = new Set<string>()

  function add(name: string, value: string, group?: string) {
    const n = name.trim()
    const v = value.trim()
    const key = `${n.toLowerCase()}::${v.toLowerCase()}`
    if (n && v && !seen.has(key)) {
      seen.add(key)
      specs.push({ name: n, value: v, group: group || undefined })
    }
  }

  const lines = md.split('\n')

  // On cherche les sections de spécifications — souvent sous un heading
  // comme "Spécifications", "Caractéristiques techniques", "Données techniques"
  const specSectionRe = /^#{1,4}\s*(sp[eé]cifications?|caract[eé]ristiques?\s*(?:techniques?)?|donn[eé]es\s*techniques?|informations?\s*(?:techniques?)?|fiche\s*technique|d[eé]tails?\s*techniques?|poids|puissance|d[eé]cibels?|vibrations?|dimensions?|batterie|general|g[eé]n[eé]ral)/i
  let inSpecSection = false
  let currentGroup = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Détection de section specs
    if (specSectionRe.test(trimmed)) {
      inSpecSection = true
      const heading = trimmed.replace(/^#{1,4}\s+/, '').trim()
      currentGroup = heading
      continue
    }
    // Sous-section dans les specs (ex: ## Informations, ## Poids, ## Puissance)
    const subHeading = trimmed.match(/^#{2,5}\s+(.+)/)
    if (subHeading) {
      if (inSpecSection) {
        currentGroup = subHeading[1].trim()
      }
      // Si on quitte la section specs vers une autre section majeure
      if (inSpecSection && /^#{1,2}\s/.test(trimmed) && !specSectionRe.test(trimmed)) {
        const heading = subHeading[1].toLowerCase()
        const isSpecGroup = /(information|poids|puissance|d[eé]cibels?|vibration|dimension|batterie|per[çc]age|vissage|couple|vitesse|mandrin|capacit|g[eé]n[eé]ral|technique|sp[eé]cification|emballage|inclus|livr[eé]|tension|autonomie|charge|bruit|acoustique)/i.test(heading)
        if (!isSpecGroup && /^#{1,2}\s/.test(trimmed)) {
          inSpecSection = false
          currentGroup = ''
        }
      }
      continue
    }

    // Format 1 : Tableau markdown — | Nom | Valeur |
    const tableMatch = trimmed.match(/^\|?\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|?\s*$/)
    if (tableMatch) {
      const n = tableMatch[1].replace(/\*\*/g, '').trim()
      const v = tableMatch[2].replace(/\*\*/g, '').trim()
      if (n && v && !/^[-:]+$/.test(n) && !/^[-:]+$/.test(v)) {
        const nLc = n.toLowerCase()
        if (nLc !== 'nom' && nLc !== 'name' && nLc !== 'caractéristique' && nLc !== 'specification') {
          add(n, v, currentGroup)
        }
      }
      continue
    }

    // Format 2 : **Clé** Valeur  ou  **Clé** : Valeur
    const boldKeyMatch = trimmed.match(/^\*\*(.+?)\*\*\s*:?\s*(.+)/)
    if (boldKeyMatch) {
      const n = boldKeyMatch[1].trim()
      const v = boldKeyMatch[2].trim()
      if (v && v.length < 200 && !v.startsWith('http') && n.length < 60) {
        add(n, v, currentGroup)
        continue
      }
    }

    // Format 3 : Clé : Valeur (sans markdown bold)
    if (inSpecSection) {
      const kvMatch = trimmed.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
      if (kvMatch) {
        const n = kvMatch[1].replace(/\*\*/g, '').trim()
        const v = kvMatch[2].replace(/\*\*/g, '').trim()
        if (n && v && !/^https?:/.test(n)) {
          add(n, v, currentGroup)
          continue
        }
      }
    }

    // Format 4 : Lignes consécutives "Nom" puis "Valeur"
    if (inSpecSection && trimmed.length > 2 && trimmed.length < 60
        && !trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('[')
        && !trimmed.startsWith('#') && !trimmed.startsWith('|') && !trimmed.startsWith('http')
        && !/^[-:=]+$/.test(trimmed)) {
      const nextLine = (lines[i + 1] ?? '').trim()
      if (nextLine && nextLine.length > 0 && nextLine.length < 100
          && !nextLine.startsWith('#') && !nextLine.startsWith('-') && !nextLine.startsWith('*')
          && !nextLine.startsWith('[') && !nextLine.startsWith('|') && !nextLine.startsWith('http')) {
        const looksLikeValue = /\d/.test(nextLine) || nextLine.length < 30 || /\b(mm|cm|kg|nm|rpm|v|ah|w|hz|db|°|%)\b/i.test(nextLine)
        if (looksLikeValue) {
          add(trimmed, nextLine, currentGroup)
          i++
          continue
        }
      }
    }
  }

  // Si on n'a rien trouvé dans une section explicite, fallback global
  if (specs.length === 0) {
    const globalBoldKv = [...md.matchAll(/\*\*([^*]{2,50})\*\*\s*:?\s*([^\n*]{2,150})/g)]
    for (const m of globalBoldKv) {
      const n = m[1].trim()
      const v = m[2].trim()
      if (n && v && !v.startsWith('http') && !/^(voir|en savoir|d[eé]couvr)/i.test(v)) {
        add(n, v)
      }
    }
  }

  return specs
}

/**
 * Extrait la description principale depuis un markdown de page produit.
 * Cherche le premier paragraphe substantiel après le titre principal.
 */
function parseDescriptionFromMarkdown(md: string): string {
  const lines = md.split('\n')
  let afterTitle = false
  const descParts: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Titre principal H1
    if (/^#\s/.test(trimmed)) {
      afterTitle = true
      continue
    }
    if (!afterTitle) continue

    // Arrêter à la prochaine section
    if (/^#{2,}\s/.test(trimmed)) break
    // Arrêter aux listes à puces (features) — même si descParts est vide
    if (/^[-*•]\s/.test(trimmed)) break

    // Ignorer les lignes vides, liens seuls, images
    if (!trimmed || /^\[.*\]\(.*\)$/.test(trimmed) || /^!\[/.test(trimmed)) continue
    // Ignorer les lignes de navigation ou les courts textes qui sont des labels
    if (trimmed.length < 30) continue
    // Ignorer les lignes qui ressemblent à des features (commencent par un verbe/adjectif d'action)
    if (/^(rendement|design|nouveau|perçage|led |clip |indicateur|la gestion|l'adn|système)/i.test(trimmed)) continue

    // Ne garder que les vrais paragraphes descriptifs (> 80 chars, pas de bold-only)
    const cleanedLine = trimmed.replace(/\*\*/g, '').trim()
    if (cleanedLine.length > 80) {
      descParts.push(cleanedLine)
    }
    // Prendre max 3 paragraphes
    if (descParts.length >= 3) break
  }

  return descParts.join(' ').trim()
}

/**
 * Extrait les variantes produit depuis un tableau markdown.
 * Cherche les sections "Références", "Variantes", "Déclinaisons" ou les tableaux
 * avec des colonnes Réf/Libellé/Couleur etc.
 */
function parseVariantsFromMarkdown(md: string): Array<{ reference: string; label: string; properties: Record<string, string> }> {
  const variants: Array<{ reference: string; label: string; properties: Record<string, string> }> = []

  // Chercher les tableaux markdown (| col | col | ... |)
  const lines = md.split('\n')
  let headers: string[] = []
  let inTable = false
  let refIdx = -1
  let labelIdx = -1

  for (const line of lines) {
    const trimmed = line.trim()

    // Détecter un header de tableau
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && !inTable) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean)
      // Vérifier si c'est un header de variantes (contient "Réf" ou "Référence")
      const refCol = cells.findIndex(c => /^r[eé]f/i.test(c) || /^code/i.test(c) || /^sku/i.test(c) || /^article/i.test(c))
      if (refCol >= 0) {
        headers = cells
        refIdx = refCol
        labelIdx = cells.findIndex(c => /^(libell[eé]|d[eé]signation|description|nom|produit)/i.test(c))
        inTable = true
        continue
      }
    }

    // Ligne de séparation du tableau (| --- | --- |)
    if (inTable && /^\|[\s-:|]+\|$/.test(trimmed)) continue

    // Lignes de données du tableau
    if (inTable && trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').map(c => c.replace(/\*\*/g, '').trim()).filter(Boolean)
      if (cells.length >= headers.length - 1 && refIdx < cells.length) {
        const ref = cells[refIdx]
        if (!ref || /^[-:]+$/.test(ref)) continue // separator row
        const label = labelIdx >= 0 && labelIdx < cells.length ? cells[labelIdx] : ''
        const properties: Record<string, string> = {}
        headers.forEach((h, idx) => {
          if (idx !== refIdx && idx !== labelIdx && idx < cells.length && cells[idx]) {
            properties[h] = cells[idx]
          }
        })
        variants.push({ reference: ref, label, properties })
      }
      continue
    }

    // Fin de tableau
    if (inTable && !trimmed.startsWith('|')) {
      inTable = false
      headers = []
    }
  }

  // Fallback : chercher des patterns de référence dans des listes ou blocs structurés
  // ex: "> DR100CH - 1m caniv.100 hd prof.0 grille c250 heel - Noir"
  if (variants.length === 0) {
    const refLineRe = /^[>*-]?\s*\**([A-Z]{1,4}\d{2,6}[A-Z]{0,3})\**\s*[-–—]\s*(.+)/gm
    let match
    while ((match = refLineRe.exec(md)) !== null) {
      const ref = match[1].trim()
      const rest = match[2].trim()
      // Essayer de séparer label et propriétés (séparés par tirets ou virgules)
      const parts = rest.split(/\s*[-–—,]\s*/)
      const label = parts[0] || ''
      const properties: Record<string, string> = {}
      for (let i = 1; i < parts.length; i++) {
        if (parts[i]) {
          // Détecter couleur, conditionnement, etc.
          if (/^(noir|blanc|rouge|bleu|vert|gris|jaune)/i.test(parts[i])) {
            properties['Couleur'] = parts[i]
          } else if (/^P\s*-\s*\d+$/i.test(parts[i])) {
            properties['Cond.'] = parts[i]
          } else {
            properties[`Col${i}`] = parts[i]
          }
        }
      }
      if (ref) variants.push({ reference: ref, label, properties })
    }
  }

  return variants
}

/**
 * Extrait les avantages/features depuis un markdown de page produit.
 * Gère les formats :
 *   - Headings : `## Les + Nicoll performance` / `### Caractéristiques`
 *   - Bold : `**Les + Nicoll performance**`
 *   - Texte simple suivi de bullets
 *   - Sections multiples (parcourt TOUT le markdown)
 */
function parseAdvantagesFromMarkdown(md: string): Array<{ text: string; group?: string }> {
  const advantages: Array<{ text: string; group?: string }> = []
  const seenTexts = new Set<string>()

  // Keywords qui identifient une section de features/avantages
  const featureKeywords = /(?:caract[eé]ristiques?|avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|les\s*\+|atouts?|plus\s+produit)/i

  // Extraire le nom du groupe depuis un titre
  const extractGroupName = (raw: string): string | undefined => {
    const cleaned = raw
      .replace(/\*\*/g, '')
      .replace(/^les\s*\+\s*/i, '')
      .replace(/^(caract[eé]ristiques?|avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?|plus\s+produit)\s*/i, '')
      .trim()
    return cleaned.length > 1 && cleaned.length < 80 ? cleaned : undefined
  }

  const addBullet = (text: string, group: string | undefined) => {
    const clean = text
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\\\\/g, '')
      .trim()
    if (clean.length > 10 && !clean.startsWith('http') && !/^\d+$/.test(clean) && !seenTexts.has(clean)) {
      seenTexts.add(clean)
      advantages.push({ text: clean, group })
    }
  }

  const lines = md.split('\n')
  let currentGroup: string | undefined
  let inFeatureZone = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue

    // ── Détecter les titres de section (headings ET bold) ──

    // Format heading : ## Les + Nicoll performance
    const headingMatch = trimmed.match(/^#{1,5}\s+(.+)$/)
    if (headingMatch) {
      const headingText = headingMatch[1].replace(/\*\*/g, '').trim()
      if (featureKeywords.test(headingText)) {
        inFeatureZone = true
        currentGroup = extractGroupName(headingText)
        console.log('[parse-advantages] heading group:', currentGroup ?? '(sans nom)', '→', trimmed.slice(0, 60))
        continue
      }
      // Heading non-feature de même niveau → fin de zone
      if (inFeatureZone) {
        // Ne quitter que si c'est un heading de même niveau ou supérieur (pas un sous-heading)
        const level = trimmed.match(/^(#{1,5})/)?.[1].length ?? 99
        if (level <= 2) {
          inFeatureZone = false
          currentGroup = undefined
        }
      }
      continue
    }

    // Format bold seul : **Les + Nicoll performance** (sans heading #)
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
    if (boldMatch && featureKeywords.test(boldMatch[1])) {
      inFeatureZone = true
      currentGroup = extractGroupName(boldMatch[1])
      console.log('[parse-advantages] bold group:', currentGroup ?? '(sans nom)', '→', trimmed.slice(0, 60))
      continue
    }

    // Format texte simple : "Les + Nicoll performance" (ni heading ni bold)
    // Détecté seulement si la ligne est courte et suivi d'un bullet
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('•')
        && featureKeywords.test(trimmed) && trimmed.length < 80) {
      const nextLine = (lines[i + 1] ?? '').trim()
      const isTitleBeforeBullets = /^[-*•·✓✔]\s+/.test(nextLine)
      if (isTitleBeforeBullets || inFeatureZone) {
        inFeatureZone = true
        currentGroup = extractGroupName(trimmed)
        console.log('[parse-advantages] text group:', currentGroup ?? '(sans nom)', '→', trimmed.slice(0, 60))
        continue
      }
    }

    if (!inFeatureZone) continue

    // ── Capturer les bullets ──
    const bulletMatch = trimmed.match(/^[-*•·✓✔]\s+(.+)/)
    if (bulletMatch) {
      addBullet(bulletMatch[1], currentGroup)
      continue
    }

    // Paragraphe de texte dans une zone feature (features sans bullet)
    if (trimmed.length > 20 && trimmed.length < 300
        && !trimmed.startsWith('|') && !trimmed.startsWith('http') && !trimmed.startsWith('[')
        && !trimmed.startsWith('#')) {
      addBullet(trimmed, currentGroup)
    }
  }

  console.log('[parse-advantages] total:', advantages.length, 'items,', advantages.filter(a => a.group).length, 'grouped')
  return advantages
}

/**
 * Construit un EnrichedProduct directement depuis les données des APIs marque
 * SANS passer par le LLM. Élimine le risque de génération/hallucination.
 * Retourne null si les données sont insuffisantes.
 */
function buildEnrichedFromBrandApi(
  apiResult: BrandApiResult,
  markdownContent: string | null,
): Partial<EnrichedProduct> | null {
  let description = ''
  let advantages: Array<{ text: string; group?: string }> = []
  let specifications: Array<{ name: string; value: string; group?: string }> = []
  let documents: string[] = []
  let images: string[] = []

  for (const section of apiResult.sections) {
    const data = section.parsed
    if (!data) continue // Pas de JSON parsé → on skip

    switch (section.label) {
      case 'specifications':
        specifications = extractSpecsFromJson(data)
        console.log('[brand-api-parse] specifications →', specifications.length, 'items')
        break
      case 'features':
        // Milwaukee : features = tableau de strings directement
        if (Array.isArray(data) && data.every(i => typeof i === 'string')) {
          advantages = (data as string[]).map(s => s.trim()).filter(Boolean).map(text => ({ text }))
        } else {
          advantages = extractFeaturesFromJson(data)
        }
        console.log('[brand-api-parse] features →', advantages.length, 'items')
        break
      case 'overview':
        description = extractOverviewFromJson(data)
        console.log('[brand-api-parse] overview →', description.length, 'chars')
        break
      case 'downloads':
        // Tableau de strings : URLs directes ou format "titre##url"
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
          documents = (data as string[]).filter(u =>
            /^https?:\/\//.test(u) || (u.includes('##') && /^https?:\/\//.test(u.split('##').slice(1).join('##')))
          )
        } else {
          documents = extractDocumentsFromJson(data)
        }
        console.log('[brand-api-parse] downloads →', documents.length, 'items')
        break
      case 'images':
        // Tableau d'URLs d'images directement
        if (Array.isArray(data)) {
          images = (data as string[]).filter(u => typeof u === 'string' && u.startsWith('http'))
        }
        console.log('[brand-api-parse] images →', images.length, 'items')
        break

      case 'product-info': {
        // Infos produit extraites du Relay store (modelCode, articleNumber, etc.)
        const info = data as Record<string, string>
        const infoSpecs: Array<{ name: string; value: string }> = []
        if (info.modelCode) infoSpecs.push({ name: 'Modèle', value: info.modelCode })
        if (info.articleNumber) infoSpecs.push({ name: 'Référence article', value: info.articleNumber })
        if (info.system) infoSpecs.push({ name: 'Système', value: info.system })
        // Ajouter en tête des specs (infos les plus importantes)
        if (infoSpecs.length > 0) {
          specifications = [...infoSpecs, ...specifications]
          console.log('[brand-api-parse] product-info →', infoSpecs.length, 'items added to specs')
        }
        break
      }

      case 'whats-included': {
        // Contenu du kit : batteries, chargeur, boîte, etc.
        const included = extractFeaturesFromJson(data)
        if (included.length > 0) {
          specifications.push({ name: 'Inclus dans le kit', value: included.map(f => f.text).join(', ') })
          console.log('[brand-api-parse] whats-included →', included.length, 'items')
        } else {
          // Essayer comme objet avec des paires clé/valeur
          const incSpecs = extractSpecsFromJson(data)
          for (const s of incSpecs) specifications.push(s)
        }
        break
      }

      case 'jsonld-product':
      case 'nextjs-product':
      case 'nuxt-product':
      case 'spa-inline-product': {
        // Données produit extraites d'un data store SPA — objet riche
        const rec = data as Record<string, unknown>

        // Description
        if (!description) {
          const desc = rec.description ?? rec.longDescription ?? rec.body ?? rec.content
          if (typeof desc === 'string' && desc.length > 20) {
            description = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            console.log('[brand-api-parse] SPA description →', description.length, 'chars')
          }
        }

        // Spécifications
        if (specifications.length === 0) {
          const rawSpecs = rec.specifications ?? rec.additionalProperty ?? rec.attributes ?? rec.specs ?? rec.technicalSpecs
          if (rawSpecs) {
            const parsed = extractSpecsFromJson(rawSpecs)
            if (parsed.length > 0) {
              specifications = parsed
              console.log('[brand-api-parse] SPA specs →', specifications.length, 'items')
            }
          }
        }

        // Features / avantages
        if (advantages.length === 0) {
          const rawFeats = rec.features ?? rec.productFeatures ?? rec.keyFeatures ?? rec.highlights ?? rec.advantages
          if (rawFeats) {
            const parsed = extractFeaturesFromJson(rawFeats)
            if (parsed.length > 0) {
              advantages = parsed
              console.log('[brand-api-parse] SPA features →', advantages.length, 'items')
            }
          }
        }

        // Images
        if (images.length === 0) {
          const rawImgs = rec.image ?? rec.images ?? rec.media
          if (rawImgs) {
            const imgList = Array.isArray(rawImgs) ? rawImgs : [rawImgs]
            for (const img of imgList) {
              if (typeof img === 'string' && img.startsWith('http')) {
                images.push(img)
              } else if (img && typeof img === 'object') {
                const url = (img as Record<string, unknown>).url ?? (img as Record<string, unknown>).contentUrl ?? (img as Record<string, unknown>).src
                if (typeof url === 'string' && url.startsWith('http')) images.push(url)
              }
            }
            if (images.length > 0) console.log('[brand-api-parse] SPA images →', images.length, 'items')
          }
        }
        break
      }
    }
  }

  // Fallback : si le JSON n'a pas donné assez, extraire les specs du markdown
  if (specifications.length === 0 && markdownContent) {
    specifications = parseSpecsFromMarkdown(markdownContent)
    console.log('[brand-api-parse] specs from markdown →', specifications.length, 'items')
  }

  // Fallback description depuis markdown — SEULEMENT si on n'a pas de features
  // (sinon parseDescriptionFromMarkdown risque de capturer les features comme description)
  if (!description && markdownContent && advantages.length === 0) {
    description = parseDescriptionFromMarkdown(markdownContent)
  }
  // Si toujours pas de description, utiliser le titre produit plutôt que rien
  if (!description) {
    const titleSection = apiResult.sections.find(s => s.label === 'product-info')
    if (titleSection?.parsed) {
      const info = titleSection.parsed as Record<string, string>
      description = info.title || ''
    }
  }

  // Enrichir les avantages depuis le markdown (peut contenir des groupes et plus d'items que l'extraction SPA)
  if (markdownContent) {
    const mdAdvantages = parseAdvantagesFromMarkdown(markdownContent)
    if (mdAdvantages.length > 0) {
      if (advantages.length === 0) {
        advantages = mdAdvantages
      } else if (mdAdvantages.length > advantages.length || mdAdvantages.some(a => a.group)) {
        // Le markdown a plus de features OU a des groupes → le préférer
        advantages = mdAdvantages
        console.log('[brand-api-parse] markdown advantages preferred:', mdAdvantages.length, 'items with groups')
      }
    }
  }

  // Fallback documents depuis markdown
  if (documents.length === 0 && markdownContent) {
    const pdfUrls = [...markdownContent.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)]
      .map(m => m[0])
    documents = [...new Set(pdfUrls)]
  }

  // Variantes depuis markdown
  const variants = markdownContent ? parseVariantsFromMarkdown(markdownContent) : []

  const hasMeaningfulData = specifications.length >= 2 || advantages.length >= 3 || (description.length > 50 && advantages.length >= 2)
  if (!hasMeaningfulData) {
    console.log('[brand-api-parse] insufficient data for direct build, falling back to LLM')
    return null
  }

  console.log('[brand-api-parse] ✓ direct build:', {
    descLen: description.length,
    advantages: advantages.length,
    specs: specifications.length,
    variants: variants.length,
    docs: documents.length,
    imgs: images.length,
  })

  return { description, advantages, specifications, variants, documents, images }
}

// ── Hook principal ──────────────────────────────────────────────────────────

export function useProductEnrichment() {
  const { scrape } = useFirecrawl()
  const { setProgress, setData, setError, setLlmRequest, clear } = useEnrichmentStore()
  const [running, setRunning] = useState(false)

  const enrich = useCallback(
    async (input: EnrichmentInput): Promise<EnrichedProduct | null> => {
      const { sheetName, rowId, title, brand, sku, reference, description, category, knownUrl } = input
      if (!title.trim()) {
        setError(sheetName, rowId, 'Titre du produit manquant, impossible de lancer la recherche.')
        return null
      }
      const sourceTokens = tokenizeTitle(`${title} ${brand ?? ''} ${description ?? ''}`)

      setRunning(true)
      try {
        console.log('[enrichment] START', { sheetName, rowId, title, brand, reference: reference ?? sku, knownUrl })
        // ── Étape 1 : Trouver la page produit ─────────────────────────────
        let productUrl: string | null = knownUrl ?? null
        let additionalSources: string[] = []
        let searchErrorMsg: string | null = null

        if (!productUrl) {
          setProgress(sheetName, rowId, {
            status: 'searching',
            message: 'Recherche de la page produit…',
          })
          // Stratégie multi-passe — PRIORITÉ : site officiel de la marque
          //   0. Cibler le site officiel de la marque (ex: site:makita.fr)
          //   1. Cibler les domaines e-commerce de confiance via `site:`
          //   2. Recherche générique avec SKU quoté
          //   3. Fallback sans SKU
          const ref = reference ?? sku ?? ''
          const refQuoted = ref ? `"${ref}"` : ''
          const coreTerms = [refQuoted || ref, brand, title].filter(Boolean).join(' ').trim()

          // ── Priorité n°0 : site officiel FR de la marque ─────────────────
          // Mapping marques connues → domaines FR (prioritaires) puis internationaux (fallback).
          // Le site FR contient les specs en français + unités métriques.
          const BRAND_DOMAINS_FR: Record<string, string[]> = {
            milwaukee:  ['fr.milwaukeetool.eu'],
            dewalt:     ['dewalt.fr'],
            makita:     ['makita.fr'],
            bosch:      ['bosch-professional.com/fr/fr', 'bosch-home.fr', 'bosch.fr'],
            metabo:     ['metabo.com/fr-fr'],
            hikoki:     ['hikoki-powertools.fr'],
            festool:    ['festool.fr'],
            stanley:    ['stanleytools.fr'],
            ryobi:      ['ryobitools.eu/fr'],
            stihl:      ['stihl.fr'],
            husqvarna:  ['husqvarna.com/fr'],
            worx:       ['worx.com/fr'],
            aeg:        ['aeg-powertools.eu/fr'],
            einhell:    ['einhell.fr'],
            karcher:    ['kaercher.com/fr'],
            facom:      ['facom.fr'],
            hilti:      ['hilti.fr'],
            flex:       ['flex-tools.com/fr'],
          }
          const BRAND_DOMAINS_INTL: Record<string, string[]> = {
            milwaukee:  ['milwaukeetool.eu', 'milwaukeetool.com'],
            dewalt:     ['dewalt.com', 'dewalt.eu'],
            makita:     ['makita.com'],
            bosch:      ['bosch-professional.com'],
            metabo:     ['metabo.com'],
            hikoki:     ['hikoki-powertools.com'],
            festool:    ['festool.com'],
            stanley:    ['stanley.com'],
            ryobi:      ['ryobitools.eu', 'ryobitools.com'],
            stihl:      ['stihl.com'],
            husqvarna:  ['husqvarna.com'],
            worx:       ['worx.com'],
            aeg:        ['aeg-powertools.eu', 'aeg.com'],
            einhell:    ['einhell.com'],
            karcher:    ['kaercher.com'],
            facom:      ['facom.com'],
            hilti:      ['hilti.com'],
            flex:       ['flex-tools.com'],
          }

          const brandSlug = brand
            ? brand.toLowerCase().replace(/[^a-z0-9]/g, '')
            : ''
          const brandSiteQueries: string[] = []
          if (brandSlug) {
            const frDomains = BRAND_DOMAINS_FR[brandSlug]
            const intlDomains = BRAND_DOMAINS_INTL[brandSlug]
            if (frDomains) {
              // Query 0a : site FR officiel uniquement
              const frOps = frDomains.map((d) => `site:${d}`).join(' OR ')
              brandSiteQueries.push(`${coreTerms} (${frOps})`)
            }
            if (intlDomains) {
              // Query 0b : site international en fallback
              const intlOps = intlDomains.map((d) => `site:${d}`).join(' OR ')
              brandSiteQueries.push(`${coreTerms} (${intlOps})`)
            }
            if (!frDomains && !intlDomains) {
              // Marque inconnue → essai générique FR d'abord
              brandSiteQueries.push(
                `${coreTerms} (site:${brandSlug}.fr OR site:fr.${brandSlug}.eu OR site:${brandSlug}.eu/fr)`,
              )
              brandSiteQueries.push(
                `${coreTerms} (site:${brandSlug}.com OR site:${brandSlug}.eu)`,
              )
            }
          }

          // Groupes géographiques e-commerce
          const tnSites = 'site:monoprix.tn OR site:carrefour.tn OR site:mytek.tn OR site:tunisianet.com.tn OR site:jumia.com.tn'
          const frSites = 'site:amazon.fr OR site:fnac.com OR site:darty.com OR site:boulanger.com OR site:cdiscount.com OR site:rakuten.com'
          const intlSites = 'site:amazon.com OR site:ebay.com OR site:aliexpress.com'

          const rawQueries = [
            // 0. Site officiel de la marque (fiches les plus complètes)
            ...brandSiteQueries,
            // 1. Ciblage .tn avec SKU quoté (le plus discriminant pour Monoprix TN)
            `${coreTerms} (${tnSites})`,
            // 2. Ciblage .fr avec SKU quoté
            `${coreTerms} (${frSites})`,
            // 3. Ciblage international
            `${coreTerms} (${intlSites})`,
            // 4. Recherche générique avec SKU quoté (sans restriction de domaine)
            [refQuoted, brand, title, 'acheter'].filter(Boolean).join(' '),
            // 5. Fallback titre + marque (sans SKU)
            [title, brand, 'acheter en ligne'].filter(Boolean).join(' '),
            // 6. Brut
            [title, brand, ref].filter(Boolean).join(' '),
          ]
          const queries = rawQueries
            .map((q) => q.trim())
            .filter((q, i, arr) => q && arr.indexOf(q) === i)

          let bestPick: { url: string; extras: string[]; query: string; score: number } | null = null

          for (const q of queries) {
            try {
              console.log('[enrichment] trying search query:', q)
              const results = await firecrawlSearch(q, 10)
              // Filtre : on retire les domaines junk (Facebook, archives, PDFs, wiki…)
              const clean = results.filter((r) => {
                const junk = isJunkUrl(r.url)
                if (junk) console.log('[enrichment] rejecting junk URL:', r.url)
                return !junk
              })
              if (clean.length === 0) {
                console.warn('[enrichment] query returned 0 usable results (after junk filter):', q)
                continue
              }
              // Scoring par pertinence e-commerce (+ sémantique)
              const scored = clean
                .map((r) => ({ r, score: scoreResult(r, sourceTokens, brand, reference ?? sku) }))
                .sort((a, b) => b.score - a.score)
              console.log('[enrichment] scored results:', scored.map((s) => ({ url: s.r.url, score: s.score })))

              // Seuil d'acceptation minimum : un résultat avec un score <= 0
              // est probablement non pertinent (listing, hors-sujet, etc.) — on rejette.
              const top = scored[0]
              if (top.score <= 0) {
                console.warn('[enrichment] top result rejected (score <= 0):', top.r.url, top.score)
                continue
              }
              if (!bestPick || top.score > bestPick.score) {
                bestPick = {
                  url: top.r.url,
                  extras: scored.slice(1, 5).filter((s) => s.score > 0).map((s) => s.r.url),
                  query: q,
                  score: top.score,
                }
              }
              // On arrête dès qu'on a un résultat au score >= 20 (site officiel FR de la marque)
              // Un score e-commerce (~10-13) ou brand .com (~12) ne suffit PAS :
              // on veut le site FR de la marque (score ~25+).
              if (bestPick.score >= 20) break
            } catch (err) {
              searchErrorMsg = err instanceof Error ? err.message : String(err)
              console.error('[enrichment] search FAILED for query:', q, err)
              // On ne breake pas — on tente la query suivante
            }
          }

          if (bestPick) {
            productUrl = bestPick.url
            additionalSources = bestPick.extras
            console.log('[enrichment] ✓ final pick →', { url: productUrl, score: bestPick.score, query: bestPick.query })
          }

          if (!productUrl) {
            const reason = searchErrorMsg
              ? `Firecrawl search a échoué : ${searchErrorMsg}`
              : `Aucune page produit pertinente trouvée pour "${title} ${brand ?? ''} ${ref}". Les résultats étaient des sources non-fiables (Facebook, archives, PDFs) — saisissez une URL manuelle dans la ligne source.`
            console.error('[enrichment] no URL after all attempts →', reason)
            setError(sheetName, rowId, reason)
            return null
          }
        }

        // ── Étape 2 : Scraper la page trouvée ──────────────────────────────
        // Stratégie par ordre de priorité :
        //   1. API interne de la marque via Firecrawl (JSON structuré direct)
        //   2. Firecrawl markdown (rendu JS complet → texte brut)
        //   3. Firecrawl schema (extraction structurée classique)
        let scraped: ScrapeResult | null = null
        let markdownContent: string | null = null
        let brandApiResult: BrandApiResult | null = null

        if (productUrl) {
          const hostname = new URL(productUrl).hostname
          const brandSlugLc = brand ? brand.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
          const isBrandSite = brandSlugLc
            ? hostname.toLowerCase().includes(brandSlugLc)
            : false

          setProgress(sheetName, rowId, {
            status: 'scraping',
            message: `Extraction des données depuis ${hostname}…`,
          })

          if (isBrandSite) {
            // ── 1. API interne de la marque (le plus fiable) ─────────
            try {
              console.log('[enrichment] brand site → trying internal API scrape')
              brandApiResult = await scrapeBrandApis(productUrl)
              if (brandApiResult) {
                console.log('[enrichment] ✓ brand API data:', brandApiResult.combinedText.length, 'chars,', brandApiResult.sections.length, 'sections')
              }
            } catch (err) {
              console.warn('[enrichment] brand API scrape failed', err)
            }

            // ── 2. Markdown de la page (pour description, avantages, images) ──
            try {
              setProgress(sheetName, rowId, {
                status: 'scraping',
                message: `Extraction du contenu de la page ${hostname}…`,
              })
              markdownContent = await firecrawlScrapeMarkdown(productUrl)
              console.log('[enrichment] markdown →', markdownContent ? `${markdownContent.length} chars` : 'null')
              if (markdownContent) {
                console.log('[enrichment] markdown preview (first 3000 chars):\n', markdownContent.slice(0, 3000))
              }
            } catch (err) {
              console.warn('[enrichment] markdown scrape failed', err)
            }

            // ── 3. Schema en complément pour images/docs/URLs ────────
            try {
              scraped = await scrape(
                productUrl,
                'schema',
                FIELD_TEMPLATES.product_full.fields,
                '',
                { target: 'single', waitFor: 8000, proxy: 'auto' },
              )
            } catch (err) {
              console.warn('[enrichment] schema scrape failed (non-blocking)', err)
            }
          } else {
            // ── Site e-commerce → schema + markdown avec scroll ──────
            try {
              scraped = await scrape(
                productUrl,
                'schema',
                FIELD_TEMPLATES.product_full.fields,
                '',
                { target: 'single', waitFor: 2000, proxy: 'auto' },
              )
            } catch (err) {
              console.warn('[enrichment] Firecrawl schema failed', err)
            }
            // Markdown avec scroll pour les sites e-commerce aussi
            try {
              markdownContent = await firecrawlScrapeMarkdown(productUrl)
              console.log('[enrichment] e-commerce markdown →', markdownContent ? `${markdownContent.length} chars` : 'null')
            } catch (err) {
              console.warn('[enrichment] e-commerce markdown failed', err)
            }
          }
        }

        // ── Extraction images depuis scraping schema (commun aux deux paths) ──
        const scrapedRow = scraped?.rows?.[0] as Record<string, unknown> | undefined
        const rawImages: unknown = scrapedRow?.images ?? scrapedRow?.image_url ?? scrapedRow?.image
        const scrapedImages: string[] = Array.isArray(rawImages)
          ? rawImages.filter((u): u is string => typeof u === 'string')
          : typeof rawImages === 'string'
            ? [rawImages]
            : []

        // ── Extraction SPA générique (fallback pour sites React/Next/Nuxt/Vue) ──
        // Si on n'a pas de brandApiResult et que le schema scrape est pauvre,
        // on tente d'extraire les données depuis le HTML brut (data stores SPA).
        if (!brandApiResult && productUrl) {
          const scrapedSpecs = scrapedRow?.specifications
          const hasEnoughSchemaData = scrapedRow
            && typeof scrapedRow.name === 'string'
            && (Array.isArray(scrapedSpecs) ? scrapedSpecs.length >= 3 : false)

          if (!hasEnoughSchemaData) {
            try {
              console.log('[enrichment] schema data insufficient → trying SPA HTML extraction…')
              setProgress(sheetName, rowId, {
                status: 'scraping',
                message: 'Extraction des données SPA (React/Next.js/Vue)…',
              })
              const spaResult = await extractSpaDataFromHtml(productUrl)
              if (spaResult) {
                brandApiResult = spaResult
                console.log('[enrichment] ✓ SPA extraction:', spaResult.sections.length, 'sections')
              }
            } catch (err) {
              console.warn('[enrichment] SPA extraction failed (non-blocking)', err)
            }
          }
        }

        // ── Étape 3 : Bypass LLM ou raisonnement LLM ─────────────────────
        //
        // STRATÉGIE : Si les APIs marque ou l'extraction SPA ont retourné des
        // données structurées suffisantes, on construit l'objet DIRECTEMENT
        // sans passer par le LLM. Cela élimine 100% du risque d'hallucination.
        //
        // Le LLM n'est utilisé QUE pour :
        //   - Les cas où ni l'API marque, ni l'extraction SPA, ni le schema
        //     Firecrawl n'ont retourné assez de données structurées

        let enriched: EnrichedProduct

        // Tenter le direct build depuis brandApiResult OU depuis le markdown seul
        let directBuild = brandApiResult
          ? buildEnrichedFromBrandApi(brandApiResult, markdownContent)
          : null

        // Fallback : si pas de brandApiResult mais markdown riche, construire depuis le markdown
        if (!directBuild && markdownContent && markdownContent.length > 200) {
          const mdSpecs = parseSpecsFromMarkdown(markdownContent)
          const mdAdvantages = parseAdvantagesFromMarkdown(markdownContent)
          let mdDescription = parseDescriptionFromMarkdown(markdownContent)

          // Si pas de description paragraphe, utiliser le titre H1 du produit
          if (!mdDescription || mdDescription.length < 30) {
            const h1Match = markdownContent.match(/^#\s+(.+)/m)
            if (h1Match) mdDescription = h1Match[1].replace(/\*\*/g, '').trim()
          }

          console.log('[enrichment] markdown-only build attempt:', { specs: mdSpecs.length, advantages: mdAdvantages.length, descLen: mdDescription.length })

          // Seuil bas : features ≥ 3 OU specs ≥ 3 suffit (pas besoin des deux)
          const hasEnoughData = mdSpecs.length >= 3
            || mdAdvantages.length >= 3
            || (mdDescription.length > 50 && mdAdvantages.length >= 2)
          if (hasEnoughData) {
            const mdDocs = [...markdownContent.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)]
              .map(m => m[0])
            const mdVariants = parseVariantsFromMarkdown(markdownContent)
            directBuild = {
              description: mdDescription,
              advantages: mdAdvantages,
              specifications: mdSpecs,
              variants: mdVariants,
              documents: [...new Set(mdDocs)],
              images: [],
            }
            console.log('[enrichment] ★ markdown-only direct build succeeded')
          }
        }

        if (directBuild) {
          // ══ PATH A : Construction directe (pas de LLM) ═══════════════
          console.log('[enrichment] ★ DIRECT BUILD — bypassing LLM entirely')
          setProgress(sheetName, rowId, {
            status: 'reasoning',
            message: 'Construction directe depuis les données du fabricant (sans IA)…',
          })

          // Images : direct build (brand API) + scraping schema + fallback HTML
          let allImages = [
            ...(directBuild.images ?? []),
            ...scrapedImages,
          ]
          if (allImages.length === 0 && productUrl) {
            allImages = await firecrawlFetchImages(productUrl)
          }
          const mergedImages = Array.from(new Set(
            allImages.map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u)),
          ))

          // Documents : merge API + scraping
          const scrapedDocs: unknown = scrapedRow?.documents
          const scrapedDocUrls: string[] = Array.isArray(scrapedDocs)
            ? scrapedDocs.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
            : []
          const mergedDocs = Array.from(new Set([
            ...(directBuild.documents ?? []),
            ...scrapedDocUrls,
          ]))

          enriched = {
            description: directBuild.description ?? '',
            advantages: directBuild.advantages ?? [],
            specifications: directBuild.specifications ?? [],
            variants: directBuild.variants ?? [],
            images: mergedImages,
            documents: mergedDocs,
            sourceUrl: productUrl,
            additionalSources,
            generatedAt: Date.now(),
            scrapingProvider: 'Firecrawl (API directe)',
            llmProvider: undefined,
            llmModel: undefined,
          }
        } else {
          // ══ PATH B : LLM classique ═══════════════════════════════════
          setProgress(sheetName, rowId, {
            status: 'reasoning',
            message: 'Génération de la fiche enrichie par l\'IA…',
          })

          const scrapedJson = scrapedRow
            ? JSON.stringify(scrapedRow, null, 2)
            : null

          const sourceContext = [
            `Titre : ${title}`,
            category && `Catégorie : ${category}`,
            brand && `Marque : ${brand}`,
            (reference ?? sku) && `Référence / SKU : ${reference ?? sku}`,
            description && `Description existante : ${description}`,
          ]
            .filter(Boolean)
            .join('\n')

          // Construire les sections de données disponibles
          const dataSections: string[] = []
          if (brandApiResult) {
            dataSections.push(`## Données de l'API interne du fabricant (SOURCE LA PLUS FIABLE)\n${brandApiResult.combinedText.slice(0, 25000)}`)
          }
          if (markdownContent) {
            dataSections.push(`## Contenu de la page produit (markdown rendu)\n${markdownContent.slice(0, 20000)}`)
          }
          if (scrapedJson) {
            dataSections.push(`## Données extraites (extraction structurée)\n${scrapedJson}`)
          }

          const hasData = dataSections.length > 0
          const prompt = `Tu es un extracteur de données produit. Tu extrais et structures fidèlement les données trouvées dans les contenus ci-dessous. Tu ne rédiges RIEN, tu ne reformules RIEN, tu ne génères RIEN.

## Produit à identifier
${sourceContext}

${dataSections.length > 0 ? dataSections.join('\n\n') : '(aucune donnée disponible)'}

## RÈGLES ABSOLUES
${hasData
  ? `1. COPIER VERBATIM — ne reformule jamais, ne résume jamais, n'embellis jamais
2. Description : copie le texte descriptif trouvé TEL QUEL, mot pour mot
3. Avantages : copie chaque bullet point / feature TEL QUEL. Si le markdown contient une liste de caractéristiques (ex: "Rendement supérieur avec…", "Design compact…"), reprends chaque item
4. Spécifications : extrais CHAQUE paire nom/valeur de CHAQUE section technique (Informations, Poids, Puissance, Décibels, Vibrations, Dimensions, Batterie, etc.). SANS LIMITE de nombre. Chaque ligne du tableau = un item {name, value}
5. Images : reprends toutes les URLs d'images (https://...) trouvées dans les données
6. Documents : reprends toutes les URLs de fichiers PDF (.pdf) trouvées dans les données
7. Si un champ n'existe pas dans les données → chaîne vide ou tableau vide. JAMAIS d'invention.
8. NE TRADUIS PAS — garde la langue originale des données`
  : `Aucune donnée disponible. Retourne :
- description : chaîne vide
- advantages : tableau vide
- specifications : tableau vide
- images : tableau vide
- documents : tableau vide`}

Réponds UNIQUEMENT via l'outil emit_response.`

          let llmProviderUsed: string | undefined
          let llmModelUsed: string | undefined
          const ai = await generateJson({
            task: 'product.enrichment',
            prompt,
            schema: enrichedProductSchema,
            schemaForLLM: enrichedProductJsonSchema as unknown as Record<string, unknown>,
            version: 'product.enrichment.v1',
            onProviderUsed: ({ provider, model }) => {
              llmProviderUsed = provider
              llmModelUsed = model
            },
            onRequestSent: (request) => {
              setLlmRequest(sheetName, rowId, request)
            },
          })

          // Heuristique "scraping hors-sujet"
          const llmRejectedScraping =
            (scrapedImages.length > 0 || ai.description?.length > 0) &&
            (ai.images?.length ?? 0) === 0 &&
            scrapedImages.length > 0

          let fallbackImages: string[] = []
          if (scrapedImages.length === 0 && productUrl && !llmRejectedScraping) {
            fallbackImages = await firecrawlFetchImages(productUrl)
          }

          const imageSources = llmRejectedScraping
            ? (ai.images ?? [])
            : [...scrapedImages, ...fallbackImages, ...(ai.images ?? [])]
          const mergedImages: string[] = Array.from(
            new Set(
              imageSources
                .map((u: unknown) => (typeof u === 'string' ? u.trim() : ''))
                .filter((u: string) => /^https?:\/\//.test(u)),
            ),
          )

          const scrapedDocs: unknown = scrapedRow?.documents
          const scrapedDocUrls: string[] = Array.isArray(scrapedDocs)
            ? scrapedDocs.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
            : []
          const mergedDocs = Array.from(new Set([
            ...scrapedDocUrls,
            ...(ai.documents ?? []).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)),
          ]))

          enriched = {
            description: ai.description,
            advantages: (ai.advantages as string[]).map(text => ({ text })),
            specifications: ai.specifications,
            variants: [],
            images: mergedImages,
            documents: mergedDocs,
            sourceUrl: productUrl,
            additionalSources,
            generatedAt: Date.now(),
            scrapingProvider: scraped || productUrl ? 'Firecrawl' : undefined,
            llmProvider: llmProviderUsed,
            llmModel: llmModelUsed,
          }
        }

        // ── Post-processing : enrichir avec groupes markdown + variantes ──
        // Le LLM et le schema Firecrawl retournent des données plates (pas de groupes).
        // Le markdown scrappé contient souvent les groupes d'origine du fabricant.
        enriched = enrichWithMarkdownGroups(enriched, markdownContent)

        enriched = sanitizeEnriched(enriched)
        setData(sheetName, rowId, enriched)
        return enriched
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        setError(sheetName, rowId, message)
        return null
      } finally {
        setRunning(false)
      }
    },
    [scrape, setProgress, setData, setError, setLlmRequest],
  )

  const reset = useCallback(
    (sheetName: string, rowId: string) => clear(sheetName, rowId),
    [clear],
  )

  return { enrich, reset, running }
}
