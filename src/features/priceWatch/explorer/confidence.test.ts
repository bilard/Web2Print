import { describe, it, expect } from 'vitest'
import { scorePair, type PairSignals } from './confidence'

const base = (over: Partial<PairSignals> = {}): PairSignals => ({
  evidence: 'ref-in-title', key: { weak: false, origin: false }, ...over,
})

describe('scorePair — la nature de la preuve fixe le point de départ', () => {
  it('classe un code-barres déclaré comme sûr, une réf. dans un libellé comme à vérifier', () => {
    expect(scorePair(base({ evidence: 'gtin13' })).band).toBe('sure')
    expect(scorePair(base({ evidence: 'sku' })).band).toBe('sure')
    // Preuve la plus fragile du jeu : elle appelle un contrôle humain même sans
    // contradiction — un nombre dans un titre peut n'être qu'un nombre.
    expect(scorePair(base({ evidence: 'ref-in-title' })).band).toBe('check')
    // Référence complète en tête de titre ou token entier du slug : `proveMatch` ne les
    // accepte que sur une clé FORTE. Les classer sous la barre rendait « sûrs seulement »
    // vide sur tout un site PrestaShop sans données structurées — lu comme une panne.
    expect(scorePair(base({ evidence: 'ref-in-url' })).band).toBe('sure')
    expect(scorePair(base({ evidence: 'ref-in-name' })).band).toBe('sure')
  })

  it('ordonne les preuves de la plus concluante à la plus fragile', () => {
    const s = (e: PairSignals['evidence']) => scorePair(base({ evidence: e })).score
    expect(s('gtin13')).toBeGreaterThan(s('ean-in-url'))
    expect(s('ean-in-url')).toBeGreaterThan(s('sku'))
    expect(s('sku')).toBeGreaterThan(s('ref-in-name'))
    expect(s('ref-in-name')).toBeGreaterThan(s('ref-in-url'))
    expect(s('ref-in-url')).toBeGreaterThan(s('ref-in-title'))
  })
})

describe('scorePair — on retranche pour une CONTRADICTION, jamais pour une absence', () => {
  // Cas RÉEL vérifié comme juste : « SWITCH BOX BATTERY EL380Li » ↔ « Boîtier de
  // commutation CASTELGARDEN 3816005331 – 381600533/1 ». Le catalogue F1 est en anglais,
  // celui du marchand en français : ZÉRO mot commun. Pénaliser l'absence de recoupement
  // classerait douteux un appariement prouvé par référence — et rendrait l'écran d'audit
  // rouge à tort dès la première page.
  it('ne condamne pas un appariement juste dont les libellés sont dans deux langues', () => {
    const c = scorePair(base({
      evidence: 'ref-in-title',
      sourceName: 'SWITCH BOX BATTERY EL380Li YELLOW 1021',
      listingName: 'Boîtier de commutation CASTELGARDEN 3816005331 - 381600533/1',
      sourceEan: '7313323193476', sourceRef: '381600533/1',
      deltaPct: 9.9,
    }))
    expect(c.band).not.toBe('doubt')
    expect(c.doubts).toEqual([])
  })

  it('un code-barres contredit reste douteux quels que soient les renforts', () => {
    const c = scorePair(base({
      evidence: 'gtin13',
      sourceEan: '4049582395377', listingEan: '4049582856748',
      sourceName: 'Courroie tondeuse', listingName: 'Courroie tondeuse',
      sourceRef: 'ABC-123', listingRef: 'ABC-123',
    }))
    expect(c.doubts).toContain('ean-conflict')
    expect(c.band).toBe('doubt')
  })

  it('un seul côté sans code-barres ne contredit rien', () => {
    // La plupart des marchands ne publient aucun EAN : l'absence est la norme.
    const c = scorePair(base({ evidence: 'sku', sourceEan: '4049582395377', listingEan: null }))
    expect(c.doubts).toEqual([])
    expect(c.band).toBe('sure')
  })

  it('signale une clé faible et une correspondance indirecte', () => {
    expect(scorePair(base({ key: { weak: true, origin: false } })).doubts).toContain('weak-key')
    expect(scorePair(base({ key: { weak: false, origin: true } })).doubts).toContain('origin-key')
  })

  it('signale une fiche revendiquée par plusieurs produits F1', () => {
    // Au moins un des deux se trompe : aucun autre signal ne voit ce défaut.
    expect(scorePair(base({ contenders: 1 })).doubts).not.toContain('contested')
    expect(scorePair(base({ evidence: 'sku', contenders: 3 })).doubts).toContain('contested')
  })

  it('ne compte pas une référence divergente quand c’est ELLE qui a prouvé', () => {
    // Preuve `sku` : les deux valeurs sont égales par construction, une différence
    // apparente ne vient que d'un affichage (variante « /0 »), pas d'une contradiction.
    const sig = { sourceRef: '181004383', listingRef: '181004383/0' }
    expect(scorePair(base({ evidence: 'sku', ...sig })).doubts).not.toContain('ref-conflict')
    expect(scorePair(base({ evidence: 'ref-in-title', ...sig })).doubts).toContain('ref-conflict')
  })
})

