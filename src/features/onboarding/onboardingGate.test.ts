import { describe, it, expect } from 'vitest'
import { shouldAutoOpenOnboarding } from './onboardingGate'

const base = {
  hydrated: true,
  accessLoading: false,
  onboardingComplete: false,
  hasLlmKey: false,
  dismissedThisSession: false,
}

describe('shouldAutoOpenOnboarding', () => {
  it('ouvre pour un nouvel user : hydraté, pas de flag, pas de clé', () => {
    expect(shouldAutoOpenOnboarding(base)).toBe(true)
  })
  it('n\'ouvre pas tant que les clés ne sont pas hydratées (évite le flash)', () => {
    expect(shouldAutoOpenOnboarding({ ...base, hydrated: false })).toBe(false)
  })
  it('n\'ouvre pas tant que l\'accès n\'est pas hydraté', () => {
    expect(shouldAutoOpenOnboarding({ ...base, accessLoading: true })).toBe(false)
  })
  it('n\'ouvre pas si onboarding déjà terminé', () => {
    expect(shouldAutoOpenOnboarding({ ...base, onboardingComplete: true })).toBe(false)
  })
  it('CAS USER EXISTANT : a déjà une clé → ne s\'ouvre PAS même sans flag', () => {
    expect(shouldAutoOpenOnboarding({ ...base, hasLlmKey: true })).toBe(false)
  })
  it('n\'ouvre pas si « Plus tard » a été cliqué cette session', () => {
    expect(shouldAutoOpenOnboarding({ ...base, dismissedThisSession: true })).toBe(false)
  })
})
