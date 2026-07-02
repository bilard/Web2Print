// src/features/analytics/useMapViewport.ts
import { useCallback, useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react'

export interface MapBox {
  x: number
  y: number
  w: number
  h: number
}

const MIN_SCALE = 1
const MAX_SCALE = 12
/** Échelle appliquée quand on cible une ville depuis la liste. */
const FOCUS_SCALE = 6

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/**
 * Zoom/pan d'une carte SVG par viewBox : molette (Ctrl/Cmd), double-clic, boutons,
 * glisser pour panner, et `focus()` pour centrer sur un point (lien liste → carte).
 * `bounds` = viewBox au repos ; le cadrage est toujours contenu dans ces bornes.
 */
export function useMapViewport(bounds: MapBox) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [scale, setScale] = useState(1)
  const [center, setCenter] = useState({ cx: bounds.x + bounds.w / 2, cy: bounds.y + bounds.h / 2 })
  const drag = useRef<{ px: number; py: number; moved: boolean } | null>(null)

  const w = bounds.w / scale
  const h = bounds.h / scale
  const vb: MapBox = {
    x: clamp(center.cx - w / 2, bounds.x, bounds.x + bounds.w - w),
    y: clamp(center.cy - h / 2, bounds.y, bounds.y + bounds.h - h),
    w,
    h,
  }

  /** Point SVG sous le curseur (les coordonnées client dépendent du viewBox courant). */
  const toSvg = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: center.cx, y: center.cy }
    return { x: vb.x + ((clientX - rect.left) / rect.width) * vb.w, y: vb.y + ((clientY - rect.top) / rect.height) * vb.h }
  }, [vb.x, vb.y, vb.w, vb.h])

  /** Zoome vers `at` en gardant ce point immobile à l'écran. */
  const zoomAt = useCallback((at: { x: number; y: number }, factor: number) => {
    const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE)
    const fx = (at.x - vb.x) / vb.w
    const fy = (at.y - vb.y) / vb.h
    const nw = bounds.w / next
    const nh = bounds.h / next
    setScale(next)
    setCenter({ cx: at.x - fx * nw + nw / 2, cy: at.y - fy * nh + nh / 2 })
  }, [scale, vb.x, vb.y, vb.w, vb.h, bounds.w, bounds.h])

  // Molette = zoom au curseur, seulement avec Ctrl/Cmd (sinon le scroll de page garde
  // la main) ; listener natif non-passif, indispensable pour pouvoir preventDefault.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelRef.current = (e) => zoomAt(toSvg(e.clientX, e.clientY), e.deltaY < 0 ? 1.4 : 1 / 1.4)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      wheelRef.current(e)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const reset = useCallback(() => {
    setScale(1)
    setCenter({ cx: bounds.x + bounds.w / 2, cy: bounds.y + bounds.h / 2 })
  }, [bounds.x, bounds.y, bounds.w, bounds.h])

  /** Centre la carte sur un point (clic dans la liste des villes). */
  const focus = useCallback((x: number, y: number) => {
    setScale((s) => Math.max(s, FOCUS_SCALE))
    setCenter({ cx: x, cy: y })
  }, [])

  /** Cadre la vue sur une boîte englobante (clic sur un pays : toutes ses villes visibles). */
  const fitTo = useCallback((box: MapBox) => {
    const PAD = 1.6
    const next = clamp(
      Math.min(bounds.w / Math.max(box.w * PAD, 1), bounds.h / Math.max(box.h * PAD, 1)),
      MIN_SCALE,
      FOCUS_SCALE,
    )
    setScale(next)
    setCenter({ cx: box.x + box.w / 2, cy: box.y + box.h / 2 })
  }, [bounds.w, bounds.h])

  const pointerHandlers = {
    onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { px: e.clientX, py: e.clientY, moved: false }
    },
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
      if (!drag.current) return
      const rect = e.currentTarget.getBoundingClientRect()
      const dx = ((e.clientX - drag.current.px) / rect.width) * vb.w
      const dy = ((e.clientY - drag.current.py) / rect.height) * vb.h
      drag.current = { px: e.clientX, py: e.clientY, moved: true }
      setCenter((c) => ({ cx: c.cx - dx, cy: c.cy - dy }))
    },
    onPointerUp: () => {
      drag.current = null
    },
    onDoubleClick: (e: MouseEvent<SVGSVGElement>) => zoomAt(toSvg(e.clientX, e.clientY), 2),
  }

  return {
    svgRef,
    vb,
    scale,
    zoomed: scale > MIN_SCALE,
    zoomIn: () => zoomAt({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, 1.6),
    zoomOut: () => zoomAt({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, 1 / 1.6),
    reset,
    focus,
    fitTo,
    pointerHandlers,
  }
}
