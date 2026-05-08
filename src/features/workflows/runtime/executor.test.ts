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
})
