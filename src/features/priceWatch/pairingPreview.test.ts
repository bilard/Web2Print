import { describe, it, expect } from 'vitest'
import { previewPairing } from './pairingPreview'
import { DEFAULT_PAIRING_RULES, resolvePairingRules } from './catalog/pairingRules'
import type { SourceProduct } from './catalog/match'
import type { CompetitorListing } from './catalog/competitorListing'

const products: SourceProduct[] = [
  { id: 'p1', name: 'COURROIE', ref: '6151-704-2110', price: 6 },
  { id: 'p2', name: 'ALTERNATEUR', ref: 'BS691991', price: 80 },
]
const listings: CompetitorListing[] = [
  // Réf lisible SEULEMENT dans le libellé : c'est la preuve la plus fragile du jeu.
  { url: 'https://x.fr/a.html', name: 'Courroie tondeuse autoportée VIKING 6151-704-2110', price: 8.4 },
  // Réf déclarée : preuve solide, insensible aux réglages de libellé.
  { url: 'https://x.fr/b.html', name: 'Alternateur', ref: 'BS691991', price: 98 },
]

describe('previewPairing', () => {
  it('ne rapporte aucun changement quand les deux jeux sont identiques', () => {
    const p = previewPairing(products, listings, DEFAULT_PAIRING_RULES, DEFAULT_PAIRING_RULES)
    expect(p.before).toBe(2)
    expect(p.after).toBe(2)
    expect(p.lostTotal).toBe(0)
    expect(p.gainedTotal).toBe(0)
  })

  it('chiffre ce qu’un durcissement fait PERDRE, avec la paire en cause', () => {
    const strict = resolvePairingRules({ evidence: { 'ref-in-title': false } as never })
    const p = previewPairing(products, listings, DEFAULT_PAIRING_RULES, strict)
    expect(p.before).toBe(2)
    expect(p.after).toBe(1)
    expect(p.lostTotal).toBe(1)
    expect(p.lost[0]).toMatchObject({
      productId: 'p1', evidence: 'ref-in-title', keyRaw: '6151-704-2110',
    })
    // La preuve solide n'est pas touchée : le réglage est chirurgical, et l'écran doit
    // pouvoir le montrer plutôt que d'annoncer une perte globale.
    expect(p.gainedTotal).toBe(0)
  })

  it('chiffre aussi ce qu’un assouplissement fait GAGNER', () => {
    // C'est le sens que le rapport stocké ne saurait PAS rendre : les candidats refusés
    // n'y sont même pas comptés. En repartant de l'index, on le voit.
    const listing = [{ url: 'https://x.fr/c.html', name: 'Filtre à huile KOHLER BS5205002', ref: 'BS5205002', price: 12 }]
    const product = [{ id: 'p9', name: 'GICLEUR CARBURATEUR', ref: 'BS5205002', price: 9 }]

    const loose = resolvePairingRules({ familyVeto: false })
    const p = previewPairing(product, listing, DEFAULT_PAIRING_RULES, loose)
    expect(p.before).toBe(0)
    expect(p.after).toBe(1)
    expect(p.gainedTotal).toBe(1)
    expect(p.gained[0].productId).toBe('p9')
    // Le compteur de refus tombe : c'est la contrepartie, et elle doit se voir.
    expect(p.vetoed.before).toBe(1)
    expect(p.vetoed.after).toBe(0)
  })

  it('compte une paire dont la FICHE change comme perdue puis regagnée', () => {
    // Ce n'est pas un détail de présentation : c'est un autre concurrent, donc un autre
    // prix dans le comparatif.
    // Deux fiches du même site portent la même référence : celle dont l'adresse la
    // contient est rencontrée en premier et gagne. Couper cette preuve fait passer
    // l'appariement sur l'autre fiche — même produit, autre prix.
    const two: CompetitorListing[] = [
      { url: 'https://x.fr/lames/1-lame-mulching-181004383-0.html', name: 'Lame mulching', price: 25 },
      { url: 'https://x.fr/b.html', name: 'Lame', ref: '181004383', price: 20 },
    ]
    const p1 = [{ id: 'p1', name: 'LAME', ref: '181004383', price: 15 }]

    const before = previewPairing(p1, two, DEFAULT_PAIRING_RULES, DEFAULT_PAIRING_RULES)
    expect(before.lost).toHaveLength(0)

    const noUrl = resolvePairingRules({ evidence: { 'ref-in-url': false } as never })
    const p = previewPairing(p1, two, DEFAULT_PAIRING_RULES, noUrl)
    expect(p.before).toBe(1)
    expect(p.after).toBe(1) // toujours apparié…
    expect(p.lostTotal).toBe(1) // …mais plus à la même fiche
    expect(p.gainedTotal).toBe(1)
    expect(p.lost[0].listingUrl).toContain('181004383')
    expect(p.gained[0].listingUrl).toBe('https://x.fr/b.html')
  })

  it('plafonne les listes détaillées mais jamais les totaux', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`, name: 'COURROIE', ref: `6151-704-21${i}0`, price: 6,
    }))
    const manyListings = many.map((p, i) => ({
      url: `https://x.fr/${i}.html`, name: `Courroie VIKING ${p.ref}`, price: 8,
    }))
    const strict = resolvePairingRules({ evidence: { 'ref-in-title': false } as never })
    const p = previewPairing(many, manyListings, DEFAULT_PAIRING_RULES, strict, 3)
    expect(p.lost).toHaveLength(3)
    expect(p.lostTotal).toBe(8)
  })
})
