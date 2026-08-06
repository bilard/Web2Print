// Cas issus d'un relevé terrain sur 5 concurrents PrestaShop (motoculture).
import { describe, it, expect } from 'vitest'
import {
  normalizeRef, stripLeadingZeros, normalizeEan, isInternalBarcode,
  candidateKeys, proveMatch, refTokensFromUrl, refTokensFromText,
} from './keys'

describe('normalizeRef', () => {
  it('retire les séparateurs et met en majuscules', () => {
    expect(normalizeRef('112794117/0')).toBe('1127941170')
    expect(normalizeRef('00.1857.40')).toBe('00185740')
    expect(normalizeRef('bs-790287')).toBe('BS790287')
    expect(normalizeRef('1137-1069-01')).toBe('1137106901')
  })
  it('tolère null/undefined/vide', () => {
    expect(normalizeRef(null)).toBe('')
    expect(normalizeRef(undefined)).toBe('')
    expect(normalizeRef('   ')).toBe('')
  })
})

describe('stripLeadingZeros', () => {
  it('retire le padding de tête', () => {
    expect(stripLeadingZeros('0306030002')).toBe('306030002')
  })
  it('ne vide jamais une référence entièrement composée de zéros', () => {
    expect(stripLeadingZeros('000')).toBe('000')
  })
})

describe('normalizeEan', () => {
  it('garde un GTIN-13', () => {
    expect(normalizeEan('4049582772185')).toBe('4049582772185')
  })
  it('ramène un GTIN-14 à 13', () => {
    expect(normalizeEan('04049582772185')).toBe('4049582772185')
  })
  it('ignore les longueurs non exploitables', () => {
    expect(normalizeEan('12345')).toBe('')
    expect(normalizeEan('')).toBe('')
  })
})

describe('isInternalBarcode', () => {
  // Codes réellement observés chez webmotoculture, qui émet ses propres codes-barres.
  it('détecte les codes internes à la boutique', () => {
    expect(isInternalBarcode('2100001154035')).toBe(true)
    expect(isInternalBarcode('3000317169534')).toBe(true)
  })
  it('laisse passer les préfixes fabricant', () => {
    expect(isInternalBarcode('4049582772185')).toBe(false) // MTD
    expect(isInternalBarcode('8008989459996')).toBe(false) // GGP
    expect(isInternalBarcode('3582321853475')).toBe(false) // F1
  })
})

describe('candidateKeys', () => {
  it('ordonne EAN puis références, et ajoute la variante sans zéros', () => {
    const keys = candidateKeys({ ref: '0306030002', ean: '3582321864143' })
    expect(keys.map((k) => `${k.kind}:${k.value}`)).toEqual([
      'ean:3582321864143',
      'ref:0306030002',
      'ref-nozero:306030002',
    ])
  })
  it('écarte un code-barres interne : il ne joint rien entre enseignes', () => {
    const keys = candidateKeys({ ref: 'ABC123', ean: '2100001154035' })
    expect(keys.some((k) => k.kind === 'ean')).toBe(false)
  })
  it('marque les références courtes comme faibles', () => {
    const [a35] = candidateKeys({ ref: 'A35' })
    expect(a35.weak).toBe(true)
    const [long] = candidateKeys({ ref: '725-04478' })
    expect(long.weak).toBe(false)
  })
  it('ignore les références trop courtes pour discriminer', () => {
    expect(candidateKeys({ ref: 'A2' })).toEqual([])
  })
  it('intègre les références d’origine extraites de la description', () => {
    const keys = candidateKeys({ ref: '1100003', originRefs: ['516747', '344769'] })
    expect(keys.map((k) => k.value)).toContain('516747')
    expect(keys.map((k) => k.value)).toContain('344769')
  })
  it('déduplique', () => {
    const keys = candidateKeys({ ref: 'BS790287', ref2: 'bs-790287' })
    expect(keys.filter((k) => k.value === 'BS790287')).toHaveLength(1)
  })
})

