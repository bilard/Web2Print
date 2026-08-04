import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { PromoTemplateConfig } from './promoCardTypes'
import { stripUndefined } from '@/lib/stripUndefined'

export interface UserPromoTemplate {
  id: string
  name: string
  config: PromoTemplateConfig
}

const colPath = (uid: string) => collection(db, 'users', uid, 'promoTemplates')

/** Liste les modèles d'habillage de l'utilisateur (triés par nom). */
export async function listPromoTemplates(): Promise<UserPromoTemplate[]> {
  const uid = getWorkspaceUid()
  if (!uid) return []
  const snap = await getDocs(colPath(uid))
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id), config: d.data().config as PromoTemplateConfig }))
    .filter((t) => t.config)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Enregistre l'habillage courant comme modèle réutilisable (upsert par nom → pas de doublon). */
export async function savePromoTemplate(name: string, config: PromoTemplateConfig): Promise<void> {
  const uid = getWorkspaceUid()
  if (!uid) throw new Error('Non connecté')
  const existing = (await listPromoTemplates()).find((t) => t.name === name)
  const ref = existing ? doc(db, 'users', uid, 'promoTemplates', existing.id) : doc(colPath(uid))
  // stripUndefined : un style remis par défaut (fontFamily/fontWeight undefined)
  // ferait rejeter tout le setDoc par Firestore → modèle jamais enregistré.
  await setDoc(ref, { ...stripUndefined({ name, config }), createdAt: serverTimestamp() })
}

export async function deletePromoTemplate(id: string): Promise<void> {
  const uid = getWorkspaceUid()
  if (!uid) return
  await deleteDoc(doc(db, 'users', uid, 'promoTemplates', id))
}
