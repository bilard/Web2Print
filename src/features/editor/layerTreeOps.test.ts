import { describe, it, expect } from 'vitest'
import { Rect, Group } from 'fabric'
import type { FabricObject } from 'fabric'
import { findById, findParentGroup, wouldCreateCycle } from './layerTreeOps'

function makeRect(id: string): Rect {
  const r = new Rect({ width: 10, height: 10 })
  ;(r as unknown as { data: Record<string, unknown> }).data = { id, type: 'rect' }
  return r
}

function makeGroup(id: string, children: FabricObject[] = []): Group {
  const g = new Group(children)
  ;(g as unknown as { data: Record<string, unknown> }).data = { id, type: 'group' }
  return g
}

describe('findById', () => {
  it('trouve un objet top-level par id', () => {
    const a = makeRect('a')
    const b = makeRect('b')
    expect(findById([a, b], 'b')).toBe(b)
  })

  it('trouve un enfant imbriqué dans un groupe', () => {
    const child = makeRect('deep')
    const grp = makeGroup('g', [child])
    const top = makeRect('top')
    expect(findById([top, grp], 'deep')).toBe(child)
  })

  it('trouve un enfant de groupe dans un groupe (2 niveaux)', () => {
    const leaf = makeRect('leaf')
    const inner = makeGroup('inner', [leaf])
    const outer = makeGroup('outer', [inner])
    expect(findById([outer], 'leaf')).toBe(leaf)
  })

  it('retourne undefined si id inconnu', () => {
    const a = makeRect('a')
    expect(findById([a], 'missing')).toBeUndefined()
  })

  it('retourne undefined pour un tableau vide', () => {
    expect(findById([], 'x')).toBeUndefined()
  })
})

describe('findParentGroup', () => {
  it('retourne undefined pour un objet top-level', () => {
    const a = makeRect('a')
    expect(findParentGroup([a], 'a')).toBeUndefined()
  })

  it('retourne le groupe parent direct', () => {
    const child = makeRect('c')
    const grp = makeGroup('g', [child])
    expect(findParentGroup([grp], 'c')).toBe(grp)
  })

  it('retourne le groupe direct même avec plusieurs niveaux', () => {
    const leaf = makeRect('leaf')
    const inner = makeGroup('inner', [leaf])
    const outer = makeGroup('outer', [inner])
    // Le parent DIRECT de 'leaf' est 'inner', pas 'outer'
    expect(findParentGroup([outer], 'leaf')).toBe(inner)
  })

  it('retourne undefined si id inconnu', () => {
    const grp = makeGroup('g', [makeRect('a')])
    expect(findParentGroup([grp], 'missing')).toBeUndefined()
  })
})

describe('wouldCreateCycle', () => {
  it('retourne false si child n\'est pas un Group', () => {
    const r = makeRect('r')
    expect(wouldCreateCycle(r, 'anyId')).toBe(false)
  })

  it('retourne false si le groupe cible n\'est pas descendant de child', () => {
    const grp = makeGroup('g', [makeRect('a'), makeRect('b')])
    expect(wouldCreateCycle(grp, 'outside')).toBe(false)
  })

  it('retourne true si le groupe cible est enfant direct de child', () => {
    const inner = makeGroup('inner')
    const outer = makeGroup('outer', [inner])
    expect(wouldCreateCycle(outer, 'inner')).toBe(true)
  })

  it('retourne true si le groupe cible est un descendant profond de child', () => {
    const deep = makeGroup('deep')
    const mid = makeGroup('mid', [deep])
    const top = makeGroup('top', [mid])
    expect(wouldCreateCycle(top, 'deep')).toBe(true)
  })
})
