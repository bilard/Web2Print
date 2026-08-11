import { describe, it, expect } from 'vitest'
import { durationTrend, typicalDuration } from './runHistoryStats'

const MIN = 60_000
/** Un run terminé de `m` minutes, indexé pour rester distinct. */
const run = (m: number, i = 0) => ({ startedAt: i, endedAt: i + m * MIN, succeeded: 6 })
/** Un run où la cadence d'envoi a TOUT suspendu : « Terminé », une seconde, rien d'abouti. */
const idle = (i: number) => ({ startedAt: i, endedAt: i + 1_000, succeeded: 0 })
/** Pire : suspendu APRÈS deux cartes. Il a « travaillé », il n'a pas moissonné. */
const partial = (i: number) => ({ startedAt: i, endedAt: i + 1_000, succeeded: 2 })

describe('durationTrend — « la moisson s’allonge » est une information d’exploitation', () => {
  it('compare la moitié récente à la moitié ancienne', () => {
    // Anciens : 10 et 10 min. Récents : 20 et 20 min. → +100 %.
    const runs = [
      { startedAt: 4, endedAt: 4 + 20 * 60_000 },
      { startedAt: 3, endedAt: 3 + 20 * 60_000 },
      { startedAt: 2, endedAt: 2 + 10 * 60_000 },
      { startedAt: 1, endedAt: 1 + 10 * 60_000 },
    ]
    expect(durationTrend(runs)).toBe(100)
  })

  it('écarte les runs en erreur — « +2276 % » venait de runs d’une seconde', () => {
    const crash = (i: number) => ({ startedAt: i, endedAt: i + 1_000, status: 'error' })
    const runs = [crash(8), crash(7), run(20, 6), run(20, 5), run(10, 4), run(10, 3)]
    expect(durationTrend(runs)).toBe(100)
  })

  it('écarte les runs qui n’ont RIEN abouti — « +2251 % » venait de runs tout sautés', () => {
    // Six runs : trois d'une seconde sans une seule carte aboutie, trois vrais.
    expect(durationTrend([idle(9), idle(8), idle(7), run(20, 6), run(20, 5), run(10, 4), run(10, 3)])).toBe(100)
  })

  it('écarte les runs PARTIELS — deux cartes en une seconde ne se comparent pas à un run complet', () => {
    // Trois runs suspendus après deux cartes, quatre runs complets à six cartes.
    const runs = [partial(9), partial(8), partial(7), run(20, 6), run(20, 5), run(10, 4), run(10, 3)]
    expect(durationTrend(runs)).toBe(100)
  })

  it('ne se prononce pas sous quatre runs — deux points ne font pas une tendance', () => {
    expect(durationTrend([{ startedAt: 1, endedAt: 2 }, { startedAt: 3, endedAt: 4 }])).toBeNull()
  })

  it('ignore les runs sans fin', () => {
    expect(durationTrend([{ startedAt: 1 }, { startedAt: 2 }, { startedAt: 3 }, { startedAt: 4 }])).toBeNull()
  })
})

describe('typicalDuration — la seule estimation honnête de l’écran', () => {
  it('prend la médiane des cinq derniers runs terminés', () => {
    // Ordre Firestore : du plus récent au plus ancien. Durées 24, 26, 25, 26, 2 → 25 min.
    const runs = [run(24, 5), run(26, 4), run(25, 3), run(26, 2), run(2, 1)]
    expect(typicalDuration(runs)).toBe(25 * MIN)
  })

  it('un run avorté ne tire pas l’estimation vers le bas — c’est tout l’intérêt de la médiane', () => {
    const withCrash = [run(25, 4), { startedAt: 3, endedAt: 3 + 4_000 }, run(26, 2), run(24, 1)]
    // Moyenne : ~19 min. Médiane des quatre : (24 + 25) / 2 = 24,5 min.
    expect(typicalDuration(withCrash)).toBe(Math.round(24.5 * MIN))
  })

  it('écarte aussi les runs tout sautés, « Terminé » mais sans travail', () => {
    expect(typicalDuration([idle(9), idle(8), run(25, 7), run(26, 6), run(24, 5)])).toBe(25 * MIN)
  })

  it('ne retient que les runs de même ampleur que le meilleur', () => {
    expect(typicalDuration([partial(9), partial(8), run(25, 7), run(26, 6), run(24, 5)])).toBe(25 * MIN)
  })

  it('ne connaissant l’ampleur d’aucun run, les compare tous — on n’invente pas leur passé', () => {
    const old = (m: number, i: number) => ({ startedAt: i, endedAt: i + m * MIN })
    expect(typicalDuration([old(10, 3), old(20, 2), old(30, 1)])).toBe(20 * MIN)
  })

  it('ne compte que l’échantillon récent : un passé lointain rapide ne rajeunit pas les runs d’aujourd’hui', () => {
    const recent = [run(20, 8), run(20, 7), run(20, 6), run(20, 5), run(20, 4)]
    const ancient = [run(1, 3), run(1, 2), run(1, 1)]
    expect(typicalDuration([...recent, ...ancient])).toBe(20 * MIN)
  })

  it('écarte les runs en erreur — la médiane absorbe un accident, pas une série', () => {
    const crash = (i: number) => ({ startedAt: i, endedAt: i + 4_000, status: 'error' })
    const runs = [crash(7), crash(6), crash(5), run(25, 4), run(26, 3), run(24, 2)]
    expect(typicalDuration(runs)).toBe(25 * MIN)
  })

  it('se tait sous trois runs terminés, et ignore les runs en cours', () => {
    expect(typicalDuration([run(10, 2), run(10, 1)])).toBeNull()
    expect(typicalDuration([run(10, 3), run(10, 2), { startedAt: 1 }])).toBeNull()
  })
})
