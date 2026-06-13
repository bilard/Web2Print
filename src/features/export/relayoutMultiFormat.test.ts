import { describe, it, expect } from 'vitest'
import {
  buildDescriptors,
  applyRelayout,
  RelayoutSchema,
  type DesignObject,
  type RelayoutElement,
} from './relayoutMultiFormat'

const bg: DesignObject = { type: 'image', left: 0, top: 0, width: 1000, height: 1000, scaleX: 1, scaleY: 1, data: { role: 'background' } }
const title: DesignObject = { type: 'textbox', left: 100, top: 100, width: 400, height: 80, scaleX: 1, scaleY: 1, text: 'Promo du jour', data: { role: 'title' } }

describe('buildDescriptors', () => {
  it('exprime la bbox en fractions et extrait role/text', () => {
    const [d0, d1] = buildDescriptors([bg, title], 1000, 1000)
    expect(d0).toMatchObject({ i: 0, type: 'image', role: 'background', xPct: 0, yPct: 0, wPct: 1, hPct: 1 })
    expect(d1).toMatchObject({ i: 1, type: 'textbox', role: 'title', text: 'Promo du jour', xPct: 0.1, yPct: 0.1, wPct: 0.4 })
    expect(d1.hPct).toBeCloseTo(0.08, 5)
  })

  it('renvoie [] si dimensions source invalides', () => {
    expect(buildDescriptors([bg], 0, 1000)).toEqual([])
  })
})

describe('applyRelayout', () => {
  const dst = { w: 1080, h: 1920 } // story 9:16

  it('cover remplit la page cible (déborde, jamais de vide)', () => {
    const els: RelayoutElement[] = [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }]
    const [out] = applyRelayout([bg], 1000, 1000, dst.w, dst.h, els)
    // cover sur 1000×1000 → f = max(1080/1000, 1920/1000) = 1.92
    expect(out.scaleX).toBeCloseTo(1.92, 5)
    expect(out.scaleY).toBeCloseTo(1.92, 5)
    const renderedW = (out.width as number) * (out.scaleX as number)
    const renderedH = (out.height as number) * (out.scaleY as number)
    expect(renderedW).toBeGreaterThanOrEqual(dst.w) // couvre la largeur
    expect(renderedH).toBeGreaterThanOrEqual(dst.h) // couvre la hauteur
  })

  it('contain tient dans la boîte assignée, ratio préservé, centré', () => {
    // boîte = moitié haute, pleine largeur : x0 y0 w1 h0.5 → 1080×960
    const els: RelayoutElement[] = [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 0.5, fit: 'contain' }]
    const [out] = applyRelayout([title], 1000, 1000, dst.w, dst.h, els)
    // title 400×80 → contain dans 1080×960 → f = min(1080/400, 960/80) = 2.7
    expect(out.scaleX).toBeCloseTo(2.7, 5)
    expect(out.scaleX).toBe(out.scaleY) // pas de distorsion
    // centré horizontalement : left = 0 + (1080 - 400*2.7)/2 = 0
    expect(out.left).toBeCloseTo(0, 5)
    // centré verticalement dans la boîte 960 : top = 0 + (960 - 80*2.7)/2 = 372
    expect(out.top).toBeCloseTo(372, 5)
  })

  it('objet sans placement → repli homothétique', () => {
    const [out] = applyRelayout([title], 1000, 1000, dst.w, dst.h, [])
    // homothétie contain 1000→1080×1920 : s = min(1.08, 1.92) = 1.08
    expect(out.scaleX).toBeCloseTo(1.08, 5)
  })

  it('clampe les pourcentages hors-borne', () => {
    const els: RelayoutElement[] = [{ i: 0, xPct: -1, yPct: 2, wPct: 5, hPct: 1, fit: 'contain' }]
    const [out] = applyRelayout([title], 1000, 1000, dst.w, dst.h, els)
    expect(Number.isFinite(out.left as number)).toBe(true)
    expect(Number.isFinite(out.top as number)).toBe(true)
  })

  it('préserve les propriétés non géométriques', () => {
    const els: RelayoutElement[] = [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'contain' }]
    const [out] = applyRelayout([title], 1000, 1000, dst.w, dst.h, els)
    expect(out.text).toBe('Promo du jour')
    expect((out.data as { role?: string }).role).toBe('title')
    expect(out.type).toBe('textbox')
  })

  it('objet sans dimensions (group) avec placement → repli homothétique sans crash', () => {
    const group: DesignObject = { type: 'group', left: 0, top: 0, scaleX: 1, scaleY: 1, data: { role: 'background' } }
    const els: RelayoutElement[] = [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }]
    const [out] = applyRelayout([group], 1000, 1000, dst.w, dst.h, els)
    expect(out).toBeDefined()
    expect(out.type).toBe('group')
  })
})

describe('RelayoutSchema', () => {
  it('accepte une réponse valide', () => {
    const ok = RelayoutSchema.safeParse({ formats: [{ id: 'story', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }] }] })
    expect(ok.success).toBe(true)
  })
  it('rejette un fit inconnu', () => {
    const ko = RelayoutSchema.safeParse({ formats: [{ id: 'story', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'stretch' }] }] })
    expect(ko.success).toBe(false)
  })
})
