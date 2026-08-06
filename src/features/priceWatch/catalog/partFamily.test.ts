import { describe, it, expect } from 'vitest'
import { partFamilies, familiesConflict } from './partFamily'

describe('partFamilies', () => {
  it('reconnaît la nature de la pièce en français comme en anglais', () => {
    expect(partFamilies('FILTRE A AIR')).toEqual(new Set(['filter']))
    expect(partFamilies('AIR FILTER 1021')).toEqual(new Set(['filter']))
    expect(partFamilies('Démarreur KOHLER 4109806S')).toEqual(new Set(['starter']))
  })

  it('reste MUET sur un libellé qu’il ne sait pas classer', () => {
    // Le cas normal, et sans conséquence : aucune famille ⇒ aucune contradiction.
    expect(partFamilies('EL380Li YELLOW 1021')).toEqual(new Set())
    expect(partFamilies('')).toEqual(new Set())
  })

  it('n’enrôle pas les mots ambigus ni les qualificatifs', () => {
    // « boîtier », « kit », « joint », « carter » désignent selon le contexte la pièce ou
    // son enveloppe ; « air » et « huile » qualifient un filtre, ils ne sont pas la pièce.
    for (const w of ['Boîtier de commande', 'Kit complet', 'Joint torique', 'Carter moteur', 'Huile 2 temps']) {
      expect(partFamilies(w)).toEqual(new Set())
    }
  })
})

describe('familiesConflict', () => {
  // Cas RÉEL : même référence 4109806 des deux côtés (retrouvée dans l'URL), mais un
  // filtre à air à 11,42 € face à un démarreur à 469,90 €. Aucun signal de clé ne pouvait
  // le voir ; les libellés, eux, le disent.
  it('déclare la contradiction entre un filtre et un démarreur', () => {
    expect(familiesConflict('FILTRE A AIR', 'Démarreur KOHLER 4109806S')).toBe(true)
  })

  // ⚠ GARDE-FOU PRINCIPAL, plus important que l'assertion ci-dessus. Appariement vérifié
  // comme JUSTE, catalogue F1 en anglais et marchand en français. Si ce test tombe, c'est
  // le lexique qui condamne des appariements corrects — pas une amélioration à ajuster.
  it('ne déclare RIEN sur l’appariement bilingue vérifié SWITCH BOX ↔ Boîtier', () => {
    expect(familiesConflict(
      'SWITCH BOX BATTERY EL380Li YELLOW 1021',
      'Boîtier de commutation CASTELGARDEN 3816005331 - 381600533/1',
    )).toBe(false)
  })

  it('une seule famille partagée suffit à disculper', () => {
    // Le second sens de chaque libellé ne compte pas : « courroie moteur » ↔ « courroie ».
    expect(familiesConflict('BELT PULLEY ASSY', 'Courroie tondeuse')).toBe(false)
  })

  it('un côté muet ne contredit rien — jamais de malus pour une absence', () => {
    expect(familiesConflict('FILTRE A AIR', 'CASTELGARDEN 3816005331')).toBe(false)
    expect(familiesConflict('ABC-123 EL380Li', 'Démarreur KOHLER')).toBe(false)
  })
})
