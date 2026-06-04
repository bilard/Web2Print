import { useEffect, useRef } from 'react'
import { driver, type Driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'
import { useTourStore, type TourId } from './tour.store'
import { editorTourSteps } from './editorTourSteps'

const TOUR_STEPS: Record<TourId, DriveStep[]> = {
  editor: editorTourSteps,
}

/**
 * Monte le moteur driver.js et le pilote selon `activeTour` du store.
 * À monter UNE seule fois dans la page concernée (ex. EditorPage).
 * Le démarrage se fait depuis n'importe où via `useTourStore.startTour(id)`.
 */
export function useGuidedTour() {
  const activeTour = useTourStore((s) => s.activeTour)
  const stopTour = useTourStore((s) => s.stopTour)
  const driverRef = useRef<Driver | null>(null)

  useEffect(() => {
    if (!activeTour) return

    const instance = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: '#000000',
      overlayOpacity: 0.7,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: 'w2p-tour',
      nextBtnText: 'Suivant',
      prevBtnText: 'Précédent',
      doneBtnText: 'Terminer',
      progressText: '{{current}} / {{total}}',
      steps: TOUR_STEPS[activeTour],
      onDestroyed: () => stopTour(),
    })

    driverRef.current = instance
    instance.drive()

    return () => {
      instance.destroy()
      driverRef.current = null
    }
  }, [activeTour, stopTour])
}
