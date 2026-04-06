import { useEffect, useRef, useState, useCallback } from 'react'
import { Canvas, Point, IText, FabricImage } from 'fabric'
import { useCanvas } from './useCanvas'
import { setIsInteracting } from './useAddObject'
import { useZoom, usePan } from './useZoom'
import { useGrid } from './useGrid'
import { useSyncPropertiesToCanvas } from './useSelectedObject'
import { useHistory } from './useHistory'
import { useAutoSave } from './useAutoSave'
import { useLoadCanvas } from './useLoadCanvas'
import { useImageMask } from './useImageMask'
import { useSnapGuides, type SnapGuide } from './useSnapGuides'
import { useObjectOperations, setGlobalObjOps } from './useObjectOperations'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { usePageNavigation } from './usePageNavigation'
import { syncToStore } from './useAddObject'
import { ContextMenu } from '@/components/canvas/ContextMenu'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { FileText } from 'lucide-react'

export let globalFabricCanvas: Canvas | null = null
export let globalUndo: (() => void) | null = null
export let globalRedo: (() => void) | null = null
export let globalFitCanvas: (() => void) | null = null

interface ContextMenuState { x: number; y: number }

export function CanvasContainer() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { fabricRef, fitToContainer } = useCanvas(canvasElRef)
  const { zoom, canvasWidth, canvasHeight } = useUIStore()
  const { selectedObjectId } = useEditorStore()

  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Expose canvas + fit
  useEffect(() => {
    if (!fabricRef.current || !containerRef.current) return
    globalFabricCanvas = fabricRef.current
    ;(window as any).__fabricCanvas = fabricRef.current
    fitToContainer(containerRef.current)

    // Prevent text deformation on resize: convert scale to width change
    const canvas = fabricRef.current
    const handleTextScaling = (e: any) => {
      const target = e.target
      if (target instanceof IText) {
        const newWidth = target.width * target.scaleX
        target.set({
          width: newWidth,
          scaleX: 1,
          scaleY: 1,
        })
      }
    }
    // Track active manipulation to prevent store→canvas feedback loop
    const onTransformStart = () => setIsInteracting(true)
    const onTransformEnd = () => setIsInteracting(false)

    canvas.on('object:scaling', handleTextScaling)
    canvas.on('mouse:down', onTransformStart)
    canvas.on('mouse:up', onTransformEnd)
    return () => {
      canvas.off('object:scaling', handleTextScaling)
      canvas.off('mouse:down', onTransformStart)
      canvas.off('mouse:up', onTransformEnd)
    }
  }, [fabricRef.current]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resize observer — only resize the HTML canvas, keep current zoom/pan
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      const canvas = fabricRef.current
      if (!canvas) return
      const { offsetWidth: cw, offsetHeight: ch } = container
      // Only update the canvas element dimensions, preserve viewport transform
      canvas.setDimensions({ width: cw, height: ch })
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
  }, [fabricRef.current]) // eslint-disable-line react-hooks/exhaustive-deps

  useZoom(fabricRef)
  usePan(fabricRef)
  useGrid(fabricRef)
  useSyncPropertiesToCanvas(fabricRef)
  useSnapGuides(fabricRef, setSnapGuides)
  useImageMask(fabricRef)

  const { undo, redo } = useHistory(fabricRef)
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
    return () => { globalUndo = null; globalRedo = null }
  }, [undo, redo])

  // Compute guide positions in screen coords
  const vt = fabricRef.current?.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoom_ = fabricRef.current?.getZoom() ?? 1

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden bg-[#111] ${dragOver ? 'ring-2 ring-inset ring-indigo-500/50' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-asset-image')) {
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

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}
