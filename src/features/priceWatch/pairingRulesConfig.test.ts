import { describe, it, expect } from 'vitest'
import {
  configToRules, rulesToConfig, parseFamilyLexicon, formatFamilyLexicon,
  DEFAULT_RULES_CONFIG,
} from './pairingRulesConfig'
import { DEFAULT_PAIRING_RULES, MATCH_EVIDENCES } from './catalog/pairingRules'
import { EVIDENCE_LABELS } from '../workflows/registry/pairingRulesNode'

describe('config par défaut du node', () => {
  it('un node posé et jamais touché ne change rien', () => {
    // C'est LE contrat de la brique : ajouter le node à un workflow ne doit pas déplacer
    // un seul chiffre tant qu'on n'a rien réglé.
    expect(configToRules(DEFAULT_RULES_CONFIG)).toEqual(DEFAULT_PAIRING_RULES)
  })

  it('l’aller-retour config → règles → config est stable', () => {
    const rules = configToRules(DEFAULT_RULES_CONFIG)
    expect({ watchId: '', ...rulesToConfig(rules) }).toEqual(DEFAULT_RULES_CONFIG)
  })
})

describe('preuves', () => {
  it('une preuve décochée disparaît des règles', () => {
    const rules = configToRules({ ...DEFAULT_RULES_CONFIG, evidence: 'gtin13,sku' })
    expect(rules.evidence.sku).toBe(true)
    expect(rules.evidence['ref-in-title']).toBe(false)
  })

  it('une chaîne vide ne veut pas dire « toutes »', () => {
    // Le piège classique du multiSelect : traiter le vide comme « pas de filtre » ferait
    // que décocher la dernière case rendrait silencieusement toutes les preuves.
    const rules = configToRules({ ...DEFAULT_RULES_CONFIG, evidence: '' })
    expect(rules.evidence['ref-in-title']).toBe(false)
    // …mais le code-barres reste armé : on ne peut pas se retrouver sans aucune preuve.
    expect(rules.evidence.gtin13).toBe(true)
  })

  it('chaque preuve du moteur porte un libellé dans le node', () => {
    // Une preuve ajoutée au moteur sans l'être ici serait invisible dans la brique, donc
    // impossible à couper — et personne ne s'en apercevrait.
    for (const e of MATCH_EVIDENCES) expect(EVIDENCE_LABELS[e]).toBeTruthy()
    expect(Object.keys(EVIDENCE_LABELS).sort()).toEqual([...MATCH_EVIDENCES].sort())
  })
})

describe('lexique de familles', () => {
  it('lit une famille nommée et ses synonymes', () => {
    expect(parseFamilyLexicon('serrure: serrure, verrou, barillet'))
      .toEqual({ serrure: ['serrure', 'verrou', 'barillet'] })
  })

  it('accepte une ligne sans nom de famille — le premier mot la nomme', () => {
    // Geste naturel de quelqu'un qui liste des synonymes : le refuser en silence serait
    // la pire des réponses.
    expect(parseFamilyLexicon('manchon, raccord')).toEqual({ manchon: ['manchon', 'raccord'] })
  })

  it('enrichit une famille citée deux fois au lieu de l’écraser', () => {
    expect(parseFamilyLexicon('joint: joint\njoint: bague')).toEqual({ joint: ['joint', 'bague'] })
  })

  it('ignore les lignes vides et les commentaires', () => {
    expect(parseFamilyLexicon('\n# note\n  \nlame: lame')).toEqual({ lame: ['lame'] })
  })

  it('normalise accents et casse comme les libellés', () => {
    expect(parseFamilyLexicon('Déflecteur: DÉFLECTEUR, Écran')).toEqual({ deflecteur: ['deflecteur', 'ecran'] })
  })

  it('l’aller-retour texte → lexique → texte est stable', () => {
    const text = 'joint: joint, bague\nserrure: serrure, verrou'
    expect(formatFamilyLexicon(parseFamilyLexicon(text))).toBe(text)
  })
})

describe('tolérance', () => {
  it('une config vide produit les défauts, pas des règles absurdes', () => {
    // Cas réel : un node ajouté par une version antérieure du registre.
    const rules = configToRules({})
    expect(rules.priceAbyssRatio).toBe(DEFAULT_PAIRING_RULES.priceAbyssRatio)
    expect(rules.minRefLen).toBe(DEFAULT_PAIRING_RULES.minRefLen)
    expect(rules.familyVeto).toBe(DEFAULT_PAIRING_RULES.familyVeto)
  })
})
