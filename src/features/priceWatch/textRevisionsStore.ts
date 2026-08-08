// Lecture et écriture des textes réécrits d'un suivi. Adaptateur Firestore FIN.
import { collection, doc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { textRevisionsCol } from './paths'

/** Ce qu'on garde d'une réécriture, pour un produit. */
export interface TextRevision {
  productId: string
  /** Textes retenus. Absents = le champ n'a pas été traité. */
  name?: string
  description?: string
  /** Textes d'origine, capturés à la PREMIÈRE réécriture et jamais réécrits ensuite :
   *  c'est vers eux que le retour arrière doit ramener, pas vers la passe précédente. */
  nameSource?: string
  descriptionSource?: string
  /** Ce que le modèle dit avoir changé. */
  note?: string
  at: number
  lang?: string
}

export async function loadTextRevisions(uid: string, watchId: string): Promise<Map<string, TextRevision>> {
  const snap = await getDocs(collection(db, textRevisionsCol(uid, watchId)))
  return new Map(snap.docs.map((d) => [d.id, { ...(d.data() as TextRevision), productId: d.id }]))
}

export async function saveTextRevisions(
  uid: string, watchId: string, revisions: TextRevision[],
): Promise<void> {
  // Firestore plafonne à 500 opérations par lot : on garde de la marge.
  for (let i = 0; i < revisions.length; i += 400) {
    const batch = writeBatch(db)
    for (const r of revisions.slice(i, i + 400)) {
      const { productId, ...rest } = r
      // ⚠ `merge` et non un écrasement : une seconde passe sur la description ne doit pas
      // effacer le nom traduit à la première, ni surtout son original.
      batch.set(doc(db, textRevisionsCol(uid, watchId), productId), rest, { merge: true })
    }
    await batch.commit()
  }
}

/** Annule la réécriture d'un produit : la fiche redevient celle du catalogue. */
export async function dropTextRevision(uid: string, watchId: string, productId: string): Promise<void> {
  await deleteDoc(doc(db, textRevisionsCol(uid, watchId), productId))
}
