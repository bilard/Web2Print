// Une fiche a-t-elle été réécrite AILLEURS que par cet écran ? PUR.
//
// ⚠⚠ Un produit peut porter une réécriture sans qu'aucun document de révision ne le dise.
// La carte « Enrichir les textes » travaille sur une FEUILLE : elle pose l'original dans une
// colonne jumelle « <colonne> (source) » et ne persiste rien d'autre. « Comparer catalogue »
// recopie ensuite le texte enrichi dans le catalogue, et les deux colonnes arrivent ici
// (`nameSource`, `descriptionSource`). L'écran, lui, ne regardait que la collection des
// révisions : il annonçait « pas encore traduit » sur une fiche dont il affichait la
// traduction française, avec une pastille « NL » à côté.
//
// ⚠ On ne fabrique PAS une fausse `TextRevision` pour autant : `changedFields` la verrait
// périmée à chaque passage, « Annuler » supprimerait un document qui n'existe pas, et la
// date affichée serait inventée. Le fait vit sur la LIGNE de l'écran, là où il est vrai.
import type { SourceProduct } from '../catalog/match'
import type { RevisionOps } from './revisionOps'

/** Deux textes disent-ils la même chose ? Espaces et casse ne font pas une réécriture. */
function same(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

/**
 * La feuille porte-t-elle la trace d'une réécriture de cette fiche ?
 *
 * ⚠ Un original IDENTIQUE au texte courant ne compte pas : la colonne jumelle existe, mais
 * rien n'a changé — annoncer « traité » ferait sortir de la file une fiche jamais traduite.
 */
export function rewrittenInSheet(p: SourceProduct): boolean {
  return (!!p.nameSource && !same(p.nameSource, p.name))
    || (!!p.descriptionSource && !same(p.descriptionSource, p.description))
}

/**
 * Ce qu'on peut DÉDUIRE d'une réécriture venue de la feuille, faute de champ `ops`.
 *
 * Même lecture que `opsOf` sur les révisions antérieures à ce champ : un original en langue
 * étrangère aujourd'hui réécrit a été traduit. Faute de langue tranchée, on ne conclut rien
 * — et la fiche reste à traiter, ce qui est le bon défaut : elle sera resoumise, pas perdue.
 */
export function sheetOps(lang: string | null): RevisionOps {
  return { translate: !!lang && lang !== 'fr', improve: false }
}
