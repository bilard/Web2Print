// functions/src/priceWatch/catalog/originYield.ts
// ⚠ COPIE de src/features/priceWatch/catalog/originYield.ts (bundles séparés).
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

/** Fiches revendiquées par au moins un produit sur SA PROPRE référence (ou son EAN). */
export function directlyClaimed(claims: Iterable<{ url: string; origin: boolean }>): Set<string> {
  const out = new Set<string>()
  for (const c of claims) if (!c.origin) out.add(c.url)
  return out
}

/** Cette revendication doit-elle s'effacer ? Vrai seulement pour une référence d'origine
 *  sur une fiche qu'un autre produit revendique directement. */
export function yieldsToDirect(claim: { url: string; origin: boolean }, direct: Set<string>): boolean {
  return claim.origin && direct.has(claim.url)
}
