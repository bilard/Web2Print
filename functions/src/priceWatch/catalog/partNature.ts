// functions/src/priceWatch/catalog/partNature.ts
// ⚠ COPIE de src/features/priceWatch/catalog/partNature.ts (bundles séparés).
// ORIGINE ou ADAPTABLE : la nature commerciale d'une pièce, lue dans son libellé. PUR.
//
// Enjeu métier, et il est central sur ce catalogue. Une pièce D'ORIGINE et son équivalent
// ADAPTABLE portent la même référence constructeur — c'est même la raison d'être de
// l'adaptable : remplacer la pièce d'origine. Ils s'apparient donc parfaitement… et ne
// valent pas le même prix. Comparer « COURROIE LISSE 5/8 » (adaptable, 11,90 €) à
// « Courroie spécifique MTD 754-0280 » (pièce MTD, 16,08 €) et annoncer +35 % ne dit rien
// du positionnement : ce sont deux articles différents pour la même machine.
//
// Ce module ne DÉCIDE de rien : il nomme ce que le libellé affirme. Les appariements
// restent gouvernés par les clés ; la nature sert à départager deux candidats équivalents,
// et à DIRE à l'acheteur ce qu'il compare.
//
// ⚠ RÈGLE DE LECTURE — « adaptable » l'emporte sur « origine ». Le cas est fréquent et
// piégeux : « Courroie lisse trapézoïdale QUALITÉ D'ORIGINE MTD, ADAPTABLE pour séries
// 400, 500 et 600 » est un adaptable qui se compare à l'origine, pas une pièce MTD. Un
// vendeur d'adaptable vante la qualité d'origine ; un vendeur de pièce d'origine n'a
// jamais besoin d'écrire « adaptable ».
//
// ⚠ RÈGLE DE PRUDENCE, identique au lexique des familles : dans le doute, on se TAIT.
// `unknown` est la réponse normale et sans conséquence — la majorité des libellés
// marchands ne qualifient rien.

/** Ce que le libellé AFFIRME. `unknown` = il ne dit rien, cas le plus fréquent. */
export type PartNature = 'origin' | 'aftermarket' | 'unknown'

/** Mots qui désignent explicitement un article de remplacement, non issu du constructeur. */
const AFTERMARKET = /\b(?:adaptables?|compatibles?|aftermarket|non\s+d['’]origine|equivalents?|équivalents?|remplace|substitut|generique|générique)\b/i

/**
 * Mots qui revendiquent la pièce CONSTRUCTEUR. Volontairement étroits :
 * « origine » seul est ambigu (« référence d'origine », « qualité d'origine ») et n'est
 * donc PAS retenu — seules les formes qui qualifient la pièce elle-même comptent.
 */
const ORIGIN = /\b(?:pi[eè]ces?\s+d['’]origine|d['’]origine\s+constructeur|origine\s+constructeur|oem|genuine|origin(?:al|ale)s?\s+part)\b/i

/**
 * Nature affirmée par un texte (libellé, description, chemin de taxonomie concaténés).
 * L'adaptable prime : c'est la seule affirmation qu'un vendeur n'écrit jamais par erreur.
 */
export function partNature(...texts: (string | null | undefined)[]): PartNature {
  const hay = texts.filter(Boolean).join(' ')
  if (!hay) return 'unknown'
  if (AFTERMARKET.test(hay)) return 'aftermarket'
  if (ORIGIN.test(hay)) return 'origin'
  return 'unknown'
}

/**
 * Les deux côtés affirment-ils des natures OPPOSÉES ? Jamais vrai si l'un des deux se
 * tait — on ne conclut rien d'une absence, principe de tout ce dossier.
 */
export function natureMismatch(mine: PartNature, theirs: PartNature): boolean {
  return mine !== 'unknown' && theirs !== 'unknown' && mine !== theirs
}
