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
import { isJunkImageUrl, classifyImage, getProductRefs } from './imageFilter'
import {
  brightDataScrapeWithDocs,
  getLastBrightDataError,
} from '@/features/scraping/core/brightDataFallback'
import { looksLikeBotChallenge } from './markdownSanitize'
import { parseSpecsFromMarkdown } from '@/features/scraping/core/parsers/parseSpecifications'

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

/** Assets exploitables : photos produit (même classifieur que le PIM) + documents PDF. */
export function mapProductToAssets(p: EnrichedProduct): EnrichRowAsset[] {
  // Réfs produit pour la classification photo/picto — exactement comme l'onglet « Photos » du PIM.
  const refs = getProductRefs({
    specifications: p.specifications,
    variants: p.variants,
    title: p.name,
    sourceUrl: p.sourceUrl,
  })
  const images = (p.images ?? [])
    .filter((u) => {
      if (!u || isJunkImageUrl(u)) return false
      // Override manuel du PIM prioritaire, sinon le classifieur partagé.
      const klass = p.imageClassOverrides?.[u] ?? classifyImage(u, refs)
      return klass === 'photo'
    })
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

/** Produit vide/bloqué = pas de specs, pas d'images, pas de description (ou flag anti-bot). */
function isEmptyProduct(p: EnrichedProduct | null): boolean {
  return (
    !p ||
    p.blockedByAntiBot === true ||
    (!p.specifications?.length && !p.images?.length && !p.description?.trim())
  )
}

/** URLs d'images du markdown (bloc JINA_EXTRACTED_IMAGES + liens inline avec extension). */
function imagesFromMarkdown(md: string): string[] {
  const out = new Set<string>()
  const block = md.match(/JINA_EXTRACTED_IMAGES_START\s*([\s\S]*?)\s*JINA_EXTRACTED_IMAGES_END/i)
  if (block) for (const line of block[1].split('\n')) {
    const u = line.trim()
    if (/^https?:\/\//i.test(u)) out.add(u)
  }
  for (const m of md.matchAll(/https?:\/\/[^\s)<>"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s)<>"']*)?/gi)) {
    out.add(m[0])
  }
  return Array.from(out)
}

function mergeSpecsByName(
  a: Array<{ name: string; value: string }>,
  b: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  const seen = new Set<string>()
  const out: Array<{ name: string; value: string }> = []
  for (const s of [...a, ...b]) {
    const k = s.name?.trim().toLowerCase()
    if (!k || !s.value?.trim() || seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

/**
 * Fallback DIRECT Bright Data Web Unlocker — appelé quand le moteur PIM revient bloqué. GARANTIT
 * l'usage du Web Unlocker (financé mais sous-utilisé par le moteur). Construit un EnrichedProduct
 * depuis le JSON-LD + specs markdown + images du HTML débloqué par Bright Data (résidentiel → passe
 * DataDome). Renvoie null si Bright Data échoue ou renvoie encore une page challenge.
 */
async function scrapeViaBrightDataDirect(
  url: string,
  log?: (m: string) => void,
): Promise<EnrichedProduct | null> {
  log?.('[enrichRow] moteur bloqué → appel DIRECT Bright Data Web Unlocker…')
  let bd: Awaited<ReturnType<typeof brightDataScrapeWithDocs>>
  try {
    bd = await brightDataScrapeWithDocs(url)
  } catch (err) {
    log?.(`[enrichRow] Bright Data direct : exception ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
  if (!bd?.markdown) {
    const e = getLastBrightDataError()
    log?.(`[enrichRow] Bright Data direct échoué${e ? ` (${e.code} : ${e.message.slice(0, 120)})` : ' (aucune réponse)'}`)
    return null
  }
  if (looksLikeBotChallenge(bd.markdown)) {
    log?.('[enrichRow] Bright Data direct : page anti-bot renvoyée (DataDome non résolu)')
    return null
  }
  const sd = bd.structuredData
  const specs = mergeSpecsByName(sd?.specs ?? [], parseSpecsFromMarkdown(bd.markdown))
  log?.(`[enrichRow] Bright Data direct ✓ — ${specs.length} specs`)
  return {
    name: sd?.name,
    brand: sd?.brand,
    distributorRef: sd?.sku,
    manufacturerRef: sd?.mpn,
    ean: sd?.gtin,
    description: sd?.description ?? '',
    breadcrumb: sd?.category ? [sd.category] : undefined,
    specifications: specs,
    images: [...(sd?.images ?? []), ...imagesFromMarkdown(bd.markdown)],
    documents: bd.pdfLinks.map((d) => ({ name: d.name, url: d.url, filename: d.name })),
    advantages: [],
    variants: [],
    sourceUrl: url,
    additionalSources: [],
    generatedAt: Date.now(),
    scrapingProvider: 'bright-data-direct',
  }
}

export async function enrichRow(input: EnrichRowInput): Promise<EnrichRowResult> {
  const { url, targetFields, log } = input
  if (!url) throw new Error('enrichRow: url manquante')
  if (!targetFields || targetFields.length === 0) throw new Error('enrichRow: targetFields vide')

  const title = deriveTitleFromUrl(url)
  log?.(`[enrichRow] enrichissement (moteur PIM) ${url}${title ? ` — titre « ${title} »` : ''}`)

  // 1) Moteur PIM (un essai — réussit vite sur les sites accessibles, parfois via Jina sur DataDome).
  let product = await enrichProductCore({
    sheetName: SCRAPE_MODAL_SHEET,
    rowId: deriveScrapeRowId(url),
    title,
    knownUrl: url,
    mode: 'auto',
  })

  // 2) Si bloqué/vide → appel DIRECT au Web Unlocker Bright Data (financé mais sous-utilisé par le
  //    moteur). C'est le seul moyen fiable de passer DataDome (IPs résidentielles). Garantit l'usage
  //    du Web Unlocker → la conso Bright Data doit monter, et la donnée arriver sur ces sites.
  if (isEmptyProduct(product)) {
    const bd = await scrapeViaBrightDataDirect(url, log)
    if (bd && !isEmptyProduct(bd)) product = bd
  }

  if (isEmptyProduct(product)) {
    log?.('[enrichRow] aucune donnée (moteur + Bright Data direct épuisés)')
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
