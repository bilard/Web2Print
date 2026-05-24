import { useEffect, useRef, useState } from 'react'
import type { Canvas, FabricObject } from 'fabric'
import { Relief3DEngine } from './Relief3DEngine'
import type { ReliefConfig } from './types'

interface Relief3DOverlayProps {
  active: boolean
  fObj: FabricObject | null
  canvas: Canvas | null
  containerEl: HTMLElement | null
  config: ReliefConfig
}

/**
 * Captures the selected Fabric object as a PNG, hides the original, and
 * renders a true 3D extruded mesh on a transparent canvas overlay using
 * Relief3DEngine. Lighting, depth, bevel and rotation are driven by the
 * config prop. Mouse drag rotates the mesh interactively.
 */
export function Relief3DOverlay({
  active, fObj, canvas, containerEl, config,
}: Relief3DOverlayProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [box, setBox] = useState<{ left: number; top: number; w: number; h: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Relief3DEngine | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; rotX: number; rotY: number } | null>(null)
  const [interactiveRot, setInteractiveRot] = useState<{ x: number; y: number } | null>(null)

  // Capture + hide original when activating
  useEffect(() => {
    if (!active || !fObj || !canvas || !containerEl) return

    const bound = (fObj as any).getBoundingRect?.(true) as
      { left: number; top: number; width: number; height: number } | undefined
    if (!bound) return

    const vpt = canvas.viewportTransform
    if (!vpt) return
    const scale = vpt[0]
    const screenLeft = bound.left * scale + vpt[4]
    const screenTop = bound.top * scale + vpt[5]
    const screenW = bound.width * scale
    const screenH = bound.height * scale

    // Add padding so the extruded sides + bevel never get clipped
    const pad = Math.max(40, screenW * 0.25, screenH * 0.25)

    const png = (fObj as any).toDataURL({ format: 'png', multiplier: 3 })
    setDataUrl(png)
    setBox({
      left: screenLeft - pad,
      top: screenTop - pad,
      w: screenW + pad * 2,
      h: screenH + pad * 2,
    })

    const wasVisible = fObj.visible !== false
    const prevHasControls = (fObj as any).hasControls !== false
    const prevHasBorders = (fObj as any).hasBorders !== false
    // Hide handles + borders so Fabric stops drawing selection UI over our 3D
    // overlay, but DO NOT discardActiveObject — that would clear selectedId in
    // the editor store and unmount the Animation3D panel mid-launch.
    ;(fObj as any).hasControls = false
    ;(fObj as any).hasBorders = false
    fObj.set({ visible: false })
    canvas.requestRenderAll()

    return () => {
      ;(fObj as any).hasControls = prevHasControls
      ;(fObj as any).hasBorders = prevHasBorders
      fObj.set({ visible: wasVisible })
      canvas.requestRenderAll()
      setDataUrl(null)
      setBox(null)
      setInteractiveRot(null)
    }
  }, [active, fObj, canvas, containerEl])

  // Boot the engine once the image + canvas + box are ready
  useEffect(() => {
    if (!active || !dataUrl || !box || !canvasRef.current) return
    const cvs = canvasRef.current
    const img = new Image()
    img.onload = () => {
      const engine = new Relief3DEngine({
        canvas: cvs,
        width: box.w,
        height: box.h,
        texture: img,
        config,
      })
      engine.start()
      engineRef.current = engine
    }
    img.src = dataUrl
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [active, dataUrl, box?.w, box?.h])

  // Push config updates into the engine (lighting / depth / bevel / rotation)
  useEffect(() => {
    if (!engineRef.current) return
    engineRef.current.updateConfig(config)
  }, [config])

  // Mouse drag → interactive rotation override
  useEffect(() => {
    if (!active || !canvasRef.current) return
    const el = canvasRef.current
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        rotX: interactiveRot?.x ?? config.rotX,
        rotY: interactiveRot?.y ?? config.rotY,
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current || !engineRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      const newRotY = dragRef.current.rotY + dx * 0.5
      const newRotX = Math.max(-80, Math.min(80, dragRef.current.rotX + dy * 0.5))
      engineRef.current.setRotation(newRotX, newRotY)
      setInteractiveRot({ x: newRotX, y: newRotY })
    }
    const onUp = (e: PointerEvent) => {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      dragRef.current = null
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [active, config.rotX, config.rotY, interactiveRot])

  if (!active || !dataUrl || !box) return null

  return (
    <canvas
      ref={canvasRef}
      width={box.w}
      height={box.h}
      className="absolute z-40 cursor-grab active:cursor-grabbing"
      style={{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.w}px`,
        height: `${box.h}px`,
        touchAction: 'none',
      }}
    />
  )
}
