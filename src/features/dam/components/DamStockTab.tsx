import { useCallback, useEffect, useRef } from 'react'
import { Search, X, Camera, Loader2, Heart } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamSearch } from '../hooks/useDamSearch'
import { useDamSearchByImage } from '../hooks/useDamSearchByImage'
import { useDamCanvasInsert } from '../hooks/useDamCanvasInsert'
import { useDamFavorites } from '../hooks/useDamFavorites'
import type { DamImage } from '../types'

const SOURCES = [
  { value: 'all' as const, label: 'Tout' },
  { value: 'pexels' as const, label: 'Pexels' },
  { value: 'unsplash' as const, label: 'Unsplash' },
]

export function DamStockTab() {
  const { query, setQuery, filters, setFilters, results, loading, hasMore, lastError } = useDamStore()
  const { search, loadMore } = useDamSearch()
  const { searchByImage, uploading } = useDamSearchByImage()
  const { insertOnCanvas, replaceOnCanvas } = useDamCanvasInsert()
  const { isFavorite, toggleFavorite } = useDamFavorites()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const didInitRef = useRef(false)

  const handleSearch = useCallback(() => {
    search()
  }, [search])

  // Chargement initial : images curées dès l'ouverture de l'onglet
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    if (results.length === 0 && !loading) {
      search()
    }
  }, [search, results.length, loading])

  // Recharger les curated quand la source change sans query
  useEffect(() => {
    if (!didInitRef.current) return
    if (!query.trim()) search()
     
  }, [filters.source])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch()
    },
    [handleSearch]
  )

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) loadMore()
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadMore])

  const handleImageClick = (image: DamImage) => {
    insertOnCanvas(image)
  }

  // Double-clic = remplacer le bloc actuellement sélectionné sur le canvas
  const handleImageDoubleClick = (image: DamImage) => {
    replaceOnCanvas(image)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2">
        <div className="flex items-center bg-[#111] border border-white/10 rounded-md h-8 px-2 gap-1.5 focus-within:border-indigo-500/50">
          <Search className="w-3.5 h-3.5 text-white/30" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/60">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 px-2 pb-2 flex-wrap">
        {SOURCES.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilters({ source: s.value })}
            className={`px-2 py-0.5 rounded-full text-[9px] transition ${
              filters.source === s.value
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {s.label}
          </button>
        ))}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) searchByImage(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-2 py-0.5 rounded-full text-[9px] bg-white/5 text-white/40 hover:bg-white/10 transition disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-3 h-3 animate-spin inline" />
          ) : (
            <Camera className="w-3 h-3 inline" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {!loading && results.length === 0 ? (
          <div className="text-center text-[10px] mt-8 px-3">
            {lastError ? (
              <div className="space-y-2">
                <div className="text-red-400">Erreur de chargement</div>
                <div className="text-white/40 break-words">{lastError}</div>
                <button
                  onClick={() => search()}
                  className="mt-2 px-2 py-1 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30"
                >
                  Réessayer
                </button>
              </div>
            ) : (
              <div className="text-white/20">
                {query.trim() ? 'Aucun résultat' : 'Aucune image disponible'}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {results.map((image) => (
              <div
                key={image.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', image.previewUrl)
                  e.dataTransfer.setData('application/dam-image', JSON.stringify(image))
                }}
                onClick={() => handleImageClick(image)}
                onDoubleClick={() => handleImageDoubleClick(image)}
                title="Clic : insérer — Double-clic : remplacer le bloc actif"
                className="group relative aspect-square rounded overflow-hidden cursor-pointer bg-white/5"
              >
                <img
                  src={image.thumbnailUrl}
                  alt={image.description}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(image)
                    }}
                    className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Heart
                      className="w-3 h-3"
                      fill={isFavorite(image.id) ? '#ef4444' : 'none'}
                      stroke={isFavorite(image.id) ? '#ef4444' : 'white'}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={sentinelRef} className="h-8" />
        {loading && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          </div>
        )}
      </div>

      <div className="px-2 py-1.5 text-center text-[9px] text-white/20 border-t border-white/5">
        Cliquer ou glisser sur le canvas
      </div>
    </div>
  )
}
