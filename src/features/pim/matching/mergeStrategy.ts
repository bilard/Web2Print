import type { Product, ProductField, MergePreview, PreviewRow, SourceLink } from '../types'
import type { CellValue } from '@/features/excel/types'

/** Champs jamais consolidés sur le master ; toujours par-source dans snapshot. */
export const PER_SOURCE_FIELDS = new Set([
  'price',
  'price_ttc',
  'price_ht',
  'currency',
  'image',
  'image_url',
  'images',
  'stock',
  'availability',
  'external_url',
  'url',
  'product_url',
  'source_url',
  'sku',
  'ean',
  'gtin',
  'ref',
  'reference',
  'code',
])

interface Options {
  /** Permet l'injection d'un horloge pour les tests. */
  now: number
}

interface ApplyResult {
  /** Liste des produits master après application (créés + mergés). Pas de mutation : nouveaux objets. */
  products: Product[]
  /** Compteurs pour UI / logs. */
  stats: { created: number; merged: number; needsDedup: number }
}

export function applyPreview(
  preview: MergePreview,
  existing: Product[],
  sourceId: string,
  opts: Options,
): ApplyResult {
  const productsById = new Map<string, Product>()
  const created: Product[] = []
  let mergedCount = 0
  let needsDedupCount = 0

  // Indexe les produits existants par ID
  existing.forEach((p) => {
    productsById.set(p._id, p)
  })

  // 1. Crée les nouveaux masters (newMasters)
  preview.newMasters.forEach((row, idx) => {
    const product = createMaster(row, sourceId, opts.now, false)
    created.push(product)
    productsById.set(product._id, product)
    // mémorise l'index pour batch:N → product._id
    productsById.set(`batch:${idx}`, product)
  })

  // 2. Merge sur masters existants ou batch
  preview.mergedOnExisting.forEach((merge) => {
    const target = productsById.get(merge.targetProductId)
    if (!target) return
    const updated = mergeIntoMaster(target, merge.snapshot, sourceId, opts.now)
    productsById.set(target._id, updated)
    mergedCount++
  })

  // 3. needsDedup : crée master synthétique avec flag
  preview.needsDedup.forEach((row) => {
    const product = createMaster(row, sourceId, opts.now, true)
    created.push(product)
    productsById.set(product._id, product)
    needsDedupCount++
  })

  // Récupère uniquement les products réels (filtre les alias batch:N)
  const realProducts: Product[] = []
  for (const [key, value] of productsById.entries()) {
    if (!key.startsWith('batch:')) {
      realProducts.push(value)
    }
  }

  return {
    products: realProducts,
    stats: { created: created.length - needsDedupCount, merged: mergedCount, needsDedup: needsDedupCount },
  }
}

function createMaster(
  row: PreviewRow,
  sourceId: string,
  now: number,
  needsDedup: boolean,
): Product {
  const fields: Record<string, ProductField> = {}
  for (const [k, v] of Object.entries(row.snapshot)) {
    if (PER_SOURCE_FIELDS.has(k)) continue
    fields[k] = { value: v, winningSourceId: sourceId }
  }
  const link: SourceLink = makeSourceLink(sourceId, row.snapshot)
  return {
    _id: needsDedup
      ? `dedup_${sourceId}_${row.rowIndex}_${now}`
      : `prod_${row.detectedSku ?? `idx${row.rowIndex}`}_${now}`,
    masterSku: row.detectedSku,
    masterEan: extractString(row.snapshot.ean) ?? extractString(row.snapshot.gtin) ?? null,
    primarySourceId: sourceId,
    fields,
    sourceLinks: [link],
    taxonomyPath: [],
    needsDedup,
    createdAt: now,
    updatedAt: now,
  }
}

function mergeIntoMaster(
  target: Product,
  snapshot: Record<string, CellValue>,
  sourceId: string,
  now: number,
): Product {
  const newFields: Record<string, ProductField> = { ...target.fields }
  for (const [k, v] of Object.entries(snapshot)) {
    if (PER_SOURCE_FIELDS.has(k)) continue
    const existing = newFields[k]
    if (existing?.overridden) continue // verrouillé
    if (existing && existing.winningSourceId !== sourceId) {
      // Source primaire gagne par défaut → on ne change pas si valeur existante
      if (target.primarySourceId !== sourceId) continue
    }
    newFields[k] = { ...existing, value: v, winningSourceId: sourceId }
  }
  const link: SourceLink = makeSourceLink(sourceId, snapshot)
  // Remplace le link existant pour cette sourceId, ou ajoute
  const existingLinkIdx = target.sourceLinks.findIndex((sl) => sl.sourceId === sourceId)
  const newLinks =
    existingLinkIdx >= 0
      ? target.sourceLinks.map((sl, i) => (i === existingLinkIdx ? link : sl))
      : [...target.sourceLinks, link]

  return { ...target, fields: newFields, sourceLinks: newLinks, updatedAt: now }
}

function extractString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Construit un SourceLink en omettant les clés undefined (Firestore les rejette). */
function makeSourceLink(sourceId: string, snapshot: Record<string, CellValue>): SourceLink {
  const externalSku = extractString(snapshot.sku) ?? extractString(snapshot.ref)
  const externalUrl = extractString(snapshot.url) ?? extractString(snapshot.external_url)
  const link: SourceLink = { sourceId, snapshot }
  if (externalSku !== undefined) link.externalSku = externalSku
  if (externalUrl !== undefined) link.externalUrl = externalUrl
  return link
}
