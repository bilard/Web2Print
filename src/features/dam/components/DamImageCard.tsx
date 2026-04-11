import { useCallback, useRef, useState } from 'react'
import { Heart, Bookmark, FolderPlus, FolderMinus, Download, Check, Trash2 } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useUIStore } from '../../../stores/ui.store'
import { useDamFavorites } from '../hooks/useDamFavorites'
import { useDamSaveImage } from '../hooks/useDamSaveImage'
import { useDamCollections } from '../hooks/useDamCollections'
import { useDamCanvasInsert } from '../hooks/useDamCanvasInsert'
import { globalFabricCanvas } from '../../editor/CanvasContainer'
import { applyImageFill } from '../../editor/applyImageFill'
import type { DamImage } from '../types'

interface Props {
  image: DamImage
  collectionId?: string
  onRemovedFromCollection?: (imageId: string) => void
  onDeleted?: (imageId: string) => void
}

export function DamImageCard({ image, collectionId, onRemovedFromCollection, onDeleted }: Props) {
  const { openLightbox } = useDamStore()
  const { damPickerMode, damPickerTargetId, setDamPickerOpen } = useUIStore()
  const { insertOnCanvas, replaceOnCanvas } = useDamCanvasInsert()
  const { isFavorite, toggleFavorite } = useDamFavorites()
  const { isSaved, toggleSave, deleteAsset } = useDamSaveImage()
  const { collections, addToCollection, removeFromCollection } = useDamCollections()
  const fav = isFavorite(image.id)
  const saved = isSaved(image.id)
  const [showCollections, setShowCollections] = useState(false)
  const [addedTo, setAddedTo] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', image.previewUrl)
    e.dataTransfer.setData('application/dam-image', JSON.stringify(image))
    e.dataTransfer.effectAllowed = 'copy'
  }

  // Applique l'image comme pattern fill sur l'objet cible (mode "fill").
  // Retourne true si l'application a réussi.
  const applyAsFill = useCallback((): boolean => {
    const canvas = globalFabricCanvas
    if (!canvas || !damPickerTargetId) return false
    const target = canvas.getObjects().find((o) => (o.data as any)?.id === damPickerTargetId)
    if (!target) return false
    applyImageFill(target, canvas, image.previewUrl)
    return true
  }, [image.previewUrl, damPickerTargetId])

  // Clic simple = importer directement sur le canvas.
  // Double-clic = remplacer le bloc actif.
  // Pas de canvas (Dashboard) → fallback sur la lightbox.
  const handleCardClick = () => {
    if (!globalFabricCanvas) {
      openLightbox(image)
      return
    }
    if (damPickerMode === 'fill') {
      if (applyAsFill()) setDamPickerOpen(false)
      return
    }
    if (damPickerMode === 'replace') {
      replaceOnCanvas(image, damPickerTargetId ?? undefined)
      setDamPickerOpen(false)
    } else {
      insertOnCanvas(image)
    }
  }

  const handleCardDoubleClick = () => {
    if (!globalFabricCanvas) return
    if (damPickerMode === 'fill') {
      if (applyAsFill()) setDamPickerOpen(false)
      return
    }
    replaceOnCanvas(image, damPickerTargetId ?? undefined)
    if (damPickerMode === 'replace') setDamPickerOpen(false)
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(image.fullUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${image.sourceProvider}_${image.sourceId}.jpg`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      window.open(image.fullUrl, '_blank')
    }
  }

  const handleAddToCollection = useCallback(
    async (collectionId: string) => {
      // Save to dam_assets first if not already saved
      if (!saved) await toggleSave(image)
      await addToCollection(collectionId, image.id)
      setAddedTo(collectionId)
      setTimeout(() => {
        setShowCollections(false)
        setAddedTo(null)
      }, 600)
    },
    [saved, toggleSave, addToCollection, image]
  )

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      title="Clic : insérer — Double-clic : remplacer le bloc actif"
      className="group relative rounded-md overflow-hidden cursor-pointer bg-white/5"
      style={{ aspectRatio: `${image.width}/${image.height}` }}
    >
      <img
        src={image.previewUrl}
        alt={image.description}
        loading="lazy"
        className="w-full h-full object-cover"
      />

      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors">
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite(image)
            }}
            className={`p-1 rounded ${fav ? 'bg-red-500/80 text-white' : 'bg-black/60 text-white/80 hover:bg-black/80'}`}
            title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Heart className="w-3.5 h-3.5" fill={fav ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleSave(image)
            }}
            className={`p-1 rounded ${saved ? 'bg-indigo-500/80 text-white' : 'bg-black/60 text-white/80 hover:bg-black/80'}`}
            title={saved ? 'Retirer de mes images' : 'Sauvegarder'}
          >
            <Bookmark className="w-3.5 h-3.5" fill={saved ? 'currentColor' : 'none'} />
          </button>
          <div className="relative" ref={popoverRef}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowCollections((v) => !v)
              }}
              className="p-1 rounded bg-black/60 text-white/80 hover:bg-black/80"
              title="Ajouter à une collection"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            {showCollections && (
              <div
                className="absolute top-full right-0 mt-1 w-40 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {collections.length === 0 ? (
                  <div className="px-3 py-2 text-[10px] text-white/30">
                    Aucune collection
                  </div>
                ) : (
                  collections.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => handleAddToCollection(col.id)}
                      className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 flex items-center justify-between"
                    >
                      <span className="truncate">{col.name}</span>
                      {addedTo === col.id && <Check className="w-3 h-3 text-green-400 shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button onClick={handleDownload} className="p-1 rounded bg-black/60 text-white/80 hover:bg-black/80" title="Télécharger">
            <Download className="w-3.5 h-3.5" />
          </button>
          {saved && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                const label = image.description?.trim() || `image ${image.sourceProvider}`
                if (
                  confirm(
                    `Supprimer définitivement « ${label} » ?\n\nToutes les variantes, références de collections et favoris associés seront également supprimés. Cette action est irréversible.`
                  )
                ) {
                  try {
                    await deleteAsset(image.id)
                    onDeleted?.(image.id)
                  } catch (err) {
                    console.error('Delete asset failed:', err)
                    alert('Erreur lors de la suppression')
                  }
                }
              }}
              className="p-1 rounded bg-black/60 text-white/80 hover:bg-red-500/80 hover:text-white"
              title="Supprimer définitivement"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {collectionId && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                await removeFromCollection(collectionId, image.id)
                onRemovedFromCollection?.(image.id)
              }}
              className="p-1 rounded bg-red-500/60 text-white hover:bg-red-500/80"
              title="Retirer de la collection"
            >
              <FolderMinus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="px-1.5 py-0.5 rounded text-[8px] bg-black/60 text-white/80 capitalize">
            {image.sourceProvider}
          </span>
        </div>

        <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="px-1.5 py-0.5 rounded text-[8px] bg-black/60 text-white/70 truncate max-w-[120px] block">
            {image.photographer}
          </span>
        </div>
      </div>
    </div>
  )
}
