/**
 * enrichRow — fonction pure (callable hors React) qui enrichit une URL produit.
 *
 * Conçue pour Task 17 du Workflow Orchestration Studio : permet à un nœud
 * d'enrichissement d'être exécuté dans le runtime de workflow sans passer par
 * le hook `useProductEnrichment`.
 *
 * Pipeline minimal (vs le hook qui fait 4800+ lignes de post-process) :
 *   1. scrapeProductBundle(url) avec deepScrape=Firecrawl (si clé) sinon Jina
 *   2. generateJson() — Claude ou Gemini selon `input.model` — avec un schéma
 *      Zod construit dynamiquement depuis `targetFields`
 *   3. Extraction des assets (PDFs du bundle + images regex sur le markdown)
 *
 * Note : la qualité d'enrichissement sera plus faible que celle du hook
 * (pas de cascade anti-bot complète, pas de sanitize, pas de fusion JSON-LD).
 * C'est attendu pour v1 ; le test d'intégration de Task 21 validera le
 * comportement réel sur des URLs complètes.
 */

import { z } from 'zod'
import { getApiKey } from '@/lib/apiKeys'
import { generateJson, type LLMProviderId } from '@/features/ai/llmRouter'
import { scrapeProductBundle } from './scrapeBundle'
import { firecrawlScrape } from '@/features/scraping/core/firecrawlFallback'
import { looksLikeBotChallenge } from './markdownSanitize'
import {
  brightDataScrapeWithDocs,
  getLastBrightDataError,
  isHostKnownBlocked,
  markHostBlocked,
} from '@/features/scraping/core/brightDataFallback'
import { extractStructuredDataFromUrl } from '@/features/scraping/core/structuredDataFetcher'
import type { StructuredProductData } from '@/features/scraping/core/structuredData'
import { parseSpecsFromMarkdown, type Specification } from '@/features/scraping/core/parsers/parseSpecifications'
import { isJunkImageUrl, isPictoOrLogo } from './imageFilter'

export interface EnrichRowInput {
  url: string
  /** Champs à enrichir (ex. ['title', 'description', 'price', 'sku']). */
  targetFields: string[]
  /** Modèle LLM. Le routage `generateJson` est par tâche, pas par modèle, mais
   *  le préfixe (`claude-…` vs `gemini-…`) est utilisé comme `forceProvider`. */
  model?: string
  /** Annulation best-effort : vérifiée entre les phases (scrape / LLM). */
  signal?: AbortSignal
  log?: (msg: string) => void
}

export interface EnrichRowAsset {
  url: string
  type: 'image' | 'pdf' | 'video' | 'other'
}

export interface EnrichRowResult {
  fields: Record<string, unknown>
  assets: EnrichRowAsset[]
}

/**
 * Cascade complète de deep scrape (page primaire) : Firecrawl (si clé) → Jina → Bright Data Web
 * Unlocker en dernier recours pour les sites anti-bot (DataDome/Cloudflare). Une page de challenge
 * renvoyée par Firecrawl/Jina (détectée via `looksLikeBotChallenge`) déclenche l'escalade vers
 * Bright Data plutôt que d'être passée telle quelle au LLM. Un host déjà identifié bloqué saute
 * directement à Bright Data (économise les appels). Bright Data n'est PAS utilisé pour le fastScrape
 * des onglets secondaires (coût crédits) — voir jinaFastScrape.
 */
function buildDeepScrape(
  log?: (msg: string) => void,
): (url: string) => Promise<{ markdown: string; html: string | null } | null> {
  return async (url: string) => {
    let sawChallenge = false

    if (!isHostKnownBlocked(url)) {
      const fcKey = getApiKey('firecrawl')
      if (fcKey) {
        try {
          const r = await firecrawlScrape(url, fcKey)
          if (r?.markdown) {
            if (!looksLikeBotChallenge(r.markdown)) {
              log?.('[enrichRow] connecteur : Firecrawl ✓')
              return { markdown: r.markdown, html: null }
            }
            sawChallenge = true
          }
        } catch (err) {
          console.warn('[enrichRow] firecrawl failed:', err)
        }
      }
      const j = await jinaFetch(url)
      if (j?.markdown) {
        if (!looksLikeBotChallenge(j.markdown)) {
          log?.('[enrichRow] connecteur : Jina ✓')
          return j
        }
        sawChallenge = true
      }
    }

    // Dernier recours : Bright Data Web Unlocker (anti-bot premium, via Cloud Function). Renvoie
    // markdown + images injectées (bloc JINA_EXTRACTED_IMAGES). Dégradation propre si non configuré
    // (callScrape renvoie null → on retourne null → champs vides plutôt qu'une page challenge).
    log?.(
      isHostKnownBlocked(url)
        ? '[enrichRow] host anti-bot connu → Bright Data'
        : '[enrichRow] Jina/Firecrawl indisponibles → tentative Bright Data',
    )
    try {
      const bd = await brightDataScrapeWithDocs(url)
      if (bd?.markdown) {
        if (sawChallenge || isHostKnownBlocked(url)) markHostBlocked(url)
        log?.('[enrichRow] connecteur : Bright Data ✓')
        return { markdown: bd.markdown, html: null }
      }
    } catch (err) {
      console.warn('[enrichRow] bright data failed:', err)
    }
    // Surface la raison Bright Data (cookies/balance/503…) dans les logs pour diagnostic.
    const bdErr = getLastBrightDataError()
    log?.(
      `[enrichRow] connecteur : AUCUN — Bright Data échoué${
        bdErr ? ` (${bdErr.code} : ${bdErr.message.slice(0, 140)})` : ''
      }`,
    )
    return null
  }
}

