import { describe, it, expect } from 'vitest'
import { formatMeasure } from './formatValue'

describe('formatMeasure', () => {
  it('formate selon le TYPE de mesure, pas selon la valeur', () => {
    expect(formatMeasure(1234, 'int', 'fr-FR').replace(/\u202f|\xa0/g, ' ')).toBe('1 234')
    expect(formatMeasure(75.5, 'pct', 'fr-FR')).toMatch(/75,5\s*%/)
    expect(formatMeasure(1500, 'ms', 'fr-FR')).toBe('1,5 s')
  })

  it('distingue ZÉRO d’une valeur ABSENTE', () => {
    // ⚠ Afficher « 0 » là où la donnée manque se lit comme un résultat.
    expect(formatMeasure(0, 'int', 'fr-FR')).toBe('0')
    expect(formatMeasure(null, 'int', 'fr-FR')).toBe('—')
  })

  it('respecte la locale pour le décimal — pas de virgule figée hors français', () => {
    // ⚠ `pct` et `ms` (secondes) composaient un séparateur français en dur ; l'anglais
    // britannique et l'espagnol attendent un point, pas une virgule.
    expect(formatMeasure(75.5, 'pct', 'en-GB')).toBe('75.5%')
    expect(formatMeasure(1500, 'ms', 'en-GB')).toBe('1.5 s')
  })
})
