import { describe, it, expect } from 'vitest'
import { buildReformatTarget } from './reformatRule'

describe('buildReformatTarget', () => {
  it('produit un id déterministe et un label depuis un preset', () => {
    expect(buildReformatTarget(842, 595, 'A4 Paysage')).toEqual({
      id: 'reformat-842x595',
      label: 'A4 Paysage',
      w: 842,
      h: 595,
    })
  })

  it('génère un label en mm quand aucun nom de preset n’est fourni', () => {
    // 595 pt → 210 mm, 842 pt → 297 mm (A4)
    const t = buildReformatTarget(595, 842)
    expect(t.id).toBe('reformat-595x842')
    expect(t.label).toBe('210 × 297 mm')
    expect(t.w).toBe(595)
    expect(t.h).toBe(842)
  })

  it('arrondit les dimensions fractionnaires', () => {
    const t = buildReformatTarget(595.7, 842.3, 'X')
    expect(t.id).toBe('reformat-596x842')
    expect(t.w).toBe(596)
    expect(t.h).toBe(842)
  })
})
