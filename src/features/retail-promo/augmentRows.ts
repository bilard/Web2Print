import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from './promoTypes'
import { extractPromoFields } from './promoMapping'
import { formatPrice } from './priceParse'

export const PROMO_COLUMN_KEYS = [
  'promo_name', 'promo_image', 'promo_brand', 'promo_ean',
  'promo_priceNow', 'promo_priceWas', 'promo_newPrice', 'promo_oldPrice',
  'promo_remisePct', 'promo_remiseLabel', 'promo_remiseMontant',
  'promo_lotText', 'promo_validText', 'promo_mentions', 'promo_unit',
] as const

const PROMO_COLUMNS: MergeColumn[] = PROMO_COLUMN_KEYS.map((key) => ({
  key, label: key, fieldType: key === 'promo_image' ? 'image' : 'text',
}))

function lotText(f: ReturnType<typeof extractPromoFields>): string {
  if (f.mechanism === 'lot' && f.lotQty != null && f.lotOffert != null) return `${f.lotQty}+${f.lotOffert}`
  if (f.mechanism === 'pack' && f.lotQty != null && f.lotPrice != null) return `LES ${f.lotQty} POUR ${formatPrice(f.lotPrice, f.currency)}`
  return ''
}

function validText(f: ReturnType<typeof extractPromoFields>): string {
  if (f.validFrom && f.validTo) return `Du ${f.validFrom} au ${f.validTo}`
  if (f.validTo) return `Jusqu'au ${f.validTo}`
  return ''
}

export function augmentRowsWithPromo(
  columns: MergeColumn[],
  rows: MergeRow[],
  fieldMap: Partial<Record<PromoFieldKey, string>>,
): { columns: MergeColumn[]; rows: MergeRow[] } {
  const newRows = rows.map((row) => {
    const f = extractPromoFields(row, columns, fieldMap)
    return {
      ...row,
      promo_name: f.name,
      promo_image: f.image ?? '',
      promo_brand: f.brand,
      promo_ean: f.ean,
      promo_priceNow: f.newPrice != null ? formatPrice(f.newPrice, f.currency) : '',
      promo_priceWas: f.oldPrice != null ? formatPrice(f.oldPrice, f.currency) : '',
      promo_newPrice: f.newPrice ?? '',
      promo_oldPrice: f.oldPrice ?? '',
      promo_remisePct: f.remisePct ?? '',
      promo_remiseLabel: f.remisePct != null ? `-${f.remisePct}%` : '',
      promo_remiseMontant: f.remiseMontant ?? '',
      promo_lotText: lotText(f),
      promo_validText: validText(f),
      promo_mentions: f.mentions,
      promo_unit: f.unit,
    } as MergeRow
  })
  // évite la double-augmentation si déjà présent
  const hasPromo = columns.some((c) => c.key === 'promo_name')
  const newColumns = hasPromo ? columns : [...columns, ...PROMO_COLUMNS]
  return { columns: newColumns, rows: newRows }
}
