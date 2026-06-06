/** Entrées (toutes synchrones) qui décident de l'auto-ouverture du wizard. */
export interface OnboardingGateInputs {
  /** Les clés API sont-elles hydratées depuis Firestore ? (sinon flash) */
  hydrated: boolean
  /** L'accès (et donc le flag onboardingComplete) est-il encore en cours de chargement ? */
  accessLoading: boolean
  /** Flag Firestore : l'utilisateur a-t-il déjà terminé le wizard ? */
  onboardingComplete: boolean
  /** Au moins une clé LLM est-elle configurée ? */
  hasLlmKey: boolean
  /** « Plus tard » cliqué pendant cette session ? */
  dismissedThisSession: boolean
}

/**
 * Vrai ⟺ on doit auto-ouvrir le wizard. Dès qu'une clé LLM existe, plus
 * d'auto-ouverture — ce qui garantit que les users existants (clés déjà là,
 * pas de flag) ne sont jamais harcelés.
 */
export function shouldAutoOpenOnboarding(i: OnboardingGateInputs): boolean {
  if (!i.hydrated || i.accessLoading) return false
  if (i.onboardingComplete) return false
  if (i.dismissedThisSession) return false
  return !i.hasLlmKey
}
