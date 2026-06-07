import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Play, Pause, Plus, Upload } from 'lucide-react'
import type { Section } from '@/features/navigation/modules'
import { DISCOVER_SLIDES } from './discoverSlides'
import { DiscoverSlideView } from './DiscoverSlideView'

interface DiscoverPageProps {
  /** Permet aux CTA de la dernière slide d'ouvrir un autre module du Dashboard. */
  onNavigate?: (section: Section) => void
}

const AUTOPLAY_MS = 7000

/** Slideshow « Découverte » : parcours produit décliné par secteur. */
export function DiscoverPage({ onNavigate }: DiscoverPageProps) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const count = DISCOVER_SLIDES.length
  const slide = DISCOVER_SLIDES[index]
  const isLast = index === count - 1

  const go = useCallback((dir: 1 | -1) => {
    setIndex((i) => (i + dir + count) % count)
  }, [count])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(1)
    else if (e.key === 'ArrowLeft') go(-1)
  }, [go])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // Autoplay : avance toutes les AUTOPLAY_MS, s'arrête à la dernière slide.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!playing) return
    if (isLast) { setPlaying(false); return }
    timer.current = setTimeout(() => setIndex((i) => i + 1), AUTOPLAY_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [playing, index, isLast])

  return (
    <div className="h-full w-full bg-[#1a1a1a] flex flex-col">
      {/* Scène */}
      <div className="flex-1 min-h-0 relative">
        <DiscoverSlideView key={slide.id} slide={slide} />

        {/* Flèches latérales */}
        <button
          onClick={() => go(-1)}
          aria-label="Slide précédente"
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/40 hover:text-white/80 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => go(1)}
          aria-label="Slide suivante"
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/40 hover:text-white/80 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* CTA dernière slide */}
        {isLast && onNavigate && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3">
            <button
              onClick={() => onNavigate('blank')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Créer un document
            </button>
            <button
              onClick={() => onNavigate('import')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] text-white/70 text-sm font-medium transition-colors"
            >
              <Upload className="w-4 h-4" /> Importer un fichier
            </button>
          </div>
        )}
      </div>

      {/* Barre de contrôle */}
      <div className="shrink-0 flex items-center justify-between px-8 py-4 border-t border-white/[0.06]">
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={isLast}
          className="flex items-center gap-2 text-[13px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-30"
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {playing ? 'Pause' : 'Lecture auto'}
        </button>

        <div className="flex items-center gap-2" role="tablist" aria-label="Navigation des slides">
          {DISCOVER_SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIndex(i)}
              role="tab"
              aria-selected={i === index}
              aria-label={`Slide ${i + 1}`}
              className={`h-2 rounded-full transition-all ${i === index ? `w-6 ${s.palette.dot}` : 'w-2 bg-white/15 hover:bg-white/30'}`}
            />
          ))}
        </div>

        <span className="text-[12px] tabular-nums text-white/30">{index + 1} / {count}</span>
      </div>
    </div>
  )
}
