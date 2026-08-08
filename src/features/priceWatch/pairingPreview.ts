// Aperçu chiffré d'un changement de règles : on rejoue l'appariement d'UN concurrent
// avec deux jeux de règles et on dit ce qui change. PUR.
//
// ⚠ Pourquoi sur l'INDEX d'un site et non sur le rapport déjà stocké. Le rapport ne
// conserve, par cellule, que la NATURE de l'appariement (« EAN », « Référence », « Pièce
// d'origine ») — ni la preuve exacte (`sku` ou `ref-in-title` ?), ni la forme de la clé
// (chiffres nus ou référence structurée ?). Or ce sont précisément ces deux informations
// que les réglages manipulent. Un aperçu bâti sur le rapport ne saurait donc pas dire ce
// que « couper ref-in-title » retire, et il ne saurait RIEN dire de ce qu'un
// assouplissement ferait gagner — les candidats refusés n'y sont même pas comptés.
//
// En repartant de l'index d'un concurrent, l'aperçu est exact DANS LES DEUX SENS. Le prix
// à payer est qu'il porte sur un site à la fois : c'est un compromis assumé, et il est
// annoncé dans l'écran.
import { buildMemoryIndex, matchProduct, type SourceProduct } from './catalog/match'
import type { CompetitorListing } from './catalog/prestashop'
import type { MatchEvidence, PairingRules } from './catalog/pairingRules'

/** Une paire qui apparaît ou disparaît quand on change les règles. Non exportée :
 *  elle ne se manipule qu'à travers `PairingPreview` (convention du projet). */
interface PreviewChange {
  productId: string
  productName: string
  listingName: string
  listingUrl: string
  /** Preuve qui portait (ou porterait) l'appariement. */
  evidence: MatchEvidence
  /** Référence telle qu'écrite côté source — c'est sa FORME qui explique le plus souvent
   *  le changement (une suite de chiffres nus ne discrimine pas). */
  keyRaw: string
}

export interface PairingPreview {
  /** Produits appariés sur ce site avec les règles ACTUELLES. */
  before: number
  /** …et avec les règles proposées. */
  after: number
  /** Paires que le changement ferait disparaître (liste PLAFONNÉE, cf. `changeCap`). */
  lost: PreviewChange[]
  /** Paires que le changement ferait apparaître (liste PLAFONNÉE). */
  gained: PreviewChange[]
  /** Totaux RÉELS, avant plafonnement. Afficher « 50 » quand il y en a 4 000 serait un
   *  mensonge, et c'est le total qui décide d'appliquer ou non. */
  lostTotal: number
  gainedTotal: number
  /** Répartition des appariements par nature de preuve, avant et après. */
  byEvidence: { evidence: MatchEvidence; before: number; after: number }[]
  /** Fiches prouvées puis refusées par un démenti, avant et après. */
  vetoed: { before: number; after: number }
}

interface Hit {
  listing: CompetitorListing
  evidence: MatchEvidence
  keyRaw: string
}

/** Apparie tout le catalogue contre un site et retient, par produit, la fiche gagnante. */
function pairOnce(products: SourceProduct[], listings: CompetitorListing[], rules: PairingRules) {
  const lookup = buildMemoryIndex(listings, rules)
  const hits = new Map<string, Hit>()
  let vetoed = 0
  for (const p of products) {
    const m = matchProduct(p, 'preview', lookup, rules)
    vetoed += m.vetoed ?? 0
    if (m.outcome !== 'matched' || !m.listing || !m.proof) continue
    hits.set(p.id, { listing: m.listing, evidence: m.proof.evidence, keyRaw: m.proof.key.raw })
  }
  return { hits, vetoed }
}

/**
 * Compare deux jeux de règles sur un concurrent.
 *
 * `changeCap` borne les listes de paires détaillées : sur un catalogue de 75 000
 * références, un durcissement peut retirer des milliers de paires, et personne ne lit une
 * liste de milliers de lignes. Les COMPTEURS, eux, restent exacts — c'est ce qui décide.
 */
export function previewPairing(
  products: SourceProduct[],
  listings: CompetitorListing[],
  current: PairingRules,
  proposed: PairingRules,
  changeCap = 50,
): PairingPreview {
  const a = pairOnce(products, listings, current)
  const b = pairOnce(products, listings, proposed)
  const nameById = new Map(products.map((p) => [p.id, p.name]))

  const lost: PreviewChange[] = []
  const gained: PreviewChange[] = []
  const toChange = (id: string, h: Hit): PreviewChange => ({
    productId: id,
    productName: nameById.get(id) ?? id,
    listingName: h.listing.name,
    listingUrl: h.listing.url,
    evidence: h.evidence,
    keyRaw: h.keyRaw,
  })

  for (const [id, h] of a.hits) {
    const after = b.hits.get(id)
    // Une paire dont la fiche CHANGE compte comme perdue puis regagnée : ce n'est pas un
    // détail de présentation — c'est un autre concurrent, donc un autre prix.
    if (!after) lost.push(toChange(id, h))
    else if (after.listing.url !== h.listing.url) { lost.push(toChange(id, h)); gained.push(toChange(id, after)) }
  }
  for (const [id, h] of b.hits) if (!a.hits.has(id)) gained.push(toChange(id, h))

  const evidences = new Set<MatchEvidence>()
  for (const h of a.hits.values()) evidences.add(h.evidence)
  for (const h of b.hits.values()) evidences.add(h.evidence)
  const byEvidence = [...evidences].map((evidence) => ({
    evidence,
    before: [...a.hits.values()].filter((h) => h.evidence === evidence).length,
    after: [...b.hits.values()].filter((h) => h.evidence === evidence).length,
  })).sort((x, y) => (y.before + y.after) - (x.before + x.after))

  return {
    before: a.hits.size,
    after: b.hits.size,
    lost: lost.slice(0, changeCap),
    gained: gained.slice(0, changeCap),
    lostTotal: lost.length,
    gainedTotal: gained.length,
    byEvidence,
    vetoed: { before: a.vetoed, after: b.vetoed },
  }
}
