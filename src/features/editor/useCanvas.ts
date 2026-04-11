import { useEffect, useRef, useCallback } from 'react'
import { Canvas, Rect, Gradient, FabricImage } from 'fabric'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { syncToStore } from './useAddObject'
import { gradientToFabric } from '@/components/shared/GradientPicker'
import { applyCustomControls, applyCustomControlsToObject } from './useCustomControls'

/** ID used for the page-background rectangle */
const PAGE_BG_ID = '__page_bg__'
/** ID used for the page-background image */
const PAGE_BG_IMG_ID = '__page_bg_img__'

/** Build the correct fill for the page background rect */
function buildPageBgFill(docW: number, docH: number): string | InstanceType<typeof Gradient> {
  const { canvasBgType, canvasBg, canvasBgGradient } = useUIStore.getState()
  if (canvasBgType === 'gradient') {
    return gradientToFabric(canvasBgGradient, docW, docH)
  }
  return canvasBg || '#ffffff'
}

/**
 * Ensure the page background rectangle exists on the canvas.
 * Call this after any operation that clears canvas objects (e.g. loadFromJSON).
 */
export function ensurePageBgRect(canvas: Canvas) {
  const { canvasWidth: docW, canvasHeight: docH, canvasBgType, canvasBgImage } = useUIStore.getState()
  let pageRect = canvas.getObjects().find((o) => o.data?.id === PAGE_BG_ID)
  const fill = buildPageBgFill(docW, docH)

  if (!pageRect) {
    pageRect = new Rect({
      left: 0, top: 0,
      originX: 'left', originY: 'top',
      width: docW, height: docH,
      fill: fill as any,
      selectable: false, evented: false, excludeFromExport: true,
      data: { id: PAGE_BG_ID, isPageBg: true },
      shadow: { color: 'rgba(0,0,0,0.3)', blur: 20, offsetX: 0, offsetY: 4 } as any,
    })
    canvas.add(pageRect)
  } else {
    // Force origin back to left/top — something in the pipeline (e.g. a
    // global object:added handler) can flip it to 'center', which would
    // center the pageBg at (0,0) and make it overlap the content wrong.
    pageRect.set({
      left: 0, top: 0,
      originX: 'left', originY: 'top',
      width: docW, height: docH,
      fill: fill as any,
    })
    pageRect.setCoords()
    ;(pageRect as any).dirty = true
    ;(pageRect as any)._cacheCanvas = null
  }
  canvas.sendObjectToBack(pageRect)

  // Handle background image
  ensurePageBgImage(canvas, docW, docH, canvasBgType === 'image' ? canvasBgImage : null)

  canvas.requestRenderAll()
}

/** Manage the page background image object */
function ensurePageBgImage(canvas: Canvas, docW: number, docH: number, imageUrl: string | null) {
  const existing = canvas.getObjects().find((o) => o.data?.id === PAGE_BG_IMG_ID)

  if (!imageUrl) {
    if (existing) {
      canvas.remove(existing)
    }
    return
  }

  // If the image URL hasn't changed and object exists, just resize
  if (existing && (existing as any).data?.srcUrl === imageUrl) {
    const img = existing as FabricImage
    const scaleX = docW / (img.width || 1)
    const scaleY = docH / (img.height || 1)
    img.set({ left: 0, top: 0, scaleX, scaleY })
    // Keep it just above the page rect
    const pageRect = canvas.getObjects().find((o) => o.data?.id === PAGE_BG_ID)
    if (pageRect) {
      const idx = canvas.getObjects().indexOf(pageRect)
      canvas.moveObjectTo(img, idx + 1)
    }
    return
  }

  // Remove old bg image if different
  if (existing) canvas.remove(existing)

  // Load the new image
  const imgEl = new Image()
  imgEl.onload = () => {
    const fImg = new FabricImage(imgEl, {
      left: 0, top: 0,
      selectable: false, evented: false, excludeFromExport: true,
      data: { id: PAGE_BG_IMG_ID, isPageBg: true, srcUrl: imageUrl },
    })
    const scaleX = docW / (fImg.width || 1)
    const scaleY = docH / (fImg.height || 1)
    fImg.set({ scaleX, scaleY })
    canvas.add(fImg)
    // Position just above the page rect
    const pageRect = canvas.getObjects().find((o) => o.data?.id === PAGE_BG_ID)
    if (pageRect) {
      const idx = canvas.getObjects().indexOf(pageRect)
      canvas.moveObjectTo(fImg, idx + 1)
    }
    canvas.requestRenderAll()
  }
  imgEl.src = imageUrl
}

