// Lecture et écriture des textes réécrits d'un suivi. Adaptateur Firestore FIN.
import { collection, doc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { textRevisionsCol } from './paths'
import { stableId } from './core'

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
  /**
   * Ce qui a été demandé sur cette fiche. Sans lui, l'écran ne peut pas dire ce qu'il
   * montre : « traduit » et « réécrit » se lisent pareil dans la colonne APRÈS, alors
   * qu'on ne les relit pas de la même façon — une traduction se vérifie, une réécriture
   * se juge.
   *
   * ⚠ Absent sur les fiches d'avant ce champ : elles s'affichent « traité », sans plus.
   * Les ranger d'office en « traduit » serait une invention.
   */
  ops?: { translate?: boolean; improve?: boolean }
  /**
   * Ce que la CARTE de workflow a réécrit, colonne par colonne.
   *
   * ⚠ Par COLONNE et non rangé dans `name`/`description` : la carte travaille sur une
   * feuille dont elle ne sait pas laquelle de ses colonnes deviendra le nom du produit et
   * laquelle son texte de vente — ce mappage-là vit sur « Comparer catalogue ». Deviner
   * poserait un jour la traduction du libellé dans la description. L'écran affiche donc la
   * colonne telle qu'elle s'appelle dans le fichier, ce qui se lit très bien.
   */
  byColumn?: Record<string, { before: string; after: string; note?: string }>
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

/**
 * Écrit ce qu'une CARTE de workflow a réécrit, clefé comme le catalogue.
 *
 * ⚠ `stableId(référence)` reproduit exactement l'identifiant que « Comparer catalogue »
 * donne au produit (`stableId(ref ?? ean ?? nom)`) : c'est ce qui permet à l'écran de
 * retrouver le texte sans aucune table de correspondance.
 */
export async function savePublishedRevisions(
  uid: string, watchId: string,
  revisions: { key: string; byColumn: TextRevision['byColumn']; ops: TextRevision['ops']; at: number }[],
): Promise<void> {
  for (let i = 0; i < revisions.length; i += 400) {
    const batch = writeBatch(db)
    for (const r of revisions.slice(i, i + 400)) {
      // ⚠⚠ `merge: true` NE FUSIONNE PAS UNE MAP IMBRIQUÉE. Il fusionne les champs de
      // PREMIER NIVEAU : passer `byColumn` en bloc REMPLACE la map entière, colonnes
      // absentes comprises. Le commentaire d'origine promettait le contraire.
      //
      // Cas VÉCU, mesuré le 2026-08-12 : les fiches portaient depuis la veille
      // « DESCRIPTION » ET « TEXT_VENTE » traduits. Une passe repartie sur la seule
      // description a republié `byColumn: { DESCRIPTION }` — et les textes de vente de
      // TOUT le catalogue ont disparu de l'écran, sans une erreur, sans un log. Le travail
      // était perdu, pas caché : rien ne le remettait dans la file, puisque la mémoire
      // d'enrichissement, elle, le savait toujours fait.
      //
      // Les chemins de champs (`byColumn.<colonne>`) ne touchent QUE les colonnes
      // republiées. `FieldPath` plutôt qu'une chaîne pointée : un nom de colonne contenant
      // un point (« Réf. origine ») serait sinon lu comme deux niveaux.
      const path = doc(db, textRevisionsCol(uid, watchId), stableId(r.key))
      const patch: Record<string, unknown> = { ops: r.ops, at: r.at }
      for (const [col, v] of Object.entries(r.byColumn ?? {})) patch[`byColumn.${col}`] = v
      // `setDoc` n'interprète pas les clés pointées ; `updateDoc` si — mais il exige que le
      // document existe. On sème donc la map vide d'abord (sans écraser l'existante), puis
      // on applique les colonnes une à une.
      batch.set(path, { byColumn: {}, ops: r.ops, at: r.at }, { merge: true })
      batch.update(path, patch)
    }
    await batch.commit()
  }
}

/** Annule la réécriture d'un produit : la fiche redevient celle du catalogue. */
export async function dropTextRevision(uid: string, watchId: string, productId: string): Promise<void> {
  await deleteDoc(doc(db, textRevisionsCol(uid, watchId), productId))
}
