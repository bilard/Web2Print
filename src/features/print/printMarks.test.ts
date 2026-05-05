import { describe, it, expect } from 'vitest'
import { buildPrintMarks } from './printMarks'
import { Rect } from 'fabric'

describe('buildPrintMarks', () => {
  const baseOpts = {
    canvasWidthPx: 2480,
    canvasHeightPx: 3508,
    bleedPx: 35.4,
    cropMarkLengthPx: 59,
    cropMarkOffsetPx: 35.4,
    safeAreaPx: 59,
    showPrintMarks: true,
    showSafeArea: true,
  }

  it('retourne 0 objet si rien n\'est visible', () => {
    const objs = buildPrintMarks({ ...baseOpts, showPrintMarks: false, showSafeArea: false })
    expect(objs).toEqual([])
  })

  it('marque tous les objets avec data.isPrintMark', () => {
    const objs = buildPrintMarks(baseOpts)
    expect(objs.length).toBeGreaterThan(0)
    for (const o of objs) {
      expect((o as any).data?.isPrintMark).toBe(true)
      expect(o.selectable).toBe(false)
      expect(o.evented).toBe(false)
      expect((o as any).excludeFromExport).toBe(true)
    }
  })

  it('dessine un rect de fond perdu englobant si bleed > 0', () => {
    const objs = buildPrintMarks(baseOpts)
    const bleedRect = objs.find((o) => (o as any).data?.markType === 'bleed-rect')
    expect(bleedRect).toBeInstanceOf(Rect)
    expect(bleedRect!.left).toBeCloseTo(-baseOpts.bleedPx, 1)
    expect(bleedRect!.top).toBeCloseTo(-baseOpts.bleedPx, 1)
  })

  it('dessine 8 traits de coupe trim (2 par coin × 4 coins)', () => {
    const objs = buildPrintMarks(baseOpts)
    const cropLines = objs.filter((o) => (o as any).data?.markType === 'crop-mark')
    expect(cropLines).toHaveLength(8)
    for (const l of cropLines) {
      expect(l).toBeInstanceOf(Rect)
    }
  })

  it('n\'émet plus de bleed-mark (simplification : trim only)', () => {
    const objs = buildPrintMarks(baseOpts)
    const bleedLines = objs.filter((o) => (o as any).data?.markType === 'bleed-mark')
    expect(bleedLines).toHaveLength(0)
  })

  it('dessine un rect de zone de sécurité si showSafeArea', () => {
    const objs = buildPrintMarks(baseOpts)
    const safe = objs.find((o) => (o as any).data?.markType === 'safe-area')
    expect(safe).toBeInstanceOf(Rect)
    expect(safe!.left).toBeCloseTo(baseOpts.safeAreaPx, 1)
    expect(safe!.top).toBeCloseTo(baseOpts.safeAreaPx, 1)
  })

  it('n\'émet pas de bleed-rect si bleedPx === 0 mais conserve les traits de coupe', () => {
    const objs = buildPrintMarks({ ...baseOpts, bleedPx: 0 })
    expect(objs.find((o) => (o as any).data?.markType === 'bleed-rect')).toBeUndefined()
    expect(objs.filter((o) => (o as any).data?.markType === 'crop-mark')).toHaveLength(8)
  })
})
