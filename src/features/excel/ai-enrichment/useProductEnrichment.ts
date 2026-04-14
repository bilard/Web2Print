import { useCallback, useState } from 'react'
import { z } from 'zod'
import { getApiKey } from '@/lib/apiKeys'
import { generateJson } from '@/features/ai/llmRouter'
import { useEnrichmentStore } from './enrichmentStore'
import type { EnrichedProduct } from './types'
import { enrichmentKey } from './types'

/**
 * Hook d'enrichissement IA en live d'un produit individuel.
 *
 * Flux :
 *  1. Jina search (DuckDuckGo via r.jina.ai) pour trouver la meilleure page produit
 *  2. Jina Reader (r.jina.ai) pour scraper la page en markdown
 *  3. Parsing direct du markdown OU LLM (Claude/Gemini/OpenAI) pour structurer les données
 *
 * Tolérant aux échecs : si le scraping rate, on envoie quand-même au LLM
 * les infos de la ligne source pour qu'il génère un enrichissement basé
 * sur ses connaissances.
 */

// ── Filtrage des contenus parasites (cookie banners, GDPR, reCAPTCHA) ───────

const GARBAGE_RE = /\b(cookie[s ]?|gdpr|your privacy|recaptcha|captcha|consent manager|targeting cookies?|functional cookies?|performance cookies?|strictly necessary|necessary cookies?|checkbox.?label|onetrust|cookiebot|manage preferences|cookie settings|politique de confidentialit[eé]|param[eè]tres? des? cookies?|refuser les cookies?|accepter les cookies?|we use cookies|this site is exceeding|we and our partners store|non-sensitive information|personali[sz]ed ads|ad measurement|audience insights|legitimate interest|store and\/or access|advertising purposes?|consent purposes?|personalised content|accept all|reject all)\b/i

/** Détecte si un texte est du contenu parasite (cookie banner, GDPR, reCAPTCHA) */
function isGarbageContent(text: string): boolean {
  return GARBAGE_RE.test(text)
}

/**
 * Fusionne les groupes du markdown dans les avantages existants par matching textuel.
 * Ne supprime JAMAIS d'items existants — ajoute uniquement les groupes et éventuellement
 * les items manquants du markdown.
 */
function mergeGroupsIntoAdvantages(
  existing: Array<{ text: string; group?: string }>,
  mdAdvantages: Array<{ text: string; group?: string }>,
): Array<{ text: string; group?: string }> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zàâéèêëîïôùûüç0-9]/g, ' ').replace(/\s+/g, ' ').trim()

  // Essayer de matcher chaque item existant avec un item markdown pour récupérer son groupe
  const result = existing.map(adv => {
    if (adv.group) return adv // déjà groupé
    const normAdv = normalize(adv.text)
    const match = mdAdvantages.find(md => {
      const normMd = normalize(md.text)
      return normMd === normAdv || normMd.includes(normAdv) || normAdv.includes(normMd)
    })
    return match?.group ? { ...adv, group: match.group } : adv
  })

  // Ajouter les items markdown qui n'ont pas de correspondance dans l'existant
  const existingNorms = new Set(existing.map(a => normalize(a.text)))
  for (const md of mdAdvantages) {
    const normMd = normalize(md.text)
    if (!existingNorms.has(normMd) && ![...existingNorms].some(e => e.includes(normMd) || normMd.includes(e))) {
      result.push(md)
    }
  }

  return result
}

/**
 * Post-processing : enrichit un EnrichedProduct avec les données du markdown source.
 * Le markdown est la SOURCE DE VÉRITÉ pour les groupes, les items manquants et les variantes.
 * Le LLM retourne tout à plat — le markdown conserve la structure d'origine.
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

  let { advantages, specifications, variants, description } = enriched

  // ── 0. Description : enrichir si le LLM a retourné un texte faible/vide ──
  const mdDescription = parseDescriptionFromMarkdown(markdownContent)
  if (mdDescription && mdDescription.length > 40) {
    if (!description || description.length < 40) {
      description = mdDescription
      console.log('[post-process] ✓ description from markdown:', description.slice(0, 80) + '…')
    } else if (mdDescription.length > description.length * 1.5) {
      // Le markdown a un texte significativement plus riche → le préférer
      description = mdDescription
      console.log('[post-process] ✓ replaced description with richer markdown version:', description.slice(0, 80) + '…')
    }
  }

  // ── 1. Advantages : JAMAIS réduire le nombre d'items ──
  // Le markdown peut contenir des groupes que le LLM/schema n'ont pas.
  // Règle : on ne remplace QUE si le markdown a STRICTEMENT PLUS d'items.
  // Sinon, on essaie d'ajouter les groupes aux items existants par matching textuel.
  const mdAdvantages = parseAdvantagesFromMarkdown(markdownContent)
  console.log('[post-process] markdown advantages:', mdAdvantages.length, 'items,', mdAdvantages.filter(a => a.group).length, 'grouped')
  console.log('[post-process] existing advantages:', advantages.length, 'items')
  if (mdAdvantages.length > 0) {
    if (mdAdvantages.length > advantages.length) {
      // Markdown a strictement plus d'items → le préférer
      advantages = mdAdvantages
      console.log('[post-process] ✓ replaced with markdown advantages:', advantages.length, 'items')
    } else if (mdAdvantages.some(a => a.group) && !advantages.some(a => a.group)) {
      // Markdown a des groupes, les items existants n'en ont pas → enrichir par matching
      advantages = mergeGroupsIntoAdvantages(advantages, mdAdvantages)
      console.log('[post-process] ✓ merged groups into existing advantages:', advantages.length, 'items,', advantages.filter(a => a.group).length, 'grouped')
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

  // ── 3bis. Propriétés non-discriminantes → specifications ──
  // Une prop est "commune" si toutes les variantes qui la déclarent (≥2)
  // ont exactement la même valeur. On autorise les variantes sans cette prop
  // (ex: palettes sans accordéon détail) à ne pas la déclarer.
  // Les props communes sortent du tableau variantes et vont dans les specs
  // (groupe "Caractéristiques") — un seul endroit pour les attributs partagés.
  if (variants && variants.length >= 2) {
    const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const existingSpecNames = new Set(specifications.map(s => norm(s.name)))

    // Collecter toutes les clés présentes dans au moins une variante
    const allKeys = new Set<string>()
    for (const v of variants) for (const k of Object.keys(v.properties)) allKeys.add(k)

    const commonProps: Array<{ name: string; value: string }> = []
    for (const key of allKeys) {
      const nonEmpty = variants
        .map(v => v.properties[key]?.trim() || '')
        .filter(val => val.length > 0)
      // Au moins 2 déclarations, toutes identiques
      if (nonEmpty.length >= 2 && new Set(nonEmpty).size === 1) {
        if (!existingSpecNames.has(norm(key))) {
          commonProps.push({ name: key, value: nonEmpty[0] })
          existingSpecNames.add(norm(key))
        }
        // Retirer la clé de toutes les variantes (nettoie le tableau variantes)
        for (const v of variants) delete v.properties[key]
      }
    }

    if (commonProps.length > 0) {
      specifications = [
        ...specifications,
        ...commonProps.map(p => ({ name: p.name, value: p.value, group: 'Caractéristiques' })),
      ]
      console.log('[post-process] ✓', commonProps.length, 'props communes déplacées vers specifications')
    }
  }

  // ── 4. Documents : ajouter les PDFs trouvés dans le markdown (jamais en perdre) ──
  let { documents } = enriched
  const mdPdfUrls = [...markdownContent.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)].map(m => m[0])
  if (mdPdfUrls.length > 0) {
    const existingSet = new Set(documents)
    const newDocs = mdPdfUrls.filter(u => !existingSet.has(u))
    if (newDocs.length > 0) {
      documents = [...documents, ...newDocs]
      console.log('[post-process] ✓ added', newDocs.length, 'PDF docs from markdown')
    }
  }

  // ── 5. Documents titré "titre##url" depuis markdown links ──
  const mdLinks = [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+\.pdf[^\s\)]*)\)/gi)]
  for (const m of mdLinks) {
    const title = m[1].trim()
    const url = m[2].trim()
    // Nettoyer les noms génériques via cleanDocumentName
    const titledDoc = `${title}##${url}`
    if (!documents.includes(url) && !documents.includes(titledDoc)) {
      documents.push(titledDoc)
    }
  }

  // Nettoyer tous les noms de documents (titres génériques → noms extraits de l'URL)
  const cleanedDocuments = documents.map(doc => cleanDocumentName(doc))

  return { ...enriched, description, advantages, specifications, variants, documents: cleanedDocuments }
}

/** Détecte si un texte est principalement du contenu cookie/GDPR (ratio de lignes garbage) */
function isMainlyGarbage(text: string): boolean {
  const lines = text.split(/\n/).filter(l => l.trim().length > 10)
  if (lines.length === 0) return false
  const garbageLines = lines.filter(l => GARBAGE_RE.test(l))
  // Si plus de 30% des lignes sont garbage → considérer comme parasite
  return garbageLines.length / lines.length > 0.3
}

/** Nettoie un EnrichedProduct en retirant les contenus parasites */
function sanitizeEnriched(enriched: EnrichedProduct): EnrichedProduct {
  // Description : vider si c'est du cookie/GDPR (court ou long)
  let description = enriched.description
  if (description && (isGarbageContent(description) || isMainlyGarbage(description))) {
    console.log('[sanitize] garbage description detected, clearing')
    description = ''
  }

  // Documents : nettoyer les noms génériques ("Télécharger", "Download", etc.)
  const documents = enriched.documents.map(doc => cleanDocumentName(doc))

  return {
    ...enriched,
    description,
    documents,
    advantages: enriched.advantages.filter(a => !isGarbageContent(a.text)),
    specifications: enriched.specifications.filter(s => !isGarbageContent(s.name) && !isGarbageContent(s.value)),
  }
}

/** Noms de liens génériques qui doivent être remplacés par un nom extrait de l'URL */
const GENERIC_DOC_NAMES_RE = /^(t[eé]l[eé]charger|download|voir|open|cliquez?\s*ici|click\s*here|lien|link|pdf|document|fichier|file|accéder|access)$/i

/**
 * Nettoie le nom d'un document :
 * - Si le titre est générique ("Télécharger"), extraire un nom lisible depuis l'URL
 * - Décoder les noms de fichiers URL-encodés
 * - Retirer les extensions et hashs illisibles
 */
function cleanDocumentName(doc: string): string {
  if (!doc.includes('##')) {
    // URL brute sans titre → extraire un nom depuis l'URL
    const name = extractNameFromUrl(doc)
    return name ? `${name}##${doc}` : doc
  }

  const sepIdx = doc.indexOf('##')
  const title = doc.slice(0, sepIdx).trim()
  const url = doc.slice(sepIdx + 2)

  // Si le titre est générique, extraire un meilleur nom depuis l'URL
  if (GENERIC_DOC_NAMES_RE.test(title) || title.length < 3) {
    const betterName = extractNameFromUrl(url)
    return betterName ? `${betterName}##${url}` : doc
  }

  return doc
}

/** Extrait un nom lisible depuis une URL de document */
function extractNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    // Dernier segment du path
    const filename = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '')
    if (!filename) return ''
    // Retirer l'extension
    const withoutExt = filename.replace(/\.\w{2,4}$/, '')
    // Si c'est un hash/uuid, essayer le segment précédent
    if (/^[a-f0-9-]{20,}$/i.test(withoutExt) || withoutExt.length < 3) {
      const segments = pathname.split('/').filter(Boolean)
      if (segments.length >= 2) {
        const parent = decodeURIComponent(segments[segments.length - 2])
        if (parent.length > 3 && !/^[a-f0-9-]{20,}$/i.test(parent)) {
          return humanizeName(parent)
        }
      }
      return ''
    }
    return humanizeName(withoutExt)
  } catch {
    return ''
  }
}

/** Convertit un slug/filename en nom lisible : "fiche-technique_produit" → "Fiche technique produit" */
function humanizeName(slug: string): string {
  const cleaned = slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 3) return ''
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}


// ── Schemas Zod pour la réponse LLM ─────────────────────────────────────────

const enrichedSpecSchema = z.object({
  name: z.string(),
  value: z.string(),
  group: z.string().optional(),
})

const enrichedVariantSchema = z.object({
  reference: z.string(),
  label: z.string(),
  properties: z.record(z.string(), z.string()),
})

