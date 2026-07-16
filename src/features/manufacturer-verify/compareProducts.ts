/**
 * Comparaison Source (revendeur) ⇄ Fabricant.
 *
 * - `sheetRowToEnrichedProduct` reconstruit un EnrichedProduct depuis les colonnes
 *   `ai_*` sérialisées d'une ligne (la source vit sérialisée sur une fiche déjà
 *   persistée — pas comme objet en mémoire).
 * - `compareSourceVsManufacturer` aligne identité / prix / specs et classe chaque
 *   champ (match / diff / mfr-only / source-only). PUR et synchrone : l'alignement
 *   LLM des specs inconnues est calculé en amont (alignSpecs.ts) et passé en
 *   paramètre `llmPairs` — aucun appel réseau ici, donc aucun coût à la ré-ouverture.
 */

import type { ExcelColumn, ExcelRow } from '@/features/excel/types'
import type { EnrichedProduct, EnrichedSpec, Pricing } from '@/features/excel/ai-enrichment/types'
import { canonicalizeSpecName, canonicalLabel, normalizeSpecLabel, normalizeValueForCompare } from './specSynonyms'
import type { FieldComparison, LlmSpecPairs, VerdictSummary } from './types'

// ── Désérialisation d'une ligne (colonnes ai_*) → EnrichedProduct ────────────

/** Parse « [Groupe]Nom: Valeur | Nom2: Valeur2 » → EnrichedSpec[]. */
function parseSerializedSpecs(raw: string): EnrichedSpec[] {
  return raw
    .split(' | ')
    .map((chunk): EnrichedSpec | null => {
      const s = chunk.trim()
      if (!s) return null
      let group: string | undefined
      let rest = s
      const gm = s.match(/^\[([^\]]+)\](.*)$/)
      if (gm) { group = gm[1].trim(); rest = gm[2] }
      const idx = rest.indexOf(':')
      if (idx === -1) return null
      const name = rest.slice(0, idx).trim()
      const value = rest.slice(idx + 1).trim()
      if (!name || !value) return null
      return group ? { name, value, group } : { name, value }
    })
    .filter((s): s is EnrichedSpec => s !== null)
}

function parsePricing(raw: string): Pricing | undefined {
  try {
    const p = JSON.parse(raw) as Pricing
    return p && typeof p === 'object' ? p : undefined
  } catch {
    return undefined
  }
}

