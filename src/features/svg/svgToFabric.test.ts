import { describe, it, expect } from 'vitest'
import { Group } from 'fabric'
import { parseSvgToFabric } from './svgToFabric'

describe('parseSvgToFabric — hiérarchie des groupes', () => {
  it('reconstruit un groupe top-level depuis un <g>', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="myGroup">
    <rect x="10" y="10" width="50" height="50" fill="red"/>
    <rect x="80" y="10" width="50" height="50" fill="blue"/>
  </g>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects).toHaveLength(1)
    expect(objects[0]).toBeInstanceOf(Group)
    const group = objects[0] as Group
    expect(group.getObjects()).toHaveLength(2)
  })

  it('préserve le nom d\'un groupe via son id SVG', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="Nathalie">
    <rect width="50" height="50"/>
  </g>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects[0]).toBeInstanceOf(Group)
    const data = (objects[0] as unknown as { data: { name: string } }).data
    expect(data.name).toBe('Nathalie')
  })

  it('reconstruit des sous-groupes imbriqués (2 niveaux)', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="outer">
    <g id="inner">
      <rect x="0" y="0" width="20" height="20"/>
      <rect x="30" y="0" width="20" height="20"/>
    </g>
    <rect x="100" y="0" width="20" height="20"/>
  </g>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects).toHaveLength(1)
    const outer = objects[0] as Group
    expect(outer).toBeInstanceOf(Group)
    expect(outer.getObjects()).toHaveLength(2)

    const innerCandidate = outer.getObjects().find((o) => o instanceof Group)
    expect(innerCandidate).toBeInstanceOf(Group)
    expect((innerCandidate as Group).getObjects()).toHaveLength(2)
  })

  it('conserve l\'ordre et le nombre total de feuilles', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect x="0" y="0" width="10" height="10"/>
  <g>
    <rect x="20" y="0" width="10" height="10"/>
    <rect x="40" y="0" width="10" height="10"/>
  </g>
  <rect x="60" y="0" width="10" height="10"/>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects).toHaveLength(3)
    expect(objects[0]).not.toBeInstanceOf(Group)
    expect(objects[1]).toBeInstanceOf(Group)
    expect(objects[2]).not.toBeInstanceOf(Group)
    expect((objects[1] as Group).getObjects()).toHaveLength(2)
  })

  it('ignore les groupes vides (sans enfants rendus)', async () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="grad">
      <stop offset="0" stop-color="red"/>
    </linearGradient>
  </defs>
  <g id="empty"></g>
  <rect x="0" y="0" width="10" height="10"/>
</svg>`
    const { objects } = await parseSvgToFabric(svg)
    expect(objects).toHaveLength(1)
    expect(objects[0]).not.toBeInstanceOf(Group)
  })
})
