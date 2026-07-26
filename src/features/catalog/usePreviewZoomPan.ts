// Zoom & pan de l'aperçu : pincement trackpad / Ctrl(Cmd)+molette (ancré sous le
// curseur) et PAN à la barre d'espace maintenue + glisser (façon outils de design).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export function usePreviewZoomPan(containerRef: RefObject<HTMLDivElement | null>, active: boolean) {
  // null = « Ajuster » (la page tient dans la fenêtre) ; sinon facteur absolu.
  const [zoom, setZoom] = useState<number | null>(null)
  // Facteur effectif courant (fit ou zoom), mis à jour par le rendu de l'étape.
  const kRef = useRef(1)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)

  // Pincement trackpad = wheel avec ctrlKey ; souris = Ctrl/Cmd + molette.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !active) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const cur = kRef.current
      const next = Math.min(4, Math.max(0.1, cur * Math.exp(-e.deltaY * 0.0025)))
      if (next === cur) return
      // Ancre le point sous le curseur : ajuste le scroll après re-rendu.
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const ratio = next / cur
      const sx = (el.scrollLeft + px) * ratio - px
      const sy = (el.scrollTop + py) * ratio - py
      setZoom(next)
      requestAnimationFrame(() => { el.scrollLeft = sx; el.scrollTop = sy })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [containerRef, active])

  // Barre d'espace maintenue = mode déplacement (hors champs de saisie).
  useEffect(() => {
    if (!active) return
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      e.preventDefault() // sinon la page scrolle
      setSpaceHeld(true)
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') { setSpaceHeld(false); setPanning(false); panRef.current = null } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [active])

  const panHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!spaceHeld) return
      const el = containerRef.current
      if (!el) return
      panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
      setPanning(true)
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      e.preventDefault()
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const p = panRef.current
      const el = containerRef.current
      if (!p || !el) return
      el.scrollLeft = p.sl - (e.clientX - p.x)
      el.scrollTop = p.st - (e.clientY - p.y)
    },
    onPointerUp: () => { panRef.current = null; setPanning(false) },
    onPointerCancel: () => { panRef.current = null; setPanning(false) },
  }

  const cursorClass = panning ? 'cursor-grabbing select-none' : spaceHeld ? 'cursor-grab select-none' : ''

  return { zoom, setZoom, kRef, panHandlers, cursorClass }
}
