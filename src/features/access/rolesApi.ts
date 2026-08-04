import { collection, doc, getDocs, setDoc, deleteDoc, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'
import type { UsageCounters } from './permissions'

export interface Role {
  id: string
  name: string
  permissions: string[]
  /**
   * Sociétés où ce rôle est proposable. Vide ⇒ `['default']`.
   *
   * ⚠️ Un rôle peut servir à PLUSIEURS sociétés (un « ACHAT » commun), d'où un
   * tableau et non une chaîne. Le champ legacy `accountId` (une seule société)
   * est encore lu et normalisé ici — les rôles créés avant ne se perdent pas.
   *
   * `firestore.rules` interdit à un administrateur d'entreprise de toucher aux
   * sociétés d'un rôle : il ne peut écrire que `[sa propre société]`, sinon il
   * rendrait ses rôles attribuables chez un tiers.
   */
  accountIds: string[]
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
    accountId
      ? query(collection(db, 'roles'), where('accountIds', 'array-contains', accountId))
      : collection(db, 'roles'),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Role, 'id'>), accountIds: roleAccounts(d.data()) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Sociétés d'un doc rôle, champ legacy `accountId` compris. Jamais vide. */
export function roleAccounts(data: Record<string, unknown> | undefined): string[] {
  const list = data?.accountIds
  if (Array.isArray(list) && list.length > 0) return list as string[]
  const single = data?.accountId
  return typeof single === 'string' && single !== '' ? [single] : [DEFAULT_ACCOUNT_ID]
}

/** Crée ou met à jour un rôle. id absent → nouvel id auto.
 *  Les sociétés ne sont écrites qu'à la CRÉATION : les changer ensuite passe par
 *  `setRoleCompanies`, refusé côté serveur à un administrateur d'entreprise. */
export async function saveRole(role: { id?: string; name: string; permissions: string[]; limits?: UsageCounters; accountIds?: string[] }): Promise<string> {
  const id = role.id ?? doc(collection(db, 'roles')).id
  const now = Date.now()
  const accounts = role.accountIds?.length ? role.accountIds : [DEFAULT_ACCOUNT_ID]
  await setDoc(
    doc(db, 'roles', id),
    {
      name: role.name.trim(), permissions: role.permissions, updatedAt: now,
      ...(role.limits ? { limits: role.limits } : {}),
      ...(role.id ? {} : { createdAt: now, accountIds: accounts }),
    },
    { merge: true },
  )
  return id
}

/**
 * Redéfinit les sociétés d'un rôle — admin global.
 *
 * ⚠️ Écrit aussi `accountId` pour rester lisible par une version antérieure du
 * client restée ouverte dans un onglet : sans ça, un rôle multi-sociétés lui
 * apparaîtrait dans « default » le temps qu'elle recharge.
 */
export async function setRoleCompanies(id: string, accountIds: string[]): Promise<void> {
  const list = accountIds.length ? accountIds : [DEFAULT_ACCOUNT_ID]
  await setDoc(
    doc(db, 'roles', id),
    { accountIds: list, accountId: list[0], updatedAt: Date.now() },
    { merge: true },
  )
}

export async function deleteRole(id: string): Promise<void> {
  await deleteDoc(doc(db, 'roles', id))
}
