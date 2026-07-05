import { describe, expect, it } from 'vitest'
import type { CatalogCardStyle, CatalogPageStyle, CatalogTheme } from '../../catalogTypes'
import { DEFAULT_CARD_STYLE, DEFAULT_PAGE_STYLE } from '../../catalogTypes'
import { cardStyleVars, mergedPageStyle, pageStyleVars } from './catalogCss'

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

  it('formes des badges (presets graphiques) : rayon + inclinaison — rien émis aux défauts', () => {
    const v = vars({ priceShape: 'pill', priceRotate: 0, stickerShape: 'square', stickerRotate: 0 })
    expect(v['--cat-price-radius']).toBe('999px')
    expect(v['--cat-price-rot']).toBe('0deg')
    expect(v['--cat-sticker-radius']).toBe('4px')
    expect(v['--cat-sticker-rot']).toBe('0deg')
    const d = vars({})
    expect(d['--cat-price-radius']).toBeUndefined()
    expect(d['--cat-price-rot']).toBeUndefined()
    expect(d['--cat-sticker-radius']).toBeUndefined()
    expect(d['--cat-sticker-rot']).toBeUndefined()
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

  it('polices par champ (nom, marque, unité, sticker) et échelles (réf, cartouche, sticker)', () => {
    const v = vars({ nameFont: 'Jura', brandFont: 'Oswald', unitFont: 'Inter', stickerFont: 'Archivo', refScale: 1.2, promoScale: 0.8, stickerScale: 1.3 })
    expect(v['--cat-font-name']).toBe("'Jura', sans-serif")
    expect(v['--cat-font-brand']).toBe("'Oswald', sans-serif")
    expect(v['--cat-font-unit']).toBe("'Inter', sans-serif")
    expect(v['--cat-font-sticker']).toBe("'Archivo', sans-serif")
    expect(v['--cat-s-ref']).toBe('1.2')
    expect(v['--cat-s-promo']).toBe('0.8')
    expect(v['--cat-s-sticker']).toBe('1.3')
  })

  it('vedette : échelle, police, couleur/dégradé du ruban, cadre UNI (border-color sans dégradé)', () => {
    const v = vars({ vedetteScale: 1.3, vedetteFont: 'Jura', vedetteBg: '#111111', vedetteBg2: '#222222' })
    expect(v['--cat-s-vedette']).toBe('1.3')
    expect(v['--cat-font-vedette']).toBe("'Jura', sans-serif")
    expect(v['--cat-vedette-bg']).toBe('linear-gradient(135deg, #111111, #222222)')
    expect(v['--cat-vedette-ink']).toBe('#111111')
    // Défauts : rien n'est émis (ruban/cadre retombent sur l'accent du thème).
    expect(vars({})['--cat-vedette-bg']).toBeUndefined()
    expect(vars({})['--cat-vedette-ink']).toBeUndefined()
  })

  it("taille de l'image : largeur de colonne et marge du visuel", () => {
    const v = vars({ imageShare: 50, imagePad: 4 })
    expect(v['--cat-img-share']).toBe('50%')
    expect(v['--cat-img-pad']).toBe('4px')
  })
})

describe('pageStyleVars / mergedPageStyle', () => {
  it('style absent → aucun override, fusion = défauts complets', () => {
    expect(pageStyleVars(undefined)).toEqual({})
    expect(mergedPageStyle(undefined)).toEqual(DEFAULT_PAGE_STYLE)
  })

  it("style par défaut → n'émet rien", () => {
    const v = pageStyleVars({ ...DEFAULT_PAGE_STYLE }) as Record<string, string | undefined>
    expect(Object.values(v).every((x) => x === undefined)).toBe(true)
  })

  it('style PARTIEL (ancien document/modèle) → fusion sans trous', () => {
    const partial = { showHeader: false, coverTitleScale: 1.2 } as CatalogPageStyle
    const m = mergedPageStyle(partial)
    expect(m.showHeader).toBe(false)
    expect(m.coverTitleScale).toBe(1.2)
    expect(m.showFooter).toBe(true)
    expect(m.coverOverlay).toBe(DEFAULT_PAGE_STYLE.coverOverlay)
    const v = pageStyleVars(partial) as Record<string, string | undefined>
    expect(v['--cat-p-cover']).toBe('1.2')
    expect(v['--cat-p-head']).toBeUndefined()
  })

  it('chaque échelle émet sa variable dédiée', () => {
    const v = pageStyleVars({ ...DEFAULT_PAGE_STYLE, headerScale: 0.8, folioScale: 1.3, openerTitleScale: 1.1, backScale: 0.9 }) as Record<string, string | undefined>
    expect(v['--cat-p-head']).toBe('0.8')
    expect(v['--cat-p-folio']).toBe('1.3')
    expect(v['--cat-p-opener']).toBe('1.1')
    expect(v['--cat-p-back']).toBe('0.9')
  })
})
