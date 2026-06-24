import { describe, it, expect } from 'vitest'
import { xmlTagName, elementDepth } from './xmlElementTags'

describe('xmlTagName', () => {
  it('retire le préfixe XMLTag', () => {
    expect(xmlTagName('XMLTag/Prix')).toBe('Prix')
  })
  it('conserve les accents', () => {
    expect(xmlTagName('XMLTag/Réduction')).toBe('Réduction')
  })
  it('renvoie null pour une valeur vide ou nulle', () => {
    expect(xmlTagName(null)).toBeNull()
    expect(xmlTagName('XMLTag/')).toBeNull()
  })
})

describe('elementDepth', () => {
  it('compte les ancêtres', () => {
    const doc = new DOMParser().parseFromString(
      '<a><b><c/></b></a>',
      'application/xml',
    )
    const c = doc.getElementsByTagName('c')[0]
    const a = doc.getElementsByTagName('a')[0]
    expect(elementDepth(c)).toBeGreaterThan(elementDepth(a))
  })
})
