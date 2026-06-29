import type { Canvas } from 'fabric'
import type { PlacedBlock, PromoBlockId, PromoLayout } from './promoTypes'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Reconstruit un PromoLayout réutilisable depuis les blocs promo présents sur le
 * canvas (positions/tailles relatives à la page). Capture la MISE EN PAGE
 * (quels blocs, où) ; les restyles per-bloc ne sont pas conservés (les blocs se
 * reconstruisent depuis les styles par défaut à la réutilisation).
 */
export function deriveLayoutFromCanvas(
  canvas: Canvas,
  opts: { id: string; label: string; width: number; height: number; background: string },
): PromoLayout {
  const { width, height } = opts
  const blocks: PlacedBlock[] = canvas
    .getObjects()
    .filter((o) => o.data?.type === 'promo-block' && typeof o.data?.blockId === 'string')
    .map((o) => {
      // On utilise left/top/width*scale (la box réelle du groupe), PAS getBoundingRect
      // qui inclut l'ombre portée et fausserait les %.
      const w = (o.width ?? 0) * (o.scaleX ?? 1)
      const h = (o.height ?? 0) * (o.scaleY ?? 1)
      return {
        blockId: o.data!.blockId as PromoBlockId,
        xPct: clamp01((o.left ?? 0) / width),
        yPct: clamp01((o.top ?? 0) / height),
        wPct: clamp01(w / width),
        hPct: clamp01(h / height),
      }
    })
  return { id: opts.id, label: opts.label, width, height, background: opts.background, blocks }
}

/** Y a-t-il des blocs promo sur le canvas (= projet promo) ? */
export function canvasHasPromoBlocks(canvas: Canvas): boolean {
  return canvas.getObjects().some((o) => o.data?.type === 'promo-block')
}
