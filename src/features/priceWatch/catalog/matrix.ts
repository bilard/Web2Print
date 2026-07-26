// Construction de la matrice comparative produit × concurrent. PUR.
//
// Une ligne par produit source apparié à au moins un concurrent. Colonnes fixes
// (identité + mon prix) puis un bloc de colonnes par concurrent (TTC, barré TTC, HT
// recalculé, écart %, stock, lien). Le prix concurrent est VERBATIM (TTC affiché) ;
// le HT recalculé sert la comparaison à mon prix catalogue.
import { matchProduct, comparePrices, buildMemoryIndex, type SourceProduct } from './match'
import type { MatchProof } from './keys'
import type { CompetitorListing } from './prestashop'

export interface SiteRef {
  siteId: string
  domain: string
}

export interface MatrixColumn {
  key: string
  label: string
  /** Nature de la colonne → pilote le FORMAT de cellule Excel à l'export
   *  (ean = entier sans décimale, price = 2 décimales, percent = 1 décimale + %). */
  kind: 'text' | 'ean' | 'price' | 'percent'
  primary?: boolean
}

export interface MatrixResult {
  columns: MatrixColumn[]
  rows: Record<string, unknown>[]
  /** Produits source appariés à ≥1 concurrent. */
  matched: number
  /** Produits dont AU MOINS un match est « même produit » (EAN/réf exacte). */
  matchedExact: number
  /** Produits dont les matchs sont UNIQUEMENT « pièce d'origine » (adaptable ↔ OEM). */
  matchedOriginOnly: number
  /** Produits sans aucune correspondance (non listés dans la matrice). */
  unmatched: number
  /** Produits sans clé de jointure exploitable en entrée. */
  noKey: number
}

const AVAIL_LABEL: Record<string, string> = {
  'in-stock': 'En stock', 'out-of-stock': 'Rupture', 'on-order': 'Sur commande',
}

/** Noms de colonnes de la source, réutilisés dans les en-têtes de sortie. */
interface SourceLabels {
  ref?: string
  ean?: string
  name?: string
  family?: string
  price?: string
}

const DEFAULT_LABELS: Required<SourceLabels> = {
  name: 'Produit', ref: 'Référence', ean: 'EAN', family: 'Famille', price: 'Mon prix HT',
}

/** Colonnes fixes d'identité + mon prix, nommées d'après la source. */
function baseColumns(labels: SourceLabels): MatrixColumn[] {
  const l = { ...DEFAULT_LABELS, ...Object.fromEntries(Object.entries(labels).filter(([, v]) => v)) }
  return [
    { key: 'produit', label: l.name, kind: 'text', primary: true },
    { key: 'reference', label: l.ref, kind: 'text' },
    { key: 'ean', label: l.ean, kind: 'ean' },
    { key: 'famille', label: l.family, kind: 'text' },
    { key: 'mon_prix_ht', label: l.price, kind: 'price' },
  ]
}

/**
 * Bloc de colonnes d'un concurrent. Le nom du produit et le prix HT reprennent les noms
 * de colonnes de la source, suffixés du concurrent (« Produit — pro-motoculture.com »).
 * Le nom concurrent permet de VÉRIFIER d'un coup d'œil que l'appariement (fait par
 * égalité exacte de clé) porte sur le bon produit.
 */
function siteColumns(domain: string, labels: SourceLabels): MatrixColumn[] {
  const s = domain.replace(/[^a-z0-9]+/gi, '_')
  const l = { ...DEFAULT_LABELS, ...Object.fromEntries(Object.entries(labels).filter(([, v]) => v)) }
  return [
    { key: `nom_${s}`, label: `${l.name} — ${domain}`, kind: 'text' },
    { key: `prix_ttc_${s}`, label: `Prix TTC — ${domain}`, kind: 'price' },
    { key: `prix_ht_${s}`, label: `${l.price} — ${domain}`, kind: 'price' },
    { key: `prix_barre_${s}`, label: `Prix barré TTC — ${domain}`, kind: 'price' },
    { key: `ecart_${s}`, label: `Écart % — ${domain}`, kind: 'percent' },
    { key: `stock_${s}`, label: `Stock — ${domain}`, kind: 'text' },
    { key: `match_${s}`, label: `Correspondance — ${domain}`, kind: 'text' },
    { key: `image_${s}`, label: `Image — ${domain}`, kind: 'text' },
    { key: `url_${s}`, label: `Lien — ${domain}`, kind: 'text' },
  ]
}

