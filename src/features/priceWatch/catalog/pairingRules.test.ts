import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PAIRING_RULES, resolvePairingRules, normalizeFamilyLexicon,
  rulesDifferFromDefault, summarizeRules, MATCH_EVIDENCES,
} from './pairingRules'
import { candidateKeys, proveMatch } from './keys'
import { matchProduct, buildMemoryIndex, comparePrices, vetoedPair } from './match'
import { familiesConflict } from './partFamily'

const listing = (l: Partial<{ url: string; name: string; ref: string; price: number; gtin13: string }>) => ({
  url: 'https://x.fr/a.html', name: '', ...l,
} as Parameters<typeof buildMemoryIndex>[0][number])

describe('resolvePairingRules', () => {
  it('rend les défauts sur une entrée absente ou vide', () => {
    expect(resolvePairingRules()).toEqual(DEFAULT_PAIRING_RULES)
    expect(resolvePairingRules(null)).toEqual(DEFAULT_PAIRING_RULES)
    expect(resolvePairingRules({})).toEqual(DEFAULT_PAIRING_RULES)
  })

  it('ne laisse jamais un réglage corrompu désarmer un garde-fou', () => {
    // Cas réel : un document Firestore écrit par une version antérieure, ou un champ vidé
    // dans un formulaire. On revient à la valeur validée sur le terrain, pas à 0.
    const r = resolvePairingRules({
      priceAbyssRatio: Number.NaN, weakRefLen: undefined as never,
      familyVeto: 'oui' as never, extraFamilies: 'nawak' as never,
    })
    expect(r.priceAbyssRatio).toBe(21)
    expect(r.weakRefLen).toBe(5)
    expect(r.familyVeto).toBe(true)
    expect(r.extraFamilies).toEqual({})
  })

  it('accepte 0 comme désactivation explicite du gouffre de prix', () => {
    expect(resolvePairingRules({ priceAbyssRatio: 0 }).priceAbyssRatio).toBe(0)
  })

  it('borne les seuils hors plage au lieu de les prendre au mot', () => {
    expect(resolvePairingRules({ minRefLen: 0 }).minRefLen).toBe(2)
    expect(resolvePairingRules({ weakRefLen: 99 }).weakRefLen).toBe(16)
  })

  it('refuse de désactiver la preuve par code-barres', () => {
    // C'est la seule qu'aucun libellé ne renverse : s'en priver reviendrait à jeter les
    // appariements certains pour garder les douteux.
    const r = resolvePairingRules({ evidence: { ...DEFAULT_PAIRING_RULES.evidence, gtin13: false } })
    expect(r.evidence.gtin13).toBe(true)
  })

  it('conserve les preuves désactivées une à une', () => {
    const r = resolvePairingRules({ evidence: { 'ref-in-title': false } as never })
    expect(r.evidence['ref-in-title']).toBe(false)
    expect(r.evidence.sku).toBe(true)
  })
})

describe('normalizeFamilyLexicon', () => {
  it('normalise les mots comme les libellés (minuscules, sans accents)', () => {
    expect(normalizeFamilyLexicon({ Durite: ['Manchon', 'DÉFLECTEUR'] }))
      .toEqual({ durite: ['manchon', 'deflecteur'] })
  })
  it('écarte les entrées qui ne diraient rien', () => {
    expect(normalizeFamilyLexicon({ vide: [], court: ['ab'], pasUnTableau: 'x' })).toEqual({})
  })
})

describe('inertie des défauts', () => {
  // Le contrat du module : un réglage jamais touché ne change RIEN. Ces assertions
  // comparent l'appel AVEC défauts explicites à l'appel SANS règles.
  it('candidateKeys est identique avec et sans règles', () => {
    const p = { ref: '0060527', ref2: 'BS691991', ean: '3582321853475', originRefs: ['516747'] }
    expect(candidateKeys(p, DEFAULT_PAIRING_RULES)).toEqual(candidateKeys(p))
  })

  it('proveMatch est identique avec et sans règles', () => {
    const keys = candidateKeys({ ref: '181004383' })
    const id = { url: 'https://x.fr/lames/173085-lame-510mm-stiga-181004383-0.html' }
    expect(proveMatch(keys, id, DEFAULT_PAIRING_RULES)).toEqual(proveMatch(keys, id))
  })

  it('rulesDifferFromDefault ne se déclenche que sur un vrai écart', () => {
    expect(rulesDifferFromDefault(resolvePairingRules())).toBe(false)
    expect(rulesDifferFromDefault(resolvePairingRules({ priceAbyssRatio: 5 }))).toBe(true)
  })
})

