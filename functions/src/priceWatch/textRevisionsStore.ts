// functions/src/priceWatch/textRevisionsStore.ts
// Jumeau SERVEUR de src/features/priceWatch/textRevisionsStore.ts.
//
// ⚠ MÊME collection que le navigateur (`textRevisionsCol`). C'est tout l'intérêt : la
// traduction du cron se relit au matin sur l'écran « Traduire et améliorer les textes »,
// avec son bouton « Annuler » par fiche, et le passage suivant sait ce qui est déjà fait.
// Une collection à part aurait donné deux vérités à réconcilier — et le catalogue serait
// repayé chaque nuit.
import { getFirestore } from 'firebase-admin/firestore'
import { textRevisionsCol } from './paths'

/** Ce qu'on garde d'une réécriture, pour un produit. Forme IDENTIQUE au client. */
export interface TextRevision {
  productId: string
  name?: string
  description?: string
  /** Texte d'origine au moment de CETTE réécriture : c'est lui qui dira, au passage
   *  suivant, si le fournisseur a modifié la fiche depuis. */
  nameSource?: string
  descriptionSource?: string
  note?: string
  at: number
  lang?: string
}

export async function loadTextRevisions(uid: string, watchId: string): Promise<Map<string, TextRevision>> {
  const snap = await getFirestore().collection(textRevisionsCol(uid, watchId)).get()
  return new Map(snap.docs.map((d) => [d.id, { ...(d.data() as TextRevision), productId: d.id }]))
}

export async function saveTextRevisions(
  uid: string, watchId: string, revisions: TextRevision[],
): Promise<void> {
  const db = getFirestore()
  // Firestore plafonne à 500 opérations par lot : on garde de la marge.
  for (let i = 0; i < revisions.length; i += 400) {
    const batch = db.batch()
    for (const r of revisions.slice(i, i + 400)) {
      const { productId, ...rest } = r
      // ⚠ `merge` et non un écrasement : une seconde passe sur la description ne doit pas
      // effacer le nom traduit à la première.
      batch.set(db.doc(`${textRevisionsCol(uid, watchId)}/${productId}`), rest, { merge: true })
    }
    await batch.commit()
  }
}
