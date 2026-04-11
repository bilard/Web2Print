import { useEffect, useState } from 'react'
import { ArrowRight, Wand2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useGenerateAllBriefImages } from '@/features/briefs/ai/useGenerateAllBriefImages'
import { useGenerateDeck } from '@/features/briefs/ai/useGenerateDeck'
import { useBriefImages } from '@/features/briefs/useBriefImages'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import { BriefImagesGallery } from './BriefImagesGallery'
import type { Brief } from '@/features/briefs/types'

interface Props {
  brief: Brief
  onAdvance: () => void
}

export function Step4Deck({ brief, onAdvance }: Props) {
  const generateAllImages = useGenerateAllBriefImages()
  const generateDeck = useGenerateDeck()
  const update = useUpdateBrief()
  const { data: existingImages = [], isLoading: imagesLoading } = useBriefImages(brief.id)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [autoTried, setAutoTried] = useState(false)
  const [deckAutoTried, setDeckAutoTried] = useState(false)
  const slideCount = brief.deck?.slides.length ?? 0

  const handleGenerateAllImages = async () => {
    setProgress({ done: 0, total: 1 + (brief.cart?.items.length ?? 0), label: '' })
    try {
      const r = await generateAllImages.mutateAsync({
        brief,
        onProgress: (info) => setProgress({ done: info.done, total: info.total, label: info.currentLabel }),
      })
      if (r.failed.length === 0) toast.success(`${r.generated.length} images générées`)
      else {
        const detail = r.failed.map((f) => `${f.id}: ${f.error}`).join('\n')
        console.error('[Step4Deck] échecs:', detail)
        toast.warning(`${r.generated.length} générées, ${r.failed.length} échec(s) — voir console`)
      }
    } catch (err) {
      toast.error((err as Error).message || 'Échec du batch')
    } finally {
      setProgress(null)
    }
  }

  const handleNext = async () => {
    console.log('[Step4Deck] handleNext called, briefId=', brief.id)
    if (slideCount === 0) {
      toast.error('Le deck est vide. Génère la structure avant de continuer.')
      return
    }
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: { currentStep: 5 } as never,
      })
      console.log('[Step4Deck] update OK → onAdvance')
      onAdvance()
    } catch (err) {
      console.error('[Step4Deck] update FAILED', err)
      toast.error('Erreur sauvegarde : ' + ((err as Error).message || 'inconnue'))
    }
  }

  const handleGenerateDeck = async () => {
    try {
      const r = await generateDeck.mutateAsync({ brief })
      toast.success(`Deck généré : ${r.slides.length} slide${r.slides.length > 1 ? 's' : ''}`)
    } catch (err) {
      console.error('[Step4Deck] generateDeck FAILED', err)
      toast.error('Échec génération deck : ' + ((err as Error).message || 'inconnue'))
    }
  }

  // Auto-génération de la STRUCTURE DU DECK à l'arrivée si elle n'existe pas
  useEffect(() => {
    if (deckAutoTried || generateDeck.isPending) return
    if (slideCount > 0) return
    if (!brief.cart?.items.length) return
    setDeckAutoTried(true)
    handleGenerateDeck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideCount])

  // Auto-génération des images à l'arrivée s'il manque des visuels pour
  // les SKUs actuels du panier (gère le cas d'une régénération de panier
  // qui laisse en base des images orphelines avec d'anciens SKUs).
  useEffect(() => {
    if (autoTried || imagesLoading || generateAllImages.isPending) return
    const items = brief.cart?.items ?? []
    if (!items.length) return
    const existingIds = new Set(existingImages.map((i) => i.id))
    const requiredIds = ['hero', 'staging_scene', ...items.map((i) => `product_${i.sku}`)]
    const hasAllRequired = requiredIds.every((id) => existingIds.has(id))
    if (hasAllRequired) return
    setAutoTried(true)
    handleGenerateAllImages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesLoading, existingImages.length, brief.cart?.items])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return
      if (update.isPending) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      e.stopPropagation()
      handleNext()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update.isPending])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Structure du deck */}
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-white/80">Structure du deck</h2>
              <button
                onClick={handleGenerateDeck}
                disabled={generateDeck.isPending || !brief.cart?.items.length}
                className="flex items-center gap-1.5 text-[12px] text-indigo-300 hover:text-white hover:bg-indigo-500/10 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {generateDeck.isPending
                  ? 'Génération…'
                  : slideCount > 0
                  ? 'Régénérer le deck'
                  : 'Générer le deck'}
              </button>
            </div>
            {generateDeck.isPending && (
              <div className="mb-4 flex items-center gap-3 py-3 px-4 border border-dashed border-white/[0.08] rounded-md">
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                <p className="text-[12px] text-white/60">Construction de la structure du deck (Claude Opus)…</p>
              </div>
            )}
            {slideCount > 0 ? (
              <ul className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {brief.deck?.slides.map((s, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-white/70 bg-[#141414] border border-white/[0.06] rounded px-3 py-2 truncate"
                    title={'title' in s ? s.title : s.type}
                  >
                    <span className="text-indigo-300">{i + 1}.</span>{' '}
                    <span className="text-white/40">[{s.type}]</span>{' '}
                    {'title' in s ? s.title : ''}
                  </li>
                ))}
              </ul>
            ) : !generateDeck.isPending ? (
              <p className="text-[11px] text-white/40">
                Aucune slide. Le deck sera généré automatiquement.
              </p>
            ) : null}
          </section>

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
              <div className="mb-4 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-4 py-3">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="w-5 h-5 text-indigo-300 animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-white">
                      Génération {progress.done}/{progress.total}
                    </div>
                    <div className="text-[12px] text-white/60 truncate">
                      {progress.label || '…'}
                    </div>
                  </div>
                  <div className="text-[18px] font-bold text-indigo-300 tabular-nums">
                    {Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%
                  </div>
                </div>
                <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 transition-all duration-300"
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {generateAllImages.isPending && existingImages.length === 0 && !progress && (
              <div className="mb-4 flex flex-col items-center justify-center gap-3 py-8 border border-dashed border-white/[0.08] rounded-md">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                <p className="text-[12px] text-white/50">Génération des visuels en cours…</p>
              </div>
            )}
            <BriefImagesGallery brief={brief} batchPending={generateAllImages.isPending} />
          </section>
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#141414] px-6 py-3 flex justify-end shrink-0">
        <button
          onClick={handleNext}
          disabled={update.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md disabled:opacity-50"
        >
          Étape suivante
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
