import { describe, it, expect, vi, beforeAll } from 'vitest'
import { initWorkflowsRegistry } from '../registry/builtin'

const generateJsonMock = vi.fn()
vi.mock('@/features/ai/llmRouter', () => ({
  generateJson: (opts: unknown) => generateJsonMock(opts),
}))

import { generateWorkflow } from './generateWorkflow'

describe('generateWorkflow', () => {
  beforeAll(() => initWorkflowsRegistry())

  it('appelle generateJson avec la task workflow.generate et renvoie le graphe', async () => {
    const raw = {
      title: 'X', summary: 'Y',
      nodes: [{ ref: 'u', type: 'upload', config: [] }],
      edges: [],
    }
    generateJsonMock.mockResolvedValueOnce(raw)
    const result = await generateWorkflow('charge un fichier')
    expect(generateJsonMock).toHaveBeenCalledTimes(1)
    const opts = generateJsonMock.mock.calls[0][0] as { task: string; prompt: string }
    expect(opts.task).toBe('workflow.generate')
    expect(opts.prompt).toContain('charge un fichier')
    expect(opts.prompt).toContain('type: upload')
    expect(result).toEqual(raw)
  })

  it('injecte les issues de réparation dans le prompt', async () => {
    generateJsonMock.mockResolvedValueOnce({ title: '', summary: '', nodes: [], edges: [] })
    await generateWorkflow('p', { repairIssues: ['Node inconnu : "foo".'] })
    const calls = generateJsonMock.mock.calls
    const opts = calls[calls.length - 1][0] as { prompt: string }
    expect(opts.prompt).toContain('Node inconnu : "foo".')
  })
})
