import { describe, it, expect } from 'vitest'
import { langBreakdown } from './langBreakdown'

describe('langBreakdown', () => {
  it('les langues étrangères passent devant, la plus fournie en tête', () => {
    const out = langBreakdown(['fr', 'de', 'de', 'nl', 'de', 'nl', 'fr'])
    expect(out.map((x) => x.lang)).toEqual(['de', 'nl', 'fr'])
    expect(out[0].count).toBe(3)
  })

  it("l'indéterminé est compté à part, en dernier — jamais fondu dans le français", () => {
    const out = langBreakdown(['fr', null, null, 'en'])
    expect(out.map((x) => x.lang)).toEqual(['en', 'fr', null])
    expect(out.find((x) => x.lang === null)?.count).toBe(2)
    expect(out.find((x) => x.lang === 'fr')?.count).toBe(1)
  })

  it('à volume égal, l’ordre reste stable (alphabétique)', () => {
    expect(langBreakdown(['it', 'de']).map((x) => x.lang)).toEqual(['de', 'it'])
  })

  it('catalogue vide → aucune pastille', () => {
    expect(langBreakdown([])).toEqual([])
  })
})
