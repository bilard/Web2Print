// src/features/catalog/catalogsApi.ts
// CRUD users/{uid}/catalogs — même pattern que promoTemplatesApi (stripUndefined
// à la frontière : un seul undefined ferait rejeter tout le setDoc).
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { stripUndefined } from '@/features/retail-promo/stripUndefined'
import { EMPTY_TREE_EDITS } from './catalogTree'
import { CATALOG_FORMAT_PRESETS, type CatalogDoc } from './catalogTypes'
import type { DataSourceRef } from '@/stores/merge.store'

export interface CatalogSummary { id: string; name: string; updatedAt: Date | null; sourceRef: DataSourceRef | null }

const colPath = (uid: string) => collection(db, 'users', uid, 'catalogs')

export function newCatalogDoc(name: string): CatalogDoc {
  return {
    id: '', name, sourceRef: null, selectedRowIds: [], levelKeys: {}, treeEdits: EMPTY_TREE_EDITS,
    prompt: '', plan: null, fieldMap: {}, fieldMapOverrides: {}, customFields: [], format: CATALOG_FORMAT_PRESETS[0].format,
    coverImageUrl: null, backCoverImageUrl: null, pageOrder: [],
  }
}

export async function listCatalogs(): Promise<CatalogSummary[]> {
  const uid = auth.currentUser?.uid
  if (!uid) return []
  const snap = await getDocs(colPath(uid))
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id), updatedAt: d.data().updatedAt?.toDate?.() ?? null, sourceRef: (d.data().sourceRef ?? null) as DataSourceRef | null }))
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
}

export async function loadCatalog(id: string): Promise<CatalogDoc | null> {
  const uid = auth.currentUser?.uid
  if (!uid) return null
  const snap = await getDoc(doc(db, 'users', uid, 'catalogs', id))
  if (!snap.exists()) return null
  const base = newCatalogDoc('')
  return { ...base, ...(snap.data() as Partial<CatalogDoc>), id: snap.id }
}

/** Upsert : `doc.id` vide → création (retourne le nouvel id). */
export async function saveCatalog(docData: CatalogDoc): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non connecté')
  const ref = docData.id ? doc(db, 'users', uid, 'catalogs', docData.id) : doc(colPath(uid))
  const { id: _omit, ...payload } = docData
  await setDoc(ref, { ...stripUndefined(payload), updatedAt: serverTimestamp() })
  return ref.id
}

export async function deleteCatalog(id: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return
  await deleteDoc(doc(db, 'users', uid, 'catalogs', id))
}
