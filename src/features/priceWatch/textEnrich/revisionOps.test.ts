import { describe, it, expect } from 'vitest'
import { opsOf } from './revisionOps'
import type { TextRevision } from '../textRevisionsStore'

const rev = (over: Partial<TextRevision> = {}): TextRevision => ({ productId: 'a', at: 1, ...over })

describe('opsOf', () => {
  it('rend ce que la révision déclare', () => {
    expect(opsOf(rev({ ops: { improve: true } }), 'de')).toEqual({ translate: false, improve: true })
    expect(opsOf(rev({ ops: { translate: true, improve: true } }), 'fr'))
      .toEqual({ translate: true, improve: true })
  })

  // ⚠ Le cas qui vidait le filtre « Traduits » : 46 fiches réécrites la veille de l'ajout
  // du champ, rangées ni en traduites ni en améliorées, donc invisibles des deux côtés.
  it('déduit la traduction d’une révision sans `ops` sur un texte étranger', () => {
    expect(opsOf(rev(), 'nl')).toEqual({ translate: true, improve: false })
  })

  it('ne conclut rien sur un texte français ou de langue indéterminée', () => {
    expect(opsOf(rev(), 'fr')).toEqual({ translate: false, improve: false })
    expect(opsOf(rev(), null)).toEqual({ translate: false, improve: false })
  })

  it('sans révision, rien n’a été fait', () => {
    expect(opsOf(undefined, 'de')).toEqual({ translate: false, improve: false })
  })
})
