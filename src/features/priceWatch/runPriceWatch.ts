// Orchestrateur CLIENT du pipeline de veille tarifaire : découverte → scrape →
// validation LLM → diff/positionnement → alertes. Réutilise gatherWebContext
// (recherche) et enrichRow (scrape champs). Persiste matchs + historique.
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { z } from 'zod'
import { db } from '@/lib/firebase/config'
import { generateJson } from '@/features/ai/llmRouter'
import {
  buildPatternUrl, discoveryQueries, pickCandidate,
  parsePrice, pushHistory, evaluate, buildMatchPrompt,
} from './core'
import { matchesCol, historyCol, matchKey, HISTORY_MAX, MATCH_THRESHOLD } from './paths'
import type { TrackedProduct, CompetitorSite, PriceMatch, HistoryPoint, PriceWatchAlert } from './types'

export interface RunDeps {
  uid: string
  watchId: string
  thresholdPct: number
  products: TrackedProduct[]
  sites: CompetitorSite[]
  log: (msg: string) => void
  signal?: AbortSignal
}

const ConfidenceSchema = z.object({ confidence: z.number() })
const CONFIDENCE_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    confidence: { type: 'number', description: 'Confiance 0..1 que la page décrit EXACTEMENT le produit.' },
  },
  required: ['confidence'],
}

/** Demande au LLM un score de correspondance produit↔page, borné [0,1]. 0 si échec. */
async function validateMatch(product: TrackedProduct, pageContent: string): Promise<number> {
  try {
    const r = await generateJson<{ confidence: number }>({
      task: 'product.enrichment',
      version: 'priceWatch.match.v1',
      prompt: buildMatchPrompt(product, pageContent),
      schema: ConfidenceSchema,
      schemaForLLM: CONFIDENCE_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
    })
    return Math.max(0, Math.min(1, r.confidence))
  } catch {
    return 0
  }
}

/** Découvre l'URL d'un produit sur un site : pattern → recherche web (en préférant
 *  un résultat dont l'URL/titre porte le SKU ou l'EAN). */
async function discover(product: TrackedProduct, site: CompetitorSite): Promise<string | null> {
  const patternUrl = buildPatternUrl(site.urlPattern, product)
  if (patternUrl) return patternUrl
  const { gatherWebContext } = await import('@/features/scraping/webContext')
  for (const query of discoveryQueries(site.domain, product)) {
    const ctx = await gatherWebContext({ searchQuery: query, maxResults: 5, readPages: 0 })
    const url = pickCandidate(ctx.results, site.domain, { sku: product.sku, ean: product.ean })
    if (url) return url
  }
  return null
}

/** Scrape les champs (prix/EAN/nom) d'une URL via le moteur PIM (JSON-LD d'abord). */
async function scrape(
  url: string, fields: string[], signal?: AbortSignal,
): Promise<{ price: number; ean: string; name: string; content: string }> {
  const { enrichRow } = await import('@/features/excel/ai-enrichment/enrichRow')
  const targetFields = [...new Set([...fields, 'price', 'name', 'brand', 'ean'])]
  const result = await enrichRow({ url, targetFields, signal })
  return {
    price: parsePrice(result.fields.price),
    ean: String(result.fields.ean ?? '').replace(/\D/g, ''),
    name: String(result.fields.name ?? ''),
    content: JSON.stringify(result.fields),
  }
}

export async function runPriceWatch(deps: RunDeps): Promise<PriceWatchAlert[]> {
  const { uid, watchId, thresholdPct, products, sites, log } = deps
  const alerts: PriceWatchAlert[] = []
  for (const product of products) {
    for (const site of sites) {
      if (deps.signal?.aborted) return alerts
      const key = matchKey(product.id, site.id)
      const matchRef = doc(db, matchesCol(uid, watchId), key)
      const matchSnap = await getDoc(matchRef)
      const prev = matchSnap.data() as PriceMatch | undefined

      // Correspondances rejetées ou en attente de validation manuelle → on saute
      if (prev?.status === 'rejected' || prev?.status === 'pending') continue

      // 1. URL : épinglée sinon découverte
      let url = prev?.url
      let confidence = prev?.confidence ?? 0
      if (!url) {
        const found = await discover(product, site)
        if (!found) { log(`Aucune page trouvée : ${product.name} @ ${site.domain}`); continue }
        url = found
      }

      // Champs d'affichage dénormalisés (les produits sont transitoires : ils viennent du flux).
      const display = { productName: product.name, domain: site.domain, myPrice: product.myPrice ?? null }

      // 2. Scrape
      let scraped: { price: number; ean: string; name: string; content: string }
      try { scraped = await scrape(url, site.fields ?? ['price'], deps.signal) }
      catch (e) { log(`Scrape échoué ${url} : ${String(e)}`); continue }
      if (Number.isNaN(scraped.price)) { log(`Prix illisible : ${url}`); continue }
      const competitor = { competitorEan: scraped.ean || null, competitorName: scraped.name || null }

      // 3. Validation si pas encore épinglé/confirmé. EAN identique = appariement
      // autoritaire (confiance 1, pas d'appel LLM) ; sinon score LLM.
      if (!prev?.url || (prev.status !== 'auto' && prev.status !== 'confirmed')) {
        const eanMatch = !!product.ean && scraped.ean === product.ean.replace(/\D/g, '')
        const verdict = eanMatch ? 1 : await validateMatch(product, scraped.content)
        confidence = verdict
        const status: PriceMatch['status'] = verdict >= MATCH_THRESHOLD ? 'auto' : 'pending'
        await setDoc(matchRef, {
          productId: product.id, siteId: site.id, url, confidence: verdict, status,
          lastPrice: scraped.price, lastDiscoveredAt: Date.now(), updatedAt: Date.now(), ...display, ...competitor,
        } satisfies PriceMatch, { merge: true })
        if (status === 'pending') { log(`À confirmer (${verdict}) : ${product.name} @ ${site.domain}`); continue }
      }

      // 4. Historique + alertes
      const histRef = doc(db, historyCol(uid, watchId), key)
      const history = ((await getDoc(histRef)).data()?.values ?? []) as HistoryPoint[]
      const previousPrice = history.length ? history[history.length - 1].price : undefined
      const point: HistoryPoint = { price: scraped.price, at: Date.now() }
      await setDoc(histRef, { values: pushHistory(history, point, HISTORY_MAX) })
      await setDoc(matchRef, { lastPrice: scraped.price, confidence, updatedAt: Date.now(), ...display, ...competitor }, { merge: true })
      alerts.push(...evaluate(product, site, scraped.price, previousPrice, thresholdPct))
    }
  }
  return alerts
}
