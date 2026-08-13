import { describe, it, expect } from 'vitest'
import { partNature, natureMismatch } from './partNature'

describe('partNature — ce que le libellé AFFIRME', () => {
  it('lit un adaptable, même quand il se réclame de la qualité d’origine', () => {
    // Cas VÉCU, et c'est le piège central : ce libellé contient les deux mots.
    expect(partNature(
      'COURROIE LISSE 5/8 52POUCES',
      'Courroie lisse trapézoïdale qualité d’origine MTD, adaptable pour séries 400, 500 et 600.',
    )).toBe('aftermarket')
  })

  it('lit une pièce d’origine quand elle est revendiquée comme telle', () => {
    expect(partNature('Courroie MTD', 'Pièce d’origine constructeur.')).toBe('origin')
    expect(partNature('Belt OEM MTD')).toBe('origin')
    expect(partNature('PIECES-ORIGINE > MTD', 'Courroie 754-0280')).toBe('unknown') // un chemin ne suffit pas
  })

  it('se TAIT sur un libellé marchand ordinaire', () => {
    // Le cas de très loin le plus fréquent — et il ne doit rien déclencher.
    expect(partNature('Courroie spécifique MTD 754-0280')).toBe('unknown')
    expect(partNature('Fusible STIGA 1134349606')).toBe('unknown')
    expect(partNature('')).toBe('unknown')
  })

  it('ne prend PAS « référence d’origine » pour une pièce d’origine', () => {
    // « Remplace origine: 754-0280 » désigne la pièce REMPLACÉE, pas celle qu'on vend.
    expect(partNature('LAME', 'Lame adaptable pour AL-KO. Remplace origine: 516747.')).toBe('aftermarket')
    expect(partNature('PIGNON', 'Référence d’origine : 460663.')).toBe('unknown')
  })
})

describe('natureMismatch — jamais de conclusion tirée d’un silence', () => {
  it('signale deux natures opposées', () => {
    expect(natureMismatch('aftermarket', 'origin')).toBe(true)
    expect(natureMismatch('origin', 'aftermarket')).toBe(true)
  })

  it('ne signale rien dès qu’un côté se tait', () => {
    expect(natureMismatch('aftermarket', 'unknown')).toBe(false)
    expect(natureMismatch('unknown', 'origin')).toBe(false)
    expect(natureMismatch('unknown', 'unknown')).toBe(false)
  })

  it('ne signale rien entre pièces de même nature', () => {
    expect(natureMismatch('origin', 'origin')).toBe(false)
    expect(natureMismatch('aftermarket', 'aftermarket')).toBe(false)
  })
})
