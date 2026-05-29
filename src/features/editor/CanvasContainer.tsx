import { useEffect, useRef, useState, useCallback } from 'react'
import { Canvas, Point, IText, FabricImage } from 'fabric'
import { useCanvas } from './useCanvas'
import { setIsInteracting } from './useAddObject'
import { registerDynamicFontVariant } from '@/features/assets/useFonts'
import { useZoom, usePan } from './useZoom'
import { useGrid } from './useGrid'
import { useSyncPropertiesToCanvas } from './useSelectedObject'
import { useHistory } from './useHistory'
import { useAutoSave } from './useAutoSave'
import { useLoadCanvas } from './useLoadCanvas'
import { useImageMask } from './useImageMask'
import { useSnapGuides, type SnapGuide } from './useSnapGuides'
import { useObjectOperations, setGlobalObjOps } from './useObjectOperations'
import { usePrintMarksSync } from './usePrintMarksSync'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { usePageNavigation } from './usePageNavigation'
import { syncToStore } from './useAddObject'
import { useTextEditMode } from './useTextEditMode'
import { ContextMenu } from '@/components/canvas/ContextMenu'
import { ImageCropToolbars } from '@/components/canvas/ImageCropToolbars'
import { Animation3DOverlay } from '@/features/animation3d/Animation3DOverlay'
import { Flip3DOverlay } from '@/features/animation3d/Flip3DOverlay'
import { Relief3DOverlay } from '@/features/animation3d/Relief3DOverlay'
import { useAutoPlayPersisted } from '@/features/animation3d/useAutoPlayPersisted'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { setGlobalFabricCanvas } from './globalCanvas'

// Ré-export pour compat : les consommateurs de l'éditeur (chunks lazy) continuent
// d'importer `globalFabricCanvas` depuis ce module. La VRAIE déclaration vit dans
// `globalCanvas.ts` afin que les consommateurs eager légers ne tirent pas Fabric.
export { globalFabricCanvas } from './globalCanvas'
export let globalUndo: (() => void) | null = null
export let globalRedo: (() => void) | null = null
export let globalSnapshot: (() => void) | null = null
export let globalFitCanvas: (() => void) | null = null

interface ContextMenuState { x: number; y: number }

