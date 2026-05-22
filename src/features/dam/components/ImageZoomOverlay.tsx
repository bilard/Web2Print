import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

interface Props {
  open: boolean
  src: string
  alt?: string
  onClose: () => void
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const WHEEL_FACTOR = 0.0015
const DOUBLE_CLICK_TARGET_ZOOM = 2.5

/**
 * Overlay zoomable plein écran pour visualiser une image générée :
 * - clic = toggle entre fit-to-screen et 2.5× centré sur le curseur
 * - molette = zoom progressif (avec ancrage curseur)
 * - drag = pan quand zoomée
 * - Esc / clic backdrop = fermeture
 */
export function ImageZoomOverlay({ open, src, alt, onClose }: Props) {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const reset = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    if (open) reset()
  }, [open, src, reset])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '0') reset()
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(MAX_ZOOM, z * 1.25))
      if (e.key === '-') setZoom((z) => Math.max(MIN_ZOOM, z / 1.25))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, reset])

  if (!open) return null

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left - rect.width / 2
    const cy = e.clientY - rect.top - rect.height / 2
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 - e.deltaY * WHEEL_FACTOR)))
    if (next === zoom) return
    const ratio = next / zoom
    setOffset((o) => ({
      x: cx - (cx - o.x) * ratio,
      y: cy - (cy - o.y) * ratio,
    }))
    setZoom(next)
  }

  const handleImageClick = (e: React.MouseEvent) => {
    if (zoom > 1.05) {
      reset()
      return
    }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left - rect.width / 2
    const cy = e.clientY - rect.top - rect.height / 2
    const next = DOUBLE_CLICK_TARGET_ZOOM
    setOffset({ x: -cx * (next - 1), y: -cy * (next - 1) })
    setZoom(next)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1.05) return
    dragState.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current) return
    setOffset({
      x: dragState.current.ox + (e.clientX - dragState.current.x),
      y: dragState.current.oy + (e.clientY - dragState.current.y),
    })
  }
  const handleMouseUp = () => {
    dragState.current = null
  }

  const isZoomed = zoom > 1.05
  const cursor = isZoomed ? (dragState.current ? 'grabbing' : 'grab') : 'zoom-in'

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center select-none"
      onClick={(e) => {
        if (e.target === containerRef.current) onClose()
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <img
        src={src}
        alt={alt ?? ''}
        draggable={false}
        onClick={handleImageClick}
        onMouseDown={handleMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          cursor,
          transition: dragState.current ? 'none' : 'transform 120ms ease-out',
        }}
        className="max-w-[92vw] max-h-[92vh] object-contain pointer-events-auto will-change-transform"
      />

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        <div className="flex items-center gap-1 px-3 py-1.5 bg-white/10 rounded-lg text-[11px] text-white/80 tabular-nums">
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.25))}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition"
          title="Zoom arrière (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.25))}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition"
          title="Zoom avant (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={reset}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition"
          title="Réinitialiser (0)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition"
          title="Fermer (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white/5 rounded-lg text-[10px] text-white/40 pointer-events-none">
        Clic = zoom · molette = précis · glisser = déplacer · Esc = fermer
      </div>
    </div>
  )
}
