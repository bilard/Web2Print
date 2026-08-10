import { describe, it, expect } from 'vitest'
import { firstWatchId } from './firstWatchId'
import { deriveWatchId } from '@/features/priceWatch/sourceSites'
import type { Workflow } from '../types'

const wf = (over: Partial<Workflow>): Workflow => ({
  id: 'w1', schemaVersion: 1 as Workflow['schemaVersion'], name: 'W', description: '', ownerId: 'u',
  createdAt: 0, updatedAt: 0, nodes: [], edges: [], ...over,
})

const node = (id: string, type: string, config: unknown = {}) => ({ id, type, position: { x: 0, y: 0 }, config })
const edge = (s: string, sh: string, t: string, th: string) => ({ id: `${s}-${t}`, source: s, sourceHandle: sh, target: t, targetHandle: th })

describe('firstWatchId', () => {
  it("renvoie null pour un flux sans nœud de veille tarifaire", () => {
    const w = wf({ nodes: [node('u', 'upload')], edges: [] })
    expect(firstWatchId(w)).toBeNull()
  })

  it('résout le suivi du premier nœud de veille rencontré', () => {
    const w = wf({ nodes: [node('h', 'harvest-competitor', { watchId: 'mon-suivi' })], edges: [] })
    expect(firstWatchId(w)).toBe(deriveWatchId('mon-suivi', 'w1'))
  })

  it('un nœud orphelin (graphe avec des liens ailleurs) ne compte pas', () => {
    const w = wf({
      nodes: [
        node('a', 'upload'), node('b', 'export'),
        node('h', 'harvest-competitor', { watchId: 'orphelin' }),
      ],
      edges: [edge('a', 'sheet', 'b', 'sheet')],
    })
    expect(firstWatchId(w)).toBeNull()
  })

  it("suit le node « Sites sources » quand il pilote la carte", () => {
    const w = wf({
      nodes: [
        node('src', 'source-sites', { watchId: 'depuis-sites-sources' }),
        node('h', 'harvest-competitor', { watchId: 'ignore-config-locale' }),
      ],
      edges: [edge('src', 'sites', 'h', 'sites')],
    })
    expect(firstWatchId(w)).toBe(deriveWatchId('depuis-sites-sources', 'w1'))
  })

  it('deux suivis DISTINCTS dans le même flux : le premier nœud de veille rencontré gagne', () => {
    // Comportement retenu, pas idéal : `validateWorkflow` signale déjà ce cas au pré-vol
    // (deux suivis dans un même flux) — ici on documente juste lequel des deux l'emporte.
    const w = wf({
      nodes: [
        node('h', 'harvest-competitor', { watchId: 'suivi-un' }),
        node('c', 'compare-catalog', { watchId: 'suivi-deux' }),
      ],
      edges: [edge('h', 'out', 'c', 'in')],
    })
    expect(firstWatchId(w)).toBe(deriveWatchId('suivi-un', 'w1'))
  })
})
