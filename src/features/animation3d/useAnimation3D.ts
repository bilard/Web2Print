import { useEffect, useRef } from 'react'
import type { FabricObject, Canvas } from 'fabric'
import { Shadow } from 'fabric'
import type { Animation3DConfig } from './types'

const HUE_COLORS = ['#FF2D55', '#FFD60A', '#00C7BE', '#FF006E', '#A78BFA']

interface Animation3DController {
  stop: () => void
}

/**
 * Apply a 3D-flavored animation to a Fabric object.
 *
 * Three.js-grade rotations are not native to Fabric; we approximate with a
 * combination of Fabric's animate API (scale, angle, fill, shadow) and CSS3D
 * transforms on the canvas wrapper element when a real 3D feel is needed.
 */
export function startObjectAnimation(
  fObj: FabricObject,
  canvas: Canvas,
  config: Animation3DConfig
): Animation3DController {
  const cancelers: Array<() => void> = []
  const durMs = Math.max(200, config.duration * 1000)
  const intensity = config.intensity ?? 1

  // Snapshot baseline so we can restore on stop
  const baseline = {
    scaleX: fObj.scaleX ?? 1,
    scaleY: fObj.scaleY ?? 1,
    angle: fObj.angle ?? 0,
    fill: (fObj as any).fill as string | undefined,
    shadow: (fObj as any).shadow as Shadow | string | null | undefined,
    skewX: fObj.skewX ?? 0,
    skewY: fObj.skewY ?? 0,
  }

  const renderFlag = () => canvas.requestRenderAll()
  let running = true
  let rafId: number | null = null
  const startTime = performance.now()

  switch (config.preset) {
    case 'rotate3D': {
      // Animate angle (Z) + skewX (fakes Y-rotation perspective)
      const tick = () => {
        if (!running) return
        const t = (performance.now() - startTime) / durMs
        const cycle = config.loop ? t : Math.min(t, 1)
        fObj.set({
          angle: baseline.angle + cycle * 360,
          skewX: Math.sin(cycle * Math.PI * 2) * 20 * intensity,
          skewY: Math.cos(cycle * Math.PI * 2) * 8 * intensity,
        })
        canvas.requestRenderAll()
        if (config.loop || cycle < 1) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      cancelers.push(() => { if (rafId !== null) cancelAnimationFrame(rafId) })
      break
    }

    case 'pulseScale': {
      const tick = () => {
        if (!running) return
        const t = (performance.now() - startTime) / durMs
        const k = 0.5 + 0.5 * Math.sin(t * Math.PI * 2)
        const scale = 1 + k * 0.15 * intensity
        fObj.set({
          scaleX: baseline.scaleX * scale,
          scaleY: baseline.scaleY * scale,
        })
        canvas.requestRenderAll()
        if (config.loop) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      cancelers.push(() => { if (rafId !== null) cancelAnimationFrame(rafId) })
      break
    }

    case 'hueCycle': {
      const tick = () => {
        if (!running) return
        const t = (performance.now() - startTime) / durMs
        const idx = (t * HUE_COLORS.length) % HUE_COLORS.length
        const a = Math.floor(idx) % HUE_COLORS.length
        const b = (a + 1) % HUE_COLORS.length
        const k = idx - Math.floor(idx)
        const color = mixHex(HUE_COLORS[a], HUE_COLORS[b], k)
        // Only set fill if the object is fillable
        if ((fObj as any).fill !== undefined && (fObj as any).type !== 'image') {
          fObj.set({ fill: color })
        }
        // For images, use shadow color cycle instead
        if ((fObj as any).type === 'image') {
          fObj.set({
            shadow: new Shadow({
              color,
              blur: 60 * intensity,
              offsetX: 0,
              offsetY: 0,
            }),
          })
        }
        canvas.requestRenderAll()
        if (config.loop) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      cancelers.push(() => { if (rafId !== null) cancelAnimationFrame(rafId) })
      break
    }

    case 'slideEntrance': {
      const dir = (config.direction === 'right' ? 'right' : 'left') as 'left' | 'right'
      const canvasW = canvas.getWidth() / (canvas.getZoom() || 1)
      const startX = dir === 'left' ? -canvasW : canvasW
      const endX = fObj.left ?? 0
      const replay = () => {
        if (!running) return
        fObj.set({ left: endX + startX })
        ;(fObj as any).animate({ left: endX }, {
          duration: durMs,
          easing: easeOutExpo,
          onChange: renderFlag,
          onComplete: () => { if (config.loop) replay() },
        })
      }
      replay()
      cancelers.push(() => { fObj.set({ left: endX }) })
      break
    }

    case 'slideVertical': {
      const dir = (config.direction === 'top' ? 'top' : 'bottom') as 'top' | 'bottom'
      const canvasH = canvas.getHeight() / (canvas.getZoom() || 1)
      const startY = dir === 'top' ? -canvasH : canvasH
      const endY = fObj.top ?? 0
      const replay = () => {
        if (!running) return
        fObj.set({ top: endY + startY })
        ;(fObj as any).animate({ top: endY }, {
          duration: durMs,
          easing: easeOutExpo,
          onChange: renderFlag,
          onComplete: () => { if (config.loop) replay() },
        })
      }
      replay()
      cancelers.push(() => { fObj.set({ top: endY }) })
      break
    }

    case 'motionPath': {
      const cx = fObj.left ?? 0
      const cy = fObj.top ?? 0
      const radius = 80 * intensity
      const tick = () => {
        if (!running) return
        const t = (performance.now() - startTime) / durMs
        const a = t * Math.PI * 2
        // Figure-8 path (Lissajous 1:2)
        fObj.set({
          left: cx + Math.sin(a) * radius,
          top: cy + Math.sin(a * 2) * radius * 0.5,
        })
        canvas.requestRenderAll()
        if (config.loop) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      cancelers.push(() => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        fObj.set({ left: cx, top: cy })
      })
      break
    }

    case 'vibrate': {
      // Deterministic shake (seeded over time)
      const baseLeft = fObj.left ?? 0
      const baseTop = fObj.top ?? 0
      const amp = 6 * intensity
      const tick = () => {
        if (!running) return
        const t = (performance.now() - startTime) / 30 // 30ms steps
        const dx = Math.sin(t * 7.13) * amp + Math.cos(t * 11.7) * amp * 0.5
        const dy = Math.sin(t * 9.27) * amp + Math.cos(t * 13.3) * amp * 0.5
        fObj.set({ left: baseLeft + dx, top: baseTop + dy })
        canvas.requestRenderAll()
        if (config.loop) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      cancelers.push(() => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        fObj.set({ left: baseLeft, top: baseTop })
      })
      break
    }

    case 'bounce': {
      const baseTop = fObj.top ?? 0
      const height = 80 * intensity
      const tick = () => {
        if (!running) return
        const t = (performance.now() - startTime) / durMs
        // |sin| gives bouncing curve, then damped (gravity feel)
        const k = Math.abs(Math.sin(t * Math.PI * 2))
        const drop = height * (1 - k) // top of arc = min, bottom = base
        fObj.set({ top: baseTop + drop })
        canvas.requestRenderAll()
        if (config.loop) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      cancelers.push(() => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        fObj.set({ top: baseTop })
      })
      break
    }

    case 'wave': {
      const tick = () => {
        if (!running) return
        const t = (performance.now() - startTime) / durMs
        fObj.set({
          skewX: Math.sin(t * Math.PI * 2) * 12 * intensity,
          skewY: Math.sin(t * Math.PI * 2 + Math.PI / 2) * 4 * intensity,
        })
        canvas.requestRenderAll()
        if (config.loop) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      cancelers.push(() => { if (rafId !== null) cancelAnimationFrame(rafId) })
      break
    }

    case 'flip3D':
      // Handled by Flip3DOverlay.tsx via captured PNG + CSS3D transform.
      // The Fabric object is hidden while the overlay is active.
      break

    case 'glowAccent': {
      const tick = () => {
        if (!running) return
        const t = (performance.now() - startTime) / durMs
        const k = 0.5 + 0.5 * Math.sin(t * Math.PI * 2)
        const blur = 20 + k * 80 * intensity
        fObj.set({
          shadow: new Shadow({
            color: '#FF2D55',
            blur,
            offsetX: 0,
            offsetY: 0,
          }),
        })
        canvas.requestRenderAll()
        if (config.loop) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      cancelers.push(() => { if (rafId !== null) cancelAnimationFrame(rafId) })
      break
    }

    case 'particles':
      // No-op on the Fabric object — Particles are an overlay handled by
      // Animation3DOverlay.tsx. Returned controller is still respected.
      break
  }

  return {
    stop: () => {
      running = false
      cancelers.forEach((c) => c())
      fObj.set({
        scaleX: baseline.scaleX,
        scaleY: baseline.scaleY,
        angle: baseline.angle,
        skewX: baseline.skewX,
        skewY: baseline.skewY,
        fill: baseline.fill,
        shadow: baseline.shadow as any,
      })
      canvas.requestRenderAll()
    },
  }
}

function easeOutExpo(t: number, b: number, c: number, d: number): number {
  return t === d ? b + c : c * (1 - Math.pow(2, -10 * t / d)) + b
}

function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ar = (pa >> 16) & 0xff, ag = (pa >> 8) & 0xff, ab = pa & 0xff
  const br = (pb >> 16) & 0xff, bg = (pb >> 8) & 0xff, bb = pb & 0xff
  const r = Math.round(ar + (br - ar) * k)
  const g = Math.round(ag + (bg - ag) * k)
  const bl = Math.round(ab + (bb - ab) * k)
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0').toUpperCase()}`
}

/**
 * React hook variant — convenience for components that want a "preview mode"
 * tied to React state lifecycle.
 */
export function useAnimation3DPreview(
  active: boolean,
  fObj: FabricObject | null,
  canvas: Canvas | null,
  config: Animation3DConfig
) {
  const ctrlRef = useRef<Animation3DController | null>(null)

  useEffect(() => {
    if (!active || !fObj || !canvas) return
    ctrlRef.current = startObjectAnimation(fObj, canvas, config)
    return () => {
      ctrlRef.current?.stop()
      ctrlRef.current = null
    }
  }, [active, fObj, canvas, config])
}
