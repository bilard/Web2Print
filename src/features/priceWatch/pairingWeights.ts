// Poids RÉELS de chaque branche de l'arbre de décision, mesurés sur un concurrent. PUR.
//
// ⚠ Ce que ces nombres veulent dire, et ce qu'ils NE veulent pas dire. La boucle
// d'appariement est clé-majeure et s'arrête au premier candidat accepté : « code-barres
// déclaré : 812 » signifie donc « 812 produits ont été appariés PAR CETTE VOIE », et non
// « 812 fiches portaient un code-barres exploitable ». Couper une voie ne déverse pas son
// compte dans la suivante — certains produits basculeront sur une preuve plus faible,
// d'autres seront perdus. C'est précisément ce que l'aperçu avant/après est là pour dire,
// et c'est pourquoi l'écran nomme ces nombres « appariements obtenus par cette voie ».
import { buildMemoryIndex, matchProduct, type SourceProduct, type VetoReason } from './catalog/match'
import { candidateKeys } from './catalog/keys'
import type { CompetitorListing } from './catalog/prestashop'
import type { MatchEvidence, PairingRules } from './catalog/pairingRules'

/** Voie de clé, telle que l'arbre la présente — plus lisible que `kind` + `origin`. */
export type KeyBranch = 'ean' | 'ref' | 'ref-nozero' | 'origin'

export interface PairingWeights {
  /** Produits du catalogue source pris en compte. */
  products: number
  /** Fiches indexées chez ce concurrent (après dédoublonnage par URL). */
  listings: number
  /** Produits appariés en tout. */
  matched: number
  /** Appariements obtenus par chaque voie de clé. */
  byKey: Record<KeyBranch, number>
  /** Appariements obtenus par chaque nature de preuve. */
  byEvidence: Partial<Record<MatchEvidence, number>>
  /** Candidats prouvés puis refusés, par démenti. Le premier démenti qui se déclenche
   *  compte seul (cf. `vetoReason`) : la somme égale donc le total des refus. */
  byVeto: Partial<Record<VetoReason, number>>
  /** Total des refus. */
  vetoed: number
  /** Clés de jointure que le catalogue source émet avec les règles courantes, et combien
   *  les DEUX seuils de longueur en suppriment. Les seuils ne produisent aucun
   *  appariement — ils en retirent : leur poids ne peut donc s'exprimer qu'ainsi. */
  keysEmitted: number
  keysSuppressed: number
}

/** Voie de clé d'une preuve. Une référence d'origine est présentée à part : elle apparie
 *  la pièce REMPLACÉE, ce qui n'est pas le même article. */
function branchOf(kind: 'ean' | 'ref' | 'ref-nozero', origin: boolean): KeyBranch {
  return origin ? 'origin' : kind
}

/**
 * Mesure l'appariement d'un catalogue contre un concurrent avec un jeu de règles donné.
 *
 * Coût : une passe d'appariement complète (O(produits)), la même que celle de l'écran
 * « Concurrents ». À appeler dans un `useMemo`, jamais dans un rendu nu.
 */
export function measurePairing(
  products: SourceProduct[],
  listings: CompetitorListing[],
  rules: PairingRules,
): PairingWeights {
  const lookup = buildMemoryIndex(listings, rules)
  const byKey: Record<KeyBranch, number> = { ean: 0, ref: 0, 'ref-nozero': 0, origin: 0 }
  const byEvidence: Partial<Record<MatchEvidence, number>> = {}
  const byVeto: Partial<Record<VetoReason, number>> = {}
  let matched = 0
  let vetoed = 0

  // Les seuils de longueur ne se mesurent pas en appariements : on compte les clés que le
  // catalogue émet aujourd'hui, et celles qu'un seuil au plus permissif ferait apparaître.
  // Sans ce repère, un stepper réglé à 7 ne dit rien de ce qu'il coûte.
  const permissive: PairingRules = { ...rules, minRefLen: 2, weakRefLen: 3 }
  let keysEmitted = 0
  let keysPermissive = 0

  for (const p of products) {
    keysEmitted += candidateKeys(p, rules).length
    keysPermissive += candidateKeys(p, permissive).length
    const m = matchProduct(p, 'weights', lookup, rules)
    vetoed += m.vetoed ?? 0
    for (const [reason, n] of Object.entries(m.vetoedBy ?? {})) {
      byVeto[reason as VetoReason] = (byVeto[reason as VetoReason] ?? 0) + n
    }
    if (m.outcome !== 'matched' || !m.proof) continue
    matched++
    byKey[branchOf(m.proof.key.kind, m.proof.key.origin)]++
    byEvidence[m.proof.evidence] = (byEvidence[m.proof.evidence] ?? 0) + 1
  }

  return {
    products: products.length,
    listings: listings.length,
    matched,
    byKey,
    byEvidence,
    byVeto,
    vetoed,
    keysEmitted,
    // Jamais négatif : un seuil PLUS permissif ne peut qu'ajouter des clés.
    keysSuppressed: Math.max(0, keysPermissive - keysEmitted),
  }
}
