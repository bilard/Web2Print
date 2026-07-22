// Passe kramp AUTHENTIFIÉE d'un lot de produits, en 2 phases (chacune = 1 appel scrape,
// login amorti) : (1) recherche par réf, repli EAN → URLs fiches ; (2) fiches → prix.
// Appariement par PREUVE EXACTE (proveMatch, réf/EAN normalisés). Serveur-only.
import type { DirectedSourceProduct } from './searchDirected'
import type { CompetitorListing } from './prestashop'
import { candidateKeys, proveMatch } from './keys'
import { parseKrampSearchUrls, parseKrampProduct } from './krampParse'

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

/** Sépare les valeurs de clés en réfs (essayées d'abord) et EAN (repli). */
function refThenEan(keys: ReturnType<typeof candidateKeys>): { refs: string[]; eans: string[] } {
  const refs: string[] = [], eans: string[] = []
  for (const k of keys) (k.kind === 'ean' ? eans : refs).push(k.value)
  return { refs: [...new Set(refs)], eans: [...new Set(eans)] }
}

export async function krampAuthPass(products: DirectedSourceProduct[], deps: KrampScrapeDep): Promise<KrampHit[]> {
  if (deps.signal?.aborted || products.length === 0) return []
  const keysByProduct = new Map(products.map((p) => [p.id, candidateKeys(p)]))

  // Phase 1 : une recherche par réf (1re) + une par EAN (repli) pour chaque produit,
  // toutes dans UN appel scrape (login amorti).
  const phase1: { productId: string; refQ?: string; eanQ?: string }[] = []
  const searchTargets: string[] = []
  for (const p of products) {
    const { refs, eans } = refThenEan(keysByProduct.get(p.id)!)
    const refQ = refs[0], eanQ = eans[0]
    if (!refQ && !eanQ) continue
    phase1.push({ productId: p.id, refQ, eanQ })
    if (refQ) searchTargets.push(searchUrl(refQ))
    if (eanQ) searchTargets.push(searchUrl(eanQ))
  }
  if (searchTargets.length === 0 || deps.signal?.aborted) return []
  const searchMd = await deps.scrape([...new Set(searchTargets)])

  // Produit → 1re URL fiche trouvée (réf d'abord, sinon EAN).
  const productUrlByProduct = new Map<string, string>()
  for (const x of phase1) {
    const fromRef = x.refQ ? parseKrampSearchUrls(searchMd.get(searchUrl(x.refQ)) ?? '') : []
    const fromEan = x.eanQ ? parseKrampSearchUrls(searchMd.get(searchUrl(x.eanQ)) ?? '') : []
    const url = fromRef[0] ?? fromEan[0]
    if (url) productUrlByProduct.set(x.productId, url)
  }
  if (productUrlByProduct.size === 0 || deps.signal?.aborted) return []

  // Phase 2 : scrape des fiches → prix, puis preuve exacte.
  const prodUrls = [...new Set(productUrlByProduct.values())]
  const prodMd = await deps.scrape(prodUrls)
  const hits: KrampHit[] = []
  for (const [productId, url] of productUrlByProduct) {
    const listing = parseKrampProduct(prodMd.get(url) ?? '', url)
    if (!listing) continue
    const proof = proveMatch(keysByProduct.get(productId)!, {
      sku: listing.ref, gtin13: listing.gtin13, url: listing.url, name: listing.name,
    })
    if (proof) {
      hits.push({ productId, listing, evidence: proof.evidence })
      deps.log?.(`kramp : ${listing.name} ${listing.price}€ (preuve ${proof.evidence})`)
    }
  }
  return hits
}
