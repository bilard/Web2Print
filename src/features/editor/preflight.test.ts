import { describe, it, expect } from 'vitest'
import { runPreflight, type PreflightObjectInfo } from './preflight'

// Page A6 paysage à 300 DPI : ~1748 × 1240 px. Tests sur une page simple 1200×800.
const DOC = { width: 1200, height: 800, dpi: 300, safeMm: 3, bleedMm: 2 }

const base: PreflightObjectInfo = {
  id: 'o1', name: 'Objet', isImage: false, isText: false,
  left: 300, top: 300, width: 200, height: 100,
}

describe('runPreflight — images', () => {
  it('erreur sous 150 DPI effectifs, avertissement sous 225, rien au-dessus', () => {
    // largeur affichée 600 px à 300 DPI = 2 pouces
    const img = { ...base, isImage: true, width: 600 }
    expect(runPreflight([{ ...img, naturalWidth: 200 }], DOC)[0]).toMatchObject({ kind: 'low-res-image', severity: 'error' }) // 100 DPI
    expect(runPreflight([{ ...img, naturalWidth: 400 }], DOC)[0]).toMatchObject({ kind: 'low-res-image', severity: 'warning' }) // 200 DPI
    expect(runPreflight([{ ...img, naturalWidth: 600 }], DOC)).toHaveLength(0) // 300 DPI
  })
})

describe('runPreflight — page', () => {
  it('tolère le fond perdu, signale au-delà, erreur si entièrement hors page', () => {
    const bleedPx = (2 / 25.4) * 300 // ≈ 23.6 px
    expect(runPreflight([{ ...base, left: -bleedPx + 1 }], DOC)).toHaveLength(0)
    expect(runPreflight([{ ...base, left: -60 }], DOC)[0]).toMatchObject({ kind: 'out-of-page', severity: 'warning' })
    expect(runPreflight([{ ...base, left: 1300 }], DOC)[0]).toMatchObject({ kind: 'out-of-page', severity: 'error' })
  })
})

describe('runPreflight — textes', () => {
  it('texte < 5 pt signalé (px → pt via dpi)', () => {
    // 5 pt à 300 DPI ≈ 20.8 px
    const txt = { ...base, isText: true }
    expect(runPreflight([{ ...txt, fontSizePx: 15 }], DOC)[0]).toMatchObject({ kind: 'tiny-text' })
    expect(runPreflight([{ ...txt, fontSizePx: 30 }], DOC)).toHaveLength(0)
  })

  it('texte dans la marge de sécurité signalé, pas de doublon si déjà hors page', () => {
    const safePx = (3 / 25.4) * 300 // ≈ 35.4 px
    const txt = { ...base, isText: true, fontSizePx: 40 }
    expect(runPreflight([{ ...txt, left: safePx - 5 }], DOC)[0]).toMatchObject({ kind: 'near-edge-text' })
    const issues = runPreflight([{ ...txt, left: -60 }], DOC)
    expect(issues.map((i) => i.kind)).toEqual(['out-of-page'])
  })
})
