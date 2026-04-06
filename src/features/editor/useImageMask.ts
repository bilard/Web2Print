import { useEffect } from 'react'
import { Canvas, FabricImage, Rect, type TPointerEventInfo, type TPointerEvent } from 'fabric'

// ---------------------------------------------------------------------------
// Module-scope state for content-edit mode
// ---------------------------------------------------------------------------

const _contentModeImages = new WeakSet<FabricImage>()
const _contentDragStart = new WeakMap<FabricImage, { x: number; y: number; clipLeft: number; clipTop: number }>()
// Saved lockMovement values so we can restore them on exit
const _contentModeLocks = new WeakMap<FabricImage, { lockX: boolean; lockY: boolean }>()

export function isInContentMode(img: FabricImage): boolean {
  return _contentModeImages.has(img)
}

export function enterContentMode(img: FabricImage): void {
  if (!(img as any).clipPath) return
  _contentModeImages.add(img)
  // Prevent Fabric's built-in object move while in content mode
  _contentModeLocks.set(img, {
    lockX: (img as any).lockMovementX ?? false,
    lockY: (img as any).lockMovementY ?? false,
  })
  ;(img as any).lockMovementX = true
  ;(img as any).lockMovementY = true
  ;(img as any).borderColor = '#6366f1'
  ;(img as any).cornerColor = '#6366f1'
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}

export function exitContentMode(img: FabricImage): void {
  _contentModeImages.delete(img)
  // Restore previous lock values
  const saved = _contentModeLocks.get(img)
  if (saved) {
    ;(img as any).lockMovementX = saved.lockX
    ;(img as any).lockMovementY = saved.lockY
    _contentModeLocks.delete(img)
  }
  _contentDragStart.delete(img)
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}

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

    // --- Content-edit mode listeners ---

    const onDblClick = (e: { target?: any }) => {
      const t = e.target
      if (t instanceof FabricImage) enterContentMode(t)
    }

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      const active = canvas.getActiveObject()
      if (active instanceof FabricImage && isInContentMode(active)) {
        exitContentMode(active)
      }
    }

    const onMouseDownContent = (e: TPointerEventInfo<TPointerEvent>) => {
      const t = (e as any).target as FabricImage | undefined
      if (!(t instanceof FabricImage)) return
      if (!isInContentMode(t)) return
      const cp = (t as any).clipPath as Rect | undefined
      if (!cp) return
      const p = canvas.getPointer(e.e)
      _contentDragStart.set(t, {
        x: p.x,
        y: p.y,
        clipLeft: cp.left ?? 0,
        clipTop: cp.top ?? 0,
      })
    }

    const onMouseMoveContent = (e: TPointerEventInfo<TPointerEvent>) => {
      const active = canvas.getActiveObject()
      if (!(active instanceof FabricImage)) return
      if (!isInContentMode(active)) return
      const start = _contentDragStart.get(active)
      if (!start) return
      const cp = (active as any).clipPath as Rect | undefined
      if (!cp) return
      const p = canvas.getPointer(e.e)
      // Move clipPath in OPPOSITE direction → repositions image inside frame
      cp.set({
        left: start.clipLeft - (p.x - start.x),
        top: start.clipTop - (p.y - start.y),
      })
      ;(active as any).dirty = true
      canvas.requestRenderAll()
    }

    const onMouseUpContent = () => {
      const active = canvas.getActiveObject()
      if (active instanceof FabricImage) _contentDragStart.delete(active)
    }

    canvas.on('mouse:dblclick', onDblClick)
    canvas.on('mouse:down', onMouseDownContent)
    canvas.on('mouse:move', onMouseMoveContent)
    canvas.on('mouse:up', onMouseUpContent)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      canvas.off('object:added', onAdded)
      canvas.off('mouse:down', onScalingStart)
      canvas.off('mouse:down', onMouseDownContent)
      canvas.off('mouse:move', onMouseMoveContent)
      canvas.off('mouse:up', onMouseUpContent)
      canvas.off('object:scaling', onScaling)
      canvas.off('object:modified', onScaled)
      canvas.off('mouse:dblclick', onDblClick)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [fabricRef.current]) // eslint-disable-line react-hooks/exhaustive-deps
}
