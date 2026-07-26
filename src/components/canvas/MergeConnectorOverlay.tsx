import { useEffect, useState } from 'react'
import type { Canvas, FabricObject } from 'fabric'
import { useUIStore } from '@/stores/ui.store'
import { collectObjectsDeep } from '@/features/editor/deepObjects'

function fieldsOf(o: FabricObject): string[] {
  const f = ((o as any).data?.mergeFields as string[] | undefined) ?? []
  const img = (o as any).data?.ecImageField as string | undefined
  return img ? [...f, `${img} (image)`] : f
}

function screenPos(canvas: Canvas, o: FabricObject) {
  const rect = o.getBoundingRect()
  const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoom = canvas.getZoom()
  return { x: (rect.left + rect.width / 2) * zoom + vt[4], top: rect.top * zoom + vt[5] }
}

export function MergeConnectorOverlay({ canvas }: { canvas: Canvas | null }) {
  const showMergeBadges = useUIStore((s) => s.showMergeBadges)
  const [hovered, setHovered] = useState<FabricObject | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!canvas) return
    const over = (e: { target?: FabricObject }) => {
      if (e.target && fieldsOf(e.target).length) setHovered(e.target)
    }
    const out = () => setHovered(null)
    const redraw = () => setTick((n) => n + 1)
    canvas.on('mouse:over', over)
    canvas.on('mouse:out', out)
    canvas.on('after:render', redraw) // suit pan/zoom/déplacement
    return () => {
      canvas.off('mouse:over', over)
      canvas.off('mouse:out', out)
      canvas.off('after:render', redraw)
    }
  }, [canvas])

  if (!canvas) return null

  const tagged = showMergeBadges
    ? collectObjectsDeep(canvas.getObjects()).filter((o) => fieldsOf(o).length > 0 && o.visible !== false)
    : []

  return (
    <>
      {tagged.map((o) => {
        const p = screenPos(canvas, o)
        const f = fieldsOf(o)
        return (
          <div
            key={((o as any).data?.id as string | undefined) ?? `mc-${tagged.indexOf(o)}`}
            className="absolute z-20 -translate-x-1/2 pointer-events-none"
            style={{ left: p.x, top: p.top - 8 }}
          >
            <span className="px-1.5 py-0.5 rounded bg-indigo-600/80 text-[#fff] text-[9px] whitespace-nowrap shadow">
              {f.length > 1 ? `${f.length} champs` : f[0]}
            </span>
          </div>
        )
      })}
      {hovered && canvas.getObjects().includes(hovered) && hovered.visible !== false && (() => {
        const p = screenPos(canvas, hovered)
        return (
          <div
            className="absolute z-30 -translate-x-1/2 pointer-events-none"
            style={{ left: p.x, top: p.top - 26 }}
          >
            <span className="px-2 py-1 rounded-md bg-indigo-700 text-[#fff] text-[11px] whitespace-nowrap shadow-lg">
              {fieldsOf(hovered).join(' · ')}
            </span>
          </div>
        )
      })()}
    </>
  )
}
