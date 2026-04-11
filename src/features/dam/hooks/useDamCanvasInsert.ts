import { useCallback } from 'react'
import { FabricImage, FabricObject } from 'fabric'
import { globalFabricCanvas } from '../../../features/editor/CanvasContainer'
import { syncToStore } from '../../../features/editor/useAddObject'
import type { DamImage } from '../types'

/** Capture pixels from a FabricImage into a persistable data URL. */
function captureImageDataUrl(target: FabricImage): string | null {
  const el = (target as any).getElement?.() as HTMLImageElement | undefined
  if (!el) return null
  const c = document.createElement('canvas')
  c.width = el.naturalWidth || el.width
  c.height = el.naturalHeight || el.height
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(el, 0, 0)
  return c.toDataURL('image/png')
}

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
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'image',
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

  /**
   * Replace an existing canvas object (any block) with a new image, stretched
   * to the block's current bounding box. Preserves position, angle, z-index,
   * and keeps a history of prior sources in `data.originalSrc` / `data.variants`.
   */
  const replaceOnCanvas = useCallback(async (image: DamImage, targetId?: string) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    // Find the target object — by explicit id if provided, else the active selection
    let target: FabricObject | null = null
    if (targetId) {
      target = canvas.getObjects().find((o) => (o.data as any)?.id === targetId) ?? null
    }
    if (!target) target = canvas.getActiveObject() ?? null
    if (!target) {
      // Nothing to replace — fallback to inserting
      await insertOnCanvas(image)
      return
    }

    try {
      const frameW = target.getScaledWidth()
      const frameH = target.getScaledHeight()
      const { angle } = target
      const oldData = (target.data as any) ?? {}
      const zIndex = canvas.getObjects().indexOf(target)
      const center = target.getCenterPoint()

      // Preserve history of prior image sources
      let originalSrc: string | null = oldData.originalSrc ?? null
      const variants: string[] = [...(oldData.variants ?? [])]

      if (target instanceof FabricImage) {
        const currentSrc = captureImageDataUrl(target)
        if (currentSrc) {
          if (!originalSrc) {
            originalSrc = currentSrc
          } else if (currentSrc !== originalSrc && !variants.includes(currentSrc)) {
            variants.push(currentSrc)
          }
        }
      }

      const newImg = await FabricImage.fromURL(image.previewUrl, { crossOrigin: 'anonymous' })
      const nativeW = newImg.width ?? 1
      const nativeH = newImg.height ?? 1

      // "Cover" : scale uniforme pour remplir le frame sans déformation,
      // puis crop centré sur l'excédent via cropX/cropY + width/height
      // (Fabric v6 : width/height = taille de la source affichée,
      // scaleX/scaleY = scale visuel appliqué par-dessus).
      const scale = Math.max(frameW / nativeW, frameH / nativeH)
      const srcW = frameW / scale
      const srcH = frameH / scale
      const cropX = Math.max(0, (nativeW - srcW) / 2)
      const cropY = Math.max(0, (nativeH - srcH) / 2)

      newImg.set({
        left: center.x - frameW / 2,
        top: center.y - frameH / 2,
        scaleX: scale,
        scaleY: scale,
        cropX,
        cropY,
        width: srcW,
        height: srcH,
        angle,
        originX: 'left',
        originY: 'top',
        data: {
          ...oldData,
          id: oldData.id ?? `img_${Date.now()}`,
          type: 'image',
          name: `${image.sourceProvider}_${image.sourceId}`,
          sourceProvider: image.sourceProvider,
          sourceId: image.sourceId,
          photographer: image.photographer,
          photographerUrl: image.photographerUrl,
          originalSrc,
          variants,
        },
      })

      canvas.remove(target)
      canvas.insertAt(zIndex, newImg)
      canvas.setActiveObject(newImg)
      canvas.requestRenderAll()
      syncToStore(canvas)
    } catch (err) {
      console.error('Failed to replace DAM image on canvas:', err)
    }
  }, [insertOnCanvas])

  return { insertOnCanvas, replaceOnCanvas }
}
