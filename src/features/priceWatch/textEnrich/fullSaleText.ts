// Le texte de vente ENTIER d'une fiche, quand celui du catalogue a été coupé. PUR.
//
// ⚠⚠ Le catalogue source enregistre la description sous un plafond (`DESCRIPTION_MAX`) et
// marque la coupe d'une ellipse finale. Une fiche écrite avant que ce plafond ne soit levé
// porte donc un argumentaire amputé — et l'écran le donnait TEL QUEL au modèle : la
// réécriture reproduisait la coupe, et chaque nouveau passage la reproduisait encore, sans
// que rien ne le dise. C'est ce qu'on voyait à l'écran : « …, Revolution 2300 (single
// line), R… », alors que le texte entier cite encore trois modèles et six références.
//
// Le texte entier survit pourtant dès que la carte de workflow est passée :
// `byColumn[*].before` porte la CELLULE de la feuille, sans plafond.
//
// ⚠⚠ Mais on ne DEVINE pas laquelle de ces colonnes est le texte de vente — c'est
// précisément ce que `textRevisionsStore` interdit (« deviner poserait un jour la traduction
// du libellé dans la description »). Prendre la plus longue marcherait sur cette fiche-ci et
// choisirait un tableau de specs sur la suivante. On exige donc une PREUVE : la coupe étant
// `texte.slice(0, MAX) + '…'`, le texte entier commence forcément par le moignon. Pas de
// préfixe, pas de remplacement — la fiche est déclarée irréparable et le bandeau la compte.
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

/** Un texte coupé à l'enregistrement se reconnaît à son ellipse finale. */
export function isTruncated(s: string | null | undefined): boolean {
  return !!s && s.trimEnd().endsWith('…')
}

/** Tous les textes D'ORIGINE connus pour cette fiche — jamais une réécriture. */
function candidates(p: SourceProduct, revision?: TextRevision): string[] {
  return [
    p.description, p.descriptionSource, revision?.descriptionSource,
    ...Object.values(revision?.byColumn ?? {}).map((v) => v.before),
  ].filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}

/**
 * L'exemplaire ENTIER d'un texte coupé, prouvé par son préfixe. `undefined` = introuvable.
 *
 * ⚠ Ne s'applique qu'à un texte d'ORIGINE. Une traduction coupée n'a aucun original pour
 * préfixe : elle ne se répare pas ici, elle se refait.
 */
export function wholeVersionOf(
  text: string | null | undefined, p: SourceProduct, revision?: TextRevision,
): string | undefined {
  if (!isTruncated(text)) return undefined
  const stem = (text as string).trimEnd().slice(0, -1).trimEnd()
  if (stem === '') return undefined
  return candidates(p, revision)
    .filter((c) => !isTruncated(c) && c.trim().startsWith(stem) && c.trim().length > stem.length)
    .sort((a, b) => b.length - a.length)[0]
}

/**
 * Le texte d'origine sur lequel une (re)traduction doit porter, ENTIER si on sait le
 * reconstituer. C'est l'original mémorisé à la première réécriture, à défaut celui du
 * catalogue — réparé quand il est coupé.
 */
export function completeOriginText(p: SourceProduct, revision?: TextRevision): string | undefined {
  const origin = revision?.descriptionSource ?? p.descriptionSource ?? p.description
  if (!origin) return undefined
  return isTruncated(origin) ? wholeVersionOf(origin, p, revision) : origin
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
  // ⚠⚠ La colonne jumelle « (source) » d'ABORD, comme le nom juste au-dessus. Sans elle, la
  // colonne AVANT affichait le texte ENRICHI — « Comparer catalogue » l'a recopié dans le
  // catalogue dès que la carte est passée — en face d'une pastille « NL » : l'après des deux
  // côtés, et un original néerlandais introuvable à l'écran.
  const shown = p.descriptionSource ?? revision?.descriptionSource ?? p.description
  const whole = wholeVersionOf(shown, p, revision)
  if (whole) return { text: whole, truncated: false }
  return { ...(shown ? { text: shown } : {}), truncated: isTruncated(shown) }
}

/**
 * Cette réécriture est-elle coupée, alors que son texte d'origine entier est disponible ?
 * Elle doit alors repasser : c'est la seule façon de rattraper une amputation déjà écrite.
 *
 * ⚠ Faux quand aucun texte entier n'est certifiable : sans lui, la refaire donnerait
 * exactement le même résultat amputé, en repayant le modèle à chaque relance.
 *
 * ⚠ Jugé sur la DESCRIPTION seule : c'est le seul champ que la reprise sait recomposer
 * (`completeOriginText`). Un nom coupé remettrait la fiche en file pour un travail qui ne
 * le réparerait pas.
 */
export function madeOnTruncatedSource(p: SourceProduct, revision?: TextRevision): boolean {
  if (!revision || !isTruncated(revision.description)) return false
  const whole = completeOriginText(p, revision)
  return !!whole && !isTruncated(whole)
}
