// src/features/access/useAccess.ts
import { useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { isOwnerEmail } from '@/features/auth/useAuth'
import { computeEffectivePermissions } from './computePermissions'
import { DEMO_PERMISSION, DEMO_LIMITS, type UsageCounters } from './permissions'
import { readUsage, emptyUsage } from './usage'

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
        const onboardingComplete = (data.onboardingComplete as boolean | undefined) ?? false
        // Compte suspendu par un admin → aucun accès (l'owner ne peut jamais être bloqué).
        const blocked = !isOwner && ((data.accessBlocked as boolean | undefined) ?? false)
        let rolePermissions: string[] | null = null
        let limits: UsageCounters = { ...DEMO_LIMITS }
        // Rôle supprimé entre-temps → on le traite comme « pas de rôle » (pending) :
        // resolvedRoleId repasse à null pour que useIsPending() renvoie true.
        let resolvedRoleId: string | null = roleId
        if (roleId) {
          const roleSnap = await getDoc(doc(db, 'roles', roleId))
          if (roleSnap.exists()) {
            rolePermissions = (roleSnap.data()?.permissions as string[] | undefined) ?? []
            const rl = roleSnap.data()?.limits as Partial<UsageCounters> | undefined
            limits = {
              pimRows: typeof rl?.pimRows === 'number' ? rl.pimRows : DEMO_LIMITS.pimRows,
              damAssets: typeof rl?.damAssets === 'number' ? rl.damAssets : DEMO_LIMITS.damAssets,
            }
          } else {
            resolvedRoleId = null
          }
        }
        if (cancelled) return
        setAccess({
          // Bloqué → aucune permission, quel que soit le rôle.
          permissions: blocked ? new Set() : computeEffectivePermissions({ isOwner, rolePermissions, grants, revokes }),
          roleId: resolvedRoleId,
          isOwner,
          blocked,
          usage: readUsage(data.usage),
          limits,
          onboardingComplete,
        })
      } catch (e) {
        if (cancelled) return
        console.warn('[useAccessInit] load failed:', e)
        setAccess({ permissions: computeEffectivePermissions({ isOwner, rolePermissions: null, grants: [], revokes: [] }), roleId: null, isOwner, blocked: false, usage: emptyUsage(), limits: { ...DEMO_LIMITS }, onboardingComplete: false })
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

/** Compte suspendu par un admin (et non-owner). */
export function useIsBlocked(): boolean {
  return useAccessStore((s) => !s.loading && !s.isOwner && s.blocked)
}

/** Possède la permission admin (= owner en V1). */
export function useIsAdmin(): boolean {
  return useAccessStore((s) => s.isOwner || s.permissions.has('admin'))
}

/** true tant que l'accès n'est pas hydraté. */
export function useAccessLoading(): boolean {
  return useAccessStore((s) => s.loading)
}

/** Compte « démo » (quotas de données). L'owner n'est jamais démo. Interne : consommé
 *  par useQuota (les composants passent par useQuota). */
function useIsDemo(): boolean {
  return useAccessStore((s) => !s.isOwner && s.permissions.has(DEMO_PERMISSION))
}

interface QuotaField {
  used: number
  limit: number
  remaining: number
}
export interface Quota {
  isDemo: boolean
  pimRows: QuotaField
  damAssets: QuotaField
  /** Peut-on encore ajouter `n` lignes PIM sans dépasser le quota ? */
  canAddPim: (n: number) => boolean
  /** Peut-on encore ajouter `n` assets DAM sans dépasser le quota ? */
  canAddDam: (n: number) => boolean
}

/** Quotas + usage courant du compte (limites configurées par le rôle ; ∞ hors démo). */
export function useQuota(): Quota {
  const isDemo = useIsDemo()
  const usage: UsageCounters = useAccessStore((s) => s.usage)
  const limits: UsageCounters = useAccessStore((s) => s.limits)
  const field = (used: number, limit: number): QuotaField => ({ used, limit, remaining: Math.max(0, limit - used) })
  return {
    isDemo,
    pimRows: field(usage.pimRows, isDemo ? limits.pimRows : Infinity),
    damAssets: field(usage.damAssets, isDemo ? limits.damAssets : Infinity),
    canAddPim: (n) => !isDemo || usage.pimRows + n <= limits.pimRows,
    canAddDam: (n) => !isDemo || usage.damAssets + n <= limits.damAssets,
  }
}
