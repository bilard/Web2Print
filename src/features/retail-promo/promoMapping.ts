import { getRowValue } from '@/features/merge/mergeEngine'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFields, PromoFieldKey } from './promoTypes'
import { parsePrice, computeMechanism } from './priceParse'

/** Indices de devinage : libellés/aliases (en minuscules) qui pointent vers chaque champ promo. */
const GUESS: Partial<Record<PromoFieldKey, string[]>> = {
  name: ['nom', 'name', 'libelle', 'libellé', 'désignation', 'designation', 'ai_name'],
  image: ['image (dam)', 'image(dam)', 'image_dam', 'image dam', 'images', 'image', 'photo', 'visuel', 'ai_images'],
  brand: ['marque', 'brand', 'ai_brand'],
  ref: ['référence', 'reference', 'ref', 'sku', 'ai_distributor_ref'],
  ean: ['ean', 'gencod', 'code-barres', 'barcode', 'ai_ean'],
  oldPrice: ['prix_barré', 'prix_barre', 'prix barré', 'prix barre', 'prix_normal', 'prix normal', 'ancien prix', 'prix public', 'original', 'old price'],
  newPrice: ['prix_promo', 'prix promo', 'prix_net', 'prix_ttc', 'prix', 'tarif', 'price', 'pricing', 'ai_pricing'],
  unit: ['unité', 'unite', 'unit'],
  description: ['description', 'desc', 'descriptif', 'détail', 'detail', 'caractéristiques'],
  category: ['famille', 'univers', 'sous-famille', 'sous famille', 'catégorie', 'categorie', 'category', 'rayon'],
  unitPrice: ['unit_price', 'prix unitaire', 'prix au litre', 'prix/kg', 'prix au kg'],
  promoLabel: ['promotion', 'mechanic', 'mécanique', 'mecanique', 'offre', 'promo'],
  validFrom: ['du', 'date début', 'valid from', 'valid_from'],
  validTo: ['au', 'date fin', "jusqu'au", 'valid until', 'valid_to'],
  mentions: ['mentions', 'mention légale', 'legal'],
  enseigne: ['enseigne', 'magasin', 'store'],
}

function matchColumn(columns: MergeColumn[], needles: string[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().trim()
  for (const n of needles) {
    const hit = columns.find(
      (c) => norm(c.label) === n || norm(c.key) === n || (c.aliases ?? []).some((a) => norm(a) === n),
    )
    if (hit) return hit.key
  }
  // repli : inclusion partielle sur le label
  for (const n of needles) {
    const hit = columns.find((c) => norm(c.label).includes(n))
    if (hit) return hit.key
  }
  return undefined
}

export function defaultPromoFieldMap(columns: MergeColumn[]): Partial<Record<PromoFieldKey, string>> {
  const map: Partial<Record<PromoFieldKey, string>> = {}
  for (const [field, needles] of Object.entries(GUESS) as [PromoFieldKey, string[]][]) {
    const key = matchColumn(columns, needles)
    if (key) map[field] = key
  }
  return map
}

function str(row: MergeRow, columns: MergeColumn[], key?: string): string {
  if (!key) return ''
  const v = getRowValue(row, key, columns)
  return v == null ? '' : String(v)
}

function num(row: MergeRow, columns: MergeColumn[], key?: string): number | null {
  if (!key) return null
  return parsePrice(getRowValue(row, key, columns))
}

export function extractPromoFields(
  row: MergeRow,
  columns: MergeColumn[],
  fieldMap: Partial<Record<PromoFieldKey, string>>,
): PromoFields {
  const imagesRaw = str(row, columns, fieldMap.image)
  const image = imagesRaw ? (imagesRaw.split('|')[0]?.trim() || null) : null
  const oldPrice = num(row, columns, fieldMap.oldPrice)
  const newPrice = num(row, columns, fieldMap.newPrice)
  const lotQty = num(row, columns, fieldMap.lotQty)
  const lotOffert = num(row, columns, fieldMap.lotOffert)
  const lotPrice = num(row, columns, fieldMap.lotPrice)
  const { mechanism, remisePct, remiseMontant } = computeMechanism({ oldPrice, newPrice, lotQty, lotOffert, lotPrice })
  return {
    name: str(row, columns, fieldMap.name),
    image,
    brand: str(row, columns, fieldMap.brand),
    ref: str(row, columns, fieldMap.ref),
    ean: str(row, columns, fieldMap.ean),
    oldPrice, newPrice,
    currency: 'EUR',
    unit: str(row, columns, fieldMap.unit),
    description: str(row, columns, fieldMap.description),
    category: str(row, columns, fieldMap.category),
    unitPrice: str(row, columns, fieldMap.unitPrice),
    promoLabel: str(row, columns, fieldMap.promoLabel),
    mechanism, remisePct, remiseMontant,
    lotQty, lotOffert, lotPrice,
    validFrom: str(row, columns, fieldMap.validFrom) || null,
    validTo: str(row, columns, fieldMap.validTo) || null,
    mentions: str(row, columns, fieldMap.mentions),
    enseigne: str(row, columns, fieldMap.enseigne),
    badges: [],
  }
}
