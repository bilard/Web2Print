import { describe, it, expect, vi } from 'vitest'
import { planPass, runPass, unitKey, type EnrichTarget, type EnrichUnit } from './pass'
import { buildMarker, newPassCounts, type EnrichableField } from './revision'
import type { FieldPlan } from './fieldPlan'

const improve = (over: Partial<FieldPlan> = {}): FieldPlan => ({
  key: 'nom', kind: 'improve', minLength: 28, prompt: 'Rends le nom explicite.', promptVersion: 'v1', ...over,
})

const target = (id: string, fields: Record<string, EnrichableField>, row = {}): EnrichTarget =>
  ({ id, fields, row })

describe('planPass — chiffrer avant de dépenser', () => {
  it('ne retient que les champs sous le seuil', () => {
    const { units, counts } = planPass([
      target('p1', { nom: { value: 'LAME 510' } }),
      target('p2', { nom: { value: 'Lame de tondeuse autoportée 510 mm pour STIGA' } }),
    ], [improve()])

    expect(units.map((u) => u.productId)).toEqual(['p1'])
    expect(counts.considered).toBe(2)
    expect(counts.skipped['long-enough']).toBe(1)
  })

  it('compte à part un champ que le produit n’a pas', () => {
    // Ce n'est pas un refus comme les autres : le plan vise une colonne absente ici.
    const { units, counts } = planPass([target('p1', { autre: { value: 'x' } })], [improve()])
    expect(units).toHaveLength(0)
    expect(counts.skipped['not-applicable']).toBe(1)
  })

  it('écarte ce qui a déjà été fait par la MÊME consigne', () => {
    const done: EnrichableField = {
      value: 'Lame', enrich: { original: 'L', kind: 'improve', targetLang: 'fr', passId: 'p0', at: 1, marker: buildMarker('improve', 'fr', 'v1') },
    }
    const { units, counts } = planPass([target('p1', { nom: done })], [improve()])
    expect(units).toHaveLength(0)
    expect(counts.skipped['already-done']).toBe(1)
  })

  it('ne cherche la langue QUE pour une traduction', () => {
    // La calculer ailleurs serait du travail perdu sur des centaines de milliers de champs.
    const nl = 'Grasmaaier mes voor zitmaaier, geschikt voor alle modellen.'
    const trad = planPass([target('p1', { nom: { value: nl } })], [improve({ kind: 'translate', minLength: 0 })])
    expect(trad.units[0]?.sourceLang).toBe('nl')

    const enrich = planPass([target('p1', { nom: { value: 'LAME 510' } })], [improve()])
    expect(enrich.units[0]?.sourceLang).toBeUndefined()
  })

  it('ne traduit pas ce dont la langue est indécidable', () => {
    // Un libellé court ne se tranche pas : le traduire à l'aveugle abîmerait du français.
    const { units, counts } = planPass([target('p1', { nom: { value: 'LAME 510MM STIGA' } })],
      [improve({ kind: 'translate', minLength: 0 })])
    expect(units).toHaveLength(0)
    expect(counts.skipped['long-enough']).toBe(1)
  })
})

describe('runPass — application et refus', () => {
  const unitsOf = (t: EnrichTarget[], p: FieldPlan[]) => planPass(t, p)

  it('applique une proposition saine et conserve l’original', async () => {
    const { units, counts } = unitsOf([target('p1', { nom: { value: 'LAME 510' } })], [improve()])
    const written: EnrichableField[] = []

    const res = await runPass(units, counts, {
      passId: 'run1',
      callBatch: async (us) => Object.fromEntries(us.map((u) => [unitKey(u), 'Lame de tondeuse 510 pour autoportée'])),
      protectedOf: () => ({}),
      onRevision: (_u, f) => written.push(f),
      now: () => 1_700_000_000_000,
    })

    expect(written[0].value).toBe('Lame de tondeuse 510 pour autoportée')
    expect(written[0].enrich?.original).toBe('LAME 510')
    expect(res.counts.revised).toBe(1)
    expect(res.productIds).toEqual(['p1'])
  })

  it('⚠ REFUSE une proposition qui casse une référence, et n’écrit rien', () => {
    // Le garde-fou central : une file de propositions douteuses finirait acceptée en bloc.
    const { units, counts } = unitsOf([target('p1', { nom: { value: 'LAME 1134-4319-01' } })], [improve()])
    const written: EnrichableField[] = []
    const rejected: EnrichUnit[] = []

    return runPass(units, counts, {
      passId: 'run1',
      callBatch: async (us) => Object.fromEntries(us.map((u) => [unitKey(u), 'Lame de tondeuse réf 1134-4319-99'])),
      protectedOf: () => ({ refs: ['1134-4319-01'] }),
      onRevision: (_u, f) => written.push(f),
      onRejected: (u) => rejected.push(u),
    }).then((res) => {
      expect(written).toHaveLength(0)
      expect(rejected).toHaveLength(1)
      expect(res.counts.rejected).toBe(1)
      expect(res.counts.revised).toBe(0)
      expect(res.productIds).toEqual([])
    })
  })

  it('un échec du modèle n’écrit rien et laisse le champ éligible', async () => {
    const { units, counts } = unitsOf([target('p1', { nom: { value: 'LAME 510' } })], [improve()])
    const written: EnrichableField[] = []

    const res = await runPass(units, counts, {
      passId: 'run1',
      callBatch: async () => { throw new Error('modèle indisponible') },
      protectedOf: () => ({}),
      onRevision: (_u, f) => written.push(f),
    })
    expect(written).toHaveLength(0)
    expect(res.counts.revised).toBe(0)
  })
})

