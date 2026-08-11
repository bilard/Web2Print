// Construction de la matrice comparative produit × concurrent. PUR.
//
// Une ligne par produit source apparié à au moins un concurrent. Colonnes fixes
// (identité + mon prix) puis un bloc de colonnes par concurrent (TTC, barré TTC, HT
// recalculé, écart %, stock, lien). Le prix concurrent est VERBATIM (TTC affiché) ;
// le HT recalculé sert la comparaison à mon prix catalogue.
import type { SourceProduct } from './match'
import { pairAllSites, type PairingRun } from './pairingRun'
import type { MatchProof } from './keys'
import type { CompetitorListing } from './competitorListing'

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
  /** Concurrent auquel la colonne appartient. Les colonnes d'un même groupe sont
   *  CONTIGUËS (cf. `siteColumns`) : l'export Google Sheets peut donc les replier
   *  d'un seul bloc. Absent sur les colonnes communes (EAN, nom, mon prix). */
  group?: string
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
  /** Concurrents écartés de la feuille faute du moindre appariement. Journalisé : un
   *  concurrent qui disparaît de l'export sans trace, c'est le prochain « où sont mes
   *  concurrents ? ». */
  emptySites: string[]
  /** Fiches prouvées puis ÉCARTÉES parce que leur libellé nommait une autre pièce.
   *  Chiffré dans le journal du run : sans ce compteur, la différence entre « le
   *  concurrent ne l'a pas » et « il l'a, mais ce n'était pas le bon article » est
   *  invisible — et une baisse d'appariés se lit comme une panne. */
  vetoed: number
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
 * Bloc de colonnes d'un concurrent.
 *
 * ⚠ Libellés NEUTRES, jamais ceux de la source. Ils reprenaient auparavant les noms de
 * MES colonnes, suffixés du domaine — avec l'idée de garder un vocabulaire commun. Le
 * résultat était trompeur dès que la source nomme ses colonnes en propre : un catalogue
 * dont la colonne prix s'appelle « PV Brut F1 » produisait « PV Brut F1 —
 * www.jardimax.com », qui se lit comme MON prix alors que c'est celui du concurrent ;
 * une colonne nom appelée « DESCRIPTION » donnait « DESCRIPTION — www.jardimax.com »
 * pour le libellé de SA fiche. Le nom de la colonne doit dire ce que la cellule
 * contient, pas d'où vient le gabarit.
 *
 * Le domaine en suffixe permet de VÉRIFIER d'un coup d'œil que l'appariement (fait par
 * égalité exacte de clé) porte sur le bon produit.
 */
/** Champs qu'un bloc concurrent peut porter, dans l'ordre où ils sortent. Exposé : le
 *  node en fait ses cases à cocher, et les deux listes ne doivent jamais diverger. */
export const SITE_FIELDS = [
  { value: 'nom', label: 'Libellé' },
  { value: 'prix_ttc', label: 'Prix TTC' },
  { value: 'prix_ht', label: 'Prix HT' },
  { value: 'prix_barre', label: 'Prix barré TTC' },
  { value: 'ecart', label: 'Écart %' },
  { value: 'stock', label: 'Stock' },
  { value: 'match', label: 'Correspondance' },
  { value: 'image', label: 'Image' },
  { value: 'url', label: 'Lien' },
] as const

export type SiteField = typeof SITE_FIELDS[number]['value']

