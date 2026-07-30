import { useEffect } from 'react'
import { Compass } from 'lucide-react'
import { useTourStore, hasSeenTour, markTourSeen, type TourId } from './tour.store'
import { useGuidedTour } from './useGuidedTour'
import { t } from '@/lib/i18n'

interface TourLauncherProps {
  /** Tour à lancer au clic (par défaut : éditeur). */
  tourId?: TourId
}

/** Délai avant l'auto-démarrage : laisse l'UI (ancres data-tour) se monter. */
const AUTO_START_DELAY_MS = 1200

/**
 * Bouton flottant « Visite guidée » + montage du moteur driver.js.
 * Placé à gauche du bouton d'aide « ? » (bottom-right).
 * Déclenche aussi le tour automatiquement à la première ouverture de l'éditeur.
 */
export function TourLauncher({ tourId = 'editor' }: TourLauncherProps) {
  const startTour = useTourStore((s) => s.startTour)
  useGuidedTour()

  // Auto-démarrage une seule fois (flag localStorage). On marque « vu » juste
  // avant de lancer ; quitter la page avant le délai laisse le tour réapparaître.
  useEffect(() => {
    if (hasSeenTour(tourId)) return
    const timer = setTimeout(() => {
      markTourSeen(tourId)
      startTour(tourId)
    }, AUTO_START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [tourId, startTour])

  return (
    <button
      type="button"
      onClick={() => startTour(tourId)}
      title={t('tr.guidedTour')}
      aria-label={t('tr.startTour')}
      className="fixed bottom-4 right-16 z-30
        w-10 h-10 rounded-full
        bg-surface border border-white/10 hover:border-indigo-500/50
        text-white/60 hover:text-indigo-400
        flex items-center justify-center
        shadow-lg
        transition-colors"
    >
      <Compass className="w-5 h-5" />
    </button>
  )
}
