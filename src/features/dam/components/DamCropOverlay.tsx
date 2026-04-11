import { useCallback, useEffect, useRef, useState } from 'react'
import type { DamCropMask } from '../types'

interface Props {
  /** Normalized mask (0-1) in image-space — displayed on top of the image element */
  mask: DamCropMask
  onChange: (mask: DamCropMask) => void
  /** Optional aspect ratio constraint as width/height (e.g. 1, 16/9). null = free */
  ratio?: number | null
  /** Image orientation flags — the overlay must mirror its coordinates so drags feel natural */
  flipH?: boolean
  flipV?: boolean
}

type DragMode =
  | { kind: 'move'; startX: number; startY: number; origMask: DamCropMask }
  | { kind: 'resize'; handle: Handle; startX: number; startY: number; origMask: DamCropMask }
  | null

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLES: { key: Handle; cursor: string; style: React.CSSProperties }[] = [
  { key: 'nw', cursor: 'nwse-resize', style: { top: -5, left: -5 } },
  { key: 'n', cursor: 'ns-resize', style: { top: -5, left: '50%', transform: 'translateX(-50%)' } },
  { key: 'ne', cursor: 'nesw-resize', style: { top: -5, right: -5 } },
  { key: 'e', cursor: 'ew-resize', style: { top: '50%', right: -5, transform: 'translateY(-50%)' } },
  { key: 'se', cursor: 'nwse-resize', style: { bottom: -5, right: -5 } },
  { key: 's', cursor: 'ns-resize', style: { bottom: -5, left: '50%', transform: 'translateX(-50%)' } },
  { key: 'sw', cursor: 'nesw-resize', style: { bottom: -5, left: -5 } },
  { key: 'w', cursor: 'ew-resize', style: { top: '50%', left: -5, transform: 'translateY(-50%)' } },
]

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function DamCropOverlay({ mask, onChange, ratio = null, flipH = false, flipV = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragMode>(null)

  // Display mask — mirrored for visual flip so handles follow the pixels user sees
  const displayX = flipH ? 1 - mask.x - mask.width : mask.x
  const displayY = flipV ? 1 - mask.y - mask.height : mask.y

  // Convert a client coord to a normalized (0-1) position inside the container,
  // taking flip into account so that the math below always operates in image-space.
  const clientToNorm = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return { nx: 0, ny: 0 }
      let nx = (clientX - rect.left) / rect.width
      let ny = (clientY - rect.top) / rect.height
      if (flipH) nx = 1 - nx
      if (flipV) ny = 1 - ny
      return { nx: clamp(nx, 0, 1), ny: clamp(ny, 0, 1) }
    },
    [flipH, flipV]
  )

  useEffect(() => {
    if (!drag) return

    const handleMove = (e: MouseEvent) => {
      const { nx, ny } = clientToNorm(e.clientX, e.clientY)

      if (drag.kind === 'move') {
        const { origMask } = drag
        const start = clientToNorm(drag.startX, drag.startY)
        const dx = nx - start.nx
        const dy = ny - start.ny
        const newX = clamp(origMask.x + dx, 0, 1 - origMask.width)
        const newY = clamp(origMask.y + dy, 0, 1 - origMask.height)
        onChange({ ...origMask, x: newX, y: newY, enabled: true })
        return
      }

      // Resize
      const { origMask, handle } = drag
      let { x, y, width, height } = origMask
      const right = origMask.x + origMask.width
      const bottom = origMask.y + origMask.height
      const MIN = 0.05

      if (handle.includes('w')) {
        x = clamp(nx, 0, right - MIN)
        width = right - x
      }
      if (handle.includes('e')) {
        width = clamp(nx - origMask.x, MIN, 1 - origMask.x)
      }
      if (handle.includes('n')) {
        y = clamp(ny, 0, bottom - MIN)
        height = bottom - y
      }
      if (handle.includes('s')) {
        height = clamp(ny - origMask.y, MIN, 1 - origMask.y)
      }

      // Enforce ratio — grow/shrink the perpendicular axis around the fixed edge
      if (ratio && ratio > 0) {
        // Aspect ratio is width/height in *pixel* space. In normalized space we don't
        // know the pixel aspect, so we assume the displayed container matches the image
        // aspect — which is true here because the overlay fills the <img>.
        const imgRect = containerRef.current?.getBoundingClientRect()
        if (imgRect) {
          const pxAspect = imgRect.width / imgRect.height
          // normalized width to normalized height: newH(norm) = width(norm) * pxAspect / ratio
          const targetH = (width * pxAspect) / ratio
          if (targetH > 1) {
            // Shrink width instead
            const maxH = 1
            const newW = (maxH * ratio) / pxAspect
            if (handle.includes('w')) {
              x = right - newW
              width = newW
            } else if (handle.includes('e') || handle === 'n' || handle === 's') {
              width = newW
            }
            height = maxH
            if (handle.includes('n')) y = bottom - maxH
            else y = 0
          } else {
            if (handle.includes('n')) {
              y = bottom - targetH
              height = targetH
            } else {
              height = targetH
            }
          }
        }
      }

      onChange({ x, y, width, height, enabled: true })
    }

    const handleUp = () => setDrag(null)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [drag, clientToNorm, onChange, ratio])

  const startMove = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setDrag({ kind: 'move', startX: e.clientX, startY: e.clientY, origMask: { ...mask, enabled: true } })
  }

  const startResize = (e: React.MouseEvent, handle: Handle) => {
    e.stopPropagation()
    e.preventDefault()
    setDrag({ kind: 'resize', handle, startX: e.clientX, startY: e.clientY, origMask: { ...mask, enabled: true } })
  }

  // Display-space rect (percent) — accounts for flip
  const rect = {
    left: `${displayX * 100}%`,
    top: `${displayY * 100}%`,
    width: `${mask.width * 100}%`,
    height: `${mask.height * 100}%`,
  }

  return (
    <div ref={containerRef} className="absolute inset-0 select-none">
      {/* Dim outside area via four rects */}
      <div className="absolute bg-black/60 pointer-events-none" style={{ left: 0, top: 0, right: 0, height: rect.top }} />
      <div
        className="absolute bg-black/60 pointer-events-none"
        style={{ left: 0, top: `calc(${rect.top} + ${rect.height})`, right: 0, bottom: 0 }}
      />
      <div
        className="absolute bg-black/60 pointer-events-none"
        style={{ left: 0, top: rect.top, width: rect.left, height: rect.height }}
      />
      <div
        className="absolute bg-black/60 pointer-events-none"
        style={{
          left: `calc(${rect.left} + ${rect.width})`,
          top: rect.top,
          right: 0,
          height: rect.height,
        }}
      />

      {/* Crop frame */}
      <div
        onMouseDown={startMove}
        className="absolute border-2 border-indigo-400 cursor-move"
        style={rect}
      >
        {/* Rule-of-thirds grid */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 bottom-0 border-l border-white/20" style={{ left: '33.33%' }} />
          <div className="absolute top-0 bottom-0 border-l border-white/20" style={{ left: '66.66%' }} />
          <div className="absolute left-0 right-0 border-t border-white/20" style={{ top: '33.33%' }} />
          <div className="absolute left-0 right-0 border-t border-white/20" style={{ top: '66.66%' }} />
        </div>

        {/* Resize handles */}
        {HANDLES.map((h) => (
          <div
            key={h.key}
            onMouseDown={(e) => startResize(e, h.key)}
            className="absolute w-2.5 h-2.5 bg-white border border-indigo-500 rounded-sm hover:scale-125 transition-transform"
            style={{ ...h.style, cursor: h.cursor }}
          />
        ))}
      </div>
    </div>
  )
}
