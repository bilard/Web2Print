import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// Modèles réutilisables (thème + grille par défaut + style de fiches, SANS données).
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { stripUndefined } from '@/lib/stripUndefined'
import type { CatalogCardStyle, CatalogGrid, CatalogPageStyle, CatalogTheme } from './catalogTypes'
import { t } from '@/lib/i18n'

export interface CatalogTemplate {
  id: string
  name: string
  theme: CatalogTheme
  defaultGrid: CatalogGrid
  /** Style cosmétique des fiches — absent sur les modèles antérieurs. */
  cardStyle?: CatalogCardStyle
  /** Style des éléments de page — absent sur les modèles antérieurs. */
  pageStyle?: CatalogPageStyle
}

const colPath = (uid: string) => collection(db, 'users', uid, 'catalogTemplates')

export async function listCatalogTemplates(): Promise<CatalogTemplate[]> {
  const uid = getWorkspaceUid()
  if (!uid) return []
  const snap = await getDocs(colPath(uid))
  return snap.docs
    .map((d) => ({
      id: d.id, name: String(d.data().name ?? d.id), theme: d.data().theme as CatalogTheme,
      defaultGrid: (d.data().defaultGrid ?? 4) as CatalogGrid,
      cardStyle: d.data().cardStyle as CatalogCardStyle | undefined,
      pageStyle: d.data().pageStyle as CatalogPageStyle | undefined,
    }))
    .filter((t) => t.theme)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Upsert par nom (pas de doublon). */
export async function saveCatalogTemplate(name: string, theme: CatalogTheme, defaultGrid: CatalogGrid, cardStyle?: CatalogCardStyle, pageStyle?: CatalogPageStyle): Promise<void> {
  const uid = getWorkspaceUid()
  if (!uid) throw new Error(t('err.auth.required'))
  const existing = (await listCatalogTemplates()).find((t) => t.name === name)
  const ref = existing ? doc(db, 'users', uid, 'catalogTemplates', existing.id) : doc(colPath(uid))
  await setDoc(ref, { ...stripUndefined({ name, theme, defaultGrid, cardStyle, pageStyle }), createdAt: serverTimestamp() })
}

export async function deleteCatalogTemplate(id: string): Promise<void> {
  const uid = getWorkspaceUid()
  if (!uid) return
  await deleteDoc(doc(db, 'users', uid, 'catalogTemplates', id))
}
