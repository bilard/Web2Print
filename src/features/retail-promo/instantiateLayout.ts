import type { Canvas } from 'fabric'
import { syncToStore } from '@/features/editor/useAddObject'
import { getPromoBlock } from './blocks/registry'
import type { PlacedBlock, PromoLayout } from './promoTypes'

export function blockRectPx(b: PlacedBlock, width: number, height: number) {
  return { x: Math.round(b.xPct * width), y: Math.round(b.yPct * height), w: Math.round(b.wPct * width), h: Math.round(b.hPct * height) }
}

const DEFAULT_PALETTE = { primary: '#111827', accent: '#e11d48', text: '#111827' }

export function instantiatePromoLayout(canvas: Canvas, layout: PromoLayout, resolvedTheme: 'light' | 'dark'): void {
  for (const b of layout.blocks) {
    const def = getPromoBlock(b.blockId)
    if (!def) continue // bloc inconnu ignoré (le plan est déjà réparé en amont)
    const { x, y, w, h } = blockRectPx(b, layout.width, layout.height)
    const obj = def.build({
      x, y, w, h,
      palette: { ...DEFAULT_PALETTE, ...(b.palette ?? {}) },
      fontFamily: b.fontFamily ?? 'Arial',
      resolvedTheme,
    })
    canvas.add(obj)
  }
  canvas.requestRenderAll()
  syncToStore(canvas)
}
