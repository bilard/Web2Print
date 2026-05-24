import { useEffect, useRef } from 'react'
import { ParticlesEngine } from './ParticlesEngine'

interface Animation3DOverlayProps {
  /** When true the particles canvas is mounted and the engine is running. */
  active: boolean
  /** Container size — should match the Fabric canvas wrapper. */
  width: number
  height: number
  /** Particle color (hex int). Defaults to retail gold. */
  color?: number
}

/**
 * Transparent canvas layered on top of the Fabric canvas to render Three.js
 * particles. Pointer-events are disabled so Fabric still receives clicks.
 */
export function Animation3DOverlay({ active, width, height, color = 0xFFD60A }: Animation3DOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ParticlesEngine | null>(null)

  useEffect(() => {
    if (!active || !canvasRef.current) return
    const engine = new ParticlesEngine({
      canvas: canvasRef.current,
      width,
      height,
      color,
    })
    engine.start()
    engineRef.current = engine
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [active, color])

  useEffect(() => {
    if (engineRef.current) engineRef.current.resize(width, height)
  }, [width, height])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0 z-30"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  )
}
