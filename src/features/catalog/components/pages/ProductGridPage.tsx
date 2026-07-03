import { extractPromoFields } from '@/features/retail-promo/promoMapping'
import { GRID_DIMS, type CatalogGrid, type ProductSlot } from '../../catalogTypes'
import type { CatalogRenderCtx } from './catalogCss'
import { ProductCell, type CellSize } from './ProductCell'

function slotSize(slot: ProductSlot, grid: CatalogGrid): CellSize {
  if (grid === 1) return 'xl' // pleine page
  if (slot.colSpan >= 2 && slot.rowSpan >= 2) return 'xl'
  if (slot.colSpan >= 2 || slot.rowSpan >= 2) return 'lg'
  return 'md'
}

interface Props { ctx: CatalogRenderCtx; grid: CatalogGrid; slots: ProductSlot[] }

export function ProductGridPage({ ctx, grid, slots }: Props) {
  const [cols, rows] = GRID_DIMS[grid]
  return (
    <div className="cat-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {slots.map((slot) => {
        const style = { gridColumn: `${slot.col} / span ${slot.colSpan}`, gridRow: `${slot.row} / span ${slot.rowSpan}` }
        const row = ctx.rowsById.get(slot.rowId)
        if (!row) return <div key={slot.rowId} className="cat-cell" style={style} />
        // Kicker = sous-famille (dernier niveau du path, hors univers seul).
        const kicker = slot.path.length > 1 ? slot.path[slot.path.length - 1] : undefined
        // Layout horizontal (image gauche / contenu droite) : cartes larges (2×1)
        // ET cartes standard des grilles denses (6-8/page, trop courtes pour empiler).
        const horizontal = slot.rowSpan === 1 && (slot.colSpan >= 2 || grid >= 6)
        return (
          <ProductCell key={slot.rowId} fields={extractPromoFields(row, ctx.columns, ctx.fieldMap)}
            featured={slot.featured} kicker={kicker} size={slotSize(slot, grid)}
            horizontal={horizontal} cardStyle={ctx.plan.cardStyle} style={style} />
        )
      })}
    </div>
  )
}