const enrichedProductSchema = z.object({
  description: z.string(),
  advantages: z.array(z.string()),
  specifications: z.array(enrichedSpecSchema),
  variants: z.array(enrichedVariantSchema).optional().default([]),
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
      description: 'TOUS les points forts / bénéfices utilisateur, phrase courte chacun. Ne pas limiter le nombre.',
    },
    specifications: {
      type: 'array',
      description: 'TOUTES les spécifications techniques disponibles au format {name, value, group}. Ne pas limiter : inclure chaque caractéristique trouvée. Organiser par groupes (Informations, Poids, Puissance, Décibels, Vibrations, Dimensions, Batterie, Perçage, Vissage, etc.).',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom de la spécification (ex: "Couple max", "Poids", "Tension")' },
          value: { type: 'string', description: 'Valeur de la spécification (ex: "135 Nm", "2.3 kg", "18 V")' },
          group: { type: 'string', description: 'Groupe/section de la spécification (ex: "PUISSANCE", "POIDS", "INFORMATIONS", "DÉCIBELS", "VIBRATIONS"). Obligatoire.' },
        },
        required: ['name', 'value', 'group'],
      },
    },
    variants: {
      type: 'array',
      description: 'Variantes / déclinaisons du produit (références, couleurs, tailles, conditionnements). Chaque variante a une référence, un libellé et des propriétés. Si aucune variante, retourner un tableau vide.',
      items: {
        type: 'object',
        properties: {
          reference: { type: 'string', description: 'Code/référence unique de la variante (SKU, code article, numéro de modèle)' },
          label: { type: 'string', description: 'Libellé / désignation de la variante' },
          properties: {
            type: 'object',
            description: 'Propriétés spécifiques de la variante (Couleur, Taille, Conditionnement, etc.)',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['reference', 'label', 'properties'],
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
  required: ['description', 'advantages', 'specifications', 'variants', 'images', 'documents'],
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

// ── Types pour la recherche ─────────────────────────────────────────────────

interface SearchResult {
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
        // Site officiel de la marque → bonus massif, surtout FR
        s += isFr ? 40 : 20
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

// ── Jina Reader — scraping principal ────────────────────────────────────────

/**
 * Recherche web via DuckDuckGo Lite + Jina Reader (gratuit, sans clé API).
 * Scrape la page de résultats DuckDuckGo Lite via r.jina.ai et parse les URLs.
 */
async function jinaSearch(query: string, limit = 10): Promise<SearchResult[]> {
  console.log('[jina-search] →', { query, limit })
  const jinaKey = getApiKey('jina')
  const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  const headers: Record<string, string> = {
    Accept: 'text/markdown',
    'X-Retain-Images': 'none',
    'X-No-Cache': 'true',
  }
  if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`
  const res = await fetch(`https://r.jina.ai/${ddgUrl}`, { headers })
  if (!res.ok) {
    const body = await res.text()
    console.error('[jina-search] HTTP error', res.status, body.slice(0, 300))
    throw new Error(`Recherche web échouée (${res.status}) : ${body.slice(0, 200)}`)
  }
  const md = await res.text()

  // Parser les URLs depuis les redirections DuckDuckGo (uddg=URL encodée)
  const results: SearchResult[] = []
  const seen = new Set<string>()
  const uddgRe = /uddg=([^&\s)]+)/g
  let match: RegExpExecArray | null
  while ((match = uddgRe.exec(md)) !== null) {
    try {
      const url = decodeURIComponent(match[1])
      if (!url.startsWith('http') || seen.has(url)) continue
      seen.add(url)
      // Extraire le titre depuis le markdown (lien précédant l'uddg)
      const titleRe = new RegExp(`\\[([^\\]]+)\\]\\([^)]*uddg=${match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      const titleMatch = md.match(titleRe)
      results.push({
        url,
        title: titleMatch?.[1]?.replace(/\*\*/g, '').trim(),
      })
    } catch { /* ignore malformed URLs */ }
    if (results.length >= limit) break
  }

  // Fallback : parser les URLs markdown classiques [titre](url)
  if (results.length === 0) {
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
    while ((match = linkRe.exec(md)) !== null) {
      const url = match[2]
      if (seen.has(url) || /duckduckgo\.com/i.test(url)) continue
      seen.add(url)
      results.push({ url, title: match[1].replace(/\*\*/g, '').trim() })
      if (results.length >= limit) break
    }
  }

  console.log('[jina-search] parsed', results.length, 'results:', results.map((r) => r.url))
  return results
}

/**
 * Scrape une page via Jina Reader (r.jina.ai) → markdown.
 * Scrape une page via Jina Reader (r.jina.ai) → markdown.
 */
async function jinaScrapeMarkdown(pageUrl: string): Promise<string | null> {
  console.log('[jina-reader] scraping →', pageUrl)
  const jinaKey = getApiKey('jina')

  // Utiliser le mode JSON (comme useJina.ts) — retourne le markdown + images map + links map
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-With-Links-Summary': 'true',
    'X-With-Images-Summary': 'true',
    'X-Wait-For-Selector': 'body',
    'X-Timeout': '30',
    'X-No-Cache': 'true',
  }
  if (jinaKey) {
    headers['Authorization'] = `Bearer ${jinaKey}`
    console.log('[jina-reader] ✓ using API key (paid mode)')
  }

  const res = await fetch(`https://r.jina.ai/${pageUrl}`, { headers })
  if (!res.ok) {
    console.warn('[jina-reader] HTTP error', res.status)
    return null
  }

  const json = await res.json() as {
    data?: { content?: string; images?: Record<string, string>; links?: Record<string, string> }
    content?: string; images?: Record<string, string>; links?: Record<string, string>
  }
  let md = json?.data?.content || json?.content || ''
  const imagesMap = json?.data?.images || json?.images
  const linksMap = json?.data?.links || json?.links

  if (!md || md.length < 50) return null

  console.log('[jina-reader] JSON mode → content:', md.length, 'chars, images:', Object.keys(imagesMap ?? {}).length, ', links:', Object.keys(linksMap ?? {}).length)

  // Nettoyer les sections cookie/GDPR
  md = md
    .replace(/#{1,4}\s*(Your Privacy|Cookie|GDPR|Manage Preferences)[\s\S]*?(?=\n#{1,4}\s|\n\n---|\n\n\*\*|$)/gi, '')
    .replace(/^[-*•]\s*.*?(cookie|privacy|captcha|recaptcha|consent|targeting|functional|necessary).*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Injecter les images trouvées par Jina dans le markdown
  if (imagesMap && typeof imagesMap === 'object') {
    const imgEntries = Object.entries(imagesMap).filter(([, url]) => typeof url === 'string' && url.startsWith('http'))
    if (imgEntries.length > 0) {
      const imgSection = '\n\nJINA_EXTRACTED_IMAGES_START\n'
        + imgEntries.map(([, url]) => url).join('\n')
        + '\nJINA_EXTRACTED_IMAGES_END'
      md += imgSection
      console.log('[jina-reader] ✓ injected', imgEntries.length, 'images from JSON response')
    }
  }

  // Injecter les liens documents (PDF) trouvés par Jina
  if (linksMap && typeof linksMap === 'object') {
    const DOC_EXT = /\.(pdf|docx?|xlsx?)(\?[^"']*)?$/i
    const docEntries = Object.entries(linksMap).filter(([, href]) => DOC_EXT.test(href))
    if (docEntries.length > 0) {
      const dlSection = '\n\nJINA_EXTRACTED_DOWNLOADS_START\n'
        + docEntries.map(([title, url]) => `${title}##${url}`).join('\n')
        + '\nJINA_EXTRACTED_DOWNLOADS_END'
      md += dlSection
      console.log('[jina-reader] ✓ injected', docEntries.length, 'documents from JSON response')
    }
  }

  return md
}

/**
 * Fallback multi-stratégie pour les sites fabricants SPA (accordéons JS).
 * 1. Jina Reader avec JSON output (inclut parfois plus de contenu)
 * 2. Proxy CORS via un service tiers pour fetch le HTML brut côté serveur
 * 3. Parse le contenu pour les JSON-LD / sections cachées
 */
async function scrapeHtmlFallback(pageUrl: string): Promise<string | null> {
  console.log('[html-fallback] multi-strategy scrape →', pageUrl)

  // ── Stratégie 1 : Jina Reader en mode JSON (contient parfois plus de data) ──
  try {
    const jinaKey = getApiKey('jina')
    const fallbackHeaders: Record<string, string> = {
      Accept: 'application/json',
      'X-Return-Format': 'json',
      'X-Timeout': '45',
      'X-No-Cache': 'true',
      'X-Wait-For-Selector': 'body',
    }
    if (jinaKey) fallbackHeaders['Authorization'] = `Bearer ${jinaKey}`

    const res = await fetch(`https://r.jina.ai/${pageUrl}`, { headers: fallbackHeaders })
    if (res.ok) {
      const json = await res.json()
      const content = json?.data?.content || json?.content || ''
      const html = json?.data?.html || json?.html || ''
      console.log('[html-fallback] Jina JSON → content:', content?.length, 'chars, html:', html?.length, 'chars')

      // Si on a le HTML rendu, parser le DOM
      if (html && html.length > 500) {
        const result = extractSpecsFromHtml(html)
        if (result && result.split('\n').filter((l: string) => l.startsWith('|')).length >= 3) {
          console.log('[html-fallback] ✓ extracted specs from Jina HTML output')
          return result
        }
      }

      // Sinon essayer le content (markdown enrichi)
      if (content && content.length > 500 && content.length > (html?.length || 0)) {
        // Le content JSON peut avoir plus de données que le markdown standard
        const specCount = parseSpecsFromMarkdown(content).length
        if (specCount >= 3) {
          console.log('[html-fallback] ✓ Jina JSON content has', specCount, 'specs')
          return content
        }
      }
    }
  } catch (err) {
    console.warn('[html-fallback] Jina JSON failed:', err)
  }

  // ── Stratégie 2 : CORS proxy pour fetch HTML brut ──
  const corsProxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(pageUrl)}`,
  ]
  for (const proxyUrl of corsProxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) continue
      const html = await res.text()
      if (!html || html.length < 500) continue
      console.log('[html-fallback] CORS proxy got', html.length, 'chars from', proxyUrl.split('?')[0])
      const result = extractSpecsFromHtml(html)
      if (result && result.split('\n').filter((l: string) => l.startsWith('|')).length >= 2) {
        console.log('[html-fallback] ✓ extracted specs from CORS proxy HTML')
        return result
      }
    } catch { /* proxy failed, try next */ }
  }

  console.log('[html-fallback] all strategies exhausted')
  return null
}

/** Parse le HTML (via DOMParser) et extrait les specs en markdown */
function extractSpecsFromHtml(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const mdParts: string[] = []

  // ── 1. JSON-LD structured data (Product schema) ──
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]')
  for (const script of jsonLdScripts) {
    try {
      let data = JSON.parse(script.textContent ?? '')
      // Gérer @graph (wrapper courant)
      if (data['@graph']) data = data['@graph']
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const type = item['@type']
        if (type !== 'Product' && !(Array.isArray(type) && type.includes('Product'))) continue
        if (item.name) mdParts.push(`# ${item.name}`)
        if (item.description) mdParts.push(`\n${item.description}`)
        // additionalProperty = specs
        if (Array.isArray(item.additionalProperty)) {
          mdParts.push('\n## Spécifications (JSON-LD)')
          for (const prop of item.additionalProperty) {
            if (prop.name && prop.value != null) {
              mdParts.push(`| ${prop.name} | ${prop.value}${prop.unitText ? ' ' + prop.unitText : ''} |`)
            }
          }
        }
        // weight, width, height, depth
        for (const dim of ['weight', 'width', 'height', 'depth']) {
          const val = item[dim]
          if (val?.value != null) {
            mdParts.push(`| ${dim} | ${val.value}${val.unitText ? ' ' + val.unitText : ''} |`)
          }
        }
      }
    } catch { /* JSON-LD invalide */ }
  }

  // ── 2. Extraire TOUT le contenu textuel structuré (accordéons inclus) ──
  // Sur les SPA, le contenu est dans le DOM même si masqué par CSS.
  // DOMParser ne filtre PAS par display:none — on récupère tout.
  const processedEls = new Set<Element>()

  const accordionSelectors = [
    // Générique accordéon
    '[data-accordion-content]', '[data-accordion-body]', '[data-collapse-content]',
    '.accordion-content', '.accordion-body', '.accordion__body', '.accordion__content',
    '.accordion-panel', '.accordion__panel',
    '.collapse-content', '.collapsible-content', '.panel-collapse',
    // Tabs
    '.tab-content', '.tab-pane', '[role="tabpanel"]',
    // Specs spécifiques
    '.product-specs', '.product-specifications', '.specifications-table',
    '.specs-content', '.spec-table', '.technical-data', '.technical-specs',
    // Wildcard (attrape Milwaukee, Bosch, Makita, DeWalt, etc.)
    '[class*="accordion"]', '[class*="Accordion"]',
    '[class*="collapse"]', '[class*="Collapse"]',
    '[class*="specification"]', '[class*="Specification"]',
    '[class*="spec-"]', '[class*="Spec-"]',
    '[class*="technical"]', '[class*="Technical"]',
    '[class*="product-detail"]', '[class*="ProductDetail"]',
    '[class*="feature"]', '[class*="Feature"]',
  ]

  /** Extraire les paires clé/valeur d'un élément DOM */
  function extractKvFromElement(el: Element, heading?: string): void {
    if (heading && heading.length < 80 && !isGarbageContent(heading)) {
      mdParts.push(`\n## ${heading}`)
    }

    // Tables internes
    const tables = el.querySelectorAll('table')
    for (const table of tables) {
      processedEls.add(table)
      const rows = table.querySelectorAll('tr')
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th')
        if (cells.length >= 2) {
          const n = cells[0].textContent?.trim()
          const v = cells[1].textContent?.trim()
          if (n && v && !/^[-:]+$/.test(n)) mdParts.push(`| ${n} | ${v} |`)
        }
      }
    }

    // dt/dd
    const dts = el.querySelectorAll('dt')
    const dds = el.querySelectorAll('dd')
    if (dts.length > 0 && dds.length > 0) {
      const count = Math.min(dts.length, dds.length)
      for (let i = 0; i < count; i++) {
        const n = dts[i].textContent?.trim()
        const v = dds[i].textContent?.trim()
        if (n && v) mdParts.push(`| ${n} | ${v} |`)
      }
    }

    // li contenant des specs
    const lis = el.querySelectorAll('li')
    for (const li of lis) {
      const text = li.textContent?.trim()
      if (!text || text.length < 5 || text.length > 300 || isGarbageContent(text)) continue
      // "Nom : Valeur" dans un <li>
      const kv = text.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
      if (kv) {
        mdParts.push(`| ${kv[1].trim()} | ${kv[2].trim()} |`)
      } else {
        // Chercher un <strong>/<b> suivi de texte
        const strong = li.querySelector('strong, b, span[class*="label"], span[class*="name"]')
        if (strong) {
          const name = strong.textContent?.trim()
          const rest = text.replace(name ?? '', '').replace(/^[\s:–—-]+/, '').trim()
          if (name && rest && rest.length > 1) mdParts.push(`| ${name} | ${rest} |`)
        }
      }
    }

    // Si pas de table/dt/li, fallback texte brut
    if (tables.length === 0 && dts.length === 0 && lis.length === 0) {
      const text = el.textContent?.trim()
      if (!text) return
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2 && l.length < 200)
      for (const line of lines) {
        if (isGarbageContent(line)) continue
        const kv = line.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
          || line.match(/^(.{2,50})\t+(.{1,200})$/)
        if (kv) mdParts.push(`| ${kv[1].trim()} | ${kv[2].trim()} |`)
      }
    }
  }

  for (const sel of accordionSelectors) {
    try {
      const els = doc.querySelectorAll(sel)
      for (const el of els) {
        if (processedEls.has(el)) continue
        processedEls.add(el)
        const text = el.textContent?.trim()
        if (!text || text.length < 5 || isGarbageContent(text)) continue

        // Trouver le heading de l'accordéon
        const parentBtn = el.previousElementSibling
        const heading = parentBtn?.textContent?.trim()
          || el.closest('[data-accordion-item], [class*="accordion-item"], [class*="AccordionItem"]')
              ?.querySelector('button, h2, h3, h4, [class*="title"], [class*="header"], [class*="trigger"]')
              ?.textContent?.trim()

        extractKvFromElement(el, heading)
      }
    } catch { /* sélecteur invalide */ }
  }

  // ── 3. Tables de specs orphelines (pas dans un accordéon) ──
  const allTables = doc.querySelectorAll('table')
  for (const table of allTables) {
    if (processedEls.has(table)) continue
    const tableText = table.textContent?.trim() ?? ''
    if (tableText.length < 20 || tableText.length > 10000 || isGarbageContent(tableText)) continue

    const rows = table.querySelectorAll('tr')
    let specCount = 0
    const tableLines: string[] = []
    for (const row of rows) {
      const cells = row.querySelectorAll('td, th')
      if (cells.length === 2) {
        const n = cells[0].textContent?.trim()
        const v = cells[1].textContent?.trim()
        if (n && v && n.length < 60 && v.length < 200 && !/^[-:]+$/.test(n)) {
          tableLines.push(`| ${n} | ${v} |`)
          if (/\d/.test(v) || /\b(mm|cm|kg|nm|rpm|v|ah|w|hz|db|°|%)\b/i.test(v)) specCount++
        }
      }
    }
    if (specCount >= 2 && tableLines.length >= 2) {
      mdParts.push('\n## Spécifications (table)')
      mdParts.push(...tableLines)
    }
  }

  // ── 4. dl/dt/dd orphelines ──
  const dlElements = doc.querySelectorAll('dl')
  for (const dl of dlElements) {
    if (processedEls.has(dl)) continue
    const dts = dl.querySelectorAll('dt')
    const dds = dl.querySelectorAll('dd')
    if (dts.length >= 2) {
      const count = Math.min(dts.length, dds.length)
      let specCount = 0
      const dlLines: string[] = []
      for (let i = 0; i < count; i++) {
        const n = dts[i].textContent?.trim()
        const v = dds[i].textContent?.trim()
        if (n && v) {
          dlLines.push(`| ${n} | ${v} |`)
          if (/\d/.test(v)) specCount++
        }
      }
      if (specCount >= 2) {
        mdParts.push('\n## Spécifications (définitions)')
        mdParts.push(...dlLines)
      }
    }
  }

  // ── 5. Dernier recours : chercher les paires .label / .value dans le body ──
  if (mdParts.filter(l => l.startsWith('|')).length < 3) {
    const labelValueSelectors = [
      // Paires label+value communes sur les SPA fabricants
      { label: '[class*="spec-label"], [class*="spec-name"], [class*="SpecLabel"], [class*="SpecName"]',
        value: '[class*="spec-value"], [class*="spec-data"], [class*="SpecValue"], [class*="SpecData"]' },
      { label: '[class*="attr-label"], [class*="attr-name"], [class*="AttrLabel"]',
        value: '[class*="attr-value"], [class*="attr-data"], [class*="AttrValue"]' },
      { label: '[class*="feature-label"], [class*="feature-name"]',
        value: '[class*="feature-value"], [class*="feature-data"]' },
      { label: '[class*="property-label"], [class*="property-name"]',
        value: '[class*="property-value"], [class*="property-data"]' },
    ]
    for (const { label: lSel, value: vSel } of labelValueSelectors) {
      try {
        const labels = doc.querySelectorAll(lSel)
        const values = doc.querySelectorAll(vSel)
        if (labels.length >= 2 && labels.length === values.length) {
          mdParts.push('\n## Spécifications (DOM)')
          for (let i = 0; i < labels.length; i++) {
            const n = labels[i].textContent?.trim()
            const v = values[i].textContent?.trim()
            if (n && v) mdParts.push(`| ${n} | ${v} |`)
          }
          break
        }
      } catch { /* sélecteur invalide */ }
    }
  }

  if (mdParts.length === 0) {
    console.log('[html-fallback] no structured data found in HTML')
    return null
  }

  const result = mdParts.join('\n').trim()
  const specLines = result.split('\n').filter(l => l.startsWith('|')).length
  console.log('[html-fallback] extracted', result.length, 'chars,', specLines, 'spec lines')
  return result
}



// ── Détection site fabricant officiel ────────────────────────────────────────

/** Domaines connus des sites fabricants officiels (clé = slug marque). */
const MANUFACTURER_DOMAINS: Record<string, string[]> = {
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
function detectManufacturerSite(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const [brand, domains] of Object.entries(MANUFACTURER_DOMAINS)) {
      if (domains.some(d => host === d || host.endsWith('.' + d))) return brand
    }
    return null
  } catch { return null }
}

// ── Scraping avancé des sites fabricants (REDUX store, embedded data) ────────

interface ManufacturerData {
  downloads: Array<{ name: string; url: string }>
  variants: Array<{ reference: string; label: string; properties: Record<string, string> }>
  images: string[]
  specs: Array<{ name: string; value: string; group?: string }>
  description: string
}


export interface DeepScrapeResult {
  markdown: string
  html: string | null
  source: 'post-browser' | 'get-fallback' | 'basic-merged'
}

/**
 * Scrape optimisé pour les sites fabricants via Jina Reader.
 * Utilise des headers avancés (X-Wait-For-Selector, X-Target-Selector, X-Engine)
 * pour forcer le rendu complet des accordéons / sections dynamiques.
 */
async function jinaScrapeMaufacturerPage(pageUrl: string): Promise<DeepScrapeResult | null> {
  console.log('[jina-manufacturer] deep scraping →', pageUrl)

  // JavaScript injecté dans la page via Jina injectPageScript.
  // IMPORTANT : le script s'exécute AVANT les scripts de la page.
  // On utilise setInterval pour attendre que le framework JS de la page soit prêt.
  //
  // Stratégies universelles :
  // 1. Relay (TTI : Milwaukee, Ryobi, AEG) → extraire les IDs, appeler l'API specs
  // 2. Accordéons classiques → cliquer/ouvrir tous les éléments repliés
  // 3. Next.js / Nuxt → extraire __NEXT_DATA__ / __NUXT__
  //
  // Le contenu extrait est injecté via document.body.prepend(div) avec innerText
  // car c'est la seule méthode capturée par Jina (appendChild + innerHTML ne marchent pas).
  const EXPAND_ACCORDIONS_SCRIPT = `
(function() {
  // ── Ouvrir les accordéons classiques (universel, tout type de site) ──
  function expandAll() {
    var sels = [
      '[aria-expanded="false"]',
      '[data-toggle="collapse"]', '[data-bs-toggle="collapse"]',
      '.accordion-header', '.accordion__header', '.accordion-trigger',
      '.accordion-button.collapsed',
      'details:not([open]) > summary',
      '[role="tab"][aria-selected="false"]', '[role="tab"]:not([aria-selected="true"])',
      '[class*="accordion"] button', '[class*="collapse"] button',
      '.tab-link:not(.active)', '[class*="tab-button"]:not(.active)',
      '[class*="spec"] [class*="toggle"]', '[class*="spec"] [class*="expand"]',
      '[class*="tab-item"]:not(.active)', '[data-tab]:not(.active)',
      '.expandable:not(.expanded)', '[class*="show-more"]', '[class*="read-more"]',
      '[class*="collapsible"] [class*="header"]', '[class*="panel-heading"]',
      'button[class*="more"]', 'a[class*="more"]'
    ];
    sels.forEach(function(sel) {
      try { document.querySelectorAll(sel).forEach(function(el) { try { el.click(); } catch(e) {} }); } catch(e) {}
    });
    document.querySelectorAll('details:not([open])').forEach(function(d) { d.setAttribute('open', ''); });
    // Ouvrir tous les contenus cachés (accordéons, onglets, sections repliées)
    var hiddenSels = [
      '.collapse:not(.show)', '[class*="accordion-content"]', '[class*="accordion__content"]',
      '[class*="tab-panel"][hidden]', '[class*="tab-pane"]:not(.active)',
      '[class*="panel-body"][style*="display: none"]', '[class*="panel-body"][style*="display:none"]',
      '[role="tabpanel"][hidden]', '[role="tabpanel"][aria-hidden="true"]',
      '[class*="collapsible-content"]', '[class*="expandable-content"]',
      '[class*="spec"][style*="display: none"]', '[class*="spec"][style*="display:none"]',
      '[class*="hidden-content"]', '[class*="more-content"]',
      '[data-expanded="false"]', '[aria-hidden="true"][class*="panel"]'
    ];
    hiddenSels.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          el.style.display = 'block'; el.style.height = 'auto'; el.style.overflow = 'visible';
          el.style.maxHeight = 'none'; el.style.opacity = '1'; el.style.visibility = 'visible';
          el.classList.add('show', 'in', 'active'); el.classList.remove('collapsed', 'hidden', 'hide');
          el.removeAttribute('hidden'); el.setAttribute('aria-hidden', 'false');
        });
      } catch(e) {}
    });
  }

  // ── Navigation séquentielle des onglets (appelée à chaque tick du polling) ──
  var _tabClickIdx = 0;
  function cycleTabs() {
    var tabSels = [
      '[role="tab"]',
      '.nav-link[data-toggle="tab"]', '.nav-link[data-bs-toggle="tab"]',
      '.tab-link', '[class*="tab-button"]', '[class*="tab-trigger"]',
      '[class*="tab-item"] a', '[class*="tab-item"] button',
      '[data-tab]', '.tabs__link', '.product-tabs a', '.product-tab'
    ];
    var allTabs = [];
    tabSels.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          if (allTabs.indexOf(el) === -1) allTabs.push(el);
        });
      } catch(e) {}
    });
    if (allTabs.length > 1 && _tabClickIdx < allTabs.length) {
      try { allTabs[_tabClickIdx].click(); } catch(e) {}
      _tabClickIdx++;
      // Forcer TOUS les panneaux d'onglets à rester visibles après le clic
      setTimeout(function() {
        var panelSels = [
          '[role="tabpanel"]', '[class*="tab-pane"]', '[class*="tab-content"] > *',
          '[class*="tab-panel"]', '[class*="product-tab-content"]'
        ];
        panelSels.forEach(function(sel) {
          try {
            document.querySelectorAll(sel).forEach(function(el) {
              el.style.display = 'block';
              el.style.visibility = 'visible';
              el.style.height = 'auto';
              el.style.opacity = '1';
              el.style.overflow = 'visible';
              el.removeAttribute('hidden');
              el.setAttribute('aria-hidden', 'false');
            });
          } catch(e) {}
        });
      }, 150);
    }
  }

  // ── Extraire les specs depuis les frameworks SPA (polling — attend le chargement) ──
  function tryExtractSPA() {
    // ── Relay (TTI Group : Milwaukee, Ryobi, AEG) ──
    if (window.Relay && window.Relay.components) {
      var comps = window.Relay.components;
      var specComp = null;
      for (var i = 0; i < comps.length; i++) {
        if (comps[i].name === 'ProductSpecifications') specComp = comps[i];
      }
      if (specComp) {
        try {
          var props = JSON.parse(specComp.props);
          var pd = props.reduxContext && props.reduxContext.productDetail;
          if (pd && pd.modelAgilityId && pd.selectedVariantAgilityId) {
            var culture = (props.pageContext && props.pageContext.documentCulture) || 'fr-FR';
            var apiUrl = '/api/product-detail/product-specifications?modelAgilityId=' + pd.modelAgilityId
              + '&variantAgilityId=' + pd.selectedVariantAgilityId + '&cultureCode=' + culture + '&published=true';
            var xhr = new XMLHttpRequest();
            xhr.open('GET', apiUrl, false);
            xhr.send();
            if (xhr.status === 200) {
              var data = JSON.parse(xhr.responseText);
              if (Array.isArray(data) && data.length > 0) {
                var txt = 'JINA_EXTRACTED_SPECS_START\\n';
                data.forEach(function(g) {
                  txt += 'GROUP: ' + (g.title || g.name || '').trim() + '\\n';
                  (g.specifications || []).forEach(function(s) {
                    var n = (s.title || s.name || '');
                    var v = (s.value || '');
                    if (n && v) txt += n.trim() + ' = ' + v.trim() + '\\n';
                  });
                });
                txt += 'JINA_EXTRACTED_SPECS_END';
                var div = document.createElement('div');
                div.innerText = txt;
                document.body.prepend(div);
              }
            }
            // ── Images & Downloads : scanner TOUS les composants Relay pour trouver les assets complets ──
            var imgTxt = '';
            var dlTxt = '';
            var seen = {};
            // Chercher productDetail dans TOUS les composants (pas seulement ProductSpecifications)
            for (var ci = 0; ci < comps.length; ci++) {
              try {
                var cProps = (ci === (function() { for (var si = 0; si < comps.length; si++) { if (comps[si] === specComp) return si; } return -1; })()) ? props : JSON.parse(comps[ci].props);
                var cpd = cProps.reduxContext && cProps.reduxContext.productDetail;
                if (!cpd) continue;
                // Assets images
                var assets = cpd.assets;
                if (assets) {
                  var allKeys = Object.keys(assets);
                  allKeys.forEach(function(gk) {
                    var arr = assets[gk];
                    if (Array.isArray(arr)) {
                      arr.forEach(function(a) {
                        var url = a.imageUrl || a.url || a.src || a.original || '';
                        if (url && url.indexOf('http') === 0 && !seen[url]) {
                          seen[url] = true;
                          imgTxt += url + '\\n';
                        }
                      });
                    }
                  });
                }
                // Fallback pd.images
                if (Array.isArray(cpd.images)) {
                  cpd.images.forEach(function(img) {
                    var url = typeof img === 'string' ? img : (img.url || img.src || img.imageUrl || '');
                    if (url && url.indexOf('http') === 0 && !seen[url]) {
                      seen[url] = true;
                      imgTxt += url + '\\n';
                    }
                  });
                }
                // Packshots from includedProducts (kit components: bare tool, battery, charger, etc.)
                if (Array.isArray(cpd.includedProducts)) {
                  cpd.includedProducts.forEach(function(p) {
                    var url = p.imageUrl || p.image || p.thumbnailUrl || '';
                    if (url && url.indexOf('http') === 0 && !seen[url]) {
                      seen[url] = true;
                      imgTxt += url + '\\n';
                    }
                  });
                }
                // Downloads
                if (Array.isArray(cpd.downloads) && !dlTxt) {
                  cpd.downloads.forEach(function(dl) {
                    var name = dl.name || dl.title || dl.fileName || 'Document';
                    var url = dl.url || dl.downloadUrl || dl.fileUrl || dl.href || '';
                    if (url) dlTxt += name + ' | ' + url + '\\n';
                  });
                }
              } catch(ce) {}
            }
            if (imgTxt) {
              var imgDiv = document.createElement('div');
              imgDiv.innerText = 'JINA_EXTRACTED_IMAGES_START\\n' + imgTxt + 'JINA_EXTRACTED_IMAGES_END';
              document.body.prepend(imgDiv);
            }
            if (dlTxt) {
              var dlDiv = document.createElement('div');
              dlDiv.innerText = 'JINA_EXTRACTED_DOWNLOADS_START\\n' + dlTxt + 'JINA_EXTRACTED_DOWNLOADS_END';
              document.body.prepend(dlDiv);
            }
            return true;
          }
        } catch(e) {}
      }
    }

    // ── __NEXT_DATA__ (Next.js : DeWalt, Bosch, etc.) ──
    if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
      try {
        var nd = JSON.stringify(window.__NEXT_DATA__.props);
        if (nd.length > 500 && (nd.indexOf('specification') !== -1 || nd.indexOf('technical') !== -1)) {
          var div = document.createElement('div');
          div.innerText = 'NEXT_DATA_SPECS: ' + nd.substring(0, 30000);
          document.body.prepend(div);
          return true;
        }
      } catch(e) {}
    }

    // ── __NUXT__ (Nuxt.js) ──
    if (window.__NUXT__ && window.__NUXT__.data) {
      try {
        var nuxt = JSON.stringify(window.__NUXT__.data);
        if (nuxt.length > 500) {
          var div = document.createElement('div');
          div.innerText = 'NUXT_DATA_SPECS: ' + nuxt.substring(0, 30000);
          document.body.prepend(div);
          return true;
        }
      } catch(e) {}
    }

    // ── Generic window.* product object detection + HATEOAS API links ──
    // Scans common global variable names for product-like objects,
    // then follows HATEOAS links ({exist, link: {rel, href}}) to fetch API data.
    var PRODUCT_GLOBALS = ['product', 'productData', 'productInfo', 'pageProduct',
      'currentProduct', 'productDetail', 'itemData', 'pdpData', 'productConfig'];
    var ID_KEYS = ['productnumber', 'sku', 'productid', 'articlenumber', 'itemid',
      'gtin', 'ean', 'upc', 'mpn', 'partnumber', 'itemno', 'modelnumber', 'reference'];

    for (var pgi = 0; pgi < PRODUCT_GLOBALS.length; pgi++) {
      var pObj = window[PRODUCT_GLOBALS[pgi]];
      if (!pObj || typeof pObj !== 'object' || Array.isArray(pObj)) continue;

      var pKeys = Object.keys(pObj);
      if (pKeys.length < 3) continue;

      // Vérifier que l'objet a un champ "nom" ET/OU un champ "identifiant"
      var hasNameF = false;
      var hasIdF = false;
      for (var pki = 0; pki < pKeys.length; pki++) {
        var lk = pKeys[pki].toLowerCase().replace(/[_-]/g, '');
        if (lk === 'name' || lk === 'title' || lk === 'productname') hasNameF = true;
        for (var idi = 0; idi < ID_KEYS.length; idi++) {
          if (lk === ID_KEYS[idi]) { hasIdF = true; break; }
        }
      }
      if (!hasNameF && !hasIdF) continue;

      // ── Objet produit confirmé — extraction des données ──
      var gwSpecs = '';
      var gwImgs = [];
      var gwDesc = '';
      var gwDocs = '';

      // 1. Collecter les endpoints HATEOAS : { key: { exist: bool, link: { rel, href } } }
      var endpoints = [];
      for (var hki = 0; hki < pKeys.length; hki++) {
        var hVal = pObj[pKeys[hki]];
        if (!hVal || typeof hVal !== 'object' || Array.isArray(hVal)) continue;
        // Lien simple : { exist, link: { rel, href } }
        if (hVal.link && typeof hVal.link === 'object' && hVal.link.href) {
          endpoints.push({ key: pKeys[hki], rel: hVal.link.rel || pKeys[hki], href: hVal.link.href, exist: !!hVal.exist });
        }
        // Liens multiples : { links: [{ rel, href }] }
        if (hVal.links && Array.isArray(hVal.links)) {
          for (var hli = 0; hli < hVal.links.length; hli++) {
            if (hVal.links[hli] && hVal.links[hli].href) {
              endpoints.push({ key: pKeys[hki], rel: hVal.links[hli].rel || pKeys[hki], href: hVal.links[hli].href, exist: true });
            }
          }
        }
      }

      // Si pas assez de liens HATEOAS et objet trop simple, skip
      if (endpoints.length === 0 && pKeys.length < 8) continue;

      // 2. Fetch des endpoints de données via XHR synchrone
      for (var epi = 0; epi < endpoints.length; epi++) {
        var ep = endpoints[epi];
        if (!ep.exist) continue;
        var ek = ep.key.toLowerCase();
        var er = (ep.rel || '').toLowerCase();

        // Endpoints images → collecter les URLs
        if (er.indexOf('image') !== -1 || er.indexOf('photo') !== -1 || er.indexOf('picture') !== -1) {
          gwImgs.push(ep.href);
          continue;
        }
        // Skip endpoints média/dessin (pas des données textuelles)
        if (er.indexOf('curve') !== -1 || er.indexOf('drawing') !== -1 || er.indexOf('diagram') !== -1 ||
            er.indexOf('cad') !== -1 || er.indexOf('sound') !== -1 || er.indexOf('vibration') !== -1 ||
            er.indexOf('motor') !== -1 || er.indexOf('sizing') !== -1 || er.indexOf('lifecycle') !== -1 ||
            er.indexOf('submittal') !== -1 || er.indexOf('load') !== -1 || er.indexOf('zeta') !== -1 ||
            er.indexOf('replacement') !== -1 || er.indexOf('installation') !== -1) continue;

        try {
          var epXhr = new XMLHttpRequest();
          epXhr.open('GET', ep.href, false);
          epXhr.setRequestHeader('Accept', 'application/json');
          epXhr.send();
          if (epXhr.status !== 200) continue;

          var epJson;
          try { epJson = JSON.parse(epXhr.responseText); } catch(pe) { continue; }

          // Pattern A : { datavalues: [{ label, description, value, unit }] }
          var dvArr = epJson.datavalues || epJson.data || epJson.values || epJson.attributes || epJson.specifications;
          if (dvArr && Array.isArray(dvArr) && dvArr.length > 0 && dvArr[0] && typeof dvArr[0] === 'object') {
            var groupLabel = ep.key.charAt(0).toUpperCase() + ep.key.slice(1).replace(/([A-Z])/g, ' $1').trim();
            gwSpecs += 'GROUP: ' + groupLabel + '\\n';
            for (var dvi = 0; dvi < dvArr.length; dvi++) {
              var dvItem = dvArr[dvi];
              var dvName = dvItem.description || dvItem.label || dvItem.name || dvItem.title || '';
              var dvVal = (dvItem.value != null) ? String(dvItem.value) : '';
              var dvUnit = dvItem.unit || dvItem.uom || '';
              if (dvName && dvVal && dvVal !== 'null' && dvVal !== '') {
                gwSpecs += dvName.trim() + ' = ' + dvVal.trim() + (dvUnit ? ' ' + dvUnit.trim() : '') + '\\n';
              }
            }
          }

          // Pattern B : { entities: [{ text, languagecode }] } — description/quotation
          if (epJson.entities && Array.isArray(epJson.entities)) {
            for (var enti = 0; enti < epJson.entities.length; enti++) {
              var entTxt = epJson.entities[enti].text || epJson.entities[enti].description || '';
              if (entTxt && entTxt.length > gwDesc.length) gwDesc = entTxt;
            }
          }

          // Pattern C : { text: "..." } — description directe
          if (epJson.text && typeof epJson.text === 'string' && epJson.text.length > 50 && epJson.text.length > gwDesc.length) {
            gwDesc = epJson.text;
          }

          // Pattern D : tableau plat [{ name, value }]
          if (Array.isArray(epJson) && epJson.length > 0 && epJson[0] && epJson[0].name && epJson[0].value != null) {
            gwSpecs += 'GROUP: ' + ep.key + '\\n';
            for (var fai = 0; fai < epJson.length; fai++) {
              if (epJson[fai].name && epJson[fai].value != null) {
                gwSpecs += String(epJson[fai].name).trim() + ' = ' + String(epJson[fai].value).trim() + '\\n';
              }
            }
          }

          // Pattern E : { groups: [{ title, items: [{ name, value }] }] } — specs groupées
          var grpArr = epJson.groups || epJson.specGroups || epJson.sections || epJson.categories;
          if (grpArr && Array.isArray(grpArr) && grpArr.length > 0) {
            for (var gi = 0; gi < grpArr.length; gi++) {
              var grp = grpArr[gi];
              var grpTitle = grp.title || grp.name || grp.label || '';
              if (grpTitle) gwSpecs += 'GROUP: ' + grpTitle.trim() + '\\n';
              var grpItems = grp.items || grp.specifications || grp.attributes || grp.values || [];
              if (Array.isArray(grpItems)) {
                for (var gii = 0; gii < grpItems.length; gii++) {
                  var gi2 = grpItems[gii];
                  var giName = gi2.description || gi2.label || gi2.name || gi2.title || '';
                  var giVal = (gi2.value != null) ? String(gi2.value) : '';
                  var giUnit = gi2.unit || gi2.uom || '';
                  if (giName && giVal) {
                    gwSpecs += giName.trim() + ' = ' + giVal.trim() + (giUnit ? ' ' + giUnit.trim() : '') + '\\n';
                  }
                }
              }
            }
          }

          // Pattern F : service/spare parts — [{ parts: [{ name, qty }] }] or similar
          if (ek.indexOf('service') !== -1 || ek.indexOf('spare') !== -1) {
            var partsList = epJson.parts || epJson.spareparts || epJson.serviceparts;
            if (!partsList && epJson.entities) {
              // Nested in entities
              for (var sei = 0; sei < epJson.entities.length; sei++) {
                if (epJson.entities[sei].parts) { partsList = epJson.entities[sei].parts; break; }
                if (epJson.entities[sei].serviceparts) { partsList = epJson.entities[sei].serviceparts; break; }
              }
            }
            if (partsList && Array.isArray(partsList) && partsList.length > 0) {
              gwSpecs += 'GROUP: Service Parts\\n';
              for (var spi = 0; spi < partsList.length; spi++) {
                var sp = partsList[spi];
                var spName = sp.name || sp.description || sp.title || '';
                var spQty = sp.qty || sp.quantity || '';
                if (spName) gwSpecs += spName.trim() + (spQty ? ' = Qty: ' + spQty : '') + '\\n';
              }
            }
          }
        } catch(fetchErr) { /* skip failed endpoints */ }
      }

      // 3. Extraire les champs scalaires directs de l'objet global
      var directTxt = '';
      var skipFieldNames = ['exist', 'link', 'links', 'configured', 'hascad', 'saleable',
        'crmsaleable', 'hideprice', 'inproductrange', 'issparepart', 'iseproduct',
        'pricestatus', 'productstatus', 'isdiscontinued'];
      for (var fki = 0; fki < pKeys.length; fki++) {
        var fk = pKeys[fki];
        if (skipFieldNames.indexOf(fk.toLowerCase()) !== -1) continue;
        var fv = pObj[fk];
        if (typeof fv === 'object') continue;
        if (typeof fv === 'boolean') continue;
        if (typeof fv === 'string' && (fv.length === 0 || fv.length > 200)) continue;
        if (typeof fv === 'string' || typeof fv === 'number') {
          directTxt += fk + ' = ' + String(fv) + '\\n';
        }
      }

      // 4. Injecter dans le DOM
      if (gwSpecs || directTxt) {
        var fullTxt = 'JINA_EXTRACTED_SPECS_START\\n';
        if (directTxt) fullTxt += 'GROUP: Product\\n' + directTxt;
        fullTxt += gwSpecs;
        fullTxt += 'JINA_EXTRACTED_SPECS_END';
        var specDiv = document.createElement('div');
        specDiv.innerText = fullTxt;
        document.body.prepend(specDiv);
      }

      if (gwImgs.length > 0) {
        var imgDiv = document.createElement('div');
        imgDiv.innerText = 'JINA_EXTRACTED_IMAGES_START\\n' + gwImgs.join('\\n') + '\\nJINA_EXTRACTED_IMAGES_END';
        document.body.prepend(imgDiv);
      }

      if (gwDesc) {
        var descDiv = document.createElement('div');
        descDiv.innerText = '# Product Description\\n\\n' + gwDesc;
        document.body.prepend(descDiv);
      }

      return true;
    }

    return false;
  }

  // Exécution immédiate : accordéons + premier onglet
  expandAll();
  cycleTabs();

  // Polling : attendre que le framework SPA soit prêt (max 10s)
  // Chaque tick : expand accordéons + cliquer l'onglet suivant + tenter extraction
  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;
    expandAll();
    cycleTabs();
    if (tryExtractSPA() || attempts > 50) {
      clearInterval(interval);
    }
  }, 200);
})();
`

  try {
    const jinaKey = getApiKey('jina')
    if (!jinaKey) {
      console.warn('[jina-manufacturer] ⚠ no Jina API key — falling back to basic scrape')
      const fallbackMd = await jinaScrapeMarkdown(pageUrl)
      return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
    }

    // POST avec injectPageScript pour exécuter le JS d'expansion des accordéons
    console.log('[jina-manufacturer] POST with injectPageScript to expand accordions')
    const res = await fetch('https://r.jina.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${jinaKey}`,
        'X-Engine': 'browser',
        'X-Timeout': '60',
        'X-No-Cache': 'true',
        'X-With-Links-Summary': 'all',
        'X-With-Images-Summary': 'all',
        'X-With-Iframe': 'true',
        'X-With-Shadow-Dom': 'true',
        'X-Return-Format': 'html,markdown',
      },
      body: JSON.stringify({
        url: pageUrl,
        injectPageScript: [EXPAND_ACCORDIONS_SCRIPT],
      }),
    })

    if (!res.ok) {
      console.warn('[jina-manufacturer] POST HTTP error', res.status, '— falling back to GET then basic')
      // Fallback : essayer GET classique sans JS injection
      return jinaScrapeMaufacturerPageFallback(pageUrl, jinaKey)
    }

    const json = await res.json() as { data?: { content?: string; html?: string; links?: Record<string, string>; images?: Record<string, string> } }
    let md = json?.data?.content || ''
    const postImages = json?.data?.images
    const postLinks = json?.data?.links
    const capturedHtml: string | null = json?.data?.html ?? null

    if (!md || md.length < 100) {
      console.warn('[jina-manufacturer] POST returned empty content — falling back to GET')
      return jinaScrapeMaufacturerPageFallback(pageUrl, jinaKey)
    }

    // Nettoyage cookie/GDPR
    md = md
      .replace(/#{1,4}\s*(Your Privacy|Cookie|GDPR|Manage Preferences|Bienvenue chez)[\s\S]*?(?=\n#{1,4}\s|\n\n---|\n\n\*\*|$)/gi, '')
      .replace(/^[-*•]\s*.*?(cookie|privacy|captcha|recaptcha|consent|targeting|functional|necessary).*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    console.log('[jina-manufacturer] POST got', md.length, 'chars (with JS accordion expand)')

    // Injecter images et documents PDF depuis le JSON response
    if (postImages && typeof postImages === 'object') {
      const imgEntries = Object.entries(postImages).filter(([, url]) => typeof url === 'string' && url.startsWith('http'))
      if (imgEntries.length > 0 && md.indexOf('JINA_EXTRACTED_IMAGES_START') === -1) {
        md += '\n\nJINA_EXTRACTED_IMAGES_START\n' + imgEntries.map(([, url]) => url).join('\n') + '\nJINA_EXTRACTED_IMAGES_END'
        console.log('[jina-manufacturer] ✓ injected', imgEntries.length, 'images from POST JSON')
      }
    }
    if (postLinks && typeof postLinks === 'object') {
      const DOC_EXT = /\.(pdf|docx?|xlsx?)(\?[^"']*)?$/i
      const docEntries = Object.entries(postLinks).filter(([, href]) => DOC_EXT.test(href))
      if (docEntries.length > 0 && md.indexOf('JINA_EXTRACTED_DOWNLOADS_START') === -1) {
        md += '\n\nJINA_EXTRACTED_DOWNLOADS_START\n' + docEntries.map(([title, url]) => `${title}##${url}`).join('\n') + '\nJINA_EXTRACTED_DOWNLOADS_END'
        console.log('[jina-manufacturer] ✓ injected', docEntries.length, 'documents from POST JSON')
      }
    }

    const deepSpecs = parseSpecsFromMarkdown(md).length
    const deepAdvs = parseAdvantagesFromMarkdown(md).length
    console.log('[jina-manufacturer] POST scrape quality:', { specs: deepSpecs, advantages: deepAdvs })

    // TOUJOURS fusionner avec le GET JSON pour avoir un maximum de données
    // Le POST capture les accordéons expandés, le GET capture la structure + images JSON
    const basicMd = await jinaScrapeMarkdown(pageUrl)
    if (basicMd) {
      const basicSpecs = parseSpecsFromMarkdown(basicMd).length
      const basicAdvs = parseAdvantagesFromMarkdown(basicMd).length
      console.log('[jina-manufacturer] basic scrape quality:', { specs: basicSpecs, advantages: basicAdvs })
      // Fusionner les deux sources (dédoublonner specs au moment du parsing)
      if (basicMd.length > 200) {
        md = md + '\n\n' + basicMd
        console.log('[jina-manufacturer] ✓ merged POST + JSON →', md.length, 'chars')
      }
    }

    return { markdown: md, html: capturedHtml, source: 'post-browser' as const }
  } catch (err) {
    console.warn('[jina-manufacturer] POST scrape failed:', err)
    const fallbackMd = await jinaScrapeMarkdown(pageUrl)
    return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
  }
}

/** Fallback GET pour le scraping fabricant (sans injection JS) — utilise le mode JSON */
async function jinaScrapeMaufacturerPageFallback(pageUrl: string, jinaKey: string): Promise<DeepScrapeResult | null> {
  // Réutilise jinaScrapeMarkdown qui est déjà en mode JSON avec images/links
  console.log('[jina-manufacturer-fallback] falling back to JSON mode scrape')
  const fallbackMd = await jinaScrapeMarkdown(pageUrl)
  return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
}

/**
 * Fetch le HTML brut d'une page via CORS proxy et en extrait les données embarquées :
 * - `window.__REDUX_STORE` (TTI Group / sites Relay) → downloads, variants, images
 * - JSON-LD (schema.org Product) → specs, images, description
 * - `window.__NEXT_DATA__` (Next.js) → product data
 * - Embedded JSON in script tags
 */
async function scrapeManufacturerRawData(pageUrl: string): Promise<ManufacturerData> {
  console.log('[manufacturer] fetching raw HTML →', pageUrl)
  const data: ManufacturerData = { downloads: [], variants: [], images: [], specs: [], description: '' }

  const corsProxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(pageUrl)}`,
  ]

  let html = ''
  for (const proxyUrl of corsProxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) })
      if (!res.ok) continue
      html = await res.text()
      if (html.length > 1000) {
        console.log('[manufacturer] CORS proxy got', html.length, 'chars from', proxyUrl.split('?')[0])
        break
      }
    } catch (err) {
      console.warn('[manufacturer] CORS proxy failed:', proxyUrl.split('?')[0], err)
    }
  }

  if (!html || html.length < 1000) {
    console.log('[manufacturer] no HTML from CORS proxies')
    return data
  }

  // ── 1. Parse window.__REDUX_STORE (TTI Group / sites Relay) ──
  // Le regex paresseux \{[\s\S]*?\} s'arrête au premier } — on utilise un extracteur JSON à accolades
  const reduxStart = html.indexOf('window.__REDUX_STORE')
  let reduxJson: string | null = null
  if (reduxStart !== -1) {
    const eqPos = html.indexOf('{', reduxStart)
    if (eqPos !== -1) {
      let depth = 0
      let end = eqPos
      for (let ci = eqPos; ci < html.length && ci < eqPos + 500000; ci++) {
        if (html[ci] === '{') depth++
        else if (html[ci] === '}') { depth--; if (depth === 0) { end = ci + 1; break } }
      }
      if (depth === 0) reduxJson = html.slice(eqPos, end)
    }
  }
  if (reduxJson) {
    try {
      const store = JSON.parse(reduxJson)
      const pd = store?.productDetail
      if (pd) {
        console.log('[manufacturer] REDUX_STORE.productDetail found — keys:', Object.keys(pd))

        // Downloads (PDFs)
        if (Array.isArray(pd.downloads)) {
          for (const dl of pd.downloads) {
            const name = dl.name || dl.title || dl.fileName || 'Document'
            const url = dl.url || dl.downloadUrl || dl.fileUrl || dl.href
            if (url && typeof url === 'string') {
              data.downloads.push({ name: String(name), url })
            }
          }
          console.log('[manufacturer] ✓ downloads:', data.downloads.length)
        }

        // Specs : chercher dans toutes les clés possibles du productDetail
        const specKeys = ['specifications', 'specs', 'technicalData', 'technicalSpecifications',
          'features', 'attributes', 'properties', 'specGroups', 'specificationGroups']
        for (const key of specKeys) {
          if (!pd[key]) continue
          const specData = pd[key]
          // Format 1 : tableau plat [{name, value}]
          if (Array.isArray(specData)) {
            for (const s of specData) {
              if (s.name && s.value != null) {
                data.specs.push({ name: String(s.name), value: String(s.value), group: s.group ? String(s.group) : s.section ? String(s.section) : undefined })
              }
              // Format groupé : { title: "Poids", items: [{name, value}] }
              if (s.title && Array.isArray(s.items)) {
                for (const item of s.items) {
                  if (item.name && item.value != null) {
                    data.specs.push({ name: String(item.name), value: String(item.value), group: String(s.title) })
                  }
                }
              }
              // Format groupé alt : { name: "INFORMATIONS", specifications: [...] }
              if (s.name && Array.isArray(s.specifications)) {
                for (const item of s.specifications) {
                  if (item.name && item.value != null) {
                    data.specs.push({ name: String(item.name), value: String(item.value), group: String(s.name) })
                  }
                }
              }
            }
          }
          // Format 2 : objet { "Poids": [{name, value}], "Puissance": [...] }
          else if (typeof specData === 'object') {
            for (const [groupName, groupSpecs] of Object.entries(specData)) {
              if (Array.isArray(groupSpecs)) {
                for (const s of groupSpecs as Array<Record<string, unknown>>) {
                  if (s.name && s.value != null) {
                    data.specs.push({ name: String(s.name), value: String(s.value), group: groupName })
                  }
                }
              }
            }
          }
          if (data.specs.length > 0) {
            console.log('[manufacturer] ✓ specs from REDUX key "' + key + '":', data.specs.length)
            break
          }
        }

        // Deep search récursif si aucune spec trouvée
        if (data.specs.length === 0) {
          const deepFindSpecs = (obj: unknown, depth = 0, parentKey = ''): void => {
            if (!obj || typeof obj !== 'object' || depth > 6) return
            if (Array.isArray(obj)) {
              // Tableau d'objets avec {name, value} → specs
              if (obj.length >= 2 && obj[0]?.name && obj[0]?.value != null) {
                const looksLikeSpecs = obj.every((item: Record<string, unknown>) =>
                  item.name && item.value != null && String(item.name).length < 80)
                if (looksLikeSpecs) {
                  const group = parentKey.replace(/([A-Z])/g, ' $1').trim()
                  for (const item of obj) {
                    data.specs.push({ name: String(item.name), value: String(item.value), group: group || undefined })
                  }
                  console.log('[manufacturer] ✓ deep-found', obj.length, 'specs under key "' + parentKey + '"')
                }
              }
              for (const item of obj) deepFindSpecs(item, depth + 1, parentKey)
            } else {
              for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
                deepFindSpecs(v, depth + 1, k)
              }
            }
          }
          deepFindSpecs(pd)
          if (data.specs.length > 0) console.log('[manufacturer] ✓ deep search found', data.specs.length, 'specs total')
        }

        // Variants
        if (Array.isArray(pd.variants)) {
          for (const v of pd.variants) {
            const ref = v.modelCode || v.sku || v.reference || v.articleNumber || ''
            const label = v.name || v.title || v.label || v.description || ''
            const properties: Record<string, string> = {}
            if (v.color) properties['Couleur'] = v.color
            if (v.size) properties['Taille'] = v.size
            if (v.packaging) properties['Conditionnement'] = v.packaging
            for (const [k, val] of Object.entries(v)) {
              if (typeof val === 'string' && !['modelCode', 'sku', 'reference', 'articleNumber', 'name', 'title', 'label', 'description', 'color', 'size', 'packaging', 'id', 'agilityId', 'slug', 'url'].includes(k) && val.length < 100) {
                properties[k] = val
              }
            }
            if (ref) data.variants.push({ reference: String(ref), label: String(label), properties })
          }
          console.log('[manufacturer] ✓ variants:', data.variants.length)
        }

        // Images
        if (Array.isArray(pd.assets)) {
          for (const a of pd.assets) {
            const url = a.url || a.src || a.imageUrl || a.original || ''
            if (typeof url === 'string' && /^https?:\/\//.test(url) && /\.(jpe?g|png|webp)/i.test(url)) {
              data.images.push(url)
            }
          }
        } else if (Array.isArray(pd.images)) {
          for (const img of pd.images) {
            const url = typeof img === 'string' ? img : (img?.url || img?.src || '')
            if (typeof url === 'string' && /^https?:\/\//.test(url)) data.images.push(url)
          }
        }
        console.log('[manufacturer] ✓ images:', data.images.length)

        // Description from REDUX
        if (pd.description && typeof pd.description === 'string' && pd.description.length > 30) {
          data.description = pd.description
        }
      }

      // Chercher aussi dans d'autres parties du store (pas juste productDetail)
      if (data.specs.length === 0) {
        for (const topKey of Object.keys(store)) {
          if (topKey === 'productDetail') continue
          const section = store[topKey]
          if (!section || typeof section !== 'object') continue
          // Chercher des tableaux avec {name, value} structure
          for (const [k, v] of Object.entries(section)) {
            if (Array.isArray(v) && v.length >= 3 && v[0]?.name && v[0]?.value != null) {
              for (const item of v as Array<Record<string, unknown>>) {
                if (item.name && item.value != null && String(item.name).length < 80) {
                  data.specs.push({ name: String(item.name), value: String(item.value), group: k })
                }
              }
              if (data.specs.length > 0) {
                console.log('[manufacturer] ✓ specs from REDUX store.' + topKey + '.' + k + ':', data.specs.length)
                break
              }
            }
          }
          if (data.specs.length > 0) break
        }
      }
    } catch (err) {
      console.warn('[manufacturer] REDUX_STORE parse error:', err)
    }
  }

  // ── 2. Parse JSON-LD (schema.org Product) — works for many manufacturer sites ──
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const block of jsonLdBlocks) {
    try {
      let jsonLd = JSON.parse(block[1])
      if (jsonLd['@graph']) jsonLd = jsonLd['@graph']
      const products = Array.isArray(jsonLd) ? jsonLd.filter((x: Record<string, unknown>) => x['@type'] === 'Product') : (jsonLd['@type'] === 'Product' ? [jsonLd] : [])
      for (const product of products) {
        // Description
        if (!data.description && product.description) {
          data.description = String(product.description).replace(/<[^>]+>/g, '').trim()
        }
        // Images
        if (product.image) {
          const imgs = Array.isArray(product.image) ? product.image : [product.image]
          for (const img of imgs) {
            const url = typeof img === 'string' ? img : img?.url || ''
            if (url && /^https?:\/\//.test(url) && !data.images.includes(url)) data.images.push(url)
          }
        }
        // Specs from additionalProperty
        if (Array.isArray(product.additionalProperty)) {
          for (const prop of product.additionalProperty) {
            if (prop.name && prop.value != null) {
              data.specs.push({ name: String(prop.name), value: String(prop.value) })
            }
          }
        }
      }
    } catch { /* invalid JSON-LD */ }
  }

  // ── 3. Parse window.__NEXT_DATA__ (Next.js sites like some Bosch/Makita) ──
  const nextDataMatch = html.match(/window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})(?:\s*<\/script>|;\s*$)/m)
  if (nextDataMatch && data.specs.length === 0) {
    try {
      const nextData = JSON.parse(nextDataMatch[1])
      // Deep search for product specs in Next.js page props
      const findSpecs = (obj: unknown, depth = 0): void => {
        if (!obj || typeof obj !== 'object' || depth > 5) return
        const o = obj as Record<string, unknown>
        if (o.specifications && Array.isArray(o.specifications)) {
          for (const spec of o.specifications as Array<Record<string, unknown>>) {
            if (spec.name && spec.value != null) {
              data.specs.push({
                name: String(spec.name),
                value: String(spec.value),
                group: spec.group ? String(spec.group) : undefined,
              })
            }
          }
        }
        for (const val of Object.values(o)) {
          if (val && typeof val === 'object') findSpecs(val, depth + 1)
        }
      }
      findSpecs(nextData?.props?.pageProps)
    } catch { /* parse error */ }
  }

  // ── 4. Parse HTML DOM pour les specs (tables, dt/dd, accordéons) ──
  if (data.specs.length === 0 && html.length > 1000) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      // Tables de specs
      const tables = doc.querySelectorAll('table')
      for (const table of tables) {
        const rows = table.querySelectorAll('tr')
        for (const row of rows) {
          const cells = row.querySelectorAll('td, th')
          if (cells.length >= 2) {
            const n = cells[0].textContent?.trim()
            const v = cells[1].textContent?.trim()
            if (n && v && n.length < 80 && v.length < 200 && !/^[-:]+$/.test(n)) {
              data.specs.push({ name: n, value: v })
            }
          }
        }
      }
      // dt/dd pairs
      const dlElements = doc.querySelectorAll('dl')
      for (const dl of dlElements) {
        const dts = dl.querySelectorAll('dt')
        const dds = dl.querySelectorAll('dd')
        const count = Math.min(dts.length, dds.length)
        for (let di = 0; di < count; di++) {
          const n = dts[di].textContent?.trim()
          const v = dds[di].textContent?.trim()
          if (n && v && n.length < 80 && v.length < 200) {
            data.specs.push({ name: n, value: v })
          }
        }
      }
      // Éléments avec class spec-* / attr-* / feature-*
      const labelEls = doc.querySelectorAll('[class*="spec-label"], [class*="spec-name"], [class*="attr-label"], [class*="feature-label"]')
      const valueEls = doc.querySelectorAll('[class*="spec-value"], [class*="spec-data"], [class*="attr-value"], [class*="feature-value"]')
      if (labelEls.length >= 2 && labelEls.length === valueEls.length) {
        for (let di = 0; di < labelEls.length; di++) {
          const n = labelEls[di].textContent?.trim()
          const v = valueEls[di].textContent?.trim()
          if (n && v) data.specs.push({ name: n, value: v })
        }
      }
      if (data.specs.length > 0) console.log('[manufacturer] ✓ specs from HTML DOM:', data.specs.length)
    } catch (err) {
      console.warn('[manufacturer] HTML DOM spec extraction failed:', err)
    }
  }

  // ── 5. Fallback: extract all PDF links from the HTML ──
  if (data.downloads.length === 0) {
    const pdfLinks = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+\.pdf[^"]*)"/gi)]
    for (const m of pdfLinks) {
      const url = m[1]
      const filename = url.split('/').pop()?.split('?')[0] || 'Document.pdf'
      if (!data.downloads.some(d => d.url === url)) {
        data.downloads.push({ name: filename, url })
      }
    }
    console.log('[manufacturer] ✓ PDF links from HTML:', data.downloads.length)
  }

  console.log('[manufacturer] raw data summary:', {
    downloads: data.downloads.length,
    variants: data.variants.length,
    images: data.images.length,
    specs: data.specs.length,
    hasDescription: data.description.length > 0,
  })

  return data
}

/**
 * Construit un EnrichedProduct complet depuis le markdown Jina + les données brutes fabricant.
 * AUCUN appel LLM — tout vient du scraping.
 */
/** Déduplique les documents par URL normalisée (gère les entrées titre##url et urls brutes). */
function deduplicateDocuments(docs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const doc of docs) {
    // Extraire l'URL depuis le format "titre##url" ou URL brute
    const url = doc.includes('##') ? doc.split('##').pop()! : doc
    // Normaliser en gardant les query params (ils différencient les fact-tags, formats, etc.)
    const normalized = url.replace(/\/+$/, '').toLowerCase()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      result.push(doc)
    }
  }
  return result
}

function buildManufacturerProduct(
  markdownContent: string | null,
  rawData: ManufacturerData,
  productUrl: string,
  additionalSources: string[],
): EnrichedProduct {
  console.log('[manufacturer-build] combining markdown + raw data')

  // Specs : priorité aux données REDUX/JSON-LD, enrichies par le markdown
  const mdSpecs = markdownContent ? parseSpecsFromMarkdown(markdownContent) : []
  const rawSpecs = rawData.specs
  // Merge : raw specs first (plus fiables), puis ajouter celles du markdown non dupliquées
  const specsMap = new Map<string, { name: string; value: string; group?: string }>()
  for (const s of rawSpecs) {
    specsMap.set(s.name.toLowerCase().trim(), s)
  }
  for (const s of mdSpecs) {
    const key = s.name.toLowerCase().trim()
    if (!specsMap.has(key)) specsMap.set(key, s)
  }
  const specifications = [...specsMap.values()]

  // Advantages : depuis le markdown uniquement (les bullet points)
  const advantages = markdownContent ? parseAdvantagesFromMarkdown(markdownContent) : []

  // Description : REDUX > markdown (avec filtrage du cookie/GDPR banner)
  let description = rawData.description || ''
  if (description && (isGarbageContent(description) || isMainlyGarbage(description))) {
    console.log('[manufacturer-build] garbage description from REDUX, clearing')
    description = ''
  }
  if (!description || description.length < 30) {
    const mdDesc = markdownContent ? parseDescriptionFromMarkdown(markdownContent) : ''
    // Vérifier que la description markdown n'est pas du contenu parasite
    if (mdDesc && !isGarbageContent(mdDesc) && !isMainlyGarbage(mdDesc)) description = mdDesc
  }
  // Si la description est vide, prendre le H1 du markdown
  if (!description || description.length < 20) {
    const h1Match = markdownContent?.match(/^#\s+(.+)/m)
    if (h1Match) description = h1Match[1].replace(/\*\*/g, '').trim()
  }

  // Variants : REDUX > markdown
  let variants = rawData.variants
  if (variants.length === 0 && markdownContent) {
    variants = parseVariantsFromMarkdown(markdownContent)
  }

  // Images : markdown (inclut Jina injected + inline + summary) > REDUX
  let images: string[] = markdownContent ? parseImagesFromMarkdown(markdownContent) : []
  // Merge avec REDUX rawData images (sans doublons)
  if (rawData.images.length > 0) {
    const seen = new Set(images)
    for (const url of rawData.images) {
      if (!seen.has(url)) { images.push(url); seen.add(url) }
    }
  }
  console.log('[manufacturer-build] images:', images.length)

  // Documents : Jina injected > REDUX downloads > PDFs du markdown
  const documents: string[] = []
  // D'abord : extraire depuis le bloc JINA_EXTRACTED_DOWNLOADS injecté par le script
  if (markdownContent) {
    const dlStart = markdownContent.indexOf('JINA_EXTRACTED_DOWNLOADS_START')
    const dlEnd = markdownContent.indexOf('JINA_EXTRACTED_DOWNLOADS_END')
    if (dlStart >= 0 && dlEnd > dlStart) {
      const dlBlock = markdownContent.slice(dlStart + 'JINA_EXTRACTED_DOWNLOADS_START'.length, dlEnd)
      for (const line of dlBlock.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const pipeIdx = trimmed.indexOf(' | ')
        if (pipeIdx > 0) {
          const name = trimmed.slice(0, pipeIdx).trim()
          const url = trimmed.slice(pipeIdx + 3).trim()
          if (url) documents.push(`${name}##${url}`)
        } else if (/^https?:\/\//.test(trimmed)) {
          documents.push(trimmed)
        }
      }
      console.log('[manufacturer-build] ✓ Jina injected downloads:', documents.length)
    }
  }
  // Fallback : REDUX downloads
  if (documents.length === 0) {
    for (const dl of rawData.downloads) {
      const titledDoc = `${dl.name}##${dl.url}`
      documents.push(titledDoc)
    }
  }
  // Ajouter les PDFs du markdown qui ne sont pas déjà dans les downloads
  if (markdownContent) {
    const mdPdfUrls = [...markdownContent.matchAll(/https?:\/\/[^\s)"'\]]+\.pdf[^\s)"'\]]*/gi)].map(m => m[0])
    const existingUrls = new Set(rawData.downloads.map(d => d.url))
    for (const url of mdPdfUrls) {
      if (!existingUrls.has(url)) documents.push(url)
    }
    // Liens titrés [titre](url.pdf) du markdown
    const mdLinks = [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+\.pdf[^\s)]*)\)/gi)]
    for (const m of mdLinks) {
      const url = m[2].trim()
      if (!existingUrls.has(url) && !documents.includes(url)) {
        documents.push(`${m[1].trim()}##${url}`)
      }
    }
  }

  console.log('[manufacturer-build] result:', {
    specs: specifications.length,
    advantages: advantages.length,
    variants: variants.length,
    images: images.length,
    documents: documents.length,
    descLen: description.length,
  })

  return {
    description,
    advantages,
    specifications,
    variants,
    images: [...new Set(images)],
    documents: deduplicateDocuments(documents),
    sourceUrl: productUrl,
    additionalSources,
    generatedAt: Date.now(),
    scrapingProvider: 'Jina + Fabricant (scraping direct)',
    llmProvider: undefined,
    llmModel: undefined,
  }
}

