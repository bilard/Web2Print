import { useEffect, useRef } from 'react'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'
import { useTourStore, type TourId } from './tour.store'
import type { TourStep } from './types'
import { editorTourSteps } from './editorTourSteps'
import { dashboardTourSteps } from './dashboardTourSteps'
import { waitForElement } from './waitForElement'

const TOUR_STEPS: Record<TourId, TourStep[]> = {
  editor: editorTourSteps,
  dashboard: dashboardTourSteps,
}

/** Exécute l'effet de bord d'une étape puis attend son élément cible. */
async function prepareStep(step: TourStep | undefined): Promise<void> {
  if (!step) return
  if (step.prepare) await step.prepare()
  if (step.requireSelector) await waitForElement(step.requireSelector)
}

/**
 * Monte le moteur driver.js et le pilote selon `activeTour` du store.
 * À monter UNE seule fois dans la page concernée (ex. EditorPage / DashboardPage).
 *
 * Les transitions sont interceptées (`onNextClick`/`onPrevClick`) pour préparer
 * l'étape suivante (ouvrir une section, déplier un panneau) et attendre que sa
 * cible existe avant d'avancer — robuste face aux panneaux montés en lazy.
 */
export function useGuidedTour() {
  const activeTour = useTourStore((s) => s.activeTour)
  const stopTour = useTourStore((s) => s.stopTour)
  const driverRef = useRef<Driver | null>(null)

  useEffect(() => {
    if (!activeTour) return
    const steps = TOUR_STEPS[activeTour]
    let instance: Driver | null = null

    const goTo = async (targetIndex: number) => {
      if (!instance) return
      const step = steps[targetIndex]
      if (step) await prepareStep(step)
      instance.moveTo(targetIndex)
    }

    instance = driver({
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
      steps,
      onNextClick: () => {
        const idx = instance?.getActiveIndex() ?? 0
        if (instance?.isLastStep()) instance.destroy()
        else void goTo(idx + 1)
      },
      onPrevClick: () => {
        const idx = instance?.getActiveIndex() ?? 0
        void goTo(idx - 1)
      },
      onDestroyed: () => stopTour(),
    })

    driverRef.current = instance
    instance.drive()

    return () => {
      instance?.destroy()
      driverRef.current = null
    }
  }, [activeTour, stopTour])
}
