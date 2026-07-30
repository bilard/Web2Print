import { debugLog } from '@/lib/debugLog'
import { isJunkUrl, tokenizeTitle, scoreResult, type SearchResult } from './searchScoring'
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
import { extractLongestProseParagraph, isNavLikeDescription } from './enrichmentSanitize'
import { isJunkImageUrl } from './imageFilter'
// Filtre des contenus parasites : version CANONIQUE et testée, partagée avec le
// node de scraping. Le PIM en avait une copie amputée (cf. commit).
import { isGarbageContent, isMainlyGarbage } from '@/features/scraping/core/parsers/garbageFilter'
import { buildIdentity, stripInternalSentinels,
  MEGA_SPEC_NAME_RE, splitMegaSpecValue,
} from './liftIdentity'
import { parseVariantsFromMarkdown, imageStem, parseImagesFromMarkdown, parseBreadcrumbFromMarkdown } from './markdownParsers'
import { jinaScrapeMarkdown, scrapeHtmlFallback } from './jinaScrape'
import {
  MANUFACTURER_DOMAINS, detectManufacturerSite, scrapeManufacturerRawData,
  buildManufacturerProduct, jinaScrapeMaufacturerPage, type ManufacturerData,
} from './manufacturerScrape'
export { isJunkImageUrl }
import { parseDescriptionFromMarkdown, parseRichDescriptionFromMarkdown } from '@/features/scraping/core/parsers/parseDescription'
import { structuredPlainToRichMarkdown, stripTrailingSpecList } from '@/lib/richText'
import { parseSpecsFromMarkdown } from '@/features/scraping/core/parsers/parseSpecifications'
import { parsePricingFromMarkdown } from '@/features/scraping/core/parsers/parsePricing'
import { parseAdvantagesFromMarkdown, mergeAdvantagesAdditive, mergeGroupsIntoAdvantages } from '@/features/scraping/core/parsers/parseAdvantages'
import { buildEnrichmentPrompt } from '@/features/scraping-templates/buildEnrichmentPrompt'
import { findMatchingTemplate } from '@/features/scraping-templates/useMatchingTemplate'
import { appendDebugEntry, genId } from '@/features/scraping-hub/debugLog'
import { extractStructuredDataFromUrl } from '@/features/scraping/core/structuredDataFetcher'
import type { StructuredProductData } from '@/features/scraping/core/structuredData'
import { firecrawlScrape } from '@/features/scraping/core/firecrawlFallback'
import { recordScrapeUsage } from '@/features/stats/aiUsageTracking'
import { recordPipelineRun } from '@/lib/pipelineLog'
import { isHostKnownBlocked, markHostBlocked } from '@/features/scraping/core/brightDataFallback'
import { brightDataScrapeWithDocs, getLastBrightDataError, getLastBrightDataSuccess } from '@/features/scraping/core/brightDataFallback'
import { getSiteCookieForUrl } from '@/lib/siteCookies'
import { extractProductReference, buildManufacturerSearchUrl } from '@/features/scraping/core/manufacturerFallback'
import { detectBrandFromUrl } from '@/features/scraping/useJina'
import { t } from '@/lib/i18n'

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



/**
 * Post-processing : enrichit un EnrichedProduct avec les données du markdown source.
 * Le markdown est la SOURCE DE VÉRITÉ pour les groupes, les items manquants et les variantes.
 * Le LLM retourne tout à plat — le markdown conserve la structure d'origine.
 */

/**
 * Finalise la DESCRIPTION (plate + riche) — logique UNIQUE partagée par TOUS les
 * chemins de retour d'enrichProductCore (direct-build ET post-process markdown).
 *   1. JSON-LD (`__lastStructured.description`) prioritaire s'il est propre.
 *   2. Repli GARANTI sur le parseur markdown robuste si la description est vide.
 *   3. `descriptionRich` dérivée du JSON-LD (structuré) ou du markdown.
 * Sans ce partage, le direct-build (sites JSON-LD riches) court-circuitait la
 * description → fiches sans description.
 */
function finalizeDescription(current: string, markdownContent: string | null): { description: string; descriptionRich: string | undefined } {
  let description = (current || '').trim()
  // Une description candidate garbage (indice, réassurance, footer…) est vidée
  // pour déclencher le repli markdown robuste plus bas.
  if (description && (isGarbageContent(description) || looksLikeBotChallenge(description))) description = ''
  let descriptionRich: string | undefined
  const structuredDesc = (globalThis as unknown as { __lastStructured?: StructuredProductData | null })
    .__lastStructured?.description
  if (structuredDesc && structuredDesc.trim().length > 50
      && !looksLikeBotChallenge(structuredDesc) && !isGarbageContent(structuredDesc)) {
    const proseOnly = stripTrailingSpecList(structuredDesc)
    const clean = proseOnly.replace(/\t/g, '').replace(/\n{3,}/g, '\n\n').trim()
    if (clean.length >= 30) { description = clean; descriptionRich = structuredPlainToRichMarkdown(proseOnly) }
  }
  if ((!description || description.length < 30) && markdownContent) {
    const md = parseDescriptionFromMarkdown(markdownContent)
    if (md && md.length >= 30) description = md
  }
  if (!descriptionRich) descriptionRich = parseRichDescriptionFromMarkdown(markdownContent || '') || undefined
  return { description, descriptionRich }
}

