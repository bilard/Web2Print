import { describe, it, expect } from 'vitest'
import { getAutoName } from './getAutoName'

describe('getAutoName', () => {
  it('retourne le nom auto en français avec chevrons pour chaque type', () => {
    expect(getAutoName('rect')).toBe('<Rectangle>')
    expect(getAutoName('ellipse')).toBe('<Ellipse>')
    expect(getAutoName('path')).toBe('<Tracé>')
    expect(getAutoName('line')).toBe('<Ligne>')
    expect(getAutoName('text')).toBe('<Texte>')
    expect(getAutoName('image')).toBe('<Image>')
    expect(getAutoName('group')).toBe('<Groupe>')
    expect(getAutoName('polygon')).toBe('<Polygone>')
    expect(getAutoName('triangle')).toBe('<Triangle>')
    expect(getAutoName('star')).toBe('<Étoile>')
    expect(getAutoName('arrow')).toBe('<Flèche>')
    expect(getAutoName('hexagon')).toBe('<Hexagone>')
    expect(getAutoName('diamond')).toBe('<Losange>')
    expect(getAutoName('callout')).toBe('<Bulle>')
  })

  it('retombe sur <Calque> pour un type inconnu', () => {
    expect(getAutoName('unknown' as never)).toBe('<Calque>')
  })
})
