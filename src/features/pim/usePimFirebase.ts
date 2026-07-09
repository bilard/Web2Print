import { doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, auth, functions } from '@/lib/firebase/config'
import { useAccessStore } from '@/stores/access.store'
import { DEMO_PERMISSION } from '@/features/access/permissions'
import type { Product, Source } from './types'

const COLLECTION = 'pim_projects'
const PRODUCTS_SUB = 'products'

/** Écriture serveur des produits (comptes démo) — quota infalsifiable, cf. CF pimSaveProducts. */
const pimSaveProductsCF = httpsCallable<{ projectId: string; products: Product[] }, { count: number }>(functions, 'pimSaveProducts')

function requireUser() {
  const u = auth.currentUser
  if (!u) throw new Error('Utilisateur non authentifié')
  return u
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

/** Écrit un lot de products via writeBatch (max 500 par batch Firestore).
 *  Comptes démo : routé par la Cloud Function `pimSaveProducts` (quota serveur
 *  infalsifiable — les rules refusent l'écriture directe des produits). Couvre
 *  aussi bien l'import UI que le nœud workflow `save-pim` (tous deux passent ici). */
export async function saveProducts(projectId: string, products: Product[]): Promise<void> {
  requireUser()
  if (products.length === 0) return
  const acc = useAccessStore.getState()
  if (!acc.isOwner && acc.permissions.has(DEMO_PERMISSION)) {
    // La sérialisation callable (JSON) retire déjà les `undefined` interdits par Firestore.
    await pimSaveProductsCF({ projectId, products })
    return
  }
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

/** Met à jour uniquement les sources d'un projet (sans toucher aux products). */
export async function saveSources(projectId: string, sources: Source[]): Promise<void> {
  requireUser()
  await setDoc(
    doc(db, COLLECTION, projectId),
    stripUndefined({ sources, updatedAt: serverTimestamp() }),
    { merge: true },
  )
}
