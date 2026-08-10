# Module « Suivi » de la veille tarifaire — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner un écran qui répond en direct à « qu'est-ce qui tourne, qu'est-ce qui est terminé, qu'est-ce qu'il reste » pour la moisson, la traduction et l'amélioration des textes d'un suivi tarifaire.

**Architecture:** Trois sources lues en `onSnapshot` et agrégées par une fonction pure : les métas `competitors/{siteId}` (moisson, déjà écrites), un nouveau document de progression écrit par le node « Textes » et son jumeau serveur, et le document d'état live du run. Le run navigateur, aujourd'hui invisible en base, publie désormais un battement dans ce même document d'état live.

**Tech Stack:** React 18, TypeScript strict, Zustand, Firebase Firestore (client SDK + firebase-admin côté Functions), Vitest, Tailwind v3 + shadcn/ui.

## Global Constraints

- **Réponses et libellés en français**, puis portés en anglais **britannique** et en espagnol (tâche 12). Aucun texte en dur dans `src/**`.
- **Jamais de `t()` en constante de module** — la langue serait figée au chargement. Toujours dans le corps du composant/de la fonction.
- **Théming par tokens** : `bg-background` / `bg-surface` / `bg-surface-2` / `bg-well`, jamais d'hex sombre en dur. `white` = avant-plan thémable ; blanc véritable = `text-[#fff]`.
- **Composants ≤ 150 lignes.** Aucune logique métier dans un composant.
- **Aucun cache de données** : `onSnapshot` uniquement, pas de mise en cache React Query des documents live.
- **Traces de debug** : `debugLog` de `src/lib/debugLog.ts`, jamais `console.log` dans `src/**`. `console.warn` / `error` restent permis pour de vraies anomalies. Les Cloud Functions gardent `console`.
- **Vérification des types : `npx tsc -b`** — le projet utilise des project references, `tsc --noEmit` ne vérifie rien.
- **Lint à 0 warning** (`npm run lint`), **code mort à 0** (`npm run dead`), **cycles à 0** (`npm run cycles`). Un symbole utilisé seulement dans son fichier ne doit **pas** être exporté.
- **Ne jamais charger un `StoredReport` complet ni le catalogue source pour agréger** : un rapport dépasse 1 Mo et a déjà saturé la mémoire du cron. L'agrégation se fait depuis les petits documents de méta.
- **Tout compteur publié côté client doit l'être à l'identique côté serveur**, avec un test de parité (patron : `src/features/priceWatch/catalog/matrixTwinParity.test.ts`).
- Tests : `npm run test:run -- <chemin>`.

---

### Task 1 : Le document de progression — types

**Files:**
- Create: `src/features/priceWatch/ops/opsTypes.ts`
- Modify: `src/features/priceWatch/paths.ts` (ajout de deux chemins)
- Test: aucun (types purs + constructeurs de chemin triviaux ; couverts par la tâche 2)

**Interfaces:**
- Consomme : `EnrichKind` de `src/features/textEnrich/revision.ts` (`'translate' | 'improve' | 'structure'`)
- Produit : `WatchOpsProgress`, `TextsProgress`, `WatchIncident`, `opsProgressDoc()`, `opsIncidentsCol()`, `OPS_INCIDENT_MAX_AGE_MS`

- [ ] **Step 1 : Écrire les types**

Créer `src/features/priceWatch/ops/opsTypes.ts` :

```ts
// Ce que les nodes PUBLIENT de leur avancement, et ce que l'écran « Suivi » relit.
//
// ⚠ Un document minuscule, écrit au fil de l'eau. Le « reste à traduire » ne se recalcule
// PAS à l'ouverture de l'écran : il faudrait relire le catalogue source (jusqu'à 433 k
// fiches), c'est-à-dire le chemin exact qui a déjà saturé la mémoire du cron.
import type { EnrichKind } from '@/features/textEnrich/revision'

/** Avancement du chantier TEXTES (traduction, amélioration, structuration). */
export interface TextsProgress {
  /** Champs EXAMINÉS au dernier passage — le dénominateur honnête. */
  considered: number
  /** Champs sautés parce que déjà traités. */
  alreadyDone: number
  /** Champs retenus pour ce passage, ventilés par nature de travail. */
  pending: Partial<Record<EnrichKind, number>>
  /**
   * Ventilation par langue des champs restant à TRADUIRE. Absent hors traduction.
   * `lang: null` = le détecteur s'est abstenu ; jamais fondu dans le français.
   */
  byLang?: { lang: string | null; count: number }[]
  /**
   * Motif d'entrée dans la file : jamais traité (`fresh`) ou texte source modifié
   * depuis (`stale`). Absent en mode PIM, qui ne rend pas cette ventilation —
   * l'écran dit alors « non ventilé » plutôt que d'afficher un faux zéro.
   */
  reasons?: { fresh: number; stale: number }
  /** Avancement du passage EN COURS. */
  done: number
  total: number
  /** Début du passage, et dernière écriture — un passage muet est un passage mort. */
  startedAt: number
  beatAt: number
  /** Qui écrit : le navigateur ou le cron. */
  origin: 'client' | 'server'
}

/** Le document `.../ops/progress` d'un suivi. */
export interface WatchOpsProgress {
  updatedAt: number
  texts?: TextsProgress
}

/** Une panne, telle qu'on veut la relire des semaines plus tard. */
export interface WatchIncident {
  ts: number
  /** Domaine du concurrent en cause, quand l'incident en désigne un. */
  domain?: string
  /** Carte du flux qui a signalé la panne. */
  nodeLabel?: string
  message: string
  runId?: string
  origin: 'client' | 'server'
}

/** Au-delà, un incident ne renseigne plus personne et encombre la collection. */
export const OPS_INCIDENT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
```

- [ ] **Step 2 : Ajouter les chemins Firestore**

Dans `src/features/priceWatch/paths.ts`, à la suite de `textRevisionsCol` :

```ts
/** Avancement publié par les nodes — un document par suivi, quelques centaines d'octets. */
export const opsProgressDoc = (uid: string, watchId: string) =>
  `${watchDoc(uid, watchId)}/ops/progress`

/** Journal des pannes. ⚠ Une COLLECTION : les chemins Firestore alternent collection et
 *  document, on ne peut pas ajouter d'entrées dans `.../ops/incidents`. */
export const opsIncidentsCol = (uid: string, watchId: string) =>
  `${watchDoc(uid, watchId)}/opsIncidents`
```

- [ ] **Step 3 : Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/features/priceWatch/ops/opsTypes.ts src/features/priceWatch/paths.ts
git commit -m "feat(suivi): la forme de ce qu'un node publie de son avancement"
```

---

### Task 2 : `buildWatchOps` — la fonction pure qui fait l'écran

**Files:**
- Create: `src/features/priceWatch/ops/buildWatchOps.ts`
- Test: `src/features/priceWatch/ops/buildWatchOps.test.ts`

**Interfaces:**
- Consomme : `WatchOpsProgress` (Task 1), `OpsCockpit` de `../dashboard/opsMetrics`, `RunSummary`/`RunLiveDoc` de `../radar/runLive`
- Produit : `buildWatchOps(input: WatchOpsInput): WatchOpsView`, `Chantier`, `WatchOpsView`

> **Contexte pour l'implémenteur.** Trois pièges déjà payés dans ce dépôt, que cette
> fonction doit respecter :
> 1. Un run marqué `running` **ment** quand la Cloud Function est tuée. Le seul signe de
>    vie est qu'il **écrit**. Silence > 3 min ⇒ interrompu.
> 2. Une estimation de durée fondée sur une part qui compte le travail *en cours* annonce
>    mécaniquement « restant = écoulé » à mi-parcours. Elle se calcule sur le **terminé**.
> 3. Sous 10 % accompli, une estimation ne vaut rien : on ne l'affiche pas.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/features/priceWatch/ops/buildWatchOps.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { buildWatchOps } from './buildWatchOps'
import type { WatchOpsProgress } from './opsTypes'

const NOW = 1_700_000_000_000

const progress = (texts: WatchOpsProgress['texts']): WatchOpsProgress => ({ updatedAt: NOW, texts })

describe('buildWatchOps — chantier textes', () => {
  it('sépare traduction et amélioration, et donne le reste de chacun', () => {
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

  it('estime la durée sur le débit MESURÉ du passage', () => {
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

  it('n’estime RIEN sous 10 % accompli — un chiffre inventé vaut moins que pas de chiffre', () => {
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

  it('range l’indéterminé à part, jamais avec le français', () => {
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

describe('buildWatchOps — vie et mort du run', () => {
  it('déclare INTERROMPU un run « en cours » muet depuis plus de trois minutes', () => {
    const v = buildWatchOps({
      progress: null, cockpit: null,
      run: { status: 'running', startedAt: NOW - 3_600_000, beatAt: NOW - 4 * 60_000, trigger: 'cron' },
      now: NOW,
    })
    expect(v.run?.alive).toBe(false)
    expect(v.run?.status).toBe('stopped')
  })

  it('laisse vivre un run qui vient d’écrire', () => {
    const v = buildWatchOps({
      progress: null, cockpit: null,
      run: { status: 'running', startedAt: NOW - 600_000, beatAt: NOW - 20_000, trigger: 'manual' },
      now: NOW,
    })
    expect(v.run?.alive).toBe(true)
  })
})

describe('buildWatchOps — chantier moisson', () => {
  it('donne les pages restantes ET les sites qui n’ont pas bouclé', () => {
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

  it('n’affiche aucun chantier quand rien n’a jamais tourné', () => {
    const v = buildWatchOps({ progress: null, cockpit: null, run: null, now: NOW })
    expect(v.chantiers).toEqual([])
    expect(v.run).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

Run: `npm run test:run -- src/features/priceWatch/ops/buildWatchOps.test.ts`
Expected: FAIL — `buildWatchOps` n'existe pas.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/features/priceWatch/ops/buildWatchOps.ts` :

