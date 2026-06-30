import { useLayoutEffect, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { PromoTemplateConfig, PromoColorKey, PromoBlockId } from './RetailPromoCard'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const dirX = (h: Handle) => (h.includes('e') ? 1 : h.includes('w') ? -1 : 0)
const dirY = (h: Handle) => (h.includes('s') ? 1 : h.includes('n') ? -1 : 0)
const CURSORS: Record<Handle, string> = { nw: 'nwse', n: 'ns', ne: 'nesw', e: 'ew', se: 'nwse', s: 'ns', sw: 'nesw', w: 'ew' }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const I = 9        // insertion (px design) pour ne pas être rogné par overflow:hidden
const HS = 20      // taille d'une poignée (px design) — assez grande pour être saisie à l'échelle réduite

interface Props {
  cardRef: RefObject<HTMLDivElement | null>
  getEl: () => HTMLElement | null
  selected: PromoBlockId
  isText: boolean
  config: PromoTemplateConfig
  onResizeText?: (key: PromoColorKey, patch: { fontSize?: number; width?: number }) => void
  onScaleBlock?: (id: PromoBlockId, sx: number, sy: number, dx: number, dy: number) => void
}

/** Boîte + 8 poignées de resize au-dessus du bloc sélectionné (mesure en espace-design dans .rp-card). */
export function PromoSelectionOverlay({ cardRef, getEl, selected, isText, config, onResizeText, onScaleBlock }: Props) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const measure = () => {
    const card = cardRef.current, el = getEl()
    if (!card || !el) return  // null transitoire (ré-attache des refs) : on garde le dernier rect
    const cr = card.getBoundingClientRect(), er = el.getBoundingClientRect()
    const s = cr.width / 595 || 1
    setRect({ left: (er.left - cr.left) / s, top: (er.top - cr.top) / s, width: er.width / s, height: er.height / s })
  }
  useLayoutEffect(measure, [selected, config])

  const startResize = (e: ReactPointerEvent, h: Handle) => {
    e.preventDefault(); e.stopPropagation()
    const card = cardRef.current, el = getEl()
    if (!card || !el) return
    const cr = card.getBoundingClientRect(), er = el.getBoundingClientRect()
    const s = cr.width / 595 || 1
    const dW = er.width / s, dH = er.height / s            // taille rendue en espace-design
    const dx = dirX(h), dy = dirY(h)
    const startX = e.clientX, startY = e.clientY
    const startFont = parseFloat(getComputedStyle(el).fontSize) || 16
    const startW = config.styles?.[selected as PromoColorKey]?.width ?? dW
    const sc = config.scales?.[selected], startSx = sc?.sx ?? 1, startSy = sc?.sy ?? 1
    const off = config.offsets?.[selected], startDx = off?.dx ?? 0, startDy = off?.dy ?? 0
    const baseW = dW / startSx, baseH = dH / startSy        // taille non-scalée (déco)

    const move = (ev: PointerEvent) => {
      const ddx = (ev.clientX - startX) / s, ddy = (ev.clientY - startY) / s
      if (isText) {
        if (dy !== 0) onResizeText?.(selected as PromoColorKey, { fontSize: clamp(Math.round(startFont * (dH + dy * ddy) / dH), 6, 400) })
        else if (dx !== 0) onResizeText?.(selected as PromoColorKey, { width: clamp(Math.round(startW + dx * ddx), 24, 595) })
      } else {
        let nsx = startSx, nsy = startSy
        if (dx !== 0 && dy !== 0) { const r = clamp((dW + dx * ddx) / dW, 0.05, 100); nsx = clamp(startSx * r, 0.2, 6); nsy = clamp(startSy * r, 0.2, 6) }
        else if (dx !== 0) nsx = clamp(startSx * (dW + dx * ddx) / dW, 0.2, 6)
        else if (dy !== 0) nsy = clamp(startSy * (dH + dy * ddy) / dH, 0.2, 6)
        // Ancrage : un bord ouest/nord déplace l'origine pour garder le bord opposé fixe.
        const ndx = dx < 0 ? Math.round(startDx - (nsx - startSx) * baseW) : startDx
        const ndy = dy < 0 ? Math.round(startDy - (nsy - startSy) * baseH) : startDy
        onScaleBlock?.(selected, Number(nsx.toFixed(3)), Number(nsy.toFixed(3)), ndx, ndy)
      }
      measure()
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  if (!rect) return null
  const bx = rect.left + I, by = rect.top + I, bw = Math.max(0, rect.width - 2 * I), bh = Math.max(0, rect.height - 2 * I)
  const hx = (h: Handle) => bx + (dirX(h) < 0 ? 0 : dirX(h) > 0 ? bw : bw / 2) - HS / 2
  const hy = (h: Handle) => by + (dirY(h) < 0 ? 0 : dirY(h) > 0 ? bh : bh / 2) - HS / 2

  return (
    <div style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh, border: '2px solid #6366f1', pointerEvents: 'none', zIndex: 30 }}>
      {HANDLES.map((h) => (
        <div key={h} onPointerDown={(e) => startResize(e, h)}
          style={{
            position: 'absolute', left: hx(h) - bx, top: hy(h) - by, width: HS, height: HS,
            background: '#fff', border: '2px solid #6366f1', borderRadius: '50%',
            pointerEvents: 'auto', cursor: `${CURSORS[h]}-resize`, boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          }} />
      ))}
    </div>
  )
}
