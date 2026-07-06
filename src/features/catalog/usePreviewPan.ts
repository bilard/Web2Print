// src/features/catalog/usePreviewPan.ts
// PAN à la barre d'ESPACE (outil main façon Adobe/Figma) sur l'aperçu de fiche :
// espace MAINTENU → un voile capte le pointeur (le drag des blocs est suspendu),
// glisser déplace le conteneur de l'aperçu (scrollLeft + scrollTop) — et LUI
// SEUL : jamais la page de l'étape ni la colonne de gauche.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

interface PanTargets {
  /** Conteneur défilant de l'aperçu zoomé (overflow-auto, les DEUX axes). */
  hRef: React.RefObject<HTMLElement | null>
}

export function usePreviewPan({ hRef }: PanTargets) {
  const [panning, setPanning] = useState(false)
  useEffect(() => {
    const isEditable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target)) return
      e.preventDefault() // sinon espace = défilement page
      setPanning(true)
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setPanning(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const drag = useRef<{ x: number; y: number; sx: number; sy: number; h: HTMLElement | null } | null>(null)
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const h = hRef.current
    drag.current = { x: e.clientX, y: e.clientY, sx: h?.scrollLeft ?? 0, sy: h?.scrollTop ?? 0, h }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = drag.current
    if (!s?.h) return
    s.h.scrollLeft = s.sx - (e.clientX - s.x)
    s.h.scrollTop = s.sy - (e.clientY - s.y)
  }
  const end = () => { drag.current = null }
  return { panning, overlayProps: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end } }
}
