import { useEffect, useState } from 'react'
import { Canvas, FabricObject } from 'fabric'

interface Props {
  canvas: Canvas | null
}

type Mode = 'move' | 'scale' | 'rotate'

/**
 * Badge temps réel pendant les manipulations (à la Figma) : position X/Y pendant
 * un déplacement, L × H pendant un redimensionnement, angle pendant une rotation.
 * Affiché sous l'objet, disparaît au relâchement.
 */
export function TransformBadge({ canvas }: Props) {
  const [state, setState] = useState<{ mode: Mode; target: FabricObject } | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!canvas) return
    const make = (mode: Mode) => (e: { target?: FabricObject }) => {
      if (e.target) setState({ mode, target: e.target })
      setTick((n) => n + 1)
    }
    const onMove = make('move')
    const onScale = make('scale')
    const onRotate = make('rotate')
    const clear = () => setState(null)
    canvas.on('object:moving', onMove)
    canvas.on('object:scaling', onScale)
    canvas.on('object:rotating', onRotate)
    canvas.on('object:modified', clear)
    canvas.on('mouse:up', clear)
    canvas.on('selection:cleared', clear)
    return () => {
      canvas.off('object:moving', onMove)
      canvas.off('object:scaling', onScale)
      canvas.off('object:rotating', onRotate)
      canvas.off('object:modified', clear)
      canvas.off('mouse:up', clear)
      canvas.off('selection:cleared', clear)
    }
  }, [canvas])

  if (!canvas || !state) return null
  const { mode, target } = state

  let label: string
  if (mode === 'move') {
    label = `${Math.round(target.left ?? 0)}, ${Math.round(target.top ?? 0)}`
  } else if (mode === 'scale') {
    label = `${Math.round(target.getScaledWidth())} × ${Math.round(target.getScaledHeight())}`
  } else {
    label = `${Math.round(target.angle ?? 0)}°`
  }

  const rect = target.getBoundingRect()
  const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoom = canvas.getZoom()
  const centerX = (rect.left + rect.width / 2) * zoom + vt[4]
  const screenBottom = (rect.top + rect.height) * zoom + vt[5]

  return (
    <div
      className="absolute z-30 -translate-x-1/2 pointer-events-none"
      style={{ left: centerX, top: screenBottom + 10 }}
    >
      <span className="px-2 py-1 rounded-md bg-indigo-600 text-[#fff] text-[11px] font-mono shadow-lg whitespace-nowrap">
        {label}
      </span>
    </div>
  )
}