```ts
// Ce que l'écran « Suivi » AFFICHE, dérivé des documents. PUR.
//
// ⚠ Aucune lecture de rapport ni de catalogue ici : un rapport dépasse 1 Mo et a déjà
// saturé la mémoire du cron. On n'agrège que de petits documents de méta.
import type { OpsCockpit } from '../dashboard/opsMetrics'
import type { WatchOpsProgress } from './opsTypes'

/**
 * Silence au-delà duquel un run n'est plus vivant.
 *
 * ⚠ Le statut ne prouve rien : une Cloud Function tuée laisse `running` pour toujours.
 * Ce qui prouve qu'un run vit, c'est qu'il ÉCRIT. Même valeur que `LIVE_BEAT_MS` de
 * `workflows/runtime/useServerRunLive` — surtout ne pas inventer un troisième seuil, deux
 * écrans se contrediraient sur « est-ce que ça tourne ».
 */
export const OPS_BEAT_MS = 3 * 60_000

/** Sous ce niveau d'avancement, toute estimation de durée est une invention. */
const ETA_FLOOR = 0.1

export interface RunSnapshot {
  status: string
  startedAt: number
  /** Dernière écriture, quelle qu'elle soit. */
  beatAt: number
  trigger: string | null
}

export interface RunView {
  status: string
  trigger: string | null
  alive: boolean
  startedAt: number
  elapsedMs: number
}

export type ChantierId = 'harvest' | 'translate' | 'improve' | 'structure'

export interface Chantier {
  id: ChantierId
  /** Ce qui est fait — fiches, champs ou sites selon le chantier. */
  done: number
  /** Ce qu'il reste. */
  remaining: number
  /** 0 → 100. */
  pct: number
  /** Durée estimée, ou null quand elle ne vaudrait rien. */
  etaMs: number | null
  /** Débit mesuré (unités/minute), null avant la première minute. */
  perMin: number | null
  /** Ventilation par langue — traduction seulement. */
  byLang?: { lang: string | null; count: number }[]
  /** Jamais traité / texte source modifié depuis. Absent quand la source ne le dit pas. */
  reasons?: { fresh: number; stale: number }
}

export interface WatchOpsView {
  run: RunView | null
  chantiers: Chantier[]
  /** Dernière écriture d'avancement, tous chantiers confondus. */
  lastBeatAt: number | null
}

export interface WatchOpsInput {
  progress: WatchOpsProgress | null
  cockpit: OpsCockpit | null
  run: RunSnapshot | null
  now: number
}

/** Durée restante extrapolée sur le débit MESURÉ, jamais sur une part incluant le travail
 *  en cours — celle-ci annoncerait « restant = écoulé » à mi-parcours. */
function eta(done: number, remaining: number, elapsedMs: number): number | null {
  const total = done + remaining
  if (total === 0 || elapsedMs <= 0) return null
  if (done / total < ETA_FLOOR) return null
  const perMs = done / elapsedMs
  return perMs > 0 ? Math.round(remaining / perMs) : null
}

function pctOf(done: number, remaining: number): number {
  const total = done + remaining
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

function textChantiers(p: WatchOpsProgress, now: number): Chantier[] {
  const t = p.texts
  if (!t) return []
  const elapsedMs = Math.max(0, (t.beatAt || now) - t.startedAt)
  const out: Chantier[] = []
  for (const [kind, remaining] of Object.entries(t.pending)) {
    if (!remaining) continue
    const id = kind as ChantierId
    // `done` du passage est global aux natures de travail : on l'attribue au prorata,
    // faute de compteur par nature — et on le DIT plutôt que d'inventer un chiffre exact.
    const share = remaining / Object.values(t.pending).reduce((n, v) => n + (v ?? 0), 0)
    const done = Math.round(t.done * share)
    out.push({
      id, done, remaining: Math.max(0, remaining - done),
      pct: pctOf(done, Math.max(0, remaining - done)),
      etaMs: eta(done, Math.max(0, remaining - done), elapsedMs),
      perMin: elapsedMs >= 60_000 && done > 0 ? Math.round(done / (elapsedMs / 60_000)) : null,
      ...(id === 'translate' && t.byLang ? { byLang: t.byLang } : {}),
      ...(t.reasons ? { reasons: t.reasons } : {}),
    })
  }
  return out
}

function harvestChantier(c: OpsCockpit, now: number): Chantier | null {
  if (!c.hasData && c.sitesActive === 0) return null
  const done = c.sitesComplete
  const remaining = Math.max(0, c.sitesActive - c.sitesComplete)
  const elapsedMs = c.lastCollectAt ? Math.max(0, now - c.lastCollectAt) : 0
  return {
    id: 'harvest', done, remaining,
    // ⚠ Le pourcentage vient du BALAYAGE moyen, pas du compte de sites : un site à moitié
    // moissonné avance, et un écran qui reste à 0 % pendant vingt minutes fait croire à
    // un blocage.
    pct: Math.round(c.avgProgress * 100),
    etaMs: eta(done, remaining, elapsedMs),
    perMin: null,
  }
}

export function buildWatchOps(input: WatchOpsInput): WatchOpsView {
  const { progress, cockpit, run, now } = input
  const chantiers: Chantier[] = []
  if (cockpit) {
    const h = harvestChantier(cockpit, now)
    if (h) chantiers.push(h)
  }
  if (progress) chantiers.push(...textChantiers(progress, now))

  const runView: RunView | null = run
    ? (() => {
        const alive = run.status === 'running' && now - run.beatAt <= OPS_BEAT_MS
        return {
          // Un run périmé n'est ni un succès ni un échec : interrompu.
          status: run.status === 'running' && !alive ? 'stopped' : run.status,
          trigger: run.trigger, alive,
          startedAt: run.startedAt,
          elapsedMs: Math.max(0, now - run.startedAt),
        }
      })()
    : null

  const beats = [progress?.texts?.beatAt, cockpit?.lastCollectAt].filter(
    (v): v is number => typeof v === 'number',
  )
  return {
    run: runView, chantiers,
    lastBeatAt: beats.length ? Math.max(...beats) : null,
  }
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `npm run test:run -- src/features/priceWatch/ops/buildWatchOps.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5 : Vérifier les types**

Run: `npx tsc -b`
Expected: aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/features/priceWatch/ops/buildWatchOps.ts src/features/priceWatch/ops/buildWatchOps.test.ts
git commit -m "feat(suivi): fait, reste, durée estimée — sans jamais relire le catalogue"
```

---

### Task 3 : Publier les compteurs de textes (client) — écriture espacée

**Files:**
- Create: `src/features/priceWatch/ops/progressStore.ts`
- Test: `src/features/priceWatch/ops/progressStore.test.ts`

**Interfaces:**
- Consomme : `WatchOpsProgress`, `TextsProgress`, `opsProgressDoc` (Task 1)
- Produit : `shouldPublish(lastAt, now, force)`, `publishTextsProgress(uid, watchId, texts, opts?)`, `OPS_WRITE_INTERVAL_MS`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/features/priceWatch/ops/progressStore.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { shouldPublish, OPS_WRITE_INTERVAL_MS } from './progressStore'

describe('shouldPublish — un run d’une heure ne doit pas écrire des milliers de fois', () => {
  it('publie la première fois', () => {
    expect(shouldPublish(0, 1_000, false)).toBe(true)
  })

  it('se tait avant l’intervalle', () => {
    expect(shouldPublish(1_000, 1_000 + OPS_WRITE_INTERVAL_MS - 1, false)).toBe(false)
  })

  it('publie une fois l’intervalle écoulé', () => {
    expect(shouldPublish(1_000, 1_000 + OPS_WRITE_INTERVAL_MS, false)).toBe(true)
  })

  it('publie TOUJOURS quand on force — la fin d’un passage ne s’attend pas', () => {
    expect(shouldPublish(1_000, 1_001, true)).toBe(true)
  })
})
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm run test:run -- src/features/priceWatch/ops/progressStore.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/features/priceWatch/ops/progressStore.ts` :

```ts
// Publication de l'avancement des textes, côté NAVIGATEUR.
//
// ⚠ Jumeau serveur obligatoire : `functions/src/priceWatch/opsProgress.ts`. Un compteur
// publié ici et pas là-bas ferait mentir l'écran uniquement la nuit — le pire des
// mensonges, celui qu'on ne constate jamais en travaillant.
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { opsProgressDoc } from '../paths'
import type { TextsProgress } from './opsTypes'

/** Une écriture au plus toutes les dix secondes. */
export const OPS_WRITE_INTERVAL_MS = 10_000

/** PUR — testable sans Firestore. `force` sert la première et la dernière écriture d'un
 *  passage : celles-là ne s'attendent pas, ce sont les seules qu'on regarde. */
export function shouldPublish(lastAt: number, now: number, force: boolean): boolean {
  return force || lastAt === 0 || now - lastAt >= OPS_WRITE_INTERVAL_MS
}

let lastAt = 0

/** Écrit l'avancement. Fire-and-forget : un échec ne doit jamais perturber le passage. */
export async function publishTextsProgress(
  uid: string, watchId: string, texts: TextsProgress, opts: { force?: boolean } = {},
): Promise<void> {
  const now = Date.now()
  if (!shouldPublish(lastAt, now, opts.force === true)) return
  lastAt = now
  try {
    await setDoc(doc(db, opsProgressDoc(uid, watchId)), { updatedAt: now, texts }, { merge: true })
  } catch (e) {
    console.warn('[suivi] publication de l’avancement refusée :', e)
  }
}

/** Remet le compteur d'espacement à zéro — un nouveau passage publie immédiatement. */
export function resetPublishThrottle(): void { lastAt = 0 }
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:run -- src/features/priceWatch/ops/progressStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/features/priceWatch/ops/progressStore.ts src/features/priceWatch/ops/progressStore.test.ts
git commit -m "feat(suivi): le navigateur publie son avancement, sans noyer Firestore"
```

