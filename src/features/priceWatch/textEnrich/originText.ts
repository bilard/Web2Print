// Le texte D'ORIGINE d'une fiche, celui sur lequel la langue se détecte. PUR.
//
// ⚠ Une fois la fiche traduite, le catalogue porte du français : le détecteur répond « fr »
// et la fiche sort de « langue étrangère reconnue ». Conséquences observées à l'écran :
// « Traduits » ne montrait RIEN (chaque fiche traduite tombait hors de la portée), et les
// pastilles « DE 10 929 » fondaient à mesure du travail — alors que ces fiches SONT
// allemandes, c'est même la seule raison pour laquelle on les regarde.
//
// L'original survit à trois endroits, selon le chemin emprunté : les colonnes jumelles
// « (source) » de la feuille, la réécriture faite depuis l'écran, celle publiée par la
// carte de workflow. On prend le premier qui répond.
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

export function originTextOf(p: SourceProduct, revision?: TextRevision): string {
  // ⚠ Le plus LONG des avants, pas le premier : la langue se tranche sur l'argumentaire,
  // pas sur un libellé de trois mots — c'est tout le propos de `detectLanguage`.
  const fromColumns = Object.values(revision?.byColumn ?? {})
    .map((v) => v.before)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0]
  return p.descriptionSource
    ?? revision?.descriptionSource
    ?? fromColumns
    ?? p.nameSource
    ?? revision?.nameSource
    ?? p.description
    ?? p.name
}