// ── Parsers markdown : extraction structurée depuis le texte brut ───────────

function parseSpecsFromMarkdown(md: string): Array<{ name: string; value: string; group?: string }> {
  const specs: Array<{ name: string; value: string; group?: string }> = []
  const seen = new Set<string>()

  // ── Filtres financiers / prix (déclarés ici pour les réutiliser dans Jina ET dans add()) ──
  const FINANCIAL_NAME_RE = /^(date|payment|paiement|prix|price|montant|amount|total|ech[eé]ance|mensualit[eé]|versement|livraison|delivery|shipping|frais|fee|cost|co[uû]t|quantit[eé]|qty|stock|disponibilit[eé]|panier|cart|ajouter|add to|acheter|buy)\b|incl\.\s*vat|excl\.\s*vat|ttc|hors\s*taxe|tva/i
  const FINANCIAL_VALUE_RE = /^\d{1,4}[,.]\d{2}\s*[€$£]|^[€$£]\s*\d|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|incl\.\s*vat|excl\.\s*vat|ttc\b|hors\s*taxe|tva\b/i
  /** Noms de groupe / clés qui trahissent une section prix / tarif */
  const PRICE_GROUP_RE = /prix|price|tarif|co[uû]t|cost|tva|vat|ttc|ht\b|hors\s*taxe/i

  // ── Parser rapide pour le format injecté par notre script Jina ──
  // Format : JINA_EXTRACTED_SPECS_START\nGROUP: Titre\nNom = Valeur\n...\nJINA_EXTRACTED_SPECS_END
  const jinaStart = md.indexOf('JINA_EXTRACTED_SPECS_START')
  const jinaEnd = md.indexOf('JINA_EXTRACTED_SPECS_END')
  if (jinaStart >= 0 && jinaEnd > jinaStart) {
    const block = md.slice(jinaStart, jinaEnd)
    let currentGroup: string | undefined
    const decodeHtml = (s: string) => s.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    for (const line of block.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('GROUP:')) {
        currentGroup = decodeHtml(trimmed.slice(6).trim()) || undefined
      } else if (trimmed.includes(' = ')) {
        const eqIdx = trimmed.indexOf(' = ')
        const name = decodeHtml(trimmed.slice(0, eqIdx).trim())
        const value = decodeHtml(trimmed.slice(eqIdx + 3).trim())
        if (name && value) {
          // Appliquer les mêmes filtres financiers que add()
          if (FINANCIAL_NAME_RE.test(name)) continue
          if (FINANCIAL_VALUE_RE.test(value)) continue
          if (PRICE_GROUP_RE.test(currentGroup ?? '')) continue
          if (PRICE_GROUP_RE.test(name)) continue
          const key = `${name.toLowerCase()}::${value.toLowerCase()}`
          if (!seen.has(key)) {
            seen.add(key)
            specs.push({ name, value, group: currentGroup })
          }
        }
      }
    }
    if (specs.length > 0) {
      console.log('[parseSpecs] ✓ Jina injected specs:', specs.length)
    }
  }

  /** Rejette les contenus parasites : métadonnées Jina, URLs, titres de page, liens markdown, etc. */
  const JUNK_NAME_RE = /^(title|url|source|markdown|favicon|description|og:|meta |statuscode|viewport|http)/i
  const JUNK_VALUE_RE = /^https?:\/\/|\.pdf\b|\[.*\]\(http/i
  const LINK_BRACKETS_RE = /\[.*?\]\(.*?\)/
  /** Valeurs qui sont des types de fichiers (pdf, doc, zip...) ou des tailles de fichiers (74.3 MB, 563 KB...) */
  const FILE_VALUE_RE = /^(pdf|doc|docx|xls|xlsx|zip|rar|dwg|dxf|bim|ifc|step|stp|iges)$/i
  const FILE_SIZE_RE = /^\d+([.,]\d+)?\s*(b|kb|mb|gb|tb|ko|mo|go|to|octets?|bytes?)\s*$/i
  // FINANCIAL_NAME_RE et FINANCIAL_VALUE_RE déclarés plus haut (réutilisés aussi par le parser Jina)

  function add(name: string, value: string, group?: string) {
    let n = name.trim().replace(LINK_BRACKETS_RE, '').replace(/\*\*/g, '').trim()
    let v = value.trim().replace(LINK_BRACKETS_RE, '').replace(/\*\*/g, '').trim()
    const key = `${n.toLowerCase()}::${v.toLowerCase()}`
    if (!n || !v || seen.has(key)) return
    // Rejeter les métadonnées Jina / balises HTML / URLs
    if (JUNK_NAME_RE.test(n)) return
    if (JUNK_VALUE_RE.test(v)) return
    // Rejeter les types de fichiers et tailles de fichiers (listes de téléchargements PDF)
    if (FILE_VALUE_RE.test(v)) return
    if (FILE_SIZE_RE.test(n) || FILE_SIZE_RE.test(v)) return
    // Rejeter les données financières / commerciales (tables de paiement, prix, dates)
    if (FINANCIAL_NAME_RE.test(n)) return
    if (FINANCIAL_VALUE_RE.test(v)) return
    // Rejeter les noms qui sont des titres markdown (#) ou des bullets (+)
    if (/^[#]/.test(n)) return
    // Rejeter les valeurs non-informatives (un seul caractère ponctuation)
    if (/^[.\-–—,;:!?]$/.test(v)) return
    // Rejeter les noms ou valeurs trop longs (titres de page entiers)
    if (n.length > 80 || v.length > 250) return
    // Rejeter si le nom contient "fiche" + "produit"/"technique" (liens doc)
    if (/fiche\s*(de\s*donn[eé]es|technique|produit)/i.test(n)) return
    // Rejeter si la valeur contient un domaine web complet
    if (/www\.[a-z]/i.test(v) || /\.com\//.test(v)) return
    // Rejeter les contenus qui sont du garbage (cookies, GDPR, etc.)
    if (isGarbageContent(n) || isGarbageContent(v)) return
    seen.add(key)
    specs.push({ name: n, value: v, group: group || undefined })
  }

  const lines = md.split('\n')

  // Lignes Jina metadata à ignorer complètement
  const jinaMetaRe = /^(Title|URL|Markdown Content|Source|Published Time|StatusCode|Favicon|ViewportWidth)\s*:/i

  const specSectionRe = /^#{1,4}\s*(sp[eé]cifications?|caract[eé]ristiques?\s*(?:techniques?|du\s*produit)?|descriptif\s*technique|donn[eé]es\s*techniques?|informations?\s*(?:techniques?)?|fiche\s*technique|d[eé]tails?\s*techniques?|poids|puissance|d[eé]cibels?|vibrations?|dimensions?|batterie|general|g[eé]n[eé]ral|per[çc]age|vissage|couple|moteur|[eé]nergie|vitesse|mandrin|capacit[eé]s?|tension|autonomie|charge(?:ment)?|bruit|acoustique|emballage|inclus|contenu\s*(?:de\s*la\s*)?livr|accessoires?)/i
  let inSpecSection = false
  let currentGroup = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Ignorer les lignes de métadonnées Jina
    if (jinaMetaRe.test(trimmed)) continue
    // Ignorer les lignes qui sont des liens markdown vers des docs/PDFs
    if (/^\[.*\]\(https?:\/\//.test(trimmed) && /\.(pdf|doc)/i.test(trimmed)) continue
    // Ignorer les lignes qui sont des titres de page Bosch/Makita/etc. excessivement longs
    if (trimmed.startsWith('#') && trimmed.length > 120) continue

    // Quitter la section specs si on entre dans une section de téléchargements/documents
    if (/^#{1,4}\s*(t[eé]l[eé]chargements?|downloads?|documents?\s*(?:associ[eé]s|techniques?|utiles?)?|fichiers?|resources?|pi[eè]ces?\s*jointes?)/i.test(trimmed)) {
      inSpecSection = false
      currentGroup = ''
      continue
    }

    if (specSectionRe.test(trimmed)) {
      inSpecSection = true
      const heading = trimmed.replace(/^#{1,4}\s+/, '').trim()
      currentGroup = heading
      continue
    }
    const subHeading = trimmed.match(/^#{2,5}\s+(.+)/)
    if (subHeading) {
      const heading = subHeading[1].trim()
      const headingLc = heading.toLowerCase()
      const isSpecGroup = /(information|poids|puissance|d[eé]cibels?|vibration|dimension|batterie|per[çc]age|vissage|couple|vitesse|mandrin|capacit|g[eé]n[eé]ral|technique|sp[eé]cification|donn[eé]es|important|emballage|inclus|livr[eé]|tension|autonomie|charge|bruit|acoustique|moteur|[eé]nergie|accessoire|r[eé]sistance|performance|mat[eé]riau|d[eé]bit|pression|hydraulique|certification|norme|classe|s[eé]rie|gamme|mod[eè]le|r[eé]f[eé]rence|connect|bluetooth|wireless|wifi)/i.test(headingLc)
      // Heading court tout en majuscules = très probable section de specs fabricant (Milwaukee, DeWalt, etc.)
      const isUpperCaseShort = heading.length <= 40 && heading === heading.toUpperCase() && /[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]{3,}/.test(heading)
      if (isSpecGroup || isUpperCaseShort) {
        inSpecSection = true
        currentGroup = heading
      } else if (inSpecSection) {
        if (/^#{1,2}\s/.test(trimmed)) {
          inSpecSection = false
          currentGroup = ''
        } else {
          currentGroup = heading
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

    // Format 4 : Lignes consécutives "Nom" puis "Valeur" (avec tolérance aux lignes vides entre les deux)
    if (inSpecSection && trimmed.length > 2 && trimmed.length < 80
        && !trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('[')
        && !trimmed.startsWith('#') && !trimmed.startsWith('|') && !trimmed.startsWith('http')
        && !trimmed.startsWith('!') && !/^[-:=]+$/.test(trimmed)) {
      // Chercher la prochaine ligne non-vide (skip max 2 lignes vides — format Bosch/Nicoll)
      let nextIdx = i + 1
      while (nextIdx < lines.length && nextIdx <= i + 3 && !lines[nextIdx].trim()) nextIdx++
      const nextLine = (lines[nextIdx] ?? '').trim()
      if (nextLine && nextLine.length > 0 && nextLine.length < 100
          && !nextLine.startsWith('#') && !nextLine.startsWith('-') && !nextLine.startsWith('*')
          && !nextLine.startsWith('[') && !nextLine.startsWith('|') && !nextLine.startsWith('http')
          && !nextLine.startsWith('!')) {
        const looksLikeValue = /\d/.test(nextLine) || nextLine.length < 30 || /\b(mm|cm|m|kg|g|nm|rpm|tr\/min|v|ah|w|kw|hz|db|dba|°|%|bar|l\/min|psi|mpa|ion|litre|watt|volt|amp)/i.test(nextLine)
        if (looksLikeValue) {
          add(trimmed, nextLine, currentGroup)
          i = nextIdx
          continue
        }
      }
    }
  }

  // Fallback global
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

function parseDescriptionFromMarkdown(md: string): string {
  const lines = md.split('\n')

  // ── Helpers ──
  const isProseText = (s: string) =>
    s.length >= 40 && !s.startsWith('|') && !s.startsWith('#')
    && !/^\[.*\]\(.*\)$/.test(s) && !/^!\[/.test(s) && !s.startsWith('http')
    && !/^[-*•✓✔]\s/.test(s) && !isGarbageContent(s)
    && !/^\d+([.,]\d+)?\s*(b|kb|mb|gb|ko|mo|go|octets?|bytes?)\s*$/i.test(s)

  const clean = (s: string) => s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()

  // Sections qui contiennent typiquement de la description/prose
  const descSectionRe = /caract[eé]ristiques?\s*(du\s*produit|principales?|g[eé]n[eé]rales?)?|description|pr[eé]sentation|aper[çc]u|about|overview|introduction|r[eé]sum[eé]|en\s*bref|le\s*produit|d[eé]tail|points?\s*forts?\s*(du\s*produit)?|[eé]quipement\s*(et\s*application)?|informations?\s*compl[eé]ment/i
  // Sections techniques / non-descriptives → on sort de la description
  const nonDescSectionRe = /sp[eé]cification|descriptif\s*technique|donn[eé]es?\s*technique|fiche\s*technique|t[eé]l[eé]chargement|downloads?|documents?|r[eé]f[eé]rences?|variantes?|accessoires?\s*(?:associ|inclus|compatib)|avis|reviews?|galerie|vid[eé]os?|questions?|faq|contact|prix|tarif|dimensions?\s*et|table\s*des?\s*mati[eè]res/i

  // ── Phase 1 : texte entre le H1 et le premier H2 ──
  const phase1Parts: string[] = []
  let afterTitle = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#\s/.test(trimmed)) { afterTitle = true; continue }
    if (!afterTitle) continue
    if (/^#{2,}\s/.test(trimmed)) break
    if (!trimmed) continue
    const c = clean(trimmed)
    if (isProseText(c)) phase1Parts.push(c)
    if (phase1Parts.length >= 4) break
  }

  // ── Phase 2 : texte dans les sections descriptives (## Caractéristiques du produit, etc.) ──
  const phase2Parts: string[] = []
  let inDescSection = false
  for (const line of lines) {
    const trimmed = line.trim()

    // Heading markdown
    if (/^#{2,4}\s/.test(trimmed)) {
      const heading = trimmed.replace(/^#{2,4}\s+/, '')
      if (nonDescSectionRe.test(heading)) {
        inDescSection = false
        continue
      }
      if (descSectionRe.test(heading)) {
        inDescSection = true
        continue
      }
      // Heading inconnu : quitter la section desc en cours
      if (inDescSection) {
        inDescSection = false
        continue
      }
      continue
    }

    // Titre en bold sur une ligne seule (format Bosch : **Points forts du produit**)
    const boldLine = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
    if (boldLine) {
      const heading = boldLine[1]
      if (nonDescSectionRe.test(heading)) {
        inDescSection = false
        continue
      }
      if (descSectionRe.test(heading)) {
        inDescSection = true
        continue
      }
    }

    if (!inDescSection) continue
    if (!trimmed) continue
    const c = clean(trimmed)
    if (isProseText(c)) {
      const norm = c.toLowerCase().slice(0, 50)
      if (!phase2Parts.some(p => p.toLowerCase().slice(0, 50) === norm)) {
        phase2Parts.push(c)
      }
    }
    if (phase2Parts.length >= 8) break
  }

  // ── Phase 3 : fallback — trouver le plus long bloc de prose consécutif dans tout le markdown ──
  const phase3Parts: string[] = []
  if (phase1Parts.length === 0 && phase2Parts.length === 0) {
    let currentBlock: string[] = []
    let bestBlock: string[] = []
    let bestLen = 0
    for (const line of lines) {
      const trimmed = line.trim()
      const c = clean(trimmed)
      if (trimmed && isProseText(c) && c.length >= 50) {
        currentBlock.push(c)
      } else {
        const blockLen = currentBlock.reduce((s, p) => s + p.length, 0)
        if (blockLen > bestLen) {
          bestBlock = [...currentBlock]
          bestLen = blockLen
        }
        currentBlock = []
      }
    }
    // Vérifier le dernier bloc
    const blockLen = currentBlock.reduce((s, p) => s + p.length, 0)
    if (blockLen > bestLen) bestBlock = currentBlock
    if (bestBlock.length > 0) phase3Parts.push(...bestBlock.slice(0, 6))
  }

  // ── Sélection du meilleur résultat ──
  // Préférer Phase 2 (section descriptive identifiée) si elle a du contenu riche
  // Sinon Phase 1 (après le titre), sinon Phase 3 (fallback prose)
  const phase2Text = phase2Parts.join('\n\n').trim()
  const phase1Text = phase1Parts.join('\n\n').trim()
  const phase3Text = phase3Parts.join('\n\n').trim()

  // Si Phase 2 a trouvé du contenu riche, le préférer
  if (phase2Text.length > phase1Text.length && phase2Text.length >= 50) {
    return phase2Text
  }
  // Si Phase 1 a du contenu décent, le combiner avec Phase 2
  if (phase1Text.length >= 50) {
    if (phase2Text.length >= 50) {
      // Les deux ont du contenu — combiner en évitant les doublons
      const combined = phase1Text
      const p2Norm = phase2Text.toLowerCase().slice(0, 50)
      if (!combined.toLowerCase().includes(p2Norm.slice(0, 30))) {
        return (combined + '\n\n' + phase2Text).trim()
      }
      return combined
    }
    return phase1Text
  }
  // Fallback : Phase 2 ou Phase 3
  if (phase2Text.length >= 40) return phase2Text
  if (phase3Text.length >= 40) return phase3Text

  // Dernier recours : H1 comme description minimale
  const h1Match = md.match(/^#\s+(.+)/m)
  if (h1Match) return clean(h1Match[1])

  return ''
}

/** Retire le préfixe du nom de colonne dans la valeur d'une cellule markdown.
 *  Certains sites (ex: Nicoll) rendent les tables responsive où chaque cellule
 *  commence par le nom de colonne (data-label CSS). Ex: colonne "Couleur" +
 *  cellule "Couleur Noir" → "Noir". Si la cellule ne contient que le header
 *  (aucune valeur), retourne chaîne vide. */
function stripCellHeaderPrefix(colName: string, val: string): string {
  if (!val?.trim()) return ''
  const v = val.trim()
  const normCol = colName.replace(/[.\s]+$/g, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const normVal = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (normVal.startsWith(normCol)) {
    const rest = v.slice(colName.replace(/[.\s]+$/g, '').length).replace(/^[\s.:;,\-–—]+/, '').trim()
    return rest
  }
  return v
}

/** Détermine si une valeur de cellule est du bruit (prix masqué derrière login, markdown vide, etc.) */
function isJunkCellValue(v: string): boolean {
  if (!v) return true
  // Liens de login/modal markdown : "[](https://.../login)" ou similaire
  if (/^\[\]?\]?\(https?:\/\/[^)]*(login|modal|auth)/i.test(v)) return true
  return false
}

function parseVariantsFromMarkdown(md: string): Array<{ reference: string; label: string; properties: Record<string, string> }> {
  const variants: Array<{ reference: string; label: string; properties: Record<string, string> }> = []

  const lines = md.split('\n')
  let headers: string[] = []
  let inTable = false
  let refIdx = -1
  let labelIdx = -1

  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim()

    if (trimmed.startsWith('|') && trimmed.endsWith('|') && !inTable) {
      const cells = trimmed.split('|').map(c => c.trim()).slice(1, -1)
      const refCol = cells.findIndex(c => /^r[eé]f|^code|^sku|^article|^part\s*n|^model/i.test(c))
      if (refCol >= 0) {
        headers = cells
        refIdx = refCol
        labelIdx = cells.findIndex(c => /^(libell[eé]|d[eé]signation|description|nom|produit|name|product)/i.test(c))
        inTable = true
        continue
      }
    }

    if (inTable && /^\|[\s-:|]+\|$/.test(trimmed)) continue

    if (inTable && trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').map(c => c.replace(/\*\*/g, '').trim()).slice(1, -1)
      if (cells.length >= headers.length - 1 && refIdx < cells.length) {
        // Strip header prefix des cellules ref et label
        const refRaw = cells[refIdx]
        const ref = stripCellHeaderPrefix(headers[refIdx] || 'Réf.', refRaw)
        if (!ref || /^[-:]+$/.test(ref)) continue
        const labelRaw = labelIdx >= 0 && labelIdx < cells.length ? cells[labelIdx] : ''
        const label = stripCellHeaderPrefix(headers[labelIdx] || 'Libellé', labelRaw)
        const properties: Record<string, string> = {}
        headers.forEach((h, idx) => {
          if (idx === refIdx || idx === labelIdx || idx >= cells.length) return
          const cleaned = stripCellHeaderPrefix(h, cells[idx])
          if (cleaned && !isJunkCellValue(cleaned)) {
            properties[h] = cleaned
          }
        })
        variants.push({ reference: ref, label, properties })
      }
      continue
    }

    if (inTable && !trimmed.startsWith('|')) {
      inTable = false
      headers = []
    }
  }

  // Fallback : patterns de référence dans des listes
  if (variants.length === 0) {
    const refLineRe = /^[>*-]?\s*\**([A-Z]{1,4}\d{2,6}[A-Z]{0,3})\**\s*[-–—]\s*(.+)/gm
    let match
    while ((match = refLineRe.exec(md)) !== null) {
      const ref = match[1].trim()
      const rest = match[2].trim()
      const parts = rest.split(/\s*[-–—,]\s*/)
      const label = parts[0] || ''
      const properties: Record<string, string> = {}
      for (let i = 1; i < parts.length; i++) {
        if (parts[i]) {
          if (/^(noir|blanc|rouge|bleu|vert|gris|jaune)/i.test(parts[i])) {
            properties['Couleur'] = parts[i]
          } else {
            properties[`Col${i}`] = parts[i]
          }
        }
      }
      if (ref) variants.push({ reference: ref, label, properties })
    }
  }

  // Phase 2 : enrichir chaque variante avec les specs "Clé : Valeur" qui suivent
  if (variants.length > 0) {
    const refSet = new Map<string, number>()
    for (let vi = 0; vi < variants.length; vi++) {
      refSet.set(variants[vi].reference.toUpperCase(), vi)
    }
    let currentVariantIdx = -1
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('|')) continue
      const refMatch = trimmed.match(/\b([A-Z]{1,6}\d{2,8}[A-Z]{0,4})\b/)
      if (refMatch) {
        const found = refSet.get(refMatch[1].toUpperCase())
        if (found !== undefined) { currentVariantIdx = found; continue }
      }
      if (currentVariantIdx >= 0) {
        const kvMatch = trimmed.match(/^[*\-•]?\s*\**([^:*]{2,40})\**\s*:\s*(.+)$/)
        if (kvMatch) {
          const key = kvMatch[1].replace(/\*\*/g, '').trim()
          const value = kvMatch[2].replace(/\*\*/g, '').trim()
          if (key && value && !/tarif|prix|price/i.test(key)) {
            variants[currentVariantIdx].properties[key] = value
          }
        }
      }
    }
  }

  // Phase 3 : parser les blobs "Caractéristiques ... Voir moins" rendus par Jina
  // (ex: Nicoll où chaque ligne d'accordéon étalée inline contient ~26 attributs).
  // Les blobs apparaissent dans l'ordre des variantes → merge par index.
  if (variants.length > 0) {
    const blobs = extractCharacteristicsBlobs(md)
    if (blobs.length > 0) {
      for (let i = 0; i < Math.min(blobs.length, variants.length); i++) {
        const parsed = parseCharacteristicsBlob(blobs[i])
        for (const [k, v] of Object.entries(parsed)) {
          if (!variants[i].properties[k]) variants[i].properties[k] = v
        }
      }
    }
  }

  return variants
}

/** Extrait tous les blobs "Caractéristiques <contenu> Voir moins" du markdown, dans l'ordre. */
function extractCharacteristicsBlobs(md: string): string[] {
  const blobs: string[] = []
  const re = /Caract[eé]ristiques\s+([^|]+?)\s+Voir\s+moins/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) {
    const content = m[1].trim()
    if (content.length > 20 && content.includes(' : ')) blobs.push(content)
  }
  return blobs
}

/** Parse un blob inline "K1 : V1 K2 : V2 ..." en paires nom/valeur.
 *  Le parser repère les frontières via le pattern d'un nom de clé
 *  (majuscule initiale + lettres/espaces/apostrophes/tirets + " : "). */
function parseCharacteristicsBlob(blob: string): Record<string, string> {
  const result: Record<string, string> = {}
  // Nettoyage léger
  const cleaned = blob.replace(/\s+/g, ' ').trim()
  // Pattern : clé = majuscule initiale (accents OK), ≤6 mots alphabétiques ; puis " : " ; puis
  // valeur jusqu'au prochain pattern de clé ou fin. Lookahead non-greedy.
  const pat = /([A-ZÉÈÊÀÂÎÔÛÇ][A-Za-zÀ-ÿ'’\- ]*?)\s*:\s*(.+?)(?=\s+[A-ZÉÈÊÀÂÎÔÛÇ][A-Za-zÀ-ÿ'’\- ]*?\s*:\s|\s*$)/g
  let m: RegExpExecArray | null
  while ((m = pat.exec(cleaned)) !== null) {
    const key = m[1].trim()
    const value = m[2].trim()
    if (!key || !value) continue
    // Filtrer clés trop courtes ou clairement du bruit
    if (key.length < 2 || key.length > 60) continue
    if (/tarif|prix|price/i.test(key)) continue
    result[key] = value
  }
  return result
}

/** Extrait toutes les URLs d'images produit depuis le markdown Jina.
 *  Gère : ![alt](url), Images Summary Jina, URLs brutes avec extension,
 *  et URLs CDN sans extension claire (dans le contexte d'une section images).
 */
/** Coupe le markdown avant les sections qui ne contiennent PAS d'images produit
 *  (documents/téléchargements, produits associés/similaires, conseils, avis, FAQ, footer).
 *  Retourne le markdown restant — ou le markdown complet si aucune coupure trouvée. */
function truncateBeforeNonProductSections(md: string): string {
  const cutoffRe = /\n#{1,4}\s+(Documents?|T[eé]l[eé]chargements?|Downloads?|Conseils?|Produits?\s+associ[eé]s?|Produits?\s+similaires?|Produits?\s+r[eé]cemment|Produits?\s+compl[eé]mentaires?|Accessoires?\b|Related\s+products?|Complementary\s+products?|Avis|Reviews?|FAQ|Questions?\s+fr[eé]quentes?|Nos\s+Domaines)/i
  const m = cutoffRe.exec(md)
  return m ? md.slice(0, m.index) : md
}

/** Extrait le "stem" d'une URL d'image pour dédup : dernier segment path,
 *  extensions retirées (gère les doubles .jpg.webp de Drupal imagecache). */
function imageStem(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '')
    const last = path.split('/').pop() || ''
    return last.replace(/\.(jpe?g|png|webp|avif|gif|svg)(\.(jpe?g|png|webp|avif|gif))?$/i, '').toLowerCase()
  } catch { return url }
}

/** Test si une URL d'image pointe vers un chemin "produit" (CMS avec segment produits). */
const PRODUCT_PATH_RE = /\/(products?|product[-_]images?|product[-_]photos?|catalog\/products?)\//i

/** Canonicalise une URL Drupal imagecache → URL originale (haute résolution).
 *  Ex: /sites/default/files/styles/<style>/public/products/34955.jpg.webp?itok=xyz
 *   →  /sites/default/files/products/34955.jpg
 *  Si pas de pattern Drupal, retourne l'URL telle quelle. */
function canonicalizeImageUrl(url: string): string {
  try {
    const u = new URL(url)
    // Pattern Drupal : /styles/<style>/public/<rest>
    const styleMatch = u.pathname.match(/^(.*?)\/styles\/[^/]+\/public\/(.+)$/)
    if (styleMatch) {
      const [, prefix, rest] = styleMatch
      // Retirer la double extension ajoutée par imagecache (.jpg.webp → .jpg)
      const cleanRest = rest.replace(/\.(jpe?g|png|gif)\.(webp|avif)$/i, '.$1')
      u.pathname = `${prefix}/${cleanRest}`
      u.search = '' // retirer ?itok=...
      return u.toString()
    }
    return url
  } catch {
    return url
  }
}

function parseImagesFromMarkdown(md: string): string[] {
  // Limiter l'extraction au contenu avant les sections documents/associés/etc.
  md = truncateBeforeNonProductSections(md)

  const seen = new Set<string>()
  const images: string[] = []

  /** Teste si une URL est une image UI/junk (logo, icône, pixel, miniature de PDF, etc.) et pas un produit.
   *  On teste uniquement le nom de fichier (dernier segment du path), pas l'URL entière,
   *  pour éviter les faux positifs sur les chemins CMS (/sites/default/files/, /static/images/, etc.)
   */
  const isJunkImage = (url: string): boolean => {
    try {
      const path = new URL(url).pathname
      const filename = path.split('/').pop()?.toLowerCase() ?? ''
      // Petites images (< 3 segments de path = probablement un favicon/sprite inline)
      const segments = path.split('/').filter(Boolean)
      // Tester le nom de fichier uniquement
      if (/^(logo|favicon|sprite|spacer|blank|pixel|transparent|1x1|beacon)\b/i.test(filename)) return true
      if (/[-_](logo|icon|avatar|favicon|sprite|spacer|pixel|tracking|beacon)[-_.\d]/i.test(filename)) return true
      // Miniatures de PDF/docs : filename ou path contient des marqueurs documentaires
      if (/\.pdf\.(jpe?g|png|webp|avif)$/i.test(filename)) return true
      if (/^(fiche|notice|datasheet|tech[-_]?sheet|manual|doc|document|brochure|catalog)[-_.]/i.test(filename)) return true
      // Drupal imagecache styles avec "doc" (ex: product_doc_carousel_mobile, doc_preview_*)
      const styleMatch = path.match(/\/styles\/([^/]+)\//i)
      if (styleMatch && /(^|[-_])(doc|docs|document|documents|pdf|notice|fiche|datasheet|brochure)([-_]|$)/i.test(styleMatch[1])) return true
      // Path segment dédié aux documents
      if (segments.some(s => /^(docs?|documents?|pdfs?|notices?|fiches?|brochures?|datasheets?)$/i.test(s))) return true
      // Tester le dernier segment de path pour les patterns sociaux/nav
      const lastSegments = segments.slice(-2).join('/')
      if (/\b(facebook|twitter|instagram|youtube|linkedin|tiktok|pinterest)\b/i.test(lastSegments)) return true
      // Très petit fichier (souvent des icônes SVG en ligne)
      if (/\bsvg\b/i.test(filename) && segments.length <= 2) return true
      return false
    } catch {
      return false
    }
  }

  const addImg = (url: string) => {
    const raw = url.trim().replace(/[)>\]}\s]+$/, '')
    if (!raw || !raw.startsWith('http') || isJunkImage(raw)) return
    // Canonicaliser les URLs Drupal styled → original (haute résolution)
    const u = canonicalizeImageUrl(raw)
    if (seen.has(u)) return
    seen.add(u)
    images.push(u)
  }

  // 1. Jina injected images block (JINA_EXTRACTED_IMAGES_START/END)
  const jinaImgStart = md.indexOf('JINA_EXTRACTED_IMAGES_START')
  const jinaImgEnd = md.indexOf('JINA_EXTRACTED_IMAGES_END')
  if (jinaImgStart >= 0 && jinaImgEnd > jinaImgStart) {
    const block = md.slice(jinaImgStart + 'JINA_EXTRACTED_IMAGES_START'.length, jinaImgEnd)
    for (const line of block.split('\n')) {
      const url = line.trim()
      if (url && /^https?:\/\//.test(url)) addImg(url)
    }
  }

  // 2. Inline markdown images: ![alt](url)
  for (const m of md.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    addImg(m[2])
  }

  // 3. Jina "Images Summary" / "Images:" section at end of markdown
  //    Formats: "Image N (alt): url" or "[Image N (alt)](url)" or just plain URLs
  const imgSectionMatch = md.match(/(?:^|\n)#{0,4}\s*(?:Images?\s*(?:Summary)?|Photos?)\s*:?\s*\n([\s\S]+?)(?:\n#{1,4}\s|\n\n---|\n\n\*\*|$)/im)
  if (imgSectionMatch) {
    const section = imgSectionMatch[1]
    // [alt](url) format
    for (const m of section.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
      addImg(m[1])
    }
    // Plain URL with image extension
    for (const m of section.matchAll(/(https?:\/\/[^\s)"\]]+\.(?:jpe?g|png|webp|gif|avif|svg)[^\s)"\]]*)/gi)) {
      addImg(m[1])
    }
    // Plain URL without clear extension (CDN urls in an image context)
    for (const m of section.matchAll(/(https?:\/\/[^\s)"\]]+)/g)) {
      const u = m[1]
      // Only include if it looks like a CDN/media URL (not a regular page)
      if (/(?:media|image|img|photo|cdn|asset|upload|static|product|catalog)[\/.]/i.test(u)) {
        addImg(u)
      }
    }
  }

  // 4. Plain URLs with image extensions anywhere in the markdown
  for (const m of md.matchAll(/(https?:\/\/[^\s)"\]]+\.(?:jpe?g|png|webp|avif)[^\s)"\]]*)/gi)) {
    addImg(m[1])
  }

  // 5. Jina "Image N (alt): url" format (sometimes outside a section)
  for (const m of md.matchAll(/Image\s+\d+[^:]*:\s*(https?:\/\/[^\s)"\]]+)/gim)) {
    addImg(m[1])
  }

  // 6. og:image or meta image URLs in Jina metadata
  for (const m of md.matchAll(/(?:og:image|twitter:image|image_src|meta\s*image)\s*[:=]\s*(https?:\/\/[^\s)"\]]+)/gim)) {
    addImg(m[1])
  }

  // 7. Links Summary — images disguised as regular links in Jina's Links section
  //    Format: [alt text](url.jpg) in a Links section
  const linksSectionMatch = md.match(/(?:^|\n)#{0,4}\s*Links?\s*(?:Summary)?\s*:?\s*\n([\s\S]+?)(?:\n#{1,4}\s|$)/im)
  if (linksSectionMatch) {
    for (const m of linksSectionMatch[1].matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+\.(?:jpe?g|png|webp|avif)[^)\s]*)\)/gi)) {
      addImg(m[1])
    }
  }

  // 8. Priorité images produit : si ≥2 URLs ont un segment /products/, filtrer à celles-ci
  //    + dédup par filename stem (supprime les variantes de taille Drupal/imagecache).
  const productImages = images.filter(u => PRODUCT_PATH_RE.test(u))
  const finalImages = productImages.length >= 2 ? productImages : images
  const seenStems = new Set<string>()
  const deduped: string[] = []
  for (const url of finalImages) {
    const s = imageStem(url)
    if (!s || !seenStems.has(s)) {
      seenStems.add(s)
      deduped.push(url)
    }
  }
  console.log('[parseImagesFromMarkdown] mdLen=', md.length, 'raw=', images.length, 'productMatch=', productImages.length, 'final=', deduped.length, 'sample:', deduped.slice(0, 3))
  return deduped
}

function parseAdvantagesFromMarkdown(md: string): Array<{ text: string; group?: string }> {
  const advantages: Array<{ text: string; group?: string }> = []
  const seenTexts = new Set<string>()

  // Sections qui contiennent des avantages (bullet points)
  const featureKeywords = /(?:avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|les\s*\+|atouts?|plus\s+produit|caract[eé]ristiques?)/i
  // Sections qui NE contiennent PAS des avantages → quitter la featureZone
  const exitKeywords = /(?:sp[eé]cification|caract[eé]ristiques?\s*techniques?|donn[eé]es\s*technique|descriptif\s*technique|t[eé]l[eé]chargement|downloads?|documents?|avis|reviews?|r[eé]f[eé]rences?|variantes?|accessoires?\s*associ|prix|tarif|contact|mentions?\s*l[eé]gal|conditions?\s*g[eé]n[eé]ral|informations?\s*compl[eé]ment|[eé]quipement|application)/i
  // Contenu commercial/politique à filtrer
  const COMMERCIAL_RE = /achet[eé]|achat|retourn|rembours|livr[eé]|exp[eé]di|panier|commander|boutique|magasin|labellis[eé]|certifi[eé].*utilisateur|v[eé]rifi[eé].*identit|historique.*d.achat|provien.*d.utilisateur|contrefaçon|authenticit|service\s*client|cat[eé]gories?\s*d.?[eé]valuation|distinguons?\s*trois|noter\s*ce\s*produit/i

  const extractGroupName = (raw: string): string | undefined => {
    const cleaned = raw
      .replace(/\*\*/g, '')
      .replace(/^les\s*\+\s*/i, '')
      .replace(/^(avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?|plus\s+produit|caract[eé]ristiques?)\s*/i, '')
      .trim()
    return cleaned.length > 1 && cleaned.length < 80 ? cleaned : undefined
  }

  const addBullet = (text: string, group: string | undefined) => {
    const clean = text
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\\\\/g, '')
      .trim()
    if (clean.length < 15 || clean.startsWith('http') || /^\d+$/.test(clean) || seenTexts.has(clean)) return
    // Rejeter le contenu commercial / politique
    if (COMMERCIAL_RE.test(clean)) return
    // Rejeter les noms de specs isolés (sans verbe, sans valeur)
    if (clean.length < 50 && /\*\s*$/.test(clean)) return
    // Rejeter les adresses, noms d'entreprise, disclaimers, liens
    if (/^\d{4,5}\s+[A-Z]/.test(clean)) return
    if (/GmbH|S\.A\.|SAS|SARL|Ltd|Inc/i.test(clean)) return
    if (/avertissement|consigne.*s[eé]curit|notice.*utilisation|t[eé]l[eé]charg|cliqu/i.test(clean)) return
    if (isGarbageContent(clean)) return
    seenTexts.add(clean)
    advantages.push({ text: clean, group })
  }

  const lines = md.split('\n')
  let currentGroup: string | undefined
  let inFeatureZone = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue

    const headingMatch = trimmed.match(/^#{1,5}\s+(.+)$/)
    if (headingMatch) {
      const headingText = headingMatch[1].replace(/\*\*/g, '').trim()
      // Quitter si on entre dans une section technique / commerciale / autre
      if (exitKeywords.test(headingText)) {
        inFeatureZone = false
        currentGroup = undefined
        continue
      }
      if (featureKeywords.test(headingText)) {
        inFeatureZone = true
        currentGroup = extractGroupName(headingText)
        continue
      }
      if (inFeatureZone) {
        const level = trimmed.match(/^(#{1,5})/)?.[1].length ?? 99
        if (level <= 2) {
          inFeatureZone = false
          currentGroup = undefined
        }
      }
      continue
    }

    // Texte bold seul = potentiel titre de section
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
    if (boldMatch) {
      if (exitKeywords.test(boldMatch[1])) {
        inFeatureZone = false
        currentGroup = undefined
        continue
      }
      if (featureKeywords.test(boldMatch[1])) {
        inFeatureZone = true
        currentGroup = extractGroupName(boldMatch[1])
        continue
      }
    }

    // Texte non-markdown qui matche les keywords
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('•')
        && featureKeywords.test(trimmed) && !exitKeywords.test(trimmed) && trimmed.length < 80) {
      const nextLine = (lines[i + 1] ?? '').trim()
      const isTitleBeforeBullets = /^[-*•·✓✔]\s+/.test(nextLine)
      if (isTitleBeforeBullets || inFeatureZone) {
        inFeatureZone = true
        currentGroup = extractGroupName(trimmed)
        continue
      }
    }

    if (!inFeatureZone) continue

    // Bullet points explicites
    const bulletMatch = trimmed.match(/^[-*•·✓✔]\s+(.+)/)
    if (bulletMatch) {
      addBullet(bulletMatch[1], currentGroup)
      continue
    }

    // Numérotés : "1. Texte"
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/)
    if (numberedMatch && numberedMatch[1].length > 20) {
      addBullet(numberedMatch[1], currentGroup)
      continue
    }

    // Paragraphes de prose dans la zone features (pas un heading, pas un tableau, pas un lien)
    // Certaines pages mettent les avantages en texte libre plutôt qu'en bullets
    if (
      trimmed.length >= 40
      && !trimmed.startsWith('|')
      && !trimmed.startsWith('#')
      && !trimmed.startsWith('![')
      && !/^\[.*\]\(/.test(trimmed)
      && !COMMERCIAL_RE.test(trimmed)
      && !isGarbageContent(trimmed)
    ) {
      addBullet(trimmed, currentGroup)
      continue
    }
  }

  return advantages
}

// ── Hook principal ──────────────────────────────────────────────────────────

export function useProductEnrichment() {
  const { setProgress, setData, setError, setLlmRequest, clear, getScrapeCache, setScrapeCache, clearScrapeCache, addLog, clearLogs } = useEnrichmentStore()
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
      clearLogs(sheetName, rowId)
      const log = (msg: string) => addLog(sheetName, rowId, msg)
      try {
        console.log('[enrichment] START', { sheetName, rowId, title, brand, reference: reference ?? sku, knownUrl })
        log(`Démarrage — ${title} ${brand ?? ''}`)
        // ── Étape 0 : Vérifier le cache scraping (Re-générer réutilise les mêmes données) ──
        const cached = getScrapeCache(sheetName, rowId)
        let usedCache = false

        // ── Étape 1 : Trouver la page produit ─────────────────────────────
        let productUrl: string | null = knownUrl ?? null
        let additionalSources: string[] = []
        let searchErrorMsg: string | null = null

        if (cached && !knownUrl) {
          // Invalider le cache si la marque est connue mais l'URL cachée n'est PAS
          // sur le site fabricant → force une nouvelle recherche pour trouver le site officiel
          const brandSlugForCache = brand ? brand.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
          const cachedIsManufacturer = cached.productUrl ? detectManufacturerSite(cached.productUrl) : null
          const brandHasKnownDomains = brandSlugForCache && Object.keys(MANUFACTURER_DOMAINS).includes(brandSlugForCache)
          if (brandHasKnownDomains && !cachedIsManufacturer) {
            // La marque a un site officiel connu mais le cache pointe vers un revendeur
            // → invalider entièrement le cache pour forcer une nouvelle recherche
            console.log('[enrichment] ⚠ cache URL', cached.productUrl, 'is NOT manufacturer site for brand', brand, '— invalidating cache for fresh search')
            log(`Cache invalidé — ${cached.productUrl} n'est pas le site fabricant ${brand}`)
            // Ne pas réutiliser le cache — laisser productUrl null pour déclencher la recherche
          } else {
          // Invalider le cache si le markdown a trop peu de specs
          const cachedSpecCount = cached.markdownContent ? parseSpecsFromMarkdown(cached.markdownContent).length : 0
          // Les sites fabricants ont généralement 15+ specs — seuil adapté
          const cachedIsManufacturer = cached.productUrl ? detectManufacturerSite(cached.productUrl) !== null : false
          const cacheMinSpecs = cachedIsManufacturer ? 10 : 5
          if (cachedSpecCount >= cacheMinSpecs) {
            productUrl = cached.productUrl
            additionalSources = cached.additionalSources
            usedCache = true
            console.log('[enrichment] ★ using scrape cache →', { url: productUrl, specs: cachedSpecCount, mdLen: cached.markdownContent?.length })
            log(`Cache réutilisé — ${cachedSpecCount} specs, ${cached.markdownContent?.length ?? 0} chars`)
          } else {
            // Cache pauvre — garder l'URL mais re-scraper
            productUrl = cached.productUrl
            additionalSources = cached.additionalSources
            usedCache = false
            console.log('[enrichment] ⚠ cache has only', cachedSpecCount, 'specs — will re-scrape and try fallbacks')
          }
          }
        } else if (!productUrl) {
          setProgress(sheetName, rowId, {
            status: 'searching',
            message: 'Recherche de la page produit…',
          })
          const ref = reference ?? sku ?? ''
          const refQuoted = ref ? `"${ref}"` : ''
          const coreTerms = [refQuoted || ref, brand, title].filter(Boolean).join(' ').trim()

          // ── Priorité n°0 : site officiel FR de la marque ─────────────────
          const BRAND_DOMAINS_FR: Record<string, string[]> = {
            milwaukee:  ['fr.milwaukeetool.eu'],
            dewalt:     ['dewalt.fr'],
            makita:     ['makita.fr'],
            bosch:      ['bosch-professional.com/fr/fr', 'bosch-home.fr', 'bosch.fr'],
            metabo:     ['metabo.com/fr/fr'],
            hikoki:     ['hikoki-powertools.fr'],
            festool:    ['festool.fr'],
            stanley:    ['stanleytools.fr'],
            ryobi:      ['fr.ryobitools.eu'],
            stihl:      ['stihl.fr'],
            husqvarna:  ['husqvarna.com/fr'],
            worx:       ['worx.com/fr'],
            aeg:        ['aeg-powertools.eu/fr'],
            einhell:    ['einhell.fr'],
            karcher:    ['kaercher.com/fr'],
            facom:      ['facom.fr'],
            hilti:      ['hilti.fr'],
            flex:       ['flex-tools.com/fr-fr'],
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
            const allBrandDomains = [...(frDomains ?? []), ...(intlDomains ?? [])]
            // Extraire juste le modèle / référence du titre (ex: "M18 FPD3-502X" de "Perceuse à percussion M18 FPD3-502X")
            const modelFromTitle = title.match(/[A-Z]{1,5}[\-\s]?\d{1,4}[\w\-]*/i)?.[0] ?? ''
            const shortTerms = ref || modelFromTitle  // Préférer la ref, sinon extraire le modèle du titre

            if (allBrandDomains.length > 0) {
              // Requête 1 : termes complets sur tous les domaines fabricant
              const allOps = allBrandDomains.map((d) => `site:${d.split('/')[0]}`).join(' OR ')
              brandSiteQueries.push(`${coreTerms} (${allOps})`)
              // Requête 2 : termes COURTS (juste le modèle) sur domaines fabricant — plus susceptible de trouver des résultats
              if (shortTerms && shortTerms !== coreTerms) {
                brandSiteQueries.push(`${shortTerms} (${allOps})`)
              }
              // Requête 3 : requête très simple — juste le modèle + marque + site:
              if (shortTerms) {
                const primaryDomain = allBrandDomains[0].split('/')[0]
                brandSiteQueries.push(`${shortTerms} ${brand} site:${primaryDomain}`)
              }
            }
            if (allBrandDomains.length === 0) {
              brandSiteQueries.push(
                `${coreTerms} (site:${brandSlug}.fr OR site:fr.${brandSlug}.eu OR site:${brandSlug}.eu)`,
              )
              brandSiteQueries.push(
                `${coreTerms} (site:${brandSlug}.com OR site:${brandSlug}.eu)`,
              )
            }
          }

          const tnSites = 'site:monoprix.tn OR site:carrefour.tn OR site:mytek.tn OR site:tunisianet.com.tn OR site:jumia.com.tn'
          const frSites = 'site:amazon.fr OR site:fnac.com OR site:darty.com OR site:boulanger.com OR site:cdiscount.com OR site:rakuten.com'
          const intlSites = 'site:amazon.com OR site:ebay.com OR site:aliexpress.com'

          const rawQueries = [
            ...brandSiteQueries,
            `${coreTerms} (${tnSites})`,
            `${coreTerms} (${frSites})`,
            `${coreTerms} (${intlSites})`,
            [refQuoted, brand, title, 'acheter'].filter(Boolean).join(' '),
            [title, brand, 'acheter en ligne'].filter(Boolean).join(' '),
            [title, brand, ref].filter(Boolean).join(' '),
          ]
          const queries = rawQueries
            .map((q) => q.trim())
            .filter((q, i, arr) => q && arr.indexOf(q) === i)

          let bestPick: { url: string; extras: string[]; query: string; score: number } | null = null

          const processSearchResults = (results: SearchResult[], q: string): boolean => {
            const clean = results.filter((r) => {
              const junk = isJunkUrl(r.url)
              if (junk) console.log('[enrichment] rejecting junk URL:', r.url)
              return !junk
            })
            if (clean.length === 0) return false
            const scored = clean
              .map((r) => ({ r, score: scoreResult(r, sourceTokens, brand, reference ?? sku) }))
              .sort((a, b) => b.score - a.score)
            console.log('[enrichment] scored results:', scored.map((s) => ({ url: s.r.url, score: s.score })))
            const top = scored[0]
            if (top.score <= 0) return false
            if (!bestPick || top.score > bestPick.score) {
              bestPick = {
                url: top.r.url,
                extras: scored.slice(1, 5).filter((s) => s.score > 0).map((s) => s.r.url),
                query: q,
                score: top.score,
              }
            }
            return bestPick.score >= 20
          }

          // ── Recherche via Jina (DuckDuckGo) ──
          for (const q of queries) {
            try {
              console.log('[enrichment] [Jina] trying search query:', q)
              log(`Recherche : ${q.length > 80 ? q.slice(0, 77) + '…' : q}`)
              const results = await jinaSearch(q, 10)
              if (processSearchResults(results, q)) break
            } catch (err) {
              searchErrorMsg = err instanceof Error ? err.message : String(err)
              console.error('[enrichment] [Jina] search FAILED for query:', q, err)
            }
          }

          if (bestPick) {
            productUrl = bestPick.url
            additionalSources = bestPick.extras
            console.log('[enrichment] ✓ final pick →', { url: productUrl, score: bestPick.score, query: bestPick.query })
            log(`✓ URL trouvée : ${productUrl} (score ${bestPick.score})`)
          }

          // ── Essai final fabricant : si bestPick n'est pas un site fabricant ──
          // mais la marque est connue, essayer une dernière recherche ultra-ciblée
          if (bestPick && brandSlug && Object.keys(MANUFACTURER_DOMAINS).includes(brandSlug)) {
            const isAlreadyManufacturer = detectManufacturerSite(bestPick.url)
            if (!isAlreadyManufacturer) {
              console.log('[enrichment] ⚡ best pick is NOT manufacturer site — trying final manufacturer probe for', brandSlug)
              log(`URL n'est pas le site fabricant — recherche sur site officiel ${brandSlug}…`)
              const mfrDomains = MANUFACTURER_DOMAINS[brandSlug]
              if (mfrDomains) {
                const modelFromTitle = title.match(/[A-Z]{1,5}[\-\s]?\d{1,4}[\w\-]*/i)?.[0] ?? ''
                const probeTerms = ref || modelFromTitle || title
                for (const domain of mfrDomains) {
                  try {
                    const probeQuery = `${probeTerms} site:${domain}`
                    console.log('[enrichment] [manufacturer-probe] trying:', probeQuery)
                    const probeResults = await jinaSearch(probeQuery, 5)
                    const probeClean = probeResults.filter((r) => !isJunkUrl(r.url))
                    const probeMfr = probeClean.filter((r) => detectManufacturerSite(r.url))
                    if (probeMfr.length > 0) {
                      const scored = probeMfr
                        .map((r) => ({ r, score: scoreResult(r, sourceTokens, brand, reference ?? sku) }))
                        .sort((a, b) => b.score - a.score)
                      if (scored[0].score > 0) {
                        // Remplacer bestPick par le résultat fabricant — mettre l'ancien bestPick dans extras
                        console.log('[enrichment] ✓ manufacturer probe found:', scored[0].r.url, 'score:', scored[0].score)
                        log(`✓ Site fabricant trouvé : ${scored[0].r.url}`)
                        additionalSources = [bestPick.url, ...bestPick.extras]
                        productUrl = scored[0].r.url
                        bestPick = { url: scored[0].r.url, extras: additionalSources, query: probeQuery, score: scored[0].score }
                        break
                      }
                    }
                  } catch (err) {
                    console.warn('[enrichment] [manufacturer-probe] failed for', domain, err)
                  }
                }
              }
            }
          }

          if (!productUrl) {
            const reason = searchErrorMsg
              ? `Recherche échouée : ${searchErrorMsg}`
              : `Aucune page produit pertinente trouvée pour "${title} ${brand ?? ''} ${ref}". Saisissez une URL manuelle dans la ligne source.`
            console.error('[enrichment] no URL after all attempts →', reason)
            setError(sheetName, rowId, reason)
            return null
          }
        }

        // ── Étape 2 : Scraper la page via Jina Reader ──────────────────────
        let markdownContent: string | null = usedCache ? (cached!.markdownContent ?? null) : null

        /** Score la qualité du markdown : specs × 3 + avantages × 2 + bonus description */
        const scoreMd = (md: string | null): number => {
          if (!md || md.length < 200) return 0
          const specs = parseSpecsFromMarkdown(md).length
          const advs = parseAdvantagesFromMarkdown(md).length
          const descLen = parseDescriptionFromMarkdown(md).length
          return specs * 3 + advs * 2 + (descLen > 50 ? 5 : 0)
        }

        // Détection anticipée du site fabricant pour adapter la stratégie de scraping
        const earlyManufacturerBrand = productUrl ? detectManufacturerSite(productUrl) : null

        if (productUrl && !usedCache) {
          const hostname = new URL(productUrl).hostname
          setProgress(sheetName, rowId, {
            status: 'scraping',
            message: earlyManufacturerBrand
              ? `Site fabricant ${earlyManufacturerBrand} — scraping avancé (accordéons, specs, PDFs)…`
              : `Deep scrape ${hostname} (onglets, accordéons, window.*)…`,
          })
          try {
            // Deep scrape pour TOUS les sites : JS injection pour ouvrir les onglets,
            // développer les accordéons, et détecter les objets produit dans window.*
            // avec suivi automatique des liens HATEOAS.
            // Fallback automatique vers GET si POST échoue ou pas de clé Jina.
            log(`Deep scrape (X-Engine: browser, tabs, window.*) → ${productUrl}`)
            const deepResult = await jinaScrapeMaufacturerPage(productUrl)
            markdownContent = deepResult?.markdown ?? null
            // deepResult.html sera utilisé par scrapeProductBundle (task 5)
            console.log('[enrichment] [Jina] markdown →', markdownContent ? `${markdownContent.length} chars` : 'null', '(deep scrape)')
            log(markdownContent
              ? `✓ Markdown reçu : ${markdownContent.length} caractères`
              : `✗ Aucun contenu markdown reçu`)
          } catch (err) {
            console.warn('[enrichment] Jina markdown failed', err)
          }
          if (markdownContent) {
            console.log('[enrichment] markdown preview (first 3000 chars):\n', markdownContent.slice(0, 3000))
          }

          // ── Fallback : si le markdown est trop court/pauvre, essayer des sources alternatives ──
          const primaryScore = scoreMd(markdownContent)
          console.log('[enrichment] primary markdown score:', primaryScore, '(', markdownContent?.length ?? 0, 'chars)')
          log(`Score qualité markdown : ${primaryScore} (specs×3 + avantages×2)`)
          if (primaryScore < 10 && additionalSources.length > 0) {
            console.log('[enrichment] ⚡ primary scrape insufficient (score', primaryScore, '), trying alternatives…')
            log(`Score trop faible — test de ${additionalSources.length} source(s) alternative(s)…`)
            for (const altUrl of additionalSources.slice(0, 3)) {
              try {
                const altMd = await jinaScrapeMarkdown(altUrl)
                const altScore = scoreMd(altMd)
                console.log('[enrichment] alt source:', altUrl, '→ score', altScore, '(', altMd?.length ?? 0, 'chars)')
                if (altScore > primaryScore) {
                  console.log('[enrichment] ✓ alternative source is better:', altUrl)
                  log(`✓ Meilleure source alternative : ${new URL(altUrl).hostname}`)
                  markdownContent = altMd
                  break
                }
              } catch { /* ignorer */ }
            }
          }
        }

        // ── Fallback HTML : si on a < 5 specs (cache OU scrape frais), tenter extraction HTML ──
        const currentSpecCount = markdownContent ? parseSpecsFromMarkdown(markdownContent).length : 0
        if (currentSpecCount < 5 && productUrl) {
          console.log('[enrichment] ⚡ only', currentSpecCount, 'specs — trying HTML fallback for accordion/hidden content…')
          log(`Seulement ${currentSpecCount} specs — fallback HTML (accordéons/contenus cachés)…`)
          setProgress(sheetName, rowId, {
            status: 'scraping',
            message: `Extraction des accordéons et contenus cachés…`,
          })
          try {
            const htmlMd = await scrapeHtmlFallback(productUrl)
            if (htmlMd) {
              const htmlSpecs = parseSpecsFromMarkdown(htmlMd).length
              console.log('[enrichment] HTML fallback →', htmlSpecs, 'specs (', htmlMd.length, 'chars)')
              if (htmlSpecs > currentSpecCount) {
                markdownContent = (markdownContent ?? '') + '\n\n' + htmlMd
                console.log('[enrichment] ✓ merged HTML fallback →', markdownContent.length, 'chars total')
                log(`✓ HTML fallback : +${htmlSpecs} specs fusionnées`)
              }
            }
          } catch (err) {
            console.warn('[enrichment] HTML fallback failed:', err)
            log(`✗ HTML fallback échoué`)
          }
        }

        // ── Sauvegarder le cache scraping pour les prochains Re-générer ──
        if (!usedCache && productUrl) {
          setScrapeCache(sheetName, rowId, {
            productUrl,
            additionalSources,
            markdownContent,
            scrapeProvider: 'Jina',
          })
          console.log('[enrichment] ★ scrape cache saved for', enrichmentKey(sheetName, rowId))
        }

        // ── Étape 3 : Construction depuis les données scrapées ────────
        let enriched: EnrichedProduct

        // ══ PATH FABRICANT : scraping pur (AUCUN LLM) ═════════════════
        // Si le produit est sur un site fabricant officiel, on combine
        // le markdown Jina (bullet points, description) + données brutes
        // (REDUX_STORE, JSON-LD) pour les PDFs, variants, images.
        const manufacturerBrand = productUrl ? detectManufacturerSite(productUrl) : null
        if (manufacturerBrand && productUrl) {
          console.log('[enrichment] ★ MANUFACTURER SITE DETECTED:', manufacturerBrand, '— pure scraping mode')
          log(`★ Site fabricant ${manufacturerBrand} détecté — mode scraping pur (0 IA)`)
          setProgress(sheetName, rowId, {
            status: 'scraping',
            message: `Site fabricant ${manufacturerBrand} détecté — extraction complète (sans IA)…`,
          })

          // Fetch raw HTML for embedded data (REDUX, JSON-LD, PDFs)
          log(`Extraction HTML brut (REDUX_STORE, JSON-LD, PDFs)…`)
          const rawData = await scrapeManufacturerRawData(productUrl)
          log(`HTML brut : ${rawData.downloads.length} PDFs, ${rawData.specs.length} specs, ${rawData.variants.length} variantes, ${rawData.images.length} images`)

          setProgress(sheetName, rowId, {
            status: 'reasoning',
            message: 'Construction directe depuis les données scrapées du fabricant…',
          })
          log(`Construction de la fiche produit (markdown + HTML brut)…`)
          const mfrBuild = buildManufacturerProduct(markdownContent, rawData, productUrl, additionalSources)

          console.log('[enrichment] ★ MANUFACTURER BUILD RESULT:', {
            specs: mfrBuild.specifications.length,
            advantages: mfrBuild.advantages.length,
            docs: mfrBuild.documents.length,
            variants: mfrBuild.variants.length,
            images: mfrBuild.images.length,
          })
          log(`Résultat scraping fabricant : ${mfrBuild.specifications.length} specs, ${mfrBuild.advantages.length} avantages, ${mfrBuild.documents.length} PDFs, ${mfrBuild.images.length} images`)

          // Si le scraping fabricant a assez de specs, on utilise le résultat directement
          if (mfrBuild.specifications.length >= 3) {
            enriched = mfrBuild
            log(`✓ Scraping fabricant complet — aucune IA nécessaire`)
          } else {
            // Scraping insuffisant (site SPA, lazy-loading, Jina sans crédits…)
            // → Basculer vers le LLM pour compléter les specs manquantes
            // tout en conservant les données scrapées (avantages, images, PDFs)
            console.log('[enrichment] ⚠ manufacturer scraping insufficient (', mfrBuild.specifications.length, 'specs) — falling back to LLM boost')
            log(`⚠ Specs insuffisantes (${mfrBuild.specifications.length}) — complément via IA…`)
            setProgress(sheetName, rowId, {
              status: 'reasoning',
              message: `Specs fabricant insuffisantes — complément IA pour ${manufacturerBrand}…`,
            })

            const mfrSourceContext = [
              `Titre : ${title}`,
              category && `Catégorie : ${category}`,
              `Marque : ${brand || manufacturerBrand}`,
              (reference ?? sku) && `Référence / SKU : ${reference ?? sku}`,
              description && `Description existante : ${description}`,
            ].filter(Boolean).join('\n')

            const mfrDataSections: string[] = []
            if (markdownContent) {
              mfrDataSections.push(`## Contenu de la page produit (markdown rendu)\n${markdownContent.slice(0, 20000)}`)
            }

            const mfrPrompt = `Tu es un extracteur de données. Le scraping du site fabricant ${manufacturerBrand} a retourné un contenu partiellement structuré.
Tu dois UNIQUEMENT extraire et structurer les données PRÉSENTES dans le contenu markdown ci-dessous.

## RÈGLE ABSOLUE
NE JAMAIS inventer, deviner ou compléter des valeurs de spécifications.
Si une spec n'est pas explicitement mentionnée dans le markdown, NE PAS l'inclure.
Les valeurs numériques doivent correspondre EXACTEMENT au texte source (pas d'arrondi, pas de conversion).

## Produit à identifier
${mfrSourceContext}

${mfrDataSections.join('\n\n')}

## DONNÉES DÉJÀ SCRAPÉES (à conserver telles quelles)
${mfrBuild.advantages.length > 0 ? `### Avantages scrapés (${mfrBuild.advantages.length})\n${mfrBuild.advantages.map(a => `- ${a.text}`).join('\n')}` : ''}
${mfrBuild.specifications.length > 0 ? `### Specs scrapées (${mfrBuild.specifications.length})\n${mfrBuild.specifications.map(s => `- ${s.group ? `[${s.group}] ` : ''}${s.name}: ${s.value}`).join('\n')}` : ''}

## CE QUE TU DOIS FAIRE
1. Description : rédige une description professionnelle du produit en français (2-4 phrases), basée UNIQUEMENT sur le contenu de la page
2. Avantages : REPRENDS les avantages scrapés ci-dessus + extrais ceux mentionnés dans le markdown
3. Spécifications : Extrais UNIQUEMENT les specs visibles dans le markdown ci-dessus.
   Parcours TOUT le texte pour trouver les paires nom/valeur (tables, listes, texte libre).
   Organise-les en groupes selon les titres de section du markdown.
   NE PAS compléter avec des specs que tu "connais" — UNIQUEMENT ce qui est dans le texte.
4. Variantes : extrais uniquement si présentes dans le markdown
5. Images / Documents : tableaux vides (on ajoutera les URLs scrapées après)

## IMPORTANT
- TOUJOURS répondre en FRANÇAIS
- FIDÉLITÉ : chaque valeur doit être recopiée EXACTEMENT depuis le markdown source
- Si tu ne trouves PAS une spec dans le texte, ne l'ajoute PAS

Réponds UNIQUEMENT via l'outil emit_response.`

            let mfrLlmProvider: string | undefined
            let mfrLlmModel: string | undefined
            const mfrAi = await generateJson({
              task: 'product.enrichment',
              prompt: mfrPrompt,
              schema: enrichedProductSchema,
              schemaForLLM: enrichedProductJsonSchema as unknown as Record<string, unknown>,
              version: 'product.enrichment.v1',
              onProviderUsed: ({ provider, model }) => {
                mfrLlmProvider = provider
                mfrLlmModel = model
              },
              onRequestSent: (request) => {
                setLlmRequest(sheetName, rowId, request)
              },
            })

            // Fusionner : données scrapées (images, PDFs, variants) + LLM (specs, description, avantages)
            const llmSpecs = Array.isArray(mfrAi.specifications) ? mfrAi.specifications : []
            const llmAdvantages = Array.isArray(mfrAi.advantages)
              ? (mfrAi.advantages as string[]).map(text => typeof text === 'string' ? { text } : text)
              : []

            // Merge des avantages : scrapés d'abord, puis LLM non-dupliqués
            const mergedAdvantages = [...mfrBuild.advantages]
            const advNorms = new Set(mfrBuild.advantages.map(a => a.text.toLowerCase().replace(/[^a-zàâéèêëîïôùûüç0-9]/g, '').slice(0, 40)))
            for (const a of llmAdvantages) {
              const aObj = typeof a === 'object' && 'text' in a ? a : { text: String(a) }
              const norm = aObj.text.toLowerCase().replace(/[^a-zàâéèêëîïôùûüç0-9]/g, '').slice(0, 40)
              if (!advNorms.has(norm)) {
                mergedAdvantages.push(aObj as { text: string; group?: string })
                advNorms.add(norm)
              }
            }

            // Merge des specs : scrapées d'abord, puis LLM non-dupliquées
            const mergedSpecs = [...mfrBuild.specifications]
            const specNorms = new Set(mfrBuild.specifications.map(s => s.name.toLowerCase().trim()))
            for (const s of llmSpecs) {
              if (s.name && s.value != null && !specNorms.has(s.name.toLowerCase().trim())) {
                mergedSpecs.push(s)
                specNorms.add(s.name.toLowerCase().trim())
              }
            }

            // Merge des variants : scrapés d'abord, puis LLM
            const mergedVariants = mfrBuild.variants.length > 0 ? mfrBuild.variants
              : (Array.isArray(mfrAi.variants) ? mfrAi.variants.filter(
                  (v: unknown) => v && typeof v === 'object' && typeof (v as Record<string, unknown>).reference === 'string'
                ) : [])

            enriched = {
              description: mfrAi.description || mfrBuild.description,
              advantages: mergedAdvantages,
              specifications: mergedSpecs,
              variants: mergedVariants,
              images: mfrBuild.images, // garder les images scrapées
              documents: mfrBuild.documents, // garder les PDFs scrapés
              sourceUrl: productUrl,
              additionalSources,
              generatedAt: Date.now(),
              scrapingProvider: 'Jina + Fabricant (scraping direct)',
              llmProvider: mfrLlmProvider,
              llmModel: mfrLlmModel,
            }

            log(`✓ Résultat hybride fabricant+IA : ${enriched.specifications.length} specs, ${enriched.advantages.length} avantages, ${enriched.documents.length} PDFs`)
          }
        }
        // ══ PATH A : Construction directe depuis markdown (pas de LLM) ═
        else {
        let directBuild: Partial<EnrichedProduct> | null = null
        if (markdownContent && markdownContent.length > 200) {
          const mdSpecs = parseSpecsFromMarkdown(markdownContent)
          const mdAdvantages = parseAdvantagesFromMarkdown(markdownContent)
          let mdDescription = parseDescriptionFromMarkdown(markdownContent)

          if (!mdDescription || mdDescription.length < 30) {
            const h1Match = markdownContent.match(/^#\s+(.+)/m)
            if (h1Match) mdDescription = h1Match[1].replace(/\*\*/g, '').trim()
          }

          console.log('[enrichment] markdown build attempt:', { specs: mdSpecs.length, advantages: mdAdvantages.length, descLen: mdDescription.length })

          const hasEnoughData = mdSpecs.length >= 5
            && (mdAdvantages.length >= 2 || mdDescription.length > 50)
          if (hasEnoughData) {
            const mdDocs = [...markdownContent.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)]
              .map(m => m[0])
            // Liens PDF titrés [nom](url.pdf)
            const mdDocTitled = [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+\.pdf[^\s)]*)\)/gi)]
              .map(m => `${m[1].trim()}##${m[2].trim()}`)
            const mdVariants = parseVariantsFromMarkdown(markdownContent)
            const directImages = parseImagesFromMarkdown(markdownContent)
            directBuild = {
              description: mdDescription,
              advantages: mdAdvantages,
              specifications: mdSpecs,
              variants: mdVariants,
              documents: [...new Set([...mdDocTitled, ...mdDocs])],
              images: [...new Set(directImages)],
            }
            console.log('[enrichment] ★ markdown direct build succeeded')
          }
        }

        if (directBuild) {
          console.log('[enrichment] ★ DIRECT BUILD — bypassing LLM entirely')
          log(`★ Build direct (sans IA) — ${directBuild.specifications?.length ?? 0} specs, ${directBuild.advantages?.length ?? 0} avantages`)
          setProgress(sheetName, rowId, {
            status: 'reasoning',
            message: 'Construction directe depuis les données scrapées (sans IA)…',
          })

          const mergedImages = Array.from(new Set(
            (directBuild.images ?? []).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u)),
          ))

          enriched = {
            description: directBuild.description ?? '',
            advantages: directBuild.advantages ?? [],
            specifications: directBuild.specifications ?? [],
            variants: directBuild.variants ?? [],
            images: mergedImages,
            documents: directBuild.documents ?? [],
            sourceUrl: productUrl,
            additionalSources,
            generatedAt: Date.now(),
            scrapingProvider: 'Jina (direct)',
            llmProvider: undefined,
            llmModel: undefined,
          }
        } else {
          // ══ PATH B : LLM classique ═══════════════════════════════════
          log(`Synthèse IA (LLM) — données scrapées insuffisantes pour build direct`)
          setProgress(sheetName, rowId, {
            status: 'reasoning',
            message: 'Génération de la fiche enrichie par l\'IA…',
          })

          const sourceContext = [
            `Titre : ${title}`,
            category && `Catégorie : ${category}`,
            brand && `Marque : ${brand}`,
            (reference ?? sku) && `Référence / SKU : ${reference ?? sku}`,
            description && `Description existante : ${description}`,
          ]
            .filter(Boolean)
            .join('\n')

          const dataSections: string[] = []
          if (markdownContent) {
            dataSections.push(`## Contenu de la page produit (markdown rendu)\n${markdownContent.slice(0, 20000)}`)
          }

          const finalMdScore = scoreMd(markdownContent)
          const finalSpecCount = markdownContent ? parseSpecsFromMarkdown(markdownContent).length : 0
          const hasRichData = dataSections.length > 0 && finalMdScore >= 10 && finalSpecCount >= 5
          const hasSomeData = dataSections.length > 0
          // Si on a des données scrapées mais très peu de specs (site SPA/accordéons),
          // combiner données scrapées + connaissances LLM
          const needsKnowledgeBoost = hasSomeData && finalSpecCount < 5

          const prompt = hasRichData
            ? `Tu es un extracteur de données produit. Tu extrais et structures fidèlement les données trouvées dans les contenus ci-dessous.

## Produit à identifier
${sourceContext}

${dataSections.join('\n\n')}

## RÈGLES ABSOLUES
1. COPIER VERBATIM — ne reformule jamais, ne résume jamais, n'embellis jamais
2. Description : copie le texte descriptif trouvé TEL QUEL, mot pour mot
3. Avantages : copie TOUS les bullet points / features TEL QUEL. SANS LIMITE de nombre
4. Spécifications : extrais CHAQUE paire nom/valeur de CHAQUE section technique. SANS LIMITE de nombre
5. Variantes : extrais TOUTES les déclinaisons/variantes du produit avec référence, libellé et properties
6. Images : reprends toutes les URLs d'images (https://...) trouvées dans les données
7. Documents : reprends toutes les URLs de fichiers PDF (.pdf) trouvées dans les données
8. Si un champ n'existe pas dans les données → chaîne vide ou tableau vide. JAMAIS d'invention.
9. NE TRADUIS PAS — garde la langue originale des données

Réponds UNIQUEMENT via l'outil emit_response.`
            : needsKnowledgeBoost
            ? `Tu es un extracteur de données. Le scraping de la page web a retourné un contenu partiellement structuré.
Tu dois UNIQUEMENT extraire et structurer les données PRÉSENTES dans le contenu markdown ci-dessous.

## RÈGLE ABSOLUE
NE JAMAIS inventer, deviner ou compléter des valeurs de spécifications.
Si une spec n'est pas explicitement mentionnée dans le markdown, NE PAS l'inclure.
Les valeurs numériques doivent correspondre EXACTEMENT au texte source.

## Produit à identifier
${sourceContext}

${dataSections.join('\n\n')}

## CE QUE TU DOIS FAIRE
1. Description : rédige une description professionnelle en français basée UNIQUEMENT sur le contenu de la page
2. Avantages : extrais TOUS les points forts / avantages mentionnés dans le markdown
3. Spécifications : Parcours TOUT le markdown pour trouver les paires nom/valeur.
   Organise-les en groupes selon les titres de section du texte.
   NE PAS compléter avec des specs non présentes dans le texte — UNIQUEMENT ce qui est écrit.
4. Variantes : extrais uniquement si présentes dans le markdown
5. Images / Documents : reprends les URLs trouvées dans les données scrapées. NE PAS inventer d'URLs.

## IMPORTANT
- TOUJOURS répondre en FRANÇAIS
- FIDÉLITÉ : chaque valeur doit être recopiée EXACTEMENT depuis le markdown source
- Si tu ne trouves PAS une spec dans le texte, ne l'ajoute PAS
- Mieux vaut retourner moins de specs que d'en inventer

Réponds UNIQUEMENT via l'outil emit_response.`
            : `Tu es un expert produit. Le scraping de la page web n'a pas donné de contenu exploitable.
À partir de tes connaissances sur ce produit et la marque, génère une fiche produit complète.

## Produit à identifier
${sourceContext}
${hasSomeData ? '\n' + dataSections.join('\n\n') : ''}

## CE QUE TU DOIS FAIRE
1. Description : rédige une description marketing professionnelle du produit en français (2-4 phrases)
2. Avantages : liste les principaux points forts / avantages du produit (5-10 bullet points)
3. Spécifications : liste TOUTES les spécifications techniques connues, organisées en groupes (Informations, Poids, Puissance, Décibels, Vibrations, Dimensions, etc.)
   Inclus notamment : tension, couple, vitesse, capacité, poids, dimensions, niveau sonore, vibrations, etc.
4. Variantes : si tu connais des déclinaisons (kits avec différentes batteries, etc.), liste-les
5. Images / Documents : tableaux vides (tu n'as pas d'URLs)

## IMPORTANT
- TOUJOURS répondre en FRANÇAIS
- Base-toi sur tes connaissances réelles du produit et de la marque
- Sois factuel et précis — pas de spécifications inventées
- Si tu ne connais pas une info, ne l'invente pas

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

          // Images : on se base UNIQUEMENT sur l'extraction directe du markdown, qui applique
          // les filtres junk + priorité /products/. Les URLs du LLM (souvent citées depuis le
          // haut de page tronqué à 20k chars = menus nav) contourneraient ce filtre.
          const mdImages = markdownContent ? parseImagesFromMarkdown(markdownContent) : []
          const mergedImages: string[] = [...mdImages]
          console.log('[enrichment-images] PATH=B(LLM) mdImages=', mdImages.length, 'merged=', mergedImages.length, 'sample:', mergedImages.slice(0, 3))

          // Documents : LLM + extraction directe du markdown (URLs .pdf simples + liens titrés)
          const mdDocUrls = markdownContent
            ? [...markdownContent.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)].map(m => m[0])
            : []
          const mdDocTitled = markdownContent
            ? [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+\.pdf[^\s)]*)\)/gi)]
                .map(m => `${m[1].trim()}##${m[2].trim()}`)
            : []
          const mergedDocs = Array.from(new Set([
            ...(ai.documents ?? []).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)),
            ...mdDocTitled,
            ...mdDocUrls,
          ]))

          const llmVariants: Array<{ reference: string; label: string; properties: Record<string, string> }> =
            Array.isArray(ai.variants) ? ai.variants.filter(
              (v: unknown) => v && typeof v === 'object' && typeof (v as Record<string, unknown>).reference === 'string'
            ) : []
          if (llmVariants.length > 0) {
            console.log('[enrichment] LLM extracted', llmVariants.length, 'variants')
          }

          enriched = {
            description: ai.description,
            advantages: (ai.advantages as string[]).map(text => ({ text })),
            specifications: ai.specifications,
            variants: llmVariants,
            images: mergedImages,
            documents: mergedDocs,
            sourceUrl: productUrl,
            additionalSources,
            generatedAt: Date.now(),
            scrapingProvider: productUrl ? 'Jina' : undefined,
            llmProvider: llmProviderUsed,
            llmModel: llmModelUsed,
          }
        }
        } // fin du else (non-fabricant)

        // ── Post-processing : enrichir avec groupes markdown ──
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
    [setProgress, setData, setError, setLlmRequest, getScrapeCache, setScrapeCache],
  )

  const reset = useCallback(
    (sheetName: string, rowId: string) => {
      clear(sheetName, rowId)
      clearScrapeCache(sheetName, rowId)
    },
    [clear, clearScrapeCache],
  )

  return { enrich, reset, running }
}
