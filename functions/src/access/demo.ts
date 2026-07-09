// functions/src/access/demo.ts
// Détection serveur d'un compte « démo » (quotas de données) + limites.
// ⚠ Constantes dupliquées de src/features/access/permissions.ts (DEMO_PERMISSION /
// DEMO_LIMITS) et de firestore.rules — tenir les 3 en phase.
import type { Firestore } from 'firebase-admin/firestore'

export const DEMO_PERMISSION = 'demo.view'
export const DEMO_PIM_LIMIT = 50 // défaut si le rôle ne configure pas de limite
export const DEMO_DAM_LIMIT = 20
const OWNER_EMAIL = 'ibs.studio@gmail.com'

export interface DemoLimits { pimRows: number; damAssets: number }

/**
 * Limites du compte démo du caller, ou `null` s'il n'est pas démo. Réplique la logique
 * des permissions effectives (revokes > grants > rôle) côté serveur ; les plafonds
 * proviennent de `roles/{id}.limits` (repli DEMO_PIM_LIMIT/DEMO_DAM_LIMIT). L'owner
 * n'est jamais limité (null).
 */
export async function getDemoLimits(db: Firestore, uid: string, email: string | null): Promise<DemoLimits | null> {
  if (email && email.toLowerCase() === OWNER_EMAIL) return null
  const u = (await db.collection('users').doc(uid).get()).data() ?? {}
  const grants: string[] = Array.isArray(u.accessGrants) ? u.accessGrants : []
  const revokes: string[] = Array.isArray(u.accessRevokes) ? u.accessRevokes : []
  if (revokes.includes(DEMO_PERMISSION)) return null
  const roleId = typeof u.accessRoleId === 'string' ? u.accessRoleId : ''
  const role = roleId ? (await db.collection('roles').doc(roleId).get()).data() : null
  const rolePerms: string[] = Array.isArray(role?.permissions) ? role!.permissions : []
  const isDemo = grants.includes(DEMO_PERMISSION) || rolePerms.includes(DEMO_PERMISSION)
  if (!isDemo) return null
  const limits = (role?.limits ?? {}) as Partial<DemoLimits>
  return {
    pimRows: typeof limits.pimRows === 'number' ? limits.pimRows : DEMO_PIM_LIMIT,
    damAssets: typeof limits.damAssets === 'number' ? limits.damAssets : DEMO_DAM_LIMIT,
  }
}
