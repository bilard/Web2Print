import { Heart, Plus, Download } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamFavorites } from '../hooks/useDamFavorites'
import type { DamImage } from '../types'

interface Props {
  image: DamImage
  onAddToCollection?: (image: DamImage) => void
}

export function DamImageCard({ image, onAddToCollection }: Props) {
  const { openLightbox } = useDamStore()
  const { isFavorite, toggleFavorite } = useDamFavorites()
  const fav = isFavorite(image.id)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', image.previewUrl)
    e.dataTransfer.setData('application/dam-image', JSON.stringify(image))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const a = document.createElement('a')
    a.href = image.fullUrl
    a.target = '_blank'
    a.download = `${image.sourceProvider}_${image.sourceId}.jpg`
    a.click()
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => openLightbox(image)}
      className="group relative rounded-md overflow-hidden cursor-pointer bg-white/5"
      style={{ aspectRatio: `${image.width}/${image.height}` }}
    >
      <img
        src={image.thumbnailUrl}
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
          >
            <Heart className="w-3.5 h-3.5" fill={fav ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddToCollection?.(image)
            }}
            className="p-1 rounded bg-black/60 text-white/80 hover:bg-black/80"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDownload} className="p-1 rounded bg-black/60 text-white/80 hover:bg-black/80">
            <Download className="w-3.5 h-3.5" />
          </button>
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
