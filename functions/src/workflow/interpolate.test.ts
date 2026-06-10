// functions/src/workflow/interpolate.test.ts
import { describe, it, expect } from 'vitest'
import { interpolate, buildInterpolationContext, extractRows } from './interpolate'

describe('interpolate', () => {
  it('remplace les tokens {{path}} dans une string', () => {
    expect(interpolate('Bonjour {{name}}', { name: 'Léa' })).toBe('Bonjour Léa')
  })
  it('garde le token si non résolu', () => {
    expect(interpolate('x={{missing}}', {})).toBe('x={{missing}}')
  })
  it('traverse objets/arrays', () => {
    expect(interpolate({ a: ['{{n}}'] }, { n: '1' })).toEqual({ a: ['1'] })
  })
})

describe('extractRows / buildInterpolationContext', () => {
  it("aplati les colonnes d'un sheet en listes jointes", () => {
    const ctx = buildInterpolationContext({ sheet: { rows: [{ p: 'a' }, { p: 'b' }] } })
    expect(ctx.p).toBe('a, b')
  })
  it('extractRows lit un array ou un sheet', () => {
    expect(extractRows([{ x: 1 }])).toEqual([{ x: 1 }])
    expect(extractRows({ rows: [{ x: 1 }] })).toEqual([{ x: 1 }])
    expect(extractRows('nope')).toBeNull()
  })
})
