import { describe, it, expect } from 'vitest'
import { deserializeEnrichedFromRow } from './deserializeEnriched'

describe('deserializeEnrichedFromRow', () => {
  it('parse `[Groupe]Texte` simple ligne', () => {
    const row = {
      ai_advantages: '[Détection]Robot intelligent : Identification des taches',
    }
    const result = deserializeEnrichedFromRow(row)
    expect(result?.product.advantages).toEqual([
      { text: 'Robot intelligent : Identification des taches', group: 'Détection' },
    ])
  })

  it('parse `[Groupe]Titre\\n\\nParagraphe1\\n\\nParagraphe2` (Dyson hiérarchique)', () => {
    const text = '[Détection des taches avec IA avancée.¹]Robot intelligent : Identification des taches par IA et caméra HD\n\nRévèle les taches et les poussières dissimulées grâce à un faisceau lumineux.\n\nInspecte visuellement les surfaces.'
    const row = { ai_advantages: text }
    const result = deserializeEnrichedFromRow(row)
    expect(result?.product.advantages).toHaveLength(1)
    const adv = result!.product.advantages[0]
    expect(adv.group).toBe('Détection des taches avec IA avancée.¹')
    expect(adv.text).toContain('Robot intelligent : Identification')
    expect(adv.text).toContain('Révèle les taches')
    expect(adv.text).toContain('Inspecte visuellement')
    // Le bracket prefix ne doit JAMAIS apparaître dans le text
    expect(adv.text).not.toContain('[Détection des taches')
  })

  it('parse plusieurs avantages multi-ligne séparés par ` | `', () => {
    const a1 = '[GroupeA]Titre A\n\nProse A1\n\nProse A2'
    const a2 = '[GroupeA]Titre A2\n\nProse'
    const a3 = '[GroupeB]Titre B\n\nProse B'
    const row = { ai_advantages: `${a1} | ${a2} | ${a3}` }
    const result = deserializeEnrichedFromRow(row)
    expect(result?.product.advantages).toHaveLength(3)
    expect(result!.product.advantages[0]).toMatchObject({
      group: 'GroupeA',
      text: expect.stringContaining('Titre A'),
    })
    expect(result!.product.advantages[2]).toMatchObject({
      group: 'GroupeB',
      text: expect.stringContaining('Titre B'),
    })
  })

  it('parse specs `[Groupe]Nom: Valeur`', () => {
    const row = {
      ai_specifications: '[Caractéristiques]Temps de charge: 3 hrs | [Caractéristiques]Durée: 200 min',
    }
    const result = deserializeEnrichedFromRow(row)
    expect(result?.product.specifications).toHaveLength(2)
    expect(result!.product.specifications[0]).toMatchObject({
      group: 'Caractéristiques',
      name: 'Temps de charge',
      value: '3 hrs',
    })
  })

  it('rétro-compatible : avantage sans groupe', () => {
    const row = { ai_advantages: 'Avantage simple sans groupe' }
    const result = deserializeEnrichedFromRow(row)
    expect(result?.product.advantages).toEqual([{ text: 'Avantage simple sans groupe' }])
  })
})
