import { useState } from 'react'
import { ArrowRight, Sparkles, RefreshCw, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { useGenerateDeck } from '@/features/briefs/ai/useGenerateDeck'
import { useGenerateAllBriefImages } from '@/features/briefs/ai/useGenerateAllBriefImages'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import { SlideList } from './SlideList'
import { BriefImagesGallery } from './BriefImagesGallery'
import type { Brief } from '@/features/briefs/types'

interface Props {
  brief: Brief
  onAdvance: () => void
}

export function Step4Deck({ brief, onAdvance }: Props) {
  const generateDeck = useGenerateDeck()
  const generateAllImages = useGenerateAllBriefImages()
  const update = useUpdateBrief()
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)

  const slides = brief.deck?.slides ?? []
  const hasDeck = slides.length > 0

  const handleGenerateDeck = async () => {
    try {
      await generateDeck.mutateAsync({ brief })
      toast.success('Deck généré')
    } catch (err) {
      toast.error((err as Error).message || 'Échec de la génération')
    }
  }

  const handleGenerateAllImages = async () => {
    setProgress({ done: 0, total: 1 + (brief.cart?.items.length ?? 0), label: '' })
    try {
      const r = await generateAllImages.mutateAsync({
        brief,
        onProgress: (info) => setProgress({ done: info.done, total: info.total, label: info.currentLabel }),
      })
      if (r.failed.length === 0) toast.success(`${r.generated.length} images générées`)
      else toast.warning(`${r.generated.length} générées, ${r.failed.length} échec(s)`)
    } catch (err) {
      toast.error((err as Error).message || 'Échec du batch')
    } finally {
      setProgress(null)
    }
  }

  const handleNext = async () => {
    if (!hasDeck) {
      toast.error('Génère d’abord la structure du deck')
      return
    }
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: { status: 'deck_ready', currentStep: 5 } as never,
      })
      onAdvance()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6">
          {/* Col 1 — Deck */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-white/80">Structure du deck</h2>
              <button
                onClick={handleGenerateDeck}
                disabled={generateDeck.isPending}
                className="flex items-center gap-1.5 text-[12px] text-indigo-300 hover:text-white hover:bg-indigo-500/10 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {hasDeck ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generateDeck.isPending ? 'Génération…' : hasDeck ? 'Régénérer' : 'Générer le deck'}
              </button>
            </div>
            <SlideList slides={slides} />
          </section>

          {/* Col 2 — Images */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-white/80">Visuels (Nano Banana)</h2>
              <button
                onClick={handleGenerateAllImages}
                disabled={generateAllImages.isPending || !brief.cart?.items.length}
                className="flex items-center gap-1.5 text-[12px] text-indigo-300 hover:text-white hover:bg-indigo-500/10 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {generateAllImages.isPending ? 'Génération…' : 'Générer toutes les images'}
              </button>
            </div>
            {progress && (
              <div className="mb-3 text-[11px] text-white/50">
                {progress.done}/{progress.total} — {progress.label || '…'}
              </div>
            )}
            <BriefImagesGallery brief={brief} />
          </section>
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#141414] px-6 py-3 flex justify-end shrink-0">
        <button
          onClick={handleNext}
          disabled={!hasDeck || update.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md disabled:opacity-50"
        >
          Étape suivante
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
