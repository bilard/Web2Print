import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/workflows/runtime/executor', () => ({ executeWorkflow: vi.fn() }))
vi.mock('@/features/workflows/runtime/runContext', () => ({
  useRunContext: { getState: vi.fn() },
}))

import { executeWorkflowAndCollect } from './executeWorkflowAndCollect'
import { executeWorkflow } from '@/features/workflows/runtime/executor'
import { useRunContext } from '@/features/workflows/runtime/runContext'
import type { Workflow } from '@/features/workflows/types'

const wf = { id: 'wf1', nodes: [], edges: [] } as unknown as Workflow

function setStates(nodeStates: Record<string, unknown>) {
  vi.mocked(useRunContext.getState).mockReturnValue({ nodeStates } as never)
}

describe('executeWorkflowAndCollect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(executeWorkflow).mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['x'])) }))
    vi.stubGlobal('URL', { ...URL, revokeObjectURL: vi.fn(), createObjectURL: vi.fn() })
  })

  it('récupère le fichier du 1er node export et révoque l’URL', async () => {
    setStates({
      a: { status: 'success', outputs: { sheet: {} } },
      b: { status: 'success', outputs: { result: { url: 'blob:x', filename: 'out.pdf', mime: 'application/pdf' } } },
    })
    const res = await executeWorkflowAndCollect(wf)
    expect(res.nodeCount).toBe(2)
    expect(res.file?.filename).toBe('out.pdf')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })

  it('aucun export → file undefined', async () => {
    setStates({ a: { status: 'success', outputs: { sheet: {} } } })
    const res = await executeWorkflowAndCollect(wf)
    expect(res.file).toBeUndefined()
    expect(res.nodeCount).toBe(1)
  })

  it('compte les erreurs et expose la première', async () => {
    setStates({
      a: { status: 'error', error: 'boom', outputs: {} },
      b: { status: 'success', outputs: {} },
    })
    const res = await executeWorkflowAndCollect(wf)
    expect(res.errorCount).toBe(1)
    expect(res.firstError).toBe('boom')
    expect(res.nodeCount).toBe(1)
  })
})
