// src/features/catalog/catalogTemplatesApi.ts
// Modèles réutilisables (thème + grille par défaut + style de fiches, SANS données).
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { stripUndefined } from '@/features/retail-promo/stripUndefined'
import type { CatalogCardStyle, CatalogGrid, CatalogTheme } from './catalogTypes'

export interface CatalogTemplate {
  id: string
  name: string
  theme: CatalogTheme
  defaultGrid: CatalogGrid
  /** Style cosmétique des fiches — absent sur les modèles antérieurs. */
  cardStyle?: CatalogCardStyle
}

const colPath = (uid: string) => collection(db, 'users', uid, 'catalogTemplates')

export async function listCatalogTemplates(): Promise<CatalogTemplate[]> {
  const uid = auth.currentUser?.uid
  if (!uid) return []
  const snap = await getDocs(colPath(uid))
  return snap.docs
    .map((d) => ({
      id: d.id, name: String(d.data().name ?? d.id), theme: d.data().theme as CatalogTheme,
      defaultGrid: (d.data().defaultGrid ?? 4) as CatalogGrid,
      cardStyle: d.data().cardStyle as CatalogCardStyle | undefined,
    }))
    .filter((t) => t.theme)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Upsert par nom (pas de doublon). */
export async function saveCatalogTemplate(name: string, theme: CatalogTheme, defaultGrid: CatalogGrid, cardStyle?: CatalogCardStyle): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non connecté')
  const existing = (await listCatalogTemplates()).find((t) => t.name === name)
  const ref = existing ? doc(db, 'users', uid, 'catalogTemplates', existing.id) : doc(colPath(uid))
  await setDoc(ref, { ...stripUndefined({ name, theme, defaultGrid, cardStyle }), createdAt: serverTimestamp() })
}

export async function deleteCatalogTemplate(id: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return
  await deleteDoc(doc(db, 'users', uid, 'catalogTemplates', id))
}
