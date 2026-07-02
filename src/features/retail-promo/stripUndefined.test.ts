import { describe, expect, it } from 'vitest'
import { stripUndefined } from './stripUndefined'

describe('stripUndefined', () => {
  it('retire les clés undefined au premier niveau (fieldMap « (non mappé) »)', () => {
    expect(stripUndefined({ name: undefined, brand: 'Marques' })).toEqual({ brand: 'Marques' })
  })

  it('retire les undefined imbriqués (config.styles.fontWeight remis par défaut)', () => {
    const config = { styles: { name: { fontWeight: undefined, fontSize: 42 } }, accent: '#EF4444' }
    expect(stripUndefined(config)).toEqual({ styles: { name: { fontSize: 42 } }, accent: '#EF4444' })
  })

  it('préserve null, 0, false et les chaînes vides', () => {
    expect(stripUndefined({ a: null, b: 0, c: false, d: '' })).toEqual({ a: null, b: 0, c: false, d: '' })
  })

  it('traverse les tableaux sans les casser', () => {
    expect(stripUndefined({ rules: [{ op: 'eq', v: undefined }, { op: 'gt' }] }))
      .toEqual({ rules: [{ op: 'eq' }, { op: 'gt' }] })
  })

  it('renvoie les scalaires tels quels', () => {
    expect(stripUndefined('x')).toBe('x')
    expect(stripUndefined(null)).toBeNull()
  })
})