describe('les leviers agissent', () => {
  it('couper « ref-in-title » retire les appariements que seul le libellé portait', () => {
    const listings = [listing({ name: 'Courroie tondeuse autoportée VIKING 6151-704-2110', price: 8.4 })]
    const product = { id: 'a', name: 'COURROIE', ref: '6151-704-2110' }

    const withTitle = matchProduct(product, 's', buildMemoryIndex(listings))
    expect(withTitle.outcome).toBe('matched')

    const rules = resolvePairingRules({ evidence: { 'ref-in-title': false } as never })
    const without = matchProduct(product, 's', buildMemoryIndex(listings, rules), rules)
    expect(without.outcome).toBe('not-found')
  })

  it('couper les références d’origine cesse d’apparier les pièces adaptables', () => {
    const listings = [listing({ name: 'Lame AL-KO 516747', ref: '516747', price: 22 })]
    const product = { id: 'a', name: 'LAME ADAPTABLE', ref: 'F1-XX-01', originRefs: ['516747'] }

    expect(matchProduct(product, 's', buildMemoryIndex(listings)).outcome).toBe('matched')

    const rules = resolvePairingRules({ useOriginRefs: false })
    expect(matchProduct(product, 's', buildMemoryIndex(listings, rules), rules).outcome).toBe('not-found')
  })

  it('le lexique de familles ajouté par l’utilisateur crée un démenti', () => {
    // « manchon » et « raccord » sont inconnus du lexique de base : aucun conflit déclaré.
    expect(familiesConflict('MANCHON PVC', 'Raccord laiton')).toBe(false)
    const extra = normalizeFamilyLexicon({ sleeve: ['manchon'], fitting: ['raccord'] })
    expect(familiesConflict('MANCHON PVC', 'Raccord laiton', extra)).toBe(true)
  })

  it('désactiver le veto des familles laisse passer ce qu’il refusait', () => {
    // Clé ALPHANUMÉRIQUE à dessein : une référence structurée appartient à son
    // constructeur, donc la corroboration du libellé n'est pas exigée et c'est bien le
    // veto des familles — et lui seul — que ce test isole.
    const listings = [listing({ name: 'Filtre à huile KOHLER BS5205002', ref: 'BS5205002', price: 12 })]
    const product = { id: 'a', name: 'GICLEUR CARBURATEUR', ref: 'BS5205002', price: 9 }

    const refused = matchProduct(product, 's', buildMemoryIndex(listings))
    expect(refused.outcome).toBe('not-found')
    expect(refused.vetoed).toBe(1)

    const rules = resolvePairingRules({ familyVeto: false })
    expect(matchProduct(product, 's', buildMemoryIndex(listings, rules), rules).outcome).toBe('matched')
  })

  it('sur une clé en chiffres nus, la corroboration prend le relais du veto des familles', () => {
    // ⚠ Enseignement à ne pas perdre : couper le veto des familles ne suffit PAS à
    // rouvrir ces paires-là. « 5205002 » n'appartient à personne, donc le libellé doit
    // confirmer — et « GICLEUR CARBURATEUR » ne confirme pas « Filtre à huile ». Il faut
    // couper les DEUX démentis, ce que l'écran de réglage doit rendre lisible.
    const listings = [listing({ name: 'Filtre à huile KOHLER 5205002', ref: '5205002', price: 12 })]
    const product = { id: 'a', name: 'GICLEUR CARBURATEUR', ref: '5205002', price: 9 }

    const familyOff = resolvePairingRules({ familyVeto: false })
    expect(matchProduct(product, 's', buildMemoryIndex(listings, familyOff), familyOff).outcome).toBe('not-found')

    const bothOff = resolvePairingRules({ familyVeto: false, corroborateNumericKeys: false })
    expect(matchProduct(product, 's', buildMemoryIndex(listings, bothOff), bothOff).outcome).toBe('matched')
  })

  it('le gouffre de prix se resserre et s’ouvre avec son rapport', () => {
    const listings = [listing({ name: 'Couteaux scarificateurs x16', ref: 'K4488', price: 41.49 })]
    const product = { id: 'a', name: 'COUTEAU', ref: 'K4488', price: 3.01 }

    // ×14 : accepté au défaut de ×21 (un lot rend compte de l'écart).
    expect(matchProduct(product, 's', buildMemoryIndex(listings)).outcome).toBe('matched')

    const strict = resolvePairingRules({ priceAbyssRatio: 5 })
    expect(matchProduct(product, 's', buildMemoryIndex(listings, strict), strict).outcome).toBe('not-found')
  })

  it('le plancher de prix suit son réglage', () => {
    const l = listing({ name: 'Vis', price: 0.6 })
    expect(comparePrices(10, l).priceHt).toBeUndefined()
    expect(comparePrices(10, l, { rules: resolvePairingRules({ minPriceEur: 0.1, maxDropPct: 100 }) }).priceHt).toBe(0.5)
  })
})

describe('démentis unifiés', () => {
  const proof = { key: { kind: 'ref' as const, value: '5205002', weak: false, origin: false, raw: '5205002' }, evidence: 'ref-in-url' as const }

  it('la règle complète refuse un gouffre de prix que le veto des familles laisse passer', () => {
    // Aucun mot du lexique des deux côtés : seul le rapport de prix dénonce la paire.
    const source = { name: 'BAGUE DE ROUE', price: 1.91 }
    const candidate = { name: 'Chaussure de travail GRISPORT', price: 176.32 }
    expect(vetoedPair(source, candidate, proof)).toBe(true)
  })

  it('un prix source absent neutralise le gouffre sans désarmer les autres démentis', () => {
    expect(vetoedPair({ name: 'CARBURATEUR' }, { name: 'Filtre à air', price: 900 }, proof)).toBe(true)
    expect(vetoedPair({ name: 'CARBURATEUR' }, { name: 'Carburateur RYOBI', price: 900 }, proof)).toBe(false)
  })
})

describe('summarizeRules', () => {
  it('nomme les preuves coupées — c’est ce qu’on estampille dans le rapport', () => {
    const r = resolvePairingRules({ evidence: { 'ref-in-title': false, 'ref-in-url': false } as never })
    expect(summarizeRules(r).evidenceOff).toEqual(['ref-in-url', 'ref-in-title'])
    expect(MATCH_EVIDENCES).toHaveLength(7)
  })
})
