// src/features/catalog/usePreviewPan.ts
// PAN à la barre d'ESPACE (outil main façon Adobe/Figma) sur l'aperçu de fiche :
// espace MAINTENU → un voile capte le pointeur (le drag des blocs est suspendu),
// glisser déplace le conteneur zoomé (scrollLeft) ET la zone défilante verticale
// la plus proche (scrollTop). Espace relâché → retour à l'édition.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

interface PanTargets {
  /** Conteneur à défilement HORIZONTAL (wrapper overflow-auto de l'aperçu zoomé). */
  hRef: React.RefObject<HTMLElement | null>
  /** Point de départ pour trouver l'ancêtre à défilement VERTICAL. */
  areaRef: React.RefObject<HTMLElement | null>
}

export function usePreviewPan({ hRef, areaRef }: PanTargets) {
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

  const drag = useRef<{ x: number; y: number; sx: number; sy: number; h: HTMLElement | null; v: HTMLElement | null } | null>(null)
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Ancêtre défilant vertical (la colonne est sticky dans la zone scrollable de l'étape).
    let v = areaRef.current?.parentElement ?? null
    while (v && v.scrollHeight <= v.clientHeight + 1) v = v.parentElement
    drag.current = { x: e.clientX, y: e.clientY, sx: hRef.current?.scrollLeft ?? 0, sy: v?.scrollTop ?? 0, h: hRef.current, v }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = drag.current
    if (!s) return
    if (s.h) s.h.scrollLeft = s.sx - (e.clientX - s.x)
    if (s.v) s.v.scrollTop = s.sy - (e.clientY - s.y)
  }
  const end = () => { drag.current = null }
  return { panning, overlayProps: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end } }
}