describe('proveMatch — appariements prouvés', () => {
  it('gtin13 fabricant identique (pro-motoculture)', () => {
    const keys = candidateKeys({ ref: '5208362', ean: '3582321853475' })
    const proof = proveMatch(keys, { gtin13: '3582321853475', sku: 'PM04881' })
    expect(proof?.evidence).toBe('gtin13')
  })
  it('EAN dans le slug d’URL (emc-motoculture)', () => {
    const keys = candidateKeys({ ref: '725-04478', ean: '4049582772185' })
    const proof = proveMatch(keys, { url: 'https://emc-motoculture.com/reserve/73047-cable-4049582772185.html' })
    expect(proof?.evidence).toBe('ean-in-url')
  })
  it('sku déclaré identique, réf interne du distributeur (webmotoculture)', () => {
    const keys = candidateKeys({ ref: '5208362' })
    expect(proveMatch(keys, { sku: '5208362' })?.evidence).toBe('sku')
  })
  it('sku déclaré identique, réf constructeur brute (jardimax)', () => {
    const keys = candidateKeys({ ref: '1137-1069-01' })
    expect(proveMatch(keys, { sku: '1137-1069-01' })?.evidence).toBe('sku')
  })
  it('sku normalisé sans séparateurs (emc-motoculture)', () => {
    const keys = candidateKeys({ ref: '1137-1069-01' })
    expect(proveMatch(keys, { sku: '1137106901' })?.evidence).toBe('sku')
  })
  it('référence en tête de titre (emc-motoculture)', () => {
    const keys = candidateKeys({ ref: '5131028856' })
    const proof = proveMatch(keys, { name: '5131028856 - Carburateur pour RYOBI - HOMELITE' })
    expect(proof?.evidence).toBe('ref-in-name')
  })
  it('tolère le padding divergent entre ERP et boutique', () => {
    const keys = candidateKeys({ ref: '0306030002' })
    expect(proveMatch(keys, { sku: '306030002' })).not.toBeNull()
  })
})

describe('proveMatch — refus (le cœur de la justesse)', () => {
  it('refuse un produit sans aucune clé commune', () => {
    // Cas matijardin : la recherche renvoie un filtre Kubota pour un capot GGP.
    const keys = candidateKeys({ ref: '325110421/0', ean: '8008989207177' })
    const proof = proveMatch(keys, {
      sku: 'KUB-1234', name: 'Filtre à huile Kubota', url: 'https://matijardin.fr/filtre-huile-kubota',
    })
    expect(proof).toBeNull()
  })
  it('refuse un gtin13 interne à la boutique même s’il est identique', () => {
    // Un code interne ne prouve rien : deux boutiques peuvent émettre le même.
    const keys = candidateKeys({ ref: 'ABC123', ean: '4049582772185' })
    const proof = proveMatch(keys, { gtin13: '2100001154035' })
    expect(proof).toBeNull()
  })
  it('refuse une référence courte trouvée dans un titre (A35 ⊄ LA35)', () => {
    const keys = candidateKeys({ ref: 'A35' })
    expect(proveMatch(keys, { name: 'LA35 courroie' })).toBeNull()
    expect(proveMatch(keys, { name: 'Courroie A35 lisse' })).toBeNull()
  })
  it('accepte A35 sur un sku déclaré, refuse LA35', () => {
    const keys = candidateKeys({ ref: 'A35' })
    expect(proveMatch(keys, { sku: 'A35' })?.evidence).toBe('sku')
    expect(proveMatch(keys, { sku: 'LA35' })).toBeNull()
  })
  it('refuse un titre dont le premier token ne fait qu’englober la clé', () => {
    const keys = candidateKeys({ ref: '12345' })
    expect(proveMatch(keys, { name: '123456 - autre produit' })).toBeNull()
  })
  it('ne prouve JAMAIS un appariement par le seul nom du produit', () => {
    const keys = candidateKeys({ ref: '4100492' })
    expect(proveMatch(keys, { name: 'FILTRE A AIR' })).toBeNull()
  })
  it('refuse quand la source n’a aucune clé exploitable', () => {
    expect(proveMatch(candidateKeys({}), { sku: 'X1' })).toBeNull()
  })
})

