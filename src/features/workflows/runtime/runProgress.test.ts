import { describe, it, expect } from 'vitest'
import { runProgress } from './runProgress'
import type { NodeRunState, Workflow } from '../types'

const wf = (ids: string[], edges: [string, string][] = []): Pick<Workflow, 'nodes' | 'edges'> => ({
  nodes: ids.map((id) => ({ id, type: 't', position: { x: 0, y: 0 }, config: {} })) as Workflow['nodes'],
  edges: edges.map(([source, target]) => ({ id: `${source}-${target}`, source, target })) as Workflow['edges'],
})
const st = (over: Partial<NodeRunState>): NodeRunState => ({ status: 'pending', logs: [], ...over })
const label = (id: string) => `carte ${id}`

describe('avancement d’un run', () => {
  it('⚠ ne compte QUE les cartes qui vont tourner : une orpheline plafonnerait la barre', () => {
    const w = wf(['a', 'b', 'orpheline'], [['a', 'b']])
    const p = runProgress(w, { a: st({ status: 'success' }), b: st({ status: 'success' }) }, label)
    expect(p.total).toBe(2)
    expect(p.ratio).toBe(1)
  })

  it('une carte EN COURS compte pour une demie — sinon la barre reste figée', () => {
    const w = wf(['a', 'b'], [['a', 'b']])
    const p = runProgress(w, { a: st({ status: 'success' }), b: st({ status: 'running' }) }, label)
    expect(p.ratio).toBe(0.75)
    expect(p.runningLabels).toEqual(['carte b'])
  })

  it('erreurs et cartes sautées sont TERMINÉES : le run avance, il ne se bloque pas', () => {
    const w = wf(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])
    const p = runProgress(w, {
      a: st({ status: 'error' }), b: st({ status: 'skipped' }), c: st({ status: 'success' }),
    }, label)
    expect({ done: p.done, failed: p.failed, skipped: p.skipped, ratio: p.ratio })
      .toEqual({ done: 3, failed: 1, skipped: 1, ratio: 1 })
  })

  it('additionne les compteurs live des cartes', () => {
    const w = wf(['a', 'b'], [['a', 'b']])
    const p = runProgress(w, { a: st({ status: 'success', count: 21848 }), b: st({ status: 'running', count: 400 }) }, label)
    expect(p.items).toBe(22248)
  })

  it('le temps écoulé part de la PREMIÈRE carte démarrée', () => {
    const w = wf(['a', 'b'], [['a', 'b']])
    const p = runProgress(w, {
      a: st({ status: 'success', startedAt: 1000 }), b: st({ status: 'running', startedAt: 5000 }),
    }, label, 9000)
    expect(p.elapsedMs).toBe(8000)
  })

  it('rien de démarré : aucun temps inventé', () => {
    expect(runProgress(wf(['a']), {}, label).elapsedMs).toBe(0)
  })
})
