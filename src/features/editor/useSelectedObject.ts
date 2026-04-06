import { useEffect } from 'react'
import { Shadow } from 'fabric'
import type { Canvas } from 'fabric'
import { useEditorStore } from '@/stores/editor.store'
import { isInteracting } from './useAddObject'

/**
 * Listens to store changes and applies them to the matching Fabric object.
 * Only applies dimension changes when they differ significantly from the
 * current canvas values (to avoid feedback-loop drift from rounding).
 */
export function useSyncPropertiesToCanvas(fabricRef: React.RefObject<Canvas | null>) {
  const { selectedObjectId, canvasObjects } = useEditorStore()

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !selectedObjectId) return
    // Skip sync while user is actively manipulating (drag/scale/rotate)
    if (isInteracting) return

    const storeObj = canvasObjects.find((o) => o.id === selectedObjectId)
    if (!storeObj) return

    const fabricObj = canvas.getObjects().find((o) => (o as any).data?.id === selectedObjectId)
    if (!fabricObj) return

    // For text objects, ONLY sync positional properties.
    // All text styling (fill, fontFamily, fontSize, etc.) is managed exclusively
    // by applyStyle/applyToFabric to avoid Fabric.js triggering text relayout
    // on every move (which changes wrapping/formatting).
    if (storeObj.type === 'text') {
      fabricObj.set({
        opacity: storeObj.opacity,
        angle: storeObj.angle,
        visible: storeObj.visible,
        flipX: storeObj.flipX,
        flipY: storeObj.flipY,
      })

      // Shadow
      if (storeObj.shadow) {
        fabricObj.set(
          'shadow',
          new Shadow({
            color: storeObj.shadow.color,
            blur: storeObj.shadow.blur,
            offsetX: storeObj.shadow.offsetX,
            offsetY: storeObj.shadow.offsetY,
          }),
        )
      } else {
        fabricObj.set('shadow', null)
      }

      fabricObj.setCoords()
      canvas.requestRenderAll()
      return
    }

    // Non-text objects: full sync
    // Skip fill sync when fillType is gradient — the gradient is already on the Fabric object
    // and storeObj.fill is just a fallback string that would overwrite it
    const skipFill = storeObj.fillType === 'gradient' || storeObj.fillType === 'image' || storeObj.fillType === 'none'
    fabricObj.set({
      ...(skipFill ? {} : { fill: storeObj.fill }),
      stroke: storeObj.stroke || undefined,
      strokeWidth: storeObj.strokeWidth,
      opacity: storeObj.opacity,
      angle: storeObj.angle,
      visible: storeObj.visible,
      flipX: storeObj.flipX,
      flipY: storeObj.flipY,
    })

    // Corner radius for Rect
    if (storeObj.type === 'rect' && storeObj.cornerRadius !== undefined) {
      ;(fabricObj as any).set({ rx: storeObj.cornerRadius, ry: storeObj.cornerRadius })
    }

    // Shadow
    if (storeObj.shadow) {
      fabricObj.set(
        'shadow',
        new Shadow({
          color: storeObj.shadow.color,
          blur: storeObj.shadow.blur,
          offsetX: storeObj.shadow.offsetX,
          offsetY: storeObj.shadow.offsetY,
        }),
      )
    } else {
      fabricObj.set('shadow', null)
    }

    // Width/Height — only if significantly different (prevents feedback-loop drift)
    const currentW = Math.round(((fabricObj as any).width ?? 0) * (fabricObj.scaleX ?? 1))
    const currentH = Math.round(((fabricObj as any).height ?? 0) * (fabricObj.scaleY ?? 1))

    if (Math.abs(currentW - storeObj.width) > 1 || Math.abs(currentH - storeObj.height) > 1) {
      const rawW = (fabricObj as any).width ?? 1
      const rawH = (fabricObj as any).height ?? 1
      if (rawW > 0 && rawH > 0 && storeObj.width > 0 && storeObj.height > 0) {
        fabricObj.set({
          scaleX: storeObj.width / rawW,
          scaleY: storeObj.height / rawH,
        })
      }
    }

    fabricObj.setCoords()
    canvas.requestRenderAll()
  }, [canvasObjects, selectedObjectId]) // eslint-disable-line react-hooks/exhaustive-deps
}
