// src/features/priceWatch/core.ts
// Logique PURE de la veille tarifaire (aucune dépendance Firebase/React).
// Dupliquée côté serveur (functions/.../priceWatchTrack.ts) — convention
// wire-compatible (cf. parsePrice/diffPriceRows du node price-watch).
import type { TrackedProduct, CompetitorSite, HistoryPoint, PriceWatchAlert } from './types'

export interface RelationalKey {
  kind: 'sku' | 'ean' | 'name'
  value: string
}

/** Clé relationnelle d'un produit : SKU → EAN → (Marque + Nom). */
export function relationalKey(p: TrackedProduct): RelationalKey {
  if (p.sku?.trim()) return { kind: 'sku', value: p.sku.trim() }
  if (p.ean?.trim()) return { kind: 'ean', value: p.ean.trim() }
  return { kind: 'name', value: [p.brand, p.name].filter(Boolean).join(' ').trim() }
}

/** Construit une URL depuis un gabarit `{sku}/{ean}/{name}`. null si un placeholder
 *  requis manque, ou si pas de pattern. */
export function buildPatternUrl(
  pattern: string | undefined,
  p: TrackedProduct,
): string | null {
  if (!pattern?.trim()) return null
  const values: Record<string, string | undefined> = { sku: p.sku, ean: p.ean, name: p.name }
  let missing = false
  const url = pattern.replace(/\{(sku|ean|name)\}/g, (_, k: string) => {
    const v = values[k]
    if (!v?.trim()) { missing = true; return '' }
    return encodeURIComponent(v.trim())
  })
  return missing ? null : url
}

/** Requêtes de recherche scopées domaine, par ordre de fiabilité. */
export function discoveryQueries(domain: string, p: TrackedProduct): string[] {
  const queries: string[] = []
  if (p.sku?.trim()) queries.push(`site:${domain} ${p.sku.trim()}`)
  else if (p.ean?.trim()) queries.push(`site:${domain} ${p.ean.trim()}`)
  const nameQuery = [p.brand, p.name].filter(Boolean).join(' ').trim()
  if (nameQuery) queries.push(`site:${domain} ${nameQuery}`)
  return queries
}

/** Premier résultat dont l'URL appartient au domaine cible. */
export function pickCandidate(
  results: { url: string }[],
  domain: string,
): string | null {
  const d = domain.replace(/^www\./, '')
  const hit = results.find((r) => {
    try { return new URL(r.url).hostname.replace(/^www\./, '').endsWith(d) }
    catch { return false }
  })
  return hit?.url ?? null
}

/** Parse un prix : « 1 299,90 € » → 1299.9. NaN si illisible. (Identique au node price-watch.) */
export function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const cleaned = v.replace(/[\s€$£]/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  return cleaned ? parseFloat(cleaned) : NaN
}

/** Ring buffer borné : ajoute un point et garde les `maxLen` plus récents. */
export function pushHistory(history: HistoryPoint[], point: HistoryPoint, maxLen: number): HistoryPoint[] {
  const next = [...history, point]
  return next.length > maxLen ? next.slice(next.length - maxLen) : next
}

/** Prompt de validation : le produit correspond-il à la page candidate ? */
export function buildMatchPrompt(
  p: { name: string; brand?: string; sku?: string; ean?: string },
  pageContent: string,
): string {
  return (
    `On veut vérifier qu'une page concurrente décrit EXACTEMENT le produit suivant.\n` +
    `Produit : nom="${p.name}", marque="${p.brand ?? ''}", sku="${p.sku ?? ''}", ean="${p.ean ?? ''}".\n` +
    `Réponds UNIQUEMENT par un JSON {"confidence": number} entre 0 (produit différent) ` +
    `et 1 (même produit, même variante).\n\n--- PAGE ---\n${pageContent.slice(0, 6000)}`
  )
}

/** Lit la confiance d'une réponse LLM, bornée à [0,1]. 0 si illisible. */
export function parseMatchVerdict(text: string): number {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return 0
  try {
    const n = Number((JSON.parse(m[0]) as { confidence?: unknown }).confidence)
    if (Number.isNaN(n)) return 0
    return Math.max(0, Math.min(1, n))
  } catch { return 0 }
}

