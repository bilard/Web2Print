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
import type { EnrichedProduct, EnrichedSpec, EnrichedAdvantage, Pricing } from '@/features/excel/ai-enrichment/types'
import { normalizeSpecPairs } from '@/features/scraping/core/parsers/normalizeSpecPairs'
import { isSaneSpecPair } from '@/features/scraping/core/parsers/parseSpecifications'
import { readAdoptedKeys } from './useAdoptManufacturerSpec'
import { canonicalizeSpecName, canonicalLabel, normalizeSpecLabel, normalizeValueForCompare } from './specSynonyms'
import type { FieldComparison, LlmSpecPairs, VerdictSummary } from './types'

/** Parse « [Groupe]Texte | Texte2 » (avantages sérialisés) → EnrichedAdvantage[]. */
function parseSerializedAdvantages(raw: string): EnrichedAdvantage[] {
  return raw.split(' | ').map((chunk) => {
    const s = chunk.trim()
    if (!s) return null
    const gm = s.match(/^\[([^\]]+)\](.*)$/)
    return gm ? { text: gm[2].trim(), group: gm[1].trim() } : { text: s }
  }).filter((a): a is EnrichedAdvantage => a !== null && !!a.text)
}

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
  // Normaliseur universel : dédup (« Poids » ×2) + rejet des paires corrompues
  // (nom en forme de valeur, UUID, challenge anti-bot) + sanity canonique (UI,
  // adresse, financier) — même nettoyage que côté fabricant.
  const specifications = normalizeSpecPairs(specsRaw ? parseSerializedSpecs(specsRaw) : [])
    .filter((s) => isSaneSpecPair(s.name, s.value))
  const advRaw = has.has('ai_advantages') ? cell(row, 'ai_advantages') : null
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
    advantages: advRaw ? parseSerializedAdvantages(advRaw) : [],
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
  const specifications = normalizeSpecPairs(specsRaw ? parseSerializedSpecs(specsRaw) : [])
    .filter((s) => isSaneSpecPair(s.name, s.value))
  const advRaw = cell(row, 'ai_mfr_advantages')
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
    description: cell(row, 'ai_mfr_description') ?? '',
    advantages: advRaw ? parseSerializedAdvantages(advRaw) : [],
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
  const adoptedKeys = readAdoptedKeys(cell(row, 'ai_mfr_adopted'))
  return compareSourceVsManufacturer(source, mfr, pairs, adoptedKeys)
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

/** Dédup une liste de specs par (clé canonique|libellé normalisé, valeur normalisée) :
 *  collapse les doublons de FORMAT d'une même donnée (« 65 Nm » ≡ « 65 N.m »), sans
 *  fusionner deux valeurs réellement distinctes d'un même canon (54/30 vs 65). */