---

### Task 4 : Le jumeau serveur de la publication

**Files:**
- Create: `functions/src/priceWatch/opsProgress.ts`
- Test: `functions/src/priceWatch/opsProgressParity.test.ts`

**Interfaces:**
- Consomme : rien du client (duplication assumée, comme les autres jumeaux du dépôt)
- Produit : `shouldPublish(lastAt, now, force)`, `publishTextsProgress(uid, watchId, texts, opts?)`, `OPS_WRITE_INTERVAL_MS`, `TextsProgress` (même forme qu'en Task 1)

> **Pourquoi une copie et pas un import partagé.** Les Functions et l'app ne compilent pas
> ensemble (deux `tsconfig`, deux SDK Firebase — `firebase-admin` contre le SDK web). Le
> dépôt règle cela partout par un jumeau plus un **test de parité**. Suivre ce patron :
> `src/features/priceWatch/catalog/matrixTwinParity.test.ts`.

- [ ] **Step 1 : Écrire le test de parité qui échoue**

Créer `functions/src/priceWatch/opsProgressParity.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { shouldPublish as serverShould, OPS_WRITE_INTERVAL_MS as SERVER_MS } from './opsProgress'
import { shouldPublish as clientShould, OPS_WRITE_INTERVAL_MS as CLIENT_MS } from '../../../src/features/priceWatch/ops/progressStore'

describe('parité client ↔ serveur de la publication d’avancement', () => {
  it('même intervalle des deux côtés', () => {
    expect(SERVER_MS).toBe(CLIENT_MS)
  })

  it('même décision, sur les mêmes entrées', () => {
    const cases: [number, number, boolean][] = [
      [0, 1_000, false], [1_000, 1_005, false], [1_000, 1_000 + SERVER_MS, false], [1_000, 1_001, true],
    ]
    for (const [last, now, force] of cases) {
      expect(serverShould(last, now, force)).toBe(clientShould(last, now, force))
    }
  })
})
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm run test:run -- functions/src/priceWatch/opsProgressParity.test.ts`
Expected: FAIL — `./opsProgress` introuvable.

- [ ] **Step 3 : Écrire le jumeau**

Créer `functions/src/priceWatch/opsProgress.ts` :

```ts
// functions/src/priceWatch/opsProgress.ts
// Jumeau SERVEUR de `src/features/priceWatch/ops/progressStore.ts`. Toute modification
// ici doit être faite là-bas — le test de parité échoue sinon, et c'est son rôle.
import { getFirestore } from 'firebase-admin/firestore'
import type { EnrichKind } from '../textEnrich/revision'

export const OPS_WRITE_INTERVAL_MS = 10_000

export interface TextsProgress {
  considered: number
  alreadyDone: number
  pending: Partial<Record<EnrichKind, number>>
  byLang?: { lang: string | null; count: number }[]
  reasons?: { fresh: number; stale: number }
  done: number
  total: number
  startedAt: number
  beatAt: number
  origin: 'client' | 'server'
}

export function shouldPublish(lastAt: number, now: number, force: boolean): boolean {
  return force || lastAt === 0 || now - lastAt >= OPS_WRITE_INTERVAL_MS
}

let lastAt = 0

export async function publishTextsProgress(
  uid: string, watchId: string, texts: TextsProgress, opts: { force?: boolean } = {},
): Promise<void> {
  const now = Date.now()
  if (!shouldPublish(lastAt, now, opts.force === true)) return
  lastAt = now
  try {
    await getFirestore()
      .doc(`users/${uid}/priceWatch/${watchId}/ops/progress`)
      .set({ updatedAt: now, texts }, { merge: true })
  } catch (e) {
    console.warn('[suivi] publication de l’avancement refusée :', e)
  }
}

export function resetPublishThrottle(): void { lastAt = 0 }
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:run -- functions/src/priceWatch/opsProgressParity.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5 : Commit**

```bash
git add functions/src/priceWatch/opsProgress.ts functions/src/priceWatch/opsProgressParity.test.ts
git commit -m "feat(suivi): le cron publie le même avancement que le navigateur"
```

---

### Task 5 : Brancher le node « Textes » sur la publication

**Files:**
- Modify: `src/features/workflows/registry/textEnrichNode.ts` (après le calcul de `units`/`counts`, ~ligne 197 ; et dans `onChunkDone`, ~ligne 335)
- Create: `src/features/priceWatch/ops/textsSnapshot.ts`
- Test: `src/features/priceWatch/ops/textsSnapshot.test.ts`

**Interfaces:**
- Consomme : `EnrichUnit` de `@/features/textEnrich/pass`, `TextsProgress` (Task 1)
- Produit : `textsSnapshot(args): TextsProgress`

> **Pourquoi un module séparé pour le calcul.** `textEnrichNode.ts` fait déjà 453 lignes.
> On y ajoute deux appels, pas de la logique.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/features/priceWatch/ops/textsSnapshot.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { textsSnapshot } from './textsSnapshot'

const unit = (kind: 'translate' | 'improve', text: string) =>
  ({ plan: { kind }, text } as Parameters<typeof textsSnapshot>[0]['units'][number])

describe('textsSnapshot', () => {
  it('ventile les unités par nature de travail', () => {
    const s = textsSnapshot({
      units: [unit('translate', 'Bohrmaschine mit Schlagfunktion'), unit('improve', 'Perceuse')],
      considered: 100, alreadyDone: 80, done: 0, startedAt: 5, now: 5, origin: 'client',
    })
    expect(s.pending).toEqual({ translate: 1, improve: 1 })
    expect(s.total).toBe(2)
  })

  it('ventile les langues des seules unités à TRADUIRE', () => {
    const s = textsSnapshot({
      units: [unit('translate', 'Bohrmaschine mit Schlagfunktion und Koffer'), unit('improve', 'Perceuse à percussion')],
      considered: 2, alreadyDone: 0, done: 0, startedAt: 5, now: 5, origin: 'client',
    })
    expect(s.byLang?.reduce((n, l) => n + l.count, 0)).toBe(1)
  })

  it('omet la ventilation par motif quand la source ne la donne pas', () => {
    const s = textsSnapshot({
      units: [], considered: 0, alreadyDone: 0, done: 0, startedAt: 5, now: 5, origin: 'server',
    })
    expect(s.reasons).toBeUndefined()
  })

  it('porte la ventilation par motif quand elle est fournie', () => {
    const s = textsSnapshot({
      units: [], considered: 0, alreadyDone: 0, done: 0, startedAt: 5, now: 5, origin: 'server',
      reasons: { fresh: 12, stale: 3 },
    })
    expect(s.reasons).toEqual({ fresh: 12, stale: 3 })
  })
})
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm run test:run -- src/features/priceWatch/ops/textsSnapshot.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/features/priceWatch/ops/textsSnapshot.ts` :

```ts
// Ce qu'un passage de textes publie de lui-même. PUR.
import { detectLanguage } from '@/features/textEnrich/detectLang'
import { langBreakdown } from '../textEnrich/langBreakdown'
import type { EnrichUnit } from '@/features/textEnrich/pass'
import type { TextsProgress } from './opsTypes'

export interface TextsSnapshotInput {
  units: EnrichUnit[]
  considered: number
  alreadyDone: number
  done: number
  startedAt: number
  now: number
  origin: 'client' | 'server'
  /** Jamais traité / source modifiée depuis. Le mode PIM ne le rend pas : on l'omet
   *  plutôt que d'écrire deux zéros, qui se liraient comme « rien à faire ». */
  reasons?: { fresh: number; stale: number }
}

export function textsSnapshot(input: TextsSnapshotInput): TextsProgress {
  const pending: TextsProgress['pending'] = {}
  for (const u of input.units) {
    const k = u.plan.kind
    pending[k] = (pending[k] ?? 0) + 1
  }
  // ⚠ Langues des seules unités à TRADUIRE : ailleurs la langue ne décide de rien, et la
  // calculer sur des centaines de milliers de champs serait du travail perdu.
  const toTranslate = input.units.filter((u) => u.plan.kind === 'translate')
  const byLang = toTranslate.length
    ? langBreakdown(toTranslate.map((u) => detectLanguage(u.text).lang ?? null))
    : undefined

  return {
    considered: input.considered,
    alreadyDone: input.alreadyDone,
    pending,
    ...(byLang ? { byLang } : {}),
    ...(input.reasons ? { reasons: input.reasons } : {}),
    done: input.done,
    total: input.units.length,
    startedAt: input.startedAt,
    beatAt: input.now,
    origin: input.origin,
  }
}
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:run -- src/features/priceWatch/ops/textsSnapshot.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Brancher le node**

Dans `src/features/workflows/registry/textEnrichNode.ts` :

Imports à ajouter en tête de fichier :

```ts
import { textsSnapshot } from '@/features/priceWatch/ops/textsSnapshot'
import { publishTextsProgress, resetPublishThrottle } from '@/features/priceWatch/ops/progressStore'
```

Juste après le `ctx.log('info', t('run.textEnrich.planned', …))` (~ligne 205), insérer :

```ts
    // Publie le volume RÉEL dès qu'il est connu — avant le premier appel au modèle. Sans
    // cette première écriture, l'écran « Suivi » reste vide pendant les minutes de
    // chiffrage, précisément quand on vient voir si quelque chose a démarré.
    const opsWatchId = resolveSitesInput(inputs.sites, {
      sitesText: '', watchIdRaw: config.watchId ?? '', workflowId: ctx.workflowId,
    }).watchId
    const opsUid = getWorkspaceUid()
    const opsStartedAt = Date.now()
    const publishOps = (doneUnits: number, force = false) => {
      if (!opsUid || !opsWatchId) return
      void publishTextsProgress(opsUid, opsWatchId, textsSnapshot({
        units, considered: counts.considered, alreadyDone: counts.skipped['already-done'],
        done: doneUnits, startedAt: opsStartedAt, now: Date.now(), origin: 'client',
        ...(memoryOn
          ? { reasons: {
              fresh: decisions.filter((d) => d.reason === 'new').length,
              stale: decisions.filter((d) => d.reason === 'changed').length,
            } }
          : {}),
      }), { force })
    }
    resetPublishThrottle()
    publishOps(0, true)
```

Dans `onChunkDone` (~ligne 335), après la ligne de journal existante, ajouter :

```ts
          publishOps(done, done >= total)
```

- [ ] **Step 6 : Vérifier**

Run: `npx tsc -b && npm run lint && npm run test:run -- src/features/workflows/registry/`
Expected: aucune erreur, tests du registre au vert.

- [ ] **Step 7 : Commit**

```bash
git add src/features/priceWatch/ops/textsSnapshot.ts src/features/priceWatch/ops/textsSnapshot.test.ts src/features/workflows/registry/textEnrichNode.ts
git commit -m "feat(suivi): le passage de textes DIT ce qu'il lui reste, dès le chiffrage"
```

---

### Task 6 : Le même branchement côté serveur

**Files:**
- Create: `functions/src/priceWatch/textsSnapshot.ts`
- Modify: `functions/src/workflow/nodes/` — le node « Textes » serveur (localiser avec `grep -rln "text-enrich" functions/src/workflow/nodes/`)
- Test: `functions/src/priceWatch/textsSnapshotParity.test.ts`

**Interfaces:**
- Produit : `textsSnapshot(input): TextsProgress`, signature identique à la Task 5

- [ ] **Step 1 : Localiser le node serveur**

Run: `grep -rln "text-enrich" functions/src/workflow/nodes/`
Noter le fichier — il est appelé `<fichier>` dans les étapes suivantes.

- [ ] **Step 2 : Écrire le test de parité qui échoue**

Créer `functions/src/priceWatch/textsSnapshotParity.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { textsSnapshot as server } from './textsSnapshot'
import { textsSnapshot as client } from '../../../src/features/priceWatch/ops/textsSnapshot'

const units = [
  { plan: { kind: 'translate' }, text: 'Bohrmaschine mit Schlagfunktion und Koffer' },
  { plan: { kind: 'improve' }, text: 'Perceuse à percussion livrée en coffret' },
] as never[]

describe('parité client ↔ serveur de l’instantané de textes', () => {
  it('rend exactement le même objet', () => {
    const args = {
      units, considered: 10, alreadyDone: 4, done: 1,
      startedAt: 1_000, now: 61_000, origin: 'server' as const,
    }
    expect(server(args)).toEqual(client({ ...args, origin: 'server' }))
  })
})
```

- [ ] **Step 3 : Lancer le test pour le voir échouer**

Run: `npm run test:run -- functions/src/priceWatch/textsSnapshotParity.test.ts`
Expected: FAIL — `./textsSnapshot` introuvable.

- [ ] **Step 4 : Écrire le jumeau**

Créer `functions/src/priceWatch/textsSnapshot.ts` : copie mot pour mot de
`src/features/priceWatch/ops/textsSnapshot.ts` (Task 5, étape 3), avec ces seuls
changements d'imports :

```ts
import { detectLanguage } from '../textEnrich/detectLang'
import { langBreakdown } from './langBreakdown'
import type { EnrichUnit } from '../textEnrich/pass'
import type { TextsProgress } from './opsProgress'
```

Si `functions/src/priceWatch/langBreakdown.ts` n'existe pas, le créer en copiant
`src/features/priceWatch/textEnrich/langBreakdown.ts` (fichier sans dépendance, copie
littérale) et ajouter un test de parité sur le même modèle.

- [ ] **Step 5 : Brancher le node serveur**

Dans `<fichier>` repéré à l'étape 1, aux deux mêmes endroits que côté client (après le
chiffrage du passage, et dans le rappel de progression), insérer les appels — identiques à
la Task 5 étape 5, avec `origin: 'server'`, l'uid du run serveur au lieu de
`getWorkspaceUid()`, et les imports `../../priceWatch/textsSnapshot` /
`../../priceWatch/opsProgress`.

- [ ] **Step 6 : Vérifier**

Run: `npm run test:run -- functions/src/priceWatch/ && npx tsc -b`
Expected: tests au vert, aucune erreur de type.

- [ ] **Step 7 : Commit**

```bash
git add functions/src/priceWatch/ functions/src/workflow/nodes/
git commit -m "feat(suivi): le cron aussi dit ce qu'il lui reste"
```

---

### Task 7 : Le battement du run navigateur

**Files:**
- Create: `src/features/workflows/runtime/publishClientRun.ts`
- Test: `src/features/workflows/runtime/publishClientRun.test.ts`

**Interfaces:**
- Produit : `canOverwrite(existing, runId, now)`, `shouldBeat(lastAt, now, force)`, `startClientRunBeat(workflowId, runId)`, `stopClientRunBeat(status)`, `CLIENT_BEAT_INTERVAL_MS`

> **Le trou que ceci comble.** `users/{uid}/workflowRunsLive/{workflowId}` n'est écrit que
> par les Cloud Functions. Un run lancé dans le navigateur ne laisse aucune trace en base :
> invisible depuis un autre onglet, un autre poste, et la PWA. On écrit dans le **même**
> document, avec `origin: 'client'`, pour que l'éditeur, l'écran Résultats et la PWA — qui
> s'y abonnent déjà — en profitent sans une ligne de plus.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/features/workflows/runtime/publishClientRun.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { canOverwrite, shouldBeat, CLIENT_BEAT_INTERVAL_MS } from './publishClientRun'

const NOW = 1_700_000_000_000

describe('canOverwrite — ne pas piétiner un run vivant', () => {
  it('écrit quand le document est vide', () => {
    expect(canOverwrite(null, 'run-1', NOW)).toBe(true)
  })

  it('écrit quand le document porte NOTRE run', () => {
    expect(canOverwrite({ runId: 'run-1', origin: 'server', beatAt: NOW }, 'run-1', NOW)).toBe(true)
  })

  it('REFUSE d’écraser un autre run qui vient d’écrire', () => {
    expect(canOverwrite({ runId: 'cron-9', origin: 'server', beatAt: NOW - 30_000 }, 'run-1', NOW)).toBe(false)
  })

  it('reprend la main sur un autre run muet depuis plus de trois minutes', () => {
    expect(canOverwrite({ runId: 'cron-9', origin: 'server', beatAt: NOW - 4 * 60_000 }, 'run-1', NOW)).toBe(true)
  })

  it('reprend la main quand l’autre run est terminé', () => {
    expect(canOverwrite({ runId: 'cron-9', origin: 'server', beatAt: NOW - 10_000, endedAt: NOW - 5_000 }, 'run-1', NOW)).toBe(true)
  })
})

describe('shouldBeat', () => {
  it('bat au premier appel', () => {
    expect(shouldBeat(0, NOW, false)).toBe(true)
  })

  it('se tait avant l’intervalle', () => {
    expect(shouldBeat(NOW, NOW + CLIENT_BEAT_INTERVAL_MS - 1, false)).toBe(false)
  })

  it('bat toujours quand on force — un changement d’état de carte ne s’attend pas', () => {
    expect(shouldBeat(NOW, NOW + 1, true)).toBe(true)
  })
})
```

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

Run: `npm run test:run -- src/features/workflows/runtime/publishClientRun.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/features/workflows/runtime/publishClientRun.ts` :

```ts
// Le run NAVIGATEUR publie son état, comme le fait déjà le serveur.
//
// ⚠ Sans ceci, un run lancé dans un onglet n'existe nulle part ailleurs : ni dans un autre
// onglet, ni sur un autre poste, ni dans la PWA. On écrit dans le MÊME document que les
// Functions (`users/{uid}/workflowRunsLive/{workflowId}`) — l'éditeur, l'écran Résultats et
// le mobile s'y abonnent déjà.
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useRunContext } from './runContext'
import { useWorkflowStore } from '../persistence/workflow.store'

/** Un battement toutes les cinq secondes au plus. Un run d'une heure écrirait sinon des
 *  milliers de fois pour un écran qui se lit à la seconde. */
export const CLIENT_BEAT_INTERVAL_MS = 5_000

/** Au-delà de ce silence, un run n'est plus vivant : sa place est prenable. Même valeur
 *  que `LIVE_BEAT_MS` (useServerRunLive) et `OPS_BEAT_MS` (buildWatchOps). */
const LIVE_BEAT_MS = 3 * 60_000

export interface LiveDocHead {
  runId?: string
  origin?: 'client' | 'server'
  beatAt?: number
  endedAt?: number
}

/**
 * A-t-on le droit d'écrire dans ce document ? PUR.
 *
 * ⚠ Le cas qui justifie cette fonction : un cron démarre pendant qu'un run tourne dans
 * l'onglet. Les deux écrivent le même document, l'écran alterne entre deux runs et n'en
 * raconte aucun. On laisse la place au premier arrivé tant qu'il donne signe de vie.
 */
export function canOverwrite(existing: LiveDocHead | null, runId: string, now: number): boolean {
  if (!existing?.runId) return true
  if (existing.runId === runId) return true
  if (existing.endedAt != null) return true
  return now - (existing.beatAt ?? 0) > LIVE_BEAT_MS
}

/** PUR. `force` : premier battement, changement d'état d'une carte, fin de run. */
export function shouldBeat(lastAt: number, now: number, force: boolean): boolean {
  return force || lastAt === 0 || now - lastAt >= CLIENT_BEAT_INTERVAL_MS
}

let timer: ReturnType<typeof setInterval> | null = null
let lastBeatAt = 0
let blocked = false

async function beat(workflowId: string, runId: string, force: boolean, endStatus?: string): Promise<void> {
  const uid = getWorkspaceUid()
  if (!uid || blocked) return
  const now = Date.now()
  if (!shouldBeat(lastBeatAt, now, force)) return
  lastBeatAt = now
  const ref = doc(db, 'users', uid, 'workflowRunsLive', workflowId)
  try {
    if (force && lastBeatAt === now) {
      const snap = await getDoc(ref)
      if (!canOverwrite((snap.data() as LiveDocHead | undefined) ?? null, runId, now)) {
        // On ne se bat pas pour le document : on renonce et on le dit une fois.
        blocked = true
        console.warn('[suivi] un autre run occupe déjà l’état live de ce flux — pas d’écrasement.')
        return
      }
    }
    const states = useRunContext.getState().nodeStates
    const nodeStates: Record<string, string> = {}
    const nodeCounts: Record<string, number> = {}
    const nodeCycles: Record<string, number> = {}
    for (const [id, st] of Object.entries(states)) {
      nodeStates[id] = st.status
      if (typeof st.count === 'number') nodeCounts[id] = st.count
      if (typeof st.cycles === 'number') nodeCycles[id] = st.cycles
    }
    await setDoc(ref, {
      runId, origin: 'client', trigger: 'manual',
      workflowName: useWorkflowStore.getState().current?.name ?? '',
      beatAt: now, nodeStates, nodeCounts, nodeCycles,
      ...(endStatus ? { status: endStatus, endedAt: now } : { status: 'running' }),
    }, { merge: true })
  } catch (e) {
    console.warn('[suivi] battement du run refusé :', e)
  }
}

/** Démarre la publication. À appeler au tout début d'un run navigateur. */
export function startClientRunBeat(workflowId: string, runId: string): void {
  stopTimer()
  lastBeatAt = 0
  blocked = false
  void beat(workflowId, runId, true).then(() => {
    // ⚠ Le document doit être REMPLACÉ au démarrage, pas fusionné : les états de cartes
    // supprimées du graphe survivraient et s'afficheraient « en erreur » indéfiniment.
    // `setDoc` sans merge est fait ici, une seule fois, par le premier battement forcé.
  })
  timer = setInterval(() => { void beat(workflowId, runId, false) }, CLIENT_BEAT_INTERVAL_MS)
}

/** Arrête la publication et écrit l'issue. */
export function stopClientRunBeat(workflowId: string, runId: string, status: string): void {
  stopTimer()
  void beat(workflowId, runId, true, status)
}

function stopTimer(): void {
  if (timer) { clearInterval(timer); timer = null }
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `npm run test:run -- src/features/workflows/runtime/publishClientRun.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/features/workflows/runtime/publishClientRun.ts src/features/workflows/runtime/publishClientRun.test.ts
git commit -m "feat(suivi): un run lancé dans l'onglet existe enfin ailleurs que dans l'onglet"
```

---

### Task 8 : Brancher le battement, et empêcher l'onglet de s'entendre lui-même

**Files:**
- Modify: `src/features/workflows/runtime/executor.ts:300-320` (début de run) et à la fin de `executeWorkflow`
- Modify: `src/features/workflows/runtime/useServerRunLive.ts` (garde anti-écho)

**Interfaces:**
- Consomme : `startClientRunBeat`, `stopClientRunBeat` (Task 7)

> **⚠ Le piège.** `useServerRunLive` hydrate le runContext depuis `workflowRunsLive` en
> s'appuyant sur une garantie écrite dans son propre commentaire : « ce document n'est écrit
> QUE par le serveur ». Cette garantie tombe avec la Task 7. Sans garde, l'onglet se
> réhydrate depuis son propre battement — au mieux inutile, au pire il écrase l'état local
> par une copie en retard de cinq secondes.

- [ ] **Step 1 : Écrire le test de la garde**

Créer `src/features/workflows/runtime/echoGuard.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { isOwnEcho } from './publishClientRun'

describe('isOwnEcho — un onglet ne s’écoute pas lui-même', () => {
  it('reconnaît son propre battement', () => {
    expect(isOwnEcho({ origin: 'client', runId: 'run-1' }, 'run-1')).toBe(true)
  })

  it('ne confond pas avec le run d’un autre onglet', () => {
    expect(isOwnEcho({ origin: 'client', runId: 'run-2' }, 'run-1')).toBe(false)
  })

  it('ne confond pas avec un run serveur', () => {
    expect(isOwnEcho({ origin: 'server', runId: 'cron-9' }, 'run-1')).toBe(false)
  })
})
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm run test:run -- src/features/workflows/runtime/echoGuard.test.ts`
Expected: FAIL — `isOwnEcho` n'est pas exporté.

- [ ] **Step 3 : Ajouter la fonction et le run courant**

Dans `src/features/workflows/runtime/publishClientRun.ts`, ajouter :

```ts
let currentRunId: string | null = null

/** L'identifiant du run que CET onglet publie, ou null. */
export function activeClientRunId(): string | null { return currentRunId }

/** Ce battement est-il le nôtre ? PUR. */
export function isOwnEcho(head: { origin?: string; runId?: string } | null, runId: string | null): boolean {
  return !!head && head.origin === 'client' && !!runId && head.runId === runId
}
```

Poser `currentRunId = runId` dans `startClientRunBeat`, `currentRunId = null` dans
`stopClientRunBeat`.

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:run -- src/features/workflows/runtime/echoGuard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5 : Poser la garde dans `useServerRunLive`**

Dans le corps du `onSnapshot` de `src/features/workflows/runtime/useServerRunLive.ts`,
tout au début du rappel, après la lecture de `d` :

```ts
        // ⚠ Le document n'est plus écrit par le seul serveur : depuis que le run
        // navigateur publie son battement, cet onglet peut recevoir son PROPRE écho.
        // L'hydrater reviendrait à écraser l'état local par une copie vieille de cinq
        // secondes.
        if (isOwnEcho(d ?? null, activeClientRunId())) return
```

Ajouter l'import correspondant.

- [ ] **Step 6 : Brancher l'executor**

Dans `src/features/workflows/runtime/executeWorkflow` (`executor.ts`), après
`const ac = ctxStore.startRun(...)` (~ligne 312) :

```ts
  // Publie ce run pour le reste du monde (autres onglets, autre poste, PWA, écran Suivi).
  const runId = `c-${startedAt}-${Math.random().toString(36).slice(2, 8)}`
  startClientRunBeat(wf.id, runId)
```

À la fin de la même fonction (`executor.ts:576-581`), l'historique durable est **déjà**
écrit par `persistClientRun`. Ajouter le dernier battement juste après ce bloc, avant le
`return` de l'issue :

```ts
  // Dernier battement : l'issue du run, écrite tout de suite. Sans elle, l'écran laisserait
  // le run « en cours » pendant les trois minutes de la garde de silence.
  stopClientRunBeat(wf.id, runId,
    ac.signal.aborted ? 'stopped' : errors.length === 0 ? 'success' : okCount > 0 ? 'partial' : 'error')
```

Les variables `ac`, `errors` et `okCount` sont celles déjà calculées quelques lignes plus
haut dans la fonction.

- [ ] **Step 7 : Vérifier**

Run: `npx tsc -b && npm run lint && npm run test:run -- src/features/workflows/runtime/`
Expected: aucune erreur, tests du runtime au vert.

- [ ] **Step 8 : Commit**

```bash
git add src/features/workflows/runtime/
git commit -m "feat(suivi): le run navigateur se publie, et l'onglet n'écoute pas son propre écho"
```

---

### Task 9 : Le journal des incidents

**Files:**
- Create: `src/features/priceWatch/ops/incidents.ts`
- Create: `functions/src/priceWatch/opsIncidents.ts`
- Test: `src/features/priceWatch/ops/incidents.test.ts`

**Interfaces:**
- Consomme : `WatchIncident`, `OPS_INCIDENT_MAX_AGE_MS`, `opsIncidentsCol` (Task 1)
- Produit : `expiredIncidents(list, now)`, `recordIncident(uid, watchId, incident)`, `useIncidents(watchId)`

> **Pourquoi une collection à part.** L'historique des runs est élagué à 20 par flux
> (`functions/src/workflow/runHistory.ts`, `MAX_RUNS = 20`). Sur un flux qui tourne toutes
> les heures, un incident de mardi a disparu mercredi matin. Ce journal-ci survit.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/features/priceWatch/ops/incidents.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { expiredIncidents } from './incidents'
import { OPS_INCIDENT_MAX_AGE_MS } from './opsTypes'

const NOW = 1_700_000_000_000

describe('expiredIncidents', () => {
  it('garde ce qui est dans la fenêtre', () => {
    const list = [{ id: 'a', ts: NOW - 1_000 }, { id: 'b', ts: NOW - OPS_INCIDENT_MAX_AGE_MS + 1 }]
    expect(expiredIncidents(list, NOW)).toEqual([])
  })

  it('désigne ce qui a dépassé quatre-vingt-dix jours', () => {
    const list = [{ id: 'a', ts: NOW - 1_000 }, { id: 'vieux', ts: NOW - OPS_INCIDENT_MAX_AGE_MS - 1 }]
    expect(expiredIncidents(list, NOW)).toEqual(['vieux'])
  })
})
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm run test:run -- src/features/priceWatch/ops/incidents.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/features/priceWatch/ops/incidents.ts` :

```ts
// Journal des pannes du suivi — ce qui a cassé, quand, et pourquoi.
//
// ⚠ Séparé de l'historique des runs, élagué à vingt par flux : sur un flux horaire, un
// incident de mardi a disparu mercredi matin. C'est précisément celui qu'on cherche.
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { opsIncidentsCol, watchDoc } from '../paths'
import { OPS_INCIDENT_MAX_AGE_MS, type WatchIncident } from './opsTypes'

/** Identifiants des incidents périmés. PUR. */
export function expiredIncidents(list: { id: string; ts: number }[], now: number): string[] {
  return list.filter((i) => now - i.ts > OPS_INCIDENT_MAX_AGE_MS).map((i) => i.id)
}

/** Combien on en affiche, et donc combien on en lit. */
export const INCIDENTS_PAGE = 50

/** Consigne une panne. Fire-and-forget : jamais bloquant pour le run. */
export async function recordIncident(uid: string, watchId: string, incident: WatchIncident): Promise<void> {
  try {
    await addDoc(collection(db, opsIncidentsCol(uid, watchId)), {
      ...incident, message: incident.message.slice(0, 600),
    })
  } catch (e) {
    console.warn('[suivi] incident non consigné :', e)
  }
}

/** Supprime les incidents périmés. Appelé à l'écriture, jamais à la lecture. */
export async function pruneIncidents(uid: string, watchId: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteDoc(doc(db, opsIncidentsCol(uid, watchId), id)).catch(() => {})))
}

/** Abonnement aux derniers incidents. */
export function watchIncidents(
  uid: string, watchId: string, onChange: (list: (WatchIncident & { id: string })[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, opsIncidentsCol(uid, watchId)), orderBy('ts', 'desc'), limit(INCIDENTS_PAGE)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as WatchIncident) }))),
    (e) => console.warn('[suivi] journal des incidents illisible :', e),
  )
}

// `watchDoc` est réexporté par `paths` ; l'import ci-dessus le garde pour la lisibilité
// des chemins dans les messages d'erreur.
void watchDoc
```

> **Note à l'implémenteur :** si `watchDoc` n'est pas utilisé, le supprimer de l'import et
> retirer le `void watchDoc` — `npm run lint` doit rester à 0 warning.

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:run -- src/features/priceWatch/ops/incidents.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5 : Écrire le jumeau serveur**

Créer `functions/src/priceWatch/opsIncidents.ts` avec `recordIncident` seul (le serveur
écrit, il ne lit pas), en `firebase-admin`, chemin
`users/${uid}/priceWatch/${watchId}/opsIncidents`, même troncature à 600 caractères,
`origin: 'server'`.

- [ ] **Step 6 : Consigner les vraies pannes**

Dans `functions/src/workflow/runLive.ts`, dans `appendRunLiveError`, appeler aussi
`recordIncident` quand le flux porte un `watchId` — le message passe déjà par
`humanizeError`, on consigne la version française.

- [ ] **Step 7 : Vérifier et commiter**

Run: `npx tsc -b && npm run lint`

```bash
git add src/features/priceWatch/ops/incidents.ts src/features/priceWatch/ops/incidents.test.ts functions/src/priceWatch/opsIncidents.ts functions/src/workflow/runLive.ts
git commit -m "feat(suivi): un incident de mardi ne doit pas disparaître mercredi matin"
```

---

### Task 10 : Le hook qui rassemble les trois sources

**Files:**
- Create: `src/features/priceWatch/ops/useWatchOps.ts`
- Test: aucun test unitaire (hook d'abonnement ; la logique est testée en Task 2)

**Interfaces:**
- Consomme : `buildWatchOps` (Task 2), `watchIncidents` (Task 9), `buildOpsCockpit` de `../dashboard/opsMetrics`, `useWatchList` de `../useCatalogReport`
- Produit : `useWatchOps(watchId, workflowId): { view, incidents, loading }`

- [ ] **Step 1 : Écrire le hook**

Créer `src/features/priceWatch/ops/useWatchOps.ts` :

```ts
// Les trois sources de l'écran « Suivi », abonnées en direct.
//
// ⚠ Aucune mise en cache : l'application est dynamique et un chiffre figé sur cet écran-ci
// est pire qu'un écran vide — on décide de ne PAS relancer sur sa foi.
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { opsProgressDoc } from '../paths'
import { buildWatchOps, type WatchOpsView, type RunSnapshot } from './buildWatchOps'
import { watchIncidents } from './incidents'
import type { WatchOpsProgress, WatchIncident } from './opsTypes'
import type { OpsCockpit } from '../dashboard/opsMetrics'

/** Cadence de rafraîchissement de l'horloge : les durées écoulées et les estimations
 *  doivent avancer même quand aucun document ne bouge. */
const TICK_MS = 1_000

export function useWatchOps(
  watchId: string | null, workflowId: string | undefined, cockpit: OpsCockpit | null,
): { view: WatchOpsView; incidents: (WatchIncident & { id: string })[] } {
  const [progress, setProgress] = useState<WatchOpsProgress | null>(null)
  const [run, setRun] = useState<RunSnapshot | null>(null)
  const [incidents, setIncidents] = useState<(WatchIncident & { id: string })[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const uid = getWorkspaceUid()
    if (!uid || !watchId) { setProgress(null); return }
    return onSnapshot(
      doc(db, opsProgressDoc(uid, watchId)),
      (snap) => setProgress((snap.data() as WatchOpsProgress | undefined) ?? null),
      (e) => console.warn('[suivi] avancement illisible :', e),
    )
  }, [watchId])

  useEffect(() => {
    const uid = getWorkspaceUid()
    if (!uid || !workflowId) { setRun(null); return }
    return onSnapshot(
      doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (snap) => {
        const d = snap.data() as
          | { status?: string; startedAt?: number; beatAt?: number; trigger?: string; endedAt?: number }
          | undefined
        setRun(d?.startedAt
          ? {
              status: d.status ?? 'running', startedAt: d.startedAt,
              // ⚠ Repli sur `startedAt` quand le battement manque : les documents écrits
              // avant l'introduction du champ passeraient sinon pour morts d'emblée.
              beatAt: d.beatAt ?? d.endedAt ?? d.startedAt,
              trigger: d.trigger ?? null,
            }
          : null)
      },
      (e) => console.warn('[suivi] état du run illisible :', e),
    )
  }, [workflowId])

  useEffect(() => {
    const uid = getWorkspaceUid()
    if (!uid || !watchId) { setIncidents([]); return }
    return watchIncidents(uid, watchId, setIncidents)
  }, [watchId])

  return { view: buildWatchOps({ progress, cockpit, run, now }), incidents }
}
```

- [ ] **Step 2 : Vérifier**

Run: `npx tsc -b && npm run lint`
Expected: aucune erreur, 0 warning.

- [ ] **Step 3 : Commit**

```bash
git add src/features/priceWatch/ops/useWatchOps.ts
git commit -m "feat(suivi): trois sources, un seul état d'écran, en direct"
```

---

### Task 11 : L'écran — bandeau et chantiers

**Files:**
- Create: `src/features/priceWatch/ops/WatchOpsScreen.tsx`
- Create: `src/features/priceWatch/ops/OpsHeader.tsx`
- Create: `src/features/priceWatch/ops/ChantierCard.tsx`
- Create: `src/features/priceWatch/ops/opsFormat.ts`
- Test: `src/features/priceWatch/ops/opsFormat.test.ts`

**Interfaces:**
- Consomme : `useWatchOps` (Task 10), `Chantier`, `RunView` (Task 2), `WatchSelector` de `../dashboard/WatchSelector`
- Produit : `WatchOpsScreen` (export nommé), `formatEta(ms)`, `chantierLabelKey(id)`

- [ ] **Step 1 : Écrire le test de formatage qui échoue**

Créer `src/features/priceWatch/ops/opsFormat.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { etaParts } from './opsFormat'

describe('etaParts — une estimation se lit, elle ne se déchiffre pas', () => {
  it('rend heures et minutes au-delà d’une heure', () => {
    expect(etaParts(3 * 3_600_000 + 25 * 60_000)).toEqual({ h: 3, m: 25 })
  })

  it('rend les seules minutes en dessous', () => {
    expect(etaParts(42 * 60_000)).toEqual({ h: 0, m: 42 })
  })

  it('arrondit à la minute supérieure — « 0 min » sur un travail en cours est un mensonge', () => {
    expect(etaParts(20_000)).toEqual({ h: 0, m: 1 })
  })
})
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm run test:run -- src/features/priceWatch/ops/opsFormat.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Écrire le formatage**

Créer `src/features/priceWatch/ops/opsFormat.ts` :

```ts
// Mise en forme des durées de l'écran « Suivi ». PUR.
import type { ChantierId } from './buildWatchOps'
import type { TranslationKey } from '@/lib/i18n'

/** Heures et minutes d'une durée. Toujours au moins une minute tant qu'il reste du
 *  travail : « 0 min » sur une file de deux mille champs ne trompe personne longtemps. */
export function etaParts(ms: number): { h: number; m: number } {
  const total = Math.max(1, Math.ceil(ms / 60_000))
  return { h: Math.floor(total / 60), m: total % 60 }
}

/** Libellé d'un chantier. ⚠ La CLÉ, pas le texte : `t()` appelé ici, en constante de
 *  module, figerait la langue au chargement de l'application. */
export function chantierLabelKey(id: ChantierId): TranslationKey {
  return ({
    harvest: 'ops.chantier.harvest',
    translate: 'ops.chantier.translate',
    improve: 'ops.chantier.improve',
    structure: 'ops.chantier.structure',
  } as const)[id]
}
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:run -- src/features/priceWatch/ops/opsFormat.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5 : Écrire les composants**

`OpsHeader.tsx` (≤ 90 lignes) : le flux, le déclencheur, l'état (en cours / interrompu /
terminé), le temps écoulé, la prochaine relance. Un run non vivant s'affiche
**« interrompu »**, jamais « en cours ». Tokens de thème uniquement.

`ChantierCard.tsx` (≤ 110 lignes) : un chantier — titre via `chantierLabelKey`, barre de
progression, `done` / `remaining`, pourcentage, durée estimée via `etaParts` (masquée quand
`etaMs` est `null`, avec la mention « estimation indisponible »), débit `perMin` quand il
existe, ventilation `byLang` en liste courte, et `reasons` (jamais traité / source modifiée)
quand la source la donne. Quand `reasons` est absent, afficher « non ventilé » — surtout pas
deux zéros.

`WatchOpsScreen.tsx` (≤ 120 lignes) : assemblage. Sélecteur de suivi (`WatchSelector`),
`useWatchOps`, `OpsHeader`, la grille de `ChantierCard`, et les emplacements des blocs de la
Task 12. Publie sa vue au menu en arbre via `useModuleViewStore` comme le fait
`PriceWatchPanel`, et consomme les intents via `useModuleIntent('watch-ops', …)`.

- [ ] **Step 6 : Vérifier**

Run: `npx tsc -b && npm run lint`
Expected: aucune erreur, 0 warning. Vérifier qu'aucun fichier ne dépasse 150 lignes :
`wc -l src/features/priceWatch/ops/*.tsx`

- [ ] **Step 7 : Commit**

```bash
git add src/features/priceWatch/ops/
git commit -m "feat(suivi): l'écran dit ce qui tourne et ce qu'il reste, chantier par chantier"
```

---

### Task 12 : Cartes du run, journal, historique

**Files:**
- Create: `src/features/priceWatch/ops/RunCardsStrip.tsx`
- Create: `src/features/priceWatch/ops/IncidentLog.tsx`
- Create: `src/features/priceWatch/ops/RunHistory.tsx`
- Create: `src/features/priceWatch/ops/useRunHistory.ts`
- Modify: `src/features/priceWatch/ops/WatchOpsScreen.tsx`
- Test: `src/features/priceWatch/ops/runHistoryStats.test.ts`
- Create: `src/features/priceWatch/ops/runHistoryStats.ts`

**Interfaces:**
- Consomme : `runProgress` de `@/features/workflows/runtime/runProgress`, `watchIncidents` (Task 9)
- Produit : `durationTrend(runs)`, `useRunHistory(workflowId)`

- [ ] **Step 1 : Écrire le test de tendance qui échoue**

Créer `src/features/priceWatch/ops/runHistoryStats.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { durationTrend } from './runHistoryStats'

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

  it('ne se prononce pas sous quatre runs — deux points ne font pas une tendance', () => {
    expect(durationTrend([{ startedAt: 1, endedAt: 2 }, { startedAt: 3, endedAt: 4 }])).toBeNull()
  })

  it('ignore les runs sans fin', () => {
    expect(durationTrend([{ startedAt: 1 }, { startedAt: 2 }, { startedAt: 3 }, { startedAt: 4 }])).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `npm run test:run -- src/features/priceWatch/ops/runHistoryStats.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/features/priceWatch/ops/runHistoryStats.ts` :

```ts
// Tendance des durées de run. PUR.
export interface RunRow { startedAt: number; endedAt?: number }

/**
 * Écart en pourcentage entre la durée moyenne des runs RÉCENTS et celle des anciens.
 * `null` quand la question n'a pas de réponse honnête : moins de quatre runs terminés,
 * ou une moitié vide.
 *
 * ⚠ Les runs arrivent du plus récent au plus ancien (tri `endedAt desc` de Firestore) :
 * la première moitié est la récente.
 */
export function durationTrend(runs: RunRow[]): number | null {
  const done = runs.filter((r) => typeof r.endedAt === 'number')
  if (done.length < 4) return null
  const half = Math.floor(done.length / 2)
  const avg = (rows: RunRow[]) =>
    rows.reduce((n, r) => n + ((r.endedAt as number) - r.startedAt), 0) / rows.length
  const recent = avg(done.slice(0, half))
  const older = avg(done.slice(half))
  if (older <= 0) return null
  return Math.round(((recent - older) / older) * 100)
}
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:run -- src/features/priceWatch/ops/runHistoryStats.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5 : Écrire les composants et le hook**

`useRunHistory.ts` : `onSnapshot` sur
`users/{uid}/workflowRuns` filtré `where('workflowId','==',workflowId)`,
`orderBy('endedAt','desc')`, `limit(20)`. Rend `{ runs, trend }`.

> **Bonne nouvelle : les runs navigateur sont déjà dans cet historique.**
> `persistClientRun` (`workflows/persistence/runHistoryClient.ts`, appelé en fin
> d'`executeWorkflow`) y écrit un snapshot durable depuis toujours — c'est l'état **live**
> qui manquait, pas l'historique. Il n'y a donc rien à ajouter côté écriture ici.

> **⚠ Index Firestore.** Cette requête combine un filtre d'égalité et un tri sur un autre
> champ : Firestore exige un index composite. Le message d'erreur de la console porte le
> lien de création — le suivre et **déclarer l'index dans `firestore.indexes.json`**, sans
> quoi il n'existera pas en production.

`RunCardsStrip.tsx` (≤ 110 lignes) : les cartes du run via `runProgress`, dans l'ordre où
elles ont tourné. Un clic ouvre le flux sur la carte — même intent que la bande d'avancement
existante de l'éditeur.

`IncidentLog.tsx` (≤ 110 lignes) : la liste des incidents (horodatage, domaine, carte,
message). Vide = « aucun incident sur les quatre-vingt-dix derniers jours », jamais un bloc
vide muet.

`RunHistory.tsx` (≤ 110 lignes) : les 20 derniers runs (début, durée, issue, volume) et la
tendance de `durationTrend`, formulée en clair.

Les brancher dans `WatchOpsScreen.tsx`.

- [ ] **Step 6 : Vérifier et commiter**

Run: `npx tsc -b && npm run lint && wc -l src/features/priceWatch/ops/*.tsx`

```bash
git add src/features/priceWatch/ops/ firestore.indexes.json
git commit -m "feat(suivi): les cartes du run, le journal des pannes, et la tendance des durées"
```

---

### Task 13 : Les actions

**Files:**
- Create: `src/features/priceWatch/ops/OpsActions.tsx`
- Modify: `src/features/priceWatch/ops/WatchOpsScreen.tsx`

**Interfaces:**
- Consomme : `stopServerRun`, `suspendWorkflow`, et le lancement serveur de
  `../radar/radarScheduleActions` ; `useCan` de `@/features/access/useAccess`

> **Ne pas réécrire ce qui existe.** Lancer côté serveur, arrêter le run et suspendre le
> cron sont déjà écrits pour la PWA dans `radar/radarScheduleActions.ts`, clefés par
> l'identifiant du **workflow** (pas du suivi). On les appelle.

- [ ] **Step 1 : Écrire le composant**

`OpsActions.tsx` (≤ 120 lignes) : quatre boutons.

1. **Lancer côté serveur** — `runNowCallable` de `radarScheduleActions`.
2. **Arrêter** — `stopServerRun`. Actif seulement quand `view.run?.alive`.
3. **Suspendre la relance** — `suspendWorkflow`. Affiche un retour quand aucun cron n'est
   actif (la fonction rend `false`).
4. **Relancer ce qui reste** — lance le flux avec le drapeau « ne reprendre que ce qui a
   changé » du node Textes (`config.incremental !== false`, déjà en place). Vérifier que le
   node du flux courant le porte ; sinon désactiver le bouton avec la raison affichée.

Toutes sous `useCan('priceWatch.opsAct')`.

> **⚠ La permission se vérifie ICI**, pas seulement sur l'entrée de menu : masquer un bouton
> n'interdit rien — l'intent est déclenchable par URL et par la palette de commandes.

- [ ] **Step 2 : Vérifier et commiter**

Run: `npx tsc -b && npm run lint`

```bash
git add src/features/priceWatch/ops/OpsActions.tsx src/features/priceWatch/ops/WatchOpsScreen.tsx
git commit -m "feat(suivi): lancer, arrêter, suspendre, reprendre le reste — sans quitter l'écran"
```

---

### Task 14 : Navigation, permissions, montage

**Files:**
- Modify: `src/features/access/permissions.ts:106-108`
- Modify: `src/features/navigation/modules.ts:162-168`
- Modify: `src/features/navigation/usePaletteCommands.ts:77`
- Modify: `src/pages/DashboardPage.tsx:51` (import différé) et `:636-644` (rendu)
- Modify: `src/features/help/helpAccess.ts`
- Test: `src/features/access/computePermissions.test.ts` (vérifier qu'il passe toujours)

- [ ] **Step 1 : Déclarer les permissions**

Dans `src/features/access/permissions.ts`, à la suite de `priceWatch.rules` :

```ts
  { key: 'priceWatch.ops', module: 'Veille tarifaire', labelKey: 'perm.priceWatch.ops',
    descriptionKey: 'perm.priceWatch.ops.desc' },
  { key: 'priceWatch.opsAct', module: 'Veille tarifaire', labelKey: 'perm.priceWatch.opsAct',
    descriptionKey: 'perm.priceWatch.opsAct.desc' },
```

> **⚠ Les deux clés doivent être déclarées ici.** Une section dont la permission n'est pas
> au catalogue est visible par **tout le monde** — la barrière est ouverte par défaut.

- [ ] **Step 2 : Ajouter l'entrée de menu**

Dans `src/features/navigation/modules.ts`, après l'entrée `price-watch` :

```ts
  { id: 'watch-ops', group: 'web', icon: Activity, labelKey: 'nav.watchOps', accent: 'text-amber-400',
    activeBg: 'bg-amber-500/[0.1]', activeText: 'text-amber-300',
    children: [
      { id: 'section:live',      labelKey: 'nav.watchOps.live',      intent: 'watch-ops:section:live' },
      { id: 'section:incidents', labelKey: 'nav.watchOps.incidents', intent: 'watch-ops:section:incidents' },
      { id: 'section:history',   labelKey: 'nav.watchOps.history',   intent: 'watch-ops:section:history' },
    ],
  },
```

Importer `Activity` depuis `lucide-react`. Ajouter `'watch-ops': 'priceWatch.ops'` à la
table qui associe un module à sa permission (~ligne 261).

- [ ] **Step 3 : Monter l'écran**

Dans `src/pages/DashboardPage.tsx`, à côté des autres imports différés :

```ts
const WatchOpsScreen = lazy(() => import('@/features/priceWatch/ops/WatchOpsScreen').then((m) => ({ default: m.WatchOpsScreen })))
```

Et une branche de rendu calquée sur celle de `price-watch` :

```tsx
      ) : activeSection === 'watch-ops' && canSee('watch-ops') ? (
        <div className="flex-1 overflow-auto px-8 pb-8 bg-background">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          }>
            <WatchOpsScreen />
          </Suspense>
        </div>
```

- [ ] **Step 4 : Palette de commandes et aide**

Dans `usePaletteCommands.ts` : `'watch-ops': 'suivi avancement traitements en cours veille progress monitoring'`.
Dans `helpAccess.ts` : `'watch-ops': 'priceWatch.ops'`.

- [ ] **Step 5 : Vérifier**

Run: `npx tsc -b && npm run lint && npm run test:run -- src/features/access/`
Expected: aucune erreur, tests d'accès au vert.

- [ ] **Step 6 : Commit**

```bash
git add src/features/access/permissions.ts src/features/navigation/ src/pages/DashboardPage.tsx src/features/help/helpAccess.ts
git commit -m "feat(suivi): le module a sa place dans le menu, et ses deux permissions"
```

---

### Task 15 : Les textes, dans les trois langues

**Files:**
- Modify: `src/lib/i18n/fr.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`

- [ ] **Step 1 : Recenser les clés**

Run: `node scripts/i18n-scan-literals.mjs src/features/priceWatch/ops/`
Expected: la liste des textes encore en dur — elle doit finir vide.

- [ ] **Step 2 : Écrire les entrées françaises**

Ajouter à `fr.ts` les clés employées : `nav.watchOps`, `nav.watchOps.live`,
`nav.watchOps.incidents`, `nav.watchOps.history`, `perm.priceWatch.ops`,
`perm.priceWatch.ops.desc`, `perm.priceWatch.opsAct`, `perm.priceWatch.opsAct.desc`,
`ops.chantier.harvest`, `ops.chantier.translate`, `ops.chantier.improve`,
`ops.chantier.structure`, plus les libellés des composants (état du run, boutons d'action,
vides, estimation indisponible, non ventilé, tendance).

Deux exigences de fond sur ces libellés :

- « interrompu » et « en cours » sont **deux états distincts** — ne pas les confondre dans
  une même formule.
- l'estimation se présente comme une estimation (« encore ≈ 3 h 25 »), jamais comme une
  heure de fin.

- [ ] **Step 3 : Porter en anglais britannique et en espagnol**

Run: `/translate src/features/priceWatch/ops/`
(anglais **britannique** : *organise*, *analyse*, *behaviour*.)

- [ ] **Step 4 : Vérifier**

Run: `npm run test:run -- src/lib/i18n/ && npx tsc -b`
Expected: les tests de catalogue passent (ils vérifient que les trois langues portent les
mêmes clés).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/i18n/
git commit -m "feat(suivi): les libellés du module, en trois langues"
```

---

### Task 16 : La carte mobile

**Files:**
- Create: `src/components/radar/RadarWatchOps.tsx`
- Modify: `src/pages/RadarPage.tsx`

**Interfaces:**
- Consomme : `useWatchOps` (Task 10), `buildWatchOps` (Task 2)

> **Aucun second moteur.** La PWA lit les mêmes documents et appelle la même fonction pure.
> Un calcul dupliqué finirait par diverger, et c'est sur le téléphone qu'on décide de **ne
> pas** relancer.

- [ ] **Step 1 : Écrire la carte**

`RadarWatchOps.tsx` (≤ 120 lignes) : état du run, les chantiers en barres compactes, le
dernier incident. Mise en page à une colonne. Les libellés viennent du catalogue.

> **⚠ Pulse et Radar restent en français** — ne pas y appeler la bascule de langue.

- [ ] **Step 2 : Brancher dans `RadarPage`**

Insérer la carte au-dessus de l'état de run existant (`RadarRunStatus`).

- [ ] **Step 3 : Vérifier et commiter**

Run: `npx tsc -b && npm run lint`

```bash
git add src/components/radar/RadarWatchOps.tsx src/pages/RadarPage.tsx
git commit -m "feat(suivi): l'avancement se lit aussi depuis le téléphone"
```

---

### Task 17 : L'alerte, et la vérification d'ensemble

**Files:**
- Modify: `src/features/priceWatch/ops/useWatchOps.ts` (notification à l'apparition d'un incident)

- [ ] **Step 1 : Notifier un incident nouveau**

Dans `useWatchOps`, comparer la liste reçue à la précédente : un incident dont le `ts` est
postérieur au montage déclenche `notify.error` (via `@/lib/notify`), une fois.

> **⚠ Pas de notification au premier chargement** : l'écran s'ouvrirait sur une volée de
> messages pour des pannes vieilles de trois semaines.

- [ ] **Step 2 : Audit complet**

Run: `npm run audit`
Expected: types, lint (0 warning), tests, code mort (exit 0), cycles (0).

> Si `npm run dead` signale un export : un symbole utilisé seulement dans son fichier ne
> doit pas être exporté. Si `npm run cycles` signale un cycle, la cause habituelle est un
> type exporté depuis un module de composant — le sortir dans un `*Types.ts`.

- [ ] **Step 3 : Vérifier à l'écran**

Lancer `npm run dev`, ouvrir le module « Suivi », lancer un run depuis le navigateur et
vérifier — dans un **second onglet** — que le run apparaît. C'est le trou que ce chantier
comble : si le second onglet ne voit rien, les tâches 7 et 8 sont incomplètes.

- [ ] **Step 4 : Commit final et déploiement**

```bash
git add -A
git commit -m "feat(suivi): l'écran prévient quand quelque chose casse"
git push origin master
firebase deploy --only hosting
```

> Les tâches 4, 6 et 9 touchent aux Cloud Functions : `--only hosting` ne les déploie
> **pas**. Déployer aussi les fonctions concernées, sinon le cron continue de ne rien
> publier et l'écran reste vide la nuit — le moment précis où il sert.

---

## Auto-revue

**Couverture de la spec** — chaque section a sa tâche : trou 1 → tâches 7-8 ; trou 2 →
tâches 3-6 ; bandeau et chantiers → 11 ; cartes du run, incidents, historique → 9 et 12 ;
actions → 13 ; alertes → 17 ; mobile → 16 ; permissions et navigation → 14 ; i18n → 15.

**Points laissés ouverts, et pourquoi**

1. **Le fichier du node « Textes » serveur** n'est pas nommé (tâche 6, étape 1) : le `grep`
   le donne en une commande, et le deviner risquait d'envoyer l'implémenteur sur un
   mauvais fichier.
2. **`done` par nature de travail** : le passage ne compte pas séparément les champs
   traduits et améliorés. `buildWatchOps` répartit au prorata du reste — approximation
   assumée et documentée dans le code. La rendre exacte demanderait de modifier `PassCounts`
   dans les deux jumeaux ; à faire seulement si l'écran se révèle trompeur à l'usage.
3. **`reasons` en mode PIM** : la ventilation « jamais traité / périmé » n'existe qu'en mode
   feuille. L'écran affiche « non ventilé » plutôt que deux zéros.
