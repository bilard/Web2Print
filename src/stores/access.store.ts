// src/stores/access.store.ts
import { create } from 'zustand'

interface AccessState {
  /** Permissions effectives du user courant. */
  permissions: Set<string>
  /** Rôle assigné (null = en attente, sauf owner). */
  roleId: string | null
  isOwner: boolean
  /** Compte suspendu par un admin (aucun accès, même avec un rôle). */
  blocked: boolean
  /** true tant que l'accès n'a pas été hydraté depuis Firestore. */
  loading: boolean
  setAccess: (a: { permissions: Set<string>; roleId: string | null; isOwner: boolean; blocked: boolean }) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useAccessStore = create<AccessState>((set) => ({
  permissions: new Set(),
  roleId: null,
  isOwner: false,
  blocked: false,
  loading: true,
  setAccess: (a) => set({ ...a, loading: false }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ permissions: new Set(), roleId: null, isOwner: false, blocked: false, loading: true }),
}))
