import { describe, it, expect } from 'vitest'
import { resolveFormula, buildFormulaCell } from './gdriveCore'

// Colonnes fictives : price=col C (index 2), price_concurrent=col D (index 3).
const letters: Record<string, string> = { price: 'C', price_concurrent: 'D' }
const letterByName = (n: string) => letters[n] ?? null

describe('resolveFormula', () => {
  it('remplace {nom} par lettre + numéro de ligne', () => {
    expect(resolveFormula('{price} - {price_concurrent}', letterByName, 2)).toBe('C2 - D2')
    expect(resolveFormula('{price} - {price_concurrent}', letterByName, 5)).toBe('C5 - D5')
  })

  it('retire un = initial', () => {
    expect(resolveFormula('={price}/{price_concurrent}-1', letterByName, 3)).toBe('C3/D3-1')
  })

  it('laisse les noms inconnus tels quels', () => {
    expect(resolveFormula('{price} + {inconnu}', letterByName, 4)).toBe('C4 + inconnu')
  })

  it('gère une formule sans référence de colonne', () => {
    expect(resolveFormula('=ROW()', letterByName, 2)).toBe('ROW()')
  })
})

describe('buildFormulaCell', () => {
  it('inclut TOUJOURS une valeur en cache (sinon cellule erreur à l’import)', () => {
    const cell = buildFormulaCell('C2-D2')
    expect(cell.f).toBe('C2-D2')
    expect(cell.v).toBe(0)
    expect(cell.t).toBe('n')
  })

  it('applique un format date à NOW/TODAY/DATE', () => {
    expect(buildFormulaCell('NOW()').z).toBe('yyyy-mm-dd hh:mm')
    expect(buildFormulaCell('TODAY()').z).toBe('yyyy-mm-dd')
    expect(buildFormulaCell('DATE(2024,1,1)').z).toBe('yyyy-mm-dd')
  })

  it('pas de format date pour une formule numérique', () => {
    expect(buildFormulaCell('C2-D2').z).toBeUndefined()
  })
})