function siteColumns(domain: string, fields?: Set<SiteField>): MatrixColumn[] {
  const s = domain.replace(/[^a-z0-9]+/gi, '_')
  // ⚠️ Ces colonnes DOIVENT rester contiguës : l'export les replie comme un
  // groupe unique, et un groupe Google Sheets est une plage, pas une sélection.
  const g = domain
  return [
    // ⚠ Le domaine s'écrit UNE FOIS, ici, en tête de son bloc. Il était répété dans les
    // neuf en-têtes (« Produit — jardimax.com », « Prix TTC — jardimax.com »…) : neuf fois
    // la même information par concurrent, cent-vingt-six fois sur la feuille, au prix de
    // libellés si longs qu'ils s'enroulaient sur quatre lignes.
    //
    // Cette colonne reste vide et hors du groupe : elle sépare deux blocs — Google Sheets
    // fusionne les groupes adjacents de même niveau, et sans elle les quatorze concurrents
    // n'en formaient qu'un — et c'est elle qu'on lit quand le bloc est replié.
    { key: `bloc_${s}`, label: domain, kind: 'text' },
    ...([
      { f: 'nom', key: `nom_${s}`, label: 'Libellé', kind: 'text' },
      { f: 'prix_ttc', key: `prix_ttc_${s}`, label: 'Prix TTC', kind: 'price' },
      { f: 'prix_ht', key: `prix_ht_${s}`, label: 'Prix HT', kind: 'price' },
      { f: 'prix_barre', key: `prix_barre_${s}`, label: 'Prix barré TTC', kind: 'price' },
      { f: 'ecart', key: `ecart_${s}`, label: 'Écart %', kind: 'percent' },
      { f: 'stock', key: `stock_${s}`, label: 'Stock', kind: 'text' },
      { f: 'match', key: `match_${s}`, label: 'Correspondance', kind: 'text' },
      { f: 'image', key: `image_${s}`, label: 'Image', kind: 'text' },
      { f: 'url', key: `url_${s}`, label: 'Lien', kind: 'text' },
    ] as { f: SiteField; key: string; label: string; kind: MatrixColumn['kind'] }[])
      // Sans sélection, TOUT sort : un réglage jamais touché ne doit pas amputer l'export.
      .filter((c) => !fields || fields.has(c.f))
      .map(({ key, label, kind }) => ({ key, label, kind, group: g })),
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
  /** Appariement déjà réalisé (site par site). Sans lui, il est rejoué ici. */
  pairing?: PairingRun
  /** Champs retenus par concurrent. Absent = tous — cf. `SITE_FIELDS`. */
  siteFields?: Set<SiteField>
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
  return matrixFromPairing(products, sites,
    opts.pairing ?? pairAllSites(products, sites, indexBySite, { vatRate: opts.vatRate }), opts)
}

/**
 * Assemble la matrice à partir d'un appariement DÉJÀ fait (cf. `pairingRun`). C'est ce
 * chemin qu'emprunte le node : les sites y sont appariés au fil de leur lecture, un index
 * à la fois, au lieu d'être tous tenus en mémoire puis parcourus deux fois.
 */
export function matrixFromPairing(
  products: SourceProduct[],
  sites: SiteRef[],
  pairing: PairingRun,
  opts: BuildMatrixOptions = {},
): MatrixResult {
  const matchedOnly = opts.matchedOnly ?? true
  const labels = opts.labels ?? {}
  // Un concurrent sans le moindre appariement n'apporte que neuf colonnes vides sur toute
  // la hauteur de la feuille. On ne les écrit pas — mais JAMAIS au point de tout vider :
  // sans aucun site retenu, on garde la liste complète. Un appariement qui échoue en bloc
  // (index maigre, clés absentes) ne doit pas se traduire par un export amputé en silence,
  // cf. le recalcul qui avait ramené 20 980 produits appariés à 72.
  const withCells = new Set<string>()
  for (const cells of pairing.cellsByProduct.values()) for (const c of cells) withCells.add(c.siteId)
  const kept = withCells.size > 0 ? sites.filter((s) => withCells.has(s.siteId)) : sites
  const columns = [...baseColumns(labels), ...kept.flatMap((s) => siteColumns(s.domain, opts.siteFields))]

  const rows: Record<string, unknown>[] = []
  let matched = 0, matchedExact = 0, matchedOriginOnly = 0, unmatched = 0, noKey = 0

  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const cells = pairing.cellsByProduct.get(i) ?? []
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
    let exactHit = false

    for (const c of cells) {
      if (!c.proof.key.origin) exactHit = true
      const s = c.domain.replace(/[^a-z0-9]+/gi, '_')
      row[`nom_${s}`] = c.name
      row[`prix_ttc_${s}`] = c.cmp.priceTtc ?? ''
      row[`prix_ht_${s}`] = c.cmp.priceHt ?? ''
      row[`prix_barre_${s}`] = c.cmp.listPriceTtc ?? ''
      // Écart en points de % (-18,4) — lisible dans l'aperçu. L'export d'une colonne
      // `percent` le convertit en vrai pourcentage Excel (÷100 + format 0.0%).
      row[`ecart_${s}`] = c.cmp.deltaPct ?? ''
      row[`stock_${s}`] = c.cmp.availability ? AVAIL_LABEL[c.cmp.availability] : ''
      row[`match_${s}`] = matchLabel(c.proof)
      row[`image_${s}`] = c.image ?? ''
      row[`url_${s}`] = c.url
    }

    if (cells.length > 0) {
      matched++
      if (exactHit) matchedExact++
      else matchedOriginOnly++
    } else if (!pairing.totals.sawKey[i]) noKey++
    else unmatched++

    if (!matchedOnly || cells.length > 0) rows.push(row)
  }

  return {
    columns, rows, matched, matchedExact, matchedOriginOnly, unmatched, noKey,
    emptySites: sites.filter((s) => !kept.includes(s)).map((s) => s.domain),
    vetoed: pairing.totals.vetoed,
  }
}
