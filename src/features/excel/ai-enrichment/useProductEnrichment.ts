import { useCallback, useState } from 'react'
import { z } from 'zod'
import { getApiKey } from '@/lib/apiKeys'
import { generateJson } from '@/features/ai/llmRouter'
import { useEnrichmentStore } from './enrichmentStore'
import type { EnrichedProduct, ProductPrice } from './types'
import { enrichmentKey } from './types'
import { scrapeProductBundle } from './scrapeBundle'
import { extractSpecsBlockFromHtml, extractDocumentsBlockFromHtml } from './htmlSpecsExtractor'
import {
  GARBAGE_RE,
  isGarbageContent,
  parseSpecsFromMarkdown,
  parseVariantsFromMarkdown,
  parseAdvantagesFromMarkdown,
  parseImagesFromMarkdown,
  cleanMarkdownCell,
  isValidVariantRef,
} from './markdownParsers'
import {
  type SearchResult,
  isJunkUrl,
  tokenizeTitle,
  scoreResult,
  MANUFACTURER_DOMAINS,
  detectManufacturerSite,
  preferFrenchUrl,
} from './urlScoring'

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

  // ── 2. Specs : LLM = source de vérité. Backfill UNIQUEMENT si LLM vide.
  //    Pas de remplacement : si le LLM a retourné des specs, on les garde —
  //    le TS-side extracteur est moins fiable (risque de capter des grilles UI).
  //    Sinon, on complète les groupes par matching sur le markdown.
  const mdSpecs = parseSpecsFromMarkdown(markdownContent)
  if (specifications.length === 0) {
    const cleanSpecs = parseCleanSpecsFromJinaBlock(markdownContent)
    if (cleanSpecs.length > 0) {
      specifications = cleanSpecs
      console.log('[post-process] ✓ specs backfilled from JINA block:', specifications.length, 'items')
    }
  } else if (mdSpecs.length > 0 && mdSpecs.some(s => s.group) && !specifications.some(s => s.group)) {
    // Markdown a des groupes, pas le LLM → enrichir par matching
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

  // Dédupliquer par URL normalisée (un même PDF peut arriver plusieurs fois via
  // LLM + markdown + proxy CORS + reader Jina, chaque fois avec un titre différent).
  // On garde la PREMIÈRE occurrence (ordre : LLM → markdown) — cleanDocumentName
  // assure que le titre est lisible quel que soit le format source.
  const dedupedDocuments = deduplicateDocuments(cleanedDocuments)

  return { ...enriched, description, advantages, specifications, variants, documents: dedupedDocuments }
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
  heroImage: z.string().optional(),
  price: z.object({
    amount: z.number(),
    currency: z.string(),
    priceType: z.enum(['TTC', 'HT', 'unit']).optional(),
  }).nullable().optional(),
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
    heroImage: {
      type: 'string',
      description: 'URL de LA meilleure image produit (hero shot / image principale / première photo produit). Doit être une URL présente dans les images scrapées. Ne jamais inventer.',
    },
    price: {
      type: 'object',
      nullable: true,
      description: "Prix du produit si visible dans la page (JSON-LD Offer, balise price, texte 'XX,XX €'). Omettre ou null si absent. Ne jamais inventer.",
      properties: {
        amount: { type: 'number', description: 'Valeur numérique (ex: 323.44)' },
        currency: { type: 'string', description: 'Code ISO 4217 : EUR, USD, TND, GBP' },
        priceType: { type: 'string', enum: ['TTC', 'HT', 'unit'], description: 'TTC si mention TTC/incl. VAT, HT si HT/excl. VAT, unit sinon' },
      },
      required: ['amount', 'currency'],
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
 * Filet de sécurité : si le markdown ne contient pas déjà les blocs
 * JINA_EXTRACTED_SPECS / DOCUMENTS (cas où le script injecté n'a pas tourné —
 * POST bloqué par CORS, CSP, etc.), on parse le HTML capturé côté TS avec
 * DOMParser et on ajoute les blocs manuellement. DOMParser ignore CSS donc
 * les panels `display:none` sont parcourus de toute façon.
 */
function enrichResultWithHtmlExtraction(result: DeepScrapeResult, pageUrl: string): DeepScrapeResult {
  let md = result.markdown
  if (result.html) {
    if (md.indexOf('JINA_EXTRACTED_SPECS_START') === -1) {
      const block = extractSpecsBlockFromHtml(result.html)
      if (block) {
        md += `\n\n${block}`
        console.log('[html-extractor] ✓ TS-side specs block appended from Jina html (', block.length, 'chars)')
      }
    }
    if (md.indexOf('JINA_EXTRACTED_DOCUMENTS_START') === -1) {
      const block = extractDocumentsBlockFromHtml(result.html, pageUrl)
      if (block) {
        md += `\n\n${block}`
        console.log('[html-extractor] ✓ TS-side documents block appended from Jina html (', block.length, 'chars)')
      }
    }
  }
  return md === result.markdown ? result : { ...result, markdown: md }
}

/**
 * CORS-proxy fallback : fetch le HTML brut du fabricant et extrait specs/docs.
 * Utile quand Jina ne livre pas le DOM complet (tabs lazy-loaded, SPA partielle).
 * Lancé APRÈS enrichResultWithHtmlExtraction, déclenché uniquement si les blocs
 * JINA_EXTRACTED_SPECS/DOCUMENTS sont toujours absents ou faibles.
 */
async function fetchAndExtractFromRawHtml(pageUrl: string): Promise<{ specs: string; docs: string } | null> {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(pageUrl)}`,
  ]
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) continue
      const html = await res.text()
      if (!html || html.length < 2000) continue
      console.log('[cors-proxy-extract] got', html.length, 'chars from', proxy.split('?')[0])
      const specs = extractSpecsBlockFromHtml(html)
      const docs = extractDocumentsBlockFromHtml(html, pageUrl)
      if (specs || docs) {
        console.log('[cors-proxy-extract] ✓ specs:', specs.length, 'chars, docs:', docs.length, 'chars')
        return { specs, docs }
      }
    } catch { /* try next */ }
  }
  return null
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
  // ── STRATÉGIE UNIVERSELLE : s'appuyer sur les primitives W3C / WAI-ARIA.
  //    Tout site accessible expose les mêmes attributs standard :
  //      • Tabs pattern   → [role="tab"] + aria-controls="id" + [role="tabpanel"]
  //      • Disclosure     → [aria-expanded] + aria-controls="id"
  //      • Native HTML5   → <details open>, <summary>
  //      • Hidden content → [hidden] (attribut HTML), [aria-hidden="true"]
  //    Aucun besoin de deviner des noms de classes — on parse ces contrats.
  //    Pour les sites non conformes (rares) : le fallback click() générique
  //    sur tout bouton/lien parent d'une région cachée couvre le reste.
  function unhide(el) {
    if (!el || el.nodeType !== 1) return;
    el.style.setProperty('display', 'revert', 'important');
    el.style.setProperty('visibility', 'visible', 'important');
    el.style.setProperty('opacity', '1', 'important');
    el.style.setProperty('height', 'auto', 'important');
    el.style.setProperty('max-height', 'none', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
    el.style.setProperty('clip', 'auto', 'important');
    el.style.setProperty('clip-path', 'none', 'important');
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  // Bombe atomique : force-unhide TOUT élément display:none/visibility:hidden.
  // Couvre les patterns legacy non-ARIA (ex: Makita <div class="article_tab_content"
  // style="display:none">) que la navigation par primitives W3C ne peut pas cibler.
  function revealAllHidden() {
    var SKIP = { SCRIPT:1, STYLE:1, LINK:1, META:1, TEMPLATE:1, NOSCRIPT:1, HEAD:1, HTML:1, IFRAME:1, TITLE:1, BASE:1 };
    document.querySelectorAll('body *').forEach(function(el) {
      if (SKIP[el.tagName]) return;
      try {
        var cs = window.getComputedStyle(el);
        if (!cs) return;
        if (cs.display === 'none') el.style.setProperty('display', 'block', 'important');
        if (cs.visibility === 'hidden') el.style.setProperty('visibility', 'visible', 'important');
        if (cs.opacity === '0') el.style.setProperty('opacity', '1', 'important');
      } catch(e) {}
    });
  }

  function expandAll() {
    // 0) Unhide massif — avant toute autre opération.
    revealAllHidden();

    // 1) Tabs pattern (W3C WAI-ARIA) — activer TOUS les panels simultanément.
    //    Chaque [role="tab"] pointe vers son panel via aria-controls.
    document.querySelectorAll('[role="tab"]').forEach(function(tab) {
      tab.setAttribute('aria-selected', 'true');
      tab.setAttribute('tabindex', '0');
      var panelId = tab.getAttribute('aria-controls');
      if (panelId) {
        var panel = document.getElementById(panelId);
        if (panel) unhide(panel);
      }
    });
    // Couvrir les tabpanels même si aucun tab ne les référence (mal codé).
    document.querySelectorAll('[role="tabpanel"]').forEach(unhide);

    // 2) Disclosure pattern (WAI-ARIA) — tout [aria-expanded] + aria-controls.
    document.querySelectorAll('[aria-expanded="false"]').forEach(function(trigger) {
      trigger.setAttribute('aria-expanded', 'true');
      var targetId = trigger.getAttribute('aria-controls');
      if (targetId) {
        targetId.split(/\\s+/).forEach(function(id) {
          var target = document.getElementById(id);
          if (target) unhide(target);
        });
      }
    });

    // 3) Native HTML5 <details> — juste ajouter l'attribut open.
    document.querySelectorAll('details:not([open])').forEach(function(d) {
      d.setAttribute('open', '');
    });

    // 4) Attribut natif [hidden] — retirer (spec HTML5 : équivaut à display:none).
    document.querySelectorAll('[hidden]').forEach(function(el) {
      // Préserver <script>/<style>/<template> qui sont légitimement cachés.
      var tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'LINK' || tag === 'META') return;
      el.removeAttribute('hidden');
      unhide(el);
    });

    // 5) [aria-hidden="true"] hors navigation — WAI-ARIA indique contenu caché
    //    aux AT, donc typiquement caché visuellement aussi sur sites accessibles.
    document.querySelectorAll('[aria-hidden="true"]').forEach(function(el) {
      if (el.closest('nav,header,footer')) return;
      unhide(el);
    });

    // 6) CSS global : filet de sécurité pour les cas non couverts par JS (re-render React/Vue).
    if (!document.getElementById('__jina_force_visible__')) {
      var styleTag = document.createElement('style');
      styleTag.id = '__jina_force_visible__';
      styleTag.textContent = [
        '[role="tabpanel"]{display:block!important;visibility:visible!important;opacity:1!important;height:auto!important;max-height:none!important;overflow:visible!important}',
        '[aria-hidden="true"]:not(nav):not(header):not(footer){display:revert!important;visibility:visible!important;opacity:1!important}',
        'details{open:true}',
        'img[loading="lazy"]{content-visibility:visible}'
      ].join('\\n');
      document.head.appendChild(styleTag);
    }

    // 7) Lazy-load images : spec HTML5 loading="lazy" → forcer le chargement.
    document.querySelectorAll('img[loading="lazy"]').forEach(function(img) { img.loading = 'eager'; });
    // Conventions de facto (HTMLImageElement ne définit pas data-src, mais les
    // libs lazyload standard s'en servent) — swap si src absent.
    document.querySelectorAll('img[data-src],img[data-srcset]').forEach(function(img) {
      var ds = img.getAttribute('data-src');
      var dss = img.getAttribute('data-srcset');
      if (ds && !img.getAttribute('src')) img.setAttribute('src', ds);
      if (dss && !img.getAttribute('srcset')) img.setAttribute('srcset', dss);
    });
    // Scroll pour réveiller IntersectionObserver (pattern lazy-load standard).
    try { window.scrollTo(0, document.body.scrollHeight); window.scrollTo(0, 0); } catch(e) {}

    // 8) Pattern tabs de facto : <a href="#id"> qui pointe vers un panel local.
    //    Très courant (Bootstrap tabs legacy, onglets custom Drupal/Makita, etc.).
    //    On dé-masque la cible ET on déclenche le click (pour les handlers JS).
    document.querySelectorAll('a[href^="#"]').forEach(function(a) {
      var href = a.getAttribute('href') || '';
      if (href.length < 2) return;
      var id = href.substring(1);
      if (!id || /^[!?\\/]/.test(id)) return;
      var target = document.getElementById(id);
      if (!target) return;
      // Ne cliquer que si la cible ressemble à un panel (contient du contenu bloc),
      // pas une simple ancre vers un titre (pour éviter de casser la navigation).
      if (target.children.length > 0 || (target.textContent || '').trim().length > 40) {
        unhide(target);
        try { a.click(); } catch(e) {}
      }
    });

    // 9) Bootstrap (legacy + v5) : data-toggle/data-bs-toggle + data-target/data-bs-target.
    document.querySelectorAll('[data-toggle],[data-bs-toggle]').forEach(function(trigger) {
      var sel = trigger.getAttribute('data-target') || trigger.getAttribute('data-bs-target') || '';
      if (sel && sel.charAt(0) === '#') {
        var tgt = document.getElementById(sel.substring(1));
        if (tgt) unhide(tgt);
      }
      try { trigger.click(); } catch(e) {}
    });

    // 10) Fallback générique : cliquer tout ce qui a un handler explicite (onclick
    //     inline, role="tab"/"button") ou un <summary>. Couvre les sites legacy
    //     non-ARIA (ex: Makita <li id="tab_3" onclick="switchArtikelTab(this)">).
    document.querySelectorAll(
      '[onclick],[role="tab"],[role="button"],button[aria-controls],a[aria-controls],summary'
    ).forEach(function(el) {
      try { el.click(); } catch(e) {}
    });
  }

  // ── Extraction VIDÉOS (iframe YouTube/Vimeo + <video> + data-video-id) ──
  function extractVideos() {
    var videos = [];
    var seen = {};
    var addVideo = function(url, title) {
      if (!url || seen[url]) return;
      seen[url] = true;
      videos.push((title ? title + ' | ' : '') + url);
    };
    // iframes YouTube / Vimeo / Wistia
    document.querySelectorAll('iframe[src*="youtube"],iframe[src*="youtu.be"],iframe[src*="vimeo"],iframe[src*="wistia"]').forEach(function(f) {
      addVideo(f.src, f.getAttribute('title') || '');
    });
    // video tags
    document.querySelectorAll('video[src],video source[src]').forEach(function(v) {
      addVideo(v.src, v.getAttribute('title') || v.getAttribute('aria-label') || '');
    });
    // data-video-id → reconstruire URL YouTube
    document.querySelectorAll('[data-youtube-id],[data-video-id],[data-yt-id]').forEach(function(el) {
      var id = el.getAttribute('data-youtube-id') || el.getAttribute('data-video-id') || el.getAttribute('data-yt-id');
      if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
        addVideo('https://www.youtube.com/watch?v=' + id, el.getAttribute('aria-label') || el.textContent || '');
      }
    });
    // Liens <a> vers YouTube/Vimeo
    document.querySelectorAll('a[href*="youtube.com/watch"],a[href*="youtu.be/"],a[href*="vimeo.com/"]').forEach(function(a) {
      addVideo(a.href, (a.textContent || '').trim());
    });
    if (videos.length > 0) {
      var div = document.createElement('div');
      div.innerText = 'JINA_EXTRACTED_VIDEOS_START\\n' + videos.join('\\n') + '\\nJINA_EXTRACTED_VIDEOS_END';
      document.body.prepend(div);
    }
  }

  // ── Extraction SPECS génériques (<table> + <dl>) ──
  //    Couvre tous les sites qui exposent des caractéristiques via tables HTML standard.
  function extractGenericSpecs() {
    var out = '';
    var seenPairs = {};

    function nearestHeading(el) {
      var cur = el;
      for (var i = 0; i < 4 && cur; i++) {
        var sib = cur.previousElementSibling;
        while (sib) {
          if (/^H[1-6]$/.test(sib.tagName)) {
            var t = (sib.textContent || '').replace(/\\s+/g, ' ').trim();
            if (t && t.length <= 80) return t;
          }
          sib = sib.previousElementSibling;
        }
        cur = cur.parentElement;
      }
      return '';
    }

    // Tables 2-colonnes : label | value
    document.querySelectorAll('table').forEach(function(tbl) {
      var rows = tbl.querySelectorAll('tr');
      if (rows.length < 2) return;
      var localPairs = [];
      rows.forEach(function(tr) {
        var cells = tr.querySelectorAll('td,th');
        if (cells.length < 2) return;
        var k = (cells[0].textContent || '').replace(/\\s+/g, ' ').trim();
        var v = (cells[1].textContent || '').replace(/\\s+/g, ' ').trim();
        // Support ✓/✗ → Oui/Non
        if (!v && cells[1].querySelector('[class*="check"],svg')) v = 'Oui';
        if (!k || !v || k === v) return;
        if (k.length > 80 || v.length > 200) return;
        var pk = k.toLowerCase();
        if (seenPairs[pk]) return;
        seenPairs[pk] = true;
        localPairs.push(k + ' = ' + v);
      });
      if (localPairs.length >= 2) {
        var cap = tbl.querySelector('caption');
        var title = (cap && (cap.textContent || '').trim()) || nearestHeading(tbl) || 'Spécifications';
        out += 'GROUP: ' + title + '\\n' + localPairs.join('\\n') + '\\n';
      }
    });

    // Listes de définition <dl><dt>/<dd>
    document.querySelectorAll('dl').forEach(function(dl) {
      var dts = dl.querySelectorAll('dt');
      var dds = dl.querySelectorAll('dd');
      if (dts.length < 2 || dts.length !== dds.length) return;
      var localPairs = [];
      for (var i = 0; i < dts.length; i++) {
        var k = (dts[i].textContent || '').replace(/\\s+/g, ' ').trim();
        var v = (dds[i].textContent || '').replace(/\\s+/g, ' ').trim();
        if (!k || !v || k.length > 80 || v.length > 200) continue;
        var pk = k.toLowerCase();
        if (seenPairs[pk]) continue;
        seenPairs[pk] = true;
        localPairs.push(k + ' = ' + v);
      }
      if (localPairs.length >= 2) {
        var title = nearestHeading(dl) || 'Spécifications';
        out += 'GROUP: ' + title + '\\n' + localPairs.join('\\n') + '\\n';
      }
    });

    // Pseudo-tables en <div> : pattern ultra-courant sur e-commerce moderne.
    //   <div class="specs"><div class="row"><div>Label</div><div>Value</div></div>...</div>
    // Heuristique : élément avec ≥3 enfants directs "similaires", chaque enfant
    // contenant un label court + une valeur courte → c'est une table de specs.
    function extractPairFromRow(row) {
      // Déballer récursivement les wrappers à enfant unique (Makita : <div.techspecs--row>
      // → <div.techspecs-content-inner> → <li.row-content> → 2 divs label/value).
      var cur = row;
      for (var u = 0; u < 6; u++) {
        var ch = Array.from(cur.children).filter(function(e) {
          var t = (e.textContent || '').trim();
          return t.length > 0;
        });
        if (ch.length >= 2) break;
        if (ch.length === 1) { cur = ch[0]; continue; }
        break;
      }
      var subs = Array.from(cur.children).filter(function(e) {
        var t = (e.textContent || '').trim();
        return t.length > 0;
      });
      if (subs.length >= 2) {
        var k1 = (subs[0].textContent || '').replace(/\\s+/g, ' ').trim();
        var v1 = (subs[1].textContent || '').replace(/\\s+/g, ' ').trim();
        if (!v1 && subs[1].querySelector('svg,[class*="check"]')) v1 = 'Oui';
        if (k1 && v1 && k1 !== v1 && k1.length <= 80 && v1.length <= 200) return [k1, v1];
      }
      // Fallback : pattern "Label : valeur" dans un seul élément texte
      var flat = (row.textContent || '').replace(/\\s+/g, ' ').trim();
      var m = flat.match(/^([^:：]{2,60})\\s*[:：]\\s*(.{1,200})$/);
      if (m) return [m[1].trim(), m[2].trim()];
      return null;
    }

    // Filtre anti-parasite : écarter nav, cookies, menus, footers.
    function isJunkContext(el) {
      var cur = el;
      while (cur && cur !== document.body) {
        var tag = cur.tagName;
        if (tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER') return true;
        var cls = (cur.className || '') + ' ' + (cur.id || '');
        if (typeof cls !== 'string') cls = '';
        if (/cookie|consent|gdpr|mega-?menu|navigation|breadcrumb|footer|cart|panier|newsletter|social/i.test(cls)) return true;
        cur = cur.parentElement;
      }
      return false;
    }

    function scanContainerForPairs(el) {
      var tag = el.tagName;
      if (tag === 'TABLE' || tag === 'DL' || tag === 'TR' || tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT') return null;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return null;
      if (isJunkContext(el)) return null;
      var kids = el.children;
      if (!kids || kids.length < 2 || kids.length > 80) return null;
      var pairs = [];
      for (var i = 0; i < kids.length; i++) {
        var p = extractPairFromRow(kids[i]);
        if (p) pairs.push(p);
      }
      if (pairs.length < 2 || pairs.length / kids.length < 0.5) return null;
      return pairs;
    }

    // 1) PRIORITÉ : conteneurs explicitement nommés "specs/tech/caracteristic/features".
    //    Couvre Makita <ul class="techspecs">, sites avec class="specifications" / "product-specs" / "tech-details".
    var priorityContainers = document.querySelectorAll(
      '[class*="techspec" i],[class*="tech-spec" i],[class*="specification" i],[class*="product-spec" i],' +
      '[class*="caracteris" i],[class*="features-list" i],[class*="attributes" i],[id*="specification" i],' +
      '[id*="techspec" i],[id*="caracteris" i],[class*="datasheet" i]'
    );
    var priorityHit = {};
    priorityContainers.forEach(function(el) {
      if (priorityHit[el.tagName + '#' + (el.id||'') + '.' + (el.className||'')]) return;
      var pairs = scanContainerForPairs(el);
      if (!pairs) return;
      priorityHit[el.tagName + '#' + (el.id||'') + '.' + (el.className||'')] = true;
      var localPairs = [];
      for (var pi = 0; pi < pairs.length; pi++) {
        var k = pairs[pi][0], v = pairs[pi][1], pk = k.toLowerCase();
        if (seenPairs[pk]) continue;
        seenPairs[pk] = true;
        localPairs.push(k + ' = ' + v);
      }
      if (localPairs.length >= 2) {
        var title = nearestHeading(el) || 'Caractéristiques techniques';
        out += 'GROUP: ' + title + '\\n' + localPairs.join('\\n') + '\\n';
      }
    });

    // 2) Générique : si le pre-scan n'a rien sorti, tenter tout le body (ordre document).
    if (Object.keys(priorityHit).length === 0) {
      document.querySelectorAll('body *').forEach(function(el) {
        var pairs = scanContainerForPairs(el);
        if (!pairs || pairs.length < 3) return;
        var localPairs = [];
        for (var pi = 0; pi < pairs.length; pi++) {
          var k = pairs[pi][0], v = pairs[pi][1], pk = k.toLowerCase();
          if (seenPairs[pk]) continue;
          seenPairs[pk] = true;
          localPairs.push(k + ' = ' + v);
        }
        if (localPairs.length >= 3) {
          var title = nearestHeading(el) || 'Spécifications';
          out += 'GROUP: ' + title + '\\n' + localPairs.join('\\n') + '\\n';
        }
      });
    }

    // Remove previous injection to avoid duplicates
    var prev = document.getElementById('__jina_specs_block__');
    if (prev) prev.remove();
    if (out) {
      var div = document.createElement('div');
      div.id = '__jina_specs_block__';
      div.innerText = 'JINA_EXTRACTED_SPECS_START\\n' + out + 'JINA_EXTRACTED_SPECS_END';
      document.body.prepend(div);
    }
  }

  // ── Extraction DOCUMENTS (PDF) avec label row correct ──
  //    Pattern courant : <tr><td>Déclaration CE</td><td><a>PDF</a></td></tr>
  //    Le texte de l'anchor est juste "PDF" ou filename → on remonte au row.
  function extractGenericDocuments() {
    var docs = [];
    var seen = {};

    function labelForAnchor(a) {
      var GENERIC = /^(pdf|download|t[eé]l[eé]charger|voir|view|open|ouvrir|link|file|document)\\.?$/i;
      var cur = a.parentElement;
      for (var d = 0; d < 5 && cur; d++) {
        var tag = cur.tagName;
        if (tag === 'BODY' || tag === 'HTML' || tag === 'MAIN' || tag === 'SECTION' || tag === 'ARTICLE') break;
        var clone = cur.cloneNode(true);
        clone.querySelectorAll('a, button, img, svg, script, style, noscript').forEach(function(e) { e.remove(); });
        var parentTxt = (clone.textContent || '').replace(/\\s+/g, ' ').trim();
        if (parentTxt && parentTxt.length >= 5 && parentTxt.length <= 200 && !GENERIC.test(parentTxt)) return parentTxt;
        cur = cur.parentElement;
      }
      var txt = (a.textContent || '').replace(/\\s+/g, ' ').trim();
      if (txt && !GENERIC.test(txt) && txt.length <= 200) return txt;
      var aria = a.getAttribute('aria-label') || '';
      if (aria && !GENERIC.test(aria)) return aria.trim();
      var title = a.getAttribute('title') || '';
      if (title && !GENERIC.test(title)) return title.trim();
      try {
        var u = new URL(a.href);
        var fn = u.pathname.split('/').pop() || '';
        return decodeURIComponent(fn.replace(/\\.pdf$/i, '')).replace(/[_-]+/g, ' ').trim() || 'Document';
      } catch(e) { return 'Document'; }
    }

    document.querySelectorAll('a[href]').forEach(function(a) {
      var url = a.href || '';
      if (!/\\.pdf($|\\?|#)/i.test(url)) return;
      if (seen[url]) return;
      seen[url] = true;
      var label = labelForAnchor(a);
      docs.push(label + ' | ' + url);
    });

    var prev = document.getElementById('__jina_docs_block__');
    if (prev) prev.remove();
    if (docs.length > 0) {
      var div = document.createElement('div');
      div.id = '__jina_docs_block__';
      div.innerText = 'JINA_EXTRACTED_DOCUMENTS_START\\n' + docs.join('\\n') + '\\nJINA_EXTRACTED_DOCUMENTS_END';
      document.body.prepend(div);
    }
  }

  // ── Extraction VARIANTS (selects + swatches + liste déclinaisons) ──
  function extractVariants() {
    var variants = [];
    var seen = {};
    // <select> nommé variant/color/size/option
    document.querySelectorAll('select').forEach(function(sel) {
      var name = (sel.name || sel.id || '').toLowerCase();
      if (!/variant|color|couleur|size|taille|option|model|modele|ref/i.test(name)) return;
      Array.from(sel.options).forEach(function(opt) {
        var label = (opt.textContent || '').trim();
        var val = (opt.value || '').trim();
        if (label && val && label !== '—' && !/choisir|select|please/i.test(label)) {
          var k = name + '|' + val;
          if (!seen[k]) { seen[k] = true; variants.push(name + ' = ' + label + ' (' + val + ')'); }
        }
      });
    });
    // Swatches de couleur / radios variant
    document.querySelectorAll('[class*="swatch"],[class*="variant-option"],[class*="color-option"],[class*="size-option"],input[type="radio"][name*="variant" i],input[type="radio"][name*="color" i]').forEach(function(el) {
      var label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-value') || el.textContent || el.value || '').trim();
      var name = (el.getAttribute('name') || el.className || 'variant').toLowerCase();
      if (label && label.length > 0 && label.length < 80) {
        var k = name + '|' + label;
        if (!seen[k]) { seen[k] = true; variants.push(name + ' = ' + label); }
      }
    });
    if (variants.length > 0) {
      var div = document.createElement('div');
      div.innerText = 'JINA_EXTRACTED_VARIANTS_START\\n' + variants.join('\\n') + '\\nJINA_EXTRACTED_VARIANTS_END';
      document.body.prepend(div);
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

  // Exécution immédiate : expand + extraire specs/docs du DOM initial (tables
  // et liens PDF sont en général déjà là, juste cachés par display:none).
  expandAll();
  try { extractGenericSpecs(); } catch(e) {}
  try { extractGenericDocuments(); } catch(e) {}

  // Polling 20s (100 × 200ms) : ré-applique expansion + extractions à chaque tick
  // (remove+re-insert idempotent). Couvre les ré-rendus React/Vue et les AJAX lazy.
  var attempts = 0;
  var spaDone = false;
  var finalDone = false;
  var interval = setInterval(function() {
    attempts++;
    expandAll();
    if (!spaDone && tryExtractSPA()) spaDone = true;
    // Re-scan specs + docs à chaque tick — chaque passage remplace le div injecté.
    try { extractGenericSpecs(); } catch(e) {}
    try { extractGenericDocuments(); } catch(e) {}
    // Après 8s (40 ticks), on considère que les AJAX lazy sont arrivés :
    // extraire vidéos + variants à partir du DOM stabilisé.
    if (attempts === 40) {
      try { extractVideos(); } catch(e) {}
      try { extractVariants(); } catch(e) {}
    }
    if (attempts > 100) {
      if (!finalDone) {
        finalDone = true;
        try { expandAll(); } catch(e) {}
        try { extractVideos(); } catch(e) {}
        try { extractVariants(); } catch(e) {}
        try { extractGenericSpecs(); } catch(e) {}
        try { extractGenericDocuments(); } catch(e) {}
      }
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
        'X-Timeout': '90',
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

    return enrichResultWithHtmlExtraction({ markdown: md, html: capturedHtml, source: 'post-browser' as const }, pageUrl)
  } catch (err) {
    console.warn('[jina-manufacturer] POST scrape failed:', err, '— trying GET browser fallback')
    const jinaKey = getApiKey('jina')
    if (jinaKey) {
      return jinaScrapeMaufacturerPageFallback(pageUrl, jinaKey)
    }
    const fallbackMd = await jinaScrapeMarkdown(pageUrl)
    return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
  }
}

/** Fallback GET pour le scraping fabricant (sans injection JS).
 *  Essaie d'abord le mode GET browser engine (rend le DOM JS sans injection),
 *  puis retombe sur le mode JSON classique. Utile quand le POST est bloqué
 *  par CORS mais que GET browser passe (SPA qui rend son contenu côté client).
 */
async function jinaScrapeMaufacturerPageFallback(pageUrl: string, jinaKey: string): Promise<DeepScrapeResult | null> {
  console.log('[jina-manufacturer-fallback] trying GET browser engine (no JS injection)')
  try {
    const res = await fetch(`https://r.jina.ai/${pageUrl}`, {
      method: 'GET',
      headers: {
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
    })
    if (res.ok) {
      const json = await res.json() as { data?: { content?: string; html?: string; links?: Record<string, string>; images?: Record<string, string> } }
      const md = json?.data?.content || ''
      const html = json?.data?.html ?? null
      if (md && md.length > 500) {
        console.log('[jina-manufacturer-fallback] ✓ GET browser got', md.length, 'chars')
        return enrichResultWithHtmlExtraction({ markdown: md, html, source: 'get-fallback' as const }, pageUrl)
      }
      console.warn('[jina-manufacturer-fallback] GET browser returned thin content (', md.length, 'chars)')
    } else {
      console.warn('[jina-manufacturer-fallback] GET browser HTTP', res.status)
    }
  } catch (e) {
    console.warn('[jina-manufacturer-fallback] GET browser threw:', e)
  }

  // Dernier recours : mode JSON classique
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
  primaryImages: string[] = [],
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

  // Images : primaires (og:image / twitter:image / JSON-LD / link image_src) en tête,
  // puis markdown (Jina injected + inline + summary), puis REDUX. Dédupliquées.
  const mdImages = markdownContent ? parseImagesFromMarkdown(markdownContent) : []
  const imgSeen = new Set<string>()
  const images: string[] = []
  for (const url of [...primaryImages, ...mdImages, ...rawData.images]) {
    if (!imgSeen.has(url)) { imgSeen.add(url); images.push(url) }
  }
  console.log('[manufacturer-build] images:', images.length, '(primary:', primaryImages.length, ', md:', mdImages.length, ', redux:', rawData.images.length, ')')

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

