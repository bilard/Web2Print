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
    // logo bbox = {0.04, 0.025, 0.24, 0.065} → (4, 5, 24, 13) mm
    expect(svg).toMatch(/id="logo"[^>]*x="4"[^>]*y="5"[^>]*width="24"[^>]*height="13"/)
  })

  it('emits cta with background rect', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="cta-bg"')
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

  it('emits tagline when copy.tagline is provided', () => {
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
    expect(svg).toContain('id="taglineHeader"')
    expect(svg).toMatch(/data-content="PROFITEZ DE L&#39;OFFRE MAKITA !"|data-content="PROFITEZ DE L'OFFRE MAKITA !"/)
  })

  it('omits tagline when copy.tagline is absent', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData, // no tagline in base fillData
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).not.toContain('id="taglineHeader"')
  })

  it('emits price labels with hardcoded content', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="priceOldLabel"')
    expect(svg).toContain('id="priceNewLabel"')
    expect(svg).toMatch(/data-content="PRIX PUBLIC CONSEILL[ÉE&#201;]/)
    expect(svg).toMatch(/data-content="PRIX PROMO T\.T\.C\.">/)
  })

  it('cta background rect is rounded (has rx attribute)', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    // CTA a backgroundRef='primary' → rect de fond avec rx
    expect(svg).toMatch(/<rect id="cta-bg"[^>]*rx="/)
  })

  it('scaleFontSize keeps readable sizes on small formats (47×67mm)', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 47,
      heightMm: 67,
      bleedMm: 0,
    })
    // Avec l'ancien scaling sqrt(area/A4), title 48pt → ~10.7pt → ~3.8mm
    // Avec le nouveau (min ratio, floor 0.6), title 48pt → 28.8pt → ~10.2mm
    const titleMatch = svg.match(/id="title"[^>]*font-size="([0-9.]+)"/)
    expect(titleMatch).not.toBeNull()
    const fontSizeMm = parseFloat(titleMatch![1])
    // Plancher attendu : floor 0.6 * 48pt * 0.3528 = ~10.16 mm. Tolérance ±1mm.
    expect(fontSizeMm).toBeGreaterThan(9)
    expect(fontSizeMm).toBeLessThan(12)
  })
})