describe('scorePair — le prix', () => {
  it('tolère le facteur grossiste → détail, alerte au-delà', () => {
    // F1 vend en gros, ces concurrents au détail : un facteur 2 ou 3 est le marché.
    expect(scorePair(base({ evidence: 'sku', deltaPct: 180 })).doubts).not.toContain('price-gulf')
    expect(scorePair(base({ evidence: 'sku', deltaPct: 900 })).doubts).toContain('price-gulf')
  })

  it('ne surveille pas le bas, déjà écarté en amont', () => {
    // `comparePrices` rejette tout prix sous −60 % (erreur de parsing présumée) : le
    // pénaliser ici doublerait une sanction déjà appliquée.
    expect(scorePair(base({ evidence: 'sku', deltaPct: -55 })).doubts).toEqual([])
  })
})

describe('scorePair — les renforts', () => {
  it('remontent le score sans jamais racheter une contradiction', () => {
    const nu = scorePair(base({ evidence: 'ref-in-url' }))
    const riche = scorePair(base({
      evidence: 'ref-in-url',
      sourceName: 'Courroie tondeuse Stiga', listingName: 'Courroie tondeuse Stiga renforcée',
      sourceEan: '4049582395377', listingEan: '4049582395377',
    }))
    expect(riche.score).toBeGreaterThan(nu.score)
    expect(riche.supports).toContain('title-echo')
    expect(riche.supports).toContain('ean-echo')

    // Clé faible ET indirecte : deux mots de libellé en commun ne doivent pas suffire à
    // repasser la barre. Les renforts affinent le score dans la bande, ils n'en sortent pas.
    const contredit = scorePair(base({
      evidence: 'sku', key: { weak: true, origin: true },
      sourceName: 'Courroie tondeuse Stiga', listingName: 'Courroie tondeuse Stiga renforcée',
    }))
    expect(contredit.band).toBe('doubt')
    expect(contredit.score).toBeLessThan(45)
  })

  it('ignore les nombres communs : une même cote se retrouve partout', () => {
    const c = scorePair(base({ sourceName: 'Lame 510 mm', listingName: 'Filtre 510 mm' }))
    expect(c.supports).not.toContain('title-echo')
  })

  it('borne le score à 100', () => {
    const c = scorePair(base({
      evidence: 'gtin13',
      sourceEan: '4049582395377', listingEan: '4049582395377',
      sourceRef: 'ABC123', listingRef: 'ABC123',
      sourceName: 'Courroie tondeuse Stiga renforcée', listingName: 'Courroie tondeuse Stiga renforcée',
    }))
    expect(c.score).toBe(100)
  })
})
