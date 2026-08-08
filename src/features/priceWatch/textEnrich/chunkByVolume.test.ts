import { describe, it, expect } from 'vitest'
import { chunkByVolume } from './chunkByVolume'

const weigh = (s: string) => s.length

describe('chunkByVolume', () => {
  it('coupe quand le budget de caractères est atteint', () => {
    const out = chunkByVolume(['a'.repeat(300), 'b'.repeat(300), 'c'.repeat(300)], weigh, 700, 10)
    expect(out.map((c) => c.length)).toEqual([2, 1])
  })

  it('une fiche plus lourde que le budget part seule, elle n’est pas écartée', () => {
    // Ce sont les fiches les plus riches — celles qui gagnent le plus à être réécrites.
    const out = chunkByVolume(['x'.repeat(9000), 'y'], weigh, 4000, 10)
    expect(out).toHaveLength(2)
    expect(out[0][0].length).toBe(9000)
  })

  it('borne aussi le NOMBRE de fiches, même minuscules', () => {
    const out = chunkByVolume(Array.from({ length: 25 }, () => 'a'), weigh, 4000, 10)
    expect(out.map((c) => c.length)).toEqual([10, 10, 5])
  })

  it('liste vide → aucun lot', () => {
    expect(chunkByVolume([], weigh)).toEqual([])
  })

  it('ne perd aucune fiche', () => {
    const items = Array.from({ length: 37 }, (_, i) => 'z'.repeat(i * 40))
    const out = chunkByVolume(items, weigh, 1000, 10)
    expect(out.flat()).toEqual(items)
  })
})
