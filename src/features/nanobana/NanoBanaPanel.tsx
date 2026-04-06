import { useEffect, useCallback } from 'react'
import { ImagePlus, Upload, Sparkles, Search } from 'lucide-react'
import { FabricImage, Rect } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { usePagesStore } from '@/stores/pages.store'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { useImageGallery } from './useImageGallery'
import { GalleryGrid } from './GalleryGrid'
import { UploadZone } from './UploadZone'
import { GenerateTab } from './GenerateTab'
import type { GalleryImage, NanoBanaTab } from './types'

const TABS: { id: NanoBanaTab; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'gallery', icon: ImagePlus, label: 'Galerie' },
  { id: 'upload', icon: Upload, label: 'Upload' },
  { id: 'generate', icon: Sparkles, label: 'IA' },
]

/** Refresh the current page thumbnail after canvas changes */
function refreshPageThumbnail() {
  const canvas = globalFabricCanvas
  if (!canvas) return
  const { pages, currentPageIndex, updatePage } = usePagesStore.getState()
  const page = pages[currentPageIndex]
  if (!page) return
  // Small delay to ensure canvas has rendered the new content
  setTimeout(() => {
    const thumbnail = canvas.toDataURL({ multiplier: 0.15, format: 'jpeg', quality: 0.5 } as any)
    updatePage(page.id, { thumbnail })
  }, 300)
}

