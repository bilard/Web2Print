import { extractPromoFields } from '@/features/retail-promo/promoMapping'
import type { CatalogGrid, ProductSlot } from '../../catalogTypes'
import type { CatalogRenderCtx } from './catalogCss'
import { ProductCell } from './ProductCell'

const GRID_DIMS: Record<CatalogGrid, [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 8: [2, 4] }

interface Props { ctx: CatalogRenderCtx; grid: CatalogGrid; slots: ProductSlot[] }

export function ProductGridPage({ ctx, grid, slots }: Props) {
  const [cols, rows] = GRID_DIMS[grid]
  return (
    <div className="cat-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {slots.map((slot) => {
        const row = ctx.rowsById.get(slot.rowId)
        if (!row) return <div key={slot.rowId} className="cat-cell" />
        return <ProductCell key={slot.rowId} fields={extractPromoFields(row, ctx.columns, ctx.fieldMap)} featured={slot.featured} />
      })}
    </div>
  )
}
