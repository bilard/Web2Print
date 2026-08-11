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
    // done global 500 réparti au prorata : translate = 500 * 2000/3000 = 333
    // remaining net = 2000 - 333 = 1667
    expect(trad.remaining).toBe(1_667)
    const impr = v.chantiers.find((c) => c.id === 'improve')!
    // done global 500 réparti au prorata : improve = 500 * 1000/3000 = 167
    // remaining net = 1000 - 167 = 833
    expect(impr.remaining).toBe(833)
  })

  it("estime la durée sur le débit MESURÉ du passage", () => {
    // 500 champs en 10 minutes = 50/min ; il en reste 2 500 → 50 minutes.
    // Le passage vient d'écrire (beatAt: NOW), donc pas de staleness.
    const v = buildWatchOps({
      progress: progress({
        considered: 3_000, alreadyDone: 0, pending: { translate: 3_000 },
        done: 500, total: 3_000,
        startedAt: NOW - 600_000, beatAt: NOW, origin: 'server',
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
        startedAt: NOW - 60_000, beatAt: NOW, origin: 'server',
      }),
      cockpit: null, run: null, now: NOW,
    })
    expect(v.chantiers.find((c) => c.id === 'translate')!.etaMs).toBeNull()
  })

  it("annule etaMs et perMin si le travail s'est arrêté (beatAt > 3 minutes)", () => {
    const v = buildWatchOps({
      progress: progress({
        considered: 3_000, alreadyDone: 0, pending: { translate: 3_000 },
        done: 500, total: 3_000,
        startedAt: NOW - 600_000, beatAt: NOW - 4 * 60_000, origin: 'server',
      }),
      cockpit: null, run: null, now: NOW,
    })
    const trad = v.chantiers.find((c) => c.id === 'translate')!
    expect(trad.etaMs).toBeNull()
    expect(trad.perMin).toBeNull()
    expect(trad.stale).toBe(true)
  })

  // ⚠ L'état le plus FRÉQUENT de l'écran : la plupart du temps, rien ne tourne. Un
  // chantier fini portait quand même « passage arrêté » trois minutes après sa dernière
  // ligne — et « arrêté » se lit « interrompu » : on croyait à une panne.
  it("ne dit PAS « arrêté » d'un chantier terminé, même silencieux depuis longtemps", () => {
    const v = buildWatchOps({
      progress: progress({
        considered: 3_000, alreadyDone: 0, pending: { translate: 3_000 },
        // Tout le travail est fait : done ≥ pending ⇒ il ne reste rien.
        done: 3_000, total: 3_000,
        startedAt: NOW - 3_600_000, beatAt: NOW - 30 * 60_000, origin: 'server',
      }),
      cockpit: null, run: null, now: NOW,
    })
    const trad = v.chantiers.find((c) => c.id === 'translate')!
    expect(trad.remaining).toBe(0)
    expect(trad.pct).toBe(100)
    expect(trad.stale).toBeUndefined()
    // Et pas d'estimation FANTÔME à la place du badge : zéro restant plancherait à
    // « 1 min restantes » (cf. `etaParts`), ce qui ne vaudrait pas mieux que « arrêté ».
    expect(trad.etaMs).toBeNull()
  })

  // ⚠⚠ Mesuré en prod : 504 champs sur 207 802, plafond de dépense atteint, à CHAQUE run.
  // L'écran criait « PASSAGE ARRÊTÉ » en orange sur un traitement parfaitement sain. Le
  // passage publie désormais POURQUOI il rend la main, et seul le silence inexpliqué reste
  // une anomalie.
  it("ne dit PAS « arrêté » d'un passage qui a dit pourquoi il s'arrête", () => {
    const texts = {
      considered: 300_000, alreadyDone: 90_000, pending: { translate: 207_802 },
      done: 504, total: 207_802,
      startedAt: NOW - 20 * 60_000, beatAt: NOW - 15 * 60_000, origin: 'server' as const,
    }
    const said = buildWatchOps({
      progress: progress({ ...texts, stoppedBy: 'spend' }), cockpit: null, run: null, now: NOW,
    }).chantiers.find((c) => c.id === 'translate')!
    expect(said.stale).toBeUndefined()
    expect(said.stoppedBy).toBe('spend')
    // Pas d'estimation pour autant : rien n'écrit plus, la fin ne viendra qu'au prochain run.
    expect(said.etaMs).toBeNull()
    expect(said.perMin).toBeNull()

    // Le MÊME silence, sans raison publiée, reste une panne à signaler.
    const mute = buildWatchOps({
      progress: progress(texts), cockpit: null, run: null, now: NOW,
    }).chantiers.find((c) => c.id === 'translate')!
    expect(mute.stale).toBe(true)
    expect(mute.stoppedBy).toBeUndefined()
  })

  it("ne dit RIEN d'une raison d'arrêt sur un chantier qui n'a plus rien à faire", () => {
    const v = buildWatchOps({
      progress: progress({
        considered: 3_000, alreadyDone: 0, pending: { translate: 3_000 },
        done: 3_000, total: 3_000, stoppedBy: 'deadline',
        startedAt: NOW - 3_600_000, beatAt: NOW - 30 * 60_000, origin: 'server',
      }),
      cockpit: null, run: null, now: NOW,
    })
    const trad = v.chantiers.find((c) => c.id === 'translate')!
    expect(trad.stoppedBy).toBeUndefined()
    expect(trad.stale).toBeUndefined()
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
    const trad = v.chantiers.find((c) => c.id === 'translate')!
    expect(trad.byLang).toEqual([
      { lang: 'de', count: 60 }, { lang: null, count: 40 },
    ])
    // Le chantier ne porte plus reasons — c'est global à WatchOpsView.textsReasons
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
        totalPages: 3_400, lastPassProducts: 814, lastPassPages: 35, sitesCollecting: 2,
        competitors: [],
      },
      run: null, now: NOW,
    })
    const m = v.chantiers.find((c) => c.id === 'harvest')!
    expect(m.remaining).toBe(3)      // 4 sites actifs − 1 bouclé
    expect(m.pct).toBe(50)           // avgProgress
  })

  // ⚠⚠ Mesuré dans les traces d'un run réel : « +3 500 produit(s) sur 35 page(s) »,
  // « +2 030 », « +1 641 »… ~14 000 fiches collectées. La carte n'affichait que
  // « 21 sites bouclés · 63 % · 1 en cours » — trois nombres identiques d'un run à l'autre,
  // d'où « on ne voit rien avancer ». Les volumes existaient en base, live, non affichés.
  it("dit les VOLUMES réels de la moisson, pas seulement des sites", () => {
    const v = buildWatchOps({
      progress: null,
      cockpit: {
        totalIndexed: 440_173, totalCumulMs: 0, avgProgress: 0.63,
        sitesActive: 14, sitesTotal: 23,
        counts: { active: 14, inactive: 9, total: 23 },
        sitesComplete: 21, cyclesDone: 1, slowestCycle: null,
        runAt: NOW, lastCollectAt: NOW, lastCollectDomain: 'a.fr', hasData: true,
        totalPages: 26_038, lastPassProducts: 14_040, lastPassPages: 350, sitesCollecting: 3,
        competitors: [],
      },
      run: null, now: NOW,
    })
    const facts = v.chantiers.find((c) => c.id === 'harvest')!.facts!
    expect(facts).toEqual([
      { key: 'indexed', value: 440_173 },
      { key: 'pages', value: 26_038 },
      { key: 'lastPassProducts', value: 14_040 },
      { key: 'collecting', value: 3 },
    ])
  })

  it("ne fabrique pas de volume à zéro — un chiffre nul n'apprend rien", () => {
    const v = buildWatchOps({
      progress: null,
      cockpit: {
        totalIndexed: 12, totalCumulMs: 0, avgProgress: 0, sitesActive: 1, sitesTotal: 1,
        counts: { active: 1, inactive: 0, total: 1 },
        sitesComplete: 0, cyclesDone: 0, slowestCycle: null,
        runAt: NOW, lastCollectAt: NOW, lastCollectDomain: null, hasData: true,
        totalPages: 0, lastPassProducts: 0, lastPassPages: 0, sitesCollecting: 0,
        competitors: [],
      },
      run: null, now: NOW,
    })
    expect(v.chantiers.find((c) => c.id === 'harvest')!.facts).toEqual([{ key: 'indexed', value: 12 }])
  })

  it("montre ce que le passage de textes a EXAMINÉ et ce que la mémoire a épargné", () => {
    const v = buildWatchOps({
      progress: progress({
        considered: 231_630, alreadyDone: 23_828, pending: { translate: 207_802 },
        done: 504, total: 207_802, startedAt: NOW - 60_000, beatAt: NOW, origin: 'server',
      }),
      cockpit: null, run: null, now: NOW,
    })
    expect(v.chantiers.find((c) => c.id === 'translate')!.facts).toEqual([
      { key: 'considered', value: 231_630 },
      { key: 'alreadyDone', value: 23_828 },
    ])
  })

  it("n'affiche aucun chantier quand rien n'a jamais tourné", () => {
    const v = buildWatchOps({ progress: null, cockpit: null, run: null, now: NOW })
    expect(v.chantiers).toEqual([])
    expect(v.run).toBeNull()
  })
})
