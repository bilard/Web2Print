import { useCallback, useState } from 'react'
import { z } from 'zod'
import { getApiKey } from '@/lib/apiKeys'
import { generateJson } from '@/features/ai/llmRouter'
import { useEnrichmentStore } from './enrichmentStore'
import type { EnrichedProduct, EnrichedDocument } from './types'
import { enrichmentKey } from './types'
import { scrapeProductBundle, extractPrimarySourceSection } from './scrapeBundle'
import { buildDocument, coerceDocuments } from './documentUtils'
import { sanitizeJinaMarkdown, looksLikeBotChallenge } from './markdownSanitize'
import { extractLongestProseParagraph } from './enrichmentSanitize'
import { isJunkImageUrl } from './imageFilter'
export { isJunkImageUrl }
import { parseDescriptionFromMarkdown as parseDescriptionFromMarkdownExternal } from '@/features/scraping/core/parsers/parseDescription'
import { parseSpecsFromMarkdown as parseSpecsFromMarkdownExternal } from '@/features/scraping/core/parsers/parseSpecifications'
import { parsePricingFromMarkdown } from '@/features/scraping/core/parsers/parsePricing'
import { parseAdvantagesFromMarkdown } from '@/features/scraping/core/parsers/parseAdvantages'
import { buildEnrichmentPrompt } from '@/features/scraping-templates/buildEnrichmentPrompt'
import { findMatchingTemplate } from '@/features/scraping-templates/useMatchingTemplate'
import { appendDebugEntry, genId } from '@/features/scraping-hub/debugLog'
import { extractStructuredDataFromUrl } from '@/features/scraping/core/structuredDataFetcher'
import type { StructuredProductData } from '@/features/scraping/core/structuredData'
import { firecrawlScrape } from '@/features/scraping/core/firecrawlFallback'
import { isHostKnownBlocked, markHostBlocked } from '@/features/scraping/core/brightDataFallback'
import { brightDataScrapeWithDocs, getLastBrightDataError, getLastBrightDataSuccess } from '@/features/scraping/core/brightDataFallback'
import { getSiteCookieForUrl } from '@/lib/siteCookies'
import { extractProductReference, buildManufacturerSearchUrl } from '@/features/scraping/core/manufacturerFallback'
import { detectBrandFromUrl } from '@/features/scraping/useJina'

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

// ── LLM debug logging ────────────────────────────────────────────────────────

function logLlmRequest(
  request: { provider: string; model: string; task: string; temperature: number; messages: Array<{ role: string; content: string }>; tool_name?: string },
): void {
  appendDebugEntry({
    id: genId(),
    timestamp: Date.now(),
    kind: 'llm',
    provider: request.provider,
    model: request.model,
    task: request.task,
    temperature: request.temperature,
    messages: request.messages,
    tool_name: request.tool_name,
  })
}

// ── Filtrage des contenus parasites (cookie banners, GDPR, reCAPTCHA) ───────

const GARBAGE_RE = /\b(cookie[s ]?|gdpr|your privacy|recaptcha|captcha|consent manager|targeting cookies?|functional cookies?|performance cookies?|strictly necessary|strictement\s+n[eé]cessaire|necessary cookies?|checkbox.?label|onetrust|cookiebot|manage preferences|cookie settings|politique de confidentialit[eé]|param[eè]tres? des? cookies?|refuser les cookies?|accepter les cookies?|we use cookies|this site is exceeding|we and our partners store|non-sensitive information|personali[sz]ed ads|ad measurement|audience insights|legitimate interest|store and\/or access|advertising purposes?|consent purposes?|personalised content|accept all|reject all|aspsessionid[a-z]*|asp\.net|prestataire\s+de\s+traitement|dur[eé]e\s+de\s+conservation|finalit[eé]\s+du\s+traitement|statistique|analytique|pr[eé]f[eé]rences?|ciblage|publicit[eé]|marketing)\b/i

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
 * Extrait le fil d'Ariane depuis l'en-tête markdown de Jina.
 * Stratégie : prendre la portion AVANT le premier H1 (où le breadcrumb apparaît
 * typiquement), repérer une ligne contenant ≥ 1 séparateur (`>`, `›`, `»`, `→`)
 * et ≥ 2 textes de liens markdown, filtrer les termes de navigation génériques,
 * dédupliquer en préservant l'ordre.
 */
function parseBreadcrumbFromMarkdown(md: string): string[] {
  if (!md) return []

  const h1Idx = md.search(/^#\s+/m)
  const headPart = h1Idx > 0 ? md.slice(0, h1Idx) : md.slice(0, 4000)
  const lines = headPart.split('\n').map((l) => l.trim()).filter(Boolean)

  // Termes de navigation site, pas du breadcrumb produit
  const NAV_RE = /^(menu|recherche|fermer|connexion|connectez|se\s+connecter|inscription|inscrire|panier|wishlist|liste\s+de\s+souhaits?|mon\s+compte|aide|contact|nous\s+contacter|langue|country|english|fran[çc]ais|skip|aller\s+au|retour\s+(en\s+)?haut|tous?\s+les?\s+(produits|cat[eé]gories)|voir\s+(tout|plus))/i

  // Texte d'un lien markdown — on capture aussi du texte final hors lien éventuel
  const mdLinkRe = /\[([^\]\n]+?)\]\(([^)]+)\)/g

  for (const line of lines) {
    if (line.length > 800) continue
    const sepCount = (line.match(/[›>»→]/g) ?? []).length
    if (sepCount < 1) continue

    const linkTexts: string[] = []
    for (const m of line.matchAll(mdLinkRe)) {
      const t = m[1].replace(/^!\[.*?\]\(.*?\)\s*/, '').trim()
      if (!t || t.length > 80) continue
      if (/^[›>»→/|·]+$/.test(t)) continue
      if (/^!?\[.*\]/.test(t)) continue
      if (NAV_RE.test(t)) continue
      linkTexts.push(t)
    }

    if (linkTexts.length < 2 || linkTexts.length > 8) continue

    // Tenter de récupérer le dernier segment (souvent texte brut, pas un lien)
    // après le dernier séparateur de la ligne
    const lastSep = Math.max(line.lastIndexOf('›'), line.lastIndexOf('>'), line.lastIndexOf('»'), line.lastIndexOf('→'))
    if (lastSep > 0) {
      const tail = line.slice(lastSep + 1).replace(mdLinkRe, '').trim()
      if (tail && tail.length <= 80 && !/^[›>»→/|·]+$/.test(tail) && !NAV_RE.test(tail)) {
        linkTexts.push(tail)
      }
    }

    const seen = new Set<string>()
    const out: string[] = []
    for (const t of linkTexts) {
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
    if (out.length >= 2) {
      console.log('[post-process] ✓ breadcrumb from markdown:', out)
      return out
    }
  }

  return []
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

  // Fallback description : si le LLM a rendu une description vide, trop courte,
  // OU qui ressemble à une URL/script technique (Tealium, GTM, JSON-LD…),
  // OU qui ressemble à une page CAPTCHA (DataDome/Akamai/Cloudflare),
  // extrait le paragraphe de prose le plus long du markdown.
  const desc = enriched.description?.trim() ?? ''
  const looksLikeUrl = /^(?:https?:\/\/|\/\/|file:|data:|javascript:|mailto:)/i.test(desc)
  const looksLikeCode = /^\s*(?:\{\s*["@]|window\.|var\s+|const\s+|function\s+|gtag|ga\s*\(|fbq\s*\()/i.test(desc)
  const isTrackingUrl = /\b(?:tags\.tiqcdn\.com|googletagmanager\.com|connect\.facebook\.net|cdn\.cookielaw\.org|cdn\.onetrust\.com|matomo|piwik|hotjar|hs-scripts|utag\.js)\b/i.test(desc)
  // CAPTCHA / challenge bot : texte qui RESSEMBLE à de la prose mais est
  // en fait une page de vérification (DataDome, Akamai, Cloudflare).
  const isCaptcha = looksLikeBotChallenge(desc)
  // Faible ratio de mots alphabétiques (>3 chars) → probablement non-prose
  const wordRatio = (desc.match(/\b[a-zà-ÿ]{3,}\b/gi)?.length ?? 0) / Math.max(1, desc.split(/\s+/).length)
  const isLowProse = desc.length > 0 && wordRatio < 0.4
  const needsFallback = !desc || desc.length < 50 || looksLikeUrl || looksLikeCode || isTrackingUrl || isLowProse || isCaptcha

  if (needsFallback) {
    if (desc && (looksLikeUrl || looksLikeCode || isTrackingUrl || isLowProse || isCaptcha)) {
      const reason = isCaptcha ? 'CAPTCHA/challenge' : looksLikeUrl ? 'URL' : looksLikeCode ? 'code' : isTrackingUrl ? 'tracking' : 'low-prose'
      console.log(`[post-process] ⚠ description LLM = ${reason} — fallback prose`)
    }
    const fallback = extractLongestProseParagraph(markdownContent)
    // Refuse aussi le fallback s'il est lui-même une page CAPTCHA
    const fallbackOk = fallback && fallback.length >= 50 && !looksLikeBotChallenge(fallback)
    if (fallbackOk) {
      console.log('[post-process] ✓ description fallback prose paragraph (', fallback.length, 'chars)')
      enriched = { ...enriched, description: fallback }
    } else if (looksLikeUrl || looksLikeCode || isTrackingUrl || isLowProse || isCaptcha) {
      // Pas de fallback prose disponible — préfère vide à la pollution.
      enriched = { ...enriched, description: '' }
    }
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
  // Garde anti-CAPTCHA : si le markdown ENTIER ou la description parsée est
  // une page challenge bot (DataDome, Akamai…), on REFUSE de remplacer la
  // description LLM, et on vide la description si elle-même est un challenge.
  const mdIsChallenge = looksLikeBotChallenge(markdownContent)
  const mdDescription = parseDescriptionFromMarkdown(markdownContent)
  const mdDescIsChallenge = looksLikeBotChallenge(mdDescription)
  if (mdIsChallenge || mdDescIsChallenge) {
    console.log('[post-process] ⚠ markdown / description = CAPTCHA — pas de remplacement')
    if (looksLikeBotChallenge(description)) {
      console.log('[post-process] ⚠ description LLM = CAPTCHA → vidée')
      description = ''
    }
  } else if (mdDescription && mdDescription.length > 40) {
    if (!description || description.length < 40 || looksLikeBotChallenge(description)) {
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
  const documents: EnrichedDocument[] = [...enriched.documents]
  const seenUrls = new Set(documents.map((d) => d.url))
  const mdPdfUrls = [...markdownContent.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)].map(m => m[0])
  let bareAdded = 0
  for (const url of mdPdfUrls) {
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    documents.push(buildDocument(url))
    bareAdded += 1
  }
  if (bareAdded > 0) {
    console.log('[post-process] ✓ added', bareAdded, 'PDF docs from markdown')
  }

  // ── 5. Documents titrés `[Titre](url)` depuis markdown links — préserve le label ──
  const mdLinks = [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+\.pdf[^\s\)]*)\)/gi)]
  for (const m of mdLinks) {
    const title = m[1].trim()
    const url = m[2].trim()
    if (seenUrls.has(url)) {
      // PDF déjà ajouté en bare URL : enrichir son name si générique
      const existing = documents.find((d) => d.url === url)
      if (existing && existing.name === existing.filename && title.length >= 3) {
        existing.name = title
      }
      continue
    }
    seenUrls.add(url)
    documents.push(buildDocument(url, title))
  }

  // ── 5b. Documents par LIBELLÉ (URL sans extension .pdf) ──
  // Sites B2B comme Rubix mettent les PDFs derrière `/document/123` ou
  // `/download/abc` sans extension. Capturer les liens dont le TEXTE matche
  // un libellé documentaire courant. Reste générique (pas de scraper par
  // fournisseur) — match purement sur le label visible.
  const DOC_LABEL_RE = /^(fiche\s*technique|notice(?:\s+d['']utilisation)?|datasheet|tech[\s-]?sheet|manuel(?:\s+d['']utilisation)?|user\s+manual|brochure|catalogue|guide(?:\s+d['']utilisation)?|d[eé]claration(?:\s+(?:de\s+)?conformit[eé]|\s+ce)?|certificat|sp[eé]cifications?\s+(?:techniques?|du\s+produit)|fds|sds|safety\s+data\s+sheet|notice\s+technique|ce\s+declaration|installation\s+guide|manual)\b/i
  const mdLabelLinks = [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/gi)]
  for (const m of mdLabelLinks) {
    const title = m[1].trim()
    const url = m[2].trim()
    // Skip si déjà capturé OU si URL avec extension .pdf (cas déjà traité)
    if (seenUrls.has(url)) continue
    if (/\.(pdf|docx?|xlsx?)(\?|$)/i.test(url)) continue
    if (title.length < 3 || title.length > 100) continue
    if (!DOC_LABEL_RE.test(title)) continue
    seenUrls.add(url)
    documents.push(buildDocument(url, title))
  }

  // Nettoyer tous les noms de documents (titres génériques → noms extraits de l'URL)
  const cleanedDocuments = documents.map(doc => cleanDocumentName(doc))

  // ── 6. Breadcrumb : extraire depuis l'en-tête markdown si pas déjà fourni ──
  let breadcrumb = enriched.breadcrumb
  if (!breadcrumb || breadcrumb.length === 0) {
    const mdBreadcrumb = parseBreadcrumbFromMarkdown(markdownContent)
    if (mdBreadcrumb.length > 0) breadcrumb = mdBreadcrumb
  }

  return { ...enriched, description, advantages, specifications, variants, documents: cleanedDocuments, breadcrumb }
}

