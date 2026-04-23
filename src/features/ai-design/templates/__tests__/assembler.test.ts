import { describe, it, expect } from 'vitest'
import { assembleSvgFromTemplate } from '../assembler'
import { retailProductPortrait } from '../retail-product-portrait'
import type { TemplateFillData } from '../../templateFillSchema'

const fillData: TemplateFillData = {
  templateId: 'retail-product-portrait',
  palette: {
    primary: '#0A6E7C',
    secondary: '#E30613',
    neutral: '#F4F6F8',
    text: '#0E2A47',
  },
  copy: {
    title: 'TAILLE-HAIE À BATTERIE',
    subtitle: 'DUH752Z — Lame 75 cm',
    features: [
      { title: 'Puissance Équivalente', desc: 'Moteur BL sans balais.', pictoHint: 'zap' },
      { title: 'Conception Ergonomique', desc: 'Poignée pivotante 5 positions.', pictoHint: 'hand' },
    ],
    priceNew: '199,50€',
    priceOld: '250,77€',
    cta: 'ACHETER MAINTENANT',
    mentions: '*Batterie non incluse.*',
  },
  assetMappings: { logo: 0, badge: 1, heroProduct: 3 },
}

describe('assembleSvgFromTemplate', () => {
  it('produces a valid <svg> root', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toMatch(/^<svg /)
    expect(svg).toMatch(/<\/svg>$/)
    expect(svg).toContain('viewBox="0 0 210 297"')
  })

  it('substitutes palette colors in decorativeSvg', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('#0A6E7C')
    expect(svg).not.toContain('{{palette.primary}}')
  })

  it('emits placeholder image for heroProduct with correct id', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="heroProduct"')
    expect(svg).toContain('href="placeholder:heroProduct"')
  })

  it('emits title text with data-content', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="title"')
    expect(svg).toMatch(/data-content="TAILLE-HAIE À BATTERIE"/)
  })

  it('emits feature items with pictos', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="feature-0-title"')
    expect(svg).toContain('id="feature-0-desc"')
    expect(svg).toContain('id="feature-1-title"')
    expect(svg).toMatch(/data-content="Puissance Équivalente"/)
    expect(svg).toMatch(/data-content="Moteur BL sans balais\."/)
  })

  it('projects normalized bboxes to absolute mm', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 100,
      heightMm: 200,
      bleedMm: 0,
    })
    // logo bbox = {0.03, 0.02, 0.20, 0.10} → (3, 4, 20, 20) mm sur 100×200mm
    expect(svg).toMatch(/id="logo"[^>]*x="3"[^>]*y="4"[^>]*width="20"[^>]*height="20"/)
  })

  it('emits cta as text (no bg in new portrait — CTA is a link next to the price block)', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="cta"')
    expect(svg).toMatch(/data-content="ACHETER MAINTENANT"/)
  })

  it('omits slots when fillData has no matching content', () => {
    const partialFill: TemplateFillData = {
      ...fillData,
      copy: { ...fillData.copy, priceOld: undefined, mentions: undefined },
    }
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData: partialFill,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).not.toContain('id="priceOld"')
    expect(svg).not.toContain('id="mentions"')
  })

  it('uses bleed-extended viewBox when bleedMm > 0', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 3,
    })
    expect(svg).toContain('viewBox="-3 -3 216 303"')
  })

  it('emits circle background behind picto when shape=circle', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    // Portrait template : itemTemplate.picto.shape='circle', backgroundRef='primary'
    // → expect un <circle> de fond pour chaque feature rendu
    expect(svg).toMatch(/<circle id="feature-0-picto-bg"[^>]*fill="#0A6E7C"/)
    expect(svg).toMatch(/<circle id="feature-1-picto-bg"/)
  })

  it('omits tagline when template has no taglineHeader slot', () => {
    // Le template portrait actuel n'a pas de slot taglineHeader (titre dans
    // le header remplace cette fonction). Même avec une tagline dans fillData,
    // rien ne doit être émis.
    const withTagline = {
      ...fillData,
      copy: { ...fillData.copy, tagline: 'PROFITEZ DE L\'OFFRE MAKITA !' },
    }
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData: withTagline,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).not.toContain('id="taglineHeader"')
  })

  it('emits priceOldLabel with hardcoded content', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="priceOldLabel"')
    expect(svg).toMatch(/data-content="PRIX PUBLIC CONSEILL[ÉE&#201;]/)
  })

  it('priceNew background rect is rounded (has rx attribute)', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    // priceNew a backgroundRef='primary' → rect rounded.
    expect(svg).toMatch(/<rect id="priceNew-bg"[^>]*rx="/)
  })

  it('scaleFontSize scales proportionally on small formats (47×67mm)', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 47,
      heightMm: 67,
      bleedMm: 0,
    })
    // Scale = min(47/210, 67/297) ≈ 0.224. Title 32pt × 0.224 ≈ 7.17pt ≈ 2.53mm.
    // La bbox title h = 0.10 × 67mm = 6.7mm → le texte à 2.53mm tient largement dedans.
    const titleMatch = svg.match(/id="title"[^>]*font-size="([0-9.]+)"/)
    expect(titleMatch).not.toBeNull()
    const fontSizeMm = parseFloat(titleMatch![1])
    expect(fontSizeMm).toBeGreaterThan(2)
    expect(fontSizeMm).toBeLessThan(4)
    // Vérifie que le texte tient dans la bbox (h title = 0.10 * 67 = 6.7mm).
    expect(fontSizeMm).toBeLessThan(7)
  })

  it('scaleFontSize caps at 1.5× on very large formats (A2 420×594mm)', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 420,
      heightMm: 594,
      bleedMm: 0,
    })
    // Scale = min(420/210, 594/297) = min(2, 2) = 2, plafonné à 1.5.
    // Title 48pt × 1.5 = 72pt ≈ 25.4mm. On vérifie qu'on ne dépasse pas 1.5×.
    const titleMatch = svg.match(/id="title"[^>]*font-size="([0-9.]+)"/)
    expect(titleMatch).not.toBeNull()
    const fontSizeMm = parseFloat(titleMatch![1])
    // 48pt × 1.5 × 0.3528 = 25.4mm (plafonné). Sans plafond ce serait 33.87mm.
    expect(fontSizeMm).toBeLessThan(26)
  })
})