/**
 * Parse UNIQUEMENT le bloc JINA_EXTRACTED_SPECS (injecté par notre script ou
 * par l'extracteur HTML TS-side). Ne touche PAS au reste du markdown — évite
 * de récupérer les tables de cookies, accessoires, etc. Utilisé pour backfill
 * quand le LLM n'a rien retourné.
 */
function parseCleanSpecsFromJinaBlock(md: string): Array<{ name: string; value: string; group?: string }> {
  const specs: Array<{ name: string; value: string; group?: string }> = []
  const seen = new Set<string>()
  const start = md.indexOf('JINA_EXTRACTED_SPECS_START')
  const end = md.indexOf('JINA_EXTRACTED_SPECS_END')
  if (start < 0 || end <= start) return specs
  const block = md.slice(start, end)
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
      if (!name || !value) continue
      const key = `${name.toLowerCase()}::${value.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      specs.push({ name, value, group: currentGroup })
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
 * Extrait un prix depuis le HTML (schema.org Product/Offer) puis depuis le markdown.
 * Retourne le premier prix plausible trouvé, ou null.
 *
 * Stratégie :
 *  1. JSON-LD : Product.offers.price / AggregateOffer.lowPrice
 *  2. Markdown : "XXX,XX €", "€XXX.XX" ou "XXX EUR" proches de mots-clés TTC/HT
 */
function extractProductPrice(
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
        // Cache scraping désactivé : chaque action fait un scrape frais.
        const usedCache = false

        // ── Étape 1 : Trouver la page produit ─────────────────────────────
        let productUrl: string | null = knownUrl ?? null
        let additionalSources: string[] = []
        let searchErrorMsg: string | null = null

        if (!productUrl) {
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
          // Extraire le modèle / code produit du titre (ex: "DUH752Z", "M18 FPD3-502X")
          // Utilisé pour : (a) construire des requêtes courtes site:fabricant,
          // (b) scorer les URLs — les fiches produit fabricant contiennent toujours
          // le code modèle dans le slug (ex: /product/duh752z.html).
          const modelFromTitle = title.match(/[A-Z]{2,5}[\-\s]?\d{1,4}[\w\-]*/i)?.[0] ?? ''
          const brandSiteQueries: string[] = []
          if (brandSlug) {
            const frDomains = BRAND_DOMAINS_FR[brandSlug]
            const intlDomains = BRAND_DOMAINS_INTL[brandSlug]
            const allBrandDomains = [...(frDomains ?? []), ...(intlDomains ?? [])]
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
              .map((r) => ({ r, score: scoreResult(r, sourceTokens, brand, reference ?? sku, modelFromTitle) }))
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
              log(`🔷 JINA · Recherche : ${q.length > 80 ? q.slice(0, 77) + '…' : q}`)
              const results = await jinaSearch(q, 10)
              if (processSearchResults(results, q)) break
            } catch (err) {
              searchErrorMsg = err instanceof Error ? err.message : String(err)
              console.error('[enrichment] [Jina] search FAILED for query:', q, err)
            }
          }

          if (bestPick) {
            const pickedUrl = bestPick.url
            productUrl = preferFrenchUrl(pickedUrl)
            additionalSources = bestPick.extras.map(preferFrenchUrl)
            if (productUrl !== pickedUrl) {
              console.log('[enrichment] 🌐 locale rewrite →', { from: pickedUrl, to: productUrl })
              log(`🌐 Locale non-fr détecté — tentative sur ${productUrl}`)
            }
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
                        .map((r) => ({ r, score: scoreResult(r, sourceTokens, brand, reference ?? sku, modelFromTitle) }))
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
        let markdownContent: string | null = null
        let primaryHtml: string | null = null

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
          const multiEnabled = useEnrichmentStore.getState().multiUrlEnabled
          try {
            if (multiEnabled) {
              log(`🔷 JINA · Multi-URL bundle (X-Engine: browser + onglets auto) → ${productUrl}`)
              const bundle = await scrapeProductBundle(productUrl, {
                deepScrape: async (url) => {
                  const r = await jinaScrapeMaufacturerPage(url)
                  return r ? { markdown: r.markdown, html: r.html } : null
                },
                fastScrape: (url) => jinaScrapeMarkdown(url),
                log,
              })
              markdownContent = bundle.mergedMarkdown || null
              primaryHtml = bundle.primaryHtml
              if (bundle.sourcesScrapped.length > 1) {
                log(`🔷 JINA · ✓ Bundle : ${bundle.sourcesScrapped.length} sources fusionnées (${bundle.pdfsFound.length} PDFs)`)
              }
              // Stocker sourcesScrapped dans le cache (géré plus bas)
              ;(bundle as unknown as { __forCache: { sourcesScrapped: string[] } }).__forCache = { sourcesScrapped: bundle.sourcesScrapped }
              ;(globalThis as unknown as { __lastBundle?: unknown }).__lastBundle = bundle
            } else {
              log(`🔷 JINA · Scrape single-URL (multi-URL désactivé) → ${productUrl}`)
              const r = await jinaScrapeMaufacturerPage(productUrl)
              markdownContent = r?.markdown ?? null
              primaryHtml = r?.html ?? null
            }
          } catch (err) {
            console.warn('[enrichment] scrape failed', err)
            log(`🔷 JINA · ✗ Scrape échec : ${String(err).slice(0, 200)}`)
          }
          if (markdownContent) {
            console.log('[enrichment] markdown preview (first 3000 chars):\n', markdownContent.slice(0, 3000))
          }

          // ── CORS-proxy fallback : si Jina n'a pas livré les blocs specs/docs, fetch HTML brut ──
          if (markdownContent && productUrl) {
            const hasSpecs = markdownContent.indexOf('JINA_EXTRACTED_SPECS_START') !== -1
            const hasDocs = markdownContent.indexOf('JINA_EXTRACTED_DOCUMENTS_START') !== -1
            if (!hasSpecs || !hasDocs) {
              console.log('[enrichment] Jina blocks missing (specs:', hasSpecs, 'docs:', hasDocs, ') → CORS proxy fallback')
              const extra = await fetchAndExtractFromRawHtml(productUrl)
              if (extra) {
                if (!hasSpecs && extra.specs) markdownContent += `\n\n${extra.specs}`
                if (!hasDocs && extra.docs) markdownContent += `\n\n${extra.docs}`
                log(`🔷 CORS proxy · ✓ Extraction HTML brut : specs ${extra.specs ? '✓' : '✗'}, docs ${extra.docs ? '✓' : '✗'}`)
              }
            }
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
          log(`🔷 JINA · Seulement ${currentSpecCount} specs — fallback HTML (accordéons/contenus cachés)…`)
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
                log(`🔷 JINA · ✓ HTML fallback : +${htmlSpecs} specs fusionnées`)
              }
            }
          } catch (err) {
            console.warn('[enrichment] HTML fallback failed:', err)
            log(`🔷 JINA · ✗ HTML fallback échoué`)
          }
        }

        // Images primaires extraites à chaque scrape (pas de cache)
        const primaryImages = productUrl ? extractPrimaryImagesFromHtml(primaryHtml, productUrl) : []
        const extractedPrice = productUrl ? extractProductPrice(primaryHtml, markdownContent) : null
        if (extractedPrice) {
          log(`💰 Prix détecté : ${extractedPrice.amount} ${extractedPrice.currency}${extractedPrice.priceType && extractedPrice.priceType !== 'unit' ? ' ' + extractedPrice.priceType : ''} (source: ${extractedPrice.source})`)
        }
        ;(globalThis as unknown as { __lastBundle?: unknown }).__lastBundle = undefined

        // ── Étape 3 : Construction depuis les données scrapées ────────
        let enriched: EnrichedProduct

        // ══ PATH FABRICANT : scraping pur (AUCUN LLM) ═════════════════
        // Si le produit est sur un site fabricant officiel, on combine
        // le markdown Jina (bullet points, description) + données brutes
        // (REDUX_STORE, JSON-LD) pour les PDFs, variants, images.
        // Refonte : on court-circuite le path fabricant (REDUX/JSON-LD) et le
        // direct-build markdown. Un seul appel LLM avec schéma strict extrait
        // tout (description, bullets, specs, variants, images, prix, hero).
        const manufacturerBrand = null as string | null
        if (manufacturerBrand && productUrl) {
          console.log('[enrichment] ★ MANUFACTURER SITE DETECTED:', manufacturerBrand, '— pure scraping mode')
          log(`★ Site fabricant ${manufacturerBrand} détecté — mode scraping pur (0 IA)`)
          setProgress(sheetName, rowId, {
            status: 'scraping',
            message: `Site fabricant ${manufacturerBrand} détecté — extraction complète (sans IA)…`,
          })

          // Fetch raw HTML for embedded data (REDUX, JSON-LD, PDFs)
          log(`🔷 JINA · Extraction HTML brut (REDUX_STORE, JSON-LD, PDFs)…`)
          const rawData = await scrapeManufacturerRawData(productUrl)
          log(`🔷 JINA · HTML brut : ${rawData.downloads.length} PDFs, ${rawData.specs.length} specs, ${rawData.variants.length} variantes, ${rawData.images.length} images`)

          setProgress(sheetName, rowId, {
            status: 'reasoning',
            message: 'Construction directe depuis les données scrapées du fabricant…',
          })
          log(`Construction de la fiche produit (markdown + HTML brut)…`)
          if (primaryImages.length > 0) {
            log(`★ ${primaryImages.length} image(s) primaire(s) détectée(s) (og:image / JSON-LD / link)`)
          }
          const mfrBuild = buildManufacturerProduct(markdownContent, rawData, productUrl, additionalSources, primaryImages)

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
            enriched = { ...mfrBuild, price: extractedPrice }
            log(`✓ Scraping fabricant complet — aucune IA nécessaire`)
          } else {
            // Scraping insuffisant (site SPA, lazy-loading, Jina sans crédits…)
            // → Basculer vers le LLM pour compléter les specs manquantes
            // tout en conservant les données scrapées (avantages, images, PDFs)
            console.log('[enrichment] ⚠ manufacturer scraping insufficient (', mfrBuild.specifications.length, 'specs) — falling back to LLM boost')
            log(`🤖 IA · ⚠ Specs insuffisantes (${mfrBuild.specifications.length}) — complément via LLM…`)
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
              price: extractedPrice,
              sourceUrl: productUrl,
              additionalSources,
              generatedAt: Date.now(),
              scrapingProvider: 'Jina + Fabricant (scraping direct)',
              llmProvider: mfrLlmProvider,
              llmModel: mfrLlmModel,
            }

            log(`🤖 IA · ✓ Résultat hybride JINA+LLM : ${enriched.specifications.length} specs, ${enriched.advantages.length} avantages, ${enriched.documents.length} PDFs`)
          }
        }
        // ══ PATH A : Construction directe depuis markdown (pas de LLM) ═
        else {
        // Refonte : le direct-build TS est désactivé. Un seul appel LLM
        // avec schéma strict (PATH B) extrait TOUT (description, bullets,
        // specs groupées, variants, images, heroImage, prix) depuis le markdown Jina.
        // Les parseurs markdown restent utilisés pour les images / PDFs / groupes
        // via mergedImages / mergedDocs / enrichWithMarkdownGroups en post-processing.
        let directBuild: Partial<EnrichedProduct> | null = null
        const DIRECT_BUILD_DISABLED = true
        if (!DIRECT_BUILD_DISABLED && markdownContent && markdownContent.length > 200) {
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

          // Images : primaires (og:image / twitter:image / JSON-LD / link image_src) en tête,
          // puis celles du markdown. Dédupliquées.
          const mergedImages = Array.from(new Set([
            ...primaryImages,
            ...(directBuild.images ?? []).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u)),
          ]))
          if (primaryImages.length > 0) {
            log(`★ ${primaryImages.length} image(s) primaire(s) en tête (og:image / JSON-LD / link)`)
          }

          enriched = {
            description: directBuild.description ?? '',
            advantages: directBuild.advantages ?? [],
            specifications: directBuild.specifications ?? [],
            variants: directBuild.variants ?? [],
            images: mergedImages,
            documents: directBuild.documents ?? [],
            price: extractedPrice,
            sourceUrl: productUrl,
            additionalSources,
            generatedAt: Date.now(),
            scrapingProvider: 'Jina (direct)',
            llmProvider: undefined,
            llmModel: undefined,
          }
        } else {
          // ══ PATH B : LLM classique ═══════════════════════════════════
          log(`🤖 IA · Synthèse LLM — données scrapées insuffisantes pour build direct`)
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
            ? `Tu es un extracteur de données produit. Tu extrais fidèlement les données trouvées et produis une fiche EN FRANÇAIS.

## Produit à identifier
${sourceContext}

${dataSections.join('\n\n')}

## RÈGLES ABSOLUES
1. LANGUE DE SORTIE : TOUJOURS FRANÇAIS. Si la source est en anglais/allemand/autre, TRADUIS (description, noms de specs, libellés groupes, avantages, libellés variants). Les valeurs numériques + unités + références/SKU restent inchangées.
2. Description : reprends le texte descriptif marketing ; si source non-FR, traduis fidèlement en français professionnel (2-4 phrases minimum).
3. Avantages : reprends TOUS les bullet points / features / arguments commerciaux, traduits en FR. SANS LIMITE de nombre.
4. Spécifications : extrais CHAQUE paire nom/valeur de CHAQUE section technique. SANS LIMITE. Le nom ET le group sont en FRANÇAIS (ex: "Poids", "Dimensions", "Puissance"). La valeur garde chiffres + unités (ex: "2.3 kg", "18 V").
   EXCLURE : raccourcis clavier de players vidéo/audio (Play/Pause, Volume, Plein écran, Sous-titres, Avancer, Reculer, Shortcut, touches flèches directionnelles, "Espace", "c", "f", "m", "d", "t" seuls comme valeurs), éléments d'accessibilité/UI, prix, disponibilité/stock, délais de livraison, codes promo, notes/avis (étoiles, /5), noms d'accessoires vendus à part (chargeurs, coffrets, batteries en pack). Ne garder QUE les caractéristiques techniques du produit.
5. Variantes : extrais TOUTES les déclinaisons avec référence (inchangée), libellé (FR) et properties (clés FR, valeurs inchangées sauf couleurs/matières traduites).
6. Images : reprends TOUTES les URLs d'images produit (https://...) trouvées. Ignore logos, icônes, pub.
7. heroImage : sélectionne UNE URL parmi images — la meilleure photo principale. Ne jamais inventer. Omettre si rien ne convient.
8. price : si un prix est visible (JSON-LD Offer, balise <price>, texte "XX,XX €" / "$XX.XX"), extrais { amount, currency (code ISO 4217), priceType }. Sinon null. JAMAIS INVENTER.
9. Documents : reprends toutes les URLs de fichiers PDF trouvées.
10. Si un champ n'existe pas dans les données → chaîne vide / tableau vide / null. JAMAIS d'invention.
11. FIDÉLITÉ chiffrée : les valeurs numériques doivent correspondre EXACTEMENT au source (pas d'arrondi, pas de conversion d'unité).

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
              log(`🤖 IA · Requête LLM envoyée (${llmProviderUsed ?? '?'} / ${llmModelUsed ?? '?'})`)
            },
          })
          log(`🤖 IA · ✓ Réponse LLM : ${(ai.specifications ?? []).length} specs, ${(ai.advantages ?? []).length} avantages, ${(ai.variants ?? []).length} variantes`)

          // Images : on se base UNIQUEMENT sur l'extraction directe du markdown, qui applique
          // les filtres junk + priorité /products/. Les URLs du LLM (souvent citées depuis le
          // haut de page tronqué à 20k chars = menus nav) contourneraient ce filtre.
          const mdImages = markdownContent ? parseImagesFromMarkdown(markdownContent) : []
          const mergedImages: string[] = Array.from(new Set([...primaryImages, ...mdImages]))
          console.log('[enrichment-images] PATH=B(LLM) primaryImages=', primaryImages.length, 'mdImages=', mdImages.length, 'merged=', mergedImages.length, 'sample:', mergedImages.slice(0, 3))

          // Hero image : priorité au choix LLM s'il figure dans les images scrapées,
          // sinon premier primaryImage (og:image / JSON-LD), sinon première mergedImage.
          const aiHero = typeof (ai as { heroImage?: unknown }).heroImage === 'string'
            ? ((ai as { heroImage?: string }).heroImage ?? '').trim()
            : ''
          const heroImage = (aiHero && mergedImages.includes(aiHero))
            ? aiHero
            : (primaryImages[0] ?? mergedImages[0] ?? undefined)

          // Prix : prioriser le LLM (qui voit TTC/HT contextuellement) sinon fallback
          // sur extractedPrice (JSON-LD / regex). Null si ni l'un ni l'autre.
          const aiPriceRaw = (ai as { price?: unknown }).price
          const aiPrice = (aiPriceRaw && typeof aiPriceRaw === 'object'
            && typeof (aiPriceRaw as { amount?: unknown }).amount === 'number'
            && typeof (aiPriceRaw as { currency?: unknown }).currency === 'string')
            ? { ...(aiPriceRaw as { amount: number; currency: string; priceType?: 'TTC' | 'HT' | 'unit' }), source: 'llm' }
            : null
          const finalPrice = aiPrice ?? extractedPrice
          if (aiPrice) log(`🤖 IA · 💰 Prix LLM : ${aiPrice.amount} ${aiPrice.currency}${aiPrice.priceType && aiPrice.priceType !== 'unit' ? ' ' + aiPrice.priceType : ''}`)

          // Documents : LLM + extraction directe du markdown (URLs .pdf simples + liens titrés)
          const mdDocUrls = markdownContent
            ? [...markdownContent.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)].map(m => m[0])
            : []
          const mdDocTitled = markdownContent
            ? [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+\.pdf[^\s)]*)\)/gi)]
                .map(m => `${m[1].trim()}##${m[2].trim()}`)
            : []
          // PDFs extraits côté DOM par le script d'injection (JINA_EXTRACTED_DOCUMENTS_*) —
          // labels corrects via remontée au parent row (tr/li). C'est la source la plus fiable.
          const domDocsMatch = markdownContent?.match(/JINA_EXTRACTED_DOCUMENTS_START\s*([\s\S]*?)\s*JINA_EXTRACTED_DOCUMENTS_END/)
          const domDocs: string[] = domDocsMatch
            ? domDocsMatch[1]
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.includes(' | '))
                .map((l) => {
                  const idx = l.lastIndexOf(' | ')
                  const name = l.slice(0, idx).trim()
                  const url = l.slice(idx + 3).trim()
                  return name ? `${name}##${url}` : url
                })
            : []
          // PDFs découverts via relatedUrls.ts (HTML brut) — fallback si script DOM n'a rien capturé.
          const bundlePdfs = ((globalThis as unknown as { __lastBundle?: { pdfsFound?: string[] } }).__lastBundle?.pdfsFound) ?? []
          const docsByUrl = new Map<string, string>() // url → entry (titré de préférence)
          const registerDoc = (raw: string) => {
            const url = raw.includes('##') ? raw.split('##').slice(1).join('##') : raw
            if (!/^https?:\/\//.test(url)) return
            const existing = docsByUrl.get(url)
            // Priorité : entrée titrée > entrée URL-seule. Ne pas écraser un titre existant par une URL nue.
            if (!existing || (raw.includes('##') && !existing.includes('##'))) {
              docsByUrl.set(url, raw)
            }
          }
          // Ordre de priorité : DOM extraction (labels précis) > markdown titré > bundle HTML > URLs nues
          ;[...domDocs, ...mdDocTitled, ...bundlePdfs, ...(ai.documents ?? []).filter((u): u is string => typeof u === 'string'), ...mdDocUrls]
            .forEach(registerDoc)
          const mergedDocs = Array.from(docsByUrl.values())

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
            heroImage,
            documents: mergedDocs,
            price: finalPrice,
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
