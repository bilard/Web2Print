// src/features/excel/formulaEngine.test.ts — fonctions REMISE / VARIATION
import { describe, it, expect } from 'vitest'
import { evaluateFormula } from './formulaEngine'
import type { ExcelColumn } from './types'

const col = (key: string, label: string): ExcelColumn => ({
  key, label, fieldType: 'number', detectedType: 'number', isPrimary: false, width: 100,
})
const columns = [col('barre', 'Prix barré (€)'), col('prix', 'Prix (€)')]

describe('REMISE', () => {
  it('calcule le ratio de remise (prix barré → prix)', () => {
    const r = evaluateFormula('REMISE([Prix barré (€)], [Prix (€)])', { barre: 29.9, prix: 24.9 }, columns)
    expect(r).toBeCloseTo(0.1672, 3)
  })
  it('prix barré nul → erreur explicite', () => {
    const r = evaluateFormula('REMISE([Prix barré (€)], [Prix (€)])', { barre: 0, prix: 24.9 }, columns)
    expect(String(r)).toContain('#ERREUR')
  })
})

describe('appels de fonctions = mode expression (régression isExpressionFormula)', () => {
  it('SI conditionnel évalue au lieu de rendre le texte brut', () => {
    const r = evaluateFormula('SI([Prix (€)] > 100, "Cher", "Abordable")', { prix: 24.9 }, columns)
    expect(r).toBe('Abordable')
  })
  it('fonction imbriquée dans une arithmétique', () => {
    const r = evaluateFormula('ARRONDI(REMISE([Prix barré (€)], [Prix (€)]) * 100, 0)', { barre: 29.9, prix: 24.9 }, columns)
    expect(r).toBe(17)
  })
  it('un template avec texte littéral reste un template', () => {
    const r = evaluateFormula('Prix : [Prix (€)] €', { prix: 24.9 }, columns)
    expect(r).toBe('Prix : 24.9 €')
  })
})

describe('VARIATION', () => {
  it('calcule la variation relative', () => {
    expect(evaluateFormula('VARIATION(100, 120)', {}, columns)).toBeCloseTo(0.2, 6)
    expect(evaluateFormula('VARIATION(100, 80)', {}, columns)).toBeCloseTo(-0.2, 6)
  })
  it('valeur de départ nulle → erreur explicite', () => {
    expect(String(evaluateFormula('VARIATION(0, 120)', {}, columns))).toContain('#ERREUR')
  })
})
