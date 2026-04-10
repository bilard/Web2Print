import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamSearch } from '../hooks/useDamSearch'
import { DamImageCard } from './DamImageCard'
import type { DamImage } from '../types'

interface Props {
  onAddToCollection?: (image: DamImage) => void
}

export function DamImageGrid({ onAddToCollection }: Props) {
  const { results, loading, hasMore } = useDamStore()
  const { loadMore } = useDamSearch()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadMore])

  if (!loading && results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        Recherchez des images pour commencer
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4">
      <div className="columns-4 gap-2 [column-fill:_balance]">
        {results.map((image) => (
          <div key={image.id} className="break-inside-avoid mb-2">
            <DamImageCard image={image} onAddToCollection={onAddToCollection} />
          </div>
        ))}
      </div>

      <div ref={sentinelRef} className="h-10" />

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      )}
    </div>
  )
}
