import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/workflows/promptToFlow/generateWorkflow', () => ({
  generateWorkflow: vi.fn(),
}))
vi.mock('@/features/workflows/promptToFlow/validateGraph', () => ({
  validateGraph: vi.fn(),
}))
vi.mock('@/features/workflows/promptToFlow/layoutGraph', () => ({
  layoutGraph: vi.fn(() => ({})),
}))
vi.mock('@/features/workflows/persistence/workflowsApi', () => ({
  newWorkflow: vi.fn(() => ({ id: 'wf1', name: '', nodes: [], edges: [] })),
  saveWorkflow: vi.fn(),
}))

import { generateAndSaveWorkflow } from './generateWorkflowFromInbox'
import { generateWorkflow } from '@/features/workflows/promptToFlow/generateWorkflow'
import { validateGraph } from '@/features/workflows/promptToFlow/validateGraph'
import { saveWorkflow } from '@/features/workflows/persistence/workflowsApi'

const okGraph = {
  title: 'Mon flux',
  summary: '',
  nodes: [{ id: 'n1', type: 'upload', position: { x: 0, y: 0 }, config: {} }],
  edges: [],
  issues: [],
}

describe('generateAndSaveWorkflow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('génère, sauvegarde et retourne les infos', async () => {
    vi.mocked(generateWorkflow).mockResolvedValue({ title: 'Mon flux', summary: '', nodes: [], edges: [] } as never)
    vi.mocked(validateGraph).mockReturnValue(okGraph as never)

    const info = await generateAndSaveWorkflow('crée un flux', 'uid1')

    expect(saveWorkflow).toHaveBeenCalledWith('uid1', expect.objectContaining({ id: 'wf1', name: 'Mon flux' }))
    expect(info).toEqual({ workflowId: 'wf1', name: 'Mon flux', nodeCount: 1 })
  })

  it('tente une réparation quand le 1er passage a des erreurs', async () => {
    vi.mocked(generateWorkflow).mockResolvedValue({ title: 'x', summary: '', nodes: [], edges: [] } as never)
    vi.mocked(validateGraph)
      .mockReturnValueOnce({ ...okGraph, issues: [{ level: 'error', message: 'edge cassée' }] } as never)
      .mockReturnValueOnce(okGraph as never)

    await generateAndSaveWorkflow('crée un flux', 'uid1')

    expect(generateWorkflow).toHaveBeenCalledTimes(2)
    expect(vi.mocked(generateWorkflow).mock.calls[1][1]).toEqual({ repairIssues: ['edge cassée'] })
  })

  it('lève une erreur si aucun node généré', async () => {
    vi.mocked(generateWorkflow).mockResolvedValue({ title: 'x', summary: '', nodes: [], edges: [] } as never)
    vi.mocked(validateGraph).mockReturnValue({ ...okGraph, nodes: [], issues: [] } as never)

    await expect(generateAndSaveWorkflow('Ok', 'uid1')).rejects.toThrow('aucun node')
    expect(saveWorkflow).not.toHaveBeenCalled()
  })
})
