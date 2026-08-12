import { describe, it, expect } from 'vitest'
import { scorePair, withVisual, type PairSignals } from './confidence'

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

  // Cas RÉEL signalé comme « à vérifier » à tort : « ENJOLIVEUR » réf. 322110643/0 ↔
  // « Enjoliveur 140mm CASTELGARDEN - GGP 322110643/0 ». Aucun motif de doute, et
  // pourtant 67 — la seule cause était l'endroit de la preuve. Dix caractères délimités
  // ne sont pas une coïncidence : la forme de la clé doit compter autant que le chemin.
  it('classe comme sûre une clé DISTINCTIVE retrouvée comme mot entier dans le libellé', () => {
    const c = scorePair(base({
      evidence: 'ref-in-title', keyValue: '3221106430',
      sourceRef: '322110643/0', sourceEan: '8008989110330',
      sourceName: 'ENJOLIVEUR', listingName: 'Enjoliveur 140mm CASTELGARDEN - GGP 322110643/0',
      deltaPct: 58.7,
    }))
    expect(c.doubts).toEqual([])
    expect(c.band).toBe('sure')
  })

  it('ne promeut PAS une clé courte : c’est là que la coïncidence est plausible', () => {
    // Sept chiffres : assez pour échapper au malus `numeric-short`, pas assez pour être
    // tenu pour discriminant au milieu d'un texte libre. La bande reste « à vérifier ».
    const c = scorePair(base({ evidence: 'ref-in-title', keyValue: '1103647' }))
    expect(c.doubts).toEqual([])
    expect(c.band).toBe('check')
    // Une clé MIXTE discrimine à moindre longueur : une lettre suffit à sortir du bruit.
    expect(scorePair(base({ evidence: 'ref-in-title', keyValue: 'BQ1234' })).band).toBe('sure')
  })

  it('la promotion ne rachète jamais une clé courte tout en chiffres', () => {
    // Le CIRCLIP Gutbrod : « 11036 » retrouvé dans un slug Toyota. Clé faible ET numérique
    // courte — aucune promotion possible, et le double malus la maintient en doute.
    const c = scorePair(base({ evidence: 'ref-in-url', keyValue: '11036', key: { weak: true, origin: false } }))
    expect(c.doubts).toContain('numeric-short')
    expect(c.band).toBe('doubt')
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
    // ⚠ Assertion la plus importante du fichier depuis l'ajout du lexique de familles :
    // « BOX » et « Boîtier » en sont VOLONTAIREMENT absents. S'ils y entraient, cet
    // appariement juste basculerait en doute — et des milliers avec lui.
    expect(c.doubts).not.toContain('family-conflict')
  })

  // Cas RÉEL signalé : réf. 4109806 retrouvée dans l'URL du concurrent, donc appariement
  // « prouvé » — sauf que c'est un FILTRE À AIR à 11,42 € face à un DÉMARREUR à 469,90 €.
  // Les clés ne pouvaient rien voir ; le libellé et le prix, eux, démentent tous les deux.
  it('condamne un appariement dont les libellés nomment deux pièces différentes', () => {
    const c = scorePair(base({
      evidence: 'ref-in-url', keyValue: '4109806',
      sourceRef: '4109806', sourceEan: '3582329983211',
      sourceName: 'FILTRE A AIR', listingName: 'Démarreur KOHLER 4109806S',
      deltaPct: 4014.7,
    }))
    expect(c.doubts).toContain('family-conflict')
    expect(c.doubts).toContain('price-abyss')
    expect(c.band).toBe('doubt')
  })

  it('ne compte le prix qu’une fois : écart OU gouffre, jamais les deux', () => {
    expect(scorePair(base({ evidence: 'sku', deltaPct: 450 })).doubts).toEqual(['price-gulf'])
    expect(scorePair(base({ evidence: 'sku', deltaPct: 4014.7 })).doubts).toEqual(['price-abyss'])
    // Un facteur 2 ou 3 est le fonctionnement normal grossiste → détail : rien à signaler.
    expect(scorePair(base({ evidence: 'sku', deltaPct: 210 })).doubts).toEqual([])
  })

  it('un code-barres identique des deux côtés survit au gouffre de prix, en « à vérifier »', () => {
    // C'est alors le PRIX qui est suspect (lot, erreur de saisie), pas l'appariement :
    // le condamner ferait disparaître de l'audit la ligne la plus intéressante.
    const c = scorePair(base({
      evidence: 'gtin13', sourceEan: '4049582395377', listingEan: '4049582395377',
      deltaPct: 4014.7,
    }))
    expect(c.band).toBe('check')
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

describe('scorePair — une clé numérique courte n’est pas une preuve', () => {
  // Cas VÉCU sur manomano.fr : « CIRCLIP GUTBROD » réf. 000.11.036 apparié à
  // « Bardusch-Filtre à Gaz Sous Vide 90917-11036 » — une pièce Toyota. La clé dépaddée
  // valait « 11036 », cinq chiffres présents dans le slug du concurrent.
  it('bascule en doute le CIRCLIP apparié à un filtre Toyota', () => {
    const c = scorePair(base({
      evidence: 'ref-in-url', keyValue: '11036',
      sourceName: 'CIRCLIP GUTBROD',
      listingName: 'Bardusch-Filtre à Gaz Sous Vide 90917-11036 Compatible HiAce Land Coaster',
    }))
    expect(c.doubts).toContain('numeric-short')
    expect(c.band).toBe('doubt')
  })

  it('épargne une référence ALPHANUMÉRIQUE de même longueur', () => {
    // « A35B7 » ne se retrouve pas par hasard dans une URL, « 11036 » si.
    expect(scorePair(base({ evidence: 'ref-in-url', keyValue: 'A35B7' })).doubts).not.toContain('numeric-short')
  })

  it('épargne une référence numérique assez longue', () => {
    expect(scorePair(base({ evidence: 'ref-in-url', keyValue: '3256000773' })).doubts).not.toContain('numeric-short')
  })

  it('n’applique rien quand la preuve vient d’un champ DÉCLARÉ', () => {
    // Dans un `sku`, une valeur courte n'est pas là par hasard : le marchand l'a saisie
    // comme référence, ce n'est pas un nombre croisé dans un texte.
    expect(scorePair(base({ evidence: 'sku', keyValue: '11036' })).doubts).not.toContain('numeric-short')
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

describe('withVisual — le seul démenti qui porte sur les OBJETS', () => {
  const acquis = () => scorePair(base({ evidence: 'sku', sourceRef: 'ABC123', listingRef: 'ABC123' }))

  it('fait tomber un appariement dont les photos montrent deux objets différents', () => {
    const c = withVisual(acquis(), 'different')
    expect(c.doubts).toContain('visual-conflict')
    expect(c.band).toBe('doubt')
  })

  it('ne touche à RIEN sur « indéterminé » : un logo générique n’est pas un indice', () => {
    const before = acquis()
    expect(withVisual(before, 'unclear')).toBe(before)
  })

  it('« même pièce » monte le score SANS changer de bande : deux photos ne prouvent pas une référence', () => {
    const before = scorePair(base({ evidence: 'ref-in-title', keyValue: '1103647' }))
    expect(before.band).toBe('check')
    const after = withVisual(before, 'same')
    expect(after.supports).toContain('visual-echo')
    expect(after.score).toBeGreaterThan(before.score)
    expect(after.band).toBe('check')
  })

  it('est idempotent : rejouer le même verdict ne cumule pas', () => {
    const once = withVisual(acquis(), 'different')
    expect(withVisual(once, 'different')).toBe(once)
    const up = withVisual(acquis(), 'same')
    expect(withVisual(up, 'same')).toBe(up)
  })

  it('un code-barres déclaré des deux côtés survit à des photos contredites, en « à vérifier »', () => {
    // Le visuel source est souvent un logo maison ou une prise de vue sous un autre angle :
    // condamner un GTIN identique sur cette seule base ferait plus de dégâts qu'il n'en évite.
    const gtin = scorePair(base({ evidence: 'gtin13', sourceEan: '4049582395377', listingEan: '4049582395377' }))
    expect(withVisual(gtin, 'different').band).toBe('check')
  })
})

describe('⚠ une SECONDE référence concordante n’est pas un renfort, c’est une preuve', () => {
  // Cas remonté du rapport de production : « PIGNON ETOILE 6 DENTS » (« Remplace origine:
  // 460663, 538243909 ») apparié à « Pignon de tronçonneuse 460663 - 538243909
  // HUSQVARNA » — les DEUX références y figurent, les deux libellés disent « pignon » — et
  // l'appariement dormait en DOUTEUX 20, faute de rien pour compenser le cumul « clé
  // numérique courte » + « référence d'origine ». La file rouge est faite pour ce qu'il
  // faut vérifier, pas pour ce qui est déjà corroboré deux fois.
  const pignon = {
    evidence: 'ref-in-url' as const,
    key: { weak: false, origin: true },
    keyValue: '460663',
    sourceName: 'PIGNON ETOILE 6 DENTS',
    listingName: 'Pignon de tronçonneuse 460663 - 538243909 HUSQVARNA - ALKO - MC CULLOCH',
    deltaPct: -47.8,
  }

  it('remonte la bande — le seul renfort qui en ait le pouvoir', () => {
    expect(scorePair(pignon).band).toBe('doubt')
    const corroboré = scorePair({ ...pignon, otherKeys: ['460663', '538243909'] })
    expect(corroboré.band).toBe('check')
    expect(corroboré.supports).toContain('second-key')
  })

  it('exige le MOT ENTIER : une clé absente du libellé ne renforce rien', () => {
    const c = scorePair({ ...pignon, otherKeys: ['460663', '999999999'] })
    expect(c.supports).not.toContain('second-key')
    expect(c.band).toBe('doubt')
  })

  it('ignore la clé qui a déjà prouvé — sinon toute paire se corroborerait elle-même', () => {
    expect(scorePair({ ...pignon, otherKeys: ['460663'] }).supports).not.toContain('second-key')
  })
})
