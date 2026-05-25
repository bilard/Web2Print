import { create } from 'zustand'

/**
 * Store de la barre de progression globale discrète. `active` compte les
 * traitements en cours (gère l'imbrication) ; `progress` est renseigné pour les
 * traitements déterministes (0..1), sinon `null` → barre indéterminée animée.
 */
interface ProgressState {
  active: number
  label: string | null
  progress: number | null
  begin: (label?: string) => void
  end: () => void
  setProgress: (value: number | null, label?: string) => void
}

export const useProgressStore = create<ProgressState>((set) => ({
  active: 0,
  label: null,
  progress: null,
  begin: (label) => set((s) => ({ active: s.active + 1, label: label ?? s.label })),
  end: () =>
    set((s) => {
      const active = Math.max(0, s.active - 1)
      return active === 0 ? { active, label: null, progress: null } : { active }
    }),
  setProgress: (value, label) => set((s) => ({ progress: value, label: label ?? s.label })),
}))

/** Enrobe une promesse dans un traitement (barre indéterminée). begin/end garantis. */
export async function withProgress<T>(label: string, fn: () => Promise<T>): Promise<T> {
  useProgressStore.getState().begin(label)
  try {
    return await fn()
  } finally {
    useProgressStore.getState().end()
  }
}