function dedupByCanonValue(specs: EnrichedSpec[]): EnrichedSpec[] {
  const seen = new Set<string>()
  const out: EnrichedSpec[] = []
  for (const s of specs) {
    const canon = canonicalizeSpecName(s.name) ?? normalizeSpecLabel(s.name)
    const k = `${canon}=${normalizeValueForCompare(s.value)}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
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
  adoptedKeys: Set<string> = new Set(),
): FieldComparison[] {
  const out: FieldComparison[] = []

  // 1. Identité
  for (const f of IDENTITY_FIELDS) {
    const row = idRow(f.key, f.label, f.get(source), f.get(mfr))
    if (row) out.push(row)
  }

  // 2. Prix — INFORMATIF (le prix fabricant est un tarif conseillé RRP, distinct
  //    du prix revendeur : on l'affiche côte à côte mais on ne le score jamais en
  //    « divergent »). On confronte le prix affiché de chaque côté.
  const srcPrice = priceStr(source.pricing, 'ttc') ?? priceStr(source.pricing, 'ht')
  const mfrPrice = priceStr(mfr.pricing, 'ttc') ?? priceStr(mfr.pricing, 'ht')
  if (srcPrice || mfrPrice) {
    // Comparaison honnête (RRP ≠ revendeur → souvent 'diff'), mais NON scoré
    // en divergent (cf. summarize) : c'est informatif.
    out.push({
      key: 'price:main', label: 'Prix (fabricant = conseillé)', group: 'price',
      sourceValue: srcPrice, mfrValue: mfrPrice, status: statusFor(srcPrice, mfrPrice),
    })
  }

  // 2bis. Contenu marketing — INFORMATIF (description, points forts). Montre ce
  //    que le fabricant apporte, non scoré en divergent.
  const srcDesc = (source.description ?? '').trim()
  const mfrDesc = (mfr.description ?? '').trim()
  if (srcDesc || mfrDesc) {
    out.push({
      key: 'content:description', label: 'Description', group: 'content',
      sourceValue: srcDesc || null, mfrValue: mfrDesc || null,
      status: mfrDesc ? (srcDesc ? 'match' : 'mfr-only') : 'source-only',
    })
  }
  // Points forts : on porte le TEXTE réel des puces (séparées par « • ») pour
  // pouvoir les AFFICHER, pas seulement les compter.
  const srcAdvText = source.advantages.map((a) => a.text.trim()).filter(Boolean).join(' • ')
  const mfrAdvText = mfr.advantages.map((a) => a.text.trim()).filter(Boolean).join(' • ')
  if (srcAdvText || mfrAdvText) {
    out.push({
      key: 'content:advantages', label: 'Points forts', group: 'content',
      sourceValue: srcAdvText || null, mfrValue: mfrAdvText || null,
      status: mfrAdvText ? (srcAdvText ? 'match' : 'mfr-only') : 'source-only',
    })
  }

  // 3. Specs. Dédup chaque côté par (clé canonique, valeur normalisée) : collapse
  //    les doublons de format (« 65 Nm » ≡ « 65 N.m ») avant l'appariement.
  const srcSpecs = dedupByCanonValue(source.specifications)
  const mfrSpecs = dedupByCanonValue(mfr.specifications)

  // Index fabricant : POOLS par canon (un canon peut porter plusieurs valeurs :
  //    couple 54/30 ET 65 Nm) + repli par libellé normalisé.
  const mfrByCanon = new Map<string, EnrichedSpec[]>()
  const mfrByNorm = new Map<string, EnrichedSpec>()
  for (const s of mfrSpecs) {
    const canon = canonicalizeSpecName(s.name)
    if (canon) { const a = mfrByCanon.get(canon); if (a) a.push(s); else mfrByCanon.set(canon, [s]) }
    const norm = normalizeSpecLabel(s.name)
    if (norm && !mfrByNorm.has(norm)) mfrByNorm.set(norm, s)
  }
  const consumedMfr = new Set<EnrichedSpec>()
  const usedKeys = new Set<string>()
  const uniqueKey = (base: string): string => {
    let k = base, i = 2
    while (usedKeys.has(k)) k = `${base}~${i++}`
    usedKeys.add(k)
    return k
  }

  for (const src of srcSpecs) {
    const canon = canonicalizeSpecName(src.name)
    const srcNorm = normalizeSpecLabel(src.name)
    let match: EnrichedSpec | undefined
    if (canon && mfrByCanon.has(canon)) {
      // Appariement par VALEUR d'abord (65 Nm ↔ 65 Nm), sinon 1re dispo du pool.
      const pool = mfrByCanon.get(canon)!.filter((m) => !consumedMfr.has(m))
      match = pool.find((m) => normalizeValueForCompare(m.value) === normalizeValueForCompare(src.value)) ?? pool[0]
    } else if (llmPairs[srcNorm] && mfrByNorm.has(llmPairs[srcNorm])) {
      const m = mfrByNorm.get(llmPairs[srcNorm]); if (m && !consumedMfr.has(m)) match = m
    } else if (mfrByNorm.has(srcNorm)) {
      const m = mfrByNorm.get(srcNorm); if (m && !consumedMfr.has(m)) match = m
    }
    if (match) consumedMfr.add(match)

    // 1re spec d'un canon → libellé canonique + clé `spec:canon`. Les suivantes
    //    gardent leur libellé BRUT (respect de la source), une clé unique, et sont
    //    marquées dupCanon (non adoptables — l'adoption par canon serait ambiguë).
    const canonTaken = !!canon && usedKeys.has(`spec:${canon}`)
    const label = canon && !canonTaken ? canonicalLabel(canon) : src.name
    const mfrValue = match ? match.value : null
    out.push({
      key: uniqueKey(canon ? `spec:${canon}` : `spec:${srcNorm}`),
      label, group: 'spec', sourceValue: src.value, mfrValue,
      status: statusFor(src.value, mfrValue), ...(canonTaken ? { dupCanon: true } : {}),
    })
  }

  // 4. Specs présentes SEULEMENT chez le fabricant (la « vérité » complémentaire).
  for (const s of mfrSpecs) {
    if (consumedMfr.has(s)) continue
    const canon = canonicalizeSpecName(s.name)
    const canonTaken = !!canon && usedKeys.has(`spec:${canon}`)
    out.push({
      key: uniqueKey(canon ? `spec:${canon}` : `spec:${normalizeSpecLabel(s.name)}`),
      label: canon && !canonTaken ? canonicalLabel(canon) : s.name,
      group: 'spec', sourceValue: null, mfrValue: s.value, status: 'mfr-only',
      ...(canonTaken ? { dupCanon: true } : {}),
    })
  }

  // Marquer les specs dont la valeur fabricant a été ADOPTÉE dans le master.
  if (adoptedKeys.size > 0) for (const c of out) if (adoptedKeys.has(c.key)) c.adopted = true

  return out
}

/** Compteurs pour la vue verdict. On ne score QUE les SPÉCIFICATIONS TECHNIQUES :
 *  c'est là qu'est « la vérité des données ». Identité (Rubix a ses propres réf/nom),
 *  prix (RRP ≠ revendeur) et contenu sont INFORMATIFS. La concordance produit est
 *  portée par le badge EAN, pas par le compteur. */
export function summarize(comparisons: FieldComparison[]): VerdictSummary {
  let confirmed = 0, completed = 0, divergent = 0
  const scored = comparisons.filter((c) => c.group === 'spec')
  for (const c of scored) {
    if (c.status === 'match') confirmed++
    else if (c.status === 'mfr-only') completed++
    else if (c.status === 'diff') divergent++
  }
  return { confirmed, completed, divergent, total: scored.length }
}
