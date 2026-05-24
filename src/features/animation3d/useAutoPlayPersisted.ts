import { useEffect, useRef } from 'react'
import type { Canvas, FabricObject } from 'fabric'
import { useEditorStore } from '@/stores/editor.store'
import { startObjectAnimation } from './useAnimation3D'

/**
 * Auto-plays any animation3D config persisted on canvas objects.
 *
 * Triggered on canvas-ready and when the canvasObjects list changes. Cancels
 * the previous run if the list changes (e.g., new project loaded).
 */
export function useAutoPlayPersisted(canvas: Canvas | null, enabled: boolean) {
  const canvasObjects = useEditorStore((s) => s.canvasObjects)
  const controllers = useRef<Array<{ stop: () => void }>>([])

  useEffect(() => {
    if (!enabled || !canvas) return

    // Cancel previous run
    controllers.current.forEach((c) => c.stop())
    controllers.current = []

    // Start fresh
    canvas.getObjects().forEach((fObj: any) => {
      const data = fObj.data
      if (!data?.id) return
      const obj = findObjectById(canvasObjects, data.id)
      const config = obj?.animation3D
      if (!config) return
      // Skip flip3D and particles — they require React-mounted overlays
      if (config.preset === 'flip3D' || config.preset === 'particles') return
      const ctrl = startObjectAnimation(fObj as FabricObject, canvas, config)
      controllers.current.push(ctrl)
    })

    return () => {
      controllers.current.forEach((c) => c.stop())
      controllers.current = []
    }
  }, [canvas, enabled, canvasObjects.length])
}

function findObjectById(
  objs: ReturnType<typeof useEditorStore.getState>['canvasObjects'],
  id: string
): (typeof objs)[number] | null {
  for (const o of objs) {
    if (o.id === id) return o
    if (o.children) {
      const sub = findObjectById(o.children, id)
      if (sub) return sub
    }
  }
  return null
}
