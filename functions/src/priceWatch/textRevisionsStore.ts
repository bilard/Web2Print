// functions/src/priceWatch/textRevisionsStore.ts
// Écriture des textes réécrits par le CRON — jumeau SERVEUR (admin SDK) de
// `savePublishedRevisions` (src/features/priceWatch/textRevisionsStore.ts).
//
// ⚠ La FORME écrite doit rester identique au client : l'écran « Traduire et améliorer les
// textes » relit indistinctement ce que le navigateur et ce que le cron ont posé. Un champ
// nommé autrement ici, et le travail de la nuit ne s'affiche nulle part — sans erreur, ce
// qui est le pire des cas.
import { getFirestore, FieldPath } from 'firebase-admin/firestore'
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
      // ⚠⚠ `merge: true` NE FUSIONNE PAS UNE MAP IMBRIQUÉE. Il fusionne les champs de
      // PREMIER NIVEAU : passer `byColumn` en bloc REMPLACE la map entière, colonnes
      // absentes comprises. Le commentaire d'origine promettait le contraire.
      //
      // Cas VÉCU, mesuré le 2026-08-12 : les fiches portaient depuis la veille
      // « DESCRIPTION » ET « TEXT_VENTE » traduits. Une passe repartie sur la seule
      // description a republié `byColumn: { DESCRIPTION }` — et les textes de vente de TOUT
      // le catalogue ont disparu de l'écran, sans une erreur, sans un log. Le travail était
      // perdu, pas caché : rien ne le remettait dans la file, puisque la mémoire
      // d'enrichissement le savait toujours fait.
      //
      // `mergeFields` avec un `FieldPath` par colonne ne touche QUE les colonnes
      // republiées. Un FieldPath plutôt qu'une chaîne pointée : un nom de colonne
      // contenant un point (« Réf. origine ») serait sinon lu comme deux niveaux.
      const cols = Object.keys(r.byColumn ?? {})
      batch.set(
        db.doc(`${col}/${stableId(r.key)}`),
        { byColumn: r.byColumn, ops: r.ops, at: r.at },
        { mergeFields: ['ops', 'at', ...cols.map((c) => new FieldPath('byColumn', c))] },
      )
    }
    await batch.commit()
  }
}
