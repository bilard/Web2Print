import {
  collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import type { Project, Product, Source } from './types'

const COLLECTION = 'pim_projects'
const PRODUCTS_SUB = 'products'

function requireUser() {
  const u = auth.currentUser
  if (!u) throw new Error('Utilisateur non authentifié')
  return u
}

/** Charge tous les projets de l'utilisateur (header + sources, sans products). */
export async function listProjects(): Promise<Project[]> {
  const user = requireUser()
  const q = query(collection(db, COLLECTION), where('userId', '==', user.uid))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name,
      path: data.path ?? [],
      taxonomyLevels: data.taxonomyLevels ?? undefined,
      taxonomy: data.taxonomy ?? [],
      sources: data.sources ?? [],
      createdAt: data.createdAt?.toMillis?.() ?? 0,
      updatedAt: data.updatedAt?.toMillis?.() ?? 0,
    }
  })
}

/** Charge le détail d'un projet (sans products). */
export async function loadProject(projectId: string): Promise<Project | null> {
  requireUser()
  const ref = doc(db, COLLECTION, projectId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: snap.id,
    name: data.name,
    path: data.path ?? [],
    taxonomyLevels: data.taxonomyLevels ?? undefined,
    taxonomy: data.taxonomy ?? [],
    sources: data.sources ?? [],
    createdAt: data.createdAt?.toMillis?.() ?? 0,
    updatedAt: data.updatedAt?.toMillis?.() ?? 0,
  }
}

/** Crée ou met à jour le header projet (pas les products). */
export async function saveProjectHeader(project: Project): Promise<void> {
  const user = requireUser()
  const ref = doc(db, COLLECTION, project.id)
  await setDoc(
    ref,
    stripUndefined({
      userId: user.uid,
      name: project.name,
      path: project.path,
      taxonomyLevels: project.taxonomyLevels ?? null,
      taxonomy: project.taxonomy,
      sources: project.sources,
      updatedAt: serverTimestamp(),
      createdAt: project.createdAt ? new Date(project.createdAt) : serverTimestamp(),
    }),
    { merge: true },
  )
}

export async function deleteProject(projectId: string): Promise<void> {
  requireUser()
  // Note : Firestore ne cascade pas. La sub-collection est purgée ici via batch.
  const productsCol = collection(db, COLLECTION, projectId, PRODUCTS_SUB)
  const productsSnap = await getDocs(productsCol)
  const batch = writeBatch(db)
  productsSnap.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(db, COLLECTION, projectId))
  await batch.commit()
}

/** Charge les products d'un projet. Pagination simple par limite ; si besoin
 *  réel de pagination, ajouter cursor + orderBy plus tard. */
export async function loadProducts(projectId: string): Promise<Product[]> {
  requireUser()
  const productsCol = collection(db, COLLECTION, projectId, PRODUCTS_SUB)
  const snap = await getDocs(productsCol)
  return snap.docs.map((d) => d.data() as Product)
}

/** Récursivement retire les clés à valeur `undefined` (Firestore les rejette).
 *  Préserve `null`, arrays, objets imbriqués. Ne traverse pas les Date / Timestamp. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

/** Écrit un lot de products via writeBatch (max 500 par batch Firestore). */
export async function saveProducts(projectId: string, products: Product[]): Promise<void> {
  requireUser()
  const chunks: Product[][] = []
  for (let i = 0; i < products.length; i += 400) chunks.push(products.slice(i, i + 400))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach((p) => {
      const ref = doc(db, COLLECTION, projectId, PRODUCTS_SUB, p._id)
      batch.set(ref, stripUndefined(p), { merge: true })
    })
    await batch.commit()
  }
}

export async function deleteProductsByIds(projectId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  requireUser()
  const batch = writeBatch(db)
  ids.forEach((id) => batch.delete(doc(db, COLLECTION, projectId, PRODUCTS_SUB, id)))
  await batch.commit()
}

/** Met à jour uniquement les sources d'un projet (sans toucher aux products). */
export async function saveSources(projectId: string, sources: Source[]): Promise<void> {
  requireUser()
  await setDoc(
    doc(db, COLLECTION, projectId),
    stripUndefined({ sources, updatedAt: serverTimestamp() }),
    { merge: true },
  )
}
