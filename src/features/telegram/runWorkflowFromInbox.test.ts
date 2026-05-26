import { describe, it, expect } from 'vitest'
import { resolveRun, injectTextInput } from './runWorkflowFromInbox'
import type { Workflow, WorkflowNode } from '@/features/workflows/types'

function wf(name: string, nodes: WorkflowNode[] = []): Workflow {
  return {
    id: `id-${name}`,
    schemaVersion: 1,
    name,
    description: '',
    ownerId: 'u',
    createdAt: 0,
    updatedAt: 0,
    nodes,
    edges: [],
  }
}

const node = (id: string, type: string, config: unknown = {}): WorkflowNode => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
})

describe('resolveRun', () => {
  const flows = [wf('Rapport'), wf('Rapport quotidien'), wf('Export Excel')]

  it('rest vide → no-name avec la liste des workflows', () => {
    expect(resolveRun(flows, '')).toEqual({
      ok: false,
      reason: 'no-name',
      available: ['Rapport', 'Rapport quotidien', 'Export Excel'],
    })
  })

  it('nom exact → input vide', () => {
    const r = resolveRun(flows, 'Export Excel')
    expect(r).toEqual({ ok: true, workflow: flows[2], input: '' })
  })

  it('nom en préfixe → le reste est le texte d’entrée', () => {
    const r = resolveRun(flows, 'Export Excel Telegram message')
    expect(r.ok && r.workflow.name).toBe('Export Excel')
    expect(r.ok && r.input).toBe('Telegram message')
  })

  it('le plus LONG nom qui préfixe gagne', () => {
    const r = resolveRun(flows, 'Rapport quotidien des ventes')
    expect(r.ok && r.workflow.name).toBe('Rapport quotidien')
    expect(r.ok && r.input).toBe('des ventes')
  })

  it('insensible à la casse', () => {
    const r = resolveRun(flows, 'export excel hello')
    expect(r.ok && r.workflow.name).toBe('Export Excel')
    expect(r.ok && r.input).toBe('hello')
  })

  it('nom introuvable → not-found avec la liste', () => {
    expect(resolveRun(flows, 'Inconnu blabla')).toEqual({
      ok: false,
      reason: 'not-found',
      available: ['Rapport', 'Rapport quotidien', 'Export Excel'],
    })
  })
})

describe('injectTextInput', () => {
  it('input vide → workflow inchangé, 0 injection', () => {
    const w = wf('A', [node('n1', 'text-input', { text: 'orig' })])
    const r = injectTextInput(w, '')
    expect(r.injected).toBe(0)
    expect(r.workflow).toBe(w)
  })

  it('injecte dans tous les nodes text-input, laisse les autres', () => {
    const w = wf('A', [
      node('n1', 'text-input', { text: 'orig' }),
      node('n2', 'send-telegram', { text: 'garde' }),
      node('n3', 'text-input', { text: 'orig2' }),
    ])
    const r = injectTextInput(w, 'nouveau')
    expect(r.injected).toBe(2)
    expect(r.workflow.nodes[0].config).toEqual({ text: 'nouveau' })
    expect(r.workflow.nodes[1].config).toEqual({ text: 'garde' })
    expect(r.workflow.nodes[2].config).toEqual({ text: 'nouveau' })
  })

  it('aucun node text-input → 0 injection', () => {
    const w = wf('A', [node('n1', 'scrape-url', {})])
    expect(injectTextInput(w, 'x').injected).toBe(0)
  })

  it('ne mute pas le workflow original (clone éphémère)', () => {
    const original = wf('A', [node('n1', 'text-input', { text: 'orig' })])
    injectTextInput(original, 'nouveau')
    expect(original.nodes[0].config).toEqual({ text: 'orig' })
  })
})
