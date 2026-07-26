import { describe, it, expect } from 'vitest'
import { sanitizeEcName, buildEcFieldNames } from './ecFieldName'
import type { ExcelColumn } from '@/features/excel/types'

function col(key: string, label: string): ExcelColumn {
  return { key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120 }
}

describe('sanitizeEcName', () => {
  it('garde lettres/chiffres/accents et remplace le reste par _', () => {
    expect(sanitizeEcName('Disponibilité FR-NL')).toBe('Disponibilité_FR_NL')
  })
  it('rogne les underscores aux extrémités', () => {
    expect(sanitizeEcName(' (Prix) ')).toBe('Prix')
  })
  it('retombe sur "field" si vide', () => {
    expect(sanitizeEcName('   ')).toBe('field')
  })
})

describe('buildEcFieldNames', () => {
  it('mappe chaque clé de colonne vers un nom assaini', () => {
    const m = buildEcFieldNames([col('col_1', 'Prix TTC'), col('col_2', 'Nom')])
    expect(m.get('col_1')).toBe('Prix_TTC')
    expect(m.get('col_2')).toBe('Nom')
  })
  it('déduplique les collisions avec un suffixe stable', () => {
    const m = buildEcFieldNames([col('a', 'Prix'), col('b', 'Prix'), col('c', 'prix')])
    expect(m.get('a')).toBe('Prix')
    expect(m.get('b')).toBe('Prix_2')
    expect(m.get('c')).toBe('Prix_3')
  })
  it('est déterministe (même entrée → même sortie)', () => {
    const cols = [col('a', 'X'), col('b', 'X')]
    expect([...buildEcFieldNames(cols)]).toEqual([...buildEcFieldNames(cols)])
  })
})
