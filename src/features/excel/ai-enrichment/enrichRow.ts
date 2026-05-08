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

/** Construit le deepScrape : Firecrawl si clé présente, sinon Jina Reader. */
function buildDeepScrape(): (url: string) => Promise<{ markdown: string; html: string | null } | null> {
  return async (url: string) => {
    const fcKey = getApiKey('firecrawl')
    if (fcKey) {
      try {
        const r = await firecrawlScrape(url, fcKey)
        if (r?.markdown) return { markdown: r.markdown, html: null }
      } catch (err) {
        console.warn('[enrichRow] firecrawl failed:', err)
      }
    }
    return jinaFetch(url)
  }
}

/** Fast scrape = Jina Reader (markdown only). */
async function jinaFastScrape(url: string): Promise<string | null> {
  const r = await jinaFetch(url)
  return r?.markdown ?? null
}

/** Récupère le markdown via r.jina.ai. Auth Bearer si clé Jina configurée. */
async function jinaFetch(url: string): Promise<{ markdown: string; html: string | null } | null> {
  const jinaKey = getApiKey('jina')
  const headers: Record<string, string> = { Accept: 'text/plain' }
  if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers })
    if (!res.ok) return null
    const md = await res.text()
    return md ? { markdown: md, html: null } : null
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

/** Extrait les URLs d'images depuis le markdown (regex simple, dédupliquée). */
function extractImageAssets(md: string): EnrichRowAsset[] {
  const re = /https?:\/\/[^\s)<>"']+\.(?:jpg|jpeg|png|webp|gif|svg)(?:\?[^\s)<>"']*)?/gi
  const seen = new Set<string>()
  const out: EnrichRowAsset[] = []
  for (const m of md.matchAll(re)) {
    const url = m[0]
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, type: 'image' })
  }
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
  const bundle = await scrapeProductBundle(url, {
    deepScrape: buildDeepScrape(),
    fastScrape: jinaFastScrape,
    log,
  })

  throwIfAborted(signal)

  const md = bundle.mergedMarkdown
  if (!md) {
    log?.(`[enrichRow] markdown vide — retour de champs vides`)
    return {
      fields: Object.fromEntries(targetFields.map((f) => [f, null])),
      assets: bundle.pdfsFound.map((p) => ({ url: p.url, type: 'pdf' as const })),
    }
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
    })
    fields = parsed
  } catch (err) {
    log?.(`[enrichRow] LLM échec : ${err instanceof Error ? err.message : String(err)}`)
    fields = Object.fromEntries(targetFields.map((f) => [f, null]))
  }

  const imageAssets = extractImageAssets(md)
  const pdfAssets: EnrichRowAsset[] = bundle.pdfsFound.map((p) => ({ url: p.url, type: 'pdf' }))
  const assets: EnrichRowAsset[] = [...pdfAssets, ...imageAssets]

  log?.(`[enrichRow] OK — ${Object.values(fields).filter((v) => v != null).length}/${targetFields.length} champs renseignés, ${assets.length} assets`)
  return { fields, assets }
}
