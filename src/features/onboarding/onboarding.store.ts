import { create } from 'zustand'

/** Nombre total d'étapes (0=Bienvenue … 4=Profil/Tour). */
export const ONBOARDING_STEP_COUNT = 5

interface OnboardingState {
  /** La modale est-elle ouverte ? */
  open: boolean
  /** Index de l'étape courante (0-based). */
  step: number
  /** Ouvre le wizard (auto-gate OU ré-entrée manuelle), toujours à l'étape 0. */
  openWizard: () => void
  /** Ferme le wizard. */
  closeWizard: () => void
  next: () => void
  prev: () => void
  goTo: (step: number) => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  open: false,
  step: 0,
  openWizard: () => set({ open: true, step: 0 }),
  closeWizard: () => set({ open: false }),
  next: () => set((s) => ({ step: Math.min(s.step + 1, ONBOARDING_STEP_COUNT - 1) })),
  prev: () => set((s) => ({ step: Math.max(s.step - 1, 0) })),
  goTo: (step) => set({ step: Math.max(0, Math.min(step, ONBOARDING_STEP_COUNT - 1)) }),
}))
