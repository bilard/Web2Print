// functions/src/workflow/preflight.test.ts
import { describe, it, expect } from 'vitest'
import { preflightWarnings } from './preflight'

const wf = (nodes: { id: string; type: string; config?: unknown }[], edges: [string, string, string?][]) => ({
  id: 'wfF1',
  nodes,
  edges: edges.map(([source, target, targetHandle]) => ({ source, target, targetHandle })),
})

describe('preflight serveur — cohérence entre nodes', () => {
  it('signale DEUX suivis distincts (rapport vide garanti)', () => {
    const w = preflightWarnings(wf([
      { id: 'h', type: 'harvest-competitor', config: { watchId: 'F1 Pro' } },
      { id: 'c', type: 'compare-catalog', config: { watchId: 'F1 Pro 2026' } },
    ], [['h', 'c']]))
    expect(w).toHaveLength(1)
    expect(w[0]).toMatch(/suivis DIFFÉRENTS/)
    expect(w[0]).toMatch(/rapport sera VIDE/)
  })

  it('reste muet quand tout adresse le même suivi', () => {
    expect(preflightWarnings(wf([
      { id: 'h', type: 'harvest-competitor', config: { watchId: 'F1 Pro' } },
      { id: 'c', type: 'compare-catalog', config: { watchId: 'f1  PRO' } }, // normalisé pareil
    ], [['h', 'c']]))).toEqual([])
  })

  it('un « Sites sources » branché aligne des watchId locaux divergents', () => {
    expect(preflightWarnings(wf([
      { id: 's', type: 'source-sites', config: { watchId: 'F1 Pro' } },
      { id: 'h', type: 'harvest-competitor', config: { watchId: 'autre' } },
      { id: 'c', type: 'compare-catalog', config: { watchId: 'encore-autre' } },
    ], [['s', 'h', 'sites'], ['s', 'c', 'sites'], ['h', 'c']]))).toEqual([])
  })

  it('signale un comparatif non branché derrière la collecte', () => {
    const w = preflightWarnings(wf([
      { id: 's', type: 'source-sites', config: { watchId: 'F1' } },
      { id: 'h', type: 'harvest-competitor', config: {} },
      { id: 'c', type: 'compare-catalog', config: {} },
    ], [['s', 'h', 'sites'], ['s', 'c', 'sites']]))
    expect(w).toHaveLength(1)
    expect(w[0]).toMatch(/index du run précédent/)
  })

  it('tolère une config absente ou exotique sans lever', () => {
    expect(() => preflightWarnings(wf([
      { id: 'h', type: 'harvest-competitor' },
      { id: 'c', type: 'compare-catalog', config: 'nawak' },
    ], [['h', 'c']]))).not.toThrow()
  })
})
