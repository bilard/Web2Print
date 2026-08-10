// Le texte de vente ENTIER d'une fiche, quand celui du catalogue a été coupé. PUR.
//
// ⚠⚠ Le catalogue source enregistre la description sous un plafond (`DESCRIPTION_MAX`) et
// marque la coupe d'une ellipse finale. Une fiche écrite avant que ce plafond ne soit levé
// porte donc un argumentaire amputé — et l'écran le donnait TEL QUEL au modèle : la
// réécriture reproduisait la coupe, et chaque nouveau passage la reproduisait encore, sans
// que rien ne le dise. C'est ce qu'on voyait à l'écran : « …, Revolution 2300 (single
// line), R… », alors que le texte entier cite encore trois modèles et six références.
//
// Le texte entier survit pourtant ailleurs dès que la carte de workflow est passée :
// `byColumn[*].before` porte la CELLULE de la feuille, sans plafond. On le retrouve donc
// au lieu d'attendre un passage de « Comparer catalogue ».
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

/** Un texte coupé à l'enregistrement se reconnaît à son ellipse finale. */
export function isTruncated(s: string | null | undefined): boolean {
  return !!s && s.trimEnd().endsWith('…')
}

/**
 * Le texte d'ORIGINE le plus complet connu pour cette fiche.
 *
 * ⚠ Des textes d'origine UNIQUEMENT — jamais une réécriture. Un texte coupé affiché dans la
 * colonne APRÈS est une traduction : le remplacer par l'original allemand entier mettrait
 * l'avant à droite. Une réécriture amputée ne se répare pas à l'affichage, elle se refait.
 */
export function completeOriginText(p: SourceProduct, revision?: TextRevision): string | undefined {
  return [
    p.description, p.descriptionSource, revision?.descriptionSource,
    ...Object.values(revision?.byColumn ?? {}).map((v) => v.before),
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '' && !isTruncated(v))
    .sort((a, b) => b.length - a.length)[0]
}

/**
 * Ce qu'il faut AFFICHER comme texte d'origine, et si ce qu'on affiche reste coupé.
 *
 * `truncated` vrai = plus rien à tenter ici : seul un passage de « Comparer catalogue »
 * ramènera l'argumentaire entier dans le catalogue.
 */
export function originForDisplay(
  p: SourceProduct, revision?: TextRevision,
): { text?: string; truncated: boolean } {
  const shown = p.description
  if (!isTruncated(shown)) return { ...(shown ? { text: shown } : {}), truncated: false }
  const whole = completeOriginText(p, revision)
  if (whole) return { text: whole, truncated: false }
  return { ...(shown ? { text: shown } : {}), truncated: true }
}

/**
 * Cette réécriture a-t-elle été faite sur un texte coupé, alors que le texte entier est
 * désormais disponible ? Elle doit alors repasser : c'est la seule façon de rattraper une
 * amputation déjà écrite.
 *
 * ⚠ Faux quand aucun texte entier n'existe : sans lui, la refaire donnerait exactement le
 * même résultat amputé, en repayant le modèle à chaque relance.
 */
export function madeOnTruncatedSource(p: SourceProduct, revision?: TextRevision): boolean {
  if (!revision) return false
  if (!isTruncated(revision.description) && !isTruncated(revision.name)) return false
  return completeOriginText(p, revision) !== undefined
}
