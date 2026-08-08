// Parcourir SON catalogue, indépendamment de tout concurrent. PUR.
//
// L'explorateur ne montrait que les fiches du marchand sélectionné : chercher « carburateur »
// y rendait « 0 sur 103 412 » dès que CE marchand n'en vend pas, sans qu'on puisse jamais
// consulter les 103 412. Or c'est le catalogue de référence — celui qu'on interroge pour
// savoir ce qu'on vend, avant même de regarder qui d'autre le vend.
import { normalizeEan, normalizeRef } from '../catalog/keys'
import type { SourceProduct } from '../catalog/match'

/**
 * Produits du catalogue correspondant à une saisie.
 *
 * ⚠ Trois lectures de la saisie, dans cet ordre : code-barres, référence, puis mots. Une
 * référence saisie avec ses tirets doit trouver la fiche qui la stocke sans — c'est la
 * même normalisation que l'appariement, et s'en écarter ferait dire à l'écran qu'un
 * produit est absent alors que le moteur, lui, le rapproche très bien.
 */
export function searchCatalog(products: SourceProduct[], query: string): SourceProduct[] {
  const q = query.trim()
  if (!q) return products

  const ean = normalizeEan(q)
  const ref = normalizeRef(q)
  // Recherche par mots : tous doivent être présents, dans n'importe quel ordre. « joint
  // carburateur » et « carburateur joint » désignent la même intention.
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2)

  return products.filter((p) => {
    if (ean && p.ean && normalizeEan(p.ean) === ean) return true
    if (ref && ref.length >= 3) {
      for (const candidate of [p.ref, p.ref2]) {
        if (candidate && normalizeRef(candidate) === ref) return true
      }
    }
    if (words.length === 0) return false
    const hay = `${p.name ?? ''} ${p.ref ?? ''} ${p.ref2 ?? ''} ${p.description ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

export interface CatalogFacts {
  total: number
  shown: number
  withPrice: number
  withImage: number
}

/** De quoi juger la liste sans la parcourir — et repérer un catalogue mal importé. */
export function catalogFacts(all: SourceProduct[], shown: SourceProduct[]): CatalogFacts {
  return {
    total: all.length,
    shown: shown.length,
    withPrice: shown.filter((p) => typeof p.price === 'number').length,
    withImage: shown.filter((p) => p.image).length,
  }
}
