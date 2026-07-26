import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { UsageCounters } from './permissions'

export interface Role {
  id: string
  name: string
  permissions: string[]
  /** Quotas du compte démo (n'a d'effet que si la permission `demo.view` est cochée).
   *  Absent → repli sur DEMO_LIMITS (50/20). */
  limits?: UsageCounters
  createdAt: number
  updatedAt: number
}

export async function listRoles(): Promise<Role[]> {
  const snap = await getDocs(collection(db, 'roles'))
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Role, 'id'>) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Crée ou met à jour un rôle. id absent → nouvel id auto. */
export async function saveRole(role: { id?: string; name: string; permissions: string[]; limits?: UsageCounters }): Promise<string> {
  const id = role.id ?? doc(collection(db, 'roles')).id
  const now = Date.now()
  await setDoc(
    doc(db, 'roles', id),
    { name: role.name.trim(), permissions: role.permissions, updatedAt: now, ...(role.limits ? { limits: role.limits } : {}), ...(role.id ? {} : { createdAt: now }) },
    { merge: true },
  )
  return id
}

export async function deleteRole(id: string): Promise<void> {
  await deleteDoc(doc(db, 'roles', id))
}
