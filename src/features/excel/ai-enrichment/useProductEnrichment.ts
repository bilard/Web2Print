import { useCallback, useState } from 'react'
import { getApiKey } from '@/lib/apiKeys'
import { generateJson } from '@/features/ai/llmRouter'
import { useEnrichmentStore } from './enrichmentStore'
import type { EnrichedProduct } from './types'
import { enrichmentKey } from './types'
import { scrapeProductBundle } from './scrapeBundle'
import { enrichedProductSchema, enrichedProductJsonSchema } from './schemas'
import { extractPrimaryImagesFromHtml, extractProductPrice, extractBreadcrumbFromHtml } from './htmlExtractors'
import {
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
import {
  jinaSearch,
  jinaScrapeMarkdown,
  scrapeHtmlFallback,
  fetchAndExtractFromRawHtml,
} from './jinaClient'
import {
  enrichWithMarkdownGroups,
  sanitizeEnriched,
  cleanDocumentName,
  deduplicateDocuments,
  parseCleanSpecsFromJinaBlock,
  parseDescriptionFromMarkdown,
  isMainlyGarbage,
} from './postProcess'
import { deriveVariantDiscriminants } from './deriveVariantDiscriminants'
import { enrichVariantsFromMarkdown } from './enrichVariantsFromMarkdown'
import {
  jinaScrapeMaufacturerPage,
  scrapeManufacturerRawData,
  buildManufacturerProduct,
} from './manufacturerScraper'
import { extractSpecsBlockFromHtml } from './htmlSpecsExtractor'

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

// Post-processing helpers (enrichWithMarkdownGroups, sanitizeEnriched,
// cleanDocumentName, parseDescriptionFromMarkdown, parseCleanSpecsFromJinaBlock,
// deduplicateDocuments, isMainlyGarbage, mergeGroupsIntoAdvantages,
// extractNameFromUrl, humanizeName, GENERIC_DOC_NAMES_RE) ont été extraits
// vers ./postProcess.ts.


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

        // ── Étape 1 : Trouver la page produit ─────────────────────────────
        let productUrl: string | null = knownUrl ?? null
        let additionalSources: string[] = []
        let searchErrorMsg: string | null = null

        // Cache scraping : réutiliser le markdown Jina déjà récupéré pour cette ligne.
        // Invalidé par reset(), si l'URL connue a changé, ou si le cache contient
        // zéro spec utile (scrape raté → on redonne sa chance à Jina sans forcer un Reset manuel).
        const cached = getScrapeCache(sheetName, rowId)
        const cachedSpecCount = cached?.markdownContent
          ? parseSpecsFromMarkdown(cached.markdownContent).length
          : 0
        // Détection 404 du cache : si la page cachée est "introuvable", invalider
        // pour forcer une nouvelle recherche. Évite de boucler sur un mauvais URL.
        const NOT_FOUND_RE_CACHE = /\b(introuvable|not\s*found|page\s*(non\s*)?(trouv[eé]e|introuvable)|page\s*not\s*found|404\b|indisponible|no\s*longer\s*available)\b/i
        const cachedIsNotFound = cached?.markdownContent
          ? NOT_FOUND_RE_CACHE.test(cached.markdownContent.slice(0, 1500).toLowerCase())
          : false
        const cacheValid = cached?.markdownContent
          && cached.markdownContent.length > 200
          && cachedSpecCount >= 3
          && !cachedIsNotFound
          && (!knownUrl || knownUrl === cached.productUrl)
        let usedCache = false
        if (cacheValid && cached) {
          productUrl = cached.productUrl
          additionalSources = cached.additionalSources ?? []
          usedCache = true
          console.log('[enrichment] ♻️ using cached scrape for', productUrl, '(', cached.markdownContent?.length, 'chars,', cachedSpecCount, 'specs)')
          log(`♻️ Cache scraping utilisé (${cached.markdownContent?.length} chars, ${cachedSpecCount} specs, ${cached.sourcesScrapped?.length ?? 1} source(s))`)
        } else if (cached) {
          const reason = cachedIsNotFound ? 'page 404 "introuvable"' : `${cachedSpecCount} specs (trop pauvre)`
          console.log('[enrichment] ⚠️ cache ignoré (', reason, ')')
          log(`⚠️ Cache ignoré (${reason} — re-scrape)`)
          // Cache pourri : l'effacer pour ne pas réessayer à chaque Re-générer
          clearScrapeCache(sheetName, rowId)
        }

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
            // Réécriture locale FR avant scoring : si une page US/EN a un équivalent /fr/,
            // on score la version française (meilleure pour les marques multi-locale).
            const normalized = results.map((r) => ({ ...r, url: preferFrenchUrl(r.url) }))
            const clean = normalized.filter((r) => {
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
        // Hydratation depuis le cache si disponible (évite de re-solliciter Jina).
        let markdownContent: string | null = usedCache ? (cached?.markdownContent ?? null) : null
        let primaryHtml: string | null = usedCache ? (cached?.primaryHtml ?? null) : null

        // Cache pré-fix : le bloc JINA_EXTRACTED_SPECS peut avoir manqué des
        // lignes (première ligne <th>label</th><td>val</td> droppée). On
        // ré-extrait localement depuis le HTML caché avec l'extracteur corrigé
        // — zéro appel Jina, pas de coût token.
        if (usedCache && primaryHtml && markdownContent) {
          const freshBlock = extractSpecsBlockFromHtml(primaryHtml)
          if (freshBlock) {
            const start = markdownContent.indexOf('JINA_EXTRACTED_SPECS_START')
            const endTag = 'JINA_EXTRACTED_SPECS_END'
            const end = markdownContent.indexOf(endTag)
            if (start >= 0 && end > start) {
              const freshCount = (freshBlock.match(/ = /g) ?? []).length
              const staleCount = (markdownContent.slice(start, end).match(/ = /g) ?? []).length
              if (freshCount > staleCount) {
                markdownContent = markdownContent.slice(0, start) + freshBlock + markdownContent.slice(end + endTag.length)
                console.log('[enrichment] ♻️ JINA block refreshed from cached HTML (', staleCount, '→', freshCount, 'specs)')
                log(`♻️ Bloc specs rafraîchi depuis HTML en cache (${staleCount} → ${freshCount} specs)`)
              }
            } else {
              // Cache sans bloc JINA (version pre-injection) — l'injecter
              markdownContent = markdownContent + '\n\n' + freshBlock
              const freshCount = (freshBlock.match(/ = /g) ?? []).length
              console.log('[enrichment] ♻️ JINA block injected from cached HTML (', freshCount, 'specs)')
              log(`♻️ Bloc specs injecté depuis HTML en cache (${freshCount} specs)`)
            }
          }
        }

        /** Score la qualité du markdown : specs × 3 + avantages × 2 + bonus description.
         *  Pénalise fortement les pages placeholder (bannière cookies dominante + pas de
         *  mention de la référence produit). */
        const scoreMd = (md: string | null): number => {
          if (!md || md.length < 200) return 0
          const specs = parseSpecsFromMarkdown(md).length
          const advs = parseAdvantagesFromMarkdown(md).length
          const descLen = parseDescriptionFromMarkdown(md).length
          const base = specs * 3 + advs * 2 + (descLen > 50 ? 5 : 0)

          // Détection 404 / page "introuvable" : titre ou début contient un marqueur
          // "produit non trouvé" (générique FR/EN). Le site renvoie son chrome complet
          // avec bannière cookies → sans ce garde-fou, on cache une page inutile.
          const topSlice = md.slice(0, 1500).toLowerCase()
          const NOT_FOUND_RE = /\b(introuvable|not\s*found|page\s*(non\s*)?(trouv[eé]e|introuvable)|page\s*not\s*found|404\b|indisponible|no\s*longer\s*available)\b/i
          if (NOT_FOUND_RE.test(topSlice)) {
            console.log('[enrichment] scoreMd: 404/not-found page detected → score=0')
            return 0
          }

          // Détection "page placeholder" : bannière cookies/consentement visible dans
          // les 3000 premiers chars + aucune mention du produit (titre ni référence).
          // Signale une page non hydratée ou un 404 déguisé.
          const head = md.slice(0, 3000).toLowerCase()
          const cookieMarkers = [
            'paramètres des cookies',
            'accepter tous les cookies',
            'refuser les cookies',
            'notre site internet utilise des cookies',
            'accept all cookies',
            'cookie settings',
          ].filter(m => head.includes(m)).length
          // Chercher la ref produit MAIS en excluant les lignes "Source:" / URL source
          // (celles-ci contiennent toujours la ref via le slug, même sur une page placeholder).
          const mdContentOnly = md
            .split('\n')
            .filter(l => !/^#+\s*\[Source:/i.test(l) && !/^Source\s*:/i.test(l))
            .join('\n')
            .toUpperCase()
          const lookupTokens = [reference, sku]
            .filter((s): s is string => typeof s === 'string' && s.length >= 3)
            .flatMap(s => s.toUpperCase().split(/[\s\-_,]+/).filter(t => t.length >= 3))
          const hasProductRef = lookupTokens.length === 0 || lookupTokens.some(t => mdContentOnly.includes(t))
          if (cookieMarkers >= 2 && !hasProductRef) {
            console.log('[enrichment] scoreMd: placeholder page detected (cookies banner + no product ref in body) → score=0')
            return 0
          }
          // Signal additionnel : très peu de specs + pas de ref produit dans le corps
          // → page générique de catégorie/série. Pénaliser aussi.
          if (specs < 3 && !hasProductRef) {
            console.log('[enrichment] scoreMd: generic page (no ref + <3 specs) → score=0')
            return 0
          }
          return base
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

          // ── Refresh du bloc JINA_EXTRACTED_SPECS depuis primaryHtml (live) ──
          // Le script d'injection Jina peut rendre un bloc partiel (onglets
          // lazy-loaded, sections repliées). L'extracteur TS ignore CSS/JS et
          // capture le DOM entier via DOMParser. Si freshCount > staleCount,
          // on remplace — gain observé : Makita 9 → 17 specs.
          if (primaryHtml && markdownContent) {
            const freshBlock = extractSpecsBlockFromHtml(primaryHtml)
            if (freshBlock) {
              const start = markdownContent.indexOf('JINA_EXTRACTED_SPECS_START')
              const endTag = 'JINA_EXTRACTED_SPECS_END'
              const end = markdownContent.indexOf(endTag)
              const freshCount = (freshBlock.match(/ = /g) ?? []).length
              if (start >= 0 && end > start) {
                const staleCount = (markdownContent.slice(start, end).match(/ = /g) ?? []).length
                if (freshCount > staleCount) {
                  markdownContent = markdownContent.slice(0, start) + freshBlock + markdownContent.slice(end + endTag.length)
                  console.log('[enrichment] ♻️ JINA block refreshed from live HTML (', staleCount, '→', freshCount, 'specs)')
                  log(`♻️ Bloc specs rafraîchi depuis HTML live (${staleCount} → ${freshCount} specs)`)
                }
              } else {
                markdownContent = markdownContent + '\n\n' + freshBlock
                console.log('[enrichment] ♻️ JINA block injected from live HTML (', freshCount, 'specs)')
                log(`♻️ Bloc specs injecté depuis HTML live (${freshCount} specs)`)
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
                  productUrl = altUrl
                  break
                }
              } catch { /* ignorer */ }
            }
          }

          // ── Sonde fabricant post-scrape : si on est toujours sur un score
          // faible/0 (404 déguisé, page vide), on tente UNE recherche ciblée
          // sur le domaine fabricant. Différent de la sonde pre-scrape : ici
          // on sait que le scrape a échoué, pas juste que l'URL n'est pas
          // fabricant.
          const postScore = scoreMd(markdownContent)
          if (postScore < 10 && brandSlug && Object.keys(MANUFACTURER_DOMAINS).includes(brandSlug)) {
            const mfrDomains = MANUFACTURER_DOMAINS[brandSlug]
            if (mfrDomains && mfrDomains.length > 0) {
              console.log('[enrichment] ⚡ post-scrape score still low (', postScore, ') — running manufacturer probe')
              log(`Scrape pauvre (score ${postScore}) — sonde fabricant sur ${mfrDomains[0]}…`)
              const probeTerms = reference || sku || title
              for (const domain of mfrDomains) {
                try {
                  const probeQuery = `${probeTerms} site:${domain}`
                  const probeResults = await jinaSearch(probeQuery, 5)
                  const probeClean = probeResults.filter((r) => !isJunkUrl(r.url) && r.url !== productUrl)
                  const probeMfr = probeClean.filter((r) => detectManufacturerSite(r.url))
                  if (probeMfr.length === 0) continue
                  for (const cand of probeMfr.slice(0, 3)) {
                    try {
                      const candMd = await jinaScrapeMarkdown(cand.url)
                      const candScore = scoreMd(candMd)
                      console.log('[enrichment] [post-probe] candidate:', cand.url, '→ score', candScore)
                      if (candScore > postScore) {
                        console.log('[enrichment] ✓ post-probe candidate is better:', cand.url)
                        log(`✓ Sonde fabricant : meilleure URL ${cand.url} (score ${candScore})`)
                        markdownContent = candMd
                        productUrl = cand.url
                        break
                      }
                    } catch { /* ignorer */ }
                  }
                  if (scoreMd(markdownContent) > postScore) break
                } catch (err) {
                  console.warn('[enrichment] [post-probe] failed for', domain, err)
                }
              }
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

        // Persister le scrape frais dans le cache — évite de re-solliciter Jina
        // lors d'un Re-générer. On exige ≥3 specs pour ne pas cacher un scrape
        // vide (cookie modal) qui bloquerait les itérations suivantes.
        if (!usedCache && productUrl && markdownContent && markdownContent.length > 200) {
          const freshSpecCount = parseSpecsFromMarkdown(markdownContent).length
          if (freshSpecCount >= 3) {
            const bundleInfo = (globalThis as unknown as { __lastBundle?: { sourcesScrapped?: string[] } }).__lastBundle
            const primaryImagesForCache = productUrl ? extractPrimaryImagesFromHtml(primaryHtml, productUrl) : []
            setScrapeCache(sheetName, rowId, {
              productUrl,
              additionalSources,
              markdownContent,
              scrapeProvider: 'Jina',
              sourcesScrapped: bundleInfo?.sourcesScrapped,
              primaryImages: primaryImagesForCache,
              primaryHtml,
            })
            console.log('[enrichment] 💾 scrape cached (', markdownContent.length, 'chars,', freshSpecCount, 'specs)')
            log(`💾 Scrape mis en cache (${freshSpecCount} specs) — Re-générer n'appellera plus Jina`)
          } else {
            console.log('[enrichment] ⚠️ scrape non mis en cache (specs:', freshSpecCount, '— trop pauvre)')
            log(`⚠️ Scrape non caché (${freshSpecCount} specs — trop pauvre, on retentera au prochain Re-générer)`)
          }
        }

        // Images primaires extraites à chaque scrape (pas de cache)
        const primaryImages = productUrl ? extractPrimaryImagesFromHtml(primaryHtml, productUrl) : []
        const extractedPrice = productUrl ? extractProductPrice(primaryHtml, markdownContent) : null
        const extractedBreadcrumb = extractBreadcrumbFromHtml(primaryHtml)
        if (extractedBreadcrumb.length > 0) {
          log(`🧭 Fil d'Ariane : ${extractedBreadcrumb.join(' › ')}`)
        }
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
            enriched = { ...mfrBuild, price: extractedPrice, breadcrumb: extractedBreadcrumb.length ? extractedBreadcrumb : undefined }
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
              mfrDataSections.push(`## Contenu de la page produit (markdown rendu)\n${markdownContent.slice(0, 60000)}`)
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
              breadcrumb: extractedBreadcrumb.length ? extractedBreadcrumb : undefined,
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
            breadcrumb: extractedBreadcrumb.length ? extractedBreadcrumb : undefined,
            sourceUrl: productUrl,
            additionalSources,
            generatedAt: Date.now(),
            scrapingProvider: 'Jina (direct)',
            llmProvider: undefined,
            llmModel: undefined,
          }
        } else {
          // ══ PATH B : LLM classique ═══════════════════════════════════
          log(`🤖 IA · Synthèse LLM (single-shot, schéma strict)`)
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
            const extractBlock = (src: string, start: string, end: string): { block: string | null; rest: string } => {
              const re = new RegExp(`${start}[\\s\\S]*?${end}`, 'g')
              const m = src.match(re)
              if (!m || m.length === 0) return { block: null, rest: src }
              const block = m.join('\n')
              const rest = src.replace(re, '').replace(/\n{3,}/g, '\n\n')
              return { block, rest }
            }
            let working = markdownContent
            const specsX = extractBlock(working, 'JINA_EXTRACTED_SPECS_START', 'JINA_EXTRACTED_SPECS_END')
            working = specsX.rest
            const docsX = extractBlock(working, 'JINA_EXTRACTED_DOCUMENTS_START', 'JINA_EXTRACTED_DOCUMENTS_END')
            working = docsX.rest
            const imagesX = extractBlock(working, 'JINA_EXTRACTED_IMAGES_START', 'JINA_EXTRACTED_IMAGES_END')
            working = imagesX.rest

            // Strip les marqueurs JINA_EXTRACTED_* du prompt LLM : le LLM les
            // recopie sinon comme "specs" (clé = marqueur littéral). markdownContent
            // reste intact pour les parseurs downstream (parseCleanSpecsFromJinaBlock).
            const stripMarkers = (block: string) => block
              .replace(/JINA_EXTRACTED_[A-Z_]+_(START|END)\n?/g, '')
              .trim()
            if (specsX.block) {
              dataSections.push(`## Spécifications techniques structurées (extraites du HTML rendu)\n${stripMarkers(specsX.block)}`)
            }
            if (docsX.block) {
              dataSections.push(`## Documents PDF détectés\n${stripMarkers(docsX.block)}`)
            }
            if (imagesX.block) {
              dataSections.push(`## Images produit détectées\n${stripMarkers(imagesX.block)}`)
            }
            const narrativeBudget = specsX.block || docsX.block || imagesX.block ? 40000 : 60000
            const narrative = working.trim()
            if (narrative) {
              dataSections.push(`## Contenu de la page produit (markdown rendu)\n${narrative.slice(0, narrativeBudget)}`)
            }
          }

          const finalMdScore = scoreMd(markdownContent)
          const finalSpecCount = markdownContent ? parseSpecsFromMarkdown(markdownContent).length : 0

          // Détection "scrape off-target" : le TITLE et DESCRIPTION du
          // SEMANTIC_EXTRACT ne contiennent AUCUN token distinctif de la
          // référence cible → le scraper a livré un mauvais produit (ex:
          // Milwaukee /m18-fpd3/ qui rend par défaut un accessoire foret ;
          // son TITLE devient "Forets Multi-matériaux"). Dans ce cas le
          // contenu scrapé est inutilisable comme source — on force le
          // knowledge mode pour que le LLM s'appuie sur la ref+marque.
          const targetRef = (reference ?? sku ?? title ?? '').toString()
          const refTokens = targetRef
            .toLowerCase()
            .split(/[\s\-_,./]+/)
            .filter((t) => t.length >= 3 && /[a-z0-9]/i.test(t) && /\d/.test(t))
          let offTarget = false
          if (refTokens.length > 0 && markdownContent) {
            // Extraire UNIQUEMENT les lignes TITLE/DESCRIPTION du bloc sémantique
            // — c'est là que s'exprime le "bon produit". Les URLs/variantes plus
            // bas peuvent contenir la ref sans que le produit affiché soit le bon.
            const semMatch = markdownContent.match(/SEMANTIC_EXTRACT_START[\s\S]{0,3000}?SEMANTIC_EXTRACT_END/)
            const semBlock = semMatch ? semMatch[0] : markdownContent.slice(0, 1500)
            const titleLine = (semBlock.match(/^TITLE:\s*(.+)$/m)?.[1] ?? '').toLowerCase()
            const descLine = (semBlock.match(/^DESCRIPTION:\s*(.+)$/m)?.[1] ?? '').toLowerCase()
            const haystack = `${titleLine} ${descLine}`
            offTarget = haystack.trim().length > 0 && !refTokens.some((t) => haystack.includes(t))
          }

          // Seuil binaire : scraping riche (specs ≥5 + score ≥10 + on-target)
          // → extraction stricte. Sinon (SPA, dropdown masquant les specs,
          // off-target, contenu thin) → prompt knowledge-augmented : le LLM
          // complète depuis les fiches publiques du produit identifié par sa
          // référence+marque, tout en gardant la fidélité aux valeurs scrapées.
          const needsKnowledgeBoost = offTarget || !(finalSpecCount >= 5 && finalMdScore >= 10)
          const promptMode = needsKnowledgeBoost ? 'knowledge-augmented' : 'extraction-only'
          console.log('[enrichment] 🎯 prompt mode:', promptMode, '| specs:', finalSpecCount, '| score:', finalMdScore, '| offTarget:', offTarget)
          log(`🎯 Prompt : ${promptMode} (specs=${finalSpecCount}, score=${finalMdScore}${offTarget ? ', off-target' : ''})`)

          const prompt = needsKnowledgeBoost
            ? `Tu es un expert produit. Le scraping web a retourné peu ou pas de spécifications techniques structurées (site SPA / accordéons JS / dropdown de variantes masquant les vraies specs). Ta mission : générer une fiche produit COMPLÈTE en combinant les données scrapées (à utiliser en PRIORITÉ pour vérifier les valeurs) + tes connaissances publiques et factuelles du produit identifié par sa référence et sa marque.

## Produit à identifier
${sourceContext}

${dataSections.join('\n\n')}

## CE QUE TU DOIS FAIRE
1. Description : rédige une description marketing professionnelle en FRANÇAIS (2-4 phrases), en t'appuyant sur la description scrapée si elle existe, sinon depuis tes connaissances.
2. Avantages : liste 8-15 points forts / caractéristiques clés en FR. Reprends ceux visibles dans le markdown scrapé + complète depuis tes connaissances publiques du produit.
3. Spécifications : point CRITIQUE — liste EXHAUSTIVEMENT les spécifications techniques du produit, organisées en groupes cohérents. Exemples de groupes par catégorie : Informations (référence, gamme), Moteur / Puissance, Batterie, Vitesse, Capacités (acier, bois, mandrin), Couple, Dimensions, Poids, Niveau sonore (décibels), Vibrations, Matériaux, Connectique, etc. Format { name, value, group? }.
   - Si une spec apparaît dans les données scrapées → reprends sa valeur EXACTEMENT (même unités, même formatage).
   - Sinon → utilise tes connaissances publiques (fiches fabricant, catalogues grand public, sites revendeurs officiels).
   - Vise 10-25 specs pour un produit outillage / électroménager / mobilier, proportionné à la complexité.
   - Retourner <8 specs pour un produit techniquement complexe et bien référencé est un ÉCHEC.
4. Variantes : liste les déclinaisons connues (par batterie, pack, couleur, taille…) avec reference + label + properties discriminantes.
5. Images / Documents : reprends les URLs présentes dans le scraping ; sinon tableaux vides.

## IMPORTANT
- TOUJOURS répondre en FRANÇAIS.
- Les caractéristiques techniques d'un produit grand public référencé sont des DONNÉES PUBLIQUES (fiches fabricant, catalogues, revendeurs officiels). Les fournir N'EST PAS "inventer" — c'est utiliser des données factuelles vérifiables.
- Ne jamais inventer une valeur que tu ne connais pas précisément : préférer omettre une spec que donner un chiffre faux.
- FIDÉLITÉ aux valeurs scrapées : si le markdown dit "Tension: 18 V", ne pas écrire "20V" depuis une autre source.

Réponds UNIQUEMENT via l'outil emit_response.`
            : `Tu es un extracteur de données produit. Tu extrais fidèlement les données trouvées et produis une fiche EN FRANÇAIS.

## Produit à identifier
${sourceContext}

${dataSections.join('\n\n')}

## RÈGLES ABSOLUES
1. LANGUE DE SORTIE : TOUJOURS FRANÇAIS. Si la source est en anglais/allemand/autre, TRADUIS (description, noms de specs, libellés groupes, avantages, libellés variants). Les valeurs numériques + unités + références/SKU restent inchangées.
2. Description : reprends le texte descriptif marketing ; si source non-FR, traduis fidèlement en français professionnel (2-4 phrases minimum).
3. Avantages : reprends TOUS les bullet points / features / arguments commerciaux, traduits en FR. SANS LIMITE de nombre.
4. Spécifications : extrais 100% des lignes de CHAQUE tableau/section technique. ZÉRO OMISSION.
   🔒 EXHAUSTIVITÉ : si la source contient une table "Données techniques" avec 11 lignes, tu en retournes 11 — pas 9, pas 10. Les valeurs NON numériques doivent AUSSI être incluses : Couleur (Jaune, Noir, Inox…), Matière, Finition, Type de moteur, Système de raccordement, Type de flexible, etc. Aucun filtrage subjectif (« cosmétique », « marketing », « non pertinent ») — si c'est dans le tableau source, c'est dans la sortie.
   🔒 FIDÉLITÉ ABSOLUE AUX LABELS : le champ "name" DOIT reprendre EXACTEMENT le libellé tel qu'écrit dans la source (casse/ponctuation/parenthèses d'unité incluses). Ex: si la source affiche "Tension (V)" → name="Tension (V)" ; "Câble d'alimentation (m)" → name="Câble d'alimentation (m)" ; "Pression (bar)" → name="Pression (bar)". INTERDICTION de renommer ("Tension (V)" → "Tension d'alimentation"), de fusionner deux specs en une seule ("Tension (V)" + "Fréquence (Hz)" → "Tension/Fréquence"), ou de déplacer l'unité dans la valeur ("Puissance absorbée (W)" : "2100" → ne pas transformer en "Puissance" : "2100 W").
   🔒 FIDÉLITÉ ABSOLUE AUX VALEURS : le champ "value" DOIT être la chaîne brute telle qu'écrite ("max. 500", "20 - max. 145", "Jaune", "220 - 240"). Ne pas normaliser les plages, ne pas ajouter/enlever d'unités, ne pas arrondir.
   Traduction : uniquement si la source est en langue étrangère, traduis littéralement le label en gardant la même structure et les mêmes parenthèses d'unité (ex: "Voltage (V)" → "Tension (V)"). Sinon, aucune modification.
   Groupes : réutilise les titres de section EXACTS de la source ("Données techniques", "Pression / Débit", "Moteur / Énergie", etc.). Ne jamais inventer un groupe standardisé si la source en propose un.
   EXCLURE ABSOLUMENT — aucune spec produit ne peut provenir de :
   • bandeaux cookies / consentement RGPD / GDPR / "Liste des cookies" / "Politique de confidentialité" / "Paramètres cookies" / "Consent / Leg.Interest" / "Accepter / Refuser / Personnaliser"
   • noms de cookies ou trackers (Search Icon, Filter Icon, Apply Cancel, pixel, beacon, session_id, gtm, _ga, ads, adv)
   • libellés d'UI / icônes / boutons de navigation ("Play/Pause", "Volume", "Plein écran", "Sous-titres", "Espace", "c", "f", "m", "d", "t" seuls comme valeurs, flèches directionnelles, raccourcis clavier)
   • menus nav / liens sociaux / "Mon compte" / "Panier" / "S'inscrire" / "Newsletter"
   • prix, disponibilité/stock, délais de livraison, codes promo, offres commerciales, notes/avis (étoiles, /5)
   • noms d'accessoires vendus à part (chargeurs, coffrets, batteries en pack)
   • bandeaux promotionnels ("Profitez des offres", "Soldes", "-20%")
   Si le contenu ci-dessus NE contient PAS de vrai tableau technique produit (seulement cookies/nav/promo), retourne specifications=[] — ne force PAS une extraction.
   Ne garder QUE les caractéristiques techniques du produit lui-même.
5. Variantes : extrais TOUTES les déclinaisons.
   - reference : code/SKU inchangé.
   - label : libellé en FR.
   - properties : détecte les AXES DISCRIMINANTS (les attributs qui DIFFÈRENT entre variantes) et expose-les comme colonnes du tableau.
     Exemples : libellés qui varient par "prof.0/1/2/3/4" → properties.Profondeur="0/1/2/3/4". Variantes "Palette 40m" vs "Palette 28m" → properties.Conditionnement="Palette 40 m"/"Palette 28 m". Couleur/Taille/Classe/Longueur/Matière → properties.Couleur/Taille/Classe/Longueur/Matière.
     RÈGLES : clés FR courtes (≤20 chars, ex: "Profondeur", "Conditionnement", "Couleur") ; NE PAS mettre dans properties ce qui est IDENTIQUE pour toutes les variantes (constantes du produit de base) ; chaque variante n'a QUE les clés qui lui sont applicables (les autres sont absentes). Minimum 1 clé par variante si les libellés diffèrent clairement.
6. Images : reprends TOUTES les URLs d'images produit (https://...) trouvées. Ignore logos, icônes, pub.
7. heroImage : sélectionne UNE URL parmi images — la meilleure photo principale. Ne jamais inventer. Omettre si rien ne convient.
8. price : si un prix est visible (JSON-LD Offer, balise <price>, texte "XX,XX €" / "$XX.XX"), extrais { amount, currency (code ISO 4217), priceType }. Sinon null. JAMAIS INVENTER.
9. Documents : reprends toutes les URLs de fichiers PDF trouvées.
10. Si un champ n'existe pas dans les données → chaîne vide / tableau vide / null. JAMAIS d'invention.
11. FIDÉLITÉ chiffrée : les valeurs numériques doivent correspondre EXACTEMENT au source (pas d'arrondi, pas de conversion d'unité).
12. 🚫 ZÉRO CONNAISSANCE EXTERNE : ne complète JAMAIS avec tes connaissances publiques du produit. Tu extrais UNIQUEMENT ce qui est écrit dans le contenu ci-dessus. Si une spec n'est pas dans les données, elle n'est pas dans la sortie — même si tu "sais" sa valeur. Mieux vaut 5 specs correctes que 20 dont certaines sont inventées.
13. 🚫 PAS DE DOUBLONS : une spec apparaît une seule fois. Ne pas retourner deux lignes dont l'une est une variante/reformulation de l'autre avec la même valeur.

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
            breadcrumb: extractedBreadcrumb.length ? extractedBreadcrumb : undefined,
            sourceUrl: productUrl,
            additionalSources,
            generatedAt: Date.now(),
            scrapingProvider: productUrl ? 'Jina' : undefined,
            llmProvider: llmProviderUsed,
            llmModel: llmModelUsed,
          }
        }
        } // fin du else (non-fabricant)

        // ── Identifiants produit pour whitelist PDF (ref/SKU/modèle/brand/title) ──
        const productModel = title.match(/[A-Z]{2,5}[\-\s]?\d{1,4}[\w\-]*/i)?.[0] ?? ''
        const productIds = [reference, sku, productModel, brand, title]
          .filter((x): x is string => typeof x === 'string' && x.trim().length >= 3)

        // ── Post-processing : enrichir avec groupes markdown ──
        enriched = enrichWithMarkdownGroups(enriched, markdownContent, productIds, { trustLlmSpecs: needsKnowledgeBoost })

        enriched = enrichVariantsFromMarkdown(enriched, markdownContent)

        enriched = deriveVariantDiscriminants(enriched)

        enriched = sanitizeEnriched(enriched, productIds)
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
