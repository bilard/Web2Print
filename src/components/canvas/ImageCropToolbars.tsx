import { useEffect, useRef, useState } from 'react'
import { Canvas, FabricObject } from 'fabric'
import {
  Crop,
  Check,
  X,
  Eye,
  EyeOff,
  Replace,
  ChevronDown,
  ImageIcon,
  FolderOpen,
  Heart,
  FolderHeart,
  Clock,
  Sparkles,
} from 'lucide-react'
import {
  enterCropMode,
  cancelCrop,
  applyCrop,
  useCroppingImage,
  canCrop,
  toggleCropMask,
  hasCropActive,
  hasCropMaskHidden,
} from '@/features/editor/useImageMask'
import { FabricImage } from 'fabric'
import { useUIStore } from '@/stores/ui.store'
import { useDamStore } from '@/stores/dam.store'
import type { DamTab } from '@/features/dam/types'

const REPLACE_SOURCES: { tab: DamTab; label: string; icon: typeof ImageIcon }[] = [
  { tab: 'stock', label: 'Stock', icon: ImageIcon },
  { tab: 'my-images', label: 'Mes images', icon: FolderOpen },
  { tab: 'favorites', label: 'Favoris', icon: Heart },
  { tab: 'collections', label: 'Collections', icon: FolderHeart },
  { tab: 'recent', label: 'Récents', icon: Clock },
  { tab: 'generate', label: 'Nano Banana', icon: Sparkles },
]

interface Props {
  canvas: Canvas | null
}

/**
 * Toolbars flottantes pour le recadrage d'image :
 *  - "Recadrer la photo" au-dessus de l'image sélectionnée (hors mode crop)
 *  - "✕ / ✓" au-dessus du cadre de crop (en mode crop)
 *
 * Calcule la position en transformant les coordonnées canvas → écran via le
 * viewportTransform de Fabric.
 */
export function ImageCropToolbars({ canvas }: Props) {
  const cropping = useCroppingImage()
  const openDamPickerForReplace = useUIStore((s) => s.openDamPickerForReplace)
  const setActiveDamTab = useDamStore((s) => s.setActiveTab)
  const [tick, setTick] = useState(0)
  const [activeImage, setActiveImage] = useState<FabricObject | null>(null)
  const [replaceMenuOpen, setReplaceMenuOpen] = useState(false)
  const replaceMenuRef = useRef<HTMLDivElement>(null)

  // Fermer le menu Remplacer quand on clique ailleurs
  useEffect(() => {
    if (!replaceMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (replaceMenuRef.current && !replaceMenuRef.current.contains(e.target as Node)) {
        setReplaceMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [replaceMenuOpen])

  const handleReplaceFromSource = (tab: DamTab) => {
    if (!activeImage) return
    // Ensure the target carries a stable id so we can find it again after the modal closes
    const existingData = (activeImage.data as any) ?? {}
    let targetId: string = existingData.id
    if (!targetId) {
      targetId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      activeImage.set({ data: { ...existingData, id: targetId } })
    }
    setActiveDamTab(tab)
    openDamPickerForReplace(targetId)
    setReplaceMenuOpen(false)
  }

  // Suivre l'objet actif crop-able (FabricImage ou Rect avec fill image)
  useEffect(() => {
    if (!canvas) return
    const updateActive = () => {
      const obj = canvas.getActiveObject() ?? null
      setActiveImage(canCrop(obj) ? obj : null)
    }
    updateActive()
    const onSelected = () => updateActive()
    const onCleared = () => setActiveImage(null)
    canvas.on('selection:created', onSelected)
    canvas.on('selection:updated', onSelected)
    canvas.on('selection:cleared', onCleared)
    return () => {
      canvas.off('selection:created', onSelected)
      canvas.off('selection:updated', onSelected)
      canvas.off('selection:cleared', onCleared)
    }
  }, [canvas])

  // Re-render quand l'objet actif bouge / scale / le viewport bouge
  useEffect(() => {
    if (!canvas) return
    const force = () => setTick((n) => n + 1)
    canvas.on('object:moving', force)
    canvas.on('object:scaling', force)
    canvas.on('object:modified', force)
    canvas.on('after:render', force)
    return () => {
      canvas.off('object:moving', force)
      canvas.off('object:scaling', force)
      canvas.off('object:modified', force)
      canvas.off('after:render', force)
    }
  }, [canvas])

  if (!canvas) return null

  // Cible : en mode crop = le cropFrame (active object), sinon l'image sélectionnée
  const target: FabricObject | null = cropping
    ? canvas.getActiveObject() ?? null
    : activeImage
  if (!target) return null

  // Position au-dessus du target
  const rect = target.getBoundingRect()
  const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoom = canvas.getZoom()
  const screenLeft = rect.left * zoom + vt[4]
  const screenTop = rect.top * zoom + vt[5]
  const screenWidth = rect.width * zoom
  const centerX = screenLeft + screenWidth / 2

  // Empêche les avertissements TS sur tick non utilisé
  void tick

  return (
    <div
      className="absolute z-30 -translate-x-1/2 pointer-events-auto"
      style={{ left: centerX, top: Math.max(8, screenTop - 76) }}
    >
      {cropping ? (
        <div className="flex items-stretch rounded-md border border-white/10 bg-[#1a1a1a] shadow-xl overflow-hidden">
          <button
            type="button"
            onClick={cancelCrop}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 transition-colors"
            title="Annuler (Échap)"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-px bg-white/10" />
          <button
            type="button"
            onClick={applyCrop}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
            title="Appliquer le recadrage (Entrée)"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div ref={replaceMenuRef} className="relative">
          <div className="flex items-stretch rounded-md border border-white/10 bg-[#1a1a1a] shadow-xl overflow-hidden">
            <button
              type="button"
              onClick={() => activeImage && enterCropMode(activeImage)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-white/80 hover:bg-[#262626] hover:text-white transition-colors"
            >
              <Crop className="w-4 h-4" />
              <span>Recadrer la photo</span>
            </button>
            <div className="w-px bg-white/10" />
            <button
              type="button"
              onClick={() => setReplaceMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-white/80 hover:bg-[#262626] hover:text-white transition-colors"
              title="Remplacer par une image de la bibliothèque"
            >
              <Replace className="w-4 h-4" />
              <span>Remplacer</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {activeImage && (hasCropActive(activeImage) || hasCropMaskHidden(activeImage)) && (
              <>
                <div className="w-px bg-white/10" />
                <button
                  type="button"
                  onClick={() => {
                    if (activeImage instanceof FabricImage) {
                      toggleCropMask(activeImage)
                      setTick((n) => n + 1)
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 transition-colors"
                  title={hasCropMaskHidden(activeImage) ? 'Afficher le masque' : 'Masquer le crop'}
                >
                  {hasCropMaskHidden(activeImage) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </>
            )}
          </div>
          {replaceMenuOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 min-w-[180px] rounded-md border border-white/10 bg-[#1a1a1a] shadow-xl overflow-hidden z-40">
              {REPLACE_SOURCES.map((source) => {
                const Icon = source.icon
                return (
                  <button
                    key={source.tab}
                    type="button"
                    onClick={() => handleReplaceFromSource(source.tab)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-white/80 hover:bg-[#262626] hover:text-white transition-colors text-left"
                  >
                    <Icon className="w-3.5 h-3.5 opacity-70" />
                    <span>{source.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