/** Fast scrape = Jina Reader (markdown only). */
async function jinaFastScrape(url: string): Promise<string | null> {
  const r = await jinaFetch(url)
  return r?.markdown ?? null
}

/**
 * Jina renvoie HTTP 200 même quand la cible l'a bloqué : l'échec est signalé DANS le corps
 * (« Warning: Target URL returned error 4xx », « maybe requiring CAPTCHA », ou « Markdown Content: »
 * vide). On le détecte pour ne pas passer ce déchet au LLM ni le compter comme un succès (→ escalade
 * Bright Data dans la cascade).
 */
function jinaReportsBlock(md: string): boolean {
  const head = md.slice(0, 800)
  if (/Warning:\s*Target URL returned error \d{3}/i.test(head)) return true
  if (/maybe requiring CAPTCHA/i.test(head)) return true
  const body = md.match(/Markdown Content:\s*([\s\S]*)$/i)
  if (body && body[1].trim().length < 40) return true
  return false
}

/** Récupère le markdown via r.jina.ai. Auth Bearer si clé Jina configurée. null si Jina a été bloqué. */
async function jinaFetch(url: string): Promise<{ markdown: string; html: string | null } | null> {
  const jinaKey = getApiKey('jina')
  // X-With-Images-Summary: Jina ajoute une section « Images: » listant TOUTES les images de la page
  // (même non inline dans le markdown) → meilleure récolte d'assets par extractImageAssets.
  const headers: Record<string, string> = { Accept: 'text/plain', 'X-With-Images-Summary': 'true' }
  if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers })
    if (!res.ok) return null
    const md = await res.text()
    if (!md || jinaReportsBlock(md)) return null
    return { markdown: md, html: null }
  } catch (err) {
    console.warn('[enrichRow] jina fetch failed:', err)
    return null
  }
}

/** Mappe `input.model` vers un `forceProvider` LLMProviderId. */
function pickProvider(model?: string): LLMProviderId | undefined {
  if (!model) return undefined
  if (/^claude-/i.test(model)) return 'claude'
  if (/^gemini-/i.test(model)) return 'gemini'
  if (/^deepseek-/i.test(model)) return 'deepseek'
  if (/^(gpt-|o\d|chatgpt)/i.test(model)) return 'openai'
  if (model.includes('/')) return 'openrouter'
  return undefined
}

/** Construit un schéma Zod + JSON Schema dynamique depuis la liste de champs. */
function buildSchemas(targetFields: string[]): {
  zod: z.ZodSchema<Record<string, string | null>>
  jsonSchema: Record<string, unknown>
} {
  const shape: Record<string, z.ZodTypeAny> = {}
  const properties: Record<string, unknown> = {}
  for (const f of targetFields) {
    shape[f] = z.string().nullable()
    properties[f] = { type: ['string', 'null'] }
  }
  return {
    zod: z.object(shape) as z.ZodSchema<Record<string, string | null>>,
    jsonSchema: {
      type: 'object',
      properties,
      required: targetFields,
      additionalProperties: false,
    },
  }
}

