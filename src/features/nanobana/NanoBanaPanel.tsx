import { useEffect, useCallback } from 'react'
import { ImagePlus, Upload, Sparkles, Search, Image as ImageIcon } from 'lucide-react'
import { DamStockTab } from '../dam/components/DamStockTab'
import { FabricImage } from 'fabric'
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
  { id: 'stock', icon: ImageIcon, label: 'Stock' },
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

/** Capture les pixels d'un FabricImage en data URL persistante */
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

  /** Replace the currently selected block (any type) with a new image, stretched to 100% of the block */
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

    // Capturer l'image d'origine avant remplacement
    let originalSrc: string | null = oldData.originalSrc ?? null
    const variants: string[] = [...(oldData.variants ?? [])]

    if (active instanceof FabricImage) {
      const currentSrc = captureImageDataUrl(active)
      if (currentSrc) {
        if (!originalSrc) {
          // Premier remplacement — sauvegarder la source actuelle comme originale
          originalSrc = currentSrc
        } else if (currentSrc !== originalSrc && !variants.includes(currentSrc)) {
          // Remplacement suivant — ajouter la source actuelle aux variantes
          variants.push(currentSrc)
        }
      }
    }

    // Centre réel du bloc dans le repère canvas (indépendant de originX/originY)
    const center = active.getCenterPoint()

    const newImg = await FabricImage.fromURL(image.url, { crossOrigin: 'anonymous' })
    const id = `img_${Date.now()}`

    const nativeW = newImg.width ?? 1
    const nativeH = newImg.height ?? 1

    // Étirer l'image à 100% des dimensions du bloc (pas de clipPath, pas de crop)
    const bLeft = center.x - frameW / 2
    const bTop = center.y - frameH / 2

    newImg.set({
      left: bLeft,
      top: bTop,
      scaleX: frameW / nativeW,
      scaleY: frameH / nativeH,
      angle,
      originX: 'left',
      originY: 'top',
      data: { ...oldData, id, type: 'image', name: image.name, originalSrc, variants },
    })

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
      {tab === 'stock' && <DamStockTab />}
    </div>
  )
}
