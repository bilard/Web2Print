// functions/src/workflow/nodes/pure.test.ts
import { describe, it, expect } from 'vitest'
import './pure'
import { getServerNode } from '../registry'
import type { ServerRunCtx } from '../types'

const ctx: ServerRunCtx = { uid: 'u', log: () => {}, signal: new AbortController().signal }
const run = (type: string, config: any, inputs: any) => getServerNode(type)!.run(ctx, config, inputs)

describe('nodes purs', () => {
  it('text-input émet le texte', async () => {
    expect(await run('text-input', { text: 'hi' }, {})).toEqual({ text: 'hi' })
  })
  it('if-else route then/else', async () => {
    expect(await run('if-else', { expression: 'value > 1' }, { value: 2 })).toEqual({ then: 2 })
    expect(await run('if-else', { expression: 'value > 1' }, { value: 0 })).toEqual({ else: 0 })
  })
  it('transform-filter garde les lignes valides', async () => {
    const out = await run('transform-filter', { expression: 'row.p > 0' }, { sheet: { rows: [{ p: 1 }, { p: -1 }] } })
    expect((out.sheet as any).rows).toEqual([{ p: 1 }])
  })
  it('transform-set-fields applique les templates', async () => {
    const out = await run('transform-set-fields', { assignments: 'slug = {{name}}' }, { sheet: { rows: [{ name: 'A' }] } })
    expect((out.sheet as any).rows[0].slug).toBe('A')
  })
  it('transform-text met en minuscules', async () => {
    const out = await run('transform-text', { source: 'n', operation: 'lowercase' }, { sheet: { rows: [{ n: 'AB' }] } })
    expect((out.sheet as any).rows[0].n).toBe('ab')
  })
})
