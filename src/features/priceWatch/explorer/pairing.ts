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
import type { MatchProof } from '../catalog/keys'
import type { CompetitorListing } from '../catalog/prestashop'
import { scorePair, type Confidence } from './confidence'

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
  /** La preuve, telle quelle : QUELLE valeur a établi le lien, et par quel chemin.
   *  L'écran s'en sert pour la surligner des deux côtés — un badge « EAN » sur une fiche
   *  qui n'affiche aucun code-barres laisse chercher un chiffre qui est dans l'URL. */
  proof: { evidence: string; keyValue: string; isEan: boolean } | null
  /** Indice de fiabilité de l'appariement. null quand la fiche est orpheline. */
  confidence: Confidence | null
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
  opts: {
    vatRate?: number; alignedPct?: number; extras?: SourceExtras
    imagePrefix?: string; productUrl?: string
  } = {},
): PairedRow[] {
  const extras = opts.extras ?? NO_EXTRAS
  const lookup = buildMemoryIndex(listings)

  // Un listing peut être atteint par plusieurs produits source (variantes partageant une
  // référence dépaddée). Le PREMIER appariement prouvé gagne, comme dans le rapport où
  // l'ordre des produits fixe déjà l'issue.
  //
  // Les suivants ne sont pas jetés en silence pour autant : leur NOMBRE est retenu. Deux
  // produits F1 distincts qui revendiquent la même fiche, c'est au moins un des deux qui
  // se trompe — un défaut qu'aucun autre signal de l'indice ne voit.
  const byListing = new Map<string, { product: SourceProduct; proof: MatchProof; contenders: number }>()
  for (const product of products) {
    const m = matchProduct(product, siteId, lookup)
    if (m.outcome !== 'matched' || !m.listing || !m.proof) continue
    const seen = byListing.get(m.listing.url)
    if (seen) { seen.contenders++; continue }
    byListing.set(m.listing.url, { product, proof: m.proof, contenders: 1 })
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
    const cmp = comparePrices(p?.price, listing, { vatRate: opts.vatRate, alignedPct: opts.alignedPct })
    return {
      key: listing.url,
      listing,
      cmp,
      kind: hit ? kindOf(hit.proof) : null,
      proof: hit
        ? { evidence: hit.proof.evidence, keyValue: hit.proof.key.value, isEan: hit.proof.key.kind === 'ean' }
        : null,
      confidence: hit && p
        ? scorePair({
            evidence: hit.proof.evidence, key: hit.proof.key,
            sourceEan: p.ean, listingEan: listing.gtin13,
            sourceRef: p.ref, listingRef: listing.ref,
            sourceName: p.name, listingName: listing.name,
            deltaPct: cmp.deltaPct, contenders: hit.contenders,
          })
        : null,
      source: p
        ? {
            id: p.id, ref: p.ref ?? null, ean: p.ean ?? null, name: p.name,
            description, images: images.filter(Boolean),
            priceHt: p.price ?? null, url: p.url ?? sourceUrl(p, opts.productUrl), path,
          }
        : null,
    }
  })
}

/**
 * Fiche produit sur MON site, reconstruite depuis un gabarit — le catalogue source ne
 * porte presque jamais d'URL. Deux écritures acceptées, parce que l'une des deux suffit
 * dans la plupart des ERP :
 *   - gabarit à jetons : `https://…/produit/{ref}` (jetons `{ref}`, `{ean}`, `{id}`) ;
 *   - simple préfixe : `https://…/produit/` → la référence est ajoutée à la fin.
 *
 * ⚠ Les valeurs sont ENCODÉES : une référence F1 comme `381600533/1` insérée telle quelle
 * fabriquerait un segment d'URL supplémentaire et un 404 silencieux.
 */
function sourceUrl(p: SourceProduct, tpl?: string): string | null {
  const base = tpl?.trim()
  if (!base || !/^https?:\/\//i.test(base)) return null
  const enc = (v: string | undefined) => (v ? encodeURIComponent(v) : '')
  if (/\{(ref|ean|id)\}/.test(base)) {
    const value: Record<string, string> = { ref: enc(p.ref), ean: enc(p.ean), id: enc(p.id) }
    let complete = true
    const url = base.replace(/\{(ref|ean|id)\}/g, (_, token: string) => {
      if (!value[token]) complete = false
      return value[token]
    })
    // Un jeton sans valeur donnerait une URL tronquée menant à la page d'accueil : mieux
    // vaut aucun lien qu'un lien qui ment.
    return complete ? url : null
  }
  const key = enc(p.ref) || enc(p.ean)
  return key ? base.replace(/\/+$/, '') + '/' + key : null
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