/** Fusionne les specs JSON-LD et celles parsées du markdown, dédupliquées par nom (1ʳᵉ occurrence). */
export function mergeSpecs(jsonLd: Specification[], fromMarkdown: Specification[]): Specification[] {
  const seen = new Set<string>()
  const out: Specification[] = []
  for (const s of [...jsonLd, ...fromMarkdown]) {
    const key = s.name?.trim().toLowerCase()
    if (!key || !s.value?.trim() || seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

/** Vrai si les données structurées JSON-LD portent assez de signal pour servir de source primaire. */
export function structuredHasSignal(p: StructuredProductData): boolean {
  return !!(
    p.name &&
    ((p.specs && p.specs.length > 0) || p.offers?.price != null || (p.description && p.description.length > 60))
  )
}

/**
 * Sérialise les données structurées (JSON-LD) en markdown riche pour l'extraction LLM : identité,
 * prix, description, spécifications KEY/VALUE, et bloc JINA_EXTRACTED_IMAGES (images sans extension).
 */
export function serializeStructured(p: StructuredProductData): string {
  const lines: string[] = []
  if (p.name) lines.push(`# ${p.name}`)
  if (p.brand) lines.push(`Marque : ${p.brand}`)
  if (p.manufacturer?.name) lines.push(`Fabricant : ${p.manufacturer.name}`)
  if (p.sku) lines.push(`Référence / SKU : ${p.sku}`)
  if (p.gtin) lines.push(`GTIN / EAN : ${p.gtin}`)
  if (p.mpn) lines.push(`MPN : ${p.mpn}`)
  if (p.category) lines.push(`Catégorie : ${p.category}`)
  if (p.offers?.price != null) {
    lines.push(`Prix : ${p.offers.price}${p.offers.priceCurrency ? ` ${p.offers.priceCurrency}` : ''}`)
  }
  if (p.description) lines.push('', p.description)
  // NB : les specs ne sont PAS rendues ici — elles sont consolidées (JSON-LD + parseSpecsFromMarkdown)
  // puis injectées en un seul bloc « Spécifications complètes » dans enrichRow.
  if (p.images && p.images.length > 0) {
    lines.push('', 'JINA_EXTRACTED_IMAGES_START', ...p.images, 'JINA_EXTRACTED_IMAGES_END')
  }
  return lines.join('\n')
}

/**
 * Extrait les URLs d'images du markdown : (1) le bloc explicite JINA_EXTRACTED_IMAGES (injecté par
 * Jina/Bright Data — URLs résolues sans exigence d'extension, ex. CDN Adeo/Next.js), (2) les URLs
 * inline finissant par une extension image. Dédupliqué.
 */
function extractImageAssets(md: string): EnrichRowAsset[] {
  const seen = new Set<string>()
  const out: EnrichRowAsset[] = []
  const add = (raw: string) => {
    const url = raw.trim()
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return
    // Écarte les images non-produit : logos, pictos, badges, bannières, pixels de tracking, icônes…
    if (isJunkImageUrl(url) || isPictoOrLogo(url)) return
    seen.add(url)
    out.push({ url, type: 'image' })
  }
  // (1) Bloc explicite : une URL par ligne, sans contrainte d'extension.
  const block = md.match(/JINA_EXTRACTED_IMAGES_START\s*([\s\S]*?)\s*JINA_EXTRACTED_IMAGES_END/i)
  if (block) for (const line of block[1].split('\n')) add(line)
  // (2) URLs inline avec extension image.
  const re = /https?:\/\/[^\s)<>"']+\.(?:jpg|jpeg|png|webp|gif|svg)(?:\?[^\s)<>"']*)?/gi
  for (const m of md.matchAll(re)) add(m[0])
  return out
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('enrichRow aborted')
    err.name = 'AbortError'
    throw err
  }
}

export async function enrichRow(input: EnrichRowInput): Promise<EnrichRowResult> {
  const { url, targetFields, model, signal, log } = input
  if (!url) throw new Error('enrichRow: url manquante')
  if (!targetFields || targetFields.length === 0) {
    throw new Error('enrichRow: targetFields vide')
  }

  throwIfAborted(signal)

  log?.(`[enrichRow] scrape ${url}`)

  // Récupération optimisée pour éviter le double appel Bright Data :
  //  - host anti-bot CONNU → UN SEUL appel brightDataScrapeWithDocs (markdown + JSON-LD + PDFs) ;
  //  - sinon → données structurées via la cascade légère (proxies/Jina, BD seulement en dernier
  //    recours, qui marque alors le host bloqué), puis bundle markdown en repli.
  // Le JSON-LD est dans le HTML brut → récupérable même sur page anti-bot, d'où une donnée bien plus
  // riche (nom, prix, description, specs, images) que le seul markdown — comme le scraper PIM.
  let structured: StructuredProductData | null = null
  let rawMd = ''
  let pdfAssets: EnrichRowAsset[] = []

  if (isHostKnownBlocked(url)) {
    log?.('[enrichRow] host anti-bot connu → Bright Data (1 appel : markdown + JSON-LD)')
    const bd = await brightDataScrapeWithDocs(url).catch((err) => {
      console.warn('[enrichRow] bright data failed:', err)
      return null
    })
    if (bd && (bd.structuredData || (bd.markdown && !looksLikeBotChallenge(bd.markdown)))) {
      structured = bd.structuredData
      rawMd = bd.markdown
      pdfAssets = bd.pdfLinks.map((p) => ({ url: p.url, type: 'pdf' as const }))
      log?.('[enrichRow] connecteur : Bright Data ✓')
    } else if (bd) {
      // BD a répondu mais avec une page anti-bot (DataDome non résolu) → contenu inexploitable.
      log?.(
        '[enrichRow] ⚠️ Bright Data a renvoyé une page anti-bot (DataDome non résolu) — vérifie que la zone Bright Data est bien une zone « Web Unlocker ».',
      )
    } else {
      const bdErr = getLastBrightDataError()
      log?.(
        `[enrichRow] Bright Data échoué${bdErr ? ` (${bdErr.code} : ${bdErr.message.slice(0, 140)})` : ''}`,
      )
    }
  } else {
    structured = await extractStructuredDataFromUrl(url).catch((err) => {
      console.warn('[enrichRow] structured data failed:', err)
      return null
    })
  }
  throwIfAborted(signal)

  // Données structurées riches → source primaire (sérialisées), combinées au markdown brut si présent.
  let structuredMd = ''
  if (structured && structuredHasSignal(structured)) {
    log?.(
      `[enrichRow] structured data JSON-LD ✓ (${structured.specs?.length ?? 0} specs, ${structured.images?.length ?? 0} images)`,
    )
    structuredMd = serializeStructured(structured)
  }
  let md = [structuredMd, rawMd].filter(Boolean).join('\n\n')

  // Host accessible sans contenu exploitable → bundle markdown (Jina → Firecrawl → BD en dernier
  // recours). Le guard !isHostKnownBlocked évite un 2e appel BD si la cascade a déjà escaladé.
  if (!md && !isHostKnownBlocked(url)) {
    const bundle = await scrapeProductBundle(url, {
      deepScrape: buildDeepScrape(log),
      fastScrape: jinaFastScrape,
      log,
    })
    throwIfAborted(signal)
    md = bundle.mergedMarkdown
    pdfAssets = bundle.pdfsFound.map((p) => ({ url: p.url, type: 'pdf' as const }))
  }

  if (!md) {
    log?.(`[enrichRow] aucun contenu (structured + markdown vides) — champs vides`)
    return {
      fields: Object.fromEntries(targetFields.map((f) => [f, null])),
      assets: pdfAssets,
    }
  }

  // Tableau de specs complet : JSON-LD + specs parsées du markdown (KEY/VALUE), comme le scraper PIM.
  // Injecté en tête du markdown pour que le LLM remplisse la colonne « Spécifications ».
  const mergedSpecs = mergeSpecs(structured?.specs ?? [], parseSpecsFromMarkdown(md))
  if (mergedSpecs.length > 0) {
    log?.(`[enrichRow] ${mergedSpecs.length} spécifications consolidées`)
    md = `## Spécifications complètes (${mergedSpecs.length})\n${mergedSpecs
      .map((s) => `- ${s.name} : ${s.value}`)
      .join('\n')}\n\n${md}`
  }

  const { zod, jsonSchema } = buildSchemas(targetFields)
  const fieldList = targetFields.map((f) => `  - ${f}`).join('\n')
  const prompt =
    `Extrait les champs suivants depuis le markdown produit ci-dessous.\n` +
    `Champs à extraire :\n${fieldList}\n\n` +
    `Règles :\n` +
    `- Réponds UNIQUEMENT en JSON conforme au schéma.\n` +
    `- Si un champ est absent du markdown, mets \`null\`.\n` +
    `- Pas d'invention, pas de fallback web.\n\n` +
    `Markdown produit :\n\n${md.slice(0, 60_000)}`

  log?.(`[enrichRow] LLM extraction (${targetFields.length} champs, ${md.length} chars markdown)`)
  const provider = pickProvider(model)

  let fields: Record<string, unknown> = {}
  try {
    const parsed = await generateJson({
      task: 'product.enrichment',
      prompt,
      schema: zod,
      schemaForLLM: jsonSchema,
      version: 'enrichRow.v1',
      forceProvider: provider,
      onProviderUsed: ({ provider: used, model: usedModel }) =>
        log?.(`[enrichRow] LLM : ${used} (${usedModel})`),
    })
    fields = parsed
  } catch (err) {
    log?.(`[enrichRow] LLM échec : ${err instanceof Error ? err.message : String(err)}`)
    fields = Object.fromEntries(targetFields.map((f) => [f, null]))
  }

  const imageAssets = extractImageAssets(md)
  const assets: EnrichRowAsset[] = [...pdfAssets, ...imageAssets]

  log?.(`[enrichRow] OK — ${Object.values(fields).filter((v) => v != null).length}/${targetFields.length} champs renseignés, ${assets.length} assets`)
  return { fields, assets }
}