export function CanvasContainer() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { fabricRef, fitToContainer } = useCanvas(canvasElRef)
  const [canvasReady, setCanvasReady] = useState<Canvas | null>(null)
  const {
    zoom, canvasWidth, canvasHeight,
    particlesOverlayActive,
    flip3DActive, flip3DConfig,
    relief3DActive, relief3DConfig,
    autoPlayAnimations,
  } = useUIStore()
  const { selectedObjectId } = useEditorStore()
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 })

  const flip3DTarget = flip3DActive && selectedObjectId && canvasReady
    ? canvasReady.getObjects().find((o: any) => o.data?.id === selectedObjectId) ?? null
    : null

  const relief3DTarget = relief3DActive && selectedObjectId && canvasReady
    ? canvasReady.getObjects().find((o: any) => o.data?.id === selectedObjectId) ?? null
    : null

  // Auto-play any persisted animations when toggle is on
  useAutoPlayPersisted(canvasReady, autoPlayAnimations)

  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Expose canvas + fit
  useEffect(() => {
    if (!fabricRef.current || !containerRef.current) return
    setGlobalFabricCanvas(fabricRef.current)
    ;(window as any).__fabricCanvas = fabricRef.current
    setCanvasReady(fabricRef.current)
    fitToContainer(containerRef.current)

    // Empêche la déformation des blocs texte au resize. Déclenché sur
    // `object:modified` (fin de drag) et PAS `object:scaling` (pendant le
    // drag) — sinon on réinitialise scaleX à mi-geste et Fabric recalcule
    // mal, ce qui fait rétrécir le texte jusqu'à disparaître.
    const canvas = fabricRef.current
    const SIDE_CORNERS = new Set(['ml', 'mr'])
    const VERT_CORNERS = new Set(['mt', 'mb'])
    const handleTextModified = (e: any) => {
      const target = e.target
      if (!target) return
      const corner = e.transform?.corner as string | undefined
       
      const t = target as any

      const rewriteText = (txt: any) => {
        const sx = txt.scaleX ?? 1
        const sy = txt.scaleY ?? 1
        if (sx === 1 && sy === 1) return
        if (corner && SIDE_CORNERS.has(corner)) {
          // handle latéral : on étend la largeur sans changer le fontSize
          txt.set({ width: (txt.width ?? 100) * sx, scaleX: 1, scaleY: 1 })
        } else if (corner && VERT_CORNERS.has(corner)) {
          // handle vertical : Textbox se re-layoute seul via width, rien à faire
          txt.set({ scaleX: 1, scaleY: 1 })
        } else {
          // coin (tl/tr/bl/br) : scale uniforme → on bake le scale dans
          // fontSize + width pour garder la lisibilité
          const scale = Math.min(sx, sy)
          const newFontSize = (txt.fontSize ?? 16) * scale
          txt.set({
            fontSize: newFontSize,
            width: (txt.width ?? 100) * sx,
            scaleX: 1,
            scaleY: 1,
          })
        }
        if (typeof txt.initDimensions === 'function') txt.initDimensions()
        txt.dirty = true
      }

      if (target instanceof IText) {
        rewriteText(t)
      } else if (t.type === 'group' && Array.isArray(t._objects)) {
        // Groupe : propage le scale du groupe aux enfants texte puis reset
        for (const child of t._objects) {
          if (child instanceof IText) rewriteText(child)
        }
      }
      canvas.requestRenderAll()
    }
    // Track active manipulation to prevent store→canvas feedback loop
    const onTransformStart = () => setIsInteracting(true)
    const onTransformEnd = () => setIsInteracting(false)

    canvas.on('object:modified', handleTextModified)
    canvas.on('mouse:down', onTransformStart)
    canvas.on('mouse:up', onTransformEnd)
    return () => {
      canvas.off('object:modified', handleTextModified)
      canvas.off('mouse:down', onTransformStart)
      canvas.off('mouse:up', onTransformEnd)
    }
  }, [])  

  // Re-fit when document dimensions change (template change)
  useEffect(() => {
    if (!containerRef.current) return
    fitToContainer(containerRef.current)
  }, [canvasWidth, canvasHeight, fitToContainer])

  // Expose fit globally
  useEffect(() => {
    globalFitCanvas = () => {
      if (containerRef.current) fitToContainer(containerRef.current)
    }
    return () => { globalFitCanvas = null }
  }, [fitToContainer])


  // Sync zoom from footer buttons
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const current = Math.round(canvas.getZoom() * 100)
    if (current === zoom) return
    const center = new Point(canvas.getWidth() / 2, canvas.getHeight() / 2)
    canvas.zoomToPoint(center, zoom / 100)
    canvas.requestRenderAll()
  }, [zoom])  

  // Resize observer — only resize the HTML canvas, keep current zoom/pan
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      const canvas = fabricRef.current
      if (!canvas) return
      const { offsetWidth: cw, offsetHeight: ch } = container
      canvas.setDimensions({ width: cw, height: ch })
      setOverlaySize({ width: cw, height: ch })
      // Keep current zoom but re-center the document so it stays visible
      // when the container is resized (e.g., side panels opening/closing).
      const { canvasWidth: docW, canvasHeight: docH } = useUIStore.getState()
      const vpt = canvas.viewportTransform
      if (vpt) {
        const scale = vpt[0]
        const offsetX = (cw - docW * scale) / 2
        const offsetY = (ch - docH * scale) / 2
        canvas.setViewportTransform([scale, 0, 0, scale, offsetX, offsetY])
      }
      canvas.requestRenderAll()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Context menu
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const active = canvas.getActiveObject()
      if (!active) return
      setContextMenu({ x: e.clientX, y: e.clientY })
    }
    const el = canvas.getElement()
    el.addEventListener('contextmenu', onContextMenu)
    return () => el.removeEventListener('contextmenu', onContextMenu)
  }, [fabricRef.current])  

  useZoom(fabricRef)
  usePan(fabricRef)
  useGrid(fabricRef)
  useSyncPropertiesToCanvas(fabricRef)
  useSnapGuides(fabricRef, setSnapGuides)
  useImageMask(fabricRef)
  useTextEditMode(fabricRef)
  usePrintMarksSync(fabricRef)

  const { undo, redo, snapshot } = useHistory(fabricRef)
  useAutoSave(fabricRef)
  useLoadCanvas(fabricRef)

  const ops = useObjectOperations()
  useEffect(() => { setGlobalObjOps(ops) }, [ops])

  useKeyboardShortcuts()
  usePageNavigation()

  // Drop image from Assets panel onto canvas
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const canvas = fabricRef.current
    if (!canvas) return

    // Font drop — apply font to the text object under the cursor
    const fontData = e.dataTransfer.getData('application/x-asset-font')
    if (fontData) {
      try {
        const { family, weight, style, url } = JSON.parse(fontData) as {
          family: string
          weight: string
          style: string
          url: string
        }
        // Convert drop position (screen) → document coords
        const rect = containerRef.current?.getBoundingClientRect()
        const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
        const zoom = canvas.getZoom()
        const dropX = rect ? ((e.clientX - rect.left) - vt[4]) / zoom : 0
        const dropY = rect ? ((e.clientY - rect.top) - vt[5]) / zoom : 0

        // Find first text object under the drop point (prefer top-most → iterate reversed)
        const textTypes = new Set(['i-text', 'textbox', 'text'])
        const objs = canvas.getObjects()
        let target: (typeof objs)[number] | undefined
        for (let i = objs.length - 1; i >= 0; i--) {
          const obj = objs[i]
          if (!(obj instanceof IText) && !textTypes.has(obj.type as string)) continue
          const r = obj.getBoundingRect()
          if (dropX >= r.left && dropX <= r.left + r.width && dropY >= r.top && dropY <= r.top + r.height) {
            target = obj
            break
          }
        }
        if (!target) {
          return
        }

        // Load font file via FontFace API, then apply
        if (url) {
          try {
            const face = new FontFace(family, `url(${url})`, {
              weight: weight || '400',
              style: style || 'normal',
            })
            await face.load()
            ;(document.fonts as any).add(face)
            registerDynamicFontVariant(family, weight || '400', style || 'normal', '')
          } catch (loadErr) {
            console.warn('[Canvas] FontFace load failed:', loadErr)
          }
        }

        ;(target as any).set({
          fontFamily: family,
          fontWeight: parseInt(weight || '400', 10) || weight || 400,
          fontStyle: style || 'normal',
        })
        canvas.requestRenderAll()
        syncToStore(canvas)
      } catch (err) {
        console.warn('[Canvas] Drop font error:', err)
      }
      return
    }

    const data = e.dataTransfer.getData('application/x-asset-image')
    if (!data) return

    try {
      const { url, name } = JSON.parse(data) as { url: string; name: string }
      const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
      const id = `img_${Date.now()}`

      // Convert drop position (screen) → document coords
      const rect = containerRef.current?.getBoundingClientRect()
      const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
      const zoom = canvas.getZoom()
      const dropX = rect ? ((e.clientX - rect.left) - vt[4]) / zoom : 0
      const dropY = rect ? ((e.clientY - rect.top) - vt[5]) / zoom : 0

      // Scale down if > 400px
      const maxW = 400
      const imgW = img.width ?? maxW
      if (imgW > maxW) {
        const scale = maxW / imgW
        img.scaleX = scale
        img.scaleY = scale
      }

      img.set({
        left: dropX - img.getScaledWidth() / 2,
        top: dropY - img.getScaledHeight() / 2,
        data: { id, type: 'image', name: name.slice(0, 25) },
      })

      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.requestRenderAll()
      syncToStore(canvas)
      img.on('modified', () => syncToStore(canvas))
      img.on('moving', () => syncToStore(canvas))
      img.on('scaling', () => syncToStore(canvas))
    } catch (err) {
      console.warn('[Canvas] Drop image error:', err)
    }
  }, [fabricRef])

  useEffect(() => {
    globalUndo = undo
    globalRedo = redo
    globalSnapshot = snapshot
    return () => { globalUndo = null; globalRedo = null; globalSnapshot = null }
  }, [undo, redo])

  // Compute guide positions in screen coords
  const vt = fabricRef.current?.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoom_ = fabricRef.current?.getZoom() ?? 1

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden bg-[#111] ${dragOver ? 'ring-2 ring-inset ring-indigo-500/50' : ''}`}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes('application/x-asset-image') ||
          e.dataTransfer.types.includes('application/x-asset-font')
        ) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <canvas ref={canvasElRef} />

      {/* Snap guides overlay */}
      {snapGuides.map((g, i) =>
        g.type === 'v' ? (
          <div key={i} className="absolute top-0 bottom-0 w-px bg-indigo-500/70 pointer-events-none z-20"
            style={{ left: Math.round(g.pos * zoom_ + vt[4]) }} />
        ) : (
          <div key={i} className="absolute left-0 right-0 h-px bg-indigo-500/70 pointer-events-none z-20"
            style={{ top: Math.round(g.pos * zoom_ + vt[5]) }} />
        )
      )}

      {/* Image crop toolbars (floating) */}
      <ImageCropToolbars canvas={canvasReady} />

      {/* Three.js particles overlay (retail digital signage 3D) */}
      <Animation3DOverlay
        active={particlesOverlayActive}
        width={overlaySize.width}
        height={overlaySize.height}
      />

      {/* Real 3D rotateY overlay via captured PNG */}
      <Flip3DOverlay
        active={flip3DActive}
        fObj={flip3DTarget}
        canvas={canvasReady}
        duration={flip3DConfig.duration}
        loop={flip3DConfig.loop}
        intensity={flip3DConfig.intensity}
        containerEl={containerRef.current}
      />

      {/* Relief 3D — Three.js extruded mesh + manual lighting */}
      <Relief3DOverlay
        active={relief3DActive}
        fObj={relief3DTarget}
        canvas={canvasReady}
        containerEl={containerRef.current}
        config={relief3DConfig}
      />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}
