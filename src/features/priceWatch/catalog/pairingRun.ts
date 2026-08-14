// Appariement catalogue × concurrents, UN SITE À LA FOIS. PUR.
//
// ⚠ Raison d'être : la comparaison tenait l'index de TOUS les concurrents en mémoire, puis
// le parcourait DEUX fois — une passe pour la matrice, une seconde, identique, pour le
// rapport. Mesuré en production : 435 756 fiches sur 14 sites lues en 45 s, appariées en
// 37 s, puis un run qui ne se terminait jamais — l'onglet ne repeignait même plus. C'est
// exactement ce que l'écran « Concurrents » s'interdit depuis toujours (un seul index en
// mémoire à la fois) ; le node fait désormais pareil.
//
// Le principe : chaque site est apparié dès qu'il est lu, on ne RETIENT que les cellules
// prouvées (quelques dizaines de milliers, contre des centaines de milliers de fiches), et
// son index est relâché avant de charger le suivant. La matrice et le rapport se
// construisent ensuite à partir de ces cellules, sans jamais réapparier.
import { matchProduct, comparePrices, buildMemoryIndex, type SourceProduct, type PriceComparison } from './match'
import { DEFAULT_PAIRING_RULES, type PairingRules } from './pairingRules'
import type { MatchProof } from './keys'
import type { CompetitorListing } from './competitorListing'
import { bestRankByListing, yieldsToBetter, natureFittingListings, yieldsToNature } from './originYield'
import { partNature, productNature } from './partNature'

/** Taux de remplissage des champs attendus sur les fiches collectées d'un site. Mesuré ICI
 *  parce que c'est le seul endroit qui voit encore les fiches : l'index du site est relâché
 *  juste après, et le rapport se construit longtemps plus tard. */
export interface CompetitorAudit {
  /** Nombre de fiches indexées pour ce site. */
  indexed: number
  pctPrice: number
  pctListPrice: number
  pctStock: number
  pctName: number
  pctImage: number
  pctRef: number
}

export function auditListings(listings: CompetitorListing[]): CompetitorAudit {
  const indexed = listings.length
  if (!indexed) return { indexed: 0, pctPrice: 0, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 }
  let price = 0, listPrice = 0, stock = 0, name = 0, image = 0, ref = 0
  for (const l of listings) {
    if (l.price != null) price++
    if (l.listPrice != null) listPrice++
    if (l.availability) stock++
    if (l.name && l.name.trim()) name++
    if (l.image) image++
    if (l.ref || l.gtin13) ref++
  }
  const pct = (n: number) => Math.round((n / indexed) * 100)
  return { indexed, pctPrice: pct(price), pctListPrice: pct(listPrice), pctStock: pct(stock), pctName: pct(name), pctImage: pct(image), pctRef: pct(ref) }
}

/** Un appariement PROUVÉ, réduit à ce dont la matrice et le rapport ont besoin. Ne garde
 *  aucune référence à l'index du site : c'est ce qui permet de le relâcher. */
interface PairedCell {
  /** Rang du produit source dans le tableau d'entrée (clé de regroupement). */
  productIdx: number
  siteId: string
  domain: string
  name: string
  url: string
  image: string | null
  cmp: PriceComparison
  proof: MatchProof
}

/** Ce que l'appariement observe, en plus des cellules — les compteurs que ni la matrice ni
 *  le rapport ne peuvent recalculer après coup. */
interface PairingTotals {
  /** Fiches prouvées par la référence puis REFUSÉES par le libellé (tous sites). */
  vetoed: number
  /** Produits pour lesquels AU MOINS un site a pu interroger une clé. */
  sawKey: boolean[]
  /** Appariements par référence d'ORIGINE effacés devant un appariement direct sur la
   *  même fiche (cf. `originYield`). Compté, jamais silencieux : c'est une perte VOULUE,
   *  et son ampleur doit pouvoir se lire dans le journal du run. */
  yielded: number
  /** Appariements effacés parce qu'un prétendant de MÊME RANG colle à la nature de la
   *  fiche (origine ↔ origine, adaptable ↔ adaptable) alors qu'eux non. Compté à part de
   *  `yielded` : c'est le seul moyen de mesurer ce que la règle métier change sur un
   *  rapport de production, où le catalogue ne tient dans aucune fixture. */
  natureYielded: number
}

export interface PairingRun {
  /** Apparie tous les produits contre CE site. L'appelant peut relâcher `listings` après. */
  addSite: (site: { siteId: string; domain: string }, listings: CompetitorListing[]) => void
  /** Cellules prouvées, groupées par rang de produit. */
  cellsByProduct: Map<number, PairedCell[]>
  /** Remplissage des fiches, par site — mesuré pendant que l'index est encore là. */
  auditBySite: Map<string, CompetitorAudit>
  totals: PairingTotals
}

