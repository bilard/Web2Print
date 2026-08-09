import { describe, it, expect } from 'vitest'
import { orderBeforeCompare } from './orderBeforeCompare'
import type { Workflow, NodeSpec } from '../types'

const SPECS: Record<string, { inputs: [string, string][]; outputs: [string, string][] }> = {
  'directed-search': { inputs: [['products', 'sheet']], outputs: [['results', 'sheet']] },
  'compare-catalog': {
    inputs: [['products', 'sheet'], ['harvest', 'any'], ['rules', 'rules']],
    outputs: [['matrix', 'sheet']],
  },
  'text-input': { inputs: [], outputs: [] },
}
const getSpec = (type: string) => {
  const s = SPECS[type]
  if (!s) return undefined
  return {
    inputs: s.inputs.map(([name, t]) => ({ name, type: t })),
    outputs: s.outputs.map(([name, t]) => ({ name, type: t })),
  } as NodeSpec
}

const wf = (edges: [string, string, string, string][] = []): Workflow => ({
  id: 'w', schemaVersion: 1, name: 'w', description: '', ownerId: 'u', createdAt: 0, updatedAt: 0,
  nodes: [
    { id: 'd', type: 'directed-search', position: { x: 0, y: 0 }, config: {} },
    { id: 'c', type: 'compare-catalog', position: { x: 0, y: 0 }, config: {} },
  ],
  edges: edges.map(([source, sourceHandle, target, targetHandle]) => ({
    id: `e_${source}_${sourceHandle}_${target}_${targetHandle}`, source, sourceHandle, target, targetHandle,
  })),
}) as Workflow

describe('orderBeforeCompare', () => {
  it('branche la sortie du collecteur sur le port d’ordonnancement', () => {
    const out = orderBeforeCompare(wf(), 'd', 'c', getSpec)
    expect(out.edges).toHaveLength(1)
    expect(out.edges[0]).toMatchObject({ source: 'd', sourceHandle: 'results', target: 'c', targetHandle: 'harvest' })
  })

  it('⚠ PARTAGE le port d’ordonnancement déjà pris par un autre collecteur', () => {
    // Le cas réel : moisson ET recherche dirigée alimentent le même comparatif, qui n'a
    // qu'un port d'ordre. Refuser ici rendait la correction inopérante là où elle sert.
    // Sans risque : la donnée de ce port est ignorée, et l'exécuteur fusionne le fan-in.
    const out = orderBeforeCompare(wf([['x', 'out', 'c', 'harvest']]), 'd', 'c', getSpec)
    expect(out.edges).toHaveLength(2)
    expect(out.edges.find((e) => e.source === 'd')).toMatchObject({ targetHandle: 'harvest' })
  })

  it('⚠ ne branche JAMAIS sur « rules » : le comparatif y LIT ses règles d’appariement', () => {
    // Ancien repli quand `harvest` était pris : il aurait fait prendre une feuille de
    // relevés pour des règles.
    const out = orderBeforeCompare(wf([['x', 'out', 'c', 'harvest'], ['y', 'out', 'c', 'rules']]), 'd', 'c', getSpec)
    expect(out.edges.find((e) => e.source === 'd')?.targetHandle).toBe('harvest')
  })

  it('comparatif SANS port d’ordonnancement → inchangé plutôt qu’un lien inventé', () => {
    const base = wf()
    base.nodes[1] = { ...base.nodes[1], type: 'text-input' }
    expect(orderBeforeCompare(base, 'd', 'c', getSpec)).toBe(base)
  })

  it('la même arête n’est pas posée deux fois', () => {
    const once = orderBeforeCompare(wf(), 'd', 'c', getSpec)
    expect(orderBeforeCompare(once, 'd', 'c', getSpec)).toBe(once)
  })

  it('collecteur sans sortie → inchangé', () => {
    const base = wf()
    base.nodes[0] = { ...base.nodes[0], type: 'text-input' }
    expect(orderBeforeCompare(base, 'd', 'c', getSpec)).toBe(base)
  })

  it('node introuvable → inchangé', () => {
    const base = wf()
    expect(orderBeforeCompare(base, 'absent', 'c', getSpec)).toBe(base)
  })
})
