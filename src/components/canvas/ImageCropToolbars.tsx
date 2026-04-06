import { useEffect, useState } from 'react'
import { Canvas, FabricObject } from 'fabric'
import { Crop, Check, X } from 'lucide-react'
import {
  enterCropMode,
  cancelCrop,
  applyCrop,
  useCroppingImage,
  canCrop,
} from '@/features/editor/useImageMask'

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
  const [tick, setTick] = useState(0)
  const [activeImage, setActiveImage] = useState<FabricObject | null>(null)

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
      style={{ left: centerX, top: Math.max(8, screenTop - 44) }}
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
        <button
          type="button"
          onClick={() => activeImage && enterCropMode(activeImage)}
          className="flex items-center gap-1.5 rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-2 text-xs text-white/80 shadow-xl hover:bg-white/10 hover:text-white transition-colors"
          title="Recadrer la photo"
        >
          <Crop className="w-4 h-4" />
          <span>Recadrer la photo</span>
        </button>
      )}
    </div>
  )
}