export function NanoBanaPanel() {
  const { tab, setTab, searchQuery, setSearchQuery } = useNanoBanaStore()
  const { loadGallery, deleteFromGallery } = useImageGallery()

  useEffect(() => { loadGallery() }, [loadGallery])

  const addToCanvas = async (image: GalleryImage) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    const img = await FabricImage.fromURL(image.url, { crossOrigin: 'anonymous' })
    const id = `img_${Date.now()}`
    const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
    const zoom = canvas.getZoom()
    const docX = (canvas.getWidth() / 2 - vt[4]) / zoom
    const docY = (canvas.getHeight() / 2 - vt[5]) / zoom

    img.set({ data: { id, type: 'image', name: image.name } })

    const maxW = 400
    if ((img.width ?? maxW) > maxW) {
      const scale = maxW / (img.width ?? maxW)
      img.scaleX = scale
      img.scaleY = scale
    }

    img.set({
      left: docX - img.getScaledWidth() / 2,
      top: docY - img.getScaledHeight() / 2,
    })

    canvas.add(img)
    canvas.setActiveObject(img)
    canvas.requestRenderAll()
    syncToStore(canvas)
    refreshPageThumbnail()
    img.on('modified', () => syncToStore(canvas))
    img.on('moving', () => syncToStore(canvas))
    img.on('scaling', () => syncToStore(canvas))
  }

  /**
   * Calcule la bounding box du contenu opaque d'une image.
   * Retourne { x, y, w, h } en pixels natifs ou null si entièrement opaque.
   */
  const getOpaqueBounds = (imgElement: HTMLImageElement): { x: number; y: number; w: number; h: number } | null => {
    const c = document.createElement('canvas')
    const w = imgElement.naturalWidth || imgElement.width
    const h = imgElement.naturalHeight || imgElement.height
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(imgElement, 0, 0)
    const data = ctx.getImageData(0, 0, w, h).data

    let minX = w, minY = h, maxX = 0, maxY = 0
    let hasTransparent = false
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const alpha = data[(y * w + x) * 4 + 3]
        if (alpha > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        } else {
          hasTransparent = true
        }
      }
    }

    // Si pas de transparence significative, pas besoin de recadrer
    if (!hasTransparent) return null
    if (maxX < minX) return null // image entièrement transparente

    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
  }

  /** Replace the currently selected block (any type) with a new image, fitted to 100% of the block */
  const replaceSelectedImage = useCallback(async (image: GalleryImage) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    const active = canvas.getActiveObject()
    if (!active) {
      // Nothing selected — fallback to addToCanvas
      addToCanvas(image)
      return
    }

    // Dimensions affichées du bloc d'origine
    const frameW = active.getScaledWidth()
    const frameH = active.getScaledHeight()
    const { angle } = active
    const oldData = active.data ?? {}
    const zIndex = canvas.getObjects().indexOf(active)

    // Préserver uniquement l'originalSrc (pas d'accumulation de variantes sur simple sélection)
    const originalSrc = oldData.originalSrc ?? null
    const variants: string[] = oldData.variants ?? []

    // Centre réel du bloc dans le repère canvas (indépendant de originX/originY)
    const center = active.getCenterPoint()

    const newImg = await FabricImage.fromURL(image.url, { crossOrigin: 'anonymous' })
    const id = `img_${Date.now()}`

    const nativeW = newImg.width ?? 1
    const nativeH = newImg.height ?? 1

    // Détecter si l'image a un fond transparent et recadrer au contenu opaque
    const imgEl = (newImg as any)._element as HTMLImageElement | undefined
    const opaqueBounds = imgEl ? getOpaqueBounds(imgEl) : null

    if (opaqueBounds) {
      // Image avec transparence → recadrer au contenu opaque et adapter le bloc
      const { x: cropX, y: cropY, w: cropW, h: cropH } = opaqueBounds

      // Appliquer le crop Fabric.js
      newImg.set({ cropX, cropY, width: cropW, height: cropH })

      // Scale pour tenir dans la frame d'origine (contain)
      const scale = Math.min(frameW / cropW, frameH / cropH)
      const scaledW = cropW * scale
      const scaledH = cropH * scale

      // Centrer dans le bloc d'origine
      const bLeft = center.x - scaledW / 2
      const bTop = center.y - scaledH / 2

      newImg.set({
        left: bLeft,
        top: bTop,
        scaleX: scale,
        scaleY: scale,
        angle,
        originX: 'left',
        originY: 'top',
        data: { ...oldData, id, type: 'image', name: image.name, ...(originalSrc ? { originalSrc, variants } : {}) },
      })
      // Pas de clipPath — l'image est déjà recadrée au contenu
    } else {
      // Image opaque → comportement cover classique
      const bLeft = center.x - frameW / 2
      const bTop = center.y - frameH / 2

      const scale = Math.max(frameW / nativeW, frameH / nativeH)
      const scaledW = nativeW * scale
      const scaledH = nativeH * scale

      const imgLeft = bLeft + (frameW - scaledW) / 2
      const imgTop = bTop + (frameH - scaledH) / 2

      newImg.set({
        left: imgLeft,
        top: imgTop,
        scaleX: scale,
        scaleY: scale,
        angle,
        originX: 'left',
        originY: 'top',
        data: { ...oldData, id, type: 'image', name: image.name, ...(originalSrc ? { originalSrc, variants } : {}) },
      })

      // Rogner aux limites exactes du bloc
      const clipRect = new Rect({
        left: bLeft,
        top: bTop,
        width: frameW,
        height: frameH,
        absolutePositioned: true,
      })
      newImg.clipPath = clipRect
    }

    canvas.remove(active)
    // Insert at the same z-index to maintain layer order
    canvas.insertAt(zIndex, newImg)
    canvas.setActiveObject(newImg)
    canvas.requestRenderAll()
    syncToStore(canvas)
    refreshPageThumbnail()
    newImg.on('modified', () => syncToStore(canvas))
    newImg.on('moving', () => syncToStore(canvas))
    newImg.on('scaling', () => syncToStore(canvas))
  }, [])

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Tab bar */}
      <div className="flex bg-white/5 rounded-lg p-0.5">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
              tab === id
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Search (gallery only) */}
      {tab === 'gallery' && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/40"
          />
        </div>
      )}

      {/* Content */}
      {tab === 'gallery' && (
        <GalleryGrid onAddToCanvas={replaceSelectedImage} onDelete={deleteFromGallery} />
      )}
      {tab === 'upload' && <UploadZone />}
      {tab === 'generate' && <GenerateTab onAddToCanvas={addToCanvas} onReplaceSelected={replaceSelectedImage} />}
    </div>
  )
}
