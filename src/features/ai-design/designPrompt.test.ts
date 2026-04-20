import { describe, it, expect } from 'vitest'
import { buildDesignPrompt } from './designPrompt'

describe('buildDesignPrompt', () => {
  const base = {
    userPrompt: 'Affiche promo -30% soldes été',
    widthMm: 420,
    heightMm: 594,
    formatLabel: 'A2 portrait',
    style: 'bold' as const,
    includeBleed: true,
    bleedMm: 3,
    availableFonts: ['Inter', 'Montserrat', 'Playfair Display'],
    palette: ['#ff6b35', '#1a1a1a'],
  }

  it('inclut le prompt utilisateur', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('Affiche promo -30% soldes été')
  })

  it('inclut les dimensions en mm', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('420')
    expect(p).toContain('594')
  })

  it('mentionne le bleed quand includeBleed=true', () => {
    const p = buildDesignPrompt(base)
    expect(p).toMatch(/fond perdu.*3\s*mm/i)
  })

  it('ne mentionne PAS de bleed quand includeBleed=false', () => {
    const p = buildDesignPrompt({ ...base, includeBleed: false })
    expect(p).not.toMatch(/fond perdu/i)
  })

  it('liste explicitement les fonts autorisées', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('Inter')
    expect(p).toContain('Montserrat')
    expect(p).toContain('Playfair Display')
  })

  it('impose la palette si fournie', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('#ff6b35')
    expect(p).toContain('#1a1a1a')
  })

  it("n'impose pas de palette si omise", () => {
    const p = buildDesignPrompt({ ...base, palette: undefined })
    expect(p.toLowerCase()).toContain('libre')
  })

  it('documente les data-role attendus', () => {
    const p = buildDesignPrompt(base)
    expect(p).toContain('data-role')
    expect(p).toMatch(/title|headline/)
    expect(p).toMatch(/image-slot/)
  })

  it('inclut le style demandé', () => {
    const p = buildDesignPrompt(base)
    expect(p.toLowerCase()).toContain('bold')
  })
})
