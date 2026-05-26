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


export async function enrichRow(input: EnrichRowInput): Promise<EnrichRowResult> {
  const { url, targetFields, log } = input
  if (!url) throw new Error('enrichRow: url manquante')
  if (!targetFields || targetFields.length === 0) throw new Error('enrichRow: targetFields vide')

  const title = deriveTitleFromUrl(url)
  log?.(`[enrichRow] enrichissement (moteur PIM) ${url}${title ? ` — titre « ${title} »` : ''}`)

  // Bright Data Web Unlocker réussit par INTERMITTENCE sur les sites DataDome (Leroy Merlin) :
  // on réessaie tant que le résultat est bloqué/vide. Les sites accessibles réussissent au 1er coup
  // (pas de retry). Même rowId entre essais → host marqué bloqué → on va direct sur Bright Data.
  const rowId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const isEmpty = (p: EnrichedProduct | null): boolean =>
    !p || p.blockedByAntiBot === true ||
    (!(p.specifications?.length) && !(p.images?.length) && !p.description?.trim())

  let product: EnrichedProduct | null = null
  const MAX_ATTEMPTS = 3
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    product = await enrichProductCore({ sheetName: 'workflow', rowId, title, knownUrl: url, mode: 'auto' })
    if (!isEmpty(product)) break
    if (attempt < MAX_ATTEMPTS) {
      log?.(`[enrichRow] anti-bot — essai ${attempt}/${MAX_ATTEMPTS} bloqué, nouvelle tentative Bright Data…`)
    }
  }

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
