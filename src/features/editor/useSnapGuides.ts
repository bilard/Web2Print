import { useEffect, useRef } from 'react'
import type { Canvas } from 'fabric'
import { useUIStore } from '@/stores/ui.store'

export interface SnapGuide {
  type: 'h' | 'v'
  pos: number
}

const SNAP_THRESHOLD = 8

export function useSnapGuides(
  fabricRef: React.RefObject<Canvas | null>,
  setGuides: (guides: SnapGuide[]) => void,
) {
  const guidesRef = useRef<SnapGuide[]>([])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const onMoving = (e: { target?: { left?: number; top?: number; getScaledWidth: () => number; getScaledHeight: () => number } }) => {
      const { snapEnabled, canvasWidth, canvasHeight } = useUIStore.getState()
      if (!snapEnabled || !e.target) {
        if (guidesRef.current.length) {
          guidesRef.current = []
          setGuides([])
        }
        return
      }

      const obj = e.target as Parameters<typeof onMoving>[0]['target'] & { data?: Record<string, unknown> }
      const left = obj.left ?? 0
      const top = obj.top ?? 0
      const w = obj.getScaledWidth()
      const h = obj.getScaledHeight()
      const cx = left + w / 2
      const cy = top + h / 2
      const right = left + w
      const bottom = top + h

      const guides: SnapGuide[] = []
      let snapLeft = left
      let snapTop = top

      // Snap to canvas edges + center
      const vSnaps = [
        { pos: 0, objEdge: left },
        { pos: canvasWidth / 2, objEdge: cx },
        { pos: canvasWidth, objEdge: right },
      ]
      const hSnaps = [
        { pos: 0, objEdge: top },
        { pos: canvasHeight / 2, objEdge: cy },
        { pos: canvasHeight, objEdge: bottom },
      ]

      for (const s of vSnaps) {
        if (Math.abs(s.pos - s.objEdge) < SNAP_THRESHOLD) {
          guides.push({ type: 'v', pos: s.pos })
          snapLeft = s.pos - (s.objEdge - left)
        }
      }
      for (const s of hSnaps) {
        if (Math.abs(s.pos - s.objEdge) < SNAP_THRESHOLD) {
          guides.push({ type: 'h', pos: s.pos })
          snapTop = s.pos - (s.objEdge - top)
        }
      }

      // Snap to other objects edges
      const others = canvas.getObjects().filter(
        (o) => o !== (obj as unknown) && !o.data?.isGrid && !o.data?.isPageBg,
      )
      for (const other of others) {
        const ol = other.left ?? 0
        const ot = other.top ?? 0
        const ow = other.getScaledWidth()
        const oh = other.getScaledHeight()
        const or_ = ol + ow
        const ob = ot + oh
        const ocx = ol + ow / 2
        const ocy = ot + oh / 2

        const checkV = [ol, or_, ocx]
        const checkH = [ot, ob, ocy]

        for (const cv of checkV) {
          if (Math.abs(cv - left) < SNAP_THRESHOLD) { guides.push({ type: 'v', pos: cv }); snapLeft = cv }
          else if (Math.abs(cv - cx) < SNAP_THRESHOLD) { guides.push({ type: 'v', pos: cv }); snapLeft = cv - w / 2 }
          else if (Math.abs(cv - right) < SNAP_THRESHOLD) { guides.push({ type: 'v', pos: cv }); snapLeft = cv - w }
        }
        for (const ch of checkH) {
          if (Math.abs(ch - top) < SNAP_THRESHOLD) { guides.push({ type: 'h', pos: ch }); snapTop = ch }
          else if (Math.abs(ch - cy) < SNAP_THRESHOLD) { guides.push({ type: 'h', pos: ch }); snapTop = ch - h / 2 }
          else if (Math.abs(ch - bottom) < SNAP_THRESHOLD) { guides.push({ type: 'h', pos: ch }); snapTop = ch - h }
        }
      }

      // Apply snapping
      if (guides.some((g) => g.type === 'v')) (e.target as any).left = snapLeft
      if (guides.some((g) => g.type === 'h')) (e.target as any).top = snapTop

      guidesRef.current = guides
      setGuides(guides)
    }

    const clearGuides = () => {
      guidesRef.current = []
      setGuides([])
    }

    canvas.on('object:moving', onMoving as any)
    canvas.on('object:modified', clearGuides)
    canvas.on('mouse:up', clearGuides)

    return () => {
      canvas.off('object:moving', onMoving as any)
      canvas.off('object:modified', clearGuides)
      canvas.off('mouse:up', clearGuides)
    }
  }, [fabricRef.current, setGuides]) // eslint-disable-line react-hooks/exhaustive-deps
}
