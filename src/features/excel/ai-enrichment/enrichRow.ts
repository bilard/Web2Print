/**
 * enrichRow — adaptateur HEADLESS pour les nodes de workflow (scrape-url, enrichment).
 *
 * Depuis 2026-05-26, il délègue au MÊME moteur que le scraper PIM (`enrichProductCore`,
 * extrait de `useProductEnrichment`) : cascade anti-bot complète (CORS proxies → Jina →
 * Firecrawl → Bright Data Web Unlocker), JSON-LD, recherche site fabricant, specs KEY/VALUE,
 * filtrage d'images, etc. Le résultat `EnrichedProduct` est mappé vers les champs du template
 * du node + les assets. Une seule source de vérité de scraping pour le PIM et les workflows.
 */
import { enrichProductCore } from './useProductEnrichment'
import type { EnrichedProduct } from './types'
import { isJunkImageUrl, isPictoOrLogo } from './imageFilter'

export interface EnrichRowInput {
  url: string
  /** Champs à enrichir (clés du template, ex. ['name', 'description', 'specifications']). */
  targetFields: string[]
  /** Modèle LLM — ignoré : le moteur PIM route par tâche (cooldown inclus). Conservé pour compat. */
  model?: string
  /** Annulation best-effort (non propagée au moteur PIM pour l'instant). */
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

/** Mappe un EnrichedProduct (sortie moteur PIM) vers les clés de champs du template du node. */
export function mapProductToFields(
  p: EnrichedProduct,
  targetFields: string[],
): Record<string, unknown> {
  const getters: Record<string, () => string | null> = {
    name: () => p.name ?? null,
    title: () => p.name ?? null,
    reference: () => p.distributorRef ?? p.manufacturerRef ?? p.model ?? null,
    subtitle: () => p.model ?? null,
    description: () => p.description || null,
    breadcrumb: () => (p.breadcrumb?.length ? p.breadcrumb.join(' > ') : null),
    advantages: () => (p.advantages?.length ? p.advantages.map((a) => a.text).join('\n') : null),
    brand: () => p.brand ?? null,
    ean: () => p.ean ?? null,
    images: () => (p.images?.length ? p.images.join('\n') : null),
    specifications: () =>
      p.specifications?.length ? p.specifications.map((s) => `${s.name}: ${s.value}`).join('\n') : null,
    documents: () => (p.documents?.length ? p.documents.map((d) => d.url).join('\n') : null),
  }
  const out: Record<string, unknown> = {}
  for (const f of targetFields) {
    const g = getters[f]
    if (g) {
      out[f] = g()
    } else {
      const cf = p.customFields?.[f]
      out[f] = cf == null ? null : Array.isArray(cf) ? cf.join('\n') : cf
    }
  }
  return out
}

/** Assets exploitables : images produit (logos/pictos/tracking filtrés) + documents PDF. */
export function mapProductToAssets(p: EnrichedProduct): EnrichRowAsset[] {
  const images = (p.images ?? [])
    .filter((u) => u && !isJunkImageUrl(u) && !isPictoOrLogo(u))
    .map((u) => ({ url: u, type: 'image' as const }))
  const docs = (p.documents ?? [])
    .filter((d) => d.url)
    .map((d) => ({ url: d.url, type: 'pdf' as const }))
  return [...images, ...docs]
}

/**
 * Titre dérivé du slug de l'URL (même logique que le PIM/ScrapingModal). CRUCIAL : il permet au
 * moteur de se rabattre sur une RECHERCHE par titre (site fabricant / autre revendeur non bloqué)
 * quand l'URL directe est anti-bot. Sans titre, pas de fallback → on reste coincé sur l'URL bloquée.
 */
function deriveTitleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const slug = u.pathname.split('/').filter(Boolean).pop() ?? ''
    const title = slug.replace(/[-_]+/g, ' ').replace(/\.\w{2,4}$/, '').trim()
    return title || u.hostname
  } catch {
    return ''
  }
}

// IDENTIQUES au PIM ScrapingModal (sheetName + dérivation rowId) → même clé de cache mémoire, donc
// même comportement : le workflow et « Scraper le web » partagent leurs scrapes dans la session.
const SCRAPE_MODAL_SHEET = '__scrape_modal__'
function deriveScrapeRowId(url: string): string {
  try {
    return new URL(url).pathname.replace(/[^a-z0-9]/gi, '_').slice(0, 80) || 'pending'
  } catch {
    return 'pending'
  }
}


export async function enrichRow(input: EnrichRowInput): Promise<EnrichRowResult> {
  const { url, targetFields, log } = input
  if (!url) throw new Error('enrichRow: url manquante')
  if (!targetFields || targetFields.length === 0) throw new Error('enrichRow: targetFields vide')

  const title = deriveTitleFromUrl(url)
  log?.(`[enrichRow] enrichissement (moteur PIM) ${url}${title ? ` — titre « ${title} »` : ''}`)

  // Appel STRICTEMENT identique à « Scraper le web » du PIM (ScrapingModal) : mêmes sheetName/rowId
  // (clé de cache mémoire Zustand — PAS localStorage), même titre, même knownUrl, UN seul appel.
  // → le workflow se comporte exactement comme le PIM : réutilise un scrape réussi dans la session,
  // sinon scrape frais identique. Pas de retry (le PIM n'en fait pas — éviter d'épuiser Bright Data).
  const product = await enrichProductCore({
    sheetName: SCRAPE_MODAL_SHEET,
    rowId: deriveScrapeRowId(url),
    title,
    knownUrl: url,
    mode: 'auto',
  })

  if (!product) {
    log?.('[enrichRow] moteur PIM : aucune donnée')
    return { fields: Object.fromEntries(targetFields.map((f) => [f, null])), assets: [] }
  }

  const assets = mapProductToAssets(product)
  log?.(
    `[enrichRow] moteur PIM ✓ — ${product.specifications?.length ?? 0} specs, ${assets.length} asset(s)` +
      `${product.scrapingProvider ? `, via ${product.scrapingProvider}` : ''}` +
      `${product.llmProvider ? `, LLM ${product.llmProvider}` : ''}` +
      `${product.blockedByAntiBot ? ' ⚠️ anti-bot non résolu' : ''}`,
  )
  return { fields: mapProductToFields(product, targetFields), assets }
}
