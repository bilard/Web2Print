import { create } from 'zustand'

/** Identifiant d'un tour guidé. Étendre l'union au fil des modules couverts. */
export type TourId = 'editor' | 'dashboard'

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

// --- Persistance « déjà vu » (auto-démarrage une seule fois) ---------------
// localStorage suffit : flag non sensible, pas besoin de Firestore. try/catch
// pour les contextes où localStorage est indisponible (navigation privée).

const SEEN_KEY = 'w2p:tour:seen'

function readSeen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/** Le tour a-t-il déjà été présenté automatiquement à cet utilisateur/navigateur ? */
export function hasSeenTour(id: TourId): boolean {
  return readSeen()[id] === true
}

/** Marque le tour comme vu pour ne plus le déclencher automatiquement. */
export function markTourSeen(id: TourId): void {
  try {
    const seen = readSeen()
    seen[id] = true
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    /* localStorage indisponible : on ignore, le tour pourra se relancer */
  }
}