/** Libellé lisible du type d'appariement (transparence : même produit vs origine). */
function matchLabel(proof: MatchProof): string {
  if (proof.key.origin) return 'Pièce d’origine'
  if (proof.key.kind === 'ean' || proof.evidence === 'gtin13' || proof.evidence === 'ean-in-url') return 'EAN'
  return 'Référence'
}

export interface BuildMatrixOptions {
  vatRate?: number
  /** N'inclure une ligne que si le produit est apparié quelque part. Défaut : true. */
  matchedOnly?: boolean
  /** Noms de colonnes de la source, pour les en-têtes de sortie. */
  labels?: SourceLabels
}

/**
 * Construit la matrice. `indexBySite` mappe siteId → produits concurrents relus depuis
 * l'index persistant. L'appariement se fait par égalité exacte (cf. `matchProduct`) ;
 * un produit non apparié chez un concurrent laisse ses colonnes vides — jamais de prix
 * approximatif.
 */
export function buildMatrix(
  products: SourceProduct[],
  sites: SiteRef[],
  indexBySite: Map<string, CompetitorListing[]>,
  opts: BuildMatrixOptions = {},
): MatrixResult {
  const matchedOnly = opts.matchedOnly ?? true
  const labels = opts.labels ?? {}
  const columns = [...baseColumns(labels), ...sites.flatMap((s) => siteColumns(s.domain, labels))]
  const lookups = new Map(sites.map((s) => [s.siteId, buildMemoryIndex(indexBySite.get(s.siteId) ?? [])]))

  const rows: Record<string, unknown>[] = []
  let matched = 0, matchedExact = 0, matchedOriginOnly = 0, unmatched = 0, noKey = 0

  for (const product of products) {
    const row: Record<string, unknown> = {
      _id: `pw_${product.id}`,
      produit: product.name,
      reference: product.ref ?? '',
      ean: product.ean ?? '',
      famille: (product as SourceProduct & { family?: string }).family ?? '',
      mon_prix_ht: product.price ?? '',
    }
    // Colonnes de site pré-remplies à vide : une cellule absente ≠ une cellule vide
    // à l'export, et une matrice creuse doit rester lisible.
    for (const col of columns) if (!(col.key in row)) row[col.key] = ''
    let hitCount = 0
    let exactHit = false
    let sawKey = false

    for (const site of sites) {
      const lookup = lookups.get(site.siteId)!
      const m = matchProduct(product, site.siteId, lookup)
      if (m.outcome !== 'no-key') sawKey = true
      if (m.outcome !== 'matched' || !m.listing || !m.proof) continue
      hitCount++
      if (!m.proof.key.origin) exactHit = true
      const s = site.domain.replace(/[^a-z0-9]+/gi, '_')
      const cmp = comparePrices(product.price, m.listing, { vatRate: opts.vatRate })
      row[`nom_${s}`] = m.listing.name
      row[`prix_ttc_${s}`] = cmp.priceTtc ?? ''
      row[`prix_ht_${s}`] = cmp.priceHt ?? ''
      row[`prix_barre_${s}`] = cmp.listPriceTtc ?? ''
      // Écart en points de % (-18,4) — lisible dans l'aperçu. L'export d'une colonne
      // `percent` le convertit en vrai pourcentage Excel (÷100 + format 0.0%).
      row[`ecart_${s}`] = cmp.deltaPct ?? ''
      row[`stock_${s}`] = cmp.availability ? AVAIL_LABEL[cmp.availability] : ''
      row[`match_${s}`] = matchLabel(m.proof)
      row[`image_${s}`] = m.listing.image ?? ''
      row[`url_${s}`] = m.listing.url
    }

    if (hitCount > 0) {
      matched++
      if (exactHit) matchedExact++
      else matchedOriginOnly++
    } else if (!sawKey) noKey++
    else unmatched++

    if (!matchedOnly || hitCount > 0) rows.push(row)
  }

  return { columns, rows, matched, matchedExact, matchedOriginOnly, unmatched, noKey }
}
