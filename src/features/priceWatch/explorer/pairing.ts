// Jointure « une fiche concurrent ↔ son produit F1 », pour l'explorateur par concurrent.
// PUR : aucune dépendance React/Firebase.
//
// ⚠ Sens de parcours. Le rapport dashboard boucle sur les PRODUITS SOURCE et cherche
// leur fiche chez chaque concurrent ; ici on veut l'inverse (toutes les fiches d'UN
// site, appariées ou non). On garde malgré tout le parcours produits → `matchProduct`,
// et on retourne l'association : c'est la SEULE façon d'obtenir exactement le même
// appariement que le dashboard. Reconstruire une correspondance « listing → produit »
// avec d'autres règles produirait des écarts contredisant le tableau de bord.
import { matchProduct, comparePrices, buildMemoryIndex, type SourceProduct, type PriceComparison } from '../catalog/match'
import type { CompetitorListing } from '../catalog/prestashop'

/** Nature de la preuve d'appariement (même classement que le rapport). */
type PairKind = 'exact-ean' | 'exact-ref' | 'origin'

/** Côté F1 d'une ligne : ce que l'acheteur doit voir pour VALIDER visuellement. */
interface SourceSide {
  id: string
  ref: string | null
  ean: string | null
  name: string
  /** Description catalogue — absente du catalogue persisté, jointe depuis la base PIM. */
  description: string | null
  /** Visuels F1 (URLs), le premier sert de vignette. */
  images: string[]
  priceHt: number | null
  url: string | null
  /** Chemin taxonomique F1 (Famille > Sous-famille > Groupe produit), joint depuis le PIM. */
  path: string[]
}

/** Une fiche concurrent, avec son produit F1 quand l'appariement est prouvé. */
export interface PairedRow {
  /** Clé stable de ligne : l'URL de la fiche concurrent (déjà dédupliquée à la lecture). */
  key: string
  listing: CompetitorListing
  /** Prix HT converti + écart, via `comparePrices` — strictement la règle du rapport. */
  cmp: PriceComparison
  source: SourceSide | null
  kind: PairKind | null
}

function kindOf(proof: { key: { origin: boolean; kind: string }; evidence: string }): PairKind {
  if (proof.key.origin) return 'origin'
  if (proof.key.kind === 'ean' || proof.evidence === 'gtin13' || proof.evidence === 'ean-in-url') return 'exact-ean'
  return 'exact-ref'
}

/** Enrichissements F1 non portés par le catalogue source persisté (description, visuels). */
export type SourceExtras = (p: SourceProduct) => { description: string | null; images: string[]; path: string[] }

const NO_EXTRAS: SourceExtras = () => ({ description: null, images: [], path: [] })

/**
 * Apparie TOUTES les fiches collectées chez un concurrent au catalogue source.
 *
 * Les fiches non appariées sont conservées (`source: null`) : ce sont elles qui disent
 * ce que le concurrent vend et que vous ne référencez pas — l'écran les filtre, il ne
 * les jette pas.
 */
export function pairSiteListings(
  products: SourceProduct[],
  siteId: string,
  listings: CompetitorListing[],
  opts: { vatRate?: number; alignedPct?: number; extras?: SourceExtras; imagePrefix?: string } = {},
): PairedRow[] {
  const extras = opts.extras ?? NO_EXTRAS
  const lookup = buildMemoryIndex(listings)

  // Un listing peut être atteint par plusieurs produits source (variantes partageant une
  // référence dépaddée). Le PREMIER appariement prouvé gagne, comme dans le rapport où
  // l'ordre des produits fixe déjà l'issue.
  const byListing = new Map<string, { product: SourceProduct; kind: PairKind }>()
  for (const product of products) {
    const m = matchProduct(product, siteId, lookup)
    if (m.outcome !== 'matched' || !m.listing || !m.proof) continue
    if (byListing.has(m.listing.url)) continue
    byListing.set(m.listing.url, { product, kind: kindOf(m.proof) })
  }

  return listings.map((listing) => {
    const hit = byListing.get(listing.url)
    const p = hit?.product
    // Le catalogue source PERSISTÉ prime : le fichier F1 vient du workflow, pas du PIM,
    // et c'est là que ses description/visuel/taxonomie voyagent. La jointure PIM ne sert
    // que de repli — catalogues écrits avant cette version, ou base ouverte plus riche.
    const ex = p ? extras(p) : null
    const description = p?.description ?? ex?.description ?? null
    const images = p?.image ? [absoluteImage(p.image, opts.imagePrefix)] : (ex?.images ?? [])
    const path = p?.taxo?.length ? p.taxo : (ex?.path ?? [])
    return {
      key: listing.url,
      listing,
      cmp: comparePrices(p?.price, listing, { vatRate: opts.vatRate, alignedPct: opts.alignedPct }),
      kind: hit?.kind ?? null,
      source: p
        ? {
            id: p.id, ref: p.ref ?? null, ean: p.ean ?? null, name: p.name,
            description, images: images.filter(Boolean),
            priceHt: p.price ?? null, url: p.url ?? null, path,
          }
        : null,
    }
  })
}

/** Visuel du catalogue source : les ERP n'y stockent souvent qu'un nom de fichier, que
 *  l'utilisateur complète par un préfixe. Une valeur déjà absolue est laissée telle quelle. */
function absoluteImage(v: string, prefix?: string): string {
  if (/^https?:\/\//.test(v)) return v
  return prefix ? prefix.replace(/\/+$/, '') + '/' + v.replace(/^\/+/, '') : ''
}

/** Remise affichée par le concurrent (prix barré → prix), en % positif. null si aucune. */
export function discountPct(l: CompetitorListing): number | null {
  if (l.price == null || l.listPrice == null || l.listPrice <= 0) return null
  const pct = ((l.listPrice - l.price) / l.listPrice) * 100
  return pct > 0.5 ? Math.round(pct * 10) / 10 : null
}
