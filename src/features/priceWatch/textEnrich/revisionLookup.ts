// Retrouver la réécriture d'un produit, quelle que soit la main qui l'a écrite. PUR.
//
// ⚠ Deux chemins écrivent dans la même collection, et pas tout à fait sous la même clé :
//
//   • depuis l'ÉCRAN, on tient le produit du catalogue : la clé est son identifiant, tel
//     que « Comparer catalogue » l'a posé — `stableId(référence ?? code-barres ?? nom)` ;
//   • depuis la CARTE de workflow, on ne tient qu'une ligne de feuille : la clé est
//     `stableId(référence ?? code-barres)`, sans le repli sur le nom, que la carte ne
//     saurait pas reproduire à l'identique.
//
// Dans le cas normal — un catalogue dont les produits portent une référence — les deux
// donnent LA MÊME chaîne, et il n'y a rien à réconcilier. Le repli existe pour les autres :
// une colonne de référence mal mappée d'un côté fait retomber l'identité sur le
// code-barres, et la révision serait introuvable alors qu'elle est bien là. On essaie donc
// les trois clés dans l'ordre du plus sûr au moins sûr.
//
// ⚠ Une clé qui ne rencontre rien ne rend RIEN — jamais la révision d'un autre produit :
// `stableId` d'une chaîne différente ne tombe pas sur un document existant.
import { stableId } from '../core'

/** Ce qu'il faut d'un produit pour le retrouver. */
export interface RevisionSubject {
  id: string
  ref?: string
  ean?: string
}

/** L'identifiant de document sous lequel la réécriture a été rangée, s'il en existe une. */
export function revisionKeyOf(
  revisions: ReadonlyMap<string, unknown>,
  p: RevisionSubject,
): string | undefined {
  const candidates = [p.id, ...(p.ref ? [stableId(p.ref)] : []), ...(p.ean ? [stableId(p.ean)] : [])]
  return candidates.find((k) => revisions.has(k))
}
