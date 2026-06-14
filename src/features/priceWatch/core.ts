// src/features/priceWatch/core.ts
// Logique PURE de la veille tarifaire (aucune dépendance Firebase/React).
// Dupliquée côté serveur (functions/.../priceWatchTrack.ts) — convention
// wire-compatible (cf. parsePrice/diffPriceRows du node price-watch).
import type { TrackedProduct } from './types'

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
