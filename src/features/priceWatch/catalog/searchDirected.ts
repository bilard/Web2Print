// src/features/priceWatch/catalog/searchDirected.ts
// Recherche DIRIGÉE (complément de la moisson par liste). Au lieu d'aspirer les listes
// catégorie par catégorie — qui rate les produits tant que la couverture est partielle —
// on interroge le MOTEUR DE RECHERCHE du concurrent avec les clés du produit source
// (réf, puis EAN), et on apparie le résultat par PREUVE EXACTE (proveMatch). Zéro faux
// positif : le nom n'est jamais une preuve ici (cf. keys.ts). Prouvé en vrai : une
// recherche « A97 » sur jardimax retourne « Courroie A97 Alpina/GGP/Stiga » que la
// moisson à 8 % de couverture n'avait jamais croisée.
//
// Fonctions PURES (E/S injectées via SearchDeps.fetchHtml), donc testables et partagées
// client/serveur, comme le reste de features/priceWatch/catalog.

import { parseListingPage, type CompetitorListing } from './prestashop'
import { candidateKeys, proveMatch, type SourceProductKeys, type MatchProof } from './keys'

export interface SearchDeps {
  /** Récupère le HTML rendu d'une URL (même dépendance que la moisson : CF côté client,
   *  fetch direct côté serveur). */
  fetchHtml: (url: string) => Promise<string | null>
  log?: (msg: string) => void
}

/** Convertit un résultat de recherche en identité appariable (pour proveMatch). */
function toIdentity(l: CompetitorListing): { sku?: string; gtin13?: string; url?: string; name?: string } {
  return { sku: l.ref, gtin13: l.gtin13, url: l.url, name: l.name }
}

/** URL du moteur de recherche PrestaShop pour un terme (thème standard `controller=search`). */
export function searchUrl(domain: string, query: string): string {
  const base = domain.replace(/\/+$/, '')
  const withProto = /^https?:\/\//i.test(base) ? base : `https://${base}`
  return `${withProto}/recherche?controller=search&s=${encodeURIComponent(query)}`
}

export interface DirectedHit {
  /** Le listing concurrent apparié (prix, réf, url, dispo…). */
  listing: CompetitorListing
  /** Preuve de l'appariement (gtin13 / sku / ref-in-name…) — jamais le nom seul. */
  evidence: MatchProof['evidence']
  /** Terme de recherche qui a abouti (réf ou EAN). */
  query: string
}

/**
 * Cherche un produit source sur UN concurrent : essaie chaque clé (réf(s) d'abord, EAN
 * ensuite), parse les résultats, et renvoie le PREMIER apparié par égalité exacte.
 * `null` si aucun résultat prouvé (le produit n'y est pas, ou pas sous une clé commune).
 */
export async function searchProductOnSite(
  product: SourceProductKeys,
  domain: string,
  deps: SearchDeps,
): Promise<DirectedHit | null> {
  const keys = candidateKeys(product)
  if (keys.length === 0) return null
  // Un terme de recherche par valeur de clé distincte (réf, réf sans zéros, EAN).
  const queries = [...new Set(keys.map((k) => k.value))]
  for (const query of queries) {
    const html = await deps.fetchHtml(searchUrl(domain, query))
    if (!html) continue
    for (const listing of parseListingPage(html)) {
      const proof = proveMatch(keys, toIdentity(listing))
      if (proof) {
        deps.log?.(`${domain} : « ${query} » → ${listing.name} (preuve ${proof.evidence})`)
        return { listing, evidence: proof.evidence, query }
      }
    }
  }
  return null
}