function enrichWithMarkdownGroups(enriched: EnrichedProduct, markdownContent: string | null): EnrichedProduct {
  if (!markdownContent || markdownContent.length < 100) {
    debugLog('[post-process] no markdown content, skipping')
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
      debugLog(`[post-process] ⚠ description LLM = ${reason} — fallback prose`)
    }
    const fallback = extractLongestProseParagraph(markdownContent)
    // Refuse aussi le fallback s'il est lui-même une page CAPTCHA
    const fallbackOk = fallback && fallback.length >= 50 && !looksLikeBotChallenge(fallback)
    if (fallbackOk) {
      debugLog('[post-process] ✓ description fallback prose paragraph (', fallback.length, 'chars)')
      enriched = { ...enriched, description: fallback }
    } else if (looksLikeUrl || looksLikeCode || isTrackingUrl || isLowProse || isCaptcha) {
      // Pas de fallback prose disponible — préfère vide à la pollution.
      enriched = { ...enriched, description: '' }
    }
  }

  debugLog('[post-process] markdown length:', markdownContent.length, 'chars')
  // Log les lignes contenant des keywords features/avantages pour debug
  const featureLines = markdownContent.split('\n')
    .filter(l => /les\s*\+|avantage|caract[eé]ristique|points?\s*forts?|features?/i.test(l))
    .slice(0, 10)
  if (featureLines.length > 0) {
    debugLog('[post-process] feature-related lines in markdown:', featureLines.map(l => l.trim().slice(0, 80)))
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
    debugLog('[post-process] ⚠ markdown / description = CAPTCHA — pas de remplacement')
    if (looksLikeBotChallenge(description)) {
      debugLog('[post-process] ⚠ description LLM = CAPTCHA → vidée')
      description = ''
    }
  } else if (mdDescription && mdDescription.length > 40) {
    if (!description || description.length < 40 || looksLikeBotChallenge(description)) {
      description = mdDescription
      debugLog('[post-process] ✓ description from markdown:', description.slice(0, 80) + '…')
    } else if (mdDescription.length > description.length * 1.5) {
      // Le markdown a un texte significativement plus riche → le préférer
      description = mdDescription
      debugLog('[post-process] ✓ replaced description with richer markdown version:', description.slice(0, 80) + '…')
    }
  }

  // ── 1. Advantages : JAMAIS réduire le nombre d'items ──
  // Le markdown peut contenir des groupes que le LLM/schema n'ont pas.
  // Règle : on ne remplace QUE si le markdown a STRICTEMENT PLUS d'items.
  // Sinon, on essaie d'ajouter les groupes aux items existants par matching textuel.
  const mdAdvantages = parseAdvantagesFromMarkdown(markdownContent)
  debugLog('[post-process] markdown advantages:', mdAdvantages.length, 'items,', mdAdvantages.filter(a => a.group).length, 'grouped')
  debugLog('[post-process] existing advantages:', advantages.length, 'items')
  if (mdAdvantages.length > 0) {
    if (mdAdvantages.length > advantages.length) {
      // Markdown a strictement plus d'items → le préférer
      advantages = mdAdvantages
      debugLog('[post-process] ✓ replaced with markdown advantages:', advantages.length, 'items')
    } else if (mdAdvantages.some(a => a.group) && !advantages.some(a => a.group)) {
      // Markdown a des groupes, les items existants n'en ont pas → enrichir par matching
      advantages = mergeGroupsIntoAdvantages(advantages, mdAdvantages)
      debugLog('[post-process] ✓ merged groups into existing advantages:', advantages.length, 'items,', advantages.filter(a => a.group).length, 'grouped')
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
    debugLog('[post-process] ✓ specs grouped:', specifications.filter(s => s.group).length, '/', specifications.length)
  }

  // ── 3. Variants : extraire du markdown ──
  if (!variants || variants.length === 0) {
    variants = parseVariantsFromMarkdown(markdownContent)
    if (variants.length > 0) {
      debugLog('[post-process] ✓ variants:', variants.length)
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
      debugLog('[post-process] ✓', commonProps.length, 'props communes déplacées vers specifications')
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
    debugLog('[post-process] ✓ added', bareAdded, 'PDF docs from markdown')
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

  // ── 7. Description : source FIABLE (JSON-LD) prioritaire ──
  // Le `Product.description` du JSON-LD est DÉTERMINISTE — même source que les
  // specs (toujours justes) — contrairement au markdown rendu, instable sur les
  // SPA Magento (selon l'état : vrai texte, mur cookies, erreur panier, footer).
  // Quand il est présent et propre, il prime pour la version PLATE et la version
  // RICHE (structure dérivée de sa mise en forme JSON-LD). Sinon, repli markdown.
  const { description: finalDescription, descriptionRich } = finalizeDescription(description, markdownContent)

  return { ...enriched, description: finalDescription, descriptionRich, advantages, specifications, variants, documents: cleanedDocuments, breadcrumb }
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
    debugLog('[sanitize] filterDocumentsByProductRef: kept', kept.length, '/ rejected', rejected.length, '(other-SKU or generic)')
  }
  return kept
}


// ── Lift identité depuis specs / structuredData / markdown ──────────────────
// Les identifiants (nom, marque, modèle, refs distributeur/fabricant, EAN)
// arrivent par 3 canaux selon le site/scraping :
//   1. JSON-LD Schema.org (parseStructuredDataAny) → name/brand/sku/mpn/gtin
//   2. Specs parsées depuis le markdown (KEY/VALUE)
//      → chips Rubix-style "BOSCH : GBH 5-40 DCE", "RUBIX : 0136-5035407",
//        "FABRICANT : 0611264000", "EAN : 3165140461214"
//   3. Markdown H1 (fallback quand JSON-LD absent)
// Cette fonction promeut ces signaux en champs distincts d'EnrichedProduct
// pour qu'ils apparaissent comme colonnes Excel séparées (ai_name, ai_brand,
// ai_model, ai_distributor_ref, ai_manufacturer_ref, ai_ean) plutôt que

function sanitizeEnriched(enriched: EnrichedProduct, productIds: string[] = []): EnrichedProduct {
  // Description : vider si c'est du cookie/GDPR (court ou long) ou du nav/footer
  let description = enriched.description
  if (description && (isGarbageContent(description) || isMainlyGarbage(description))) {
    debugLog('[sanitize] garbage description detected, clearing')
    description = ''
  }
  if (description && isNavLikeDescription(description)) {
    debugLog('[sanitize] nav/footer description detected, clearing')
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
        // Ligne-image markdown résiduelle (« !Farelek Télécommande… ») et
        // boilerplate ligne à ligne (galerie, réassurance enseigne, CGV) :
        // la synthèse LLM recopie parfois ces lignes autour du vrai paragraphe.
        if (t.startsWith('!')) return false
        if (isGarbageContent(t)) return false
        return true
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (cleaned !== description) {
      debugLog('[sanitize] stripped document/URL lines from description')
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
  // Pré-passe : re-découper les méga-specs « Caractéristiques = toute la table
  // inline » (sortie LLM dégradée) en paires individuelles — les paires issues
  // du découpage repassent ensuite par TOUS les filtres ci-dessous.
  const preSpecs: EnrichedProduct['specifications'] = []
  for (const s of enriched.specifications) {
    if (MEGA_SPEC_NAME_RE.test(s.name.trim())) {
      const split = splitMegaSpecValue(s.value)
      if (split.length >= 3) {
        debugLog('[sanitize] mega-spec «', s.name, '» re-découpée en', split.length, 'paires')
        preSpecs.push(...split.map((p) => ({ ...p, group: s.group })))
        continue
      }
    }
    preSpecs.push(s)
  }

  const keptSpecs: EnrichedProduct['specifications'] = []
  const rejectedSpecs: EnrichedProduct['specifications'] = []
  for (const s of preSpecs) {
    // Sentinelles internes recrachées par le LLM : jamais une spec.
    if (/JINA_EXTRACTED_/.test(s.name) || /JINA_EXTRACTED_/.test(s.value)) { rejectedSpecs.push(s); continue }
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
    // Liens markdown splittés : `[Texte](https` côté name + `//www....html)` côté value.
    // Vient des menus de navigation aspirés par Jina avec URLs splittées sur 2 lignes.
    // S'applique APRÈS toutes les autres extractions (LLM, manufacturer build,
    // markdown parser) — dernière ligne de défense indépendante du chemin.
    if (s.name.includes('](') || s.value.includes('](')) {
      rejectedSpecs.push(s); continue
    }
    if (/^\/\/[a-z0-9]/i.test(s.value.trim())) {
      rejectedSpecs.push(s); continue
    }
    if (/\.(html?|php|asp|aspx|jsp)\)?\s*$/i.test(s.value.trim())) {
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
    debugLog('[sanitize] ⚠ dropping ALL', keptSpecs.length, 'specs — manual/safety content (', safetyHits, 'hits)')
    finalKept = []
  }
  if (rejectedSpecs.length > 0 || finalKept.length < keptSpecs.length) {
    debugLog('[sanitize] filtered', rejectedSpecs.length + (keptSpecs.length - finalKept.length), 'junk specs; kept', finalKept.length)
    debugLog('[sanitize] REJECTED specs (sample 20):', rejectedSpecs.slice(0, 20).map(s => ({ name: s.name.slice(0, 40), value: s.value.slice(0, 40), group: s.group })))
    debugLog('[sanitize] KEPT specs:', finalKept.map(s => ({ name: s.name, value: s.value.slice(0, 60), group: s.group })))
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
      description: 'Le paragraphe descriptif de la SOURCE recopié VERBATIM (mot pour mot) — ne rédige jamais ton propre texte, ne résume pas, ne reformule pas. Conserve les retours à la ligne de la source (paragraphes, listes).',
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


// ── Jina Reader — scraping principal ────────────────────────────────────────

/**
 * Recherche web. Essaie d'abord s.jina.ai (API dédiée, meilleurs résultats si clé)
 * puis DuckDuckGo Lite via r.jina.ai (gratuit, sans clé) en fallback.
 */
export async function jinaSearch(query: string, limit = 10): Promise<SearchResult[]> {
  debugLog('[jina-search] →', { query, limit })
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
      debugLog('[jina-search] [s.jina.ai] parsed', results.length, 'results')
      recordScrapeUsage({ platform: 'jina', tokens: results.length * 500 })
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
    throw new Error(t('err.enr.webSearchFailed', { status: res.status, body: body.slice(0, 200) }))
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

  debugLog('[jina-search] [ddg-lite] parsed', results.length, 'results:', results.map((r) => r.url))
  return results
}




export async function enrichProductCore(
  input: EnrichmentInput,
  onRunning?: (b: boolean) => void,
): Promise<EnrichedProduct | null> {
  const t0 = Date.now()
  const label = [input.title, input.brand].filter(Boolean).join(' ') || input.knownUrl || input.rowId
  const finish = (status: 'success' | 'error', error?: string) => {
    const { logs, entries } = useEnrichmentStore.getState()
    const key = enrichmentKey(input.sheetName, input.rowId)
    recordPipelineRun({
      module: 'enrichment',
      label,
      status,
      durationMs: Date.now() - t0,
      error: error ?? entries[key]?.error ?? undefined,
      steps: logs[key],
      meta: { sheetName: input.sheetName, rowId: input.rowId, knownUrl: input.knownUrl ?? null },
    })
  }
  try {
    const product = await enrichProductCoreInner(input, onRunning)
    finish(product ? 'success' : 'error')
    return product
  } catch (err) {
    finish('error', err instanceof Error ? err.message : String(err))
    throw err
  }
}

async function enrichProductCoreInner(
  input: EnrichmentInput,
  onRunning?: (b: boolean) => void,
): Promise<EnrichedProduct | null> {
  const { setProgress, setData, setError, setLlmRequest, setLlmUsed, getScrapeCache, setScrapeCache, clearScrapeCache, addLog, clearLogs } = useEnrichmentStore.getState()
  const setRunning = onRunning ?? (() => {})
  {
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
        debugLog('[enrichment] START', { sheetName, rowId, title, brand, reference: reference ?? sku, knownUrl })
        log(`Démarrage — ${title} ${brand ?? ''}`)
        // ── Étape 0 : Vérifier le cache scraping (Re-générer réutilise les mêmes données) ──
        let cached = getScrapeCache(sheetName, rowId)
        // Invalide le cache si le markdown est en fait une page CAPTCHA / challenge
        // bot → force un nouveau scrape pour tenter Firecrawl HTML mode.
        if (cached?.markdownContent && looksLikeBotChallenge(cached.markdownContent)) {
          debugLog('[enrichment] ⚠ cached markdown is CAPTCHA/challenge — invalidating cache')
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
            debugLog('[enrichment] ⚠ cache URL', cached.productUrl, 'is NOT manufacturer site for brand', brand, '— invalidating cache for fresh search')
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
            debugLog('[enrichment] ★ using scrape cache →', { url: productUrl, specs: cachedSpecCount, mdLen: cached.markdownContent?.length })
            log(`Cache réutilisé — ${cachedSpecCount} specs, ${cached.markdownContent?.length ?? 0} chars`)
          } else {
            // Cache pauvre — garder l'URL mais re-scraper
            productUrl = cached.productUrl
            additionalSources = cached.additionalSources
            usedCache = false
            debugLog('[enrichment] ⚠ cache has only', cachedSpecCount, 'specs — will re-scrape and try fallbacks')
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
              if (junk) debugLog('[enrichment] rejecting junk URL:', r.url)
              return !junk
            })
            if (clean.length === 0) return false
            const scored = clean
              .map((r) => ({ r, score: scoreResult(r, sourceTokens, brand, reference ?? sku) }))
              .sort((a, b) => b.score - a.score)
            debugLog('[enrichment] scored results:', scored.map((s) => ({ url: s.r.url, score: s.score })))
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
              debugLog('[enrichment] [Jina] trying search query:', q)
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
            debugLog('[enrichment] ⚠ using fallback pick (score ≤ 0) →', fallbackBox.current.url, 'score:', fallbackBox.current.score)
            log(`⚠ Filet de secours : ${fallbackBox.current.url} (score ${fallbackBox.current.score})`)
          }

          const finalPick = pickBox.current
          if (finalPick) {
            productUrl = finalPick.url
            additionalSources = finalPick.extras
            debugLog('[enrichment] ✓ final pick →', { url: productUrl, score: finalPick.score, query: finalPick.query })
            log(`✓ URL trouvée : ${productUrl} (score ${finalPick.score})`)
          }

          // ── Essai final fabricant : si finalPick n'est pas un site fabricant ──
          // mais la marque est connue, essayer une dernière recherche ultra-ciblée
          if (finalPick && brandSlug && Object.keys(MANUFACTURER_DOMAINS).includes(brandSlug)) {
            const isAlreadyManufacturer = detectManufacturerSite(finalPick.url)
            if (!isAlreadyManufacturer) {
              debugLog('[enrichment] ⚡ best pick is NOT manufacturer site — trying final manufacturer probe for', brandSlug)
              log(`URL n'est pas le site fabricant — recherche sur site officiel ${brandSlug}…`)
              const mfrDomains = MANUFACTURER_DOMAINS[brandSlug]
              if (mfrDomains) {
                const modelFromTitle = title.match(/[A-Z]{1,5}[\-\s]?\d{1,4}[\w\-]*/i)?.[0] ?? ''
                const probeTerms = ref || modelFromTitle || title
                for (const domain of mfrDomains) {
                  try {
                    const probeQuery = `${probeTerms} site:${domain}`
                    debugLog('[enrichment] [manufacturer-probe] trying:', probeQuery)
                    const probeResults = await jinaSearch(probeQuery, 5)
                    const probeClean = probeResults.filter((r) => !isJunkUrl(r.url))
                    const probeMfr = probeClean.filter((r) => detectManufacturerSite(r.url))
                    if (probeMfr.length > 0) {
                      const scored = probeMfr
                        .map((r) => ({ r, score: scoreResult(r, sourceTokens, brand, reference ?? sku) }))
                        .sort((a, b) => b.score - a.score)
                      if (scored[0].score > 0) {
                        // Remplacer le pick par le résultat fabricant — mettre l'ancien dans extras
                        debugLog('[enrichment] ✓ manufacturer probe found:', scored[0].r.url, 'score:', scored[0].score)
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

                  // Identité depuis template : champs explicites du template
                  // (title/brand/reference/ean) en priorité, lift sur specs en
                  // fallback (template peut avoir extrait des chips Rubix-style
                  // dans les specs sans les nommer explicitement).
                  const templateSpecs = applied.specGroups.flatMap((g) => g.pairs.map((p) => ({ ...p, group: g.group })))
                  const templateStructuredFallback: StructuredProductData = {
                    name: toStr(f.title) || toStr(f.name) || undefined,
                    brand: toStr(f.brand) || undefined,
                    sku: toStr(f.sku) || toStr(f.reference) || undefined,
                    mpn: toStr(f.mpn) || undefined,
                    gtin: toStr(f.ean) || toStr(f.gtin) || undefined,
                    images: [],
                    specs: [],
                  }
                  const { identity: templateIdentity, specs: templateSpecsAfterLift } = buildIdentity({
                    structured: templateStructuredFallback,
                    specs: templateSpecs,
                    markdown: null,
                    inputTitle: toStr(f.title),
                    inputBrand: toStr(f.brand),
                    inputReference: toStr(f.reference) || toStr(f.sku),
                  })

                  const rawBuilt: EnrichedProduct = {
                    ...templateIdentity,
                    description: toStr(f.description),
                    advantages,
                    specifications: templateSpecsAfterLift,
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
              // Opt-in PDFs : lu depuis localStorage, défini par l'utilisateur
              // dans les options avancées de ScrapeTab. Désactivé par défaut.
              const includePdfs = typeof window !== 'undefined'
                && window.localStorage.getItem('ds-scrape-include-pdfs') === '1'
              log(`Multi-URL bundle (X-Engine: browser + onglets auto${includePdfs ? ' + PDFs' : ''}) → ${productUrl}`)
              const bundle = await scrapeProductBundle(productUrl, {
                deepScrape: async (url) => {
                  const r = await jinaScrapeMaufacturerPage(url)
                  return r ? { markdown: r.markdown, html: r.html } : null
                },
                fastScrape: (url) => jinaScrapeMarkdown(url),
                log,
                includePdfs,
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
                debugLog('[enrichment] structured-data:', structuredData)
              }
            }
            ;(globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured = structuredData
          } catch (err) {
            console.warn('[enrichment] scrape failed', err)
            log(`✗ Scrape échec : ${String(err).slice(0, 200)}`)
          }
          if (markdownContent) {
            debugLog('[enrichment] markdown preview (first 3000 chars):\n', markdownContent.slice(0, 3000))
          }

          // ── Repli SUR LA MÊME URL : le rendu « deep » (navigateur, onglets) peut
          //    renvoyer un état PARTIEL sur les SPA anti-bot (JSON-LD/specs logistiques
          //    mais PAS la prose de description), alors que le GET simple Jina la
          //    contient. Si la description manque, on retente jinaScrapeMarkdown et on
          //    garde la version qui a la prose (les specs des deux se fusionnent en aval).
          if (productUrl && parseDescriptionFromMarkdown(markdownContent || '').length < 30) {
            try {
              const simpleMd = await jinaScrapeMarkdown(productUrl)
              if (simpleMd && parseDescriptionFromMarkdown(simpleMd).length >= 30) {
                log('✓ Repli GET simple Jina — la description manquait au rendu deep')
                debugLog('[enrichment] deep render sans description → bascule sur jinaScrapeMarkdown (même URL)')
                markdownContent = scoreMd(simpleMd) >= scoreMd(markdownContent)
                  ? simpleMd
                  : `${markdownContent ?? ''}\n\n${simpleMd}` // fusion si le deep avait d'autres specs
              }
            } catch { /* ignorer */ }
          }

          // ── Fallback : si le markdown est trop court/pauvre, essayer des sources alternatives ──
          const primaryScore = scoreMd(markdownContent)
          debugLog('[enrichment] primary markdown score:', primaryScore, '(', markdownContent?.length ?? 0, 'chars)')
          log(`Score qualité markdown : ${primaryScore} (specs×3 + avantages×2)`)
          if (primaryScore < 10 && additionalSources.length > 0) {
            debugLog('[enrichment] ⚡ primary scrape insufficient (score', primaryScore, '), trying alternatives…')
            log(`Score trop faible — test de ${additionalSources.length} source(s) alternative(s)…`)
            for (const altUrl of additionalSources.slice(0, 3)) {
              try {
                const altMd = await jinaScrapeMarkdown(altUrl)
                const altScore = scoreMd(altMd)
                debugLog('[enrichment] alt source:', altUrl, '→ score', altScore, '(', altMd?.length ?? 0, 'chars)')
                if (altScore > primaryScore) {
                  debugLog('[enrichment] ✓ alternative source is better:', altUrl)
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
            debugLog('[enrichment] ⚠ bot challenge detected in markdown, forcing fallback')
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
                  debugLog('[enrichment] firecrawl score:', fcScore, '(', fcSanitized.length, 'chars)', fcIsChallenge ? '⚠ challenge' : '')
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
                debugLog('[enrichment] brightdata score:', bdScore, '(', bdSanitized.length, 'chars)', bdIsChallenge ? '⚠ challenge' : '')
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
                  ;(globalThis as unknown as { __antiBotBlocked?: boolean }).__antiBotBlocked = false
                  // BD a parsé le JSON-LD/microdata du HTML brut (avant Turndown
                  // qui supprime les <script>). Si le fetch parallèle initial a
                  // échoué (souvent le cas en anti-bot Akamai/DataDome), on
                  // promeut la donnée structurée BD vers __lastStructured pour
                  // alimenter l'identité (name, brand, sku=model, mpn, gtin).
                  const existingStructured = (globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured
                  if (bdResult.structuredData && (!existingStructured || (
                    !existingStructured.name && !existingStructured.brand && existingStructured.specs.length === 0
                  ))) {
                    ;(globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured = bdResult.structuredData
                    const fields = [
                      bdResult.structuredData.name && 'name',
                      bdResult.structuredData.brand && 'brand',
                      bdResult.structuredData.sku && 'sku',
                      bdResult.structuredData.gtin && 'gtin',
                      bdResult.structuredData.mpn && 'mpn',
                    ].filter(Boolean).join(', ')
                    if (fields) log(`✓ JSON-LD extrait du HTML BD : ${fields}`)
                  }
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
            debugLog('[enrichment] ⚠ markdown is still CAPTCHA after all fallbacks — clearing to prevent hallucination')
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
                    debugLog('[enrichment] manufacturer score:', mfgScore, '(', mfgSanitized.length, 'chars)')
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
          debugLog('[enrichment] ⚡ only', currentSpecCount, 'specs — trying HTML fallback for accordion/hidden content…')
          log(`Seulement ${currentSpecCount} specs — fallback HTML (accordéons/contenus cachés)…`)
          setProgress(sheetName, rowId, {
            status: 'scraping',
            message: `Extraction des accordéons et contenus cachés…`,
          })
          try {
            const htmlMd = await scrapeHtmlFallback(productUrl)
            if (htmlMd) {
              const htmlSpecs = parseSpecsFromMarkdown(htmlMd).length
              debugLog('[enrichment] HTML fallback →', htmlSpecs, 'specs (', htmlMd.length, 'chars)')
              if (htmlSpecs > currentSpecCount) {
                markdownContent = (markdownContent ?? '') + '\n\n' + htmlMd
                debugLog('[enrichment] ✓ merged HTML fallback →', markdownContent.length, 'chars total')
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
          debugLog('[enrichment] ★ scrape cache saved for', enrichmentKey(sheetName, rowId))
        }

        // ── Étape 3 : Construction depuis les données scrapées ────────
        let enriched: EnrichedProduct

        // ══ PATH FABRICANT : scraping pur (AUCUN LLM) ═════════════════
        // Si le produit est sur un site fabricant officiel, on combine
        // le markdown Jina (bullet points, description) + données brutes
        // (REDUX_STORE, JSON-LD) pour les PDFs, variants, images.
        const manufacturerBrand = productUrl ? detectManufacturerSite(productUrl) : null
        if (manufacturerBrand && productUrl) {
          debugLog('[enrichment] ★ MANUFACTURER SITE DETECTED:', manufacturerBrand, '— pure scraping mode')
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

          debugLog('[enrichment] ★ MANUFACTURER BUILD RESULT:', {
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
            debugLog('[enrichment] ⚠ manufacturer scraping insufficient (', mfrBuild.specifications.length, 'specs) — falling back to LLM boost')
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
              // Nettoyer nav/cookies AVANT la coupe : sur les sites à méga-menu
              // (Makita & co) les 20k premiers chars sont du menu — le contenu
              // produit (specs, EAN, sous-titre) n'atteignait jamais le LLM.
              const cleanedMd = stripInternalSentinels(sanitizeJinaMarkdown(markdownContent))
              mfrDataSections.push(`## Contenu de la page produit (markdown rendu)\n${cleanedMd.slice(0, 20000)}`)
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
1. Description : EXTRAIS verbatim le paragraphe descriptif principal de la page — copie EXACTE mot pour mot, structure préservée (retours à la ligne, listes), NE RÉDIGE PAS, NE RÉSUME PAS, NE REFORMULE PAS
2. Avantages : REPRENDS les avantages scrapés ci-dessus + extrais ceux du markdown, chaque puce recopiée EXACTEMENT telle qu'écrite (verbatim)
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

            // Identité : `mfrBuild` la porte déjà (buildManufacturerProduct
            // appelle buildIdentity). On la propage et on lifte les nouveaux
            // specs LLM au cas où l'IA aurait extrait l'identité (Marque/EAN…).
            const { identity: mfrIdentity, specs: mfrSpecsAfterLift } = buildIdentity({
              structured: (globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured ?? null,
              specs: mergedSpecs,
              markdown: markdownContent,
              inputTitle: title,
              inputBrand: brand || manufacturerBrand,
              inputReference: reference ?? sku,
            })

            enriched = {
              ...mfrIdentity,
              subtitle: mfrBuild.subtitle,
              breadcrumb: mfrBuild.breadcrumb,
              description: mfrAi.description || mfrBuild.description,
              advantages: mergedAdvantages,
              specifications: mfrSpecsAfterLift,
              variants: mergedVariants,
              images: mfrBuild.images, // garder les images scrapées
              imageClassOverrides: mfrBuild.imageClassOverrides,
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
        // ── Passe HTML BRUT universelle (parité fabricant/retailer) ──────────
        // Même arsenal que les sites fabricants — REDUX / JSON-LD maison /
        // NEXT_DATA / tables DOM / PDFs / breadcrumb / pictos — pour TOUS les
        // sites : la qualité de fiche ne dépend plus du type de site détecté.
        // HTML via CF fetchPageHtml → repli Jina HTML (WAF filtrant par IP).
        const emptyRawData: ManufacturerData = {
          downloads: [], variants: [], images: [], specs: [], description: '', breadcrumb: [], pictoUrls: [], advantages: [], structured: null,
        }
        let rawData = emptyRawData
        if (productUrl) {
          log(`Extraction HTML brut (JSON-LD, tables DOM, PDFs)…`)
          rawData = await scrapeManufacturerRawData(productUrl).catch(() => emptyRawData)
        }
        if (rawData.specs.length || rawData.downloads.length || rawData.images.length) {
          log(`HTML brut : ${rawData.specs.length} specs, ${rawData.downloads.length} PDFs, ${rawData.images.length} images`)
        }
        const hasRawSpecs = rawData.specs.length >= 3
        // Donnée structurée riche = JSON-LD ou microdata avec assez d'infos pour
        // construire un produit utile sans LLM. Utile quand markdown est vide
        // (DataDome bloque Jina/Firecrawl markdown mais le HTML contient JSON-LD).
        const hasRichStructured = !!(structuredEarly && (
          (structuredEarly.description && structuredEarly.description.length > 50) ||
          structuredEarly.specs.length >= 3 ||
          structuredEarly.images.length >= 3
        ))
        const hasMarkdown = !!(markdownContent && markdownContent.length > 200)

        if (hasMarkdown || hasRichStructured || hasRawSpecs) {
          const mdSpecs = hasMarkdown ? parseSpecsFromMarkdown(markdownContent!) : []
          // Avantages : markdown + HTML statique en fusion additive (parité
          // fabricant/retailer — même complétion des listes repliées).
          const mdAdvantages = mergeAdvantagesAdditive(
            hasMarkdown ? parseAdvantagesFromMarkdown(markdownContent!) : [],
            rawData.advantages,
          )
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

          // Specs du HTML brut (tables DOM / état embarqué) — additives, dédup par nom.
          if (rawData.specs.length > 0) {
            const namesSeen = new Set(mdSpecs.map(s => s.name.toLowerCase()))
            mdSpecs.push(...rawData.specs.filter(sp => !namesSeen.has(sp.name.toLowerCase())))
          }
          debugLog('[enrichment] parseDescriptionFromMarkdown returned:', mdDescription.length, 'chars. First 200:', JSON.stringify(mdDescription.slice(0, 200)))

          if (!mdDescription || mdDescription.length < 30) {
            const h1Match = markdownContent?.match(/^#\s+(.+)/m)
            if (h1Match) {
              mdDescription = h1Match[1].replace(/\*\*/g, '').trim()
              debugLog('[enrichment] mdDescription < 30 → fallback H1:', JSON.stringify(mdDescription))
            }
          }

          debugLog('[enrichment] direct build attempt:', { specs: mdSpecs.length, advantages: mdAdvantages.length, descLen: mdDescription.length, hasMarkdown, hasRichStructured })

          // Seuil abaissé quand structured-data ou HTML brut riche : 3 specs
          // suffisent (vs 5 pour markdown-only) car la donnée est de meilleure qualité.
          const minSpecs = (hasRichStructured || hasRawSpecs) ? 3 : 5
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
            const sourceImages = [...structuredImages, ...directImages, ...rawData.images]
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

            // Documents du HTML brut (PDFs REDUX/DOM) — additifs, dédup par URL.
            for (const d of rawData.downloads) {
              if (!directDocsSeen.has(d.url)) {
                directDocsSeen.add(d.url)
                directDocuments.push(buildDocument(d.url, d.name))
              }
            }
            directBuild = {
              description: mdDescription,
              advantages: mdAdvantages,
              specifications: mdSpecs,
              variants: mdVariants,
              documents: directDocuments,
              images: [...new Set(mergedDirectImages)],
              pricing: mdPricing ?? undefined,
            }
            debugLog('[enrichment-images-direct] structured=', structuredImages.length, 'direct=', directImages.length, 'merged=', mergedDirectImages.length, 'final=', directBuild.images?.length, 'sample:', directBuild.images?.slice(0, 3))
            debugLog('[enrichment] ★ markdown direct build succeeded')
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
          debugLog('[enrichment] ★ DIRECT BUILD — bypassing LLM entirely')
          log(`★ Build direct (sans IA) — ${directBuild.specifications?.length ?? 0} specs, ${directBuild.advantages?.length ?? 0} avantages`)
          setProgress(sheetName, rowId, {
            status: 'reasoning',
            message: 'Construction directe depuis les données scrapées (sans IA)…',
          })

          // Identité (name/brand/model/refs/EAN) — JSON-LD prioritaire, lift
          // depuis specs Rubix-style en fallback, H1 markdown pour name si
          // toujours rien. Les specs liftées sont retirées pour éviter la
          // duplication "Marque" dans ai_specifications + ai_brand.
          const directStructured = (globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured ?? null

          // Images : markdown/DOM + JSON-LD (schema.org `image`) en ADDITIF —
          // sur les retailers dont seul le JSON-LD porte les visuels (Castorama),
          // les ignorer laissait la fiche sans aucune image.
          const directSdImages = (directStructured?.images ?? [])
            .filter((u) => /^https?:\/\//.test(u) && !isJunkImageUrl(u))
          const mergedImages = Array.from(new Set(
            [...(directBuild.images ?? []), ...directSdImages].map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u)),
          ))
          const { identity: directIdentity, specs: directSpecsAfterLift } = buildIdentity({
            structured: directStructured,
            specs: directBuild.specifications ?? [],
            markdown: markdownContent,
            inputTitle: title,
            inputBrand: brand,
            inputReference: reference ?? sku,
          })

          // Description : logique UNIQUE partagée (JSON-LD propre → repli markdown
          // garanti → descriptionRich). Sans ça, ce chemin direct-build (sites
          // JSON-LD riches type Jardiland) sortait sans description ni version riche.
          const { description: directDesc, descriptionRich: directRich } = finalizeDescription(
            directBuild.description || directStructured?.description || rawData.description || '',
            markdownContent,
          )
          enriched = {
            ...directIdentity,
            breadcrumb: rawData.breadcrumb.length > 0 ? rawData.breadcrumb : undefined,
            description: directDesc,
            descriptionRich: directRich,
            advantages: directBuild.advantages ?? [],
            specifications: directSpecsAfterLift,
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
            debugLog('[enrichment] anti-bot blocked + no structured data → returning empty product, skipping LLM')
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
          // ZONE PRODUIT (liste blanche DOM) en TÊTE : description et avantages
          // doivent venir d'ICI — le markdown complet (dessous) sert aux specs,
          // variantes et documents, mais son footer/login n'est jamais du produit.
          if (rawData.productScopeText) {
            dataSections.push(`## ZONE PRODUIT (extraite du DOM — description et avantages viennent EXCLUSIVEMENT d'ici)\n${rawData.productScopeText}`)
          }
          if (markdownContent) {
            // sanitize + strip des sentinelles internes : le LLM ne doit JAMAIS
            // voir JINA_EXTRACTED_* (il les recrache dans les specs) ni le nav/cookies.
            dataSections.push(`## Contenu de la page produit (markdown rendu)\n${stripInternalSentinels(sanitizeJinaMarkdown(markdownContent)).slice(0, 20000)}`)
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
10. Si une section « ZONE PRODUIT » est présente : description et avantages viennent EXCLUSIVEMENT d'elle. Tout ce qui n'y figure pas (promesses de l'enseigne, newsletter, compte client, paiement, mentions légales) n'est JAMAIS un avantage ni une description.

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
1. Description : EXTRAIS verbatim le paragraphe descriptif principal de la page — copie EXACTE mot pour mot, structure préservée (retours à la ligne, listes), NE RÉDIGE PAS, NE RÉSUME PAS, NE REFORMULE PAS
2. Avantages : extrais TOUS les points forts / avantages du markdown, chaque puce recopiée EXACTEMENT telle qu'écrite (verbatim)
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
- Si une section « ZONE PRODUIT » est présente : description et avantages viennent EXCLUSIVEMENT d'elle — le reste de la page (promesses enseigne, newsletter, compte, paiement, légal) n'est JAMAIS du contenu produit

Réponds UNIQUEMENT via l'outil emit_response.`
            : `Tu es un expert produit. Le scraping de la page web n'a pas donné de contenu exploitable.
À partir de tes connaissances sur ce produit et la marque, génère une fiche produit complète.

## Produit à identifier
${sourceContext}
${hasSomeData ? '\n' + dataSections.join('\n\n') : ''}

## CE QUE TU DOIS FAIRE
1. Description : le paragraphe descriptif de la SOURCE recopié verbatim (mot pour mot) — NE RÉDIGE PAS, NE RÉSUME PAS, NE REFORMULE PAS
2. Avantages : les points forts / avantages tels qu'écrits par la source, chaque puce recopiée EXACTEMENT (verbatim)
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
          // JSON-LD (schema.org `image`) en ADDITIF — même raison que PATH A :
          // sur certains retailers seul le JSON-LD porte les visuels produit.
          const llmSdImages = (((globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured)?.images ?? [])
            .filter((u) => /^https?:\/\//.test(u) && !isJunkImageUrl(u))
          const mergedImages: string[] = Array.from(new Set([
            ...(mdImages.length > 0 ? [...mdImages, ...llmImages] : llmImages),
            ...llmSdImages,
            ...rawData.images.filter((u) => /^https?:\/\//.test(u) && !isJunkImageUrl(u)),
          ]))
          debugLog('[enrichment-images] PATH=B(LLM) mdImages=', mdImages.length, 'llmImages=', llmImages.length, 'sdImages=', llmSdImages.length, 'merged=', mergedImages.length, 'sample:', mergedImages.slice(0, 3))

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
          // Documents du HTML brut (PDFs REDUX/DOM) — parité avec la voie fabricant.
          for (const d of rawData.downloads) pushDoc(buildDocument(d.url, d.name))

          const llmVariants: Array<{ reference: string; label: string; properties: Record<string, string> }> =
            Array.isArray(ai.variants) ? ai.variants.filter(
              (v: unknown) => v && typeof v === 'object' && typeof (v as Record<string, unknown>).reference === 'string'
            ) : []
          if (llmVariants.length > 0) {
            debugLog('[enrichment] LLM extracted', llmVariants.length, 'variants')
          }

          // Identité (name/brand/model/refs/EAN) — même stratégie que PATH A :
          // JSON-LD prioritaire puis lift depuis specs Rubix-style, fallback
          // sur le H1 markdown ou les inputs utilisateur.
          const llmStructured = (globalThis as unknown as { __lastStructured?: StructuredProductData | null }).__lastStructured ?? null
          // Specs du HTML brut (tables DOM / état embarqué) — additives, dédup
          // par nom : parité avec la voie fabricant, le LLM ne gate jamais la
          // complétude des specs scrapées déterministiquement.
          const llmSpecsWithRaw = [...ai.specifications]
          {
            const namesSeen = new Set(llmSpecsWithRaw.map((s: { name: string }) => s.name.toLowerCase()))
            for (const sp of rawData.specs) {
              if (!namesSeen.has(sp.name.toLowerCase())) llmSpecsWithRaw.push(sp)
            }
          }
          const { identity: llmIdentity, specs: llmSpecsAfterLift } = buildIdentity({
            structured: llmStructured,
            specs: llmSpecsWithRaw,
            markdown: markdownContent,
            inputTitle: title,
            inputBrand: brand,
            inputReference: reference ?? sku,
          })

          enriched = {
            ...llmIdentity,
            breadcrumb: rawData.breadcrumb.length > 0 ? rawData.breadcrumb : undefined,
            description: ai.description,
            advantages: (ai.advantages as string[]).map(text => ({ text })),
            specifications: llmSpecsAfterLift,
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
    }
  }

/**
 * Hook PIM : wrappe enrichProductCore avec l'état `running` (spinner UI) + reset/hardReset.
 * Le moteur lui-même vit dans enrichProductCore (réutilisé headless par le node workflow).
 */
export function useProductEnrichment() {
  const { clear, clearScrapeCache } = useEnrichmentStore()
  const [running, setRunning] = useState(false)

  const enrich = useCallback(
    (input: EnrichmentInput) => enrichProductCore(input, setRunning),
    [],
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
