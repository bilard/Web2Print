// functions/src/access/demo.ts
// Détection serveur d'un compte « démo » (quotas de données) + limites.
// ⚠ Constantes dupliquées de src/features/access/permissions.ts (DEMO_PERMISSION /
// DEMO_LIMITS) et de firestore.rules — tenir les 3 en phase.
import type { Firestore } from 'firebase-admin/firestore'

export const DEMO_PERMISSION = 'demo.view'
export const DEMO_PIM_LIMIT = 50
export const DEMO_DAM_LIMIT = 20
const OWNER_EMAIL = 'ibs.studio@gmail.com'

/**
 * Le caller est-il un compte démo plafonné ? Réplique la logique des permissions
 * effectives (revokes > grants > rôle) côté serveur. L'owner/admin n'est jamais limité.
 */
export async function isDemoLimited(db: Firestore, uid: string, email: string | null): Promise<boolean> {
  if (email && email.toLowerCase() === OWNER_EMAIL) return false
  const u = (await db.collection('users').doc(uid).get()).data() ?? {}
  const grants: string[] = Array.isArray(u.accessGrants) ? u.accessGrants : []
  const revokes: string[] = Array.isArray(u.accessRevokes) ? u.accessRevokes : []
  if (revokes.includes(DEMO_PERMISSION)) return false
  if (grants.includes(DEMO_PERMISSION)) return true
  const roleId = typeof u.accessRoleId === 'string' ? u.accessRoleId : ''
  if (!roleId) return false
  const perms = (await db.collection('roles').doc(roleId).get()).data()?.permissions
  return Array.isArray(perms) && perms.includes(DEMO_PERMISSION)
}
