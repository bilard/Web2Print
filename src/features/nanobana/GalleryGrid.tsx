import { useState, useMemo, useCallback } from 'react'
import { Trash2, Plus, Loader2, ImageIcon, RotateCcw, Sparkles, Eraser } from 'lucide-react'
import { FabricImage, Rect } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useEditorStore } from '@/stores/editor.store'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { useRemoveBg } from './useRemoveBg'
import type { GalleryImage } from './types'

interface CanvasImageEntry {
  id: string
  name: string
  currentSrc: string
  originalSrc: string | null
  variants: string[]
  hasCrop: boolean
}

/** Extrait les images du canvas avec leurs variantes */
function getCanvasImages(): CanvasImageEntry[] {
  const canvas = globalFabricCanvas
  if (!canvas) return []
  const items: CanvasImageEntry[] = []
  for (const obj of canvas.getObjects()) {
    if (obj instanceof FabricImage) {
      const currentSrc = (obj as any).getSrc?.() ?? (obj as any)._element?.src ?? ''
      if (!currentSrc) continue
      const d = (obj as any).data ?? {}
      const hasCrop = !!obj.clipPath || !!(obj as any).cropX || !!(obj as any).cropY

      items.push({
        id: d.id ?? `canvas_img_${items.length}`,
        name: d.name ?? 'Image',
        currentSrc,
        originalSrc: d.originalSrc ?? null,
        variants: d.variants ?? [],
        hasCrop,
      })
    }
  }
  return items
}