/**
 * Compare un relevé concurrent au produit et au relevé précédent → alertes.
 * - positioning : competitorPrice < myPrice
 * - competitor-variation : |Δ| / prev ≥ thresholdPct (premier relevé = silencieux)
 */
export function evaluate(
  product: { id: string; name: string; myPrice?: number },
  site: { id: string; domain: string },
  competitorPrice: number,
  previousPrice: number | undefined,
  thresholdPct: number,
): PriceWatchAlert[] {
  const alerts: PriceWatchAlert[] = []
  const common = {
    productId: product.id, productName: product.name,
    siteId: site.id, domain: site.domain, myPrice: product.myPrice, competitorPrice,
  }
  if (product.myPrice != null && competitorPrice < product.myPrice) {
    alerts.push({
      ...common, kind: 'positioning',
      message: `${product.name} : ${site.domain} à ${competitorPrice} € < votre prix ${product.myPrice} €`,
    })
  }
  if (previousPrice != null && previousPrice !== competitorPrice) {
    const deltaPct = previousPrice === 0 ? 100 : Math.abs((competitorPrice - previousPrice) / previousPrice) * 100
    if (deltaPct >= thresholdPct) {
      alerts.push({
        ...common, kind: 'competitor-variation',
        previousPrice,
        variationPct: Math.round(((competitorPrice - previousPrice) / (previousPrice || 1)) * 1000) / 10,
        message: `${product.name} : ${site.domain} ${previousPrice} € → ${competitorPrice} €`,
      })
    }
  }
  return alerts
}

/** Identifiant Firestore stable et déterministe (clé relationnelle nettoyée). */
export function stableId(value: string): string {
  return value.toLowerCase().replace(/[/#?[\]\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 200) || 'x'
}

/** Mapping colonne → champ produit (la valeur est le NOM de colonne dans la feuille). */
export interface ProductColumnMap {
  sku?: string
  ean?: string
  name: string
  brand?: string
  price?: string
}

function cell(row: Record<string, unknown>, col: string | undefined): string | undefined {
  if (!col) return undefined
  const v = row[col]
  return v == null ? undefined : String(v).trim() || undefined
}

/**
 * Construit les produits à surveiller depuis les lignes d'une feuille d'entrée.
 * L'id est dérivé de la clé relationnelle (SKU → EAN → marque+nom) → stable entre
 * deux runs (les matchs/historique persistent). Lignes sans clé exploitable ignorées.
 */
export function parseProductsFromSheet(
  rows: Record<string, unknown>[],
  map: ProductColumnMap,
): TrackedProduct[] {
  const out: TrackedProduct[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const name = cell(row, map.name) ?? ''
    const sku = cell(row, map.sku)
    const ean = cell(row, map.ean)
    const brand = cell(row, map.brand)
    if (!name && !sku && !ean) continue
    const priceRaw = cell(row, map.price)
    const myPrice = priceRaw != null ? parsePrice(priceRaw) : NaN
    const partial: TrackedProduct = { id: 'x', name: name || (sku ?? ean ?? ''), sku, ean, brand }
    const id = stableId(relationalKey(partial).value)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ ...partial, id, myPrice: Number.isNaN(myPrice) ? undefined : myPrice })
  }
  return out
}

/**
 * Parse la config « sites » (une ligne par site). Format :
 *   exemple.com
 *   exemple.com | price, availability
 * Le `|` sépare le domaine des champs à scraper (défaut : ['price']). id = domaine nettoyé.
 */
export function parseSitesConfig(text: string): CompetitorSite[] {
  const out: CompetitorSite[] = []
  const seen = new Set<string>()
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [domainRaw, fieldsRaw] = trimmed.split('|')
    const domain = domainRaw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!domain) continue
    const id = stableId(domain)
    if (seen.has(id)) continue
    seen.add(id)
    const fields = (fieldsRaw ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)
    out.push({ id, domain, fields: fields.length ? fields : ['price'] })
  }
  return out
}
