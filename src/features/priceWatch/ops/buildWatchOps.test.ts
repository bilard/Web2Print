import { describe, it, expect } from 'vitest'
import { buildWatchOps } from './buildWatchOps'
import type { WatchOpsProgress } from './opsTypes'

const NOW = 1_700_000_000_000

const progress = (texts: WatchOpsProgress['texts']): WatchOpsProgress => ({ updatedAt: NOW, texts })

describe("buildWatchOps — chantier textes", () => {
  it("sépare traduction et amélioration, et donne le reste de chacun", () => {
    const v = buildWatchOps({
      progress: progress({
        considered: 10_000, alreadyDone: 7_000,
        pending: { translate: 2_000, improve: 1_000 },
        done: 500, total: 3_000,
        startedAt: NOW - 600_000, beatAt: NOW - 5_000, origin: 'server',
      }),
      cockpit: null, run: null, now: NOW,
    })
    const trad = v.chantiers.find((c) => c.id === 'translate')!
    expect(trad.remaining).toBe(2_000)
    const impr = v.chantiers.find((c) => c.id === 'improve')!
    expect(impr.remaining).toBe(1_000)
  })

  it("estime la durée sur le débit MESURÉ du passage", () => {
    // 500 champs en 10 minutes = 50/min ; il en reste 2 500 → 50 minutes.
    const v = buildWatchOps({
      progress: progress({
        considered: 3_000, alreadyDone: 0, pending: { translate: 3_000 },
        done: 500, total: 3_000,
        startedAt: NOW - 600_000, beatAt: NOW - 5_000, origin: 'server',
      }),
      cockpit: null, run: null, now: NOW,
    })
    expect(v.chantiers.find((c) => c.id === 'translate')!.etaMs).toBe(50 * 60_000)
  })

  it("n'estime RIEN sous 10 % accompli — un chiffre inventé vaut moins que pas de chiffre", () => {
    const v = buildWatchOps({
      progress: progress({
        considered: 3_000, alreadyDone: 0, pending: { translate: 3_000 },
        done: 10, total: 3_000,
        startedAt: NOW - 60_000, beatAt: NOW - 5_000, origin: 'server',
      }),
      cockpit: null, run: null, now: NOW,
    })
    expect(v.chantiers.find((c) => c.id === 'translate')!.etaMs).toBeNull()
  })

  it("range l'indéterminé à part, jamais avec le français", () => {
    const v = buildWatchOps({
      progress: progress({
        considered: 100, alreadyDone: 0, pending: { translate: 100 },
        byLang: [{ lang: 'de', count: 60 }, { lang: null, count: 40 }],
        done: 0, total: 100, startedAt: NOW, beatAt: NOW, origin: 'client',
      }),
      cockpit: null, run: null, now: NOW,
    })
    expect(v.chantiers.find((c) => c.id === 'translate')!.byLang).toEqual([
      { lang: 'de', count: 60 }, { lang: null, count: 40 },
    ])
  })
})

describe("buildWatchOps — vie et mort du run", () => {
  it("déclare INTERROMPU un run « en cours » muet depuis plus de trois minutes", () => {
    const v = buildWatchOps({
      progress: null, cockpit: null,
      run: { status: 'running', startedAt: NOW - 3_600_000, beatAt: NOW - 4 * 60_000, trigger: 'cron' },
      now: NOW,
    })
    expect(v.run?.alive).toBe(false)
    expect(v.run?.status).toBe('stopped')
  })

  it("laisse vivre un run qui vient d'écrire", () => {
    const v = buildWatchOps({
      progress: null, cockpit: null,
      run: { status: 'running', startedAt: NOW - 600_000, beatAt: NOW - 20_000, trigger: 'manual' },
      now: NOW,
    })
    expect(v.run?.alive).toBe(true)
  })
})

describe("buildWatchOps — chantier moisson", () => {
  it("donne les pages restantes ET les sites qui n'ont pas bouclé", () => {
    const v = buildWatchOps({
      progress: null,
      cockpit: {
        totalIndexed: 1_000, totalCumulMs: 0, avgProgress: 0.5,
        sitesActive: 4, sitesTotal: 4,
        counts: { active: 4, inactive: 0, total: 4 },
        sitesComplete: 1, cyclesDone: 0, slowestCycle: null,
        runAt: NOW, lastCollectAt: NOW, lastCollectDomain: 'a.fr', hasData: true,
        competitors: [],
      },
      run: null, now: NOW,
    })
    const m = v.chantiers.find((c) => c.id === 'harvest')!
    expect(m.remaining).toBe(3)      // 4 sites actifs − 1 bouclé
    expect(m.pct).toBe(50)           // avgProgress
  })

  it("n'affiche aucun chantier quand rien n'a jamais tourné", () => {
    const v = buildWatchOps({ progress: null, cockpit: null, run: null, now: NOW })
    expect(v.chantiers).toEqual([])
    expect(v.run).toBeNull()
  })
})
