import { describe, it, expect } from 'vitest'
import { shouldReformat, buildReformatTarget } from './reformatRule'

describe('shouldReformat', () => {
  it('refuse si la page n’a aucun objet de design', () => {
    expect(
      shouldReformat({ designObjectCount: 0, srcW: 595, srcH: 842, dstW: 842, dstH: 595 }),
    ).toBe(false)
  })

  it('refuse si les dimensions sont inchangées (arrondi)', () => {
    expect(
      shouldReformat({ designObjectCount: 3, srcW: 842, srcH: 595, dstW: 842.4, dstH: 594.6 }),
    ).toBe(false)
  })

  it('accepte si contenu présent et dimensions réellement différentes', () => {
    expect(
      shouldReformat({ designObjectCount: 1, srcW: 595, srcH: 842, dstW: 1684, dstH: 1191 }),
    ).toBe(true)
  })

  it('accepte si une seule dimension change (ex. hauteur uniquement)', () => {
    expect(
      shouldReformat({ designObjectCount: 2, srcW: 595, srcH: 842, dstW: 595, dstH: 1190 }),
    ).toBe(true)
  })
})

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
