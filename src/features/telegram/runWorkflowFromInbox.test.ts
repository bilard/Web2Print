import { describe, it, expect } from 'vitest'
import { resolveRun, injectInput } from './runWorkflowFromInbox'
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

  it('strip le séparateur « : » (Scrape : url / Scrape: url)', () => {
    const f = [wf('Scrape')]
    expect(resolveRun(f, 'Scrape : https://x.fr/p').input ?? '').toBe('https://x.fr/p')
    expect(resolveRun(f, 'Scrape: https://x.fr/p').input ?? '').toBe('https://x.fr/p')
    // pas de strip des tirets : input légitime préservé
    expect(resolveRun(f, 'Scrape -5 widgets').input ?? '').toBe('-5 widgets')
  })
})

describe('injectInput', () => {
  it('input vide → workflow inchangé, 0 injection', () => {
    const w = wf('A', [node('n1', 'text-input', { text: 'orig' })])
    const r = injectInput(w, '')
    expect(r.injected).toBe(0)
    expect(r.workflow).toBe(w)
  })

  it('seul Saisie texte présent → alimente text', () => {
    const w = wf('A', [
      node('n1', 'text-input', { text: 'orig' }),
      node('n2', 'send-telegram', { text: 'garde' }),
      node('n3', 'text-input', { text: 'orig2' }),
    ])
    const r = injectInput(w, 'nouveau')
    expect(r.injected).toBe(2)
    expect(r.workflow.nodes[0].config).toEqual({ text: 'nouveau' })
    expect(r.workflow.nodes[1].config).toEqual({ text: 'garde' })
    expect(r.workflow.nodes[2].config).toEqual({ text: 'nouveau' })
  })

  it('seul Scrape URL présent → alimente urls (config conservée pour le reste)', () => {
    const w = wf('A', [node('n1', 'scrape-url', { urls: '', template: 'product_full' })])
    const r = injectInput(w, 'https://makita.fr/p')
    expect(r.injected).toBe(1)
    expect(r.workflow.nodes[0].config).toEqual({ urls: 'https://makita.fr/p', template: 'product_full' })
  })

  it('les deux présents + URL → route vers scrape-url', () => {
    const w = wf('A', [node('n1', 'text-input', { text: '' }), node('n2', 'scrape-url', { urls: '' })])
    const r = injectInput(w, 'https://makita.fr/p')
    expect(r.injected).toBe(1)
    expect(r.workflow.nodes[1].config).toEqual({ urls: 'https://makita.fr/p' })
    expect(r.workflow.nodes[0].config).toEqual({ text: '' })
  })

  it('les deux présents + texte → route vers text-input', () => {
    const w = wf('A', [node('n1', 'text-input', { text: '' }), node('n2', 'scrape-url', { urls: '' })])
    const r = injectInput(w, 'bonjour')
    expect(r.injected).toBe(1)
    expect(r.workflow.nodes[0].config).toEqual({ text: 'bonjour' })
  })

  it('Scrape URL : extrait l’URL du texte (robuste aux préfixes parasites)', () => {
    const w = wf('A', [node('n1', 'scrape-url', { urls: '' })])
    const r = injectInput(w, '/run Scrape https://www.leroymerlin.fr/produits/x-88326076.html')
    expect(r.workflow.nodes[0].config).toEqual({
      urls: 'https://www.leroymerlin.fr/produits/x-88326076.html',
    })
  })

  it('aucun node d’entrée alimentable → 0 injection', () => {
    const w = wf('A', [node('n1', 'export-excel', {})])
    expect(injectInput(w, 'x').injected).toBe(0)
  })

  it('ne mute pas le workflow original (clone éphémère)', () => {
    const original = wf('A', [node('n1', 'text-input', { text: 'orig' })])
    injectInput(original, 'nouveau')
    expect(original.nodes[0].config).toEqual({ text: 'orig' })
  })
})
