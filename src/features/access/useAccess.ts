// src/features/access/useAccess.ts
import { useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { isOwnerEmail } from '@/features/auth/useAuth'
import { computeEffectivePermissions } from './computePermissions'

/** Hydrate les permissions effectives au login (lit users/{uid} + le doc rôle). */
export function useAccessInit() {
  const user = useAuthStore((s) => s.user)
  const setAccess = useAccessStore((s) => s.setAccess)
  const reset = useAccessStore((s) => s.reset)

  useEffect(() => {
    if (!user) { reset(); return }
    let cancelled = false
    const isOwner = isOwnerEmail(user.email)

    ;(async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid))
        const data = userSnap.data() ?? {}
        const roleId = (data.accessRoleId as string | undefined) ?? null
        const grants = (data.accessGrants as string[] | undefined) ?? []
        const revokes = (data.accessRevokes as string[] | undefined) ?? []
        let rolePermissions: string[] | null = null
        if (roleId) {
          const roleSnap = await getDoc(doc(db, 'roles', roleId))
          rolePermissions = (roleSnap.data()?.permissions as string[] | undefined) ?? []
        }
        if (cancelled) return
        setAccess({
          permissions: computeEffectivePermissions({ isOwner, rolePermissions, grants, revokes }),
          roleId,
          isOwner,
        })
      } catch (e) {
        if (cancelled) return
        console.warn('[useAccessInit] load failed:', e)
        setAccess({ permissions: computeEffectivePermissions({ isOwner, rolePermissions: null, grants: [], revokes: [] }), roleId: null, isOwner })
      }
    })()

    return () => { cancelled = true }
  }, [user, setAccess, reset])
}

/** L'utilisateur a-t-il cette permission ? (owner → toujours true) */
export function useCan(key: string): boolean {
  return useAccessStore((s) => s.isOwner || s.permissions.has(key))
}

/** Connecté mais sans rôle (et non-owner). */
export function useIsPending(): boolean {
  return useAccessStore((s) => !s.loading && !s.isOwner && !s.roleId)
}

/** Possède la permission admin (= owner en V1). */
export function useIsAdmin(): boolean {
  return useAccessStore((s) => s.isOwner || s.permissions.has('admin'))
}

/** true tant que l'accès n'est pas hydraté. */
export function useAccessLoading(): boolean {
  return useAccessStore((s) => s.loading)
}
