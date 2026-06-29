import { describe, it, expect } from 'vitest'
import { augmentRowsWithPromo, PROMO_COLUMN_KEYS } from './augmentRows'
import { defaultPromoFieldMap } from './promoMapping'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'

const cols: MergeColumn[] = [
  { key: 'ai_name', label: 'Nom', fieldType: 'text' },
  { key: 'prix_barre', label: 'Prix barré', fieldType: 'currency' },
  { key: 'prix', label: 'Prix', fieldType: 'currency' },
]
const rows: MergeRow[] = [{ _id: '1', ai_name: 'Perceuse', prix_barre: '100', prix: '75' }]

describe('augmentRowsWithPromo', () => {
  it('ajoute toutes les colonnes promo_* sans dupliquer', () => {
    const out = augmentRowsWithPromo(cols, rows, defaultPromoFieldMap(cols))
    for (const k of PROMO_COLUMN_KEYS) {
      expect(out.columns.some((c) => c.key === k)).toBe(true)
    }
    expect(out.columns.length).toBe(cols.length + PROMO_COLUMN_KEYS.length)
  })
  it('calcule remise numérique + label + prix formaté', () => {
    const out = augmentRowsWithPromo(cols, rows, defaultPromoFieldMap(cols))
    const r = out.rows[0]
    expect(r.promo_remisePct).toBe(25)
    expect(r.promo_remiseLabel).toBe('-25%')
    expect(r.promo_priceNow).toBe('75,00 €')
    expect(r.promo_priceWas).toBe('100,00 €')
    expect(r.promo_name).toBe('Perceuse')
  })
  it('ne mute pas les rows d\'entrée', () => {
    const snap = JSON.stringify(rows)
    augmentRowsWithPromo(cols, rows, defaultPromoFieldMap(cols))
    expect(JSON.stringify(rows)).toBe(snap)
  })
})
