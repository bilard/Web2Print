// CRUD des modèles promo personnalisés — persistés sous `users/{uid}/promoTemplates`.
// Calqué sur le pattern des modèles de workflow (workflowsApi.ts).
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { PromoLayout } from './promoTypes'

export interface UserPromoTemplate {
  id: string
  name: string
  layout: PromoLayout
  createdAt: number
  updatedAt: number
}

const templateCol = (uid: string) => collection(db, 'users', uid, 'promoTemplates')

export async function listPromoTemplates(uid: string): Promise<UserPromoTemplate[]> {
  const snap = await getDocs(query(templateCol(uid), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserPromoTemplate, 'id'>) }))
}

export async function savePromoTemplate(uid: string, tpl: UserPromoTemplate): Promise<void> {
  await setDoc(doc(templateCol(uid), tpl.id), {
    name: tpl.name,
    layout: tpl.layout,
    createdAt: tpl.createdAt,
    updatedAt: tpl.updatedAt,
  })
}

export async function deletePromoTemplate(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(templateCol(uid), id))
}
