import { create } from 'zustand'

/** Identifiant d'un tour guidé. Étendre l'union au fil des modules couverts. */
export type TourId = 'editor'

interface TourState {
  /** Tour en cours, ou null si aucun. */
  activeTour: TourId | null
  startTour: (id: TourId) => void
  stopTour: () => void
}

/**
 * Store découplant le déclencheur (bouton) du moteur driver.js.
 * Même pattern que `help.store.ts` : n'importe quel composant peut lancer un
 * tour ; `useGuidedTour` (monté une fois) observe `activeTour` et pilote.
 */
export const useTourStore = create<TourState>((set) => ({
  activeTour: null,
  startTour: (id) => set({ activeTour: id }),
  stopTour: () => set({ activeTour: null }),
}))
