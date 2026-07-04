// src/features/excel/taxoNavSelection.test.ts
import { describe, it, expect } from 'vitest'
import {
  EMPTY_TAXO_NAV, hasTaxoNav, isSamePath, isPathPrefix,
  togglePath, toggleGlobalNode, buildTaxoNavPredicate, commonFilterDepth,
  type TaxoNavSelection,
} from './taxoNavSelection'
import type { ExcelRow } from './types'

const row = (v: Partial<ExcelRow>): ExcelRow => ({ _id: 'x', ...v })
const sel = (paths: TaxoNavSelection['paths'], globalNodes: string[] = []): TaxoNavSelection => ({ paths, globalNodes })

describe('isSamePath / isPathPrefix', () => {
  it('compare les chemins par entrées exactes', () => {
    expect(isSamePath({ l1: 'A' }, { l1: 'A' })).toBe(true)
    expect(isSamePath({ l1: 'A' }, { l1: 'A', l2: 'B' })).toBe(false)
  })
  it('détecte le préfixe ancêtre', () => {
    expect(isPathPrefix({ l1: 'A' }, { l1: 'A', l2: 'B' })).toBe(true)
    expect(isPathPrefix({ l1: 'A', l2: 'B' }, { l1: 'A' })).toBe(false)
    expect(isPathPrefix({ l1: 'A' }, { l1: 'C', l2: 'B' })).toBe(false)
  })
})

describe('togglePath', () => {
  it('ajoute puis retire le même chemin (toggle)', () => {
    const s1 = togglePath(EMPTY_TAXO_NAV, { l1: 'Élec' })
    expect(s1.paths).toEqual([{ l1: 'Élec' }])
    expect(togglePath(s1, { l1: 'Élec' }).paths).toEqual([])
  })
  it('cumule des branches différentes (multi-sélection)', () => {
    const s = togglePath(togglePath(EMPTY_TAXO_NAV, { l1: 'Élec' }), { l1: 'Plomberie', l2: 'Instruments' })
    expect(s.paths).toHaveLength(2)
  })
  it('un chemin plus profond remplace son ancêtre sélectionné', () => {
    const s = togglePath(togglePath(EMPTY_TAXO_NAV, { l1: 'Plomberie' }), { l1: 'Plomberie', l2: 'Instruments' })
    expect(s.paths).toEqual([{ l1: 'Plomberie', l2: 'Instruments' }])
  })
  it('un ancêtre remplace ses descendants sélectionnés', () => {
    const s0 = sel([{ l1: 'Plomberie', l2: 'Instruments' }, { l1: 'Plomberie', l2: 'Vannes' }, { l1: 'Élec' }])
    const s = togglePath(s0, { l1: 'Plomberie' })
    expect(s.paths).toEqual([{ l1: 'Élec' }, { l1: 'Plomberie' }])
  })
})

describe('toggleGlobalNode', () => {
  it('toggle un nœud encodé', () => {
    const s1 = toggleGlobalNode(EMPTY_TAXO_NAV, 't1::n1')
    expect(s1.globalNodes).toEqual(['t1::n1'])
    expect(toggleGlobalNode(s1, 't1::n1').globalNodes).toEqual([])
  })
})

describe('buildTaxoNavPredicate', () => {
  it('sélection vide → tout passe', () => {
    const pred = buildTaxoNavPredicate(EMPTY_TAXO_NAV, undefined)
    expect(pred(row({ l1: 'X' }))).toBe(true)
  })
  it('union entre chemins, ET à l’intérieur d’un chemin', () => {
    const pred = buildTaxoNavPredicate(sel([{ l1: 'Élec' }, { l1: 'Plomberie', l2: 'Instruments' }]), undefined)
    expect(pred(row({ l1: 'Élec', l2: 'Câbles' }))).toBe(true)
    expect(pred(row({ l1: 'Plomberie', l2: 'Instruments' }))).toBe(true)
    expect(pred(row({ l1: 'Plomberie', l2: 'Vannes' }))).toBe(false)
    expect(pred(row({ l1: 'Outillage' }))).toBe(false)
  })
})

describe('commonFilterDepth', () => {
  const order = ['l1', 'l2', 'l3']
  it('0 sans sélection', () => {
    expect(commonFilterDepth(EMPTY_TAXO_NAV, order)).toBe(0)
  })
  it('profondeur du chemin unique', () => {
    expect(commonFilterDepth(sel([{ l1: 'A', l2: 'B' }]), order)).toBe(2)
  })
  it('s’arrête au premier niveau divergent', () => {
    expect(commonFilterDepth(sel([{ l1: 'A', l2: 'B' }, { l1: 'A', l2: 'C' }]), order)).toBe(1)
    expect(commonFilterDepth(sel([{ l1: 'A' }, { l1: 'Z' }]), order)).toBe(0)
  })
  it('s’arrête si un chemin est moins profond', () => {
    expect(commonFilterDepth(sel([{ l1: 'A', l2: 'B' }, { l1: 'A' }]), order)).toBe(1)
  })
})

describe('hasTaxoNav', () => {
  it('vrai si chemins ou nœuds globaux', () => {
    expect(hasTaxoNav(EMPTY_TAXO_NAV)).toBe(false)
    expect(hasTaxoNav(sel([{ l1: 'A' }]))).toBe(true)
    expect(hasTaxoNav(sel([], ['t::n']))).toBe(true)
  })
})
