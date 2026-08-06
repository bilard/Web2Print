// Pourquoi une recherche ne rend RIEN. PUR : aucune dépendance React/Firebase.
//
// L'explorateur ne montre que les fiches du concurrent affiché. Chercher une référence
// ou un code-barres n'y trouve donc rien dès que CE marchand ne vend pas l'article —
// et l'écran répondait « Aucune fiche ne correspond aux filtres », ce qui se lit comme
// « ta saisie est fausse » alors que le produit est bien au catalogue. Vécu : l'EAN
// 8008984359130 (un enjoliveur Castelgarden) cherché sur un vendeur de courroies.
//
// Le catalogue source est DÉJÀ en mémoire pour l'appariement : on peut donc trancher
// sans un seul accès réseau entre « ce code n'existe pas chez moi » et « il existe, mais
// ce concurrent ne le vend pas ».
import { normalizeEan, normalizeRef } from '../catalog/keys'
import type { SourceProduct } from '../catalog/match'

export interface SearchDiagnosis {
  /** Le produit du catalogue source que la saisie désigne, s'il y en a un. */
  product: SourceProduct
}

/** Longueur en deçà de laquelle une saisie n'est pas une clé mais un mot de recherche. */
const MIN_KEY_LEN = 4

/**
 * La saisie désigne-t-elle un produit du CATALOGUE SOURCE ?
 *
 * Comparaison sur les formes normalisées, comme l'appariement : un code-barres saisi
 * avec des espaces et une référence sans ses séparateurs doivent tomber sur leur fiche.
 * `null` dès que la saisie ressemble à un mot plutôt qu'à une clé — inutile de proposer
 * « tondeuse » comme référence introuvable.
 */
export function diagnoseEmptySearch(q: string, products: SourceProduct[]): SearchDiagnosis | null {
  const raw = q.trim()
  if (raw.length < MIN_KEY_LEN) return null
  const ean = normalizeEan(raw)
  const ref = normalizeRef(raw)
  // Une saisie sans chiffre est un mot, pas une clé : on ne va pas fouiller le catalogue.
  if (!ean && !/\d/.test(raw)) return null
  for (const p of products) {
    if (ean && normalizeEan(p.ean) === ean) return { product: p }
    if (ref.length >= MIN_KEY_LEN && normalizeRef(p.ref) === ref) return { product: p }
    if (ref.length >= MIN_KEY_LEN && p.ref2 && normalizeRef(p.ref2) === ref) return { product: p }
  }
  return null
}
