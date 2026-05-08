// src/features/workflows/runtime/integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Box } from 'lucide-react'
import { executeWorkflow } from './executor'
import { nodeRegistry } from '../registry'
import { portTypeRegistry, registerBuiltinPorts } from './ports'
import { useRunContext } from './runContext'
import type { NodeSpec, Workflow } from '../types'

const stub = (
  type: 'parse' | 'enrich' | 'export',
  run: NodeSpec['run']
): NodeSpec => ({
  type,
  category: 'utility',
  label: type,
  description: '',
  icon: Box,
  inputs:
    type === 'parse'
      ? [{ name: 'file', type: 'file', required: true }]
      : type === 'enrich'
      ? [{ name: 'sheet', type: 'sheet', required: true }]
      : [{ name: 'sheet', type: 'sheet', required: true }],
  outputs:
    type === 'parse'
      ? [{ name: 'sheet', type: 'sheet' }]
      : type === 'enrich'
      ? [{ name: 'sheet', type: 'sheet' }]
      : [{ name: 'result', type: 'export-result' }],
  configSchema: [],
  defaultConfig: {},
  runtime: 'client',
  run,
})

describe('full workflow integration', () => {
  beforeEach(() => {
    nodeRegistry.clear()
    portTypeRegistry.clear()
    registerBuiltinPorts()
    useRunContext.getState().resetRun()
    nodeRegistry.register(stub('parse', async () => ({ sheet: { rows: [{ sku: 'A1' }, { sku: 'A2' }] } })))
    nodeRegistry.register(
      stub('enrich', async (_c, _cfg, inputs) => {
        const sheetInput = (inputs as { sheet: { rows: Array<Record<string, unknown>> } }).sheet
        return {
          sheet: {
            rows: sheetInput.rows.map((r) => ({ ...r, title: 'enriched' })),
          },
        }
      }),
    )
    nodeRegistry.register(
      stub('export', async (_c, _cfg, inputs) => {
        const sheetInput = (inputs as { sheet: { rows: Array<Record<string, unknown>> } }).sheet
        return {
          result: {
            url: 'blob:test',
            mime: 'application/x-test',
            filename: 'out.xlsx',
            count: sheetInput.rows.length,
          },
        }
      }),
    )
  })

  it('parse → enrich → export', async () => {
    const wf: Workflow = {
      id: 'wf',
      schemaVersion: 1,
      name: 't',
      description: '',
      ownerId: 'u',
      createdAt: 0,
      updatedAt: 0,
      nodes: [
        { id: 'p', type: 'parse', position: { x: 0, y: 0 }, config: {} },
        { id: 'e', type: 'enrich', position: { x: 0, y: 0 }, config: {} },
        { id: 'x', type: 'export', position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'p', sourceHandle: 'sheet', target: 'e', targetHandle: 'sheet' },
        { id: 'e2', source: 'e', sourceHandle: 'sheet', target: 'x', targetHandle: 'sheet' },
      ],
    }
    await executeWorkflow(wf)
    const states = useRunContext.getState().nodeStates
    expect(states['p'].status).toBe('success')
    expect(states['e'].status).toBe('success')
    expect(states['x'].status).toBe('success')
    const result = (states['x'].outputs as { result: { count: number } }).result
    expect(result.count).toBe(2)
  })
})
