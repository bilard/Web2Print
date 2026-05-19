// src/features/workflows/runtime/executor.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Box } from 'lucide-react'
import { executeWorkflow } from './executor'
import { nodeRegistry } from '../registry'
import { portTypeRegistry, registerBuiltinPorts } from './ports'
import { useRunContext } from './runContext'
import type { NodeSpec, Workflow } from '../types'

const makeWorkflow = (nodes: Workflow['nodes'], edges: Workflow['edges']): Workflow => ({
  id: 'wf', schemaVersion: 1, name: 'test', description: '', ownerId: 'u',
  createdAt: 0, updatedAt: 0, nodes, edges,
})

const noopSpec = (type: string, body?: (inputs: any) => unknown): NodeSpec => ({
  type, category: 'utility', label: type, description: '', icon: Box,
  inputs: [{ name: 'in', type: 'sheet', required: false }],
  outputs: [{ name: 'out', type: 'sheet' }],
  configSchema: [], defaultConfig: {}, runtime: 'client',
  run: async (_ctx, _config, inputs) => ({ out: body ? body(inputs) : inputs }),
})

describe('executeWorkflow', () => {
  beforeEach(() => {
    nodeRegistry.clear()
    portTypeRegistry.clear()
    registerBuiltinPorts()
    useRunContext.getState().resetRun()
  })

  it('runs single node', async () => {
    nodeRegistry.register(noopSpec('a', () => ({ value: 1 })))
    const wf = makeWorkflow(
      [{ id: 'n1', type: 'a', position: { x: 0, y: 0 }, config: {} }],
      []
    )
    await executeWorkflow(wf)
    const state = useRunContext.getState().nodeStates['n1']
    expect(state.status).toBe('success')
    expect(state.outputs).toEqual({ out: { value: 1 } })
  })

  it('passes outputs along edges', async () => {
    nodeRegistry.register(noopSpec('src', () => 'hello'))
    nodeRegistry.register(noopSpec('dst', (inputs) => inputs.in + ' world'))
    const wf = makeWorkflow(
      [
        { id: 'n1', type: 'src', position: { x: 0, y: 0 }, config: {} },
        { id: 'n2', type: 'dst', position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' }]
    )
    await executeWorkflow(wf)
    expect(useRunContext.getState().nodeStates['n2'].outputs).toEqual({ out: 'hello world' })
  })

  it('marks downstream as skipped on error', async () => {
    nodeRegistry.register({
      ...noopSpec('boom'),
      run: async () => {
        throw new Error('kaboom')
      },
    })
    nodeRegistry.register(noopSpec('after'))
    const wf = makeWorkflow(
      [
        { id: 'n1', type: 'boom', position: { x: 0, y: 0 }, config: {} },
        { id: 'n2', type: 'after', position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' }]
    )
    await executeWorkflow(wf)
    const states = useRunContext.getState().nodeStates
    expect(states['n1'].status).toBe('error')
    expect(states['n1'].error).toContain('kaboom')
    expect(states['n2'].status).toBe('skipped')
  })

  it('respects abort signal', async () => {
    nodeRegistry.register({
      ...noopSpec('slow'),
      run: async (ctx) => {
        await new Promise((r) => setTimeout(r, 50))
        if (ctx.signal.aborted) throw new Error('aborted')
        return { out: 'done' }
      },
    })
    const wf = makeWorkflow(
      [{ id: 'n1', type: 'slow', position: { x: 0, y: 0 }, config: {} }],
      []
    )
    const promise = executeWorkflow(wf)
    setTimeout(() => useRunContext.getState().abortController?.abort(), 10)
    await promise
    expect(useRunContext.getState().nodeStates['n1'].status).toBe('error')
  })

  it('runs loop body N times and aggregates results', async () => {
    // Source : émet un array de 3 éléments sur "items"
    nodeRegistry.register({
      type: 'source-array', category: 'utility', label: 's', description: '', icon: Box,
      inputs: [], outputs: [{ name: 'items', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({ items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }),
    })
    // Loop-each / Loop-collect : enregistrés avec le bon type, l'executor les gère
    nodeRegistry.register({
      type: 'loop-each', category: 'logic', label: 'loop', description: '', icon: Box,
      inputs: [{ name: 'items', type: 'any' }], outputs: [{ name: 'item', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async (_c, _cfg, inputs) => ({ item: (inputs as any).items?.[0] }),
    })
    nodeRegistry.register({
      type: 'loop-collect', category: 'logic', label: 'collect', description: '', icon: Box,
      inputs: [{ name: 'item', type: 'any' }], outputs: [{ name: 'results', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({ results: [] }),
    })
    // Body : un node identité qui transforme item.name en uppercase via interpolation
    // Pour vérifier l'interpolation, on utilise un node qui retourne sa config 'value'.
    nodeRegistry.register({
      type: 'echo-config', category: 'utility', label: 'echo', description: '', icon: Box,
      inputs: [{ name: 'in', type: 'any' }], outputs: [{ name: 'out', type: 'any' }],
      configSchema: [], defaultConfig: { value: '' }, runtime: 'client',
      run: async (_c, config: any) => ({ out: config.value }),
    })

    const wf = makeWorkflow(
      [
        { id: 'src', type: 'source-array', position: { x: 0, y: 0 }, config: {} },
        { id: 'loop', type: 'loop-each', position: { x: 0, y: 0 }, config: {} },
        { id: 'echo', type: 'echo-config', position: { x: 0, y: 0 }, config: { value: 'Hi {{item.name}}!' } },
        { id: 'col', type: 'loop-collect', position: { x: 0, y: 0 }, config: {} },
      ],
      [
        { id: 'e1', source: 'src', sourceHandle: 'items', target: 'loop', targetHandle: 'items' },
        { id: 'e2', source: 'loop', sourceHandle: 'item', target: 'echo', targetHandle: 'in' },
        { id: 'e3', source: 'echo', sourceHandle: 'out', target: 'col', targetHandle: 'item' },
      ]
    )
    await executeWorkflow(wf)
    const colOutputs = useRunContext.getState().nodeStates['col'].outputs
    expect(colOutputs).toEqual({ results: ['Hi a!', 'Hi b!', 'Hi c!'] })
    expect(useRunContext.getState().nodeStates['loop'].status).toBe('success')
    expect(useRunContext.getState().nodeStates['col'].status).toBe('success')
  })

  it('loop exposes item props at root (CSV column names with spaces)', async () => {
    nodeRegistry.register({
      type: 'source-csv', category: 'utility', label: 's', description: '', icon: Box,
      inputs: [], outputs: [{ name: 'items', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({
        items: [
          { 'Nom produit': 'Perceuse M12', Prix: 99 },
          { 'Nom produit': 'Perceuse M18', Prix: 199 },
        ],
      }),
    })
    nodeRegistry.register({
      type: 'loop-each', category: 'logic', label: 'loop', description: '', icon: Box,
      inputs: [{ name: 'items', type: 'any' }], outputs: [{ name: 'item', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({ item: undefined }),
    })
    nodeRegistry.register({
      type: 'loop-collect', category: 'logic', label: 'collect', description: '', icon: Box,
      inputs: [{ name: 'item', type: 'any' }], outputs: [{ name: 'results', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({ results: [] }),
    })
    nodeRegistry.register({
      type: 'echo-config', category: 'utility', label: 'echo', description: '', icon: Box,
      inputs: [{ name: 'in', type: 'any' }], outputs: [{ name: 'out', type: 'any' }],
      configSchema: [], defaultConfig: { value: '' }, runtime: 'client',
      run: async (_c, config: any) => ({ out: config.value }),
    })

    const wf = makeWorkflow(
      [
        { id: 'src', type: 'source-csv', position: { x: 0, y: 0 }, config: {} },
        { id: 'loop', type: 'loop-each', position: { x: 0, y: 0 }, config: {} },
        { id: 'echo', type: 'echo-config', position: { x: 0, y: 0 }, config: { value: '{{Nom produit}} — {{Prix}}€' } },
        { id: 'col', type: 'loop-collect', position: { x: 0, y: 0 }, config: {} },
      ],
      [
        { id: 'e1', source: 'src', sourceHandle: 'items', target: 'loop', targetHandle: 'items' },
        { id: 'e2', source: 'loop', sourceHandle: 'item', target: 'echo', targetHandle: 'in' },
        { id: 'e3', source: 'echo', sourceHandle: 'out', target: 'col', targetHandle: 'item' },
      ]
    )
    await executeWorkflow(wf)
    expect(useRunContext.getState().nodeStates['col'].outputs).toEqual({
      results: ['Perceuse M12 — 99€', 'Perceuse M18 — 199€'],
    })
  })

  it('extracts rows from a Sheet object input (port `sheet` of Upload)', async () => {
    nodeRegistry.register({
      type: 'source-sheet', category: 'utility', label: 's', description: '', icon: Box,
      inputs: [], outputs: [{ name: 'sheet', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({
        sheet: {
          name: 'Feuille 1',
          columns: [{ key: 'Nom produit' }, { key: 'Prix' }],
          rows: [
            { 'Nom produit': 'Perceuse', Prix: 99 },
            { 'Nom produit': 'Marteau', Prix: 25 },
          ],
        },
      }),
    })
    nodeRegistry.register({
      type: 'echo-config', category: 'utility', label: 'echo', description: '', icon: Box,
      inputs: [{ name: 'in', type: 'any' }], outputs: [{ name: 'out', type: 'any' }],
      configSchema: [], defaultConfig: { value: '' }, runtime: 'client',
      run: async (_c, config: any) => ({ out: config.value }),
    })
    const wf = makeWorkflow(
      [
        { id: 'src', type: 'source-sheet', position: { x: 0, y: 0 }, config: {} },
        { id: 'echo', type: 'echo-config', position: { x: 0, y: 0 }, config: { value: '{{Nom produit}} - {{Prix}}' } },
      ],
      [{ id: 'e1', source: 'src', sourceHandle: 'sheet', target: 'echo', targetHandle: 'in' }]
    )
    await executeWorkflow(wf)
    expect(useRunContext.getState().nodeStates['echo'].outputs).toEqual({
      out: 'Perceuse, Marteau - 99, 25',
    })
  })

  it('joins array-of-rows columns by comma for interpolation (no loop, no iterate)', async () => {
    nodeRegistry.register({
      type: 'source-rows', category: 'utility', label: 's', description: '', icon: Box,
      inputs: [], outputs: [{ name: 'rows', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({ rows: [{ 'Nom produit': 'Perceuse', Prix: 99 }, { 'Nom produit': 'Marteau', Prix: 25 }] }),
    })
    nodeRegistry.register({
      type: 'echo-config', category: 'utility', label: 'echo', description: '', icon: Box,
      inputs: [{ name: 'in', type: 'any' }], outputs: [{ name: 'out', type: 'any' }],
      configSchema: [], defaultConfig: { value: '' }, runtime: 'client',
      run: async (_c, config: any) => ({ out: config.value }),
    })
    const wf = makeWorkflow(
      [
        { id: 'src', type: 'source-rows', position: { x: 0, y: 0 }, config: {} },
        { id: 'echo', type: 'echo-config', position: { x: 0, y: 0 }, config: { value: '{{Nom produit}} ({{Prix}})' } },
      ],
      [{ id: 'e1', source: 'src', sourceHandle: 'rows', target: 'echo', targetHandle: 'in' }]
    )
    await executeWorkflow(wf)
    expect(useRunContext.getState().nodeStates['echo'].outputs).toEqual({
      out: 'Perceuse, Marteau (99, 25)',
    })
  })

  it('ignores re-entrant executeWorkflow calls', async () => {
    let callCount = 0
    nodeRegistry.register({
      type: 'slow', category: 'utility', label: 's', description: '', icon: Box,
      inputs: [], outputs: [{ name: 'out', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => {
        callCount++
        await new Promise((r) => setTimeout(r, 30))
        return { out: callCount }
      },
    })
    const wf = makeWorkflow(
      [{ id: 'n1', type: 'slow', position: { x: 0, y: 0 }, config: {} }],
      []
    )
    // Lancer 3 runs en parallèle ; seul le premier doit s'exécuter.
    const p1 = executeWorkflow(wf)
    const p2 = executeWorkflow(wf)
    const p3 = executeWorkflow(wf)
    await Promise.all([p1, p2, p3])
    expect(callCount).toBe(1)
  })

  it('loop with empty array produces empty results', async () => {
    nodeRegistry.register({
      type: 'source-empty', category: 'utility', label: 's', description: '', icon: Box,
      inputs: [], outputs: [{ name: 'items', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({ items: [] }),
    })
    nodeRegistry.register({
      type: 'loop-each', category: 'logic', label: 'loop', description: '', icon: Box,
      inputs: [{ name: 'items', type: 'any' }], outputs: [{ name: 'item', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({ item: undefined }),
    })
    nodeRegistry.register({
      type: 'loop-collect', category: 'logic', label: 'collect', description: '', icon: Box,
      inputs: [{ name: 'item', type: 'any' }], outputs: [{ name: 'results', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async () => ({ results: [] }),
    })
    nodeRegistry.register({
      type: 'pass', category: 'utility', label: 'pass', description: '', icon: Box,
      inputs: [{ name: 'in', type: 'any' }], outputs: [{ name: 'out', type: 'any' }],
      configSchema: [], defaultConfig: {}, runtime: 'client',
      run: async (_c, _cfg, inputs: any) => ({ out: inputs.in }),
    })
    const wf = makeWorkflow(
      [
        { id: 'src', type: 'source-empty', position: { x: 0, y: 0 }, config: {} },
        { id: 'loop', type: 'loop-each', position: { x: 0, y: 0 }, config: {} },
        { id: 'p', type: 'pass', position: { x: 0, y: 0 }, config: {} },
        { id: 'col', type: 'loop-collect', position: { x: 0, y: 0 }, config: {} },
      ],
      [
        { id: 'e1', source: 'src', sourceHandle: 'items', target: 'loop', targetHandle: 'items' },
        { id: 'e2', source: 'loop', sourceHandle: 'item', target: 'p', targetHandle: 'in' },
        { id: 'e3', source: 'p', sourceHandle: 'out', target: 'col', targetHandle: 'item' },
      ]
    )
    await executeWorkflow(wf)
    expect(useRunContext.getState().nodeStates['col'].outputs).toEqual({ results: [] })
  })
})
