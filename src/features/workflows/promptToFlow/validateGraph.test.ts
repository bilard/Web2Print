import { describe, it, expect, beforeAll } from 'vitest'
import { initWorkflowsRegistry } from '../registry/builtin'
import { validateGraph } from './validateGraph'
import type { RawGraph } from './types'

const genId = (i: number) => `n${i}`

describe('validateGraph', () => {
  beforeAll(() => initWorkflowsRegistry())

  it('matérialise un graphe valide (ref→id, edges, merge config)', () => {
    const raw: RawGraph = {
      title: 'T', summary: 'S',
      nodes: [
        { ref: 'u', type: 'upload', config: [] },
        { ref: 'c', type: 'import-csv', config: [{ key: 'headerRow', value: 'false' }] },
      ],
      edges: [{ from: 'u', fromPort: 'file', to: 'c', toPort: 'file' }],
    }
    const g = validateGraph(raw, genId)
    expect(g.issues.filter((i) => i.level === 'error')).toHaveLength(0)
    expect(g.nodes.map((n) => n.id)).toEqual(['n0', 'n1'])
    // 'false' (texte) coercé en booléen via le type du défaut (headerRow: true)
    expect(g.nodes[1].config).toEqual({ headerRow: false })
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ source: 'n0', sourceHandle: 'file', target: 'n1', targetHandle: 'file' })
  })

  it('écarte un node de type inconnu', () => {
    const raw: RawGraph = { title: '', summary: '', nodes: [{ ref: 'x', type: 'does-not-exist' }], edges: [] }
    const g = validateGraph(raw, genId)
    expect(g.nodes).toHaveLength(0)
    expect(g.issues.some((i) => i.level === 'error' && /does-not-exist/.test(i.message))).toBe(true)
  })

  it("écarte une edge dont le port de sortie n'existe pas", () => {
    const raw: RawGraph = {
      title: '', summary: '',
      nodes: [{ ref: 'u', type: 'upload' }, { ref: 'c', type: 'import-csv' }],
      edges: [{ from: 'u', fromPort: 'nope', to: 'c', toPort: 'file' }],
    }
    const g = validateGraph(raw, genId)
    expect(g.edges).toHaveLength(0)
    expect(g.issues.some((i) => /nope/.test(i.message))).toBe(true)
  })

  it('écarte une edge entre types de ports incompatibles', () => {
    const raw: RawGraph = {
      title: '', summary: '',
      nodes: [
        { ref: 'e', type: 'export-excel' },
        { ref: 'c', type: 'import-csv' },
      ],
      edges: [{ from: 'e', fromPort: 'result', to: 'c', toPort: 'file' }],
    }
    const g = validateGraph(raw, genId)
    expect(g.edges).toHaveLength(0)
    expect(g.issues.some((i) => /incompatibles/.test(i.message))).toBe(true)
  })

  it('signale (warning) une entrée requise non connectée', () => {
    const raw: RawGraph = { title: '', summary: '', nodes: [{ ref: 'c', type: 'import-csv' }], edges: [] }
    const g = validateGraph(raw, genId)
    expect(g.issues.some((i) => i.level === 'warning' && /file/.test(i.message))).toBe(true)
  })

  it('écarte une ref dupliquée avec une issue error', () => {
    const raw: RawGraph = {
      title: '', summary: '',
      nodes: [
        { ref: 'u', type: 'upload' },
        { ref: 'u', type: 'import-csv' },
      ],
      edges: [],
    }
    const g = validateGraph(raw, genId)
    expect(g.nodes).toHaveLength(1)
    expect(g.issues.some((i) => i.level === 'error' && /dupliqu/i.test(i.message))).toBe(true)
  })

  it('détecte un cycle', () => {
    const raw: RawGraph = {
      title: '', summary: '',
      nodes: [{ ref: 'a', type: 'transform-filter' }, { ref: 'b', type: 'transform-sort' }],
      edges: [
        { from: 'a', fromPort: 'sheet', to: 'b', toPort: 'sheet' },
        { from: 'b', fromPort: 'sheet', to: 'a', toPort: 'sheet' },
      ],
    }
    const g = validateGraph(raw, genId)
    expect(g.issues.some((i) => /cycle/i.test(i.message))).toBe(true)
  })
})