/** Calcule la bounding box du contenu opaque */
function getOpaqueBounds(imgEl: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
  const c = document.createElement('canvas')
  const w = imgEl.naturalWidth || imgEl.width
  const h = imgEl.naturalHeight || imgEl.height
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(imgEl, 0, 0)
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
  if (!hasTransparent || maxX < minX) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Remplace la source d'une image canvas par une nouvelle URL */
async function swapCanvasImage(canvasImageId: string, newSrc: string) {
  const canvas = globalFabricCanvas
  if (!canvas) return

  const target = canvas.getObjects().find(
    (o) => o instanceof FabricImage && o.data?.id === canvasImageId
  ) as FabricImage | undefined
  if (!target) return

  const frameW = target.getScaledWidth()
  const frameH = target.getScaledHeight()
  const { angle } = target
  const oldData = target.data ?? {}
  const zIndex = canvas.getObjects().indexOf(target)

  const center = target.getCenterPoint()

  const newImg = await FabricImage.fromURL(newSrc, { crossOrigin: 'anonymous' })

  const nativeW = newImg.width ?? 1
  const nativeH = newImg.height ?? 1

  // Détecter si l'image a un fond transparent
  const imgEl = (newImg as any)._element as HTMLImageElement | undefined
  const opaqueBounds = imgEl ? getOpaqueBounds(imgEl) : null

  if (opaqueBounds) {
    // Image transparente → recadrer au contenu opaque
    const { x: cropX, y: cropY, w: cropW, h: cropH } = opaqueBounds
    newImg.set({ cropX, cropY, width: cropW, height: cropH })

    const scale = Math.min(frameW / cropW, frameH / cropH)
    const scaledW = cropW * scale
    const scaledH = cropH * scale

    newImg.set({
      left: center.x - scaledW / 2,
      top: center.y - scaledH / 2,
      scaleX: scale,
      scaleY: scale,
      angle,
      originX: 'left',
      originY: 'top',
      data: { ...oldData },
    })
  } else {
    // Image opaque → cover classique
    const bLeft = center.x - frameW / 2
    const bTop = center.y - frameH / 2

    const scale = Math.max(frameW / nativeW, frameH / nativeH)
    const scaledW = nativeW * scale
    const scaledH = nativeH * scale

    newImg.set({
      left: bLeft + (frameW - scaledW) / 2,
      top: bTop + (frameH - scaledH) / 2,
      scaleX: scale,
      scaleY: scale,
      angle,
      originX: 'left',
      originY: 'top',
      data: { ...oldData },
    })

    const clipRect = new Rect({
      left: bLeft,
      top: bTop,
      width: frameW,
      height: frameH,
      absolutePositioned: true,
    })
    newImg.clipPath = clipRect
  }

  canvas.remove(target)
  canvas.insertAt(zIndex, newImg)
  canvas.setActiveObject(newImg)
  canvas.requestRenderAll()
  syncToStore(canvas)
  newImg.on('modified', () => syncToStore(canvas))
  newImg.on('moving', () => syncToStore(canvas))
  newImg.on('scaling', () => syncToStore(canvas))
}

interface Props {
  onAddToCanvas: (image: GalleryImage) => void
  onDelete: (image: GalleryImage) => void
}

export function GalleryGrid({ onAddToCanvas, onDelete }: Props) {
  const { images, loading, searchQuery, selectedTag } = useNanoBanaStore()
  const canvasObjects = useEditorStore((s) => s.canvasObjects)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set())
  const [swapping, setSwapping] = useState<string | null>(null)
  const { removeBg, loading: removingBg, error: removeBgError } = useRemoveBg()
  const [removingId, setRemovingId] = useState<string | null>(null)

  const canvasImages = useMemo(() => getCanvasImages(), [canvasObjects])

  /** Capture les pixels d'un FabricImage en data URL persistante */
  const captureImageDataUrl = (target: FabricImage): string | null => {
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

  /** Supprime le fond d'une image canvas via Remove.bg */
  const handleRemoveBg = useCallback(async (ci: CanvasImageEntry) => {
    setRemovingId(ci.id)

    const canvas = globalFabricCanvas
    if (!canvas) { setRemovingId(null); return }

    const target = canvas.getObjects().find(
      (o) => o instanceof FabricImage && o.data?.id === ci.id
    ) as FabricImage | undefined
    if (!target) { setRemovingId(null); return }

    // Capturer les pixels en data URL AVANT le swap (les blob URLs expirent après suppression de l'objet)
    const d = target.data ?? {}
    const persistentSrc = captureImageDataUrl(target) ?? ci.currentSrc

    if (!d.originalSrc) {
      target.data = { ...d, originalSrc: persistentSrc, variants: d.variants ?? [] }
    } else {
      const variants = [...(d.variants ?? [])]
      if (persistentSrc !== d.originalSrc && !variants.includes(persistentSrc)) {
        variants.push(persistentSrc)
      }
      target.data = { ...d, variants }
    }

    const resultUrl = await removeBg(ci.currentSrc)
    if (resultUrl) {
      await swapCanvasImage(ci.id, resultUrl)
    }
    setRemovingId(null)
  }, [removeBg])

  const filtered = images.filter((img) => {
    if (!img.url) return false
    if (searchQuery && !img.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (selectedTag && !img.tags.includes(selectedTag)) return false
    return true
  })

  const handleSwap = useCallback(async (canvasImageId: string, src: string) => {
    setSwapping(`${canvasImageId}_${src}`)
    await swapCanvasImage(canvasImageId, src)
    setSwapping(null)
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        <p className="text-xs text-white/40">Chargement...</p>
      </div>
    )
  }

  if (filtered.length === 0 && canvasImages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="text-xs text-white/40">
          {images.length === 0 ? 'Aucune image' : 'Aucun résultat'}
        </p>
      </div>
    )
  }

  const handleDelete = async (img: GalleryImage) => {
    setDeletingId(img.id)
    await onDelete(img)
    setDeletingId(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Images du projet (canvas) avec original + variantes */}
      {canvasImages.length > 0 && !searchQuery && (
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">
            Projet ({canvasImages.length})
          </p>
          <div className="flex flex-col gap-3">
            {canvasImages.map((ci) => {
              const hasOriginal = ci.originalSrc && ci.originalSrc !== ci.currentSrc
              const hasVariants = ci.variants.length > 0
              const allVersions: { src: string; label: string; isOriginal: boolean; isCurrent: boolean }[] = []

              // Image originale
              if (ci.originalSrc) {
                allVersions.push({
                  src: ci.originalSrc,
                  label: 'Original',
                  isOriginal: true,
                  isCurrent: ci.currentSrc === ci.originalSrc,
                })
              }

              // Variantes IA
              ci.variants.forEach((v, i) => {
                allVersions.push({
                  src: v,
                  label: `Variante ${i + 1}`,
                  isOriginal: false,
                  isCurrent: ci.currentSrc === v,
                })
              })

              // Image courante si elle n'est ni l'original ni une variante connue
              const currentIsKnown = allVersions.some((v) => v.isCurrent)
              if (!currentIsKnown) {
                allVersions.push({
                  src: ci.currentSrc,
                  label: ci.originalSrc ? `Variante ${ci.variants.length + 1}` : ci.name,
                  isOriginal: !ci.originalSrc,
                  isCurrent: true,
                })
              }

              return (
                <div key={ci.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-2">
                  <p className="text-[11px] text-white/50 font-medium mb-2 truncate">{ci.name}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {allVersions.map((v) => {
                      const isSwapping = swapping === `${ci.id}_${v.src}`
                      return (
                        <button
                          key={v.src}
                          onClick={() => !v.isCurrent && handleSwap(ci.id, v.src)}
                          disabled={v.isCurrent || !!swapping}
                          className={`relative rounded-md overflow-hidden aspect-square transition-all ${
                            v.isCurrent
                              ? 'ring-2 ring-indigo-500 opacity-100'
                              : 'opacity-60 hover:opacity-100 hover:ring-1 hover:ring-white/20'
                          }`}
                        >
                          <img src={v.src} alt={v.label} className="w-full h-full object-cover" loading="lazy" />
                          {isSwapping && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 text-white animate-spin" />
                            </div>
                          )}
                          {/* Badge */}
                          <span className={`absolute bottom-0 left-0 right-0 text-center text-[8px] font-medium py-0.5 ${
                            v.isOriginal
                              ? 'bg-teal-500/80 text-white'
                              : 'bg-indigo-500/80 text-white'
                          }`}>
                            {v.isOriginal ? (
                              <span className="flex items-center justify-center gap-0.5">
                                <RotateCcw className="w-2 h-2" /> Original
                              </span>
                            ) : (
                              <span className="flex items-center justify-center gap-0.5">
                                <Sparkles className="w-2 h-2" /> {v.label}
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {/* Bouton Supprimer le fond */}
                  <button
                    onClick={() => handleRemoveBg(ci)}
                    disabled={removingId === ci.id}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 text-[11px] font-medium text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 rounded-md py-1.5 transition-colors disabled:opacity-50"
                  >
                    {removingId === ci.id ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Suppression du fond...
                      </>
                    ) : (
                      <>
                        <Eraser className="w-3 h-3" />
                        Supprimer le fond
                      </>
                    )}
                  </button>
                  {removeBgError && removingId === null && (
                    <p className="text-[10px] text-red-400/70 mt-1">{removeBgError}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Galerie utilisateur */}
      {filtered.length > 0 && (
        <div>
          {canvasImages.length > 0 && !searchQuery && (
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">
              Galerie ({filtered.length})
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {filtered.filter((img) => {
              // Masquer les images dont les deux URLs sont cassées
              const thumbBroken = !img.thumbnailUrl || brokenIds.has(img.id)
              const fullBroken = !img.url || brokenIds.has(`${img.id}_full`)
              return !(thumbBroken && fullBroken)
            }).map((img) => (
              <div
                key={img.id}
                className="group relative bg-white/5 border border-white/10 rounded-lg overflow-hidden aspect-square cursor-pointer hover:border-indigo-500/40 transition-all"
                onClick={() => onAddToCanvas(img)}
              >
                {img.thumbnailUrl && !brokenIds.has(img.id) ? (
                  <img
                    src={img.thumbnailUrl}
                    alt={img.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={() => {
                      if (img.url && img.url !== img.thumbnailUrl) {
                        setBrokenIds((prev) => new Set(prev).add(img.id))
                      } else {
                        setBrokenIds((prev) => new Set(prev).add(`${img.id}_full`))
                      }
                    }}
                  />
                ) : img.url && !brokenIds.has(`${img.id}_full`) ? (
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={() => setBrokenIds((prev) => new Set(prev).add(`${img.id}_full`))}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-white/10" />
                  </div>
                )}
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Plus className="w-6 h-6 text-white" />
                </div>
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(img) }}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/80 transition-all"
                >
                  {deletingId === img.id ? (
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3 text-white" />
                  )}
                </button>
                {/* Name */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1 opacity-0 group-hover:opacity-100 transition-all">
                  <p className="text-[10px] text-white truncate">{img.name}</p>
                </div>
                {/* AI badge */}
                {img.tags.includes('ai-generated') && (
                  <span className="absolute top-1 left-1 text-[8px] bg-indigo-500/80 text-white px-1.5 py-0.5 rounded font-medium">
                    AI
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