export function useCanvas(canvasElRef: React.RefObject<HTMLCanvasElement>) {
  const fabricRef = useRef<Canvas | null>(null)
  const { canvasWidth, canvasHeight, canvasBg, canvasBgType, canvasBgGradient, canvasBgImage, setZoom } = useUIStore()
  const { setSelectedObjectId, setSelectedObjectIds } = useEditorStore()

  // Init Fabric canvas once
  useEffect(() => {
    const el = canvasElRef.current
    if (!el || fabricRef.current) return

    // Apply custom control styling before creating any objects
    applyCustomControls()

    const canvas = new Canvas(el, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: '#111111',  // Dark background around the page
      selection: true,
      preserveObjectStacking: true,
    })

    // Add page rectangle (white area representing the document)
    const pageRect = new Rect({
      left: 0, top: 0,
      width: canvasWidth, height: canvasHeight,
      fill: canvasBg ?? '#ffffff',
      selectable: false, evented: false, excludeFromExport: true,
      data: { id: PAGE_BG_ID, isPageBg: true },
      shadow: { color: 'rgba(0,0,0,0.3)', blur: 20, offsetX: 0, offsetY: 4 } as any,
    })
    canvas.add(pageRect)
    canvas.sendObjectToBack(pageRect)

    // Patch controls on every object added to the canvas
    canvas.on('object:added', (e: any) => {
      if (e.target) applyCustomControlsToObject(e.target)
    })

    fabricRef.current = canvas

    const handleSelect = (e: any) => {
      const obj = e.selected?.[0]
      if (!obj) return
      // Ensure data.id exists (may be missing after loadFromJSON)
      if (!obj.data) obj.data = {}
      if (!obj.data.id) {
        obj.data.id = `sel_${Date.now()}_${Math.random().toString(36).slice(2)}`
        // Also sync store so the new ID is captured
        syncToStore(canvas)
      }
      setSelectedObjectId(obj.data.id)

      // Track all selected object IDs for multi-selection support
      const allActive = canvas.getActiveObjects()
      const allIds = allActive
        .map((o: any) => o.data?.id)
        .filter((id: unknown): id is string => typeof id === 'string')
      setSelectedObjectIds(allIds.length > 0 ? allIds : [obj.data.id])
    }
    canvas.on('selection:created', handleSelect)
    canvas.on('selection:updated', handleSelect)
    canvas.on('selection:cleared', () => {
      setSelectedObjectId(null)
      setSelectedObjectIds([])
    })

    // Image mask handling (double-click → content edit, scaling modifiers, etc.)
    // is now provided by the useImageMask hook in CanvasContainer.

    return () => {
      canvas.dispose()
      fabricRef.current = null
    }
  }, [])  

  // Update page background rectangle when size, color, gradient or image changes
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    ensurePageBgRect(canvas)
  }, [canvasWidth, canvasHeight, canvasBg, canvasBgType, canvasBgGradient, canvasBgImage])

  // Fit canvas to container, centering the document
  const fitToContainer = useCallback(
    (containerEl: HTMLElement) => {
      const canvas = fabricRef.current
      if (!canvas) return
      const { offsetWidth: cw, offsetHeight: ch } = containerEl

      // Use fresh values from store to avoid stale closure
      const { canvasWidth: docW, canvasHeight: docH } = useUIStore.getState()
      const scaleX = (cw - 80) / docW
      const scaleY = (ch - 80) / docH
      const scale = Math.min(scaleX, scaleY)

      canvas.setDimensions({ width: cw, height: ch })
      const offsetX = (cw - docW * scale) / 2
      const offsetY = (ch - docH * scale) / 2
      canvas.setViewportTransform([scale, 0, 0, scale, offsetX, offsetY])
      setZoom(Math.round(scale * 100))
      canvas.requestRenderAll()
    },
    [setZoom],
  )

  return { fabricRef, fitToContainer }
}
