import { useEffect, useSyncExternalStore } from 'react'
import { Canvas, FabricImage, Rect, type FabricObject } from 'fabric'

// ---------------------------------------------------------------------------
// Modèle natif Fabric pour les images :
//   width/height = cadre visible (en pixels source)
//   cropX/cropY  = décalage du bitmap dans le cadre (en pixels source)
//   scaleX/scaleY = zoom visuel
//
// Mode crop explicite (style Canva) :
//   1. enterCropMode(img) → on étend l'image au bitmap complet (dimmed),
//      on ajoute un Rect "cropFrame" qui matérialise le cadre actuel.
//   2. L'utilisateur peut glisser le cropFrame (déplacer/redimensionner)
//      ET glisser l'image sous-jacente (repositionner le bitmap).
//   3. applyCrop() → recalcule width/height + cropX/cropY de l'image à partir
//      de la position/taille du cropFrame, puis sort du mode.
//   4. cancelCrop() → restaure le snapshot et sort du mode.
// ---------------------------------------------------------------------------

const CROP_FRAME_ID = '__crop_frame__'

type Snapshot = {
  left: number
  top: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  cropX: number
  cropY: number
  opacity: number
  selectable: boolean
  lockScalingX: boolean
  lockScalingY: boolean
  lockRotation: boolean
  hasControls: boolean
}

type CropState = {
  canvas: Canvas
  image: FabricImage
  cropFrame: Rect
  snapshot: Snapshot
}

let _state: CropState | null = null

// --- React subscription -----------------------------------------------------

const _listeners = new Set<() => void>()
function subscribe(fn: () => void) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}
function notify() {
  for (const fn of _listeners) fn()
}
function getSnapshot(): FabricImage | null {
  return _state?.image ?? null
}

/** Hook React qui retourne l'image en cours de crop, ou null. */
export function useCroppingImage(): FabricImage | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// --- Helpers ----------------------------------------------------------------

function naturalSize(img: FabricImage): { w: number; h: number } {
  const el = (img as any)._originalElement || (img as any)._element
  const w = el?.naturalWidth ?? el?.width ?? img.width ?? 0
  const h = el?.naturalHeight ?? el?.height ?? img.height ?? 0
  return { w, h }
}

export function isCropping(): boolean {
  return _state !== null
}

export function getCroppingImage(): FabricImage | null {
  return _state?.image ?? null
}

// --- Helpers publics conservés (utilisés par ImageMaskSection) -------------

/** Réinitialise le cadre à la taille naturelle du bitmap (pas de crop). */
export function fitFrameToContent(img: FabricImage): void {
  const { w, h } = naturalSize(img)
  if (w <= 0 || h <= 0) return
  ;(img as any).set({ width: w, height: h, cropX: 0, cropY: 0 })
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}

