// src/features/priceWatch/catalog/keys.test.ts
// Cas issus d'un relevé terrain sur 5 concurrents PrestaShop (motoculture).
import { describe, it, expect } from 'vitest'
import {
  normalizeRef, stripLeadingZeros, normalizeEan, isInternalBarcode,
  candidateKeys, proveMatch,
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
