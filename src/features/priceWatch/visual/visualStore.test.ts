import { describe, it, expect } from 'vitest'
import { chunkVisuals, type StoredVisual } from './visualStore'

const entry = (note: string): StoredVisual => ({ score: 80, verdict: 'same', note, at: 1, v: 'pw-visual-1' })

describe('chunkVisuals', () => {
  it('tient sous la limite d’un document Firestore', () => {
    // Piège déjà rencontré sur le catalogue source : chunké par NOMBRE, le document
    // dépassait 1 048 576 o et Firestore refusait l'écriture en fin de passe — toute
    // l'analyse était perdue. La note est un texte libre : seuls les octets comptent.
    const entries: [string, StoredVisual][] = Array.from({ length: 16_000 }, (_, i) =>
      [`k${i}`, entry('Jante 3 trous identique, teinte plus claire chez le concurrent')])
    const chunks = chunkVisuals(entries)
    for (const c of chunks) {
      expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThan(1_000_000)
    }
    expect(Object.keys(Object.assign({}, ...chunks))).toHaveLength(16_000)
  })

  it('ne perd aucune entrée et n’en invente aucune', () => {
    const entries: [string, StoredVisual][] = [['a', entry('x')], ['b', entry('y')]]
    const merged = Object.assign({}, ...chunkVisuals(entries))
    expect(merged).toEqual({ a: entry('x'), b: entry('y') })
  })

  it('rend toujours au moins une tranche, même vide', () => {
    // Sans cela, une table vidée n'écraserait rien et les anciens verdicts
    // ressusciteraient à la relecture.
    expect(chunkVisuals([])).toEqual([{}])
  })

  it('ouvre une tranche dès que la suivante ferait déborder', () => {
    // Deux entrées de 400 Ko tiennent ensemble sous le plafond de 900 Ko ; la troisième
    // ouvre une tranche. C'est le seuil en OCTETS qui décide, jamais le compte d'entrées.
    const big: [string, StoredVisual][] = Array.from({ length: 3 }, (_, i) =>
      [`k${i}`, entry('n'.repeat(400_000))])
    const chunks = chunkVisuals(big)
    expect(chunks).toHaveLength(2)
    for (const c of chunks) {
      expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThan(1_048_576)
    }
  })
})
