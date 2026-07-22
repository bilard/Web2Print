// src/features/workflows/runtime/validateWorkflow.test.ts
import { describe, it, expect } from 'vitest'
import { validateWorkflow } from './validateWorkflow'
import type { Workflow, NodeSpec } from '../types'

const spec = (over: Partial<NodeSpec>): NodeSpec => ({
  type: 't', category: 'import', label: 'T', description: '', icon: (() => null) as unknown as NodeSpec['icon'],
  inputs: [], outputs: [], configSchema: [], defaultConfig: {}, runtime: 'client',
  run: async () => ({}), ...over,
})

const REG: Record<string, NodeSpec> = {
  upload: spec({ type: 'upload', label: 'Upload' }),
  compare: spec({
    type: 'compare', label: 'Comparer',
    inputs: [{ name: 'products', type: 'sheet', required: true }, { name: 'harvest', type: 'any' }],
    configSchema: [{ name: 'sites', kind: 'textarea', label: 'Sites concurrents', required: true }],
  }),
  export: spec({ type: 'export', label: 'Export', inputs: [{ name: 'sheet', type: 'sheet', required: true }] }),
}
const getSpec = (t: string) => REG[t]

const wf = (over: Partial<Workflow>): Workflow => ({
  id: 'w', schemaVersion: 1 as Workflow['schemaVersion'], name: 'W', description: '', ownerId: 'u',
  createdAt: 0, updatedAt: 0, nodes: [], edges: [], ...over,
})

const node = (id: string, type: string, config: unknown = {}) => ({ id, type, position: { x: 0, y: 0 }, config })
const edge = (s: string, sh: string, t: string, th: string) => ({ id: `${s}-${t}`, source: s, sourceHandle: sh, target: t, targetHandle: th })

describe('validateWorkflow', () => {
  it('signale une entrée requise non connectée + config requise vide', () => {
    const w = wf({ nodes: [node('c', 'compare', { sites: '' })], edges: [edge('c', 'x', 'c', 'x')] })
    const issues = validateWorkflow(w, getSpec)
    expect(issues.some((i) => /products.*non connect/i.test(i.message))).toBe(true)
    expect(issues.some((i) => /Sites concurrents.*non renseigné/i.test(i.message))).toBe(true)
  })

  it('ne signale rien quand tout est connecté et renseigné', () => {
    const w = wf({
      nodes: [node('u', 'upload', { fileKey: 'k' }), node('c', 'compare', { sites: 'a.com' }), node('e', 'export')],
      edges: [edge('u', 'sheet', 'c', 'products'), edge('c', 'matrix', 'e', 'sheet')],
    })
    expect(validateWorkflow(w, getSpec)).toEqual([])
  })

  it('détecte « Upload sans fichier » (contrôle sémantique)', () => {
    const w = wf({
      nodes: [node('u', 'upload', { fileKey: '' }), node('e', 'export')],
      edges: [edge('u', 'sheet', 'e', 'sheet')],
    })
    const issues = validateWorkflow(w, getSpec)
    expect(issues.find((i) => i.nodeId === 'u')?.message).toMatch(/fichier/i)
  })

  it('ignore les nodes orphelins quand le graphe a des liens', () => {
    const w = wf({
      nodes: [node('u', 'upload', { fileKey: 'k' }), node('c', 'compare', { sites: '' }), node('orphan', 'export')],
      edges: [edge('u', 'sheet', 'c', 'products')],
    })
    // 'orphan' (export sans lien) n'est pas exécuté → pas signalé ; 'c' a sites vide → signalé.
    const issues = validateWorkflow(w, getSpec)
    expect(issues.some((i) => i.nodeId === 'orphan')).toBe(false)
    expect(issues.some((i) => i.nodeId === 'c')).toBe(true)
  })

  it('signale un type de node inconnu', () => {
    const w = wf({ nodes: [node('z', 'inexistant')], edges: [] })
    expect(validateWorkflow(w, getSpec)[0].message).toMatch(/inconnu/i)
  })

  describe('sites via port OU config (Sites sources)', () => {
    const REG2: Record<string, NodeSpec> = {
      ...REG,
      'source-sites': spec({ type: 'source-sites', label: 'Sites sources', outputs: [{ name: 'sites', type: 'sites' }] }),
      'harvest-competitor': spec({
        type: 'harvest-competitor', label: 'Moisson',
        inputs: [{ name: 'sites', type: 'sites' }],
        configSchema: [{ name: 'sites', kind: 'textarea', label: 'Sites concurrents' }],
      }),
    }
    const getSpec2 = (t: string) => REG2[t]

    it('harvest sans textarea NI port branché → erreur', () => {
      const w = wf({ nodes: [node('h', 'harvest-competitor', { sites: '' })], edges: [] })
      expect(validateWorkflow(w, getSpec2).find((i) => i.nodeId === 'h')?.message).toMatch(/Sites sources/)
    })

    it('harvest avec port sites branché et textarea vide → OK', () => {
      const w = wf({
        nodes: [node('s', 'source-sites', { sites: [{ domain: 'a.fr', enabled: true }] }), node('h', 'harvest-competitor', { sites: '' })],
        edges: [edge('s', 'sites', 'h', 'sites')],
      })
      expect(validateWorkflow(w, getSpec2)).toEqual([])
    })

    it('source-sites sans aucun site actif → erreur', () => {
      const w = wf({
        nodes: [node('s', 'source-sites', { sites: [{ domain: 'a.fr', enabled: false }] }), node('h', 'harvest-competitor', { sites: 'x.fr' })],
        edges: [edge('s', 'sites', 'h', 'sites')],
      })
      expect(validateWorkflow(w, getSpec2).find((i) => i.nodeId === 's')?.message).toMatch(/actif/i)
    })
  })
})
