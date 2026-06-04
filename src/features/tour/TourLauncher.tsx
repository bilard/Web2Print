import { Compass } from 'lucide-react'
import { useTourStore, type TourId } from './tour.store'
import { useGuidedTour } from './useGuidedTour'

interface TourLauncherProps {
  /** Tour à lancer au clic (par défaut : éditeur). */
  tourId?: TourId
}

/**
 * Bouton flottant « Visite guidée » + montage du moteur driver.js.
 * Placé à gauche du bouton d'aide « ? » (bottom-right).
 */
export function TourLauncher({ tourId = 'editor' }: TourLauncherProps) {
  const startTour = useTourStore((s) => s.startTour)
  useGuidedTour()

  return (
    <button
      type="button"
      onClick={() => startTour(tourId)}
      title="Visite guidée"
      aria-label="Démarrer la visite guidée"
      className="fixed bottom-4 right-16 z-30
        w-10 h-10 rounded-full
        bg-[#1a1a1a] border border-white/10 hover:border-indigo-500/50
        text-white/60 hover:text-indigo-400
        flex items-center justify-center
        shadow-lg
        transition-colors"
    >
      <Compass className="w-5 h-5" />
    </button>
  )
}