export function createPairingRun(
  products: SourceProduct[],
  opts: { vatRate?: number; alignedPct?: number; rules?: PairingRules } = {},
): PairingRun {
  const rules = opts.rules ?? DEFAULT_PAIRING_RULES
  const cellsByProduct = new Map<number, PairedCell[]>()
  const auditBySite = new Map<string, CompetitorAudit>()
  const totals: PairingTotals = { vetoed: 0, sawKey: new Array(products.length).fill(false), yielded: 0, natureYielded: 0 }

  const addSite = (site: { siteId: string; domain: string }, listings: CompetitorListing[]) => {
    auditBySite.set(site.siteId, auditListings(listings))
    const lookup = buildMemoryIndex(listings, rules)
    // Les cellules du site sont retenues avant d'être publiées : l'arbitrage « l'origine
    // cède au direct » a besoin de voir TOUS les prétendants d'une même fiche, et on ne
    // les connaît qu'une fois le catalogue entier passé sur ce site.
    const siteCells: PairedCell[] = []
    for (let i = 0; i < products.length; i++) {
      const m = matchProduct(products[i], site.siteId, lookup, rules)
      totals.vetoed += m.vetoed ?? 0
      if (m.outcome !== 'no-key') totals.sawKey[i] = true
      if (m.outcome !== 'matched' || !m.listing || !m.proof) continue
      siteCells.push({
        productIdx: i,
        siteId: site.siteId,
        domain: site.domain,
        name: m.listing.name,
        url: m.listing.url,
        image: m.listing.image ?? null,
        cmp: comparePrices(products[i].price, m.listing, { vatRate: opts.vatRate, alignedPct: opts.alignedPct, rules }),
        proof: m.proof,
      })
    }
    const claimOf = (c: PairedCell) => ({
      url: c.url, origin: c.proof.key.origin,
      ownRef: products[c.productIdx].ref, keyValue: c.proof.key.value,
      // La nature du produit source : elle départage deux prétendants de même rang
      // (adaptable ↔ pièce d'origine), cf. `originYield`. Le RANGEMENT du catalogue prime,
      // les références d'origine ensuite, le libellé en dernier — la même lecture que le
      // démenti de `match.ts`, sans quoi le rapport refuserait une paire par un signal
      // qu'il ignorerait ensuite pour trancher un litige.
      nature: productNature(products[c.productIdx]),
    })
    const claims = siteCells.map(claimOf)
    const best = bestRankByListing(claims)
    // La nature de chaque fiche concurrente, lue une fois : son libellé est tout ce qu'on
    // a d'elle, et il est relu pour chaque prétendant sans ça.
    const natureOfListing = new Map(siteCells.map((c) => [c.url, partNature(c.name)]))
    const natureOf = (url: string) => natureOfListing.get(url) ?? 'unknown'
    const fitting = rules.natureVeto
      ? natureFittingListings(claims, best, natureOf)
      : new Set<string>()
    for (const cell of siteCells) {
      const claim = claimOf(cell)
      if (yieldsToBetter(claim, best)) {
        totals.yielded++
        continue
      }
      // ⚠⚠ Origine et adaptable ne sont pas le même article : à rang égal, celui dont la
      // nature répond à celle de la fiche l'emporte. Le même arbitrage que l'écran
      // « Concurrents » — sans quoi l'écran et le rapport désignent deux produits
      // différents pour une même fiche, avec deux écarts de prix différents.
      if (yieldsToNature(claim, best, fitting, natureOf(cell.url))) {
        totals.natureYielded++
        continue
      }
      const list = cellsByProduct.get(cell.productIdx)
      if (list) list.push(cell)
      else cellsByProduct.set(cell.productIdx, [cell])
    }
  }

  return { addSite, cellsByProduct, auditBySite, totals }
}

/** Rejoue l'appariement de tous les sites d'un coup — le chemin des tests et des recalculs,
 *  où le volume tient sans peine. Le node de production, lui, appelle `addSite` au fil de
 *  ses lectures pour ne jamais tenir deux index à la fois. */
export function pairAllSites(
  products: SourceProduct[],
  sites: { siteId: string; domain: string }[],
  indexBySite: Map<string, CompetitorListing[]>,
  opts: { vatRate?: number; alignedPct?: number; rules?: PairingRules } = {},
): PairingRun {
  const run = createPairingRun(products, opts)
  for (const s of sites) run.addSite(s, indexBySite.get(s.siteId) ?? [])
  return run
}
