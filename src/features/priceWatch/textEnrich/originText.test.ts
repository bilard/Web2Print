import { describe, it, expect } from 'vitest'
import { originTextOf } from './originText'
import type { SourceProduct } from '../catalog/match'

const p = (over: Partial<SourceProduct> = {}): SourceProduct =>
  ({ id: 'a', name: 'Courroie', ...over }) as SourceProduct

describe('originTextOf', () => {
  it('préfère la colonne jumelle « (source) » de la feuille', () => {
    expect(originTextOf(p({ description: 'Compatible…', descriptionSource: 'Passend für…' })))
      .toBe('Passend für…')
  })

  // ⚠ Le cas qui vidait l'écran : la fiche est traduite, le catalogue porte du français, et
  // le détecteur la rangeait en « fr » — hors de sa propre pastille « DE » et hors de la
  // portée « langue étrangère ». Le filtre « Traduits » ne montrait donc jamais rien.
  it('retrouve l’allemand d’une fiche déjà traduite par la carte de workflow', () => {
    const revision = {
      productId: 'a', at: 1,
      byColumn: { TEXT_VENTE: { before: 'Passend für Rasenmäher', after: 'Compatible tondeuse' } },
    }
    expect(originTextOf(p({ description: 'Compatible tondeuse' }), revision)).toBe('Passend für Rasenmäher')
  })

  it('prend le PLUS LONG des avants : la langue se tranche sur l’argumentaire', () => {
    const revision = {
      productId: 'a', at: 1,
      byColumn: {
        DESIGNATION: { before: 'Riemen', after: 'Courroie' },
        TEXT_VENTE: { before: 'Passend für alle Rasenmäher der Serie', after: '…' },
      },
    }
    expect(originTextOf(p(), revision)).toBe('Passend für alle Rasenmäher der Serie')
  })

  it('retombe sur le texte courant quand aucun original n’a été gardé', () => {
    expect(originTextOf(p({ description: 'Compatible tondeuse' }))).toBe('Compatible tondeuse')
    expect(originTextOf(p())).toBe('Courroie')
  })
})
