// ⚠ Ce que ces tests protègent : l'historique doit se lire du plus RÉCENT au plus ancien,
// et une série d'échecs doit se voir sans compter les pastilles à l'œil.
import { describe, it, expect } from 'vitest'
import { summarizeRuns, type RunEntry } from './runHistorySummary'

const run = (id: string, endedAt: number, status: string, durMs = 60_000): RunEntry =>
  ({ id, startedAt: endedAt - durMs, endedAt, status })

describe('résumé des runs d’un suivi', () => {
  it('classe du plus récent au plus ancien et compte chaque issue', () => {
    const s = summarizeRuns([
      run('a', 1000, 'success'), run('c', 3000, 'error'), run('b', 2000, 'partial'),
    ])
    expect(s.runs.map((r) => r.id)).toEqual(['c', 'b', 'a'])
    expect([s.ok, s.partial, s.error]).toEqual([1, 1, 1])
    expect(s.lastEndedAt).toBe(3000)
  })

  it('compte les échecs CONSÉCUTIFS depuis le plus récent, pas le total', () => {
    // Deux échecs récents derrière un run abouti : la série vaut 2, pas 3.
    const s = summarizeRuns([
      run('vieux', 1000, 'error'), run('ok', 2000, 'success'),
      run('ko1', 3000, 'error'), run('ko2', 4000, 'error'),
    ])
    expect(s.error).toBe(3)
    expect(s.failStreak).toBe(2)
  })

  it('une série s’interrompt dès qu’un run aboutit', () => {
    const s = summarizeRuns([run('ko', 1000, 'error'), run('ok', 2000, 'success')])
    expect(s.failStreak).toBe(0)
  })

  it('la durée est MÉDIANE et ignore les runs en erreur', () => {
    // Un run tué au bout de deux secondes et un run de trois heures cohabitent : la
    // moyenne mentirait sur le rythme réel.
    const s = summarizeRuns([
      run('a', 5000, 'success', 60_000),
      run('b', 6000, 'success', 120_000),
      run('c', 7000, 'success', 10_800_000),
      run('d', 8000, 'error', 2_000),
    ])
    expect(s.medianMs).toBe(120_000)
  })

  it('écarte les runs sans fin exploitable, et borne la liste', () => {
    const s = summarizeRuns([
      { id: 'x', startedAt: 10, endedAt: 0, status: 'success' },
      ...Array.from({ length: 30 }, (_, i) => run(`r${i}`, 1000 + i, 'success')),
    ], 12)
    expect(s.runs).toHaveLength(12)
    expect(s.runs.some((r) => r.id === 'x')).toBe(false)
  })

  it('aucun run : des compteurs à zéro, jamais de valeur inventée', () => {
    const s = summarizeRuns([])
    expect(s).toMatchObject({ ok: 0, partial: 0, error: 0, lastEndedAt: null, medianMs: null, failStreak: 0 })
  })
})
