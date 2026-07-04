import type { CSSProperties } from 'react'
import { extractPromoFields } from '@/features/retail-promo/promoMapping'
import { GRID_DIMS, type CatalogGrid, type ProductSlot } from '../../catalogTypes'
import { pagePx, type CatalogRenderCtx } from './catalogCss'
import { ProductCell, type CellSize } from './ProductCell'

function slotSize(slot: ProductSlot, grid: CatalogGrid): CellSize {
  if (grid === 1) return 'xl' // pleine page
  if (slot.colSpan >= 2 && slot.rowSpan >= 2) return 'xl'
  if (slot.colSpan >= 2 || slot.rowSpan >= 2) return 'lg'
  return 'md'
}

/**
 * Facteur d'échelle TYPO de la page (--cat-fit) : la typo de base est calibrée
 * pour une cellule de grille 6 A4 portrait — les grilles plus aérées (4/2/1,
 * paysage…) produisent des cellules bien plus grandes où les textes en px fixes
 * laissent trop de vide. Échelle = racine du rapport d'AIRES, bornée.
 */
function typoFit(ctx: CatalogRenderCtx, grid: CatalogGrid): number {
  const { w, h } = pagePx(ctx.format)
  const [C, R] = GRID_DIMS[grid]
  // Marges verticales : header ~64 + footer ~40 + padding grille 36 ; gaps 14.
  const cellW = (w - 64 - 14 * (C - 1)) / C
  const cellH = (h - 140 - 14 * (R - 1)) / R
  const REF_AREA = 358 * 318 // cellule de référence (A4 portrait, grille 6)
  return Math.min(1.45, Math.max(0.85, Math.sqrt((cellW * cellH) / REF_AREA)))
}

interface Props { ctx: CatalogRenderCtx; grid: CatalogGrid; slots: ProductSlot[] }

/**
 * Kickers à afficher : la pastille sous-famille n'apparaît qu'au CHANGEMENT de
 * sous-famille dans l'ordre de LECTURE (ligne puis colonne) — la répéter sur
 * chaque fiche d'un même groupe perturbe la lecture.
 */
function kickerFirsts(slots: ProductSlot[]): Set<string> {
  const reading = [...slots].sort((a, b) => a.row - b.row || a.col - b.col)
  const firsts = new Set<string>()
  let prev: string | undefined
  for (const s of reading) {
    const k = s.path.length > 1 ? s.path[s.path.length - 1] : undefined
    if (k && k !== prev) firsts.add(s.rowId)
    prev = k
  }
  return firsts
}

export function ProductGridPage({ ctx, grid, slots }: Props) {
  const [cols, rows] = GRID_DIMS[grid]
  const fit = typoFit(ctx, grid)
  const withKicker = kickerFirsts(slots)
  return (
    <div className="cat-grid" style={{
      gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`,
      ...(fit !== 1 ? ({ '--cat-fit': String(Math.round(fit * 100) / 100) } as CSSProperties) : {}),
    }}>
      {slots.map((slot) => {
        const style = { gridColumn: `${slot.col} / span ${slot.colSpan}`, gridRow: `${slot.row} / span ${slot.rowSpan}` }
        const row = ctx.rowsById.get(slot.rowId)
        if (!row) return <div key={slot.rowId} className="cat-cell" style={style} />
        // Kicker = sous-famille (dernier niveau du path), au changement de groupe seulement.
        const kicker = withKicker.has(slot.rowId) ? slot.path[slot.path.length - 1] : undefined
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
