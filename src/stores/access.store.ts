// src/stores/access.store.ts
import { create } from 'zustand'
import { DEMO_LIMITS, type UsageCounters } from '@/features/access/permissions'
import { emptyUsage } from '@/features/access/usage'

interface AccessState {
  /** Permissions effectives du user courant. */
  permissions: Set<string>
  /** Rôle assigné (null = en attente, sauf owner). */
  roleId: string | null
  isOwner: boolean
  /** Compte suspendu par un admin (aucun accès, même avec un rôle). */
  blocked: boolean
  /** Compteurs d'usage cumulés (quotas démo). Miroir local de `users/{uid}.usage`,
   *  hydraté au login et incrémenté optimistiquement à chaque import. */
  usage: UsageCounters
  /** Plafonds du compte démo, issus du rôle (`roles/{id}.limits`, repli DEMO_LIMITS). */
  limits: UsageCounters
  /** true tant que l'accès n'a pas été hydraté depuis Firestore. */
  loading: boolean
  /** Flag Firestore users/{uid}.onboardingComplete — lu en piggyback à l'hydratation de l'accès. */
  onboardingComplete: boolean
  setAccess: (a: { permissions: Set<string>; roleId: string | null; isOwner: boolean; blocked: boolean; usage: UsageCounters; limits: UsageCounters; onboardingComplete: boolean }) => void
  setLoading: (loading: boolean) => void
  /** Incrément optimiste des compteurs d'usage (après un import réussi). */
  bumpUsage: (patch: Partial<UsageCounters>) => void
  /** Mise à jour locale après clic « Terminer » (évite la réouverture dans la session). */
  setOnboardingComplete: (v: boolean) => void
  reset: () => void
}

export const useAccessStore = create<AccessState>((set) => ({
  permissions: new Set(),
  roleId: null,
  isOwner: false,
  blocked: false,
  usage: emptyUsage(),
  limits: { ...DEMO_LIMITS },
  loading: true,
  onboardingComplete: false,
  setAccess: (a) => set({ ...a, loading: false }),
  setLoading: (loading) => set({ loading }),
  // Incrément optimiste du miroir local (compteur serveur = vérité). Borné à 0 par
  // sûreté (le miroir ne descend jamais sous zéro).
  bumpUsage: (patch) => set((s) => ({ usage: {
    pimRows: Math.max(0, s.usage.pimRows + (patch.pimRows ?? 0)),
    damAssets: Math.max(0, s.usage.damAssets + (patch.damAssets ?? 0)),
  } })),
  setOnboardingComplete: (v) => set({ onboardingComplete: v }),
  reset: () => set({ permissions: new Set(), roleId: null, isOwner: false, blocked: false, usage: emptyUsage(), limits: { ...DEMO_LIMITS }, loading: true, onboardingComplete: false }),
}))
