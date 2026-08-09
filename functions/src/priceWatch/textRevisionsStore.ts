// functions/src/priceWatch/textRevisionsStore.ts
// Écriture des textes réécrits par le CRON — jumeau SERVEUR (admin SDK) de
// `savePublishedRevisions` (src/features/priceWatch/textRevisionsStore.ts).
//
// ⚠ La FORME écrite doit rester identique au client : l'écran « Traduire et améliorer les
// textes » relit indistinctement ce que le navigateur et ce que le cron ont posé. Un champ
// nommé autrement ici, et le travail de la nuit ne s'affiche nulle part — sans erreur, ce
// qui est le pire des cas.
import { getFirestore } from 'firebase-admin/firestore'
import { stableId } from './helpers'
import { textRevisionsCol } from './paths'

export async function savePublishedRevisions(
  uid: string, watchId: string,
  revisions: {
    key: string
    byColumn: Record<string, { before: string; after: string; note?: string }>
    ops: { translate?: boolean; improve?: boolean }
    at: number
  }[],
): Promise<void> {
  const db = getFirestore()
  const col = textRevisionsCol(uid, watchId)
  // Firestore plafonne à 500 opérations par lot : on garde de la marge.
  for (let i = 0; i < revisions.length; i += 400) {
    const batch = db.batch()
    for (const r of revisions.slice(i, i + 400)) {
      // ⚠ `merge` : la fiche porte peut-être une réécriture faite à la main sur un autre
      // champ, qu'un écrasement ferait disparaître sans un mot.
      batch.set(
        db.doc(`${col}/${stableId(r.key)}`),
        { byColumn: r.byColumn, ops: r.ops, at: r.at },
        { merge: true },
      )
    }
    await batch.commit()
  }
}
