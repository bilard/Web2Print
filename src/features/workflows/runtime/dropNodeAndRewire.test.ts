import { describe, it, expect } from 'vitest'
import { dropNodeAndRewire } from './dropNodeAndRewire'
import type { Workflow, NodeSpec } from '../types'

const SPECS: Record<string, { inputs: [string, string][]; outputs: [string, string][] }> = {
  source: { inputs: [], outputs: [['products', 'sheet']] },
  enrich: { inputs: [['sheet', 'sheet']], outputs: [['enriched', 'sheet'], ['revisions', 'sheet']] },
  search: { inputs: [['products', 'sheet']], outputs: [['out', 'sheet']] },
  render: { inputs: [['image', 'image']], outputs: [] },
}
const getSpec = (type: string) => {
  const s = SPECS[type]
  if (!s) return undefined
  return {
    inputs: s.inputs.map(([name, t]) => ({ name, type: t })),
    outputs: s.outputs.map(([name, t]) => ({ name, type: t })),
  } as NodeSpec
}

function wf(
  nodes: [string, string][],
  edges: [string, string, string, string][],
): Workflow {
  return {
    id: 'w', schemaVersion: 1, name: 'w', description: '', ownerId: 'u',
    createdAt: 0, updatedAt: 0,
    nodes: nodes.map(([id, type]) => ({ id, type, position: { x: 0, y: 0 }, config: {} })),
    edges: edges.map(([source, sourceHandle, target, targetHandle]) => ({
      id: `e_${source}_${sourceHandle}_${target}_${targetHandle}`, source, sourceHandle, target, targetHandle,
    })),
  } as Workflow
}

describe('dropNodeAndRewire', () => {
  it('recoud le flux : la source alimente directement l’aval', () => {
    const g = wf(
      [['s', 'source'], ['e', 'enrich'], ['d', 'search']],
      [['s', 'products', 'e', 'sheet'], ['e', 'enriched', 'd', 'products']],
    )
    const out = dropNodeAndRewire(g, 'e', getSpec)
    expect(out.nodes.map((n) => n.id)).toEqual(['s', 'd'])
    expect(out.edges).toHaveLength(1)
    expect(out.edges[0]).toMatchObject({ source: 's', sourceHandle: 'products', target: 'd', targetHandle: 'products' })
  })

  it('recoud CHAQUE sortie branchée, pas seulement la première', () => {
    const g = wf(
      [['s', 'source'], ['e', 'enrich'], ['d', 'search'], ['d2', 'search']],
      [['s', 'products', 'e', 'sheet'], ['e', 'enriched', 'd', 'products'], ['e', 'revisions', 'd2', 'products']],
    )
    const out = dropNodeAndRewire(g, 'e', getSpec)
    expect(out.edges.map((x) => x.target).sort()).toEqual(['d', 'd2'])
  })

  it('ne fabrique PAS un lien entre types incompatibles — l’aval reste débranché', () => {
    // Une sortie `sheet` vers une entrée `image` : recoudre ferait transiter la mauvaise
    // donnée. Mieux vaut un trou, que le pré-vol signale de lui-même.
    const g = wf(
      [['s', 'source'], ['e', 'enrich'], ['r', 'render']],
      [['s', 'products', 'e', 'sheet'], ['e', 'enriched', 'r', 'image']],
    )
    const out = dropNodeAndRewire(g, 'e', getSpec)
    expect(out.edges).toHaveLength(0)
  })

  it('sans amont, les liens sortants disparaissent', () => {
    const g = wf([['e', 'enrich'], ['d', 'search']], [['e', 'enriched', 'd', 'products']])
    const out = dropNodeAndRewire(g, 'e', getSpec)
    expect(out.nodes.map((n) => n.id)).toEqual(['d'])
    expect(out.edges).toHaveLength(0)
  })

  it('ne crée pas de doublon quand le lien direct existe déjà', () => {
    const g = wf(
      [['s', 'source'], ['e', 'enrich'], ['d', 'search']],
      [['s', 'products', 'e', 'sheet'], ['e', 'enriched', 'd', 'products'], ['s', 'products', 'd', 'products']],
    )
    const out = dropNodeAndRewire(g, 'e', getSpec)
    expect(out.edges).toHaveLength(1)
  })

  it('laisse intact ce qui ne touche pas la carte retirée', () => {
    const g = wf(
      [['s', 'source'], ['e', 'enrich'], ['d', 'search'], ['d2', 'search']],
      [['s', 'products', 'e', 'sheet'], ['s', 'products', 'd2', 'products']],
    )
    const out = dropNodeAndRewire(g, 'e', getSpec)
    expect(out.edges).toHaveLength(1)
    expect(out.edges[0].target).toBe('d2')
  })
})
