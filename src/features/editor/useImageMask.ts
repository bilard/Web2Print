import { useEffect } from 'react'
import { Canvas, FabricImage, Rect, type TPointerEventInfo, type TPointerEvent } from 'fabric'

// ---------------------------------------------------------------------------
// Module-scope state for scaling snapshots
// ---------------------------------------------------------------------------

type ScaleSnapshot = {
  imgW: number
  imgH: number
  imgScaleX: number
  imgScaleY: number
  clipW: number
  clipH: number
  clipLeft: number
  clipTop: number
}

const _scaleSnapshots = new WeakMap<FabricImage, ScaleSnapshot>()

/** Detect platform meta key (⌘ on macOS, Ctrl elsewhere). */
function isMetaKey(e: MouseEvent | TouchEvent): boolean {
  return (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Attach a default clipPath to a FabricImage if it doesn't have one.
 * Centered, object-space (Fabric v6 convention).
 */
export function ensureImageClipPath(img: FabricImage): void {
  if ((img as any).clipPath) return
  const w = (img as any).width ?? 0
  const h = (img as any).height ?? 0
  if (w <= 0 || h <= 0) return
  ;(img as any).clipPath = new Rect({
    left: -w / 2,
    top: -h / 2,
    width: w,
    height: h,
    absolutePositioned: false,
  })
}

export function useImageMask(fabricRef: React.RefObject<Canvas | null>) {
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Auto-attach clipPath to any newly added image
    const onAdded = (e: { target?: any }) => {
      const t = e.target
      if (t instanceof FabricImage) ensureImageClipPath(t)
    }
    canvas.on('object:added', onAdded)

    // Snapshot scale + clipPath dimensions when a scaling gesture begins
    const onScalingStart = (e: { target?: any }) => {
      const t = e.target
      if (!(t instanceof FabricImage)) return
      const cp = (t as any).clipPath as Rect | undefined
      if (!cp) return
      _scaleSnapshots.set(t, {
        imgW: t.width ?? 0,
        imgH: t.height ?? 0,
        imgScaleX: t.scaleX ?? 1,
        imgScaleY: t.scaleY ?? 1,
        clipW: cp.width ?? 0,
        clipH: cp.height ?? 0,
        clipLeft: cp.left ?? 0,
        clipTop: cp.top ?? 0,
      })
    }

    // Apply keyboard-modifier semantics during scaling
    const onScaling = (e: TPointerEventInfo<TPointerEvent>) => {
      const t = (e as any).target as FabricImage | undefined
      if (!(t instanceof FabricImage)) return
      const cp = (t as any).clipPath as Rect | undefined
      if (!cp) return
      const snap = _scaleSnapshots.get(t)
      // If no snapshot exists (e.g. programmatic scale), silently no-op
      if (!snap) return

      const native = e.e as MouseEvent
      const shift = native.shiftKey
      const meta = isMetaKey(native)

      // Current scale ratio relative to snapshot
      const sx = (t.scaleX ?? 1) / (snap.imgScaleX || 1)
      const sy = (t.scaleY ?? 1) / (snap.imgScaleY || 1)

      if (!shift && !meta) {
        // Frame-only resize: revert image scale, grow clipPath in object space
        t.set({ scaleX: snap.imgScaleX, scaleY: snap.imgScaleY })
        cp.set({
          width: snap.clipW * sx,
          height: snap.clipH * sy,
        })
      } else if (shift && !meta) {
        // Proportional resize of frame + content
        const ratio = Math.max(sx, sy)
        t.set({ scaleX: snap.imgScaleX * ratio, scaleY: snap.imgScaleY * ratio })
        cp.set({ width: snap.clipW, height: snap.clipH })
      } else if (meta && !shift) {
        // Free deform of frame + content (clip stays in image object space → unchanged)
        cp.set({ width: snap.clipW, height: snap.clipH })
      } else {
        // meta + shift → proportional
        const ratio = Math.max(sx, sy)
        t.set({ scaleX: snap.imgScaleX * ratio, scaleY: snap.imgScaleY * ratio })
        cp.set({ width: snap.clipW, height: snap.clipH })
      }

      ;(cp as any).dirty = true
      ;(t as any).dirty = true
    }

    // Clear snapshot once the gesture is complete
    const onScaled = (e: { target?: any }) => {
      const t = e.target
      if (t instanceof FabricImage) _scaleSnapshots.delete(t)
    }

    canvas.on('mouse:down', onScalingStart)
    canvas.on('object:scaling', onScaling)
    canvas.on('object:modified', onScaled)

    return () => {
      canvas.off('object:added', onAdded)
      canvas.off('mouse:down', onScalingStart)
      canvas.off('object:scaling', onScaling)
      canvas.off('object:modified', onScaled)
    }
  }, [fabricRef.current]) // eslint-disable-line react-hooks/exhaustive-deps
}
