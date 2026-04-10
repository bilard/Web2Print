import { useEffect } from 'react'
import { X, Heart, Plus, Download, ExternalLink } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamFavorites } from '../hooks/useDamFavorites'
import { useDamCanvasInsert } from '../hooks/useDamCanvasInsert'

export function DamLightbox() {
  const { lightboxImage, closeLightbox } = useDamStore()
  const { isFavorite, toggleFavorite } = useDamFavorites()
  const { insertOnCanvas } = useDamCanvasInsert()

  useEffect(() => {
    if (!lightboxImage) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxImage, closeLightbox])

  if (!lightboxImage) return null

  const image = lightboxImage
  const fav = isFavorite(image.id)

  const handleInsert = () => {
    insertOnCanvas(image)
    closeLightbox()
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={closeLightbox}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleFavorite(image)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                fav
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-white/10 text-white/70 hover:bg-white/15'
              }`}
            >
              <Heart className="w-4 h-4" fill={fav ? 'currentColor' : 'none'} />
              {fav ? 'Favori' : 'Ajouter aux favoris'}
            </button>
            <button
              onClick={handleInsert}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-indigo-500 text-white hover:bg-indigo-600 transition"
            >
              <Plus className="w-4 h-4" />
              Ajouter au canvas
            </button>
            <a
              href={image.fullUrl}
              target="_blank"
              rel="noopener"
              download
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/10 text-white/70 hover:bg-white/15 transition"
            >
              <Download className="w-4 h-4" />
              Télécharger
            </a>
          </div>
          <button onClick={closeLightbox} className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center min-h-0 px-4">
          <img
            src={image.previewUrl}
            alt={image.description}
            className="max-w-full max-h-[70vh] object-contain rounded-lg"
          />
        </div>

        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-white/50">
            <span className="capitalize font-medium text-white/70">{image.sourceProvider}</span>
            <span>·</span>
            <a
              href={image.photographerUrl}
              target="_blank"
              rel="noopener"
              className="hover:text-white transition flex items-center gap-1"
            >
              {image.photographer}
              <ExternalLink className="w-3 h-3" />
            </a>
            <span>·</span>
            <span>{image.width} × {image.height}</span>
          </div>
          {image.description && (
            <span className="text-white/40 text-xs max-w-[300px] truncate">
              {image.description}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
