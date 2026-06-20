// functions/src/workflow/execute.test.ts
import { describe, it, expect } from 'vitest'
import './nodes/index'
import { executeWorkflowHeadless } from './execute'
import { registerServerNode } from './registry'
import type { ServerWorkflow } from './types'

const wf: ServerWorkflow = {
  id: 'w', name: 'T', ownerId: 'u',
  nodes: [
    { id: 'a', type: 'text-input', config: { text: 'Bonjour' } },
    { id: 'b', type: 'if-else', config: { expression: "value === 'Bonjour'" } },
  ],
  edges: [{ id: 'e', source: 'a', sourceHandle: 'text', target: 'b', targetHandle: 'value' }],
}

describe('executeWorkflowHeadless', () => {
  it('exécute en ordre topo et câble les ports', async () => {
    const res = await executeWorkflowHeadless(wf, { uid: 'u', signal: new AbortController().signal })
    expect(res.status).toBe('success')
    expect(res.nodeOutputs.b).toEqual({ then: 'Bonjour' })
  })
  it('marque un type refusé en erreur', async () => {
    const bad: ServerWorkflow = { ...wf, nodes: [{ id: 'x', type: 'export-pdf', config: {} }], edges: [] }
    const res = await executeWorkflowHeadless(bad, { uid: 'u', signal: new AbortController().signal })
    expect(res.status).toBe('error')
    expect(res.errorCount).toBe(1)
  })

  it('exécute les branches sœurs EN PARALLÈLE (pas en somme)', async () => {
    // Deux nodes lents indépendants (a, b) → un puits (c). a et b sont au même niveau
    // topo : ils doivent se chevaucher dans le temps (concurrence), pas s'enchaîner.
    let active = 0
    let peak = 0
    registerServerNode({
      type: 'test-slow',
      run: async () => {
        active++; peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 50))
        active--
        return { out: 'x' }
      },
    })
    const fan: ServerWorkflow = {
      id: 'w2', name: 'Fan', ownerId: 'u',
      nodes: [
        { id: 'a', type: 'test-slow', config: {} },
        { id: 'b', type: 'test-slow', config: {} },
        { id: 'c', type: 'text-input', config: { text: 'fin' } },
      ],
      edges: [
        { id: 'ea', source: 'a', sourceHandle: 'out', target: 'c', targetHandle: 'in1' },
        { id: 'eb', source: 'b', sourceHandle: 'out', target: 'c', targetHandle: 'in2' },
      ],
    }
    const res = await executeWorkflowHeadless(fan, { uid: 'u', signal: new AbortController().signal })
    expect(res.status).toBe('success')
    expect(peak).toBeGreaterThanOrEqual(2) // a et b ont tourné simultanément
  })

  it('reprise : saute les nodes déjà terminés et câble leurs sorties', async () => {
    const ran: string[] = []
    const doneCb: string[] = []
    registerServerNode({
      type: 'test-echo',
      run: async (_ctx, cfg, inputs) => {
        ran.push(String(cfg.id))
        return { out: inputs.in ?? cfg.id }
      },
    })
    const chain: ServerWorkflow = {
      id: 'w4', name: 'Resume', ownerId: 'u',
      nodes: [
        { id: 'a', type: 'test-echo', config: { id: 'a' } },
        { id: 'b', type: 'test-echo', config: { id: 'b' } },
      ],
      edges: [{ id: 'e', source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' }],
    }
    // Reprise : 'a' déjà fait (sortie persistée) → on ne ré-exécute que 'b', câblé sur la
    // sortie REPRISE de 'a'.
    const res = await executeWorkflowHeadless(chain, {
      uid: 'u', signal: new AbortController().signal,
      resume: { outputs: { a: { out: 'REPRIS' } } },
      onNodeDone: (id) => { doneCb.push(id) },
    })
    expect(res.status).toBe('success')
    expect(ran).toEqual(['b']) // 'a' non ré-exécuté
    expect(doneCb).toEqual(['b']) // onNodeDone seulement pour le node réellement exécuté
    expect(res.startedNodes).toEqual(['b']) // 'a' (repris) n'a PAS démarré → garde idempotence
    expect(res.nodeOutputs.b).toEqual({ out: 'REPRIS' }) // sortie reprise de 'a' câblée
  })

  it('respecte les dépendances : un node n’attaque qu’après son amont', async () => {
    // Chaîne stricte a → b : doivent s’exécuter en série, jamais en chevauchement.
    let concurrent = 0
    let peak = 0
    registerServerNode({
      type: 'test-track',
      run: async () => {
        concurrent++; peak = Math.max(peak, concurrent)
        await new Promise((r) => setTimeout(r, 20))
        concurrent--
        return { out: 'x' }
      },
    })
    const chain: ServerWorkflow = {
      id: 'w3', name: 'Chain', ownerId: 'u',
      nodes: [
        { id: 'a', type: 'test-track', config: {} },
        { id: 'b', type: 'test-track', config: {} },
      ],
      edges: [{ id: 'e', source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' }],
    }
    const res = await executeWorkflowHeadless(chain, { uid: 'u', signal: new AbortController().signal })
    expect(res.status).toBe('success')
    expect(peak).toBe(1) // jamais en parallèle (dépendance)
  })
})
