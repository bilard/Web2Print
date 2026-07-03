import { describe, expect, it } from 'vitest'
import type { CatalogCardStyle, CatalogTheme } from '../../catalogTypes'
import { DEFAULT_CARD_STYLE } from '../../catalogTypes'
import { cardStyleVars } from './catalogCss'

const THEME: CatalogTheme = {
  accent: '#e97817', pageBg: '#ffffff', ink: '#111827',
  headerBg: '#1c3d2e', headerInk: '#ffffff', fontHeading: 'Archivo', fontBody: 'Inter',
}

const vars = (over: Partial<CatalogCardStyle>) => cardStyleVars({ ...DEFAULT_CARD_STYLE, ...over }, THEME) as Record<string, string | undefined>

describe('cardStyleVars', () => {
  it('style absent → aucun override', () => {
    expect(cardStyleVars(undefined, THEME)).toEqual({})
  })

  it("style par défaut → n'émet rien (tout retombe sur le thème)", () => {
    expect(Object.values(vars({})).every((v) => v === undefined)).toBe(true)
  })

  it('style PARTIEL (ancien document/modèle) → fusion avec les défauts, pas de valeurs « undefinedpx »', () => {
    const v = cardStyleVars({ promoBg: '#ff0000' } as CatalogCardStyle, THEME) as Record<string, string | undefined>
    expect(v['--cat-promo-bg']).toBe('#ff0000')
    expect(v['--cat-cell-radius']).toBeUndefined()
    expect(v['--cat-img-share']).toBeUndefined()
  })

  it('fin de dégradé seule → dégradé depuis la couleur HÉRITÉE du thème', () => {
    expect(vars({ priceBg2: '#05a342' })['--cat-price-bg']).toBe('linear-gradient(135deg, #e97817, #05a342)')
    expect(vars({ wasBg2: '#0000ff' })['--cat-was-bg']).toBe('linear-gradient(135deg, #1c3d2e, #0000ff)')
  })

  it('dégradé complet : base + fin + angle commun', () => {
    const v = vars({ promoBg: '#111111', promoBg2: '#222222', gradientAngle: 90 })
    expect(v['--cat-promo-bg']).toBe('linear-gradient(90deg, #111111, #222222)')
  })

  it('polices par champ (nom, marque, unité) et échelles (réf, cartouche)', () => {
    const v = vars({ nameFont: 'Jura', brandFont: 'Oswald', unitFont: 'Inter', refScale: 1.2, promoScale: 0.8 })
    expect(v['--cat-font-name']).toBe("'Jura', sans-serif")
    expect(v['--cat-font-brand']).toBe("'Oswald', sans-serif")
    expect(v['--cat-font-unit']).toBe("'Inter', sans-serif")
    expect(v['--cat-s-ref']).toBe('1.2')
    expect(v['--cat-s-promo']).toBe('0.8')
  })

  it("taille de l'image : largeur de colonne et marge du visuel", () => {
    const v = vars({ imageShare: 50, imagePad: 4 })
    expect(v['--cat-img-share']).toBe('50%')
    expect(v['--cat-img-pad']).toBe('4px')
  })
})
