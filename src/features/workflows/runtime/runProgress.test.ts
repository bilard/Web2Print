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

describe('liste des cartes', () => {
  it('⚠ ordonnées par HEURE DE DÉMARRAGE, pas par ordre du graphe', () => {
    // L'ordre du graphe ne correspond ni au dessin ni à l'exécution : on y chercherait
    // « où on en est » dans une liste qui ne raconte rien.
    const w = wf(['c', 'a', 'b'], [['a', 'b'], ['b', 'c']])
    const p = runProgress(w, {
      a: st({ status: 'success', startedAt: 100 }),
      b: st({ status: 'success', startedAt: 200 }),
      c: st({ status: 'running', startedAt: 300 }),
    }, label)
    expect(p.cards.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('les cartes pas encore démarrées ferment la marche', () => {
    const w = wf(['a', 'b'], [['a', 'b']])
    const p = runProgress(w, { b: st({ status: 'running', startedAt: 50 }) }, label)
    expect(p.cards.map((x) => [x.id, x.status])).toEqual([['b', 'running'], ['a', 'pending']])
  })

  it('porte le compteur et la durée de chaque carte', () => {
    const w = wf(['a'], [])
    const p = runProgress(w, { a: st({ status: 'success', count: 4200, durationMs: 9000 }) }, label)
    expect(p.cards[0]).toMatchObject({ label: 'carte a', count: 4200, durationMs: 9000 })
  })
})

describe('débit et temps restant', () => {
  const w = wf(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd']])

  it('⚠ pas de débit avant une minute : sur trois secondes, il annonce n’importe quoi', () => {
    const p = runProgress(w, { a: st({ status: 'success', startedAt: 0, count: 500 }) }, label, 3000)
    expect(p.itemsPerMin).toBeNull()
  })

  it('rend le débit en lignes par minute une fois la première minute passée', () => {
    const p = runProgress(w, { a: st({ status: 'success', startedAt: 0, count: 4000 }) }, label, 120_000)
    expect(p.itemsPerMin).toBe(2000)
  })

  it('⚠ aucune estimation sous 10 % : elle ne vaudrait rien et on s’y fierait', () => {
    // Sans arête, TOUTES les cartes tournent : une seule terminée sur vingt-deux.
    const p = runProgress(wf('abcdefghijklmnopqrstuv'.split('')),
      { a: st({ status: 'success', startedAt: 0 }) }, label, 60_000)
    expect(p.etaMs).toBeNull()
  })

  it('extrapole le restant sur la part accomplie', () => {
    // 2 cartes finies sur 4 en 60 s → il reste la moitié, donc ~60 s.
    const p = runProgress(w, {
      a: st({ status: 'success', startedAt: 0 }), b: st({ status: 'success', startedAt: 10 }),
    }, label, 60_000)
    expect(Math.round((p.etaMs ?? 0) / 1000)).toBe(60)
  })

  it('run terminé : plus rien à estimer', () => {
    const p = runProgress(wf(['a'], []), { a: st({ status: 'success', startedAt: 0 }) }, label, 5000)
    expect(p.etaMs).toBeNull()
  })
})