describe('refTokensFromText — réf constructeur dans le TITRE', () => {
  // Relevé terrain : chez la moitié des marchands, la référence constructeur n'est ni
  // dans un champ déclaré ni en tête de titre — elle est EN FIN de libellé.
  it('extrait une réf à séparateurs en fin de titre (pieces-tracteur-tondeuse)', () => {
    expect(refTokensFromText('Courroie tondeuse autoportée VIKING 6151-704-2110'))
      .toContain('61517042110')
  })
  it('extrait une réf alphanumérique (autoportee)', () => {
    expect(refTokensFromText('Fusible VAPORMATIC VLC2208')).toContain('VLC2208')
    expect(refTokensFromText('Fusible HELLA 8JS742901051')).toContain('8JS742901051')
  })
  it('extrait plusieurs réfs d’un même titre (190cc)', () => {
    const t = refTokensFromText('Guide Oregon 160SXE041 ou 160SDEA041 pour tronçonneuse')
    expect(t).toContain('160SXE041')
    expect(t).toContain('160SDEA041')
  })
  it('sépare les réfs collées par « / » et « , » (lames-tondeuses)', () => {
    const t = refTokensFromText('Couteau pour Flymo 5127500-00/6,5127500-80/8. L : 82 mm')
    expect(t).toContain('512750000')
    expect(t).toContain('512750080')
  })
  it('écarte les cotes avec unité — jamais une référence', () => {
    expect(refTokensFromText('Racloir à béton 30 cm')).toEqual([])
    expect(refTokensFromText('Couteau pour Flymo longueur 82MM')).toEqual([])
    expect(refTokensFromText('Bombe insecticide guêpes et frelons. 1000 ml')).toEqual([])
  })
  it('écarte les dimensions NxM (200x25 = une cote, pas une réf)', () => {
    expect(refTokensFromText('Truelle d’ardoisier 200x25')).not.toContain('200X25')
  })
  it('écarte les mots sans chiffre et les tokens trop courts', () => {
    expect(refTokensFromText('Bougie Champion')).toEqual([])
    expect(refTokensFromText('Couteaux tondeuse. Coupe 11,8 cm. Par 2.')).toEqual([])
  })
  it('tolère vide/null', () => {
    expect(refTokensFromText('')).toEqual([])
    expect(refTokensFromText(null)).toEqual([])
  })
})

describe('proveMatch — ref-in-title', () => {
  it('prouve une réf d’origine citée en fin de titre concurrent', () => {
    const keys = candidateKeys({ originRefs: ['6151-704-2110'] })
    const proof = proveMatch(keys, { name: 'Courroie tondeuse autoportée VIKING 6151-704-2110' })
    expect(proof?.evidence).toBe('ref-in-title')
    expect(proof?.key.origin).toBe(true)
  })
  it('prouve une réf constructeur alphanumérique en fin de titre', () => {
    const keys = candidateKeys({ ref: 'VLC2208' })
    expect(proveMatch(keys, { name: 'Fusible VAPORMATIC VLC2208' })?.evidence).toBe('ref-in-title')
  })
  it('ne prouve JAMAIS par le titre une clé faible (< 5 caractères)', () => {
    const keys = candidateKeys({ ref: 'A35' })
    expect(proveMatch(keys, { name: 'Courroie plate A35 renforcée' })).toBeNull()
  })
  it('n’apparie pas une clé simplement INCLUSE dans un token du titre', () => {
    const keys = candidateKeys({ ref: '12345' })
    expect(proveMatch(keys, { name: 'Lame universelle 123456 pour tondeuse' })).toBeNull()
  })
  it('préfère une preuve déclarée (sku) à une preuve de titre', () => {
    const keys = candidateKeys({ ref: 'VLC2208' })
    expect(proveMatch(keys, { sku: 'VLC2208', name: 'Fusible VAPORMATIC VLC2208' })?.evidence).toBe('sku')
  })
})

