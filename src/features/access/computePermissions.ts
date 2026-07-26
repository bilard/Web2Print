import { ADMIN_PERMISSION, ALL_PERMISSION_KEYS } from './permissions'

export interface EffectiveInput {
  isOwner: boolean
  rolePermissions: string[] | null
  grants: string[]
  revokes: string[]
}

/** Permissions effectives = (rôle ∪ grants) − revokes. Owner = court-circuit (tout). */
export function computeEffectivePermissions(input: EffectiveInput): Set<string> {
  if (input.isOwner) return new Set([ADMIN_PERMISSION, ...ALL_PERMISSION_KEYS])
  const set = new Set(input.rolePermissions ?? [])
  for (const g of input.grants) set.add(g)
  for (const r of input.revokes) set.delete(r)
  return set
}

/** Connecté mais sans accès : non-owner et aucun rôle assigné. */
export function isPending(input: { isOwner: boolean; accessRoleId: string | null }): boolean {
  return !input.isOwner && !input.accessRoleId
}