/** Recadre le bitmap (cover) en gardant le cadre affiché actuel. */
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

  ;(img as any).set({
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

// --- Mode crop --------------------------------------------------------------

export function enterCropMode(img: FabricImage): void {
  if (_state) return
  const canvas = img.canvas
  if (!canvas) return

  const { w: natW, h: natH } = naturalSize(img)
  if (natW <= 0 || natH <= 0) return

  const sx = img.scaleX ?? 1
  const sy = img.scaleY ?? 1
  const cropX = (img as any).cropX ?? 0
  const cropY = (img as any).cropY ?? 0
  const w = img.width ?? 0
  const h = img.height ?? 0
  const left = img.left ?? 0
  const top = img.top ?? 0

  const snapshot: Snapshot = {
    left,
    top,
    width: w,
    height: h,
    scaleX: sx,
    scaleY: sy,
    cropX,
    cropY,
    opacity: img.opacity ?? 1,
    selectable: img.selectable ?? true,
    lockScalingX: (img as any).lockScalingX ?? false,
    lockScalingY: (img as any).lockScalingY ?? false,
    lockRotation: (img as any).lockRotation ?? false,
    hasControls: (img as any).hasControls ?? true,
  }

  // Position courante du coin haut-gauche du cadre visible (déjà = left, top).
  // Position du coin haut-gauche du bitmap COMPLET si on retire le crop :
  //   fullLeft = left - cropX * sx
  //   fullTop  = top  - cropY * sy
  const fullLeft = left - cropX * sx
  const fullTop = top - cropY * sy

  // Étendre l'image au bitmap complet, dimmed, non-scalable.
  ;(img as any).set({
    width: natW,
    height: natH,
    cropX: 0,
    cropY: 0,
    left: fullLeft,
    top: fullTop,
    opacity: 0.4,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hasControls: false,
  })
  ;(img as any).dirty = true

  // Cadre crop : un Rect calé sur la zone actuellement visible.
  const cropFrame = new Rect({
    left,
    top,
    width: w * sx,
    height: h * sy,
    fill: 'rgba(255,255,255,0.001)', // quasi-transparent, mais hit-testable
    stroke: '#6366f1',
    strokeWidth: 2,
    strokeDashArray: [6, 4],
    strokeUniform: true,
    cornerColor: '#6366f1',
    cornerStyle: 'circle',
    transparentCorners: false,
    borderColor: '#6366f1',
    lockRotation: true,
    hasRotatingPoint: false,
    excludeFromExport: true,
    objectCaching: false,
  } as any)
  ;(cropFrame as any).data = { id: CROP_FRAME_ID, isCropFrame: true }

  canvas.add(cropFrame)
  canvas.setActiveObject(cropFrame)

  _state = { canvas, image: img, cropFrame, snapshot }
  notify()
  canvas.requestRenderAll()
}

export function cancelCrop(): void {
  if (!_state) return
  const { canvas, image, cropFrame, snapshot } = _state

  ;(image as any).set({
    width: snapshot.width,
    height: snapshot.height,
    cropX: snapshot.cropX,
    cropY: snapshot.cropY,
    scaleX: snapshot.scaleX,
    scaleY: snapshot.scaleY,
    left: snapshot.left,
    top: snapshot.top,
    opacity: snapshot.opacity,
    selectable: snapshot.selectable,
    lockScalingX: snapshot.lockScalingX,
    lockScalingY: snapshot.lockScalingY,
    lockRotation: snapshot.lockRotation,
    hasControls: snapshot.hasControls,
  })
  ;(image as any).dirty = true

  canvas.remove(cropFrame)
  canvas.setActiveObject(image)
  _state = null
  notify()
  canvas.requestRenderAll()
}

export function applyCrop(): void {
  if (!_state) return
  const { canvas, image, cropFrame, snapshot } = _state

  // Le cropFrame est en coordonnées canvas. Calculer sa position relative à
  // l'image étendue (qui montre le bitmap complet, scaleX/Y = snapshot).
  const sx = snapshot.scaleX || 1
  const sy = snapshot.scaleY || 1
  const fLeft = cropFrame.left ?? 0
  const fTop = cropFrame.top ?? 0
  const fW = (cropFrame.width ?? 0) * (cropFrame.scaleX ?? 1)
  const fH = (cropFrame.height ?? 0) * (cropFrame.scaleY ?? 1)
  const imgLeft = image.left ?? 0
  const imgTop = image.top ?? 0

  // Conversion canvas → pixels source (px source = px canvas / scale)
  let newCropX = (fLeft - imgLeft) / sx
  let newCropY = (fTop - imgTop) / sy
  let newW = fW / sx
  let newH = fH / sy

  // Clamp dans les limites du bitmap
  const { w: natW, h: natH } = naturalSize(image)
  if (newCropX < 0) {
    newW += newCropX
    newCropX = 0
  }
  if (newCropY < 0) {
    newH += newCropY
    newCropY = 0
  }
  if (newCropX + newW > natW) newW = natW - newCropX
  if (newCropY + newH > natH) newH = natH - newCropY
  if (newW < 1 || newH < 1) {
    // Crop dégénéré → annuler
    cancelCrop()
    return
  }

  // Restaurer l'image avec le nouveau cadre, position calée sur le cropFrame
  ;(image as any).set({
    width: newW,
    height: newH,
    cropX: newCropX,
    cropY: newCropY,
    scaleX: sx,
    scaleY: sy,
    left: imgLeft + newCropX * sx,
    top: imgTop + newCropY * sy,
    opacity: snapshot.opacity,
    selectable: snapshot.selectable,
    lockScalingX: snapshot.lockScalingX,
    lockScalingY: snapshot.lockScalingY,
    lockRotation: snapshot.lockRotation,
    hasControls: snapshot.hasControls,
  })
  ;(image as any).dirty = true
  image.setCoords()

  canvas.remove(cropFrame)
  canvas.setActiveObject(image)
  _state = null
  notify()
  canvas.requestRenderAll()
}

// --- Hook qui pose les listeners ------------------------------------------

export function useImageMask(fabricRef: React.RefObject<Canvas | null>) {
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Échap → annuler le mode crop
    const onKeyDown = (ev: KeyboardEvent) => {
      if (!_state) return
      if (ev.key === 'Escape') cancelCrop()
      else if (ev.key === 'Enter') applyCrop()
    }

    // Empêcher la désélection : si on clique en dehors du cropFrame en mode crop,
    // on garde l'état mais on rebascule la sélection sur le cropFrame.
    const onSelectionCleared = () => {
      if (!_state) return
      _state.canvas.setActiveObject(_state.cropFrame)
    }

    // Si l'image en cours de crop est supprimée, sortir du mode
    const onObjectRemoved = (e: { target?: FabricObject }) => {
      if (!_state) return
      if (e.target === _state.image) {
        // L'image a été retirée → cleanup
        _state.canvas.remove(_state.cropFrame)
        _state = null
        notify()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    canvas.on('selection:cleared', onSelectionCleared)
    canvas.on('object:removed', onObjectRemoved)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      canvas.off('selection:cleared', onSelectionCleared)
      canvas.off('object:removed', onObjectRemoved)
      if (_state) cancelCrop()
    }
  }, [fabricRef.current]) // eslint-disable-line react-hooks/exhaustive-deps
}
