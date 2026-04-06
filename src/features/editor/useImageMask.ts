import { useEffect } from 'react'
import { Canvas, FabricImage, type TPointerEventInfo, type TPointerEvent } from 'fabric'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Modèle natif Fabric : `width/height` = cadre visible (en pixels source),
// `cropX/cropY` = décalage du bitmap dans le cadre (en pixels source),
// `scaleX/scaleY` = zoom visuel du cadre.
// Les poignées Fabric encadrent automatiquement `width*scaleX × height*scaleY`,
// donc elles suivent le cadre — pas le bitmap entier.
// ---------------------------------------------------------------------------

const TIP_KEY = 'ds.tip.maskShortcuts.seen'
function showTipOnce(): void {
  try {
    if (localStorage.getItem(TIP_KEY)) return
    localStorage.setItem(TIP_KEY, '1')
    toast.info(
      'Astuce : Shift pour agrandir sans déformer, Cmd pour déformer, sans modificateur pour ajuster le cadre seul.',
      { duration: 8000 },
    )
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Helpers natural size
// ---------------------------------------------------------------------------

function naturalSize(img: FabricImage): { w: number; h: number } {
  const el = (img as any)._originalElement || (img as any)._element
  const w = el?.naturalWidth ?? el?.width ?? img.width ?? 0
  const h = el?.naturalHeight ?? el?.height ?? img.height ?? 0
  return { w, h }
}

// ---------------------------------------------------------------------------
// Mode édition de contenu (drag du bitmap dans le cadre)
// ---------------------------------------------------------------------------

const _contentModeImages = new WeakSet<FabricImage>()
const _contentDragStart = new WeakMap<
  FabricImage,
  { x: number; y: number; cropX: number; cropY: number }
>()
const _contentModeLocks = new WeakMap<FabricImage, { lockX: boolean; lockY: boolean }>()

export function isInContentMode(img: FabricImage): boolean {
  return _contentModeImages.has(img)
}

export function enterContentMode(img: FabricImage): void {
  _contentModeImages.add(img)
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
// Snapshot pour gestes de redimensionnement
// ---------------------------------------------------------------------------

type ScaleSnapshot = {
  width: number
  height: number
  scaleX: number
  scaleY: number
  cropX: number
  cropY: number
  left: number
  top: number
}

const _scaleSnapshots = new WeakMap<FabricImage, ScaleSnapshot>()

function isMetaKey(e: MouseEvent | TouchEvent): boolean {
  return (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey
}

// ---------------------------------------------------------------------------
// Helpers publics
// ---------------------------------------------------------------------------

/** Réinitialise le cadre à la taille naturelle du bitmap (pas de crop). */
export function fitFrameToContent(img: FabricImage): void {
  const { w, h } = naturalSize(img)
  if (w <= 0 || h <= 0) return
  img.set({ width: w, height: h, cropX: 0, cropY: 0 })
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}

/**
 * Garde le cadre affiché actuel et recadre le bitmap (cover) :
 * scaleX = scaleY uniformes, cropX/cropY centrent la portion visible.
 */
export function fillFrameProportionally(img: FabricImage): void {
  const { w: natW, h: natH } = naturalSize(img)
  const w = img.width ?? 0
  const h = img.height ?? 0
  const sx = img.scaleX ?? 1
  const sy = img.scaleY ?? 1
  if (natW <= 0 || natH <= 0 || w <= 0 || h <= 0) return

  const displayW = w * sx
  const displayH = h * sy
  const aspect = displayW / displayH
  const natAspect = natW / natH

  let newW: number
  let newH: number
  if (natAspect > aspect) {
    newH = natH
    newW = natH * aspect
  } else {
    newW = natW
    newH = natW / aspect
  }
  const newCropX = (natW - newW) / 2
  const newCropY = (natH - newH) / 2
  const uniformScale = displayW / newW

  img.set({
    width: newW,
    height: newH,
    cropX: newCropX,
    cropY: newCropY,
    scaleX: uniformScale,
    scaleY: uniformScale,
  })
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useImageMask(fabricRef: React.RefObject<Canvas | null>) {
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Snapshot au début d'un geste de scaling (uniquement sur poignée)
    const onScalingStart = (e: { target?: any }) => {
      const t = e.target
      if (!(t instanceof FabricImage)) return
      if (!(t as any).__corner) return
      _scaleSnapshots.set(t, {
        width: t.width ?? 0,
        height: t.height ?? 0,
        scaleX: t.scaleX ?? 1,
        scaleY: t.scaleY ?? 1,
        cropX: (t as any).cropX ?? 0,
        cropY: (t as any).cropY ?? 0,
        left: t.left ?? 0,
        top: t.top ?? 0,
      })
      showTipOnce()
    }

    // Pendant le scaling : appliquer la sémantique des modificateurs
    const onScaling = (e: TPointerEventInfo<TPointerEvent>) => {
      const t = (e as any).target as FabricImage | undefined
      if (!(t instanceof FabricImage)) return
      const snap = _scaleSnapshots.get(t)
      if (!snap) return

      const native = e.e as MouseEvent
      const shift = native.shiftKey
      const meta = isMetaKey(native)

      const rx = (t.scaleX ?? 1) / (snap.scaleX || 1)
      const ry = (t.scaleY ?? 1) / (snap.scaleY || 1)
      if (Math.abs(rx - 1) < 0.001 && Math.abs(ry - 1) < 0.001) return

      const { w: natW, h: natH } = naturalSize(t)

      if (!shift && !meta) {
        // Cadre seul : on étend width/height, on rétablit scale, on ajuste crop
        const newW = Math.max(1, snap.width * rx)
        const newH = Math.max(1, snap.height * ry)
        let newCropX = snap.cropX - (newW - snap.width) / 2
        let newCropY = snap.cropY - (newH - snap.height) / 2
        // Clamp dans le bitmap source
        if (natW > 0) {
          newCropX = Math.max(0, Math.min(newCropX, Math.max(0, natW - newW)))
        }
        if (natH > 0) {
          newCropY = Math.max(0, Math.min(newCropY, Math.max(0, natH - newH)))
        }
        t.set({
          width: newW,
          height: newH,
          cropX: newCropX,
          cropY: newCropY,
          scaleX: snap.scaleX,
          scaleY: snap.scaleY,
        })
      } else if (shift && !meta) {
        // Proportionnel cadre + contenu
        const ratio = Math.max(rx, ry)
        t.set({
          scaleX: snap.scaleX * ratio,
          scaleY: snap.scaleY * ratio,
          width: snap.width,
          height: snap.height,
          cropX: snap.cropX,
          cropY: snap.cropY,
        })
      } else if (meta && !shift) {
        // Déformation libre cadre + contenu : on laisse Fabric, mais on garde width/height/crop
        t.set({
          width: snap.width,
          height: snap.height,
          cropX: snap.cropX,
          cropY: snap.cropY,
        })
      } else {
        // Cmd+Shift = proportionnel
        const ratio = Math.max(rx, ry)
        t.set({
          scaleX: snap.scaleX * ratio,
          scaleY: snap.scaleY * ratio,
          width: snap.width,
          height: snap.height,
          cropX: snap.cropX,
          cropY: snap.cropY,
        })
      }

      ;(t as any).dirty = true
    }

    const onScaled = (e: { target?: any }) => {
      const t = e.target
      if (t instanceof FabricImage) _scaleSnapshots.delete(t)
    }

    canvas.on('mouse:down', onScalingStart)
    canvas.on('object:scaling', onScaling)
    canvas.on('object:modified', onScaled)

    // --- Mode édition de contenu ---

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
      const p = canvas.getPointer(e.e)
      _contentDragStart.set(t, {
        x: p.x,
        y: p.y,
        cropX: (t as any).cropX ?? 0,
        cropY: (t as any).cropY ?? 0,
      })
    }

    const onMouseMoveContent = (e: TPointerEventInfo<TPointerEvent>) => {
      const active = canvas.getActiveObject()
      if (!(active instanceof FabricImage)) return
      if (!isInContentMode(active)) return
      const start = _contentDragStart.get(active)
      if (!start) return
      const p = canvas.getPointer(e.e)
      const sx = active.scaleX ?? 1
      const sy = active.scaleY ?? 1
      // Drag → déplace le bitmap dans le sens du curseur,
      // donc cropX/cropY diminuent.
      const dxSrc = (p.x - start.x) / (sx || 1)
      const dySrc = (p.y - start.y) / (sy || 1)
      const w = active.width ?? 0
      const h = active.height ?? 0
      const { w: natW, h: natH } = naturalSize(active)
      let newCropX = start.cropX - dxSrc
      let newCropY = start.cropY - dySrc
      if (natW > 0) newCropX = Math.max(0, Math.min(newCropX, Math.max(0, natW - w)))
      if (natH > 0) newCropY = Math.max(0, Math.min(newCropY, Math.max(0, natH - h)))
      ;(active as any).set({ cropX: newCropX, cropY: newCropY })
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
