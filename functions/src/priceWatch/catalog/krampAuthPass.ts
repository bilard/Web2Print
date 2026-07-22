// Passe kramp AUTHENTIFIÉE d'un lot de produits, EN UNE PHASE : la page de recherche
// connectée /search/<réf> porte déjà URL fiche + réf + nom + prix HT. Pour chaque produit
// on cherche par réf BRUTE (kramp indexe la réf affichée, avec ses points) puis par EAN en
// repli, on lit la page de recherche, et on apparie par PREUVE EXACTE (proveMatch, réf/EAN
// normalisés). Serveur-only.
import type { DirectedSourceProduct } from './searchDirected'
import type { CompetitorListing } from './prestashop'
import { candidateKeys, proveMatch } from './keys'
import { parseKrampSearchListing } from './krampParse'

export interface KrampScrapeDep {
  /** login + navigation + scrape → map(url cible → markdown connecté). Injecté. */
  scrape: (urls: string[]) => Promise<Map<string, string>>
  signal?: { aborted: boolean }
  log?: (m: string) => void
}
export interface KrampHit {
  productId: string
  listing: CompetitorListing
  evidence: string
}

const searchUrl = (q: string): string => `https://www.kramp.com/shop-fr/fr/search/${encodeURIComponent(q)}`

/** Requêtes de recherche kramp d'un produit : réf(s) BRUTE(S) d'abord, EAN en repli.
 *  On cherche par la valeur AFFICHÉE (kramp l'indexe telle quelle), pas la forme normalisée. */
function searchQueries(p: DirectedSourceProduct): string[] {
  const out: string[] = []
  for (const v of [p.ref, p.ref2, p.ean]) {
    const q = String(v ?? '').trim()
    if (q && !out.includes(q)) out.push(q)
  }
  return out
}

export async function krampAuthPass(products: DirectedSourceProduct[], deps: KrampScrapeDep): Promise<KrampHit[]> {
  if (deps.signal?.aborted || products.length === 0) return []

  // Une URL de recherche par requête de chaque produit (réf brute, puis EAN), toutes
  // regroupées ; deps.scrape gère l'appel réseau (une page par requête, login amorti).
  const queriesByProduct = new Map(products.map((p) => [p.id, searchQueries(p)]))
  const targets = new Set<string>()
  for (const qs of queriesByProduct.values()) for (const q of qs) targets.add(searchUrl(q))
  if (targets.size === 0 || deps.signal?.aborted) return []
  const md = await deps.scrape([...targets])

  const hits: KrampHit[] = []
  for (const p of products) {
    // 1re requête qui donne une fiche avec prix (réf d'abord, EAN en repli).
    let listing: CompetitorListing | null = null
    for (const q of queriesByProduct.get(p.id) ?? []) {
      listing = parseKrampSearchListing(md.get(searchUrl(q)) ?? '')
      if (listing) break
    }
    if (!listing) continue
    const proof = proveMatch(candidateKeys(p), {
      sku: listing.ref, gtin13: listing.gtin13, url: listing.url, name: listing.name,
    })
    if (proof) {
      hits.push({ productId: p.id, listing, evidence: proof.evidence })
      deps.log?.(`kramp : ${listing.name} ${listing.price}€ (preuve ${proof.evidence})`)
    }
  }
  return hits
}
