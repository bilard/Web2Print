import { describe, it, expect } from 'vitest'
import { measurePairing } from './pairingWeights'
import { DEFAULT_PAIRING_RULES, resolvePairingRules } from './catalog/pairingRules'
import { vetoReason, vetoedPair } from './catalog/match'
import type { SourceProduct } from './catalog/match'
import type { CompetitorListing } from './catalog/competitorListing'
import type { MatchProof } from './catalog/keys'

const proof = (raw: string, evidence: MatchProof['evidence'] = 'ref-in-url'): MatchProof => ({
  key: { kind: 'ref', value: raw.replace(/\W/g, ''), weak: false, origin: false, raw },
  evidence,
})

describe('vetoReason', () => {
  it('nomme le démenti qui refuse, et s’arrête au PREMIER', () => {
    // Cette paire déclenche à la fois le conflit de familles et le gouffre de prix.
    // Elle ne doit être comptée qu'une fois, sous le premier — sinon les compteurs par
    // démenti dépasseraient le total des refus et l'écran mentirait sur ce que chaque
    // réglage coûte.
    const r = vetoReason(
      { name: 'FILTRE A AIR', price: 11.42 },
      { name: 'Démarreur KOHLER', price: 469.9 },
      proof('BS4109806'),
    )
    expect(r).toBe('family')
  })

  it('rend le gouffre de prix quand aucun mot ne parle', () => {
    // ⚠ Libellés choisis HORS du lexique des deux côtés : « roue » et « chaussure » y
    // figurent, et le conflit de familles se déclencherait AVANT le prix — ce qui est le
    // bon comportement du moteur, mais ne testerait pas ce qu'on veut ici.
    expect(vetoReason(
      { name: 'BAGUE DE FIXATION', price: 1.91 },
      { name: 'Entretoise inox 8 mm', price: 176.32 },
      proof('BS7200341'),
    )).toBe('price-abyss')
  })

  it('rend l’absence de corroboration sur une clé en chiffres nus', () => {
    expect(vetoReason(
      { name: 'CIRCLIP GUTBROD', price: 3 },
      { name: 'Vanne hydraulique', price: 9 },
      proof('11036'),
    )).toBe('no-corroboration')
  })

  it('null sur une paire retenue, et `vetoedPair` reste d’accord', () => {
    const source = { name: 'CARBURATEUR', price: 20 }
    const candidate = { name: 'Carburateur RYOBI', price: 30 }
    expect(vetoReason(source, candidate, proof('BS5131028'))).toBeNull()
    expect(vetoedPair(source, candidate, proof('BS5131028'))).toBe(false)
  })

  it('un code-barres n’est jamais démenti', () => {
    expect(vetoReason(
      { name: 'ENJOLIVEUR', price: 5 },
      { name: 'Protection de Roue Droite', price: 400 },
      { key: { kind: 'ean', value: '3582321853475', weak: false, origin: false, raw: '3582321853475' }, evidence: 'gtin13' },
    )).toBeNull()
  })
})

describe('measurePairing', () => {
  const products: SourceProduct[] = [
    { id: 'p1', name: 'ALTERNATEUR', ref: 'BS691991', price: 80 },
    { id: 'p2', name: 'COURROIE', ref: '6151-704-2110', price: 6 },
    { id: 'p3', name: 'LAME', ean: '3582321853475', price: 15 },
    { id: 'p4', name: 'GICLEUR CARBURATEUR', ref: 'BS5205002', price: 9 },
    { id: 'p5', name: 'LAME ADAPTABLE', ref: 'F1-ZZ-9', originRefs: ['516747'], price: 12 },
  ]
  const listings: CompetitorListing[] = [
    { url: 'https://x.fr/a.html', name: 'Alternateur', ref: 'BS691991', price: 98 },
    { url: 'https://x.fr/b.html', name: 'Courroie autoportée VIKING 6151-704-2110', price: 8.4 },
    { url: 'https://x.fr/c.html', name: 'Lame 51cm', gtin13: '3582321853475', price: 20 },
    { url: 'https://x.fr/d.html', name: 'Filtre à huile KOHLER BS5205002', ref: 'BS5205002', price: 12 },
    { url: 'https://x.fr/e.html', name: 'Lame AL-KO 516747', ref: '516747', price: 22 },
  ]

  it('ventile les appariements par voie de clé et par nature de preuve', () => {
    const w = measurePairing(products, listings, DEFAULT_PAIRING_RULES)
    expect(w.products).toBe(5)
    expect(w.listings).toBe(5)
    // p4 est refusé par le veto des familles (gicleur ↔ filtre) : 4 appariés sur 5.
    expect(w.matched).toBe(4)
    // ⚠ Les deux axes sont INDÉPENDANTS, et c'est tout l'intérêt de les montrer
    // séparément dans l'arbre : p5 est apparié par la VOIE « référence d'origine » et sa
    // PREUVE est un `sku` déclaré. Compter 1 ici serait confondre les deux.
    expect(w.byEvidence.sku).toBe(2) // p1 (réf propre) + p5 (réf d'origine)
    expect(w.byEvidence['ref-in-title']).toBe(1) // p2
    expect(w.byEvidence.gtin13).toBe(1) // p3
    expect(w.byKey.ean).toBe(1)
    expect(w.byKey.origin).toBe(1) // p5, apparié via la réf d'origine
    // Les deux ventilations totalisent le même nombre d'appariements.
    const sumKeys = Object.values(w.byKey).reduce((n, v) => n + v, 0)
    const sumEvidence = Object.values(w.byEvidence).reduce((n, v) => n + v, 0)
    expect(sumKeys).toBe(w.matched)
    expect(sumEvidence).toBe(w.matched)
  })

  it('dit QUEL démenti refuse, et la somme égale le total', () => {
    const w = measurePairing(products, listings, DEFAULT_PAIRING_RULES)
    expect(w.vetoed).toBe(1)
    expect(w.byVeto.family).toBe(1)
    const sum = Object.values(w.byVeto).reduce((n, v) => n + v, 0)
    expect(sum).toBe(w.vetoed)
  })

  it('les compteurs suivent les règles : couper une preuve la vide', () => {
    const rules = resolvePairingRules({ evidence: { 'ref-in-title': false } as never })
    const w = measurePairing(products, listings, rules)
    expect(w.byEvidence['ref-in-title']).toBeUndefined()
    expect(w.matched).toBe(3)
  })

  it('chiffre les clés supprimées par les seuils de longueur', () => {
    // Un seuil ne produit aucun appariement : il en retire. Son poids ne peut donc
    // s'exprimer qu'en clés émises vs supprimées.
    const strict = resolvePairingRules({ minRefLen: 9, weakRefLen: 12 })
    const w = measurePairing(products, listings, strict)
    expect(w.keysSuppressed).toBeGreaterThan(0)

    const asDefault = measurePairing(products, listings, resolvePairingRules({ minRefLen: 2, weakRefLen: 3 }))
    expect(asDefault.keysSuppressed).toBe(0)
  })
})
