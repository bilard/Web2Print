// Une réécriture DÉJÀ ÉCRITE a-t-elle perdu du périmètre ? PUR.
//
// ⚠⚠ La garde d'isopérimètre ne juge que ce qui SORT du modèle. Tout ce qui a été écrit
// avant elle est resté en base tel quel : des listes de compatibilité tronquées par « … »,
// des couples de références constructeur disparus — et « déjà traduite » écartait ces fiches
// de la file POUR TOUJOURS. Elles s'affichaient comme réussies.
//
// On rejuge donc l'existant avec la même garde, et ce qui ne passe plus retourne dans la
// file. C'est le seul chemin de rattrapage : rien d'autre ne distingue une réécriture
// d'avant la garde d'une réécriture d'après.
//
// ⚠ Deux étages, pour le coût. `findViolations` tokenise les deux textes ; sur cent quinze
// mille fiches à chaque changement de filtre, c'est intenable. Un pré-filtre trivial écarte
// d'abord l'immense majorité : une amputation RACCOURCIT le texte ou laisse une marque
// d'élision. Le reste ne mérite pas d'être inspecté.
import { findViolations } from '@/features/textEnrich/protected'
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

/** Marques d'élision — mêmes que celles de la garde. */
const ELISION = /…|\.\.\.|\betc\b|\bet autres\b/i

/**
 * Ce texte MÉRITE-t-il une inspection ?
 *
 * ⚠⚠ La BANDE, et pas seulement « plus court ». Une SYNTHÈSE ASSUMÉE est volontairement
 * beaucoup plus courte — la rejuger fautive la remettrait en file à chaque passage, pour
 * toujours, et la révision publiée ne dit pas sous quel régime elle a été produite. Une
 * amputation, elle, est une perte PARTIELLE : le texte reste du même ordre de grandeur, il
 * lui manque la fin. On n'inspecte donc qu'entre la moitié et les quatre cinquièmes —
 * au-dessus rien n'a été perdu, en dessous c'est un résumé voulu.
 */
function suspect(before: string, after: string): boolean {
  if (ELISION.test(after) && !ELISION.test(before)) return true
  const ratio = after.length / Math.max(1, before.length)
  return ratio >= 0.5 && ratio < 0.8
}

/** Un couple avant/après casse-t-il le périmètre ? */
function broken(before: string, after: string, p: SourceProduct): boolean {
  if (!before.trim() || !after.trim()) return false
  if (!suspect(before, after)) return false
  return findViolations(before, after, {
    refs: [p.ref, p.ref2], eans: [p.ean],
  }).some((v) => v.kind === 'code-lost' || v.kind === 'elision' || v.kind === 'ref-lost')
}

/**
 * Cette révision a-t-elle perdu du périmètre en route ?
 *
 * ⚠ Les colonnes de la carte de workflow portent leur propre avant/après : on les juge une
 * par une. La réécriture faite depuis l'écran, elle, se juge sur le texte d'origine mémorisé
 * — jamais sur le texte courant du catalogue, qui est déjà l'après.
 *
 * ⚠ Une SYNTHÈSE ASSUMÉE ne doit jamais être rejugée fautive : cf. `suspect`, dont la bande
 * la laisse hors de portée.
 */
export function perimeterBroken(p: SourceProduct, revision?: TextRevision): boolean {
  if (!revision) return false
  for (const v of Object.values(revision.byColumn ?? {})) {
    if (broken(v.before, v.after, p)) return true
  }
  const origin = revision.descriptionSource ?? p.descriptionSource
  if (origin && revision.description && broken(origin, revision.description, p)) return true
  return false
}
