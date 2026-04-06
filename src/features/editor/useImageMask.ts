import { useEffect, useSyncExternalStore } from 'react'
import { Canvas, FabricImage, Rect, Pattern, type FabricObject } from 'fabric'

// ---------------------------------------------------------------------------
// Mode crop explicite (style Canva).
//
// Deux modèles supportés :
//
// (A) FabricImage native :
//     width/height = cadre (en pixels source), cropX/cropY = décalage bitmap,
//     scaleX/scaleY = zoom visuel.
//
// (B) Forme (Rect) avec remplissage Pattern (image) — c'est le modèle utilisé
//     par les imports IDML et les outils de remplissage image. Le Rect EST
//     déjà le cadre ; le bitmap est positionné via patternTransform.
//
// Dans les deux cas, on entre en mode crop via `enterCropMode(obj)` et on
// sort via `applyCrop()` ou `cancelCrop()`.
// ---------------------------------------------------------------------------

const CROP_GHOST_ID = '__crop_ghost__'
const CROP_FRAME_ID = '__crop_frame__'

// --- Snapshots --------------------------------------------------------------

type ImageSnapshot = {
  kind: 'image'
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

type PatternSnapshot = {
  kind: 'pattern'
  fill: Pattern
  transform: number[]
  stroke: any
  strokeWidth: number
  strokeDashArray: number[] | null
  strokeUniform: boolean
}

type CropState =
  | {
      kind: 'image'
      canvas: Canvas
      image: FabricImage
      cropFrame: Rect
      snapshot: ImageSnapshot
    }
  | {
      kind: 'pattern'
      canvas: Canvas
      rect: FabricObject
      ghost: FabricImage
      snapshot: PatternSnapshot
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
function getSnapshot(): FabricObject | null {
  if (!_state) return null
  return _state.kind === 'image' ? _state.image : _state.rect
}

/** Hook React qui retourne l'objet en cours de crop, ou null. */
export function useCroppingImage(): FabricObject | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function isCropping(): boolean {
  return _state !== null
}

// --- Helpers ----------------------------------------------------------------

function naturalSize(img: FabricImage | HTMLImageElement | HTMLCanvasElement | null): {
  w: number
  h: number
} {
  if (!img) return { w: 0, h: 0 }
  if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement) {
    const w = (img as HTMLImageElement).naturalWidth ?? img.width ?? 0
    const h = (img as HTMLImageElement).naturalHeight ?? img.height ?? 0
    return { w, h }
  }
  const el = (img as any)._originalElement || (img as any)._element
  const w = el?.naturalWidth ?? el?.width ?? img.width ?? 0
  const h = el?.naturalHeight ?? el?.height ?? img.height ?? 0
  return { w, h }
}

function isPatternFilled(obj: FabricObject): boolean {
  return (obj as any).fill instanceof Pattern
}

/** Détecte si un objet est crop-able (FabricImage ou Rect avec fill image). */
export function canCrop(obj: FabricObject | null | undefined): boolean {
  if (!obj) return false
  if (obj instanceof FabricImage) return true
  return isPatternFilled(obj)
}

// --- Helpers publics conservés ---------------------------------------------

export function fitFrameToContent(img: FabricImage): void {
  const { w, h } = naturalSize(img)
  if (w <= 0 || h <= 0) return
  ;(img as any).set({ width: w, height: h, cropX: 0, cropY: 0 })
  ;(img as any).dirty = true
  img.canvas?.requestRenderAll()
}

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

// ===========================================================================
// Mode crop — point d'entrée polymorphe
// ===========================================================================

export function enterCropMode(obj: FabricObject): void {
  if (_state) return
  if (obj instanceof FabricImage) {
    enterCropImage(obj)
  } else if (isPatternFilled(obj)) {
    enterCropPattern(obj)
  }
}

export function cancelCrop(): void {
  if (!_state) return
  if (_state.kind === 'image') cancelCropImage()
  else cancelCropPattern()
}

export function applyCrop(): void {
  if (!_state) return
  if (_state.kind === 'image') applyCropImage()
  else applyCropPattern()
}

// --- (A) FabricImage --------------------------------------------------------

function enterCropImage(img: FabricImage): void {
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

  const snapshot: ImageSnapshot = {
    kind: 'image',
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

  const fullLeft = left - cropX * sx
  const fullTop = top - cropY * sy

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

  const cropFrame = new Rect({
    left,
    top,
    width: w * sx,
    height: h * sy,
    fill: 'rgba(255,255,255,0.001)',
    stroke: '#6366f1',
    strokeWidth: 2,
    strokeDashArray: [6, 4],
    strokeUniform: true,
    cornerColor: '#6366f1',
    cornerStyle: 'circle',
    transparentCorners: false,
    borderColor: '#6366f1',
    lockRotation: true,
    excludeFromExport: true,
    objectCaching: false,
  } as any)
  ;(cropFrame as any).data = { id: CROP_FRAME_ID, isCropFrame: true }

  canvas.add(cropFrame)
  canvas.setActiveObject(cropFrame)
  _state = { kind: 'image', canvas, image: img, cropFrame, snapshot }
  notify()
  canvas.requestRenderAll()
}

function cancelCropImage(): void {
  if (!_state || _state.kind !== 'image') return
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

function applyCropImage(): void {
  if (!_state || _state.kind !== 'image') return
  const { canvas, image, cropFrame, snapshot } = _state

  const sx = snapshot.scaleX || 1
  const sy = snapshot.scaleY || 1
  const fLeft = cropFrame.left ?? 0
  const fTop = cropFrame.top ?? 0
  const fW = (cropFrame.width ?? 0) * (cropFrame.scaleX ?? 1)
  const fH = (cropFrame.height ?? 0) * (cropFrame.scaleY ?? 1)
  const imgLeft = image.left ?? 0
  const imgTop = image.top ?? 0

  let newCropX = (fLeft - imgLeft) / sx
  let newCropY = (fTop - imgTop) / sy
  let newW = fW / sx
  let newH = fH / sy

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
    cancelCropImage()
    return
  }

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

// --- (B) Forme avec Pattern fill -------------------------------------------

function enterCropPattern(rect: FabricObject): void {
  const canvas = rect.canvas
  if (!canvas) return
  const fill = (rect as any).fill as Pattern
  if (!(fill instanceof Pattern)) return
  const source = (fill as any).source as HTMLImageElement | HTMLCanvasElement | null
  if (!source) return

  const transform = ((fill as any).patternTransform as number[]) ?? [1, 0, 0, 1, 0, 0]
  const [a, , , d, e, f] = transform

  const rsx = (rect as any).scaleX ?? 1
  const rsy = (rect as any).scaleY ?? 1
  const rLeft = (rect as any).left ?? 0
  const rTop = (rect as any).top ?? 0

  // Position et taille du bitmap complet en coordonnées canvas
  const ghostLeft = rLeft + e * rsx
  const ghostTop = rTop + f * rsy
  const ghostScaleX = a * rsx
  const ghostScaleY = d * rsy

  const snapshot: PatternSnapshot = {
    kind: 'pattern',
    fill,
    transform: [...transform],
    stroke: (rect as any).stroke,
    strokeWidth: (rect as any).strokeWidth ?? 0,
    strokeDashArray: ((rect as any).strokeDashArray as number[] | null) ?? null,
    strokeUniform: (rect as any).strokeUniform ?? false,
  }

  // Ghost = bitmap complet, dimmed, draggable mais pas redimensionnable
  const ghost = new FabricImage(source as any, {
    left: ghostLeft,
    top: ghostTop,
    scaleX: ghostScaleX,
    scaleY: ghostScaleY,
    opacity: 0.4,
    selectable: true,
    hasControls: false,
    lockRotation: true,
    excludeFromExport: true,
    objectCaching: false,
  } as any)
  ;(ghost as any).data = { id: CROP_GHOST_ID, isCropGhost: true }

  canvas.add(ghost)
  // Placer le ghost juste sous le rect pour qu'il reste cliquable autour
  const idx = canvas.getObjects().indexOf(rect)
  if (idx >= 0) canvas.moveObjectTo(ghost, idx)

  // Transformer le rect en cadre crop : fill quasi-transparent, contour dashed
  ;(rect as any).set({
    fill: 'rgba(255,255,255,0.001)',
    stroke: '#6366f1',
    strokeWidth: 2,
    strokeDashArray: [6, 4],
    strokeUniform: true,
    cornerColor: '#6366f1',
    cornerStyle: 'circle',
    transparentCorners: false,
    borderColor: '#6366f1',
  })
  ;(rect as any).dirty = true

  canvas.setActiveObject(rect)
  _state = { kind: 'pattern', canvas, rect, ghost, snapshot }
  notify()
  canvas.requestRenderAll()
}

function cancelCropPattern(): void {
  if (!_state || _state.kind !== 'pattern') return
  const { canvas, rect, ghost, snapshot } = _state
  ;(rect as any).set({
    fill: snapshot.fill,
    stroke: snapshot.stroke,
    strokeWidth: snapshot.strokeWidth,
    strokeDashArray: snapshot.strokeDashArray,
    strokeUniform: snapshot.strokeUniform,
  })
  ;(rect as any).dirty = true
  ;(rect as any)._cacheCanvas = null
  canvas.remove(ghost)
  canvas.setActiveObject(rect)
  _state = null
  notify()
  canvas.requestRenderAll()
}

function applyCropPattern(): void {
  if (!_state || _state.kind !== 'pattern') return
  const { canvas, rect, ghost, snapshot } = _state

  const rsx = (rect as any).scaleX ?? 1
  const rsy = (rect as any).scaleY ?? 1
  const rLeft = (rect as any).left ?? 0
  const rTop = (rect as any).top ?? 0

  // Calcul du nouveau patternTransform à partir de la position du ghost
  // dans l'espace local du rect (post-redimensionnement éventuel par Fabric).
  const gLeft = ghost.left ?? 0
  const gTop = ghost.top ?? 0
  const gsx = ghost.scaleX ?? 1
  const gsy = ghost.scaleY ?? 1

  const newE = (gLeft - rLeft) / (rsx || 1)
  const newF = (gTop - rTop) / (rsy || 1)
  const newA = gsx / (rsx || 1)
  const newD = gsy / (rsy || 1)

  const newPattern = new Pattern({
    source: (snapshot.fill as any).source,
    repeat: 'no-repeat',
    patternTransform: [newA, 0, 0, newD, newE, newF],
  })

  ;(rect as any).set({
    fill: newPattern,
    stroke: snapshot.stroke,
    strokeWidth: snapshot.strokeWidth,
    strokeDashArray: snapshot.strokeDashArray,
    strokeUniform: snapshot.strokeUniform,
  })
  ;(rect as any).dirty = true
  ;(rect as any)._cacheCanvas = null
  rect.setCoords()
  canvas.remove(ghost)
  canvas.setActiveObject(rect)
  _state = null
  notify()
  canvas.requestRenderAll()
}

// ===========================================================================
// Hook qui pose les listeners
// ===========================================================================

export function useImageMask(fabricRef: React.RefObject<Canvas | null>) {
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const onKeyDown = (ev: KeyboardEvent) => {
      if (!_state) return
      if (ev.key === 'Escape') cancelCrop()
      else if (ev.key === 'Enter') applyCrop()
    }

    const onSelectionCleared = () => {
      if (!_state) return
      const target = _state.kind === 'image' ? _state.cropFrame : _state.rect
      _state.canvas.setActiveObject(target as any)
    }

    const onObjectRemoved = (e: { target?: FabricObject }) => {
      if (!_state) return
      const root = _state.kind === 'image' ? _state.image : _state.rect
      if (e.target === root) {
        const ghostOrFrame = _state.kind === 'image' ? _state.cropFrame : _state.ghost
        _state.canvas.remove(ghostOrFrame as any)
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
