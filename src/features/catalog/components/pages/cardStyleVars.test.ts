import { describe, it, expect } from 'vitest'
import { cardStyleVars } from './catalogCss'
import { DEFAULT_CARD_STYLE, type CatalogTheme } from '../../catalogTypes'

const THEME: CatalogTheme = {
  accent: '#0072bc', pageBg: '#ffffff', ink: '#333333', headerBg: '#111111', headerInk: '#ffffff',
  fontHeading: 'Montserrat', fontBody: 'Roboto',
} as CatalogTheme

describe('garde de lisibilité des couleurs texte (contraste vs fond de fiche)', () => {
  it('couleur de nom TROP PÂLE sur blanc (rose délavé) → ignorée (repli encre du thème)', () => {
    const v = cardStyleVars({ ...DEFAULT_CARD_STYLE, nameColor: '#f6c9cf' }, THEME) as Record<string, string | undefined>
    expect(v['--cat-name-ink']).toBeUndefined()
  })

  it('couleur de nom contrastée (rouge Milwaukee) → conservée', () => {
    const v = cardStyleVars({ ...DEFAULT_CARD_STYLE, nameColor: '#db011c' }, THEME) as Record<string, string | undefined>
    expect(v['--cat-name-ink']).toBe('#db011c')
  })

  it('fond de fiche SOMBRE : une couleur claire redevient valide', () => {
    const v = cardStyleVars({ ...DEFAULT_CARD_STYLE, cardBg: '#1a1a1a', nameColor: '#f6c9cf' }, THEME) as Record<string, string | undefined>
    expect(v['--cat-name-ink']).toBe('#f6c9cf')
  })

  it('description pâle ignorée → son opacité par défaut est conservée', () => {
    const v = cardStyleVars({ ...DEFAULT_CARD_STYLE, descColor: '#eeeeee' }, THEME) as Record<string, string | undefined>
    expect(v['--cat-desc-ink']).toBeUndefined()
    expect(v['--cat-desc-op']).toBeUndefined()
  })
})
