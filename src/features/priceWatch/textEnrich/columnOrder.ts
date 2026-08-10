// Dans quel ORDRE lire les colonnes réécrites par la carte de workflow. PUR.
//
// ⚠ Elles arrivaient dans l'ordre où Firestore rend la carte — donc « TEXT_VENTE » avant
// « DESCRIPTION » sur une fiche et l'inverse sur la suivante. Or juste au-dessus, l'écran
// affiche déjà « Nom » puis « Texte de vente » : deux paires des mêmes champs, dans deux
// ordres, sur la même ligne.
//
// ⚠ Pas d'ordre alphabétique : « DESCRIPTION avant TEXT_VENTE » ne tient que par la
// coïncidence de ces noms-là. On lit la DONNÉE — la colonne dont le texte est le nom du
// produit passe devant, puis celle qui porte l'argumentaire, puis le reste dans son ordre
// d'arrivée. C'est le même ordre que la paire du dessus, et il ne dépend d'aucun libellé.
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

type Column = [string, NonNullable<TextRevision['byColumn']>[string]]

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

/** 0 = cette colonne porte le nom du produit, 1 = son texte de vente, 2 = on ne sait pas. */
function rank(col: Column, p: SourceProduct): number {
  const seen = [norm(col[1].before), norm(col[1].after)]
  if (seen.includes(norm(p.nameSource ?? p.name)) || seen.includes(norm(p.name))) return 0
  if (norm(p.description) && (seen.includes(norm(p.descriptionSource ?? p.description))
    || seen.includes(norm(p.description)))) return 1
  return 2
}

/** Les colonnes réécrites, du libellé vers l'argumentaire. Ordre STABLE à rang égal. */
export function orderColumns(cols: Column[], p: SourceProduct): Column[] {
  return cols
    .map((c, i) => ({ c, i, r: rank(c, p) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c)
}
