// functions/src/workflow/topo.test.ts
import { describe, it, expect } from 'vitest'
import { topoSort } from './topo'

const n = (id: string) => ({ id, type: 't', config: {} })
const e = (s: string, t: string) => ({ id: `${s}-${t}`, source: s, sourceHandle: 'o', target: t, targetHandle: 'i' })

describe('topoSort', () => {
  it('ordonne selon les dépendances', () => {
    const out = topoSort([n('b'), n('a')], [e('a', 'b')]).map((x) => x.id)
    expect(out.indexOf('a')).toBeLessThan(out.indexOf('b'))
  })
  it('lève sur cycle', () => {
    expect(() => topoSort([n('a'), n('b')], [e('a', 'b'), e('b', 'a')])).toThrow(/cycle/)
  })
})
