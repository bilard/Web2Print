import { useEffect, useRef, useState } from 'react'
import type { Canvas, FabricObject } from 'fabric'

interface Flip3DOverlayProps {
  active: boolean
  fObj: FabricObject | null
  canvas: Canvas | null
  duration: number
  loop: boolean
  intensity: number
  containerEl: HTMLElement | null
}

/**
 * Real 3D rotateY animation by capturing the Fabric object as a PNG and
 * animating an HTML <img> overlay with CSS3D transforms. The original Fabric
 * object is hidden while the overlay is active and restored on stop.
 *
 * This gives a genuine 3D look (perspective + Y axis rotation) that Fabric
 * alone cannot produce — Fabric's canvas API is 2D.
 */
export function Flip3DOverlay({
  active, fObj, canvas, duration, loop, intensity, containerEl,
}: Flip3DOverlayProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [box, setBox] = useState<{ left: number; top: number; w: number; h: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)

  // When active becomes true: capture object, hide Fabric original
  useEffect(() => {
    if (!active || !fObj || !canvas || !containerEl) return

    const bound = (fObj as any).getBoundingRect?.(true) as { left: number; top: number; width: number; height: number } | undefined
    if (!bound) return

    // Convert Fabric object coords → container client coords (incl. zoom + pan)
    const vpt = canvas.viewportTransform
    if (!vpt) return
    const scale = vpt[0]
    const offsetX = vpt[4]
    const offsetY = vpt[5]
    const screenLeft = bound.left * scale + offsetX
    const screenTop = bound.top * scale + offsetY
    const screenW = bound.width * scale
    const screenH = bound.height * scale

    // Snapshot Fabric object to PNG (3× upscale for crispness)
    const png = (fObj as any).toDataURL({
      format: 'png',
      multiplier: 3,
    })
    setDataUrl(png)
    setBox({ left: screenLeft, top: screenTop, w: screenW, h: screenH })

    // Hide original
    const wasVisible = fObj.visible !== false
    fObj.set({ visible: false })
    canvas.requestRenderAll()

    startRef.current = performance.now()

    return () => {
      // Restore
      fObj.set({ visible: wasVisible })
      canvas.requestRenderAll()
      setDataUrl(null)
      setBox(null)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [active, fObj, canvas, containerEl])

  // Animate rotateY on the overlay <img>
  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active || !overlayRef.current) return
    const el = overlayRef.current
    const durMs = Math.max(200, duration * 1000)
    const tick = () => {
      const t = (performance.now() - startRef.current) / durMs
      const cycle = loop ? t : Math.min(t, 1)
      const ry = cycle * 360
      const rx = Math.sin(cycle * Math.PI * 2) * 12 * intensity
      const rz = Math.cos(cycle * Math.PI * 2) * 6 * intensity
      el.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg)`
      if (loop || cycle < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [active, duration, loop, intensity])

  if (!active || !dataUrl || !box) return null

  return (
    <div
      className="pointer-events-none absolute z-40"
      style={{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.w}px`,
        height: `${box.h}px`,
        perspective: '1200px',
        perspectiveOrigin: '50% 50%',
      }}
    >
      <div
        ref={overlayRef}
        style={{
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          backfaceVisibility: 'visible',
        }}
      >
        <img
          src={dataUrl}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'contain',
            filter: 'drop-shadow(0 8px 32px rgba(255,45,85,0.45))',
          }}
        />
      </div>
    </div>
  )
}