/** Détecte si un texte est principalement du contenu cookie/GDPR (ratio de lignes garbage) */
function isMainlyGarbage(text: string): boolean {
  const lines = text.split(/\n/).filter(l => l.trim().length > 10)
  if (lines.length === 0) return false
  const garbageLines = lines.filter(l => GARBAGE_RE.test(l))
  // Si plus de 30% des lignes sont garbage → considérer comme parasite
  return garbageLines.length / lines.length > 0.3
}

/** Métiers/personae courants affichés sur les sites fabricants (menus "Mon profil"
 *  style Nicoll) — si une spec mappe deux items de cette liste, c'est un form
 *  de sélection de profil, pas une vraie caractéristique produit. */
const UI_PROFILE_TERMS_RE = /^(installateur|prescripteur|particulier|distributeur|retour|plombier|ma[çc]on|couvreur|charpentier|carreleur|paysagiste|bureau\s+d['’]?\s*[eé]tudes?|architecte|constructeur|promoteur|ma[îi]tre\s+d['’]?\s*ouvrage|responsable\s+de\s+maintenance|nicoll\s+pour|votre\s+profil|ouvrir\s+la\s+recherche|fermer\s+la\s+recherche|affinez|mon\s+compte|se\s+connecter|s['’]?\s*inscrire|menu|recherche|retour\s+(en\s+)?haut)/i

/** Labels financiers / commerciaux / génériques qui ne sont pas des fiches
 *  produit : rejetés quand ils apparaissent comme labels de PDF. */
const GENERIC_DOC_LABEL_RE = /\b(cgv|cgu|mentions\s+l[eé]gales|politique|privacy|tarif|tarifs|price\s*list|catalogue\s*(g[eé]n[eé]ral|complet)?|newsletter|guide\s+(d['’]utilisation|utilisateur|installation)?|faq|mode\s+d['’]emploi\s+g[eé]n[eé]ral|declaration\s+(marque|produit)|fiche\s+s[eé]curit[eé]|msds|sds|plan\s+de\s+masse|garantie\s+g[eé]n[eé]rale|formation|pr[eé]sentation\s+(?:entreprise|soci[eé]t[eé])|rapport\s+(?:annuel|rse)|communiqu[eé])/i

/** Filtre documents par référence produit — approche prudente :
 *  - TOUJOURS garder les docs sans code-produit identifiable (déclarations CE,
 *    fact-tags, manuels génériques API-générés — ils décrivent le produit courant).
 *  - REJETER UNIQUEMENT les docs qui contiennent un code-produit différent du
 *    produit cible (ex: "FT dr101ch" quand la référence est "DR100CH" — l'URL/
 *    label pointe vers un autre SKU de la gamme).
 *  - Rejeter les labels clairement génériques (CGV, tarif, newsletter…).
 */
function filterDocumentsByProductRef(
  documents: EnrichedDocument[],
  productIds: string[],
): EnrichedDocument[] {
  const targetTokens = Array.from(new Set(
    productIds
      .flatMap((id) => id.toLowerCase().split(/[\s\-_/.,]+/))
      .filter((t) => t.length >= 4 && /[a-z0-9]/i.test(t))
  ))
  // Pattern d'un code-produit dans un label/URL : alphanum 4-12 chars avec
  // chiffre (ex: "dr100ch", "fpd3502x", "duh752z"). Ignore les timestamps purs.
  const PRODUCT_CODE_RE = /\b([a-z]{1,5}\d[a-z0-9]{2,10}|\d[a-z]{1,5}\d{1,6}[a-z]{0,4})\b/gi
  const rejected: EnrichedDocument[] = []
  const kept: EnrichedDocument[] = []
  for (const doc of documents) {
    const label = doc.name.toLowerCase()
    const url = doc.url.toLowerCase()
    const filename = (doc.filename || '').toLowerCase()

    // GENERIC_DOC_LABEL_RE est un filtre "anti-doc-marketing" (cgv, tarif,
    // catalogue, mentions légales…). On le teste sur le filename URL plutôt
    // que sur le label : depuis qu'on injecte le titre Jina (ex: "Tarif 2026")
    // dans `doc.name`, beaucoup de fiches techniques légitimes hébergées sous
    // un nom URL spécifique se faisaient rejeter à tort sur le titre marketing
    // de la page. Le filename URL est l'identifiant stable.
    const genericProbe = filename || label
    if (GENERIC_DOC_LABEL_RE.test(genericProbe)) { rejected.push(doc); continue }

    // Chercher les codes produit dans le label + URL (pas les queries longues).
    // Se limiter au label + fragment final de l'URL (basename) pour éviter
    // qu'un id interne (v=1725889503000) déclenche le rejet.
    const urlTail = url.split(/[?#]/)[0].split('/').pop() ?? ''
    const codePool = `${label} ${urlTail}`
    const codes = Array.from(codePool.matchAll(PRODUCT_CODE_RE)).map((m) => m[0].toLowerCase())

    if (codes.length === 0) {
      // Pas de code-produit détecté → document générique (déclaration, fact-tag
      // API, manuel) → on garde.
      kept.push(doc); continue
    }
    // Si le doc exhibe un code produit, il doit correspondre à notre cible.
    if (targetTokens.length > 0 && codes.every((c) => !targetTokens.some((t) => c === t || c.includes(t) || t.includes(c)))) {
      // Tous les codes pointent vers d'autres produits → rejet.
      rejected.push(doc); continue
    }
    // Au moins un code matche (ou pas de token cible → on est indulgent).
    kept.push(doc)
  }
  if (rejected.length > 0) {
    console.log('[sanitize] filterDocumentsByProductRef: kept', kept.length, '/ rejected', rejected.length, '(other-SKU or generic)')
  }
  return kept
}

/** Termes de navigation/footer site qui n'ont rien à faire dans une description
 *  produit. Pas de `\b` car les liens markdown adjacents `[A](url)[B](url)`
 *  rendus en texte donnent "AB" sans whitespace ni word boundary entre. */
const NAV_TERMS_RE = /(nos\s+services?|le\s+blog(?:\s*RS)?|aide\s*&\s*contact|mentions?\s+l[eé]gales?|politique\s+de\s+(?:confidentialit[eé]|cookies?|protection)|centre\s+d['’]aide|mon\s+compte|se\s+connecter|s['’]identifier|s['’]enregistrer|newsletter|carri[eè]re|contactez[\s-]nous|[àa]\s+propos|secteurs?\s+industriels?|suivez[\s-]nous|mon\s+panier|liste\s+de\s+souhaits|suivi\s+de\s+colis|voir\s+le\s+panier)/gi

/** Métadonnées de fiche produit qui ne sont PAS une description marketing.
 *  Pattern : "Code commande RS:… Référence fabricant:… Marque:…" */
const METADATA_LINE_RE = /^[^.]*?\b(code\s+commande|r[eé]f[eé]rence\s+fabricant|num[eé]ro\s+(de\s+)?(?:s[eé]rie|article)|sku|ean|gtin|code[\s-]?barres?)\s*:/i

/** Détecte si une description ressemble à de la navigation ou du footer
 *  (≥2 termes nav, OU ratio nav-words / total-words > 30% OU ne contient que
 *  des métadonnées sans phrase descriptive). */
function isNavLikeDescription(text: string): boolean {
  if (!text || text.length < 20) return false
  const matches = text.match(NAV_TERMS_RE)
  if (matches && matches.length >= 2) return true
  if (matches && matches.length >= 1) {
    const words = text.split(/\s+/).filter(Boolean).length
    if (words < 30) return true
  }
  // Description = uniquement métadonnées techniques sans phrase
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
  if (lines.length > 0 && lines.every(l => METADATA_LINE_RE.test(l))) return true
  return false
}

/** Nettoie un EnrichedProduct en retirant les contenus parasites */
function sanitizeEnriched(enriched: EnrichedProduct, productIds: string[] = []): EnrichedProduct {
  // Description : vider si c'est du cookie/GDPR (court ou long) ou du nav/footer
  let description = enriched.description
  if (description && (isGarbageContent(description) || isMainlyGarbage(description))) {
    console.log('[sanitize] garbage description detected, clearing')
    description = ''
  }
  if (description && isNavLikeDescription(description)) {
    console.log('[sanitize] nav/footer description detected, clearing')
    description = ''
  }
  // Description : retirer les lignes qui sont des listes de téléchargements
  // (format "Label | https://..." ou "Label ## https://..." — PDF, fact-tag,
  // partlist…). Ce sont des documents mal injectés, pas du marketing.
  if (description) {
    const cleaned = description
      .split(/\r?\n/)
      .filter((line) => {
        const t = line.trim()
        if (!t) return true
        // Rejet : ligne contenant une URL + séparateur ou juste une URL
        if (/\s[|#]{1,2}\s*https?:\/\//.test(t)) return false
        if (/https?:\/\/\S+/.test(t)) return false
        return true
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (cleaned !== description) {
      console.log('[sanitize] stripped document/URL lines from description')
      description = cleaned
    }
  }

  // Documents : nettoyer les noms + filtrer par référence produit (retire
  // CGV, tarifs, fiches d'autres produits de la gamme).
  const cleanedDocs = enriched.documents.map(doc => cleanDocumentName(doc))
  const documents = filterDocumentsByProductRef(cleanedDocs, productIds)

  // Groupes entiers à rejeter : sections cookies-banner, widgets UI.
  const JUNK_GROUP_RE = /^(strictement\s+n[eé]cessaire|fonctionnel|statistique|analytique|performance|pr[eé]f[eé]rences?|ciblage|publicit[eé]|marketing|technologie|articles?\s*:\s*\d+|fournisseur|general\s+power\s+tool\s+safety\s+warnings?|s[eé]curit[eé]\s+de\s+la\s+zone\s+de\s+travail|electrical\s+safety|personal\s+safety|work\s+area\s+safety|produits?\s*à\s*comparer|trouver\s+(vos\s+)?(pi[eè]ces?|parts?)|find\s+parts?\s+for)$/i
  // Specs : rejeter les paires qui mappent deux items de profil/navigation
  // UI (Nicoll "Installateur | Prescripteur", "Plombier | Maçon", etc.),
  // les cookies banner (name="Expiration", value="un an"), et les safety
  // warnings (textes multi-lignes du type "Do not operate power tools…").
  const SAFETY_TEXT_RE = /\b(power\s+tool|ne\s+pas\s+utiliser|earthed|grounded|unmodified\s+plug|electric\s+shock|lose\s+control|flammable|incendie|explosive\s+atmosphere|keep\s+work\s+area|stay\s+alert|personal\s+protective|dust\s+mask|hearing\s+protection|punho\s+adicional|ferramenta\s+el[eé]trica|sendo\s+cancer[íi]genos|preservadores\s+de\s+madeira)/i
  const COOKIE_LABEL_RE = /^(expiration|dur[eé]e|finalit[eé]|nom|prestataire|fournisseur)$/i
  /** Lignes d'en-tête de table dupliquées entre sections : "Valeur",
   *  "*Valeur*", "Caractéristique", "_Description_"… — souvent recopiées
   *  par le scraping quand la même table d'en-tête est répétée pour chaque
   *  sous-section. Une spec dont le name OU la value matche ce pattern est
   *  un parasite, peu importe la décoration markdown autour. */
  const PLACEHOLDER_HEADER_RE = /^[\s*_]*(valeur|value|caract[eé]ristique|description|sp[eé]cification|name|nom|d[eé]signation|propri[eé]t[eé])[\s*_]*$/i
  /** Nom entièrement entre crochets `[...]` sans contenu informatif (titre de
   *  section dupliqué dans les paires de table). */
  const BRACKETED_HEADER_RE = /^\s*\[[^[\]()]+\]\s*$/
  /** Names résiduels de checkboxes facettes après le strip markdown :
   *  "- [x]", "[x]", "* [ ]", "[]". Si le LLM avale quand-même une de ces
   *  paires, le `name` ressemble à un marqueur de checkbox sans contenu. */
  const CHECKBOX_MARKER_RE = /^\s*[-*•]?\s*\[[xX✓✔ ]?\]\s*$/
  const keptSpecs: EnrichedProduct['specifications'] = []
  const rejectedSpecs: EnrichedProduct['specifications'] = []
  for (const s of enriched.specifications) {
    if (isGarbageContent(s.name) || isGarbageContent(s.value)) { rejectedSpecs.push(s); continue }
    if (s.group && JUNK_GROUP_RE.test(s.group.trim())) { rejectedSpecs.push(s); continue }
    // Lignes d'en-tête de table parasites : "Valeur", "*Valeur*",
    // "Caractéristique"… — une spec dont la value ou le name est un placeholder
    // n'apporte aucune info produit.
    if (PLACEHOLDER_HEADER_RE.test(s.value) || PLACEHOLDER_HEADER_RE.test(s.name)) {
      rejectedSpecs.push(s); continue
    }
    if (BRACKETED_HEADER_RE.test(s.name)) {
      rejectedSpecs.push(s); continue
    }
    // Checkboxes facettes ("- [x]", "[x]") — name vide de sens, value = chip UI
    if (CHECKBOX_MARKER_RE.test(s.name) || !s.name.trim()) {
      rejectedSpecs.push(s); continue
    }
    // Specs prose : name est une phrase complète ou trop longue → ce sont
    // des bullets de "Caractéristiques et avantages" / "Applications" / FAQ
    // que le LLM a paire en faux specs.
    const nameTrimmed = s.name.trim()
    const valueTrimmed = s.value.trim()
    // Quantity tier (pricing) : "1 +", "10 +", "100 +"
    if (/^\d+\s*\+\s*$/.test(nameTrimmed)) { rejectedSpecs.push(s); continue }
    if (nameTrimmed.length > 60) { rejectedSpecs.push(s); continue }
    if (/[.!?]$/.test(nameTrimmed) && nameTrimmed.length > 25) {
      rejectedSpecs.push(s); continue
    }
    // Bullet leak : valeur préfixée par puce typographique
    if (/^[•▪►▶]\s/.test(valueTrimmed) || /^[•▪►▶]\s/.test(nameTrimmed)) {
      rejectedSpecs.push(s); continue
    }
    // Pricing leak : valeur ne contient que chiffres/séparateurs + devise
    if (/^\s*[\d\s.,]+\s*[€$£]\s*$/.test(valueTrimmed)) {
      rejectedSpecs.push(s); continue
    }
    // UI button leak : "Cliquez sur …" / "Vérifier les …"
    if (/(cliquez\s+sur|v[eé]rifier\s+les|ajouter\s+au\s+panier)/i.test(valueTrimmed) && valueTrimmed.length > 30) {
      rejectedSpecs.push(s); continue
    }
    // Group avec markdown bold leakage (`**...**`) + section avantages : c'est
    // pas un spec group, c'est un H2 du markdown que le LLM a recyclé.
    const groupClean = s.group?.replace(/^\*+|\*+$/g, '').trim()
    if (groupClean && /^(caract[eé]ristiques?\s+et\s+avantages?|applications?|points?\s+forts?|features?|advantages?|d[eé]tail\s+produit|description|faq|questions?(\s+fr[eé]quentes?)?)$/i.test(groupClean)) {
      rejectedSpecs.push(s); continue
    }
    const bothProfile = UI_PROFILE_TERMS_RE.test(s.name) && UI_PROFILE_TERMS_RE.test(s.value)
    const nameIsProfile = UI_PROFILE_TERMS_RE.test(s.name) && s.value.length < 60
    if (bothProfile || nameIsProfile) { rejectedSpecs.push(s); continue }
    // Paires cookies-banner : clé = "Expiration/Finalité/Nom/Prestataire", valeur courte.
    if (COOKIE_LABEL_RE.test(s.name.replace(/^\*\s*/, '').trim()) && s.value.length < 80) {
      rejectedSpecs.push(s); continue
    }
    // Safety warnings : valeur > 60 chars ET le texte ressemble à un extrait de
    // manuel (anglais / portugais avec vocabulaire sécurité).
    if (s.value.length > 60 && SAFETY_TEXT_RE.test(`${s.name} ${s.value}`)) {
      rejectedSpecs.push(s); continue
    }
    keptSpecs.push(s)
  }
  // Safety net : si ≥50% des specs contiennent du vocabulaire safety/manuel,
  // l'extraction a récupéré un manuel PDF, pas les vraies specs → tout jeter.
  const safetyHits = keptSpecs.filter((s) => SAFETY_TEXT_RE.test(`${s.name} ${s.value}`)).length
  let finalKept = keptSpecs
  if (keptSpecs.length >= 10 && safetyHits / keptSpecs.length >= 0.5) {
    console.log('[sanitize] ⚠ dropping ALL', keptSpecs.length, 'specs — manual/safety content (', safetyHits, 'hits)')
    finalKept = []
  }
  if (rejectedSpecs.length > 0 || finalKept.length < keptSpecs.length) {
    console.log('[sanitize] filtered', rejectedSpecs.length + (keptSpecs.length - finalKept.length), 'junk specs; kept', finalKept.length)
  }

  // Avantages : nettoyer les noms de groupes fragments ("ET avantages",
  // "OU caractéristiques") qui sont des coupures de titre du genre
  // "Points forts ET avantages" — le LLM coupe à "ET" et le reste devient un
  // group label inutile. On les drop pour repasser ungrouped.
  const FRAGMENT_GROUP_RE = /^\s*(et|ou|and|or|&|\+)\s+\S/i
  const cleanedAdvantages = enriched.advantages
    .filter(a => !isGarbageContent(a.text) && !SAFETY_TEXT_RE.test(a.text))
    .map(a => {
      if (a.group && FRAGMENT_GROUP_RE.test(a.group)) {
        const { group: _g, ...rest } = a
        return rest
      }
      return a
    })

  return {
    ...enriched,
    description,
    documents,
    advantages: cleanedAdvantages,
    specifications: finalKept,
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
function cleanDocumentName(doc: EnrichedDocument): EnrichedDocument {
  // Si le titre est générique, extraire un meilleur nom depuis l'URL
  if (GENERIC_DOC_NAMES_RE.test(doc.name) || doc.name.length < 3) {
    const betterName = extractNameFromUrl(doc.url)
    if (betterName) return { ...doc, name: betterName }
    // Fallback : afficher le filename (déjà décodé) plutôt qu'un titre vide
    return doc.filename ? { ...doc, name: doc.filename } : doc
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
  /** Mode d'enrichissement :
   *  - 'auto' (défaut) : flow IA classique (Jina + LLM), même si un template existe
   *  - 'template' : force l'application du template par fournisseur ; fallback IA si le template échoue */
  mode?: 'auto' | 'template'
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
 * Recherche web. Essaie d'abord s.jina.ai (API dédiée, meilleurs résultats si clé)
 * puis DuckDuckGo Lite via r.jina.ai (gratuit, sans clé) en fallback.
 */
async function jinaSearch(query: string, limit = 10): Promise<SearchResult[]> {
  console.log('[jina-search] →', { query, limit })
  const jinaKey = getApiKey('jina')

  // ── Tentative 1 : endpoint de recherche dédié s.jina.ai ──
  //    Bien plus fiable que de scraper DDG Lite. Fonctionne sans clé (rate-limité),
  //    beaucoup mieux avec clé.
  try {
    const sjinaHeaders: Record<string, string> = {
      Accept: 'application/json',
      'X-Retain-Images': 'none',
      'X-No-Cache': 'true',
    }
    if (jinaKey) sjinaHeaders.Authorization = `Bearer ${jinaKey}`
    const res = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, { headers: sjinaHeaders })
    if (res.ok) {
      const json = await res.json() as { data?: Array<{ url?: string; title?: string; description?: string }> }
      const data = Array.isArray(json.data) ? json.data : []
      const results: SearchResult[] = data
        .filter((d): d is { url: string; title?: string; description?: string } => typeof d.url === 'string' && d.url.startsWith('http'))
        .slice(0, limit)
        .map((d) => ({ url: d.url, title: d.title, description: d.description }))
      console.log('[jina-search] [s.jina.ai] parsed', results.length, 'results')
      if (results.length > 0) return results
    } else {
      console.warn('[jina-search] [s.jina.ai] HTTP', res.status, '— fallback DDG Lite')
    }
  } catch (err) {
    console.warn('[jina-search] [s.jina.ai] failed — fallback DDG Lite', err)
  }

  // ── Tentative 2 : DDG Lite scrapé via r.jina.ai ──
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

  console.log('[jina-search] [ddg-lite] parsed', results.length, 'results:', results.map((r) => r.url))
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

  // Nettoyage agressif du markdown avant LLM (cookies, nav, facettes, pricing,
  // catalog listings…). Cf. markdownSanitize.ts pour le détail des patterns.
  md = sanitizeJinaMarkdown(md)

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
  breadcrumb: string[]
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

    // Nettoyage complet : cookies, nav top RS-like, facettes, pricing tables…
    // Sans ça, le markdown POST conserve les liens nav concaténés
    // ("Nos servicesLe blog RSAide & Contact") et la ligne métadonnées
    // ("Code commande RS:… Référence fabricant:…") qui empoisonnent
    // parseDescriptionFromMarkdown en aval.
    md = sanitizeJinaMarkdown(md)

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
async function jinaScrapeMaufacturerPageFallback(pageUrl: string, _jinaKey: string): Promise<DeepScrapeResult | null> {
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
  const data: ManufacturerData = { downloads: [], variants: [], images: [], specs: [], description: '', breadcrumb: [] }

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

  // ── 0. Breadcrumb depuis HTML (nav>ol/ul, BreadcrumbList microdata, etc.) ──
  try {
    const { extractBreadcrumbFromHtml } = await import('@/features/scraping/useJina')
    const items = extractBreadcrumbFromHtml(html)
    if (items.length > 0) {
      data.breadcrumb = items
      console.log('[manufacturer] ✓ breadcrumb from HTML:', items)
    }
  } catch (err) {
    console.warn('[manufacturer] breadcrumb extraction failed:', err)
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
/** Déduplique les documents par URL normalisée. */
function deduplicateDocuments(docs: EnrichedDocument[]): EnrichedDocument[] {
  const seen = new Set<string>()
  const result: EnrichedDocument[] = []
  for (const doc of docs) {
    const normalized = doc.url.replace(/\/+$/, '').toLowerCase()
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
    const primaryMd = markdownContent ? extractPrimarySourceSection(markdownContent) : null
    const mdDesc = primaryMd ? parseDescriptionFromMarkdown(primaryMd) : ''
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
  const images: string[] = markdownContent ? parseImagesFromMarkdown(markdownContent) : []
  // Merge avec REDUX rawData images (sans doublons)
  if (rawData.images.length > 0) {
    const seen = new Set(images)
    for (const url of rawData.images) {
      if (!seen.has(url)) { images.push(url); seen.add(url) }
    }
  }
  console.log('[manufacturer-build] images:', images.length)

  // Documents : Jina injected > REDUX downloads > PDFs du markdown
  const documents: EnrichedDocument[] = []
  const docsByUrl = new Set<string>()
  const pushDocBuild = (url: string, name?: string) => {
    if (!url || docsByUrl.has(url)) return
    docsByUrl.add(url)
    documents.push(buildDocument(url, name))
  }
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
          pushDocBuild(url, name)
        } else if (/^https?:\/\//.test(trimmed)) {
          pushDocBuild(trimmed)
        }
      }
      console.log('[manufacturer-build] ✓ Jina injected downloads:', documents.length)
    }
  }
  // Fallback : REDUX downloads
  if (documents.length === 0) {
    for (const dl of rawData.downloads) pushDocBuild(dl.url, dl.name)
  }
  // Ajouter les PDFs du markdown qui ne sont pas déjà dans les downloads
  if (markdownContent) {
    const mdPdfUrls = [...markdownContent.matchAll(/https?:\/\/[^\s)"'\]]+\.pdf[^\s)"'\]]*/gi)].map(m => m[0])
    for (const url of mdPdfUrls) pushDocBuild(url)
    // Liens titrés [titre](url.pdf) du markdown
    const mdLinks = [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+\.pdf[^\s)]*)\)/gi)]
    for (const m of mdLinks) pushDocBuild(m[2].trim(), m[1].trim())
  }

  console.log('[manufacturer-build] result:', {
    specs: specifications.length,
    advantages: advantages.length,
    variants: variants.length,
    images: images.length,
    documents: documents.length,
    descLen: description.length,
  })

  // Breadcrumb : HTML brut (extraction DOM fiable) > markdown (fallback parser)
  const mdBreadcrumb = markdownContent ? parseBreadcrumbFromMarkdown(markdownContent) : []
  const breadcrumb = rawData.breadcrumb.length > 0 ? rawData.breadcrumb : mdBreadcrumb

  return {
    description,
    advantages,
    specifications,
    variants,
    images: [...new Set(images)],
    documents: deduplicateDocuments(documents),
    breadcrumb: breadcrumb.length > 0 ? breadcrumb : undefined,
    sourceUrl: productUrl,
    additionalSources,
    generatedAt: Date.now(),
    scrapingProvider: 'Jina + Fabricant (scraping direct)',
    llmProvider: undefined,
    llmModel: undefined,
  }
}

// ── Parsers markdown : extraction structurée depuis le texte brut ───────────

/** Délégué vers la version canonique du parser de specs (parseSpecifications.ts).
 * On délègue plutôt que de dupliquer pour qu'il n'y ait QU'UN parser à
 * maintenir — précédemment cette fonction locale shadow-ait l'export et tous
 * les fixes du parser canonique (Format 4b strict, looksLikeValue, etc.)
 * étaient ignorés. */
function parseSpecsFromMarkdown(md: string): Array<{ name: string; value: string; group?: string }> {
  return parseSpecsFromMarkdownExternal(md)
}

/** Délégué vers la version canonique du parser, qui inclut :
 *   - Phase 0  : NEXT_DATA_SPECS (sites Next.js)
 *   - Phase 0bis : H3 en gras (titre produit) + paragraphe long
 *   - Phase 1  : prose entre H1 et H2+ (avec rejet métadonnées RS/Conrad)
 *   - Phase 2/3 : sections descriptives / longest prose
 *
 * On délègue plutôt que de dupliquer pour qu'il n'y ait QU'UN parser à
 * maintenir — précédemment cette fonction locale shadow-ait l'export et tous
 * les fixes du parser canonique étaient ignorés. */
function parseDescriptionFromMarkdown(md: string): string {
  return parseDescriptionFromMarkdownExternal(md)
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
const PRODUCT_PATH_RE = /\/(products?|produits?|product[-_]images?|product[-_]photos?|catalog\/products?|catalogue\/produits?)\//i

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
  // On parcourt le markdown FULL — la troncature avalait :
  //   - les blocs `JINA_EXTRACTED_IMAGES_*` (Jina les injecte en queue ; et
  //     le scrape fabricant fusionne POST + GET → DEUX blocs distincts dont
  //     un seul était lu via `indexOf`),
  //   - les inline `![](url)` du carousel produit principal (les sites
  //     Drupal placent souvent leur galerie après une section qui matche
  //     le cutoff ex: "Documents" / "Téléchargements"),
  //   - l'Images Summary, Image N: url, og:image, Links Summary placés en
  //     fin de markdown.
  // Le filtrage des images de related-products se fait via `isJunkImageUrl`
  // (mégamenu, doc-carousel, picto, logo) puis le sélecteur PRODUCT_PATH_RE
  // + dedup par stem en fin de fonction — pas besoin de tronquer le source.
  const fullMd = md

  const seen = new Set<string>()
  const images: string[] = []

  const addImg = (url: string) => {
    const raw = url.trim().replace(/[)>\]}\s]+$/, '')
    if (!raw || !raw.startsWith('http') || isJunkImageUrl(raw)) return
    // Canonicaliser les URLs Drupal styled → original (haute résolution)
    const u = canonicalizeImageUrl(raw)
    if (seen.has(u)) return
    seen.add(u)
    images.push(u)
  }

  // 1. TOUS les blocs Jina injected images (JINA_EXTRACTED_IMAGES_START/END).
  //    La fusion POST + JSON dans `jinaScrapeMaufacturerPage` produit deux
  //    blocs successifs (30 + 69 images) — il faut les parcourir tous, pas
  //    seulement le premier.
  for (const m of fullMd.matchAll(/JINA_EXTRACTED_IMAGES_START\s*([\s\S]*?)\s*JINA_EXTRACTED_IMAGES_END/g)) {
    for (const line of m[1].split('\n')) {
      const url = line.trim()
      if (url && /^https?:\/\//.test(url)) addImg(url)
    }
  }

  // 2. Inline markdown images: ![alt](url) — fullMd
  for (const m of fullMd.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    addImg(m[2])
  }

  // 3. Jina "Images Summary" / "Images:" section at end of markdown — fullMd
  //    Formats: "Image N (alt): url" or "[Image N (alt)](url)" or just plain URLs
  const imgSectionMatch = fullMd.match(/(?:^|\n)#{0,4}\s*(?:Images?\s*(?:Summary)?|Photos?)\s*:?\s*\n([\s\S]+?)(?:\n#{1,4}\s|\n\n---|\n\n\*\*|$)/im)
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

  // 4. Plain URLs with image extensions — fullMd
  for (const m of fullMd.matchAll(/(https?:\/\/[^\s)"\]]+\.(?:jpe?g|png|webp|avif)[^\s)"\]]*)/gi)) {
    addImg(m[1])
  }

  // 5. Jina "Image N (alt): url" format (Jina range ces ancres en fin de md) — fullMd
  for (const m of fullMd.matchAll(/Image\s+\d+[^:]*:\s*(https?:\/\/[^\s)"\]]+)/gim)) {
    addImg(m[1])
  }

  // 6. og:image or meta image URLs in Jina metadata — fullMd
  for (const m of fullMd.matchAll(/(?:og:image|twitter:image|image_src|meta\s*image)\s*[:=]\s*(https?:\/\/[^\s)"\]]+)/gim)) {
    addImg(m[1])
  }

  // 7. Links Summary — Jina place ce bloc en queue de markdown — fullMd
  //    Format: [alt text](url.jpg) in a Links section
  const linksSectionMatch = fullMd.match(/(?:^|\n)#{0,4}\s*Links?\s*(?:Summary)?\s*:?\s*\n([\s\S]+?)(?:\n#{1,4}\s|$)/im)
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
  console.log('[parseImagesFromMarkdown] fullMdLen=', fullMd.length, 'raw=', images.length, 'productMatch=', productImages.length, 'final=', deduped.length, 'sample:', deduped.slice(0, 3))
  return deduped
}

// ── Hook principal ──────────────────────────────────────────────────────────

export function useProductEnrichment() {
  const { setProgress, setData, setError, setLlmRequest, setLlmUsed, clear, getScrapeCache, setScrapeCache, clearScrapeCache, addLog, clearLogs } = useEnrichmentStore()
  const [running, setRunning] = useState(false)

  const enrich = useCallback(
    async (input: EnrichmentInput): Promise<EnrichedProduct | null> => {
      const { sheetName, rowId, title, brand, sku, reference, description, category, knownUrl } = input
      const hasIdentifier = !!(title?.trim() || reference?.trim() || sku?.trim() || brand?.trim() || knownUrl?.trim())
      if (!hasIdentifier) {
        setError(sheetName, rowId, 'Aucun identifiant (titre, référence, marque ou URL) — impossible de lancer l\'enrichissement.')
        return null
      }
      const sourceTokens = tokenizeTitle(`${title ?? ''} ${brand ?? ''} ${description ?? ''}`)

      setRunning(true)
      clearLogs(sheetName, rowId)
      // Reset du flag anti-bot global au début de chaque run.
      ;(globalThis as unknown as { __antiBotBlocked?: boolean }).__antiBotBlocked = false
      const log = (msg: string) => addLog(sheetName, rowId, msg)
      try {
        console.log('[enrichment] START', { sheetName, rowId, title, brand, reference: reference ?? sku, knownUrl })
        log(`Démarrage — ${title} ${brand ?? ''}`)
        // ── Étape 0 : Vérifier le cache scraping (Re-générer réutilise les mêmes données) ──
        let cached = getScrapeCache(sheetName, rowId)
        // Invalide le cache si le markdown est en fait une page CAPTCHA / challenge
        // bot → force un nouveau scrape pour tenter Firecrawl HTML mode.
        if (cached?.markdownContent && looksLikeBotChallenge(cached.markdownContent)) {
          console.log('[enrichment] ⚠ cached markdown is CAPTCHA/challenge — invalidating cache')
          log(`Cache invalidé — ancienne donnée était une page CAPTCHA`)
          clearScrapeCache(sheetName, rowId)
          cached = undefined
        }
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
            karcher:    ['kaercher.com/fr', 'karcher.fr'],
            facom:      ['facom.fr'],
            hilti:      ['hilti.fr'],
            flex:       ['flex-tools.com/fr-fr'],
            grundfos:   ['product-selection.grundfos.com/fr', 'grundfos.com/fr'],
            geberit:    ['geberit.fr'],
            villeroy:   ['villeroy-boch.fr'],
            roca:       ['roca.fr'],
            ideal:      ['idealstandard.fr'],
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
            grundfos:   ['grundfos.com', 'product-selection.grundfos.com'],
            geberit:    ['geberit.com'],
            villeroy:   ['villeroy-boch.com'],
            roca:       ['roca.com'],
            ideal:      ['idealstandard.com'],
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

          // Wrapper .current : TS ne track pas les ré-assignements d'une `let`
          // faits depuis l'intérieur d'une closure, ce qui transforme le type en
          // `never` après narrow. L'objet-box contourne ça (property-access).
          type Pick = { url: string; extras: string[]; query: string; score: number }
          const pickBox: { current: Pick | null } = { current: null }
          // Meilleur résultat "propre" vu toutes requêtes confondues, indépendamment
          // du score. Sert de filet de secours si aucune requête ne franchit le seuil
          // score > 0 (ex. marques pas dans notre whitelist, pénalités locale non-FR).
          const fallbackBox: { current: Pick | null } = { current: null }

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
            // Mémoriser le top même si score <= 0 pour servir de filet de secours
            if (!fallbackBox.current || top.score > fallbackBox.current.score) {
              fallbackBox.current = {
                url: top.r.url,
                extras: scored.slice(1, 5).map((s) => s.r.url),
                query: q,
                score: top.score,
              }
            }
            if (top.score <= 0) return false
            if (!pickBox.current || top.score > pickBox.current.score) {
              pickBox.current = {
                url: top.r.url,
                extras: scored.slice(1, 5).filter((s) => s.score > 0).map((s) => s.r.url),
                query: q,
                score: top.score,
              }
            }
            return pickBox.current.score >= 20
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

          // Filet de secours : aucune requête n'a franchi le seuil score > 0, mais
          // des résultats "propres" existent (ex. marque non whitelistée, URL non-FR
          // pénalisée). Accepter le meilleur plutôt que d'échouer complètement.
          if (!pickBox.current && fallbackBox.current) {
            pickBox.current = fallbackBox.current
            console.log('[enrichment] ⚠ using fallback pick (score ≤ 0) →', fallbackBox.current.url, 'score:', fallbackBox.current.score)
            log(`⚠ Filet de secours : ${fallbackBox.current.url} (score ${fallbackBox.current.score})`)
          }

          const finalPick = pickBox.current
          if (finalPick) {
            productUrl = finalPick.url
            additionalSources = finalPick.extras
            console.log('[enrichment] ✓ final pick →', { url: productUrl, score: finalPick.score, query: finalPick.query })
            log(`✓ URL trouvée : ${productUrl} (score ${finalPick.score})`)
          }

          // ── Essai final fabricant : si finalPick n'est pas un site fabricant ──
          // mais la marque est connue, essayer une dernière recherche ultra-ciblée
          if (finalPick && brandSlug && Object.keys(MANUFACTURER_DOMAINS).includes(brandSlug)) {
            const isAlreadyManufacturer = detectManufacturerSite(finalPick.url)
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
                        // Remplacer le pick par le résultat fabricant — mettre l'ancien dans extras
                        console.log('[enrichment] ✓ manufacturer probe found:', scored[0].r.url, 'score:', scored[0].score)
                        log(`✓ Site fabricant trouvé : ${scored[0].r.url}`)
                        additionalSources = [finalPick.url, ...finalPick.extras]
                        productUrl = scored[0].r.url
                        pickBox.current = { url: scored[0].r.url, extras: additionalSources, query: probeQuery, score: scored[0].score }
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

        // ── Étape 1bis : Template de scraping par fournisseur ─────────────
        // Appliqué UNIQUEMENT si mode === 'template'. En mode 'auto' (défaut),
        // on skip directement vers le flow IA classique pour préserver le
        // comportement historique éprouvé.
        if (productUrl && input.mode === 'template') {
          try {
            const { listTemplates } = await import('@/features/scraping-templates/templatesStore')
            const { applyTemplate, templateMatchesUrl, scoreApplyResult, applyAdvantagesWithGroups, applyVariantsFromHtml, applyDocumentsFromHtml } = await import('@/features/scraping-templates/engine')
            const { fetchSourceHtml } = await import('@/features/scraping-templates/fetchSourceHtml')
            const allTemplates = await listTemplates()
            const matching = allTemplates.find((t) => templateMatchesUrl(t, productUrl!))
            if (matching) {
              log(`📐 Template détecté : ${matching.name} (${matching.vendorDomain})`)
              setProgress(sheetName, rowId, { status: 'scraping', message: `Template ${matching.name} — extraction directe…` })
              const html = await fetchSourceHtml(productUrl)
              if (html) {
                const applied = applyTemplate(matching, html, productUrl)
                const score = scoreApplyResult(applied)
                log(`📐 Template appliqué — score ${score}, ${applied.warnings.length} avertissement(s)`)
                if (score >= 20) {
                  const f = applied.fields
                  const toStr = (v: unknown): string => typeof v === 'string' ? v : ''
                  const toArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
                  // Variants : privilégier l'extraction structurée depuis le <table> du container
                  // (mêmes heuristiques que parseVariantsFromMarkdown : colonne Réf. + Libellé +
                  // reste en propriétés). Fallback sur le split string REF — Label si le container
                  // capturé n'est pas une table HTML (liste simple, bullets, etc.).
                  const variantsField = matching.fields.find((fld) =>
                    fld.field === 'variants' || fld.field === 'variantes'
                    || fld.field === 'Variantes' || fld.field === 'references',
                  )
                  let variants: Array<{ reference: string; label: string; properties: Record<string, string> }> = []
                  if (variantsField) {
                    variants = applyVariantsFromHtml(html, variantsField, productUrl)
                    if (variants.length > 0) {
                      log(`📐 Variantes extraites du <table> : ${variants.length} ligne(s)`)
                    }
                  }
                  if (variants.length === 0) {
                    const rawVariants = (f.variants ?? f.variantes ?? f.Variantes ?? f.references) as unknown
                    const variantsStrs = toArr(rawVariants)
                    variants = variantsStrs.map((s) => {
                      // Split "REF — Label" ou "REF  Label" si possible, sinon tout dans label.
                      const m = s.match(/^([A-Z0-9][A-Z0-9\-]{2,})\s*[-–—:|]\s*(.+)$/i)
                      return m
                        ? { reference: m[1].trim(), label: m[2].trim(), properties: {} }
                        : { reference: s.trim(), label: s.trim(), properties: {} }
                    })
                  }
                  // Avantages : associer chaque item à son heading H1-H6 précédent
                  // (ex: "Les + Nicoll performance" → group "Nicoll performance").
                  // Fallback sur la liste plate si le template ne matche pas de groupes.
                  const advantagesField = matching.fields.find((fld) => fld.field === 'advantages')
                  const flatAdvantages = toArr(f.advantages).map((text) => ({ text }))
                  let advantages: Array<{ text: string; group?: string }> = flatAdvantages
                  if (advantagesField) {
                    const grouped = applyAdvantagesWithGroups(html, advantagesField, productUrl)
                    const distinctGroups = new Set(grouped.map((a) => a.group).filter(Boolean))
                    if (grouped.length > 0 && distinctGroups.size >= 2) {
                      advantages = grouped
                      log(`📐 Avantages structurés par heading : ${distinctGroups.size} groupe(s) détecté(s)`)
                    }
                  }
                  // Champs custom : tout champ défini dans le template qui n'est PAS
                  // mappé sur un champ standard EnrichedProduct est conservé ici.
                  // Permet à l'utilisateur de créer des champs libres type "Titres court".
                  const STANDARD_FIELD_NAMES = new Set([
                    'title', 'description', 'brand', 'reference', 'price', 'ean',
                    'images', 'documents', 'advantages',
                    'variants', 'variantes', 'Variantes', 'references',
                  ])
                  const customFields: Record<string, string | string[]> = {}
                  for (const [key, value] of Object.entries(f)) {
                    if (STANDARD_FIELD_NAMES.has(key)) continue
                    if (Array.isArray(value)) {
                      const arr = value.filter((x): x is string => typeof x === 'string' && x.length > 0)
                      if (arr.length > 0) customFields[key] = arr
                    } else if (typeof value === 'string' && value.length > 0) {
                      customFields[key] = value
                    }
                  }
                  // Documents : extraire les <a href> depuis le container plutôt que le textContent.
                  const docsField = matching.fields.find((fld) => fld.field === 'documents')
                  let documents: EnrichedDocument[] = coerceDocuments(f.documents)
                  if (docsField) {
                    const htmlDocs = applyDocumentsFromHtml(html, docsField, productUrl)
                    if (htmlDocs.length > 0) {
                      documents = htmlDocs
                      log(`📐 Documents extraits via <a href> : ${htmlDocs.length} lien(s)`)
                    }
                  }

                  // ── Appliquer les prompts par champ (transformation LLM) ────
                  // Un prompt par champ peut demander filtrage, reformatage
                  // (one-line + séparateur, markdown→HTML…), traduction ou
                  // nettoyage. On route TOUT au LLM via un appel batché unique
                  // car les heuristiques keyword ratent le reformatage (ex:
                  // "affiche sur une seule ligne avec '>'" n'est pas un filtre).
                  try {
                    const { applyFieldPrompts } = await import('@/features/scraping-templates/applyFieldPrompts')
                    type PromptSink = {
                      name: string
                      prompt: string
                      read: () => string | string[]
                      write: (v: string | string[]) => void
                    }
                    const sinks: PromptSink[] = []
                    for (const fld of matching.fields) {
                      if (!fld.prompt?.trim()) continue
                      const key = fld.field
                      if (key === 'documents') {
                        sinks.push({
                          name: key, prompt: fld.prompt,
                          // Représentation textuelle pour le LLM : "name##url" par ligne
                          read: () => documents.map((d) => `${d.name}##${d.url}`),
                          write: (v) => {
                            const arr = Array.isArray(v) ? v : v.split('\n').map((s) => s.trim()).filter(Boolean)
                            documents = coerceDocuments(arr)
                          },
                        })
                      } else if (key === 'images') {
                        sinks.push({
                          name: key, prompt: fld.prompt,
                          read: () => toArr(f.images),
                          write: (v) => { f.images = Array.isArray(v) ? v : [v] },
                        })
                      } else if (key === 'advantages') {
                        const originalGroups = advantages.map((a) => a.group)
                        sinks.push({
                          name: key, prompt: fld.prompt,
                          read: () => advantages.map((a) => a.text),
                          write: (v) => {
                            const arr = Array.isArray(v) ? v : [v]
                            // Même cardinalité : remap par position, conserve les groupes.
                            // Sinon (filtre qui change le nombre) : drop les groupes.
                            advantages = arr.length === originalGroups.length
                              ? arr.map((text, i) => originalGroups[i] ? { text, group: originalGroups[i] } : { text })
                              : arr.map((text) => ({ text }))
                          },
                        })
                      } else if (key === 'description') {
                        sinks.push({
                          name: key, prompt: fld.prompt,
                          read: () => toStr(f.description),
                          write: (v) => { f.description = Array.isArray(v) ? v.join('\n') : v },
                        })
                      } else if (key in customFields) {
                        sinks.push({
                          name: key, prompt: fld.prompt,
                          read: () => customFields[key],
                          write: (v) => { customFields[key] = v },
                        })
                      } else if (typeof f[key] === 'string' || Array.isArray(f[key])) {
                        sinks.push({
                          name: key, prompt: fld.prompt,
                          read: () => Array.isArray(f[key])
                            ? (f[key] as unknown[]).filter((x): x is string => typeof x === 'string')
                            : toStr(f[key]),
                          write: (v) => { f[key] = v },
                        })
                      }
                    }
                    if (sinks.length > 0) {
                      const targets = sinks.map((s) => ({ name: s.name, prompt: s.prompt, value: s.read() }))
                      const results = await applyFieldPrompts(targets)
                      const byName = new Map(results.map((r) => [r.name, r.value] as const))
                      let applied = 0
                      for (const s of sinks) {
                        const out = byName.get(s.name)
                        if (out === undefined) continue
                        s.write(out)
                        applied++
                      }
                      if (applied > 0) log(`📝 Prompts champs : ${applied}/${sinks.length} transformés par LLM`)
                    }
                  } catch (err) {
                    log(`⚠️ Prompts champs : transformation LLM échouée (${err instanceof Error ? err.message : String(err)})`)
                  }

                  const rawBuilt: EnrichedProduct = {
                    description: toStr(f.description),
                    advantages,
                    specifications: applied.specGroups.flatMap((g) => g.pairs.map((p) => ({ ...p, group: g.group }))),
                    variants,
                    images: toArr(f.images),
                    documents,
                    price: null,
                    breadcrumb: toArr(f.breadcrumb).length > 0 ? toArr(f.breadcrumb) : undefined,
                    sourceUrl: productUrl,
                    additionalSources: [],
                    generatedAt: Date.now(),
                    scrapingProvider: `Template ${matching.name}`,
                    llmProvider: undefined,
                    llmModel: undefined,
                    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
                  }
                  // Appliquer les règles de sanitization du scraping par défaut :
                  //   - GARBAGE_RE (cookies, GDPR, bannières, widgets UI)
                  //   - SAFETY_TEXT_RE (extraits de manuels sécurité)
                  //   - UI_PROFILE_TERMS_RE (menus "Installateur/Prescripteur/Plombier")
                  //   - COOKIE_LABEL_RE (paires Expiration/Finalité/Prestataire…)
                  //   - JUNK_GROUP_RE (sections inutiles)
                  //   - filterDocumentsByProductRef (retire docs d'autres SKU)
                  //   - cleanDocumentName (titres "Télécharger" → nom URL)
                  //   - nettoyage description (URLs, garbage, isMainlyGarbage)
                  const productIdsForSanitize = [
                    toStr(f.reference), toStr(f.sku), toStr(f.ean), toStr(f.title),
                  ].filter((x) => x.trim().length >= 3)
                  const built = sanitizeEnriched(rawBuilt, productIdsForSanitize)
                  const dropped = {
                    specs: rawBuilt.specifications.length - built.specifications.length,
                    docs: rawBuilt.documents.length - built.documents.length,
                    advs: rawBuilt.advantages.length - built.advantages.length,
                  }
                  if (dropped.specs + dropped.docs + dropped.advs > 0) {
                    log(`🧹 Sanitize : −${dropped.specs} specs · −${dropped.advs} avantages · −${dropped.docs} docs (règles par défaut)`)
                  }
                  setData(sheetName, rowId, built)
                  log(`✓ Fiche produite depuis le template — ${built.advantages.length} avantages, ${built.variants.length} variantes, ${built.images.length} images`)
                  return built
                }
                log(`📐 Template score insuffisant (${score}) — fallback sur IA…`)
              } else {
                log(`📐 Impossible de récupérer le HTML (CORS) — fallback sur IA…`)
              }
            }
          } catch (err) {
            console.warn('[enrichment] template check failed', err)
          }
        }

        // ── Étape 2 : Scraper la page via Jina Reader ──────────────────────
        // Le scrape cache peut contenir du markdown sale (sauvegardé avant
        // l'introduction des filtres pré-LLM). On ré-applique sanitizeJinaMarkdown
        // (idempotent) à chaque réutilisation pour ne pas re-polluer.
        let markdownContent: string | null = usedCache && cached!.markdownContent
          ? sanitizeJinaMarkdown(cached!.markdownContent)
          : null

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
            // Lancer en parallèle JSON-LD (rapide) et Jina markdown (long)
            const structuredPromise = extractStructuredDataFromUrl(productUrl).catch((err) => {
              console.warn('[enrichment] JSON-LD fetch failed:', err)
              return null
            })
            if (multiEnabled) {
              log(`Multi-URL bundle (X-Engine: browser + onglets auto) → ${productUrl}`)
              const bundle = await scrapeProductBundle(productUrl, {
                deepScrape: async (url) => {
                  const r = await jinaScrapeMaufacturerPage(url)
                  return r ? { markdown: r.markdown, html: r.html } : null
                },
                fastScrape: (url) => jinaScrapeMarkdown(url),
                log,
              })
              markdownContent = bundle.mergedMarkdown || null
              if (bundle.sourcesScrapped.length > 1) {
                log(`✓ Bundle : ${bundle.sourcesScrapped.length} sources fusionnées (${bundle.pdfsFound.length} PDFs)`)
              }
              // Stocker sourcesScrapped dans le cache (géré plus bas)
              ;(bundle as unknown as { __forCache: { sourcesScrapped: string[] } }).__forCache = { sourcesScrapped: bundle.sourcesScrapped }
              ;(globalThis as unknown as { __lastBundle?: unknown }).__lastBundle = bundle
            } else {
              log(`Scrape single-URL (multi-URL désactivé) → ${productUrl}`)
              const r = await jinaScrapeMaufacturerPage(productUrl)
              markdownContent = r?.markdown ?? null
            }
            const structuredData = await structuredPromise
            if (structuredData) {
              const fields = [
                structuredData.name && 'name',
                structuredData.description && 'description',
                structuredData.brand && 'brand',
                structuredData.sku && 'sku',
                structuredData.images.length > 0 && `${structuredData.images.length} images`,
                structuredData.specs.length > 0 && `${structuredData.specs.length} specs`,
              ].filter(Boolean).join(', ')
              if (fields.length > 0) {
                log(`✓ JSON-LD Schema.org extrait : ${fields}`)
                console.log('[enrichment] structured-data:', structuredData)
              }
            }
            ;(globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured = structuredData
          } catch (err) {
            console.warn('[enrichment] scrape failed', err)
            log(`✗ Scrape échec : ${String(err).slice(0, 200)}`)
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

          // Détection universelle de page captcha / challenge bot (DataDome,
          // Akamai, Cloudflare…) : si le markdown est en fait une page de
          // vérification, on force Firecrawl indépendamment du score, car
          // une page challenge a souvent un score modéré (prose technique).
          const isBotChallenge = looksLikeBotChallenge(markdownContent ?? '')
          if (isBotChallenge) {
            log(`⚠ Page CAPTCHA / challenge bot détectée — fallback forcé`)
            console.log('[enrichment] ⚠ bot challenge detected in markdown, forcing fallback')
            // Marque le contexte global pour propager le flag jusqu'au build final.
            ;(globalThis as unknown as { __antiBotBlocked?: boolean }).__antiBotBlocked = true
          }

          // Fallback Firecrawl : déclenché si score faible OU page challenge.
          // Le cache hostKnownBlocked NE saute plus Firecrawl — son mode stealth
          // peut passer DataDome que Jina ne passe pas. On l'économisait pour
          // Firecrawl toujours tenté même si le host est en cache DataDome.
          const FIRECRAWL_THRESHOLD = 15
          const currentScore = scoreMd(markdownContent)
          const hostKnownBlocked = productUrl ? isHostKnownBlocked(productUrl) : false
          let firecrawlChallenge = false
          if ((currentScore < FIRECRAWL_THRESHOLD || isBotChallenge) && productUrl) {
            const fcKey = getApiKey('firecrawl')
            if (fcKey) {
              log(isBotChallenge
                ? `Challenge bot → tentative Firecrawl stealth (anti-bot bypass)`
                : `Score insuffisant (${currentScore}) → tentative Firecrawl`)
              try {
                const fcResult = await firecrawlScrape(productUrl, fcKey)
                if (fcResult?.markdown) {
                  const fcSanitized = sanitizeJinaMarkdown(fcResult.markdown)
                  const fcScore = scoreMd(fcSanitized)
                  const fcIsChallenge = looksLikeBotChallenge(fcSanitized)
                  console.log('[enrichment] firecrawl score:', fcScore, '(', fcSanitized.length, 'chars)', fcIsChallenge ? '⚠ challenge' : '')
                  if (fcIsChallenge) {
                    log(`⚠ Firecrawl aussi bloqué par challenge bot — escalade Bright Data`)
                    firecrawlChallenge = true
                    markHostBlocked(productUrl)
                  } else if (fcScore > currentScore || isBotChallenge) {
                    log(`✓ Firecrawl meilleur (${fcScore} > ${currentScore}) — bascule sur Firecrawl`)
                    markdownContent = `## [Source: ${productUrl}]\n\n${fcSanitized}`
                  } else {
                    log(`Firecrawl pas meilleur (${fcScore} ≤ ${currentScore}) — markdown inchangé`)
                  }
                }
              } catch (err) {
                console.warn('[enrichment] Firecrawl fallback failed:', err)
              }
            }
          }

          // Cascade anti-bot premium : Bright Data — palier 4.
          // GUARD : si Jina a déjà retourné du contenu exploitable (pas de CAPTCHA,
          // score suffisant), on N'appelle PAS Bright Data même si le host est connu
          // DataDome. Bright Data écraserait un bon markdown Jina avec le markdown
          // Turndown structurellement pauvre. Le cache DataDome (hostKnownBlocked)
          // est conservé pour court-circuiter Firecrawl, pas pour forcer BD.
          const jinaSucceeded = !isBotChallenge && scoreMd(markdownContent) >= FIRECRAWL_THRESHOLD
          const hasSiteCookies = productUrl ? !!getSiteCookieForUrl(productUrl) : false
          const needAntiBotPremium = !jinaSucceeded && productUrl && (
            firecrawlChallenge || hostKnownBlocked || hasSiteCookies || (
              (isBotChallenge || looksLikeBotChallenge(markdownContent ?? '')) && scoreMd(markdownContent) < FIRECRAWL_THRESHOLD
            )
          )

          // ── Palier 4 : Bright Data Web Unlocker (via Cloud Function) ──
          let brightDataSucceeded = false
          if (needAntiBotPremium && productUrl) {
            log(hostKnownBlocked
              ? `Host connu DataDome — direct Bright Data Web Unlocker`
              : `Firecrawl bloqué → tentative Bright Data Web Unlocker`)
            try {
              const bdResult = await brightDataScrapeWithDocs(productUrl)
              if (bdResult?.markdown) {
                const bdSanitized = sanitizeJinaMarkdown(bdResult.markdown)
                const bdScore = scoreMd(bdSanitized)
                const bdIsChallenge = looksLikeBotChallenge(bdSanitized)
                console.log('[enrichment] brightdata score:', bdScore, '(', bdSanitized.length, 'chars)', bdIsChallenge ? '⚠ challenge' : '')
                if (bdIsChallenge) {
                  log(`⚠ Bright Data : page challenge détectée — abandon`)
                } else {
                  const meta = getLastBrightDataSuccess()
                  const metaParts = meta
                    ? ` · ${meta.country} · ${(meta.lengthBytes / 1024).toFixed(0)}KB · ${(meta.durationMs / 1000).toFixed(1)}s`
                    : ''
                  log(`✓ Bright Data OK (score ${bdScore})${metaParts} — bascule sur Bright Data`)
                  const pdfBlock = bdResult.pdfLinks.length > 0
                    ? `\n\n## Documents\n\n${bdResult.pdfLinks.map((d) => `- [${d.name}](${d.url})`).join('\n')}\n`
                    : ''
                  if (bdResult.pdfLinks.length > 0) {
                    log(`✓ Bright Data : ${bdResult.pdfLinks.length} document(s) PDF détecté(s)`)
                  }
                  markdownContent = `## [Source: ${productUrl}]\n\n${bdSanitized}${pdfBlock}`
                  brightDataSucceeded = true
                  ;(globalThis as unknown as { __antiBotBlocked?: boolean }).__antiBotBlocked = false
                }
              } else {
                const bdErr = getLastBrightDataError()
                if (bdErr?.code === 'unauthenticated') {
                  log(`⚠ Bright Data : auth Firebase requise (utilisateur non connecté ?)`)
                } else if (bdErr?.code === 'balance_exhausted') {
                  log(`⚠ Bright Data : balance épuisée — recharger sur le dashboard Bright Data`)
                } else if (bdErr?.code === 'not_configured') {
                  log(`⚠ Bright Data : Cloud Function pas configurée (BRIGHTDATA_API_TOKEN manquant)`)
                } else if (bdErr?.code === 'timeout') {
                  log(`⚠ Bright Data : timeout ${Math.round(160)}s — DataDome résiste sur ce site`)
                } else if (bdErr) {
                  log(`⚠ Bright Data erreur : ${bdErr.message.slice(0, 100)}`)
                } else {
                  log(`⚠ Bright Data n'a rien retourné`)
                }
              }
            } catch (err) {
              console.warn('[enrichment] Bright Data fallback failed:', err)
            }
          }

          // ── GUARD FINAL ANTI-HALLUCINATION ─────────────────────────────────
          // Si après Firecrawl (réussi ou échoué) le markdown est TOUJOURS un
          // CAPTCHA, on le vide de force pour que :
          //   - parseSpecsFromMarkdown / parseAdvantagesFromMarkdown / parseImagesFromMarkdown
          //     ne ramassent pas les pictos/textes du challenge
          //   - le LLM ne soit pas appelé sur du contenu challenge (= hallucination)
          //   - le pipeline produise un EnrichedProduct vide avec blockedByAntiBot=true
          if (markdownContent && looksLikeBotChallenge(markdownContent)) {
            console.log('[enrichment] ⚠ markdown is still CAPTCHA after all fallbacks — clearing to prevent hallucination')
            log(`⚠ Toutes les sources renvoient un CAPTCHA — abandon (pas d'hallucination IA)`)
            markdownContent = ''
            ;(globalThis as unknown as { __antiBotBlocked?: boolean }).__antiBotBlocked = true
          }

          // Fallback fabricant si toujours rien et URL = revendeur (dernière chance)
          const MANUFACTURER_THRESHOLD = 5
          const scoreAfterFc = scoreMd(markdownContent)
          if (scoreAfterFc < MANUFACTURER_THRESHOLD && productUrl) {
            const detected = detectBrandFromUrl(productUrl)
            const ref = extractProductReference(title ?? '')
            if (detected && ref) {
              const mfgSearchUrl = buildManufacturerSearchUrl(detected.brand, ref)
              if (mfgSearchUrl) {
                log(`Score toujours faible (${scoreAfterFc}) → essai site fabricant ${detected.brand} : ${mfgSearchUrl}`)
                try {
                  const mfgMd = await jinaScrapeMarkdown(mfgSearchUrl)
                  if (mfgMd) {
                    const mfgSanitized = sanitizeJinaMarkdown(mfgMd)
                    const mfgScore = scoreMd(mfgSanitized)
                    console.log('[enrichment] manufacturer score:', mfgScore, '(', mfgSanitized.length, 'chars)')
                    if (mfgScore > scoreAfterFc) {
                      log(`✓ Site fabricant meilleur (${mfgScore} > ${scoreAfterFc})`)
                      markdownContent = `## [Source: ${mfgSearchUrl}]\n\n${mfgSanitized}`
                    } else {
                      log(`Site fabricant pas meilleur — markdown inchangé`)
                    }
                  }
                } catch (err) {
                  console.warn('[enrichment] manufacturer fallback failed:', err)
                }
              }
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
          const lastBundle = (globalThis as unknown as { __lastBundle?: { sourcesScrapped?: string[] } }).__lastBundle
          setScrapeCache(sheetName, rowId, {
            productUrl,
            additionalSources,
            markdownContent,
            scrapeProvider: 'Jina',
            sourcesScrapped: lastBundle?.sourcesScrapped,
          })
          ;(globalThis as unknown as { __lastBundle?: unknown }).__lastBundle = undefined
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
            const matchedTemplateForLlm = productUrl ? await findMatchingTemplate(productUrl) : null
            const wrappedMfrPrompt = buildEnrichmentPrompt(mfrPrompt, matchedTemplateForLlm)
            const mfrAi = await generateJson({
              task: 'product.enrichment',
              prompt: wrappedMfrPrompt,
              schema: enrichedProductSchema,
              schemaForLLM: enrichedProductJsonSchema as unknown as Record<string, unknown>,
              version: 'product.enrichment.v1',
              onProviderUsed: ({ provider, model }) => {
                mfrLlmProvider = provider
                mfrLlmModel = model
                setLlmUsed(sheetName, rowId, { provider, model })
                log(`✓ LLM utilisé : ${provider} (${model})`)
              },
              onProviderFailed: ({ provider, error }) => {
                log(`⚠ ${provider} a échoué : ${error.message.slice(0, 200)}`)
              },
              onCascadeWarning: (warning) => {
                log(`⚠ Cascade : ${warning}`)
              },
              onRequestSent: (request) => {
                setLlmRequest(sheetName, rowId, request)
                logLlmRequest(request)
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
        const structuredEarly = (globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured ?? null
        // Donnée structurée riche = JSON-LD ou microdata avec assez d'infos pour
        // construire un produit utile sans LLM. Utile quand markdown est vide
        // (DataDome bloque Jina/Firecrawl markdown mais le HTML contient JSON-LD).
        const hasRichStructured = !!(structuredEarly && (
          (structuredEarly.description && structuredEarly.description.length > 50) ||
          structuredEarly.specs.length >= 3 ||
          structuredEarly.images.length >= 3
        ))
        const hasMarkdown = !!(markdownContent && markdownContent.length > 200)

        if (hasMarkdown || hasRichStructured) {
          const mdSpecs = hasMarkdown ? parseSpecsFromMarkdown(markdownContent!) : []
          const mdAdvantages = hasMarkdown ? parseAdvantagesFromMarkdown(markdownContent!) : []
          // Description : parser uniquement la section primaire pour éviter
          // que le texte UI des pages avis (/avis?productCode=...) contamine
          // la description produit.
          const primaryMd = hasMarkdown ? extractPrimarySourceSection(markdownContent!) : ''
          let mdDescription = hasMarkdown ? parseDescriptionFromMarkdown(primaryMd) : ''
          const structured = structuredEarly

          // Merge JSON-LD prioritaire si disponible
          if (structured) {
            // Description : JSON-LD si présente et > 50 chars
            if (structured.description && structured.description.length > 50) {
              mdDescription = structured.description
            }
            // Specs : ajouter celles de JSON-LD non dupliquées par nom (priorité = en tête)
            if (structured.specs.length > 0) {
              const existingNames = new Set(mdSpecs.map(s => s.name.toLowerCase()))
              const jsonLdSpecs = structured.specs
                .filter(sp => !existingNames.has(sp.name.toLowerCase()))
                .map(sp => ({ name: sp.name, value: sp.value, group: 'JSON-LD' }))
              mdSpecs.unshift(...jsonLdSpecs)
            }
          }
          console.log('[enrichment] parseDescriptionFromMarkdown returned:', mdDescription.length, 'chars. First 200:', JSON.stringify(mdDescription.slice(0, 200)))

          if (!mdDescription || mdDescription.length < 30) {
            const h1Match = markdownContent?.match(/^#\s+(.+)/m)
            if (h1Match) {
              mdDescription = h1Match[1].replace(/\*\*/g, '').trim()
              console.log('[enrichment] mdDescription < 30 → fallback H1:', JSON.stringify(mdDescription))
            }
          }

          console.log('[enrichment] direct build attempt:', { specs: mdSpecs.length, advantages: mdAdvantages.length, descLen: mdDescription.length, hasMarkdown, hasRichStructured })

          // Seuil abaissé quand structured-data riche : 3 specs suffisent
          // (vs 5 pour markdown-only) car la donnée est de meilleure qualité.
          const minSpecs = hasRichStructured ? 3 : 5
          const hasEnoughData = mdSpecs.length >= minSpecs
            && (mdAdvantages.length >= 2 || mdDescription.length > 50)
          if (hasEnoughData) {
            // Si markdown vide (chemin structured-only), tout ce qui suit reste no-op
            const mdSafe = markdownContent ?? ''
            const mdDocs = [...mdSafe.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)]
              .map(m => m[0])
            // Liens PDF titrés [nom](url.pdf)
            const mdDocTitled = [...mdSafe.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+\.pdf[^\s)]*)\)/gi)]
              .map(m => ({ name: m[1].trim(), url: m[2].trim() }))
            const directDocuments: EnrichedDocument[] = []
            const directDocsSeen = new Set<string>()
            // 0. Tous les blocs JINA_EXTRACTED_DOWNLOADS injectés par le scraper
            //    (POST + GET → potentiellement 2 blocs). Format : `title##url`
            //    OU `title | url` selon la source (Drupal vs Relay).
            for (const m of mdSafe.matchAll(/JINA_EXTRACTED_DOWNLOADS_START\s*([\s\S]*?)\s*JINA_EXTRACTED_DOWNLOADS_END/g)) {
              for (const line of m[1].split('\n')) {
                const trimmed = line.trim()
                if (!trimmed) continue
                let name: string | undefined
                let url: string
                const sepHash = trimmed.indexOf('##')
                const sepPipe = trimmed.indexOf(' | ')
                if (sepHash > 0) {
                  name = trimmed.slice(0, sepHash).trim()
                  url = trimmed.slice(sepHash + 2).trim()
                } else if (sepPipe > 0) {
                  name = trimmed.slice(0, sepPipe).trim()
                  url = trimmed.slice(sepPipe + 3).trim()
                } else if (/^https?:\/\//.test(trimmed)) {
                  url = trimmed
                } else continue
                if (!url || directDocsSeen.has(url)) continue
                directDocsSeen.add(url)
                directDocuments.push(buildDocument(url, name))
              }
            }
            for (const t of mdDocTitled) {
              if (directDocsSeen.has(t.url)) continue
              directDocsSeen.add(t.url)
              directDocuments.push(buildDocument(t.url, t.name))
            }
            for (const u of mdDocs) {
              if (directDocsSeen.has(u)) continue
              directDocsSeen.add(u)
              directDocuments.push(buildDocument(u))
            }
            const mdVariants = parseVariantsFromMarkdown(mdSafe)
            const directImages = parseImagesFromMarkdown(mdSafe)
            // Stratégie images : TOUJOURS merger JSON-LD + markdown.
            // `parseImagesFromMarkdown` filtre déjà via `isJunkImageUrl` les
            // bannières promo (French Days, Jardi'Versaire, etc.), logos, pictos.
            // Le dédup par `imageStem()` ci-dessous fusionne les URLs identiques
            // (variantes de taille / OG vs gallery). Privilégier JSON-LD comme
            // EXCLUSIF (ancien comportement) faisait perdre les vraies images
            // produit quand le JSON-LD n'a qu'une URL `og:image` répétée.
            const structuredImages = structured?.images ?? []
            const sourceImages = [...structuredImages, ...directImages]
            // Dédup par `imageStem()` (retire UNIQUEMENT les extensions d'image,
            // ex: `21334841.4006825646498.25192.40242354.jpg` → garde tous les
            // points internes du filename). L'ancienne logique `split('.')[0]`
            // collapsait à `21334841` (préfixe SKU) → fusionnait toutes les vues
            // produit Jardiland en une seule image.
            const seenImageStems = new Set<string>()
            const mergedDirectImages: string[] = []
            for (const u of sourceImages) {
              const stem = imageStem(u)
              if (!seenImageStems.has(stem)) {
                seenImageStems.add(stem)
                mergedDirectImages.push(u)
              }
            }
            if (structuredImages.length > 0 || directImages.length > 0) {
              log(`✓ ${mergedDirectImages.length} images produit (JSON-LD ${structuredImages.length} + markdown ${directImages.length}, dédupliquées par stem)`)
            }
            // Prix structurés (TTC/HT/barré/promo/éco-participation)
            // Sources : markdown patterns + JSON-LD offers (priorité JSON-LD).
            const jsonLdPricing = structured?.offers
              ? {
                  ttc: typeof structured.offers.price === 'number' ? structured.offers.price : undefined,
                  currency: structured.offers.priceCurrency || 'EUR',
                  validUntil: structured.offers.priceValidUntil,
                }
              : undefined
            const mdPricing = parsePricingFromMarkdown(mdSafe, jsonLdPricing)

            directBuild = {
              description: mdDescription,
              advantages: mdAdvantages,
              specifications: mdSpecs,
              variants: mdVariants,
              documents: directDocuments,
              images: [...new Set(mergedDirectImages)],
              pricing: mdPricing ?? undefined,
            }
            console.log('[enrichment-images-direct] structured=', structuredImages.length, 'direct=', directImages.length, 'merged=', mergedDirectImages.length, 'final=', directBuild.images?.length, 'sample:', directBuild.images?.slice(0, 3))
            console.log('[enrichment] ★ markdown direct build succeeded')
            if (mdPricing) {
              const priceParts = [
                mdPricing.ttc != null && `TTC ${mdPricing.ttc}€`,
                mdPricing.ht != null && `HT ${mdPricing.ht}€`,
                mdPricing.original != null && `barré ${mdPricing.original}€`,
                mdPricing.discount?.amount != null && `-${mdPricing.discount.amount}€`,
                mdPricing.discount?.percent != null && `-${mdPricing.discount.percent}%`,
                mdPricing.ecoParticipation != null && `éco ${mdPricing.ecoParticipation}€`,
              ].filter(Boolean).join(' · ')
              log(`💰 Prix : ${priceParts}`)
            }
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
            pricing: directBuild.pricing,
            sourceUrl: productUrl,
            additionalSources,
            generatedAt: Date.now(),
            scrapingProvider: 'Jina (direct)',
            llmProvider: undefined,
            llmModel: undefined,
          }
        } else {
          // ══ GUARD ANTI-HALLUCINATION ════════════════════════════════
          // Si le scraping a été bloqué par anti-bot ET pas de structured-data
          // utilisable → SKIP le LLM. Le prompt PATH B demande au LLM de
          // "générer la fiche depuis ses connaissances" = hallucination par
          // design. L'utilisateur veut explicitement éviter ça.
          const antiBotBlocked = (globalThis as unknown as { __antiBotBlocked?: boolean }).__antiBotBlocked === true
          const hasAnyStructuredData = !!(structuredEarly && (
            (structuredEarly.description && structuredEarly.description.length > 30) ||
            structuredEarly.specs.length > 0 ||
            structuredEarly.images.length > 0
          ))
          if (antiBotBlocked && !hasAnyStructuredData) {
            log(`⚠ Site bloqué par anti-bot ET aucune donnée structurée — skip LLM (pas d'hallucination)`)
            console.log('[enrichment] anti-bot blocked + no structured data → returning empty product, skipping LLM')
            enriched = {
              description: '',
              advantages: [],
              specifications: [],
              variants: [],
              images: [],
              documents: [],
              sourceUrl: productUrl,
              additionalSources,
              generatedAt: Date.now(),
              scrapingProvider: 'Jina (bloqué)',
              llmProvider: undefined,
              llmModel: undefined,
              blockedByAntiBot: true,
            }
            // Skip le reste du PATH B (LLM call, post-process)
            setData(sheetName, rowId, enriched)
            ;(globalThis as unknown as { __antiBotBlocked?: boolean }).__antiBotBlocked = false
            setRunning(false)
            return enriched
          }

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
1. LANGUE DE SORTIE : TOUJOURS FRANÇAIS. Si le contenu source est en anglais/allemand/autre, TRADUIS fidèlement (description, noms de specs, libellés groupes, avantages, libellés variants). Les valeurs numériques + unités + références/SKU restent inchangées.
2. Description : EXTRAIS verbatim le PARAGRAPHE DESCRIPTIF PRINCIPAL du markdown — typiquement le paragraphe en prose qui suit le titre du produit (ex: "Cette tondeuse à gazon alimentée par batterie est conçue pour…"). C'est généralement 3–6 phrases continues. NE RÉSUME PAS, NE RÉDIGE PAS, NE RÉFORMULE PAS — copie le texte tel quel. Ignorer les lignes de métadonnées ("Code commande:", "Référence fabricant:"), les liens nav, les tooltips UI. Si plusieurs paragraphes en prose existent, prendre le plus long décrivant le produit.
3. Avantages : reprends TOUS les bullet points / features, traduits en FR. SANS LIMITE de nombre.
4. Spécifications : extrais CHAQUE paire nom/valeur de CHAQUE section technique. SANS LIMITE. Libellés et groupes en FR ; valeurs (chiffres+unités) inchangées.
5. Variantes : extrais TOUTES les déclinaisons avec référence (inchangée), libellé (FR), et properties (clés FR).
6. Images : reprends toutes les URLs d'images (https://...) trouvées dans les données.
7. Documents : reprends toutes les URLs de fichiers PDF (.pdf) trouvées dans les données.
8. Si un champ n'existe pas dans les données → chaîne vide ou tableau vide. JAMAIS d'invention.
9. FIDÉLITÉ chiffrée : aucune conversion d'unité, aucun arrondi.

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
          const matchedTemplateForLlm2 = productUrl ? await findMatchingTemplate(productUrl) : null
          const wrappedPromptForLlm2 = buildEnrichmentPrompt(prompt, matchedTemplateForLlm2)
          const ai = await generateJson({
            task: 'product.enrichment',
            prompt: wrappedPromptForLlm2,
            schema: enrichedProductSchema,
            schemaForLLM: enrichedProductJsonSchema as unknown as Record<string, unknown>,
            version: 'product.enrichment.v1',
            onProviderUsed: ({ provider, model }) => {
              llmProviderUsed = provider
              llmModelUsed = model
              setLlmUsed(sheetName, rowId, { provider, model })
              log(`✓ LLM utilisé : ${provider} (${model})`)
            },
            onProviderFailed: ({ provider, error }) => {
              log(`⚠ ${provider} a échoué : ${error.message.slice(0, 200)}`)
            },
            onCascadeWarning: (warning) => {
              log(`⚠ Cascade : ${warning}`)
            },
            onRequestSent: (request) => {
              setLlmRequest(sheetName, rowId, request)
              logLlmRequest(request)
            },
          })

          // Images : extraction directe du markdown (filtres junk + priorité /products/).
          // Les URLs du LLM sont utilisées UNIQUEMENT comme fallback si le markdown n'en
          // donne aucune (Nicoll et d'autres sites rendent parfois les images dans un
          // carousel JS que Jina ne capture pas).
          const mdImages = markdownContent ? parseImagesFromMarkdown(markdownContent) : []
          const llmImages: string[] = Array.isArray(ai.images)
            ? (ai.images as unknown[]).filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
              .filter((u) => !isJunkImageUrl(u))
            : []
          const mergedImages: string[] = mdImages.length > 0
            ? Array.from(new Set([...mdImages, ...llmImages]))
            : llmImages
          console.log('[enrichment-images] PATH=B(LLM) mdImages=', mdImages.length, 'llmImages=', llmImages.length, 'merged=', mergedImages.length, 'sample:', mergedImages.slice(0, 3))

          // Documents : LLM + extraction directe du markdown (URLs .pdf simples + liens titrés)
          const mdDocUrls: string[] = markdownContent
            ? [...markdownContent.matchAll(/https?:\/\/[^\s\)"\]]+\.pdf[^\s\)"\]]*/gi)].map(m => m[0])
            : []
          const mdDocTitled: Array<{ name: string; url: string }> = markdownContent
            ? [...markdownContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+\.pdf[^\s)]*)\)/gi)]
                .map(m => ({ name: m[1].trim(), url: m[2].trim() }))
            : []
          // LLM peut renvoyer string[] ou {name,url}[] — on coerce tout via documentUtils
          const llmDocs = coerceDocuments(ai.documents ?? [])
          const mergedDocs: EnrichedDocument[] = []
          const mergedSeen = new Set<string>()
          const pushDoc = (d: EnrichedDocument) => {
            if (mergedSeen.has(d.url)) return
            mergedSeen.add(d.url)
            mergedDocs.push(d)
          }
          for (const d of llmDocs) pushDoc(d)
          for (const t of mdDocTitled) pushDoc(buildDocument(t.url, t.name))
          for (const u of mdDocUrls) pushDoc(buildDocument(u))

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

        // IDs produit (ref/SKU/modèle) pour filtrer les docs non liés à ce produit.
        const productModelForFilter = title.match(/[A-Z]{2,5}[\-\s]?\d{1,4}[\w\-]*/i)?.[0] ?? ''
        const productIdsForSanitize = [reference, sku, productModelForFilter, title]
          .filter((x): x is string => typeof x === 'string' && x.trim().length >= 3)

        enriched = sanitizeEnriched(enriched, productIdsForSanitize)
        // Flag anti-bot : si le scraping a rencontré un challenge bot non
        // résolu, on le propage au produit pour que l'UI affiche un bandeau.
        const antiBot = (globalThis as unknown as { __antiBotBlocked?: boolean }).__antiBotBlocked ?? false
        if (antiBot) enriched = { ...enriched, blockedByAntiBot: true }
        ;(globalThis as unknown as { __antiBotBlocked?: boolean }).__antiBotBlocked = false
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
    [setProgress, setData, setError, setLlmRequest, setLlmUsed, getScrapeCache, setScrapeCache],
  )

  /** Clear l'entry (data/error/progress) MAIS conserve le scrape cache.
   *  Utilisé par "Re-générer" pour ré-exécuter le LLM sur le markdown déjà
   *  scrapé — sans relancer une recherche DuckDuckGo qui pourrait dériver. */
  const reset = useCallback(
    (sheetName: string, rowId: string) => {
      clear(sheetName, rowId)
    },
    [clear],
  )

  /** Hard reset : clear l'entry ET le scrape cache. À utiliser quand l'URL
   *  source change ou que le cache est suspecté compromis (mauvaise marque,
   *  produit changé, etc.). */
  const hardReset = useCallback(
    (sheetName: string, rowId: string) => {
      clear(sheetName, rowId)
      clearScrapeCache(sheetName, rowId)
    },
    [clear, clearScrapeCache],
  )

  return { enrich, reset, hardReset, running }
}
