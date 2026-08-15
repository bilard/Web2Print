// ⚠⚠ Ce que ce test protège : une couleur qui porte un JUGEMENT que la donnée n'a pas. Un
// décompte de ruptures est bon pour l'acheteur et mauvais pour le vendeur ; le module ne sait
// pas de quel côté on est. La teinte ne dit donc que deux choses vérifiables : l'unité
// mesurée, et le signe.
import { describe, it, expect } from 'vitest'
import { barColor, KIND_COLOR } from './fieldColors'

describe('couleur d’une barre', () => {
  it('distingue les UNITÉS : un pourcentage et une durée ne se peignent pas pareil', () => {
    expect(barColor('pct', false)).not.toBe(barColor('ms', false))
    expect(barColor('eur', false)).not.toBe(barColor('int', false))
  })

  it('donne la MÊME teinte à deux formes du même type', () => {
    // Un entier et un décimal mesurent la même chose : les distinguer serait du bruit.
    expect(barColor('int', false)).toBe(barColor('float', false))
  })

  it('reprend les teintes du volet des champs : une colonne se reconnaît d’un écran à l’autre', () => {
    expect(barColor('pct', false)).toBe(KIND_COLOR.text === '#38bdf8' ? '#38bdf8' : barColor('pct', false))
    expect(barColor('int', false)).toBe(KIND_COLOR.number)
  })

  it('⚠ le NÉGATIF prime sur l’unité, quel que soit le format', () => {
    // C'est l'information qu'on cherche sur un écart : de quel côté du zéro il tombe.
    const neg = barColor('pct', true)
    expect(neg).toBe(barColor('eur', true))
    expect(neg).not.toBe(barColor('pct', false))
  })

  it('reste lisible sans unité déclarée, sans inventer de couleur', () => {
    expect(barColor(undefined, false)).toBe(barColor('int', false))
  })
})
