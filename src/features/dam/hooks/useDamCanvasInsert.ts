import { useCallback } from 'react'
import { FabricImage } from 'fabric'
import { globalFabricCanvas } from '../../../features/editor/CanvasContainer'
import { syncToStore } from '../../../features/editor/useAddObject'
import type { DamImage } from '../types'

export function useDamCanvasInsert() {
  const insertOnCanvas = useCallback(async (image: DamImage) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    try {
      const img = await FabricImage.fromURL(image.previewUrl, { crossOrigin: 'anonymous' })

      const maxWidth = 400
      if (img.width && img.width > maxWidth) {
        const scale = maxWidth / img.width
        img.scale(scale)
      }

      const center = canvas.getCenterPoint()
      img.set({
        left: center.x - (img.getScaledWidth() / 2),
        top: center.y - (img.getScaledHeight() / 2),
        data: {
          sourceProvider: image.sourceProvider,
          sourceId: image.sourceId,
          photographer: image.photographer,
          photographerUrl: image.photographerUrl,
        },
      })

      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.requestRenderAll()
      syncToStore(canvas)
    } catch (err) {
      console.error('Failed to insert DAM image on canvas:', err)
    }
  }, [])

  return { insertOnCanvas }
}
