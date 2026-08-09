// Ce que la carte « Enrichir les textes » publie POUR L'ÉCRAN de relecture. PUR.
//
// ⚠ En mode feuille, la carte ne laissait AUCUNE trace lisible : la feuille traversait le
// graphe, le catalogue était réécrit par « Comparer catalogue », et l'écran « Traduire et
// améliorer les textes » ne montrait que ce qu'on avait fait à la main. Le cron pouvait
// traduire dix mille fiches sans que rien ne le montre nulle part.
//
// ⚠⚠ LA CLÉ EST CELLE DU CATALOGUE, et ce n'est pas un hasard : « Comparer catalogue »
// identifie ses produits par `stableId(référence ?? code-barres ?? nom)` et `memoryKey`
// rend exactement la même référence, dans le même ordre, après le même `trim`. Les deux
// chemins retombent donc sur le MÊME identifiant, et il n'y a aucune réconciliation à
// faire : la carte écrit dans la collection que l'écran lit déjà. Le jour où les colonnes
// de référence des deux cartes divergent, les révisions deviennent introuvables — jamais
// posées sur le mauvais produit (`stableId` d'une autre chaîne ne rencontre rien).
import { memoryKey, type MemoryRow } from './sheetMemory'

/** Un texte réécrit, tel que le moteur le rend au fil des vagues. */
export interface RevisionEvent {
  row: MemoryRow
  /** Colonne de la feuille — c'est elle qu'on affiche, telle quelle. */
  field: string
  /** Nature du travail (`translate`, `improve`, `structure`…). */
  kind: string
  before: string
  after: string
  note?: string
}

/** Une fiche révisée, prête à écrire. Une par produit, quel que soit le nombre de colonnes. */
export interface PublishedRevision {
  /** Référence article (à défaut le code-barres), telle quelle : c'est l'appelant qui la
   *  canonicalise en identifiant de document. */
  key: string
  byColumn: Record<string, { before: string; after: string; note?: string }>
  /** Ce qui a été demandé, pour les pastilles « Traduit » / « Amélioré ». Déduit des
   *  natures qui ont RÉELLEMENT produit un texte sur cette fiche, jamais de la config :
   *  une carte réglée pour traduire ET améliorer n'améliore pas forcément chaque ligne. */
  ops: { translate?: boolean; improve?: boolean }
  at: number
}

/**
 * Regroupe les textes réécrits par produit.
 *
 * ⚠ Sur deux vagues (traduire puis améliorer), une même colonne revient deux fois : on
 * garde l'AVANT de la première et l'APRÈS de la dernière. Garder l'avant de la seconde
 * afficherait la traduction comme texte d'origine — l'allemand aurait disparu de la
 * comparaison, alors que c'est lui qu'on veut relire.
 */
export function buildPublishedRevisions(
  events: RevisionEvent[],
  keyCols: { ref?: string; ean?: string },
  at: number,
): PublishedRevision[] {
  const out = new Map<string, PublishedRevision>()
  for (const e of events) {
    const key = memoryKey(e.row, keyCols)
    // Sans référence, la fiche n'est pas reconnaissable : l'écran ne saurait pas à quel
    // produit rattacher le texte. Écrite sous une clé inventée, elle serait invisible au
    // mieux, posée ailleurs au pire.
    if (!key) continue
    let entry = out.get(key)
    if (!entry) {
      entry = { key, byColumn: {}, ops: {}, at }
      out.set(key, entry)
    }
    const seen = entry.byColumn[e.field]
    entry.byColumn[e.field] = {
      before: seen ? seen.before : e.before,
      after: e.after,
      // Firestore refuse `undefined` : la note n'est posée que si elle existe.
      ...(e.note ? { note: e.note } : seen?.note ? { note: seen.note } : {}),
    }
    if (e.kind === 'translate') entry.ops.translate = true
    else entry.ops.improve = true
  }
  return [...out.values()]
}
