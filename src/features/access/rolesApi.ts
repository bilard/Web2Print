import { collection, doc, getDocs, setDoc, deleteDoc, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'
import type { UsageCounters } from './permissions'

export interface Role {
  id: string
  name: string
  permissions: string[]
  /**
   * Société propriétaire du rôle (`users/{uid}.accountId`). Absent ⇒ `default`.
   *
   * ⚠️ Un rôle appartient à UNE société : « ACHAT » chez Auchan et « ACHAT »
   * chez un autre client sont deux rôles distincts, aux permissions
   * indépendantes. `firestore.rules` interdit de déplacer un rôle d'une société
   * à une autre — ce serait la porte de sortie du cloisonnement.
   */
  accountId: string
  /** Quotas du compte démo (n'a d'effet que si la permission `demo.view` est cochée).
   *  Absent → repli sur DEMO_LIMITS (50/20). */
  limits?: UsageCounters
  createdAt: number
  updatedAt: number
}

/**
 * Rôles d'UNE société. `accountId` omis ⇒ toute la collection (admin global).
 *
 * ⚠️ La requête filtrée n'atteint PAS les rôles dépourvus du champ `accountId`
 * (Firestore les exclut) : les rôles créés avant les sociétés ne remontent donc
 * que dans la vue globale, où on les voit et où on peut les rattacher. Ce n'est
 * pas une perte silencieuse — l'écran Sociétés les signale.
 */
export async function listRoles(accountId?: string): Promise<Role[]> {
  const snap = await getDocs(
    accountId ? query(collection(db, 'roles'), where('accountId', '==', accountId)) : collection(db, 'roles'),
  )
  return snap.docs
    .map((d) => {
      const x = d.data() as Omit<Role, 'id'>
      return { id: d.id, ...x, accountId: x.accountId || DEFAULT_ACCOUNT_ID }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Crée ou met à jour un rôle. id absent → nouvel id auto.
 *  `accountId` est écrit à la CRÉATION seulement : le déplacer d'une société à
 *  l'autre est refusé côté serveur. */
export async function saveRole(role: { id?: string; name: string; permissions: string[]; limits?: UsageCounters; accountId?: string }): Promise<string> {
  const id = role.id ?? doc(collection(db, 'roles')).id
  const now = Date.now()
  await setDoc(
    doc(db, 'roles', id),
    {
      name: role.name.trim(), permissions: role.permissions, updatedAt: now,
      ...(role.limits ? { limits: role.limits } : {}),
      ...(role.id ? {} : { createdAt: now, accountId: role.accountId || DEFAULT_ACCOUNT_ID }),
    },
    { merge: true },
  )
  return id
}

/** Rattache un rôle « orphelin » (antérieur aux sociétés) — admin global. */
export async function moveRoleToCompany(id: string, accountId: string): Promise<void> {
  await setDoc(doc(db, 'roles', id), { accountId, updatedAt: Date.now() }, { merge: true })
}

export async function deleteRole(id: string): Promise<void> {
  await deleteDoc(doc(db, 'roles', id))
}
