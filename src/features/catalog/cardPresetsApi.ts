// src/features/catalog/cardPresetsApi.ts
// Presets de style de fiches ENREGISTRÉS par l'utilisateur : le style COMPLET
// (typo, couleurs, formes, dispositions layout/layoutWide) sous un nom —
// réutilisable sur tous ses catalogues. users/{uid}/catalogCardPresets.
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { stripUndefined } from '@/features/retail-promo/stripUndefined'
import type { CatalogCardStyle } from './catalogTypes'

export interface UserCardPreset {
  id: string
  name: string
  cardStyle: CatalogCardStyle
}

const colPath = (uid: string) => collection(db, 'users', uid, 'catalogCardPresets')

export async function listCardPresets(): Promise<UserCardPreset[]> {
  const uid = auth.currentUser?.uid
  if (!uid) return []
  const snap = await getDocs(colPath(uid))
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id), cardStyle: d.data().cardStyle as CatalogCardStyle }))
    .filter((p) => p.cardStyle)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Upsert par nom (pas de doublon si on ré-enregistre sous le même nom). */
export async function saveCardPreset(name: string, cardStyle: CatalogCardStyle): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non connecté')
  const existing = (await listCardPresets()).find((p) => p.name === name)
  const ref = existing ? doc(db, 'users', uid, 'catalogCardPresets', existing.id) : doc(colPath(uid))
  await setDoc(ref, { ...stripUndefined({ name, cardStyle }), createdAt: serverTimestamp() })
}

export async function deleteCardPreset(id: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return
  await deleteDoc(doc(db, 'users', uid, 'catalogCardPresets', id))
}
