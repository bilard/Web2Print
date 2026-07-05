import type { CSSProperties } from 'react'
import { extractPromoFields, buildDetailLines } from '@/features/retail-promo/promoMapping'
import { GRID_DIMS, type CatalogGrid, type ProductSlot } from '../../catalogTypes'
import { cellFit, type CatalogRenderCtx } from './catalogCss'
import { ProductCell, type CellSize } from './ProductCell'

function slotSize(slot: ProductSlot, grid: CatalogGrid, free: boolean): CellSize {
  if (free) return 'md' // disposition libre : toutes les fiches identiques (= aperçu)
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
  // `--cat-fit` = échelle de la cellule (source unique cellFit). En disposition
  // libre, l'aperçu utilise EXACTEMENT le même fit + la même taille de cellule →
  // badges/texte au même ratio, plus de débordement.
  return cellFit(ctx.format, grid)
}

interface Props {
  ctx: CatalogRenderCtx
  grid: CatalogGrid
  slots: ProductSlot[]
  /** Bandeaux de SECTION (sous-familles) : rangée moteur (1-based) → label. */
  groupRows?: { row: number; label: string }[]
}

export function ProductGridPage({ ctx, grid, slots, groupRows }: Props) {
  const [cols, rows] = GRID_DIMS[grid]
  const fit = typoFit(ctx, grid)
  const free = ctx.plan.cardStyle?.freeLayout ?? false
  // Bandeaux de section (masquables via « Sous-famille » des éléments affichés).
  const bands = (ctx.plan.cardStyle?.showKicker ?? true) ? (groupRows ?? []) : []
  const bandAt = new Map(bands.map((b) => [b.row, b.label]))
  // Grille CSS : une piste `auto` (bandeau) est insérée AVANT chaque rangée qui
  // démarre une sous-famille ; les rangées produits se partagent le reste (1fr).
  const template: string[] = []
  const cssRowOf: number[] = [] // rangée moteur (1-based) → piste CSS (1-based)
  const bandCssRow = new Map<number, number>()
  for (let r = 1; r <= rows; r++) {
    if (bandAt.has(r)) { template.push('auto'); bandCssRow.set(r, template.length) }
    template.push('minmax(0, 1fr)')
    cssRowOf[r] = template.length
  }
  return (
    <div className="cat-grid" style={{
      gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: template.join(' '),
      ...(fit !== 1 ? ({ '--cat-fit': String(Math.round(fit * 100) / 100) } as CSSProperties) : {}),
    }}>
      {bands.map((b) => (
        <div key={`band-${b.row}`} className="cat-group-band" style={{ gridColumn: '1 / -1', gridRow: bandCssRow.get(b.row) }}>
          {b.label}
        </div>
      ))}
      {slots.map((slot) => {
        // Les spans ne traversent jamais un bandeau (le moteur ferme les rangées
        // au changement de groupe) → `span N` reste sûr en pistes CSS.
        const style = { gridColumn: `${slot.col} / span ${slot.colSpan}`, gridRow: `${cssRowOf[slot.row]} / span ${slot.rowSpan}` }
        const row = ctx.rowsById.get(slot.rowId)
        if (!row) return <div key={slot.rowId} className="cat-cell" style={style} />
        // Layout horizontal (image gauche / contenu droite) : cartes larges (2×1)
        // ET cartes standard des grilles denses (6-8/page, trop courtes pour empiler).
        const horizontal = !free && slot.rowSpan === 1 && (slot.colSpan >= 2 || grid >= 6)
        const fields = extractPromoFields(row, ctx.columns, ctx.fieldMap, ctx.customFields)
        const details = buildDetailLines(ctx.customFields, fields)
        // Disposition libre : une GRANDE carte (vedette ou mise en avant prix) est
        // la fiche de base MAGNIFIÉE (transform scale) — mise en page strictement
        // préservée, zéro débordement par construction (wrapper = 100%/s, scale s).
        // 2×2 → ×2 ; carte élargie [2,1] (grilles où le 2×2 serait pleine page,
        // ex. grille 4) → ×1,5 : le contenu se compresse verticalement (l'aimant
        // évite tout chevauchement, le prix reste ancré en bas) pour une vraie
        // mise en avant du produit cher.
        if (free && slot.colSpan * slot.rowSpan > 1) {
          const s = slot.colSpan >= 2 && slot.rowSpan >= 2 ? 2 : 1.5
          return (
            <div key={slot.rowId} style={{ ...style, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: `calc(100%/${s})`, height: `calc(100%/${s})`, transform: `scale(${s})`, transformOrigin: 'top left', display: 'grid' }}>
                <ProductCell fields={fields} featured={slot.featured} size="md" details={details} cardStyle={ctx.plan.cardStyle} />
              </div>
            </div>
          )
        }
        return (
          <ProductCell key={slot.rowId} fields={fields}
            featured={slot.featured} size={slotSize(slot, grid, free)} details={details}
            horizontal={horizontal} cardStyle={ctx.plan.cardStyle} style={style} />
        )
      })}
    </div>
  )
}