describe('refTokensFromUrl — réf dans le slug (autoportee)', () => {
  it('extrait la réf du slug, l’ID PrestaShop et les cotes courtes écartés', () => {
    // /{catégorie}/{id}-{slug}.html — 173085 = id retiré, 510/0 trop courts.
    expect(refTokensFromUrl('https://www.autoportee-discount.fr/lames-de-tondeuse/173085-lame-510mm-stiga-181004383-0.html'))
      .toEqual(['181004383'])
  })
  it('gère l’absence de catégorie et les query strings', () => {
    expect(refTokensFromUrl('https://x.fr/173085-lame-181004383-0.html?src=fs')).toEqual(['181004383'])
  })
  it('renvoie [] quand le slug ne porte que l’id et du texte', () => {
    expect(refTokensFromUrl('https://www.jardimax.com/p/134027-lame-mulching-51cm-tondeuse-stiga.html')).toEqual([])
  })

  // ⚠ CŒUR DE LA RÈGLE. Découper le slug sur « tout ce qui n'est pas un chiffre »
  // déchiquetait les références alphanumériques : le morceau numérique prouvait alors un
  // appariement contre un produit sans aucun rapport. Trois cas relevés le même jour.
  it('ne DÉCOUPE PAS une référence alphanumérique en son morceau numérique', () => {
    expect(refTokensFromUrl('https://x.fr/p/12345-demarreur-kohler-4109806s.html')).toEqual(['4109806S'])
    expect(refTokensFromUrl('https://x.fr/p/12345-demarreur-massey-ferguson-6306847m91.html')).toEqual(['6306847M91'])
    expect(refTokensFromUrl('https://x.fr/p/77-transmission-ggp-castelgarden-pl39005.html')).toEqual(['PL39005'])
  })

  it('n’apparie plus un produit dont la référence n’est qu’un MORCEAU de celle du marchand', () => {
    // « FILTRE A AIR » réf. 4109806 ↔ « Démarreur KOHLER 4109806S » : la vraie référence
    // du marchand n'est pas la nôtre, la nôtre n'en est qu'un fragment.
    const url = 'https://x.fr/p/12345-demarreur-kohler-4109806s.html'
    expect(proveMatch(candidateKeys({ ref: '4109806' }), { url, name: 'Démarreur KOHLER 4109806S' })).toBeNull()
    // …mais le produit qui porte VRAIMENT cette référence reste apparié.
    expect(proveMatch(candidateKeys({ ref: '4109806S' }), { url, name: 'Démarreur KOHLER 4109806S' })?.evidence)
      .toBe('ref-in-url')
  })

  it('ne prend pas les chiffres d’un ASIN Amazon pour une référence', () => {
    // Même défaut, autre forme : l'ASIN `B00002571E` était taillé en « 00002571 », qui
    // appariait la vis GUTBROD réf. 000.02.571 à un CD (« Black Flower - Diabolique »).
    // Les seules fiches qu'Amazon avait rendues étaient donc du bruit.
    const url = 'https://www.amazon.fr/Black-Flower-Diabolique/dp/B00002571E'
    expect(refTokensFromUrl(url)).toEqual(['B00002571E'])
    expect(proveMatch(candidateKeys({ ref: '000.02.571' }), { url, name: 'Black Flower - Diabolique' })).toBeNull()
  })

  it('rend joignables les catalogues à référence MIXTE, sans ouvrir aux mots', () => {
    // Gain de couverture du même correctif : « PL39005 » délimité est une preuve valable,
    // « castelgarden » n'en sera jamais une — aucun chiffre.
    expect(refTokensFromUrl('https://x.fr/p/77-transmission-ggp-castelgarden-pl39005.html'))
      .not.toContain('CASTELGARDEN')
    expect(proveMatch(candidateKeys({ ref: 'PL39005' }), {
      url: 'https://x.fr/p/77-transmission-ggp-castelgarden-pl39005.html', name: 'Ensemble de transmission',
    })?.evidence).toBe('ref-in-url')
  })
})

describe('proveMatch — ref-in-url', () => {
  it('prouve une réf d’origine présente dans le slug d’URL', () => {
    const keys = candidateKeys({ originRefs: ['181004383'] })
    const proof = proveMatch(keys, { url: 'https://www.autoportee-discount.fr/lames-de-tondeuse/173085-lame-510mm-stiga-181004383-0.html' })
    expect(proof?.evidence).toBe('ref-in-url')
  })
  it('ne prend PAS l’ID PrestaShop du slug pour une réf (pas de faux positif)', () => {
    // Une source dont la réf vaut par malchance l'ID interne 173085 ne doit pas matcher.
    const keys = candidateKeys({ ref: '173085' })
    expect(proveMatch(keys, { url: 'https://x.fr/cat/173085-lame-181004383-0.html' })).toBeNull()
  })
  it('ne prouve jamais par l’URL une clé faible (< 5 caractères)', () => {
    const keys = candidateKeys({ ref: '510' })
    expect(proveMatch(keys, { url: 'https://x.fr/cat/99-piece-510-x.html' })).toBeNull()
  })
})

describe('proveMatch — déclinaison PrestaShop « réf/variante »', () => {
  it('un sku déclaré « 181004383/0 » prouve la clé « 181004383 » (suffixe de déclinaison)', () => {
    // jardimax affiche « Référence: 181004383/0 » (réf constructeur + « /0 » de variante
    // PrestaShop). Normaliser la chaîne entière collerait le suffixe (« 1810043830 »)
    // et l'égalité exacte échouerait — la partie AVANT « / » doit aussi être testée.
    const keys = candidateKeys({ ref: '181004383' })
    expect(proveMatch(keys, { sku: '181004383/0' })?.evidence).toBe('sku')
  })
  it('ne prouve PAS une réf différente malgré le slash (pas de préfixe laxiste)', () => {
    const keys = candidateKeys({ ref: '18100438' }) // réf plus courte : ≠ 181004383
    expect(proveMatch(keys, { sku: '181004383/0' })).toBeNull()
  })
})