const cell = (row: ExcelRow, key: string): string | null => {
  const v = row[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * Reconstruit un EnrichedProduct depuis les colonnes `ai_*` d'une ligne.
 * Inverse (partiel) de `serializeEnriched` — ne restitue que ce qui sert à la
 * comparaison (identité, prix, specs, images). Retourne null si la ligne ne
 * porte aucune donnée scrapée exploitable.
 */
export function sheetRowToEnrichedProduct(row: ExcelRow, columns: ExcelColumn[]): EnrichedProduct | null {
  const has = new Set(columns.map((c) => c.key))
  const specsRaw = has.has('ai_specifications') ? cell(row, 'ai_specifications') : null
  const specifications = specsRaw ? parseSerializedSpecs(specsRaw) : []
  const pricingRaw = has.has('ai_pricing') ? cell(row, 'ai_pricing') : null
  const imagesRaw = has.has('ai_images') ? cell(row, 'ai_images') : null

  const name = cell(row, 'ai_name')
  const hasAny = name || specifications.length > 0 || pricingRaw || cell(row, 'ai_brand')
  if (!hasAny) return null

  return {
    name: name ?? undefined,
    brand: cell(row, 'ai_brand') ?? undefined,
    model: cell(row, 'ai_model') ?? undefined,
    distributorRef: cell(row, 'ai_distributor_ref') ?? undefined,
    manufacturerRef: cell(row, 'ai_manufacturer_ref') ?? undefined,
    ean: cell(row, 'ai_ean') ?? undefined,
    subtitle: cell(row, 'ai_subtitle') ?? undefined,
    description: cell(row, 'ai_description') ?? '',
    breadcrumb: undefined,
    advantages: [],
    specifications,
    variants: [],
    images: imagesRaw ? imagesRaw.split(' | ').map((s) => s.trim()).filter(Boolean) : [],
    documents: [],
    pricing: pricingRaw ? parsePricing(pricingRaw) : undefined,
    sourceUrl: cell(row, 'ai_source'),
    additionalSources: [],
    generatedAt: 0,
  }
}

/**
 * Reconstruit l'EnrichedProduct FABRICANT depuis les colonnes `ai_mfr_*`.
 * Retourne null si la fiche n'a pas encore été vérifiée chez le fabricant.
 */
function rowToManufacturerProduct(row: ExcelRow, columns: ExcelColumn[]): EnrichedProduct | null {
  const has = new Set(columns.map((c) => c.key))
  if (!has.has('ai_mfr_specifications') && !has.has('ai_mfr_name') && !has.has('ai_mfr_pricing')) return null
  const specsRaw = cell(row, 'ai_mfr_specifications')
  const specifications = specsRaw ? parseSerializedSpecs(specsRaw) : []
  const name = cell(row, 'ai_mfr_name')
  const pricingRaw = cell(row, 'ai_mfr_pricing')
  const imagesRaw = cell(row, 'ai_mfr_images')
  if (!name && specifications.length === 0 && !pricingRaw) return null
  return {
    name: name ?? undefined,
    brand: cell(row, 'ai_mfr_brand') ?? undefined,
    model: cell(row, 'ai_mfr_model') ?? undefined,
    manufacturerRef: cell(row, 'ai_mfr_manufacturer_ref') ?? undefined,
    ean: cell(row, 'ai_mfr_ean') ?? undefined,
    description: '',
    advantages: [],
    specifications,
    variants: [],
    images: imagesRaw ? imagesRaw.split(' | ').map((s) => s.trim()).filter(Boolean) : [],
    documents: [],
    pricing: pricingRaw ? parsePricing(pricingRaw) : undefined,
    sourceUrl: cell(row, 'ai_mfr_source'),
    additionalSources: [],
    generatedAt: 0,
  }
}

/**
 * Recompose la comparaison Source ⇄ Fabricant d'une ligne DÉJÀ vérifiée, de façon
 * DÉTERMINISTE (aucun LLM) : l'alignement des specs a été figé dans
 * `ai_mfr_alignment` au moment du scrape. Retourne null si non vérifiée.
 */
export function buildRowComparison(row: ExcelRow, columns: ExcelColumn[]): FieldComparison[] | null {
  const mfr = rowToManufacturerProduct(row, columns)
  if (!mfr) return null
  const source = sheetRowToEnrichedProduct(row, columns)
  if (!source) return null
  let pairs: LlmSpecPairs = {}
  const alignRaw = cell(row, 'ai_mfr_alignment')
  if (alignRaw) {
    try { pairs = JSON.parse(alignRaw) as LlmSpecPairs } catch { pairs = {} }
  }
  return compareSourceVsManufacturer(source, mfr, pairs)
}

// ── Comparaison ──────────────────────────────────────────────────────────────

function statusFor(sourceValue: string | null, mfrValue: string | null): FieldComparison['status'] {
  if (sourceValue && mfrValue) {
    return normalizeValueForCompare(sourceValue) === normalizeValueForCompare(mfrValue) ? 'match' : 'diff'
  }
  if (mfrValue) return 'mfr-only'
  return 'source-only'
}

function idRow(key: string, label: string, sourceValue: string | null, mfrValue: string | null): FieldComparison | null {
  if (!sourceValue && !mfrValue) return null
  return { key, label, group: 'identity', sourceValue, mfrValue, status: statusFor(sourceValue, mfrValue) }
}

const IDENTITY_FIELDS: Array<{ key: string; label: string; get: (p: EnrichedProduct) => string | null }> = [
  { key: 'id:name', label: 'Nom', get: (p) => p.name ?? null },
  { key: 'id:brand', label: 'Marque', get: (p) => p.brand ?? null },
  { key: 'id:model', label: 'Modèle', get: (p) => p.model ?? null },
  { key: 'id:manufacturerRef', label: 'Réf. fabricant', get: (p) => p.manufacturerRef ?? null },
  { key: 'id:ean', label: 'EAN', get: (p) => p.ean ?? null },
]

function priceStr(pricing: Pricing | undefined, field: 'ttc' | 'ht' | 'original'): string | null {
  const n = pricing?.[field]
  return typeof n === 'number' ? String(n) : null
}

/**
 * Compare identité + prix + specs. `llmPairs` (optionnel) rapproche les specs
 * dont ni la source ni le fabricant n'ont de clé canonique connue
 * (clés = libellés source normalisés → libellés fabricant normalisés).
 */
export function compareSourceVsManufacturer(
  source: EnrichedProduct,
  mfr: EnrichedProduct,
  llmPairs: LlmSpecPairs = {},
): FieldComparison[] {
  const out: FieldComparison[] = []

  // 1. Identité
  for (const f of IDENTITY_FIELDS) {
    const row = idRow(f.key, f.label, f.get(source), f.get(mfr))
    if (row) out.push(row)
  }

  // 2. Prix
  const priceFields: Array<{ key: string; label: string; f: 'ttc' | 'ht' | 'original' }> = [
    { key: 'price:ttc', label: 'Prix TTC', f: 'ttc' },
    { key: 'price:ht', label: 'Prix HT', f: 'ht' },
    { key: 'price:original', label: 'Prix barré', f: 'original' },
  ]
  for (const pf of priceFields) {
    const sv = priceStr(source.pricing, pf.f)
    const mv = priceStr(mfr.pricing, pf.f)
    if (!sv && !mv) continue
    out.push({ key: pf.key, label: pf.label, group: 'price', sourceValue: sv, mfrValue: mv, status: statusFor(sv, mv) })
  }

  // 3. Specs — index fabricant par clé canonique et par libellé normalisé.
  const mfrByCanon = new Map<string, EnrichedSpec>()
  const mfrByNorm = new Map<string, EnrichedSpec>()
  for (const s of mfr.specifications) {
    const canon = canonicalizeSpecName(s.name)
    if (canon && !mfrByCanon.has(canon)) mfrByCanon.set(canon, s)
    const norm = normalizeSpecLabel(s.name)
    if (norm && !mfrByNorm.has(norm)) mfrByNorm.set(norm, s)
  }
  const consumedMfr = new Set<EnrichedSpec>()

  for (const src of source.specifications) {
    const canon = canonicalizeSpecName(src.name)
    const srcNorm = normalizeSpecLabel(src.name)
    let match: EnrichedSpec | undefined

    if (canon && mfrByCanon.has(canon)) {
      match = mfrByCanon.get(canon)
    } else if (llmPairs[srcNorm] && mfrByNorm.has(llmPairs[srcNorm])) {
      match = mfrByNorm.get(llmPairs[srcNorm])
    } else if (mfrByNorm.has(srcNorm)) {
      match = mfrByNorm.get(srcNorm)
    }
    if (match) consumedMfr.add(match)

    const label = canon ? canonicalLabel(canon) : src.name
    const mfrValue = match ? match.value : null
    out.push({
      key: canon ? `spec:${canon}` : `spec:${srcNorm}`,
      label,
      group: 'spec',
      sourceValue: src.value,
      mfrValue,
      status: statusFor(src.value, mfrValue),
    })
  }

  // 4. Specs présentes SEULEMENT chez le fabricant (la « vérité » complémentaire).
  for (const s of mfr.specifications) {
    if (consumedMfr.has(s)) continue
    const canon = canonicalizeSpecName(s.name)
    out.push({
      key: canon ? `spec:${canon}` : `spec:${normalizeSpecLabel(s.name)}`,
      label: canon ? canonicalLabel(canon) : s.name,
      group: 'spec',
      sourceValue: null,
      mfrValue: s.value,
      status: 'mfr-only',
    })
  }

  return out
}

/** Compteurs pour la vue verdict. */
export function summarize(comparisons: FieldComparison[]): VerdictSummary {
  let confirmed = 0, completed = 0, divergent = 0
  for (const c of comparisons) {
    if (c.status === 'match') confirmed++
    else if (c.status === 'mfr-only') completed++
    else if (c.status === 'diff') divergent++
  }
  return { confirmed, completed, divergent, total: comparisons.length }
}