describe('plafond de dépense', () => {
  it('s’arrête ENTRE deux lots et le signale', async () => {
    // ⚠ Jamais au milieu d'un lot : couper en cours perdrait des réponses déjà payées.
    // Et un passage qui s'arrête en silence se lit comme un passage terminé.
    const many = Array.from({ length: 6 }, (_, i) => target(`p${i}`, { nom: { value: `LAME ${i}` } }))
    const { units, counts } = planPass(many, [improve()])
    let spent = 0

    const res = await runPass(units, counts, {
      passId: 'run1',
      chunkSize: 2,
      callBatch: async (us) => {
        spent += 1
        return Object.fromEntries(us.map((u) => [unitKey(u), `Lame de tondeuse numéro ${u.productId}`]))
      },
      protectedOf: () => ({}),
      onRevision: () => {},
      spentUsd: () => spent,
      capUsd: 2,
      // Sans cette accélération, le test attendrait le rythme réel entre lots.
      now: () => 1,
    })

    expect(res.cappedBy).toBe('spend')
    // Deux lots payés, le troisième n'est jamais parti.
    expect(spent).toBe(2)
    expect(res.counts.revised).toBe(4)
  })

  it('sans plafond, va au bout', async () => {
    const many = Array.from({ length: 4 }, (_, i) => target(`p${i}`, { nom: { value: `LAME ${i}` } }))
    const { units, counts } = planPass(many, [improve()])
    const res = await runPass(units, counts, {
      passId: 'run1', chunkSize: 2,
      callBatch: async (us) => Object.fromEntries(us.map((u) => [unitKey(u), `Lame de tondeuse ${u.productId}`])),
      protectedOf: () => ({}),
      onRevision: () => {},
    })
    expect(res.cappedBy).toBeUndefined()
    expect(res.counts.revised).toBe(4)
  })
})

describe('progression', () => {
  // ⚠ En CHAMPS, jamais en lots. Le journal disait « 97 / 5 789 champs » alors qu'il
  // remontait un numéro de LOT : à vingt champs par lot, on affichait le vingtième du
  // travail fait et le passage paraissait à l'arrêt.
  it('rapporte l’avancement en champs traités, pas en numéro de lot', async () => {
    const many = Array.from({ length: 4 }, (_, i) => target(`p${i}`, { nom: { value: `LAME ${i}` } }))
    const { units, counts } = planPass(many, [improve()])
    const seen: [number, number][] = []
    await runPass(units, counts, {
      passId: 'run1', chunkSize: 2,
      callBatch: async (us) => Object.fromEntries(us.map((u) => [unitKey(u), `Lame de tondeuse ${u.productId}`])),
      protectedOf: () => ({}),
      onRevision: () => {},
      onChunkDone: (done, total) => seen.push([done, total]),
    })
    expect(seen).toEqual([[2, 4], [4, 4]])
  })
})

describe('clé d’unité', () => {
  it('distingue deux champs d’un même produit', () => {
    const base = { plan: improve(), text: '', row: {} }
    expect(unitKey({ ...base, productId: 'p1', field: 'nom' } as EnrichUnit))
      .not.toBe(unitKey({ ...base, productId: 'p1', field: 'description' } as EnrichUnit))
  })
})

describe('compteurs de départ', () => {
  it('runPass part des compteurs du plan, il ne les remet pas à zéro', async () => {
    // Sinon le passage annoncerait « 1 traité » en oubliant les 200 000 écartés, et on
    // ne saurait plus si le filtre a mordu ou si la base était vide.
    // Le dénominateur, lui, appartient à la décision : l'exécution ne le recompte pas.
    const { units } = planPass([target('p1', { nom: { value: 'LAME 510' } })], [improve()])
    const base = { ...newPassCounts(), considered: 500, skipped: { ...newPassCounts().skipped, 'already-done': 499 } }
    const res = await runPass(units, base, {
      passId: 'run1',
      callBatch: async (us) => Object.fromEntries(us.map((u) => [unitKey(u), 'Lame de tondeuse explicite'])),
      protectedOf: () => ({}),
      onRevision: () => {},
    })
    // ⚠ `runPass` ne touche PAS au dénominateur : c'est la décision qui l'a établi.
    expect(res.counts.considered).toBe(500)
    expect(res.counts.skipped['already-done']).toBe(499)
    expect(res.counts.revised).toBe(1)
  })
})

// Le rythme entre lots ralentirait les tests sans rien prouver : on le neutralise.
vi.mock('@/features/excel/ai-completion/columnCompletionEngine', async (orig) => {
  const mod = await orig<typeof import('@/features/excel/ai-completion/columnCompletionEngine')>()
  return {
    ...mod,
    runCompletionBatches: (rows: never, prompt: never, cols: never, deps: never, size: never) =>
      mod.runCompletionBatches(rows, prompt, cols, { ...(deps as object), rateLimitMs: 0 } as never, size),
  }
})
