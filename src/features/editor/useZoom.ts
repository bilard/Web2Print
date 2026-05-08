import { useEffect } from 'react'
import { Canvas, Point } from 'fabric'
import type { TPointerEventInfo, TPointerEvent } from 'fabric'
import { useUIStore } from '@/stores/ui.store'

const MIN_ZOOM = 0.01
const MAX_ZOOM = 4

export function useZoom(fabricRef: React.RefObject<Canvas | null>) {
  const { setZoom } = useUIStore()

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const handleWheel = (opt: TPointerEventInfo<WheelEvent>) => {
      opt.e.preventDefault()
      const delta = opt.e.deltaY
      let zoom = canvas.getZoom()
      zoom *= 0.999 ** delta
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
      canvas.zoomToPoint(new Point(opt.e.offsetX, opt.e.offsetY), zoom)
      setZoom(Math.round(zoom * 100))
      canvas.requestRenderAll()
    }

    canvas.on('mouse:wheel', handleWheel)
    return () => { canvas.off('mouse:wheel', handleWheel) }
  }, [fabricRef.current])  
}

export function usePan(fabricRef: React.RefObject<Canvas | null>) {
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    let isPanning = false
    let spaceDown = false
    let lastPos = { x: 0, y: 0 }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        spaceDown = true
        const upper = canvas.upperCanvasEl
        if (upper) upper.style.cursor = 'grab'
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown = false
        isPanning = false
        const upper = canvas.upperCanvasEl
        if (upper) upper.style.cursor = 'default'
      }
    }

    const onMouseDown = (opt: TPointerEventInfo<TPointerEvent>) => {
      if (!spaceDown) return
      const evt = opt.e as MouseEvent
      isPanning = true
      lastPos = { x: evt.clientX, y: evt.clientY }
      canvas.selection = false
      const upper = canvas.upperCanvasEl
      if (upper) upper.style.cursor = 'grabbing'
    }

    const onMouseMove = (opt: TPointerEventInfo<TPointerEvent>) => {
      if (!isPanning) return
      const evt = opt.e as MouseEvent
      const dx = evt.clientX - lastPos.x
      const dy = evt.clientY - lastPos.y
      canvas.relativePan(new Point(dx, dy))
      lastPos = { x: evt.clientX, y: evt.clientY }
      canvas.requestRenderAll()
    }

    const onMouseUp = () => {
      isPanning = false
      canvas.selection = true
      if (spaceDown) {
        const upper = canvas.upperCanvasEl
        if (upper) upper.style.cursor = 'grab'
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up', onMouseUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up', onMouseUp)
    }
  }, [fabricRef.current])  
}
