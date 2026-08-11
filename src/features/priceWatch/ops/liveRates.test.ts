import { describe, it, expect } from 'vitest'
import { pushSample, rateOf, RATE_WINDOW_MS, IDLE_AFTER_MS, type RateSample } from './liveRates'

const T = 1_700_000_000_000

describe('régime instantané de la collecte', () => {
  it('rend une pente en fiches/min, pas un cumul', () => {
    const h: RateSample[] = [
      { at: T, products: 100, pages: 10 },
      { at: T + 60_000, products: 190, pages: 16 },
    ]
    const r = rateOf(h, T + 60_000)
    expect(r.productsPerMin).toBe(90)
    expect(r.pagesPerMin).toBe(6)
    expect(r.pulse).toBe('live')
  })

  it('⚠ ne rend pas l’infini sur un seul relevé', () => {
    // Sans deux points, il n'y a pas de pente. Rendre « 100/min » au premier écho
    // afficherait un régime inventé, et c'est exactement ce qu'on reproche aux cumuls.
    expect(rateOf([{ at: T, products: 100, pages: 10 }], T).productsPerMin).toBe(0)
    expect(rateOf([], T).productsPerMin).toBe(0)
  })

  it('déclare l’arrêt quand plus rien n’écrit, malgré des cumuls élevés', () => {
    const h: RateSample[] = [{ at: T, products: 50_000, pages: 900 }]
    const r = rateOf(h, T + IDLE_AFTER_MS + 1)
    expect(r.pulse).toBe('idle')
    expect(r.productsPerMin).toBe(0)
  })

  it('un battement serveur SANS nouveau produit compte comme du travail', () => {
    // Une page lue qui ne rend aucune fiche est du travail : sans ce signal, un site en
    // train de balayer des rayons vides serait annoncé à l'arrêt.
    const r = rateOf([{ at: T, products: 10, pages: 1 }], T + 60_000, T + 59_000)
    expect(r.pulse).toBe('live')
    expect(r.sinceChangeMs).toBe(1_000)
  })

  it('⚠ un écho Firestore identique ne casse pas la pente', () => {
    // Le même document est réémis à chaque écriture voisine. Empiler ces doublons ferait
    // retomber le compte-tours au ralenti entre deux pages.
    let h: RateSample[] = []
    h = pushSample(h, { at: T, products: 100, pages: 10 })
    h = pushSample(h, { at: T + 10_000, products: 100, pages: 10 })
    h = pushSample(h, { at: T + 20_000, products: 100, pages: 10 })
    expect(h).toHaveLength(1)
    h = pushSample(h, { at: T + 30_000, products: 145, pages: 13 })
    expect(h).toHaveLength(2)
    expect(rateOf(h, T + 30_000).productsPerMin).toBe(90)
  })

  it('oublie ce qui sort de la fenêtre', () => {
    let h: RateSample[] = [{ at: T, products: 1, pages: 1 }]
    h = pushSample(h, { at: T + RATE_WINDOW_MS * 2 + 1, products: 2, pages: 2 })
    expect(h).toHaveLength(1)
  })

  it('passe en régime ralenti entre travail et arrêt', () => {
    const r = rateOf([{ at: T, products: 10, pages: 1 }], T + 60_000)
    expect(r.pulse).toBe('slow')
  })
})
