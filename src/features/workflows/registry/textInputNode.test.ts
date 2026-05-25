import { describe, it, expect, vi } from 'vitest'
import { textInputNode } from './textInputNode'
import type { RunContextApi } from '../types'

function mkCtx(log = vi.fn()): RunContextApi {
  return { signal: new AbortController().signal, log }
}

describe('text-input node', () => {
  it('produit le texte saisi en sortie', async () => {
    const res = await textInputNode.run(mkCtx(), { text: 'bonjour' }, {})
    expect(res).toEqual({ text: 'bonjour' })
  })

  it('texte vide → log warn + sortie vide', async () => {
    const log = vi.fn()
    const res = await textInputNode.run(mkCtx(log), { text: '' }, {})
    expect(res).toEqual({ text: '' })
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('vide'))
  })

  it('est un node source (aucune entrée) de catégorie import', () => {
    expect(textInputNode.inputs).toEqual([])
    expect(textInputNode.category).toBe('import')
    expect(textInputNode.outputs).toEqual([{ name: 'text', type: 'any' }])
  })
})
