import { describe, it, expect } from 'vitest'
import { buildBatchPrompt, mapBatch, unitId, finalText, schemaForLLM, EnrichBatchSchema } from './prompt'
import { defaultNameTemplate } from './template'
import type { EnrichUnit } from './pass'
import type { FieldPlan } from './fieldPlan'

const plan = (over: Partial<FieldPlan> = {}): FieldPlan => ({
  key: 'nom', kind: 'improve', minLength: 28,
  prompt: 'Écris comme pour un catalogue de pièces détachées, sans superlatif.',
  promptVersion: 'v1', ...over,
})

const unit = (id: string, text: string, over: Partial<EnrichUnit> = {}): EnrichUnit => ({
  productId: id, field: 'nom', plan: plan(), text, row: {}, ...over,
})

describe('⚠ la consigne de l’utilisateur est prioritaire', () => {
  it('part EN TÊTE, verbatim, avant toute contrainte', () => {
    // Une réécriture maison placée avant reprendrait la main sur sa demande. Le
    // contre-exemple a coûté quatre itérations sur un autre module.
    const p = buildBatchPrompt([unit('p1', 'LAME 510')])
    expect(p.startsWith('Écris comme pour un catalogue de pièces détachées, sans superlatif.')).toBe(true)
    expect(p.indexOf('Contraintes de forme')).toBeGreaterThan(p.indexOf('sans superlatif'))
  })

  it('n’est ni reformulée ni tronquée', () => {
    const long = 'Mets la dimension en premier, puis la compatibilité. Pas de marque en tête.'
    const p = buildBatchPrompt([unit('p1', 'LAME', { plan: plan({ prompt: long }) })])
    expect(p).toContain(long)
  })
})

describe('contenu du lot', () => {
  it('porte un identifiant par texte', () => {
    const us = [unit('p1', 'LAME 510'), unit('p2', 'COURROIE A97')]
    const p = buildBatchPrompt(us)
    expect(p).toContain(unitId(us[0]))
    expect(p).toContain(unitId(us[1]))
    expect(p).toContain('LAME 510')
    expect(p).toContain('COURROIE A97')
  })

  it('annonce la langue détectée quand elle l’est', () => {
    const p = buildBatchPrompt([unit('p1', 'Grasmaaier mes', { sourceLang: 'nl', plan: plan({ kind: 'translate' }) })])
    expect(p).toContain('langue détectée : nl')
  })

  it('ne demande QUE les morceaux manquants d’un gabarit', () => {
    // Le reste est assemblé sans lui, depuis des colonnes déjà remplies : lui demander de
    // recopier une référence, c'est payer pour un risque d'altération.
    const tpl = defaultNameTemplate({ brand: 'marque', supplierRef: 'ref', ean: 'ean' })
    const p = buildBatchPrompt([unit('p1', 'Lame 51 cm', { plan: plan({ template: tpl }) })])
    expect(p).toContain('à produire :')
    expect(p).toContain('distingue')
  })

  it('les contraintes nomment les trois intouchables', () => {
    const p = buildBatchPrompt([unit('p1', 'LAME')])
    expect(p).toContain('références')
    expect(p).toContain('unités')
    expect(p).toContain('marque')
  })

  it('un lot vide ne produit pas de prompt', () => {
    expect(buildBatchPrompt([])).toBe('')
  })
})

describe('rattachement des réponses', () => {
  const us = [unit('p1', 'LAME 510'), unit('p2', 'COURROIE A97')]

  it('associe chaque texte à son unité', () => {
    const { texts } = mapBatch({
      results: [
        { id: unitId(us[0]), text: 'Lame de tondeuse 510 mm' },
        { id: unitId(us[1]), text: 'Courroie trapézoïdale A97' },
      ],
    }, us)
    expect(texts[unitId(us[0])]).toBe('Lame de tondeuse 510 mm')
    expect(texts[unitId(us[1])]).toBe('Courroie trapézoïdale A97')
  })

  it('⚠ LÈVE sur un identifiant inconnu au lieu de l’ignorer', () => {
    // Un identifiant fabriqué trahit une liste décalée : garder ce qui « colle » et jeter
    // le reste répartirait les textes sur les mauvais produits, sans un mot.
    expect(() => mapBatch({ results: [{ id: 'inconnu::nom', text: 'x' }] }, us))
      .toThrow(/inattendue/)
  })

  it('ignore une réponse vide plutôt que d’écraser le texte par du blanc', () => {
    const { texts } = mapBatch({ results: [{ id: unitId(us[0]), text: '   ' }] }, us)
    expect(texts).toEqual({})
  })

  it('récupère la justification quand elle est demandée', () => {
    const { notes } = mapBatch({
      results: [{ id: unitId(us[0]), text: 'Lame de tondeuse 510 mm', note: 'Développé l’abréviation et ajouté l’unité.' }],
    }, us)
    expect(notes[unitId(us[0])]).toContain('abréviation')
  })
})

describe('schéma de réponse', () => {
  it('accepte une réponse conforme et refuse une réponse mal formée', () => {
    // Le schéma est la dernière barrière avant l'écriture : une réponse sans `text`
    // passerait sinon jusqu'au moteur, qui écrirait « undefined » dans la fiche.
    expect(EnrichBatchSchema.safeParse({ results: [{ id: 'a::nom', text: 'Lame' }] }).success).toBe(true)
    expect(EnrichBatchSchema.safeParse({ results: [{ id: 'a::nom' }] }).success).toBe(false)
    expect(EnrichBatchSchema.safeParse({ results: 'nope' }).success).toBe(false)
  })

  it('la justification reste facultative côté validation', () => {
    // Elle peut être désactivée par lot : l'exiger ferait échouer tous ces lots-là.
    expect(EnrichBatchSchema.safeParse({ results: [{ id: 'a::nom', text: 'Lame', note: 'ok' }] }).success).toBe(true)
  })

  it('n’exige la justification que si elle est demandée', () => {
    const withNote = schemaForLLM(true) as { properties: { results: { items: { required: string[] } } } }
    const without = schemaForLLM(false) as { properties: { results: { items: { required: string[] } } } }
    expect(withNote.properties.results.items.required).toContain('note')
    expect(without.properties.results.items.required).not.toContain('note')
  })
})

describe('texte final', () => {
  it('sans gabarit, le texte du modèle est le résultat', () => {
    expect(finalText(unit('p1', 'LAME 510'), 'Lame de tondeuse 510 mm')).toBe('Lame de tondeuse 510 mm')
  })

  it('avec gabarit, le morceau produit rejoint les colonnes', () => {
    const tpl = defaultNameTemplate({ brand: 'marque', supplierRef: 'ref', ean: '' })
    const u = unit('p1', 'Lame 51 cm', { plan: plan({ template: tpl }), row: { marque: 'STIGA', ref: '1134-4319-01' } })
    expect(finalText(u, 'droite')).toBe('Lame 51 cm - STIGA - 1134-4319-01 - droite')
  })
})
