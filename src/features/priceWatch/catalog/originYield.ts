// Arbitrage entre produits qui revendiquent LA MÊME fiche concurrent. PUR.
//
// Le cas, relevé en production (123courroies) : la fiche « Courroie spécifique MTD
// 754-04038 » est atteinte par DEUX produits du catalogue —
//   • la pièce d'ORIGINE 754-04038, par sa propre référence ;
//   • une courroie ADAPTABLE (« COURROIE LISSE 5/8 1015MM ») dont la description dit
//     « Remplace origine: 754-04038 », par référence d'origine donc.
// Rien ne les départageait : le PREMIER rencontré dans l'ordre du catalogue gagnait la
// fiche. L'adaptable passant devant, l'écran affichait une courroie générique de 20,15 €
// en face d'une pièce MTD à 12,48 € et annonçait −38 % — un écart qui ne compare rien.
//
// La règle : une revendication par référence d'ORIGINE cède devant une revendication
// DIRECTE sur la même fiche. Elle ne supprime pas les appariements par référence
// d'origine — ils restent le seul lien possible quand la pièce d'origine n'est pas au
// catalogue, et c'est à cela que sert le badge « ORIGINE ». Elle tranche seulement le
// litige, et uniquement quand le meilleur candidat est là.
//
// ⚠ Ce module a un JUMEAU SERVEUR (`functions/src/priceWatch/catalog/originYield.ts`) :
// le cron apparie sans passer par le navigateur. Toute correction doit être portée des
// deux côtés — un test de parité le vérifie.

import type { PartNature } from './partNature'

/**
 * Trois rangs, du plus légitime au moins :
 *
 *   2 — DIRECT : le produit revendique la fiche par sa propre référence.
 *   1 — VARIANTE : il la revendique par une référence d'origine, mais sa PROPRE référence
 *       est celle du marchand à un habit près — suffixe de variante (`7540280A` face à
 *       `7540280`) ou préfixe de marque. C'est la pièce vendue, déclinée.
 *   0 — ORIGINE PURE : sa propre référence n'a aucun rapport avec ce que le marchand
 *       publie. Il ne revendique la fiche qu'au titre de la pièce qu'il REMPLACE.
 *
 * Cas VÉCU qui a imposé le rang 1 (123courroies, fiche « Courroie spécifique MTD
 * 754-0280 ») : deux prétendants, tous deux par référence d'origine — « COURROIE LISSE 5/8
 * 52POUCES » (réf 3300173, adaptable) et la pièce « 754-0280A ». Aucune règle ne les
 * départageait, et l'ordre du catalogue donnait la fiche à l'adaptable. Or l'une des deux
 * références EST celle du marchand, au « A » près.
 *
 * ⚠ Jamais de plus long préfixe commun : sur un catalogue numéroté en série, « 3300173 » et
 * « 3300174 » partagent six caractères et désignent deux pièces différentes. Seul un habit
 * ENTIER (lettre de variante, marque) est toléré, sur une base d'au moins six caractères.
 */
const VARIANT_SUFFIX = /^[A-Z]$/
const BRAND_HABIT = /^[A-Z]+$/
const MIN_COMMON_LEN = 6

function sameUpToHabit(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length < MIN_COMMON_LEN) return false
  if (long.startsWith(short)) return VARIANT_SUFFIX.test(long.slice(short.length))
  if (long.endsWith(short)) return BRAND_HABIT.test(long.slice(0, long.length - short.length))
  return false
}

export interface Claim {
  url: string
  /** L'appariement a été prouvé par une référence d'ORIGINE. */
  origin: boolean
  /** ORIGINE ou ADAPTABLE, tel que le libellé du produit l'affirme (cf. `partNature`).
   *  Sert à départager deux prétendants de même rang — jamais à en écarter un seul. */
  nature?: PartNature
  /** Référence PROPRE du produit qui revendique, telle qu'au catalogue. */
  ownRef?: string | null
  /** Valeur normalisée de la clé qui a prouvé. */
  keyValue?: string
}

/** Normalisation locale : majuscules, séparateurs retirés — la même forme que les clés
 *  de jointure, sans importer le module de clés (ce fichier reste sans dépendance). */
