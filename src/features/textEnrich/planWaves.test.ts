import { describe, it, expect } from 'vitest'
import { planWaves, runWaves } from './planWaves'
import type { EnrichTarget, RunPassResult } from './pass'
import type { FieldPlan } from './fieldPlan'

const plan = (key: string, kind: FieldPlan['kind']): FieldPlan =>
  ({ key, kind, prompt: '', promptVersion: 'v1', minLength: 0 })

describe('vagues de plans', () => {
  it('⚠ deux plans sur le MÊME champ tombent dans deux vagues : la 2e voit le travail de la 1re', () => {
    const waves = planWaves([
      plan('TEXT_VENTE', 'translate'),
      plan('TEXT_VENTE', 'improve'),
    ])
    expect(waves).toHaveLength(2)
    expect(waves[0].map((p) => p.kind)).toEqual(['translate'])
    expect(waves[1].map((p) => p.kind)).toEqual(['improve'])
  })

  it('des champs DIFFÉRENTS partent ensemble : rien ne les fait attendre', () => {
    const waves = planWaves([plan('DESCRIPTION', 'translate'), plan('TEXT_VENTE', 'translate')])
    expect(waves).toHaveLength(1)
    expect(waves[0]).toHaveLength(2)
  })

  it('une vague ne contient JAMAIS deux plans du même champ — la clé produit::champ reste unique', () => {
    const waves = planWaves([
      plan('A', 'translate'), plan('B', 'translate'), plan('A', 'improve'),
      plan('A', 'structure'), plan('B', 'improve'),
    ])
    for (const wave of waves) {
      expect(new Set(wave.map((p) => p.key)).size).toBe(wave.length)
    }
    expect(waves.map((w) => w.length)).toEqual([2, 2, 1])
  })

  it('l’ORDRE de la liste décide : c’est lui qui dit ce qui passe en premier', () => {
    const waves = planWaves([plan('A', 'improve'), plan('A', 'translate')])
    expect(waves[0][0].kind).toBe('improve')
    expect(waves[1][0].kind).toBe('translate')
  })

  it('aucun plan : aucune vague', () => {
    expect(planWaves([])).toEqual([])
  })
})

describe('enchaînement des vagues', () => {
  const target = (id: string, text: string): EnrichTarget =>
    ({ id, fields: { A: { value: text } }, row: {} })
  const result = (ids: string[], over: Partial<RunPassResult> = {}): RunPassResult =>
    ({ counts: {} as RunPassResult['counts'], productIds: ids, ...over })

  it('replanifie chaque vague : la 2e ne peut pas être calculée d’avance', async () => {
    const seen: number[][] = []
    await runWaves(
      [[plan('A', 'translate')], [plan('A', 'improve')]],
      [target('p1', 'Bobineau')],
      [{ productId: 'p1', field: 'A', plan: plan('A', 'translate'), text: 'x', row: {} }],
      {} as RunPassResult['counts'],
      async (units) => { seen.push([units.length]); return result(['p1']) },
    )
    // Deux appels : la première vague fournie, la seconde replanifiée sur place.
    expect(seen).toHaveLength(2)
  })

  it('⚠ la BORNE se consomme d’une vague à l’autre, elle ne se remet pas à zéro', async () => {
    const sizes: number[] = []
    await runWaves(
      [[plan('A', 'translate')], [plan('A', 'improve')]],
      [target('p1', 'x'), target('p2', 'y'), target('p3', 'z')],
      [{ productId: 'p1', field: 'A', plan: plan('A', 'translate'), text: 'x', row: {} }],
      {} as RunPassResult['counts'],
      async (units) => { sizes.push(units.length); return result(['p1']) },
      { limit: 2 },
    )
    // 1 unité en vague 1, il reste 1 de budget : la vague 2 ne peut en prendre qu'une.
    expect(sizes).toEqual([1, 1])
  })

  it('le plafond de DÉPENSE coupe net : pas de vague suivante', async () => {
    let calls = 0
    await runWaves(
      [[plan('A', 'translate')], [plan('A', 'improve')]],
      [target('p1', 'x')],
      [{ productId: 'p1', field: 'A', plan: plan('A', 'translate'), text: 'x', row: {} }],
      {} as RunPassResult['counts'],
      async () => { calls++; return result(['p1'], { cappedBy: 'spend' }) },
    )
    expect(calls).toBe(1)
  })
})

// ⚠⚠ Le défaut qui rendait l'amélioration INATTEIGNABLE. Sur 200 000 champs, la vague
// « traduire » ne finit jamais dans un segment : coupée par l'échéance, elle faisait
// abandonner la vague « améliorer », et la mémoire écartait ensuite ces lignes comme
// faites. Le filtre « Améliorés » restait vide pour toujours.
describe('temps partagé entre les vagues', () => {
  const plans = [
    { key: 'a', kind: 'translate' as const, minLength: 0, prompt: '', promptVersion: 'v1' },
    { key: 'a', kind: 'improve' as const, minLength: 0, prompt: 'x', promptVersion: 'v1' },
  ]
  const target = { id: 'p1', fields: { a: { value: 'Hallo Welt' } } }
  const counts = { considered: 0, revised: 0, rejected: 0, skipped: {} } as never

  it('la seconde vague tourne même si la première a été coupée par l’ÉCHÉANCE', async () => {
    const seen: string[] = []
    await runWaves(planWaves(plans), [target], [{ productId: 'p1', field: 'a', plan: plans[0], text: 'Hallo Welt', row: {} }], counts,
      async (units) => {
        seen.push(units[0]?.plan.kind ?? '?')
        return { counts, productIds: ['p1'], cappedBy: 'deadline' as const }
      },
      { deadlineAt: Date.now() + 60_000 })
    expect(seen).toEqual(['translate', 'improve'])
  })

  it('le plafond de DÉPENSE, lui, arrête tout', async () => {
    const seen: string[] = []
    await runWaves(planWaves(plans), [target], [{ productId: 'p1', field: 'a', plan: plans[0], text: 'Hallo Welt', row: {} }], counts,
      async (units) => {
        seen.push(units[0]?.plan.kind ?? '?')
        return { counts, productIds: ['p1'], cappedBy: 'spend' as const }
      },
      { deadlineAt: Date.now() + 60_000 })
    expect(seen).toEqual(['translate'])
  })

  it('l’échéance globale dépassée arrête aussi', async () => {
    const seen: string[] = []
    await runWaves(planWaves(plans), [target], [{ productId: 'p1', field: 'a', plan: plans[0], text: 'Hallo Welt', row: {} }], counts,
      async (units) => {
        seen.push(units[0]?.plan.kind ?? '?')
        return { counts, productIds: ['p1'], cappedBy: 'deadline' as const }
      },
      { deadlineAt: Date.now() - 1 })
    expect(seen).toEqual(['translate'])
  })

  it('la première vague reçoit les deux tiers du temps, pas la totalité', async () => {
    const t0 = 1_000_000
    const deadlines: (number | undefined)[] = []
    await runWaves(planWaves(plans), [target], [{ productId: 'p1', field: 'a', plan: plans[0], text: 'Hallo Welt', row: {} }], counts,
      async (_units, c, dl) => { deadlines.push(dl); return { counts: c, productIds: ['p1'] } },
      { deadlineAt: t0 + 900, now: () => t0 })
    expect(deadlines[0]).toBe(t0 + 594)
    expect(deadlines[1]).toBe(t0 + 900)
  })
})
