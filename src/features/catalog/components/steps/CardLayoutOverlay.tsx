// src/features/catalog/components/steps/CardLayoutOverlay.tsx
// Overlay d'édition de la disposition libre : glisse chaque objet (data-object-id)
// et redimensionne via 8 poignées — tout stocké en % de la carte (dynamique).
import { useLayoutEffect, useMemo, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { CARD_OBJECT_IDS } from '../../catalogTypes'
import { freeLayoutBox } from '../pages/freeLayout'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const dirX = (h: Handle) => (h.includes('e') ? 1 : h.includes('w') ? -1 : 0)
const dirY = (h: Handle) => (h.includes('s') ? 1 : h.includes('n') ? -1 : 0)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r1 = (v: number) => Math.round(v * 10) / 10

interface Rect { left: number; top: number; width: number; height: number }

interface Props {
  cardRef: RefObject<HTMLDivElement | null>
  style: CatalogCardStyle
  onChange: (id: CardObjectId, box: CardBox) => void
  /** Notifie l'objet sélectionné (clic/drag) — pour mettre en évidence le curseur correspondant côté panneau. */
  onSelect?: (id: CardObjectId | null) => void
}

export function CardLayoutOverlay({ cardRef, style, onChange, onSelect }: Props) {
  const [sel, setSel] = useState<CardObjectId | null>(null)
  const [tick, setTick] = useState(0) // incrémenté après drag/resize → force le recalcul des rects (dépendance du useMemo ci-dessous)
  useLayoutEffect(() => { setTick((t) => t + 1) }, [style])

  const rectOf = (id: CardObjectId): Rect | null => {
    const card = cardRef.current
    const el = card?.querySelector<HTMLElement>(`[data-object-id="${id}"]`)
    if (!card || !el) return null
    const cr = card.getBoundingClientRect(), er = el.getBoundingClientRect()
    if (!cr.width || !cr.height) return null
    return { left: ((er.left - cr.left) / cr.width) * 100, top: ((er.top - cr.top) / cr.height) * 100, width: (er.width / cr.width) * 100, height: (er.height / cr.height) * 100 }
  }
  // Rects (en %) de tous les objets, recalculés à chaque changement de style ou après drag/resize (tick).
  const rects = useMemo(() => {
    const map: Partial<Record<CardObjectId, Rect>> = {}
    for (const id of CARD_OBJECT_IDS) {
      const r = rectOf(id)
      if (r) map[id] = r
    }
    return map
  }, [tick, style])

  const cardPx = () => { const c = cardRef.current?.getBoundingClientRect(); return { w: c?.width || 1, h: c?.height || 1 } }

  const startDrag = (e: ReactPointerEvent, id: CardObjectId) => {
    e.preventDefault(); e.stopPropagation(); setSel(id); onSelect?.(id)
    const b = freeLayoutBox(id, style)
    const { w, h } = cardPx()
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      onChange(id, { ...b, x: clamp(r1(b.x + ((ev.clientX - sx) / w) * 100), 0, 100), y: clamp(r1(b.y + ((ev.clientY - sy) / h) * 100), 0, 100) })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setTick((t) => t + 1) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // Resize = mise à l'échelle UNIFORME de l'objet (transform:scale). Fonctionne pour
  // TOUS les types (texte, badge, ruban, image) — pas seulement l'image : redimensionner
  // la boîte ne suffisait pas car les objets inline ne la remplissent pas.
  const resize = (e: ReactPointerEvent, hnd: Handle) => {
    e.preventDefault(); e.stopPropagation()
    if (!sel) return
    const el = cardRef.current?.querySelector<HTMLElement>(`[data-object-id="${sel}"]`)
    if (!el) return
    const b = freeLayoutBox(sel, style)
    const startSc = b.sc ?? 1
    const startW = el.getBoundingClientRect().width || 1  // largeur rendue (déjà à l'échelle startSc)
    const baseW = startW / startSc                        // largeur naturelle (échelle 1)
    const dx = dirX(hnd), dy = dirY(hnd)
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      // Tirer vers l'extérieur (dans le sens de la poignée) agrandit ; horizontal prioritaire.
      const grow = dx !== 0 ? (ev.clientX - sx) * dx : (ev.clientY - sy) * dy
      const sc = clamp(Math.round(((startW + grow) / baseW) * 100) / 100, 0.2, 10)
      onChange(sel, { ...b, sc })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setTick((t) => t + 1) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const selRect = sel ? rects[sel] : null
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      {CARD_OBJECT_IDS.map((id) => {
        const r = rects[id]
        if (!r) return null
        return (
          <div key={id} onPointerDown={(e) => startDrag(e, id)} title={id}
            style={{ position: 'absolute', left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%`, cursor: 'move', outline: sel === id ? '2px solid #6366f1' : '1px dashed rgba(99,102,241,.4)' }} />
        )
      })}
      {sel && selRect && HANDLES.map((hnd) => {
        const cx = selRect.left + (dirX(hnd) < 0 ? 0 : dirX(hnd) > 0 ? selRect.width : selRect.width / 2)
        const cy = selRect.top + (dirY(hnd) < 0 ? 0 : dirY(hnd) > 0 ? selRect.height : selRect.height / 2)
        return (
          <div key={hnd} onPointerDown={(e) => resize(e, hnd)}
            style={{ position: 'absolute', left: `calc(${cx}% - 6px)`, top: `calc(${cy}% - 6px)`, width: 12, height: 12, background: '#fff', border: '2px solid #6366f1', borderRadius: '50%', cursor: 'pointer', zIndex: 21 }} />
        )
      })}
    </div>
  )
}