function norm(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function claimRank(c: Claim): number {
  if (!c.origin) return 2
  return sameUpToHabit(norm(c.ownRef), norm(c.keyValue)) ? 1 : 0
}

/**
 * Départage DEUX prétendants de même rang : celui dont la NATURE correspond à celle de la
 * fiche l'emporte.
 *
 * C'est le cœur du métier de ce catalogue. Une pièce d'origine et son équivalent adaptable
 * portent la même référence constructeur ; à rang égal, rien ne les distinguait et l'ordre
 * du fichier décidait — donc un adaptable pouvait être mis en face d'une pièce
 * constructeur, et l'écart de prix affiché ne mesurait plus un positionnement mais la
 * différence entre deux articles.
 *
 * ⚠ N'intervient QUE si la fiche affirme sa nature ET que le prétendant affirme la sienne.
 * Le silence ne départage rien : c'est le cas le plus fréquent, et il retombe sur l'ordre
 * du catalogue — donc sur un résultat stable d'un run à l'autre.
 */
export function natureFits(claim: Claim, listingNature: PartNature): boolean {
  if (listingNature === 'unknown' || !claim.nature || claim.nature === 'unknown') return false
  return claim.nature === listingNature
}

/** Le meilleur rang atteint sur chaque fiche. */
export function bestRankByListing(claims: Iterable<Claim>): Map<string, number> {
  const best = new Map<string, number>()
  for (const c of claims) {
    const r = claimRank(c)
    const seen = best.get(c.url)
    if (seen == null || r > seen) best.set(c.url, r)
  }
  return best
}

/** Cette revendication doit-elle s'effacer ? Seulement si une autre, sur la MÊME fiche,
 *  la surclasse. À rang égal, personne ne cède — et l'ordre du catalogue tranche, pour
 *  que deux runs rendent la même liste. */
export function yieldsToBetter(claim: Claim, best: Map<string, number>): boolean {
  const top = best.get(claim.url)
  return top != null && claimRank(claim) < top
}

/**
 * Les fiches où le litige de rang égal PEUT se trancher par la nature : au moins un
 * prétendant du meilleur rang affirme la même nature que la fiche.
 *
 * Se calcule en une passe séparée, avant tout retrait, pour la même raison que
 * `bestRankByListing` : l'issue ne doit pas dépendre de l'ordre dans lequel les
 * prétendants arrivent, sinon deux runs rendraient deux listes.
 */
export function natureFittingListings(
  claims: Iterable<Claim>,
  best: Map<string, number>,
  listingNature: (url: string) => PartNature,
): Set<string> {
  const out = new Set<string>()
  for (const c of claims) {
    if (best.get(c.url) !== claimRank(c)) continue
    if (natureFits(c, listingNature(c.url))) out.add(c.url)
  }
  return out
}

/**
 * Cette revendication doit-elle s'effacer parce qu'une AUTRE, de même rang, colle à la
 * nature de la fiche alors qu'elle-même ne colle pas ?
 *
 * ⚠⚠ RÈGLE MÉTIER : une pièce d'ORIGINE et son équivalent ADAPTABLE ne sont pas le même
 * article. Ils portent pourtant la même référence constructeur — c'est la définition d'un
 * adaptable —, donc aucune clé ne les sépare et le rang les laisse à égalité. Sans ce
 * départage, l'ordre du fichier décidait : cas VÉCU sur 123courroies, la fiche « Courroie
 * spécifique MTD 754-04038 » revenait à une courroie adaptable de 20,15 € au lieu de la
 * pièce MTD à 12,48 €, et le rapport annonçait −38 % — un écart qui ne compare rien.
 *
 * Ne se déclenche JAMAIS sur un silence : si personne ne colle (`fitting` ne contient pas
 * la fiche), l'ordre du catalogue reprend la main, exactement comme avant.
 */
export function yieldsToNature(
  claim: Claim,
  best: Map<string, number>,
  fitting: Set<string>,
  listingNature: PartNature,
): boolean {
  if (!fitting.has(claim.url)) return false
  if (best.get(claim.url) !== claimRank(claim)) return false
  return !natureFits(claim, listingNature)
}
