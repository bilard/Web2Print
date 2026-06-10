# Workflow Server-Side Cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de planifier l'exécution récurrente d'un workflow (toutes les heures / jours / semaines / mois / N unités) **100% côté serveur**, via une carte « Cron » dans l'éditeur + un Cloud Scheduler qui exécute le workflow headless dans une Cloud Function.

**Architecture :** Une carte `cron` (node déclencheur, étape Import) porte la cadence + un flag actif. À la sauvegarde, le client synchronise un doc `workflowSchedules/{workflowId}` (uid, every, unit, nextRunAt). Une Cloud Function `onSchedule` (Cloud Scheduler auto-provisionné) scanne toutes les 10 min les plannings dûs, charge le workflow depuis Firestore et l'exécute via un **executor headless** réimplémenté dans `functions/` (port fidèle de `src/features/workflows/runtime/executor.ts` sans Zustand/DOM) + un **registre de nodes serveur** couvrant le sous-ensemble sans dépendance navigateur. Chaque run écrit un historique dans `users/{uid}/workflowRuns/{runId}`.

**Tech Stack :** Firebase Functions v2 (Node 20, `firebase-functions/v2/scheduler` + `https`), firebase-admin, `fetch` natif Node 20 (Jina + LLM REST, pas de SDK ajouté), Vitest (functions + client), React 18 / Zustand côté client.

**Sous-ensemble de nodes serveur (Phase 1) :**
- **Portés** : `text-input`, `if-else`, `pipe`, `loop-each`, `loop-collect`, `transform-set-fields`, `transform-filter`, `transform-sort`, `transform-rename`, `transform-text`, `web-search`, `scrape-url`, `enrichment`, `save-pim`, `send-telegram`.
- **Refusés** (erreur explicite à l'exécution serveur) : `export-pdf`, `image-to-svg`, `pdf-to-svg`, `decompose`, `gsheets-import`, `gsheets-export`, `gdrive-import`, `gdrive-export`, `save-dam`, `send-gmail`, `import-idml`, `import-svg`, `import-pptx`, `import-image`, `upload`, `import-csv`.
- **Différés Phase 2** (faisables serveur mais produisent un fichier à livrer) : `export-excel`, `export-pptx`, `generate-image`.

---

## File Structure

**Functions (nouveau dossier `functions/src/workflow/`) :**
- `cronSchedule.ts` — maths de cadence (copie du module client, pur).
- `types.ts` — types serveur (`ServerWorkflow`, `ServerNode`, `ServerEdge`, `ServerNodeSpec`, `ServerRunCtx`, `RunLog`).
- `interpolate.ts` — port de `interpolate` + `extractRows`/`formatValue`/`buildInterpolationContext`.
- `topo.ts` — port de `topoSort`.
- `registry.ts` — Map type→spec + `getServerNode`.
- `apiKeys.ts` — lecture `users/{uid}.apiKeys.overrides`.
- `llm.ts` — appel LLM REST (Anthropic + Gemini) avec fallback, clés depuis Firestore.
- `jina.ts` — Jina Reader + Search.
- `nodes/pure.ts` — text-input, logic (if-else/pipe/loop-each/loop-collect), transforms (×5).
- `nodes/network.ts` — web-search, scrape-url, enrichment.
- `nodes/sinks.ts` — save-pim, send-telegram.
- `nodes/index.ts` — enregistre tous les nodes (effet de bord) + liste des types refusés.
- `execute.ts` — `executeWorkflowHeadless(wf, ctx)` (port detectLoops/executeLoopBody/main loop).
- `runHistory.ts` — écriture `users/{uid}/workflowRuns/{runId}`.
- `scheduler.ts` — `workflowCronScheduler` (`onSchedule`) + `runWorkflowNow` (`onCall`).
- Tests : `cronSchedule.test.ts`, `interpolate.test.ts`, `topo.test.ts`, `nodes.pure.test.ts`, `execute.test.ts`.

**Functions (modifiés) :**
- `functions/src/index.ts` — exporter `workflowCronScheduler`, `runWorkflowNow`.

**Client (`src/features/workflows/`) :**
- `runtime/cronSchedule.ts` — **déjà créé** (maths + `CronConfig`, `CRON_UNIT_OPTIONS`, `describeCron`, `formatCountdown`, `computeNextRun`).
- `registry/cronNodes.ts` — **nouveau** node `cron` (carte palette).
- `registry/builtin.ts` — ajouter `import './cronNodes'`.
- `persistence/scheduleSync.ts` — **nouveau** `syncWorkflowSchedule(uid, wf)` (upsert/delete `workflowSchedules`).
- `persistence/workflowsApi.ts` — appeler `syncWorkflowSchedule` dans `saveWorkflow`.
- `editor/CronStatusPanel.tsx` — **nouveau** panneau (prochaine/dernière exéc + « Lancer maintenant (serveur) » + dernier statut).
- `editor/WorkflowEditorPage.tsx` — monter `CronStatusPanel` dans le header quand un node cron actif existe.

**Règles / config :**
- `firestore.rules` — collections `workflowSchedules/{workflowId}` + `users/{uid}/workflowRuns/{runId}`.
- `firestore.indexes.json` — index composite `workflowSchedules (enabled ASC, nextRunAt ASC)`.

---

## Firestore Schema

`workflowSchedules/{workflowId}` (un doc par workflow planifié, top-level pour scan cross-user) :
```
{ uid: string, workflowId: string, name: string,
  enabled: boolean, every: number, unit: 'hour'|'day'|'week'|'month',
  nextRunAt: number (ms epoch), lastRunAt: number|null,
  lastStatus: 'success'|'error'|'partial'|null, updatedAt: number }
```

`users/{uid}/workflowRuns/{runId}` (historique) :
```
{ workflowId: string, name: string, trigger: 'cron'|'manual',
  startedAt: number, endedAt: number, status: 'success'|'error'|'partial',
  nodeCount: number, errorCount: number,
  logs: { ts: number, level: 'info'|'warn'|'error', node?: string, msg: string }[] }
```

---

## Task 1: Functions — module de cadence `cronSchedule.ts`

**Files:**
- Create: `functions/src/workflow/cronSchedule.ts`
- Test: `functions/src/workflow/cronSchedule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/workflow/cronSchedule.test.ts
import { describe, it, expect } from 'vitest'
import { computeNextRun, normalizeEvery, type CronConfig } from './cronSchedule'

const base = Date.UTC(2026, 0, 15, 12, 0, 0) // 2026-01-15T12:00:00Z

describe('computeNextRun', () => {
  it('ajoute des heures/jours/semaines fixes', () => {
    expect(computeNextRun({ enabled: true, every: 2, unit: 'hour' }, base)).toBe(base + 2 * 3_600_000)
    expect(computeNextRun({ enabled: true, every: 1, unit: 'day' }, base)).toBe(base + 86_400_000)
    expect(computeNextRun({ enabled: true, every: 1, unit: 'week' }, base)).toBe(base + 604_800_000)
  })
  it('ajoute des mois en arithmétique calendaire', () => {
    const next = computeNextRun({ enabled: true, every: 2, unit: 'month' }, base)
    expect(new Date(next).getUTCMonth()).toBe(2) // janvier + 2 = mars
  })
  it('normalise every < 1 vers 1', () => {
    expect(normalizeEvery(0)).toBe(1)
    expect(normalizeEvery(-3)).toBe(1)
    expect(normalizeEvery(2.9)).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run src/workflow/cronSchedule.test.ts`
Expected: FAIL — `Cannot find module './cronSchedule'`.

- [ ] **Step 3: Write the module** (copie du module client, sans `formatCountdown`/`scheduleAt`/options UI qui ne servent pas au serveur ; les mois utilisent `setUTCMonth` pour rester déterministe en UTC)

```ts
// functions/src/workflow/cronSchedule.ts
export type CronUnit = 'hour' | 'day' | 'week' | 'month'

export interface CronConfig {
  every: number
  unit: CronUnit
  enabled: boolean
}

const FIXED_MS: Record<Exclude<CronUnit, 'month'>, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
}

export function normalizeEvery(every: number): number {
  return Number.isFinite(every) && every >= 1 ? Math.floor(every) : 1
}

export function computeNextRun(cfg: CronConfig, from: number): number {
  const every = normalizeEvery(cfg.every)
  if (cfg.unit === 'month') {
    const d = new Date(from)
    d.setUTCMonth(d.getUTCMonth() + every)
    return d.getTime()
  }
  return from + FIXED_MS[cfg.unit] * every
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run src/workflow/cronSchedule.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/workflow/cronSchedule.ts functions/src/workflow/cronSchedule.test.ts
git commit -m "feat(functions): module de cadence cron headless"
```

---

## Task 2: Règles Firestore + index

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Ajouter les règles** — insérer avant la dernière `}` du bloc `match /databases/{database}/documents { ... }`. `isAuthenticated()` existe déjà (cf. `firestore.rules`). Les Cloud Functions (admin SDK) contournent les règles ; ces règles couvrent l'accès **client**.

```
// Plannings cron de workflow (un doc par workflow). Le client lit/écrit les siens ;
// le scanner serveur (admin) contourne ces règles.
match /workflowSchedules/{workflowId} {
  allow read: if isAuthenticated() && resource.data.uid == request.auth.uid;
  allow create: if isAuthenticated() && request.resource.data.uid == request.auth.uid;
  allow update, delete: if isAuthenticated() && resource.data.uid == request.auth.uid;
}

// Historique des runs serveur (écrit par les Functions, lu par le propriétaire).
match /users/{uid}/workflowRuns/{runId} {
  allow read: if isAuthenticated() && request.auth.uid == uid;
  allow write: if false; // écrit uniquement par les Functions (admin)
}
```

- [ ] **Step 2: Ajouter l'index composite** dans `firestore.indexes.json` (tableau `indexes`) :

```json
{
  "collectionGroup": "workflowSchedules",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "enabled", "order": "ASCENDING" },
    { "fieldPath": "nextRunAt", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 3: Vérifier la syntaxe des règles**

Run: `npx firebase deploy --only firestore:rules --dry-run` (ou `firebase emulators:exec --only firestore "true"`)
Expected: pas d'erreur de compilation des règles.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat(rules): workflowSchedules + workflowRuns"
```

---

## Task 3: Functions — types serveur

**Files:**
- Create: `functions/src/workflow/types.ts`

- [ ] **Step 1: Écrire les types** (miroir minimal des types client, découplé de React/Lucide)

```ts
// functions/src/workflow/types.ts
export interface ServerNode { id: string; type: string; position?: unknown; config: unknown }
export interface ServerEdge {
  id: string; source: string; sourceHandle: string; target: string; targetHandle: string
}
export interface ServerWorkflow {
  id: string; name: string; ownerId: string
  nodes: ServerNode[]; edges: ServerEdge[]
}

export type LogLevel = 'info' | 'warn' | 'error'
export interface RunLog { ts: number; level: LogLevel; node?: string; msg: string }

export interface ServerRunCtx {
  uid: string
  log: (level: LogLevel, msg: string) => void
  signal: AbortSignal
}

export type ServerRun = (
  ctx: ServerRunCtx,
  config: Record<string, unknown>,
  inputs: Record<string, unknown>,
) => Promise<Record<string, unknown>>

export interface ServerNodeSpec { type: string; run: ServerRun }
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/workflow/types.ts
git commit -m "feat(functions): types executor headless"
```

---

## Task 4: Functions — interpolation (port fidèle)

**Files:**
- Create: `functions/src/workflow/interpolate.ts`
- Test: `functions/src/workflow/interpolate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/workflow/interpolate.test.ts
import { describe, it, expect } from 'vitest'
import { interpolate, buildInterpolationContext, extractRows } from './interpolate'

describe('interpolate', () => {
  it('remplace les tokens {{path}} dans une string', () => {
    expect(interpolate('Bonjour {{name}}', { name: 'Léa' })).toBe('Bonjour Léa')
  })
  it('garde le token si non résolu', () => {
    expect(interpolate('x={{missing}}', {})).toBe('x={{missing}}')
  })
  it('traverse objets/arrays', () => {
    expect(interpolate({ a: ['{{n}}'] }, { n: '1' })).toEqual({ a: ['1'] })
  })
})

describe('extractRows / buildInterpolationContext', () => {
  it('aplati les colonnes d’un sheet en listes jointes', () => {
    const ctx = buildInterpolationContext({ sheet: { rows: [{ p: 'a' }, { p: 'b' }] } })
    expect(ctx.p).toBe('a, b')
  })
  it('extractRows lit un array ou un sheet', () => {
    expect(extractRows([{ x: 1 }])).toEqual([{ x: 1 }])
    expect(extractRows({ rows: [{ x: 1 }] })).toEqual([{ x: 1 }])
    expect(extractRows('nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run src/workflow/interpolate.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire le module** (port de `src/features/workflows/runtime/interpolate.ts` + `extractRows`/`formatValue`/`buildInterpolationContext` extraits de `executor.ts:37-111`)

```ts
// functions/src/workflow/interpolate.ts
const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

function resolvePath(ctx: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean)
  let cur: unknown = ctx
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function interpolateString(input: string, ctx: Record<string, unknown>): string {
  return input.replace(TOKEN_RE, (match, path: string) => {
    const value = resolvePath(ctx, path.trim())
    if (value === undefined) return match
    if (value === null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  })
}

export function interpolate<T>(value: T, ctx: Record<string, unknown>): T {
  if (typeof value === 'string') return interpolateString(value, ctx) as unknown as T
  if (Array.isArray(value)) return value.map((v) => interpolate(v, ctx)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = interpolate(v, ctx)
    return out as unknown as T
  }
  return value
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function extractRows(input: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(input)) {
    const objs = input.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) as Record<string, unknown>[]
    return objs.length > 0 ? objs : null
  }
  if (input && typeof input === 'object') {
    const maybeRows = (input as Record<string, unknown>).rows
    if (Array.isArray(maybeRows)) {
      const objs = maybeRows.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) as Record<string, unknown>[]
      return objs.length > 0 ? objs : null
    }
  }
  return null
}

export function buildInterpolationContext(
  inputs: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {}
  for (const value of Object.values(inputs)) {
    const rows = extractRows(value)
    if (rows) {
      const cols = new Set<string>()
      for (const obj of rows) for (const k of Object.keys(obj)) cols.add(k)
      for (const col of cols) {
        if (col in ctx) continue
        ctx[col] = rows.map((obj) => formatValue(obj[col])).filter(Boolean).join(', ')
      }
      if (!Array.isArray(value) && value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (k === 'rows') continue
          if (!(k in ctx)) ctx[k] = v
        }
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(ctx, value as Record<string, unknown>)
    }
  }
  for (const [key, value] of Object.entries(inputs)) if (!(key in ctx)) ctx[key] = value
  Object.assign(ctx, extra)
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run src/workflow/interpolate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/workflow/interpolate.ts functions/src/workflow/interpolate.test.ts
git commit -m "feat(functions): interpolation + contexte (port)"
```

---

## Task 5: Functions — tri topologique (port)

**Files:**
- Create: `functions/src/workflow/topo.ts`
- Test: `functions/src/workflow/topo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/workflow/topo.test.ts` → FAIL.

- [ ] **Step 3: Écrire le module** (port de `src/features/workflows/runtime/topo.ts`, typé sur `ServerNode`/`ServerEdge`)

```ts
// functions/src/workflow/topo.ts
import type { ServerNode, ServerEdge } from './types'

export function topoSort(nodes: ServerNode[], edges: ServerEdge[]): ServerNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const indeg = new Map<string, number>(nodes.map((node) => [node.id, 0]))
  const out = new Map<string, string[]>(nodes.map((node) => [node.id, []]))
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    out.get(edge.source)!.push(edge.target)
    indeg.set(edge.target, (indeg.get(edge.target) ?? 0) + 1)
  }
  const queue: string[] = []
  for (const [id, d] of indeg) if (d === 0) queue.push(id)
  const result: ServerNode[] = []
  while (queue.length) {
    const id = queue.shift()!
    result.push(byId.get(id)!)
    for (const next of out.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1
      indeg.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  if (result.length !== nodes.length) throw new Error('Workflow contains a cycle')
  return result
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/workflow/topo.ts functions/src/workflow/topo.test.ts
git commit -m "feat(functions): topoSort (port)"
```

---

## Task 6: Functions — registre de nodes serveur

**Files:**
- Create: `functions/src/workflow/registry.ts`

- [ ] **Step 1: Écrire le registre**

```ts
// functions/src/workflow/registry.ts
import type { ServerNodeSpec } from './types'

const registry = new Map<string, ServerNodeSpec>()

export function registerServerNode(spec: ServerNodeSpec): void {
  registry.set(spec.type, spec)
}
export function getServerNode(type: string): ServerNodeSpec | undefined {
  return registry.get(type)
}
export function listServerNodeTypes(): string[] {
  return [...registry.keys()]
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/workflow/registry.ts
git commit -m "feat(functions): registre de nodes serveur"
```

---

## Task 7: Functions — nodes purs (text-input, logic, transforms)

**Files:**
- Create: `functions/src/workflow/nodes/pure.ts`
- Test: `functions/src/workflow/nodes/pure.test.ts`

Ports fidèles de `logicNodes.ts` (if-else/pipe/loop-each/loop-collect), `transformationNodes.ts` (×5) et `textInputNode.tsx`. `loop-each`/`loop-collect` ne sont enregistrés que comme **fallback** (l'orchestrator gère les paires loop spécialement, cf. Task 11) ; on les enregistre quand même pour qu'un loop isolé ne casse pas.

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/workflow/nodes/pure.test.ts
import { describe, it, expect } from 'vitest'
import './pure'
import { getServerNode } from '../registry'
import type { ServerRunCtx } from '../types'

const ctx: ServerRunCtx = { uid: 'u', log: () => {}, signal: new AbortController().signal }
const run = (type: string, config: any, inputs: any) => getServerNode(type)!.run(ctx, config, inputs)

describe('nodes purs', () => {
  it('text-input émet le texte', async () => {
    expect(await run('text-input', { text: 'hi' }, {})).toEqual({ text: 'hi' })
  })
  it('if-else route then/else', async () => {
    expect(await run('if-else', { expression: 'value > 1' }, { value: 2 })).toEqual({ then: 2 })
    expect(await run('if-else', { expression: 'value > 1' }, { value: 0 })).toEqual({ else: 0 })
  })
  it('transform-filter garde les lignes valides', async () => {
    const out = await run('transform-filter', { expression: 'row.p > 0' }, { sheet: { rows: [{ p: 1 }, { p: -1 }] } })
    expect((out.sheet as any).rows).toEqual([{ p: 1 }])
  })
  it('transform-set-fields applique les templates', async () => {
    const out = await run('transform-set-fields', { assignments: 'slug = {{name}}' }, { sheet: { rows: [{ name: 'A' }] } })
    expect((out.sheet as any).rows[0].slug).toBe('A')
  })
  it('transform-text met en minuscules', async () => {
    const out = await run('transform-text', { source: 'n', operation: 'lowercase' }, { sheet: { rows: [{ n: 'AB' }] } })
    expect((out.sheet as any).rows[0].n).toBe('ab')
  })
})
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/workflow/nodes/pure.test.ts` → FAIL.

- [ ] **Step 3: Écrire le module** (logique identique aux sources ; `ctx.log` remplace l'API client)

```ts
// functions/src/workflow/nodes/pure.ts
import { registerServerNode } from '../registry'
import { interpolate } from '../interpolate'

interface SheetLike { rows?: Array<Record<string, unknown>>; [key: string]: unknown }
const asSheet = (input: unknown): SheetLike =>
  input && typeof input === 'object' && !Array.isArray(input) ? (input as SheetLike) : { rows: [] }
const asRows = (sheet: SheetLike): Array<Record<string, unknown>> => (Array.isArray(sheet.rows) ? sheet.rows : [])

// --- text-input ---
registerServerNode({
  type: 'text-input',
  run: async (ctx, config) => {
    const text = (config.text as string) ?? ''
    if (!String(text).trim()) ctx.log('warn', 'Le texte saisi est vide.')
    return { text }
  },
})

// --- if-else ---
registerServerNode({
  type: 'if-else',
  run: async (ctx, config, inputs) => {
    const expr = String(config.expression ?? 'true').trim() || 'true'
    let result: boolean
    try {
      result = Boolean(new Function('value', `return (${expr})`)(inputs.value))
    } catch (err) {
      throw new Error(`Erreur d'évaluation "${expr}" : ${err instanceof Error ? err.message : err}`)
    }
    ctx.log('info', `Condition "${expr}" = ${result}`)
    return result ? { then: inputs.value } : { else: inputs.value }
  },
})

// --- pipe ---
registerServerNode({
  type: 'pipe',
  run: async (ctx, config, inputs) => {
    const lines = String(config.expressions ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
    if (lines.length === 0) return { result: inputs.value }
    let value = inputs.value
    for (let i = 0; i < lines.length; i++) {
      try {
        value = new Function('value', `return (${lines[i]})`)(value)
      } catch (err) {
        throw new Error(`Étape ${i + 1} "${lines[i]}" : ${err instanceof Error ? err.message : err}`)
      }
    }
    return { result: value }
  },
})

// --- loop-each / loop-collect (fallback uniquement ; l'orchestrator gère les paires) ---
registerServerNode({
  type: 'loop-each',
  run: async (ctx, _config, inputs) => {
    const items = inputs.items
    if (!Array.isArray(items)) throw new Error("Loop each : l'entrée 'items' doit être un tableau.")
    ctx.log('warn', 'Loop each isolé — forwarde le premier élément.')
    return { item: items[0] }
  },
})
registerServerNode({
  type: 'loop-collect',
  run: async (_ctx, _config, inputs) => ({ results: inputs.item === undefined ? [] : [inputs.item] }),
})

// --- transform-set-fields ---
registerServerNode({
  type: 'transform-set-fields',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const lines = String(config.assignments ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
    if (lines.length === 0) return { sheet }
    const pairs = lines.map((line) => {
      const eq = line.indexOf('=')
      if (eq < 0) return null
      const key = line.slice(0, eq).trim()
      const tpl = line.slice(eq + 1).trim()
      return key ? { key, tpl } : null
    }).filter((p): p is { key: string; tpl: string } => p !== null)
    ctx.log('info', `Définit ${pairs.length} colonne(s) sur ${rows.length} ligne(s).`)
    const next = rows.map((row) => {
      const out: Record<string, unknown> = { ...row }
      for (const { key, tpl } of pairs) out[key] = interpolate(tpl, row)
      return out
    })
    return { sheet: { ...sheet, rows: next } }
  },
})

// --- transform-filter ---
registerServerNode({
  type: 'transform-filter',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const expr = String(config.expression ?? 'true').trim() || 'true'
    let fn: (row: Record<string, unknown>) => unknown
    try {
      fn = new Function('row', `return (${expr})`) as (row: Record<string, unknown>) => unknown
    } catch (err) {
      throw new Error(`Filtre : expression invalide "${expr}" — ${err instanceof Error ? err.message : err}`)
    }
    const kept = rows.filter((row) => {
      try { return Boolean(fn(row)) } catch { return false }
    })
    ctx.log('info', `Filtre : ${kept.length}/${rows.length} ligne(s).`)
    return { sheet: { ...sheet, rows: kept } }
  },
})

// --- transform-sort ---
registerServerNode({
  type: 'transform-sort',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const col = String(config.column ?? '').trim()
    if (!col) return { sheet }
    const sign = config.direction === 'desc' ? -1 : 1
    const numeric = config.type === 'number'
    const sorted = [...rows].sort((a, b) => {
      if (numeric) {
        const na = typeof a[col] === 'number' ? (a[col] as number) : Number(a[col])
        const nb = typeof b[col] === 'number' ? (b[col] as number) : Number(b[col])
        return ((Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0)) * sign
      }
      const sa = a[col] == null ? '' : String(a[col])
      const sb = b[col] == null ? '' : String(b[col])
      return sa.localeCompare(sb) * sign
    })
    ctx.log('info', `Tri ${config.direction} sur "${col}".`)
    return { sheet: { ...sheet, rows: sorted } }
  },
})

// --- transform-rename ---
registerServerNode({
  type: 'transform-rename',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const map = new Map<string, string>()
    for (const line of String(config.mapping ?? '').split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const from = line.slice(0, eq).trim()
      const to = line.slice(eq + 1).trim()
      if (from && to && from !== to) map.set(from, to)
    }
    if (map.size === 0) return { sheet }
    const next = rows.map((row) => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) out[map.get(k) ?? k] = v
      return out
    })
    ctx.log('info', `Renommage de ${map.size} colonne(s).`)
    return { sheet: { ...sheet, rows: next } }
  },
})

// --- transform-text ---
registerServerNode({
  type: 'transform-text',
  run: async (ctx, config, inputs) => {
    const sheet = asSheet(inputs.sheet)
    const rows = asRows(sheet)
    const src = String(config.source ?? '').trim()
    if (!src) return { sheet }
    const tgt = String(config.target ?? '').trim() || src
    const op = config.operation as string
    let regex: RegExp | null = null
    if (op === 'regex-extract') {
      try { regex = new RegExp(String(config.pattern ?? '')) }
      catch (err) { throw new Error(`Regex invalide — ${err instanceof Error ? err.message : err}`) }
    }
    const apply = (raw: unknown): string => {
      const s = raw == null ? '' : String(raw)
      switch (op) {
        case 'lowercase': return s.toLowerCase()
        case 'uppercase': return s.toUpperCase()
        case 'trim': return s.trim()
        case 'replace': return config.pattern ? s.split(String(config.pattern)).join(String(config.replacement ?? '')) : s
        case 'regex-extract': { if (!regex) return s; const m = s.match(regex); return m ? (m[1] ?? m[0]) : '' }
        default: return s
      }
    }
    const next = rows.map((row) => ({ ...row, [tgt]: apply(row[src]) }))
    ctx.log('info', `${op} sur "${src}" → "${tgt}".`)
    return { sheet: { ...sheet, rows: next } }
  },
})
```

- [ ] **Step 4: Run** → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/workflow/nodes/pure.ts functions/src/workflow/nodes/pure.test.ts
git commit -m "feat(functions): nodes purs (text-input, logic, transforms)"
```

---

## Task 8: Functions — clés API + LLM + Jina

**Files:**
- Create: `functions/src/workflow/apiKeys.ts`
- Create: `functions/src/workflow/llm.ts`
- Create: `functions/src/workflow/jina.ts`

- [ ] **Step 1: `apiKeys.ts`** — lecture des clés du user (cf. rapport : `users/{uid}.apiKeys.overrides`)

```ts
// functions/src/workflow/apiKeys.ts
import { getFirestore } from 'firebase-admin/firestore'

export async function getUserApiKey(uid: string, keyId: string): Promise<string> {
  const snap = await getFirestore().doc(`users/${uid}`).get()
  const overrides = (snap.data()?.apiKeys?.overrides ?? {}) as Record<string, string>
  return overrides[keyId] ?? ''
}
```

- [ ] **Step 2: `llm.ts`** — appel REST Anthropic puis fallback Gemini (clés user). Sortie texte brut.

```ts
// functions/src/workflow/llm.ts
import { getUserApiKey } from './apiKeys'

export interface LlmResult { text: string; model: string }

async function callAnthropic(key: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { content?: { text?: string }[] }
  return json.content?.map((c) => c.text ?? '').join('') ?? ''
}

async function callGemini(key: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: 4096 },
      }),
    },
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

/** Anthropic d'abord, fallback Gemini. Lève si aucune clé/aucun provider ne répond. */
export async function callLlm(uid: string, prompt: string): Promise<LlmResult> {
  const anthropic = await getUserApiKey(uid, 'anthropic')
  if (anthropic) {
    try { return { text: await callAnthropic(anthropic, prompt), model: 'claude-opus-4-7' } } catch { /* fallback */ }
  }
  const gemini = await getUserApiKey(uid, 'gemini')
  if (gemini) return { text: await callGemini(gemini, prompt), model: 'gemini-3.1-pro-preview' }
  throw new Error('Aucune clé LLM (anthropic/gemini) configurée pour cet utilisateur.')
}

/** Extrait le premier bloc JSON d'une réponse LLM (tolère les ```json fences). */
export function parseLlmJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.search(/[[{]/)
  if (start < 0) return null
  try { return JSON.parse(raw.slice(start)) as T } catch { return null }
}
```

- [ ] **Step 3: `jina.ts`** — Jina Reader + Search (clé user)

```ts
// functions/src/workflow/jina.ts
import { getUserApiKey } from './apiKeys'

async function jinaHeaders(uid: string): Promise<Record<string, string>> {
  const key = await getUserApiKey(uid, 'jina')
  const h: Record<string, string> = { Accept: 'application/json' }
  if (key) h.Authorization = `Bearer ${key}`
  return h
}

export async function jinaRead(uid: string, url: string): Promise<{ title: string; content: string }> {
  const res = await fetch(`https://r.jina.ai/${url}`, { headers: await jinaHeaders(uid) })
  if (!res.ok) throw new Error(`Jina read ${res.status}`)
  const json = (await res.json()) as { data?: { title?: string; content?: string } }
  return { title: json.data?.title ?? '', content: json.data?.content ?? '' }
}

export async function jinaSearch(uid: string, query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers: await jinaHeaders(uid) })
  if (!res.ok) throw new Error(`Jina search ${res.status}`)
  const json = (await res.json()) as { data?: { title?: string; url?: string; content?: string }[] }
  return (json.data ?? []).map((d) => ({ title: d.title ?? '', url: d.url ?? '', snippet: (d.content ?? '').slice(0, 500) }))
}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `cd functions && npx tsc -p tsconfig.json --noEmit`
Expected: pas d'erreur.

- [ ] **Step 5: Commit**

```bash
git add functions/src/workflow/apiKeys.ts functions/src/workflow/llm.ts functions/src/workflow/jina.ts
git commit -m "feat(functions): clés API user + LLM REST + Jina"
```

---

## Task 9: Functions — nodes réseau (web-search, scrape-url, enrichment)

**Files:**
- Create: `functions/src/workflow/nodes/network.ts`

> Note de portée : implémentation serveur **autonome** (Jina + 1 appel LLM d'extraction JSON), pas un port de `enrichRow` (pipeline client riche). Suffisant pour « scraper une URL → extraire des champs ».

- [ ] **Step 1: Écrire le module**

```ts
// functions/src/workflow/nodes/network.ts
import { registerServerNode } from '../registry'
import { jinaRead, jinaSearch } from '../jina'
import { callLlm, parseLlmJson } from '../llm'

function parseUrls(raw: unknown): string[] {
  return String(raw ?? '').split(/[\n,]/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s))
}
function parseFields(raw: unknown): string[] {
  return String(raw ?? '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
}

async function extractFields(uid: string, content: string, fields: string[]): Promise<Record<string, unknown>> {
  if (fields.length === 0) return {}
  const prompt =
    `Extrait les champs suivants du contenu de page ci-dessous. Réponds UNIQUEMENT par un objet JSON ` +
    `avec exactement ces clés : ${fields.join(', ')}. Valeur vide "" si absent.\n\n` +
    `--- CONTENU ---\n${content.slice(0, 12000)}`
  const { text } = await callLlm(uid, prompt)
  return parseLlmJson<Record<string, unknown>>(text) ?? {}
}

// --- web-search : Jina Search → sheet de résultats ---
registerServerNode({
  type: 'web-search',
  run: async (ctx, config) => {
    const queryTpl = String(config.query ?? '').trim()
    if (!queryTpl) { ctx.log('warn', 'Requête vide.'); return { sheet: { rows: [] } } }
    ctx.log('info', `Recherche web : "${queryTpl}"`)
    const results = await jinaSearch(ctx.uid, queryTpl)
    ctx.log('info', `${results.length} résultat(s).`)
    return { sheet: { rows: results } }
  },
})

// --- scrape-url : lit chaque URL + extrait les champs cibles ---
registerServerNode({
  type: 'scrape-url',
  run: async (ctx, config) => {
    const urls = parseUrls(config.urls)
    const fields = parseFields(config.fields)
    if (urls.length === 0) { ctx.log('warn', 'Aucune URL valide.'); return { sheet: { rows: [] } } }
    const rows: Record<string, unknown>[] = []
    for (const url of urls) {
      if (ctx.signal.aborted) throw new Error('Run aborted')
      ctx.log('info', `Scrape ${url}`)
      try {
        const { title, content } = await jinaRead(ctx.uid, url)
        const extracted = await extractFields(ctx.uid, content, fields)
        rows.push({ url, title, ...extracted })
      } catch (err) {
        ctx.log('warn', `Échec ${url} : ${err instanceof Error ? err.message : err}`)
        rows.push({ url, _error: String(err) })
      }
    }
    return { sheet: { rows } }
  },
})

// --- enrichment : pour chaque row, lit row[urlColumn] + complète les champs cibles ---
registerServerNode({
  type: 'enrichment',
  run: async (ctx, config, inputs) => {
    const urlCol = String(config.urlColumn ?? 'url').trim() || 'url'
    const fields = parseFields(config.fields)
    const sheet = (inputs.sheet ?? { rows: [] }) as { rows?: Record<string, unknown>[] }
    const rows = Array.isArray(sheet.rows) ? sheet.rows : []
    const out: Record<string, unknown>[] = []
    for (const row of rows) {
      if (ctx.signal.aborted) throw new Error('Run aborted')
      const url = String(row[urlCol] ?? '')
      if (!/^https?:\/\//.test(url)) { out.push(row); continue }
      try {
        const { content } = await jinaRead(ctx.uid, url)
        out.push({ ...row, ...(await extractFields(ctx.uid, content, fields)) })
      } catch (err) {
        ctx.log('warn', `Enrichissement échoué ${url} : ${err instanceof Error ? err.message : err}`)
        out.push(row)
      }
    }
    ctx.log('info', `Enrichi ${out.length} ligne(s).`)
    return { sheet: { rows: out } }
  },
})
```

- [ ] **Step 2: Compilation** `cd functions && npx tsc -p tsconfig.json --noEmit` → OK.

- [ ] **Step 3: Commit**

```bash
git add functions/src/workflow/nodes/network.ts
git commit -m "feat(functions): nodes réseau (web-search, scrape-url, enrichment)"
```

> ⚠️ Vérification de fidélité requise : confirmer que les **noms de champs de config** (`urls`, `fields`, `query`, `urlColumn`) correspondent au `configSchema` des nodes client correspondants (`scrapeNodes.ts`, `webSearchNode.ts`, `enrichmentNodes.ts`). Lire ces fichiers et ajuster les clés avant de committer si divergence.

---

## Task 10: Functions — nodes puits (save-pim, send-telegram)

**Files:**
- Create: `functions/src/workflow/nodes/sinks.ts`

- [ ] **Step 1: Écrire le module** (save-pim via admin batch sur `pim_projects/{projectId}/products` ; send-telegram via API Telegram, token depuis `users/{uid}.telegram.botToken`)

```ts
// functions/src/workflow/nodes/sinks.ts
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'

// --- save-pim ---
registerServerNode({
  type: 'save-pim',
  run: async (ctx, config, inputs) => {
    const projectId = String(config.projectId ?? '').trim()
    if (!projectId) throw new Error('save-pim : projectId manquant.')
    const sheet = (inputs.sheet ?? { rows: [] }) as { rows?: Record<string, unknown>[] }
    const rows = Array.isArray(sheet.rows) ? sheet.rows : []
    const db = getFirestore()
    let batch = db.batch()
    let n = 0
    for (let i = 0; i < rows.length; i++) {
      const ref = db.collection('pim_projects').doc(projectId).collection('products').doc()
      batch.set(ref, { fields: rows[i], createdAt: Date.now(), updatedAt: Date.now() })
      n++
      if (n % 400 === 0) { await batch.commit(); batch = db.batch() }
    }
    if (n % 400 !== 0) await batch.commit()
    ctx.log('info', `save-pim : ${n} produit(s) écrit(s) dans ${projectId}.`)
    return { result: { count: n, projectId } }
  },
})

// --- send-telegram ---
async function getBotToken(uid: string, override: unknown): Promise<string> {
  if (override && String(override).trim()) return String(override).trim()
  const snap = await getFirestore().doc(`users/${uid}`).get()
  return (snap.data()?.telegram?.botToken ?? '') as string
}

registerServerNode({
  type: 'send-telegram',
  run: async (ctx, config, inputs) => {
    const token = await getBotToken(ctx.uid, config.botToken)
    if (!token) throw new Error('send-telegram : bot token introuvable (config ou users/{uid}.telegram).')
    const chatId = String(config.chatId ?? '').trim()
    if (!chatId) throw new Error('send-telegram : chatId manquant.')
    // Le message a déjà été interpolé par l'orchestrator ; sinon fallback sur inputs.text.
    const text = String(config.message ?? inputs.text ?? '').trim() || '(message vide)'
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`)
    ctx.log('info', `Telegram envoyé à ${chatId}.`)
    void FieldValue // (placeholder import usage retiré si non utilisé)
    return { sent: true, count: 1 }
  },
})
```

> ⚠️ Vérification de fidélité : lire `telegramNodes.tsx` + `persistenceNodes.ts` pour confirmer les clés de config (`projectId`, `botToken`, `chatId`, `message`) et la structure produit attendue par le PIM. Ajuster avant commit. Retirer l'import `FieldValue` s'il reste inutilisé (sinon erreur lint `no-unused-vars`).

- [ ] **Step 2: Compilation** → OK.

- [ ] **Step 3: Commit**

```bash
git add functions/src/workflow/nodes/sinks.ts
git commit -m "feat(functions): nodes puits (save-pim, send-telegram)"
```

---

## Task 11: Functions — index des nodes + types refusés

**Files:**
- Create: `functions/src/workflow/nodes/index.ts`

- [ ] **Step 1: Écrire le module** (enregistre tout par effet de bord ; expose la liste des types refusés pour message clair)

```ts
// functions/src/workflow/nodes/index.ts
import './pure'
import './network'
import './sinks'

/** Types présents côté client mais non exécutables côté serveur (navigateur/OAuth/canvas). */
export const SERVER_UNSUPPORTED = new Set<string>([
  'export-pdf', 'image-to-svg', 'pdf-to-svg', 'decompose',
  'gsheets-import', 'gsheets-export', 'gdrive-import', 'gdrive-export', 'save-dam',
  'send-gmail', 'import-idml', 'import-svg', 'import-pptx', 'import-image',
  'import-csv', 'upload', 'export-excel', 'export-pptx', 'generate-image',
])
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/workflow/nodes/index.ts
git commit -m "feat(functions): index nodes + liste refusés serveur"
```

---

## Task 12: Functions — executor headless

**Files:**
- Create: `functions/src/workflow/execute.ts`
- Test: `functions/src/workflow/execute.test.ts`

Port fidèle de `executor.ts` : `detectLoops` + `executeLoopBody` + boucle principale, mais (1) sans Zustand — les états/outputs sont locaux ; (2) `cron` est ignoré comme node (source no-op qui émet `{ tick }`) ; (3) un type refusé → erreur de node ; (4) interpolation du config via `buildInterpolationContext` comme côté client.

- [ ] **Step 1: Write the failing test**

```ts
// functions/src/workflow/execute.test.ts
import { describe, it, expect } from 'vitest'
import './nodes/index'
import { executeWorkflowHeadless } from './execute'
import type { ServerWorkflow } from './types'

const wf: ServerWorkflow = {
  id: 'w', name: 'T', ownerId: 'u',
  nodes: [
    { id: 'a', type: 'text-input', config: { text: 'Bonjour' } },
    { id: 'b', type: 'if-else', config: { expression: "value === 'Bonjour'" } },
  ],
  edges: [{ id: 'e', source: 'a', sourceHandle: 'text', target: 'b', targetHandle: 'value' }],
}

describe('executeWorkflowHeadless', () => {
  it('exécute en ordre topo et câble les ports', async () => {
    const res = await executeWorkflowHeadless(wf, { uid: 'u', signal: new AbortController().signal })
    expect(res.status).toBe('success')
    expect(res.nodeOutputs.b).toEqual({ then: 'Bonjour' })
  })
  it('marque un type refusé en erreur', async () => {
    const bad: ServerWorkflow = { ...wf, nodes: [{ id: 'x', type: 'export-pdf', config: {} }], edges: [] }
    const res = await executeWorkflowHeadless(bad, { uid: 'u', signal: new AbortController().signal })
    expect(res.status).toBe('error')
    expect(res.errorCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run** `cd functions && npx vitest run src/workflow/execute.test.ts` → FAIL.

- [ ] **Step 3: Écrire l'executor** (port de `executor.ts:113-373`, sans Zustand)

```ts
// functions/src/workflow/execute.ts
import type { ServerWorkflow, ServerNode, ServerEdge, RunLog } from './types'
import { topoSort } from './topo'
import { interpolate } from './interpolate'
import { buildInterpolationContext } from './interpolate'
import { getServerNode } from './registry'
import { SERVER_UNSUPPORTED } from './nodes/index'

export interface HeadlessResult {
  status: 'success' | 'error' | 'partial'
  nodeCount: number
  errorCount: number
  logs: RunLog[]
  nodeOutputs: Record<string, Record<string, unknown>>
}

interface LoopPair { eachId: string; collectId: string; bodyIds: Set<string> }

function detectLoops(nodes: ServerNode[], edges: ServerEdge[]): LoopPair[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const outgoing = new Map<string, ServerEdge[]>()
  for (const e of edges) { (outgoing.get(e.source) ?? outgoing.set(e.source, []).get(e.source)!).push(e) }
  const pairs: LoopPair[] = []
  for (const node of nodes) {
    if (node.type !== 'loop-each') continue
    const visited = new Set<string>([node.id])
    const queue = [node.id]
    let collectId: string | null = null
    while (queue.length) {
      const cur = queue.shift()!
      for (const e of outgoing.get(cur) ?? []) {
        if (visited.has(e.target)) continue
        visited.add(e.target)
        const tgt = byId.get(e.target)
        if (!tgt) continue
        if (tgt.type === 'loop-collect') { if (!collectId) collectId = tgt.id; continue }
        queue.push(e.target)
      }
    }
    if (!collectId) continue
    const bodyIds = new Set(visited); bodyIds.delete(node.id); bodyIds.delete(collectId)
    pairs.push({ eachId: node.id, collectId, bodyIds })
  }
  return pairs
}

export async function executeWorkflowHeadless(
  wf: ServerWorkflow,
  opts: { uid: string; signal: AbortSignal },
): Promise<HeadlessResult> {
  const logs: RunLog[] = []
  const log = (level: RunLog['level'], msg: string, node?: string) => logs.push({ ts: Date.now(), level, node, msg })
  const nodeOutputs: Record<string, Record<string, unknown>> = {}
  const outputs = new Map<string, Record<string, unknown>>()
  const errored = new Set<string>()
  const skipped = new Set<string>()

  const loops = detectLoops(wf.nodes, wf.edges)
  const internalIds = new Set<string>()
  for (const p of loops) for (const id of p.bodyIds) internalIds.add(id)
  const loopByEach = new Map(loops.map((l) => [l.eachId, l]))
  const loopByCollect = new Map(loops.map((l) => [l.collectId, l]))

  const mainNodes = wf.nodes.filter((n) => !internalIds.has(n.id))
  const mainEdges = wf.edges.filter((e) => !internalIds.has(e.source) && !internalIds.has(e.target))
  let ordered: ServerNode[]
  try { ordered = topoSort(mainNodes, mainEdges) }
  catch (err) {
    log('error', err instanceof Error ? err.message : String(err))
    return { status: 'error', nodeCount: 0, errorCount: 1, logs, nodeOutputs }
  }

  const runBody = async (pair: LoopPair, item: unknown, idx: number): Promise<unknown> => {
    const bodyNodes = wf.nodes.filter((n) => pair.bodyIds.has(n.id))
    const innerEdges = wf.edges.filter((e) => pair.bodyIds.has(e.source) && pair.bodyIds.has(e.target))
    const orderedBody = topoSort(bodyNodes, innerEdges)
    const sub = new Map<string, Record<string, unknown>>([[pair.eachId, { item }]])
    for (const bn of orderedBody) {
      if (opts.signal.aborted) throw new Error('Run aborted')
      const spec = getServerNode(bn.type)
      if (!spec) throw new Error(`Type inconnu dans le body de loop : ${bn.type}`)
      const subInputs: Record<string, unknown> = {}
      for (const e of wf.edges) {
        if (e.target !== bn.id) continue
        const src = sub.get(e.source)
        if (src && e.sourceHandle in src) subInputs[e.targetHandle] = src[e.sourceHandle]
      }
      const itemProps = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : {}
      const ctx = buildInterpolationContext(subInputs, { ...itemProps, item, index: idx })
      const cfg = interpolate(bn.config, ctx) as Record<string, unknown>
      const result = await spec.run(
        { uid: opts.uid, signal: opts.signal, log: (lv, m) => log(lv, `[loop#${idx}] ${m}`, bn.id) },
        cfg, subInputs,
      )
      sub.set(bn.id, result ?? {})
    }
    const back = wf.edges.find((e) => e.target === pair.collectId && e.targetHandle === 'item')
    return back ? sub.get(back.source)?.[back.sourceHandle] : item
  }

  let nodeCount = 0
  for (const node of ordered) {
    const upstream = wf.edges.filter((e) => e.target === node.id && !internalIds.has(e.source))
    if (upstream.some((e) => skipped.has(e.source) || errored.has(e.source))) {
      skipped.add(node.id); continue
    }
    if (opts.signal.aborted) { errored.add(node.id); log('error', 'Run aborted', node.id); continue }
    if (node.type === 'cron') { outputs.set(node.id, { tick: { at: new Date().toISOString() } }); continue }
    if (loopByCollect.has(node.id) && !loopByEach.has(node.id)) { nodeCount++; continue }

    if (SERVER_UNSUPPORTED.has(node.type)) {
      errored.add(node.id); log('error', `Node « ${node.type} » non exécutable côté serveur.`, node.id); continue
    }
    const spec = getServerNode(node.type)
    if (!spec) { errored.add(node.id); log('error', `Type inconnu : ${node.type}`, node.id); continue }

    const inputs: Record<string, unknown> = {}
    for (const e of upstream) {
      const src = outputs.get(e.source)
      if (src && e.sourceHandle in src) inputs[e.targetHandle] = src[e.sourceHandle]
    }
    try {
      const loopPair = loopByEach.get(node.id)
      if (loopPair) {
        const items = inputs.items
        if (!Array.isArray(items)) throw new Error("Loop each : 'items' doit être un tableau.")
        log('info', `Loop : ${items.length} itération(s).`, node.id)
        const results: unknown[] = []
        for (let i = 0; i < items.length; i++) results.push(await runBody(loopPair, items[i], i))
        outputs.set(loopPair.collectId, { results })
        nodeOutputs[loopPair.collectId] = { results }
        outputs.set(node.id, { item: items[0] }); nodeCount++
        continue
      }
      const ctx = buildInterpolationContext(inputs)
      const cfg = interpolate(node.config, ctx) as Record<string, unknown>
      const result = await spec.run(
        { uid: opts.uid, signal: opts.signal, log: (lv, m) => log(lv, m, node.id) },
        cfg, inputs,
      )
      outputs.set(node.id, result ?? {})
      nodeOutputs[node.id] = result ?? {}
      nodeCount++
    } catch (err) {
      errored.add(node.id); log('error', err instanceof Error ? err.message : String(err), node.id)
    }
  }

  const errorCount = errored.size
  const status: HeadlessResult['status'] = errorCount === 0 ? 'success' : nodeCount > 0 ? 'partial' : 'error'
  return { status, nodeCount, errorCount, logs, nodeOutputs }
}
```

- [ ] **Step 4: Run** → PASS (2 tests). Corriger l'init de `outgoing` si la map inline pose souci (sinon remplacer par un bloc `if (!outgoing.has(e.source)) outgoing.set(e.source, []); outgoing.get(e.source)!.push(e)`).

- [ ] **Step 5: Commit**

```bash
git add functions/src/workflow/execute.ts functions/src/workflow/execute.test.ts
git commit -m "feat(functions): executor headless (port executor.ts)"
```

---

## Task 13: Functions — historique de run

**Files:**
- Create: `functions/src/workflow/runHistory.ts`

- [ ] **Step 1: Écrire le module**

```ts
// functions/src/workflow/runHistory.ts
import { getFirestore } from 'firebase-admin/firestore'
import type { HeadlessResult } from './execute'

const MAX_LOGS = 200

export async function writeRunHistory(
  uid: string,
  meta: { workflowId: string; name: string; trigger: 'cron' | 'manual'; startedAt: number },
  result: HeadlessResult,
): Promise<void> {
  const logs = result.logs.slice(-MAX_LOGS)
  await getFirestore().collection('users').doc(uid).collection('workflowRuns').add({
    workflowId: meta.workflowId, name: meta.name, trigger: meta.trigger,
    startedAt: meta.startedAt, endedAt: Date.now(),
    status: result.status, nodeCount: result.nodeCount, errorCount: result.errorCount, logs,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/workflow/runHistory.ts
git commit -m "feat(functions): écriture historique de run"
```

---

## Task 14: Functions — scanner `onSchedule` + callable `runWorkflowNow`

**Files:**
- Create: `functions/src/workflow/scheduler.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Écrire le scheduler**

```ts
// functions/src/workflow/scheduler.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { executeWorkflowHeadless } from './execute'
import { writeRunHistory } from './runHistory'
import { computeNextRun, type CronConfig } from './cronSchedule'
import type { ServerWorkflow } from './types'
import './nodes/index' // enregistre les nodes (effet de bord)

if (!getApps().length) initializeApp()

async function loadWorkflow(uid: string, workflowId: string): Promise<ServerWorkflow | null> {
  const snap = await getFirestore().doc(`users/${uid}/workflows/${workflowId}`).get()
  if (!snap.exists) return null
  const d = snap.data() as { name?: string; nodes?: unknown; edges?: unknown }
  return {
    id: workflowId, name: d.name ?? workflowId, ownerId: uid,
    nodes: (d.nodes ?? []) as ServerWorkflow['nodes'], edges: (d.edges ?? []) as ServerWorkflow['edges'],
  }
}

async function runOne(uid: string, workflowId: string, trigger: 'cron' | 'manual') {
  const wf = await loadWorkflow(uid, workflowId)
  if (!wf) throw new Error('Workflow introuvable.')
  const startedAt = Date.now()
  const ac = new AbortController()
  const result = await executeWorkflowHeadless(wf, { uid, signal: ac.signal })
  await writeRunHistory(uid, { workflowId, name: wf.name, trigger, startedAt }, result)
  return result
}

// Scanner : toutes les 10 min, exécute les plannings dûs.
export const workflowCronScheduler = onSchedule(
  { schedule: 'every 10 minutes', region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const due = await db.collection('workflowSchedules')
      .where('enabled', '==', true).where('nextRunAt', '<=', now).get()
    for (const docSnap of due.docs) {
      const s = docSnap.data() as { uid: string; workflowId: string; every: number; unit: CronConfig['unit'] }
      try {
        const result = await runOne(s.uid, s.workflowId, 'cron')
        await docSnap.ref.update({
          lastRunAt: now, lastStatus: result.status,
          nextRunAt: computeNextRun({ enabled: true, every: s.every, unit: s.unit }, now),
        })
      } catch (err) {
        await docSnap.ref.update({
          lastRunAt: now, lastStatus: 'error',
          nextRunAt: computeNextRun({ enabled: true, every: s.every, unit: s.unit }, now),
        })
        console.error('workflowCronScheduler: échec', s.workflowId, err)
      }
    }
  },
)

// Callable : exécution immédiate (bouton « Lancer maintenant (serveur) »).
export const runWorkflowNow = onCall(
  { region: 'europe-west1', timeoutSeconds: 300, memory: '512MiB' },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
    const workflowId = String((req.data as { workflowId?: string })?.workflowId ?? '')
    if (!workflowId) throw new HttpsError('invalid-argument', 'workflowId requis.')
    const result = await runOne(uid, workflowId, 'manual')
    return { status: result.status, nodeCount: result.nodeCount, errorCount: result.errorCount }
  },
)
```

- [ ] **Step 2: Exporter dans `index.ts`** — ajouter après la ligne d'export Telegram :

```ts
// --- Workflow cron serveur ---
export { workflowCronScheduler, runWorkflowNow } from './workflow/scheduler'
```

- [ ] **Step 3: Build functions**

Run: `cd functions && npm run build`
Expected: build OK, pas d'erreur TypeScript.

- [ ] **Step 4: Commit**

```bash
git add functions/src/workflow/scheduler.ts functions/src/index.ts
git commit -m "feat(functions): scanner onSchedule + callable runWorkflowNow"
```

---

## Task 15: Client — carte `cron` (palette)

**Files:**
- Create: `src/features/workflows/registry/cronNodes.ts`
- Modify: `src/features/workflows/registry/builtin.ts`

Le module client `runtime/cronSchedule.ts` est **déjà créé** (helpers + `CronConfig` + `CRON_UNIT_OPTIONS` + `describeCron`). Le node `cron` est en catégorie `import` (étape 1, toujours déverrouillée → plaçable en premier comme déclencheur). Unités exposées : heure/jour/semaine/mois (le helper supporte aussi minute mais on ne l'expose pas — sous l'intervalle du scanner serveur 10 min).

- [ ] **Step 1: Écrire le node**

```ts
// src/features/workflows/registry/cronNodes.ts
import { CalendarClock } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { describeCron, type CronConfig } from '../runtime/cronSchedule'

const SERVER_UNITS = [
  { value: 'hour', label: 'heure(s)' },
  { value: 'day', label: 'jour(s)' },
  { value: 'week', label: 'semaine(s)' },
  { value: 'month', label: 'mois' },
]

const cronNode: NodeSpec<CronConfig, Record<string, never>, { tick: { at: string } }> = {
  type: 'cron',
  category: 'import',
  label: 'Cron (planifié)',
  description:
    "Déclencheur planifié : exécute le workflow côté serveur à intervalle régulier (toutes les heures / jours / semaines / mois). Active « Planification » et sauvegarde pour enregistrer le cron.",
  icon: CalendarClock,
  inputs: [],
  outputs: [{ name: 'tick', type: 'any' }],
  configSchema: [
    { name: 'enabled', kind: 'checkbox', label: 'Planification active' },
    { name: 'every', kind: 'number', label: 'Tous les', default: 1 },
    { name: 'unit', kind: 'select', label: 'Unité', options: SERVER_UNITS, default: 'day' },
  ],
  defaultConfig: { enabled: false, every: 1, unit: 'day' },
  runtime: 'server',
  run: async (ctx, config) => {
    const at = new Date().toISOString()
    ctx.log('info', `Tick cron (tous les ${describeCron(config)}).`)
    return { tick: { at } }
  },
}

nodeRegistry.register(cronNode)
```

- [ ] **Step 2: Enregistrer dans `builtin.ts`** — ajouter après `import './decomposeNode'` :

```ts
import './cronNodes'
```

- [ ] **Step 3: Types client**

Run: `npx tsc -b`
Expected: pas d'erreur (le node `cron` est `runtime: 'server'`, valeur déjà permise par `NodeRuntime`).

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/registry/cronNodes.ts src/features/workflows/registry/builtin.ts
git commit -m "feat(workflows): carte Cron dans la palette"
```

---

## Task 16: Client — synchro du planning à la sauvegarde

**Files:**
- Create: `src/features/workflows/persistence/scheduleSync.ts`
- Modify: `src/features/workflows/persistence/workflowsApi.ts`

- [ ] **Step 1: Écrire `scheduleSync.ts`** (lit le doc Workflow, trouve un node `cron` actif, upsert/delete `workflowSchedules/{workflowId}`)

```ts
// src/features/workflows/persistence/scheduleSync.ts
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Workflow } from '../types'
import { computeNextRun, normalizeEvery, type CronConfig, type CronUnit } from '../runtime/cronSchedule'

function findActiveCron(wf: Workflow): CronConfig | null {
  for (const n of wf.nodes) {
    if (n.type !== 'cron') continue
    const c = n.config as Partial<CronConfig>
    if (c?.enabled) {
      const unit = (['hour', 'day', 'week', 'month'] as CronUnit[]).includes(c.unit as CronUnit)
        ? (c.unit as CronUnit) : 'day'
      return { enabled: true, every: normalizeEvery(c.every ?? 1), unit }
    }
  }
  return null
}

/** Synchronise le doc workflowSchedules à partir d'un éventuel node cron actif. */
export async function syncWorkflowSchedule(uid: string, wf: Workflow): Promise<void> {
  const ref = doc(db, 'workflowSchedules', wf.id)
  const cron = findActiveCron(wf)
  if (!cron) { await deleteDoc(ref).catch(() => {}); return }
  await setDoc(ref, {
    uid, workflowId: wf.id, name: wf.name,
    enabled: true, every: cron.every, unit: cron.unit,
    nextRunAt: computeNextRun(cron, Date.now()),
    updatedAt: Date.now(),
  }, { merge: true })
}
```

> Note : `computeNextRun` côté client doit accepter `'hour'` — vérifier que `runtime/cronSchedule.ts` (déjà créé) gère bien `'hour'` (il liste `minute|hour|day|week|month`, OK).

- [ ] **Step 2: Brancher dans `saveWorkflow`** — après l'écriture Firestore, appeler la synchro (best-effort, ne bloque pas la sauvegarde) :

```ts
// dans workflowsApi.ts, importer en tête :
import { syncWorkflowSchedule } from './scheduleSync'
// ... à la fin de saveWorkflow(uid, wf), après le setDoc existant :
await syncWorkflowSchedule(uid, wf).catch((e) => console.warn('syncWorkflowSchedule:', e))
```

- [ ] **Step 3: Types + lint**

Run: `npx tsc -b && npm run lint`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/persistence/scheduleSync.ts src/features/workflows/persistence/workflowsApi.ts
git commit -m "feat(workflows): synchro workflowSchedules à la sauvegarde"
```

---

## Task 17: Client — panneau de statut Cron + « Lancer maintenant (serveur) »

**Files:**
- Create: `src/features/workflows/editor/CronStatusPanel.tsx`
- Modify: `src/features/workflows/editor/WorkflowEditorPage.tsx`

- [ ] **Step 1: Écrire le panneau** (< 150 lignes ; lit `workflowSchedules/{id}` en temps réel, affiche prochaine/dernière exéc, bouton run-now via callable `runWorkflowNow`)

```tsx
// src/features/workflows/editor/CronStatusPanel.tsx
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { CalendarClock, Play, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { db, functions } from '@/lib/firebase/config'
import { formatCountdown } from '../runtime/cronSchedule'

interface ScheduleDoc {
  enabled: boolean; every: number; unit: string
  nextRunAt: number; lastRunAt?: number; lastStatus?: string
}

const runNow = httpsCallable<{ workflowId: string }, { status: string; nodeCount: number; errorCount: number }>(
  functions, 'runWorkflowNow',
)

export function CronStatusPanel({ workflowId }: { workflowId: string }) {
  const [sched, setSched] = useState<ScheduleDoc | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [running, setRunning] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'workflowSchedules', workflowId), (s) =>
    setSched(s.exists() ? (s.data() as ScheduleDoc) : null)), [workflowId])

  useEffect(() => {
    if (!sched?.enabled) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sched?.enabled])

  if (!sched?.enabled) return null

  const onRun = async () => {
    setRunning(true)
    try {
      const { data } = await runNow({ workflowId })
      if (data.errorCount > 0) toast.warning(`Run serveur : ${data.nodeCount} node(s), ${data.errorCount} erreur(s).`)
      else toast.success(`Run serveur OK — ${data.nodeCount} node(s).`)
    } catch (e) {
      toast.error(`Run serveur échoué : ${e instanceof Error ? e.message : e}`)
    } finally { setRunning(false) }
  }

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs">
      <CalendarClock className="w-3.5 h-3.5" />
      <span title="Planification serveur active">
        Prochaine · {formatCountdown(sched.nextRunAt - now)}
        {sched.lastStatus ? ` · dernier : ${sched.lastStatus}` : ''}
      </span>
      <button
        onClick={onRun}
        disabled={running}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/25 hover:bg-indigo-500/40 disabled:opacity-50"
        title="Exécuter maintenant côté serveur"
      >
        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
        Lancer (serveur)
      </button>
    </div>
  )
}
```

> Vérifier que `functions` est exporté depuis `@/lib/firebase/config` (sinon l'ajouter via `getFunctions(app, 'europe-west1')`). Confirmer la région côté client = `europe-west1`.

- [ ] **Step 2: Monter dans le header** de `WorkflowEditorPage.tsx` — importer puis insérer avant le bouton Run (le composant se masque seul si pas de planning actif) :

```tsx
import { CronStatusPanel } from './CronStatusPanel'
// ... dans le header, avant {isRunning ? ... } :
<CronStatusPanel workflowId={wf.id} />
```

- [ ] **Step 3: Types + lint**

Run: `npx tsc -b && npm run lint`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/editor/CronStatusPanel.tsx src/features/workflows/editor/WorkflowEditorPage.tsx
git commit -m "feat(workflows): panneau statut Cron + lancer maintenant (serveur)"
```

---

## Task 18: Vérification globale + déploiement

**Files:** aucun (vérification)

- [ ] **Step 1: Tests functions**

Run: `cd functions && npx vitest run`
Expected: tous verts (cronSchedule, interpolate, topo, pure, execute).

- [ ] **Step 2: Build functions**

Run: `cd functions && npm run build`
Expected: OK.

- [ ] **Step 3: Types + lint + tests client**

Run: `npx tsc -b && npm run lint && npm run test:run`
Expected: types OK, lint sans erreur bloquante, tests verts.

- [ ] **Step 4: Code mort**

Run: `npx knip`
Expected: exit 0 (ajouter à `knip.json` les éventuels faux positifs functions si besoin).

- [ ] **Step 5: Déployer** (règles + index + functions)

Run:
```bash
firebase deploy --only firestore:rules,firestore:indexes,functions:workflowCronScheduler,functions:runWorkflowNow
```
Expected: Cloud Scheduler créé pour `workflowCronScheduler` (every 10 minutes), callable `runWorkflowNow` déployé.

- [ ] **Step 6: Vérification réelle (manuelle)**
  1. Dans l'éditeur, glisser une carte **Cron** (every=1, unit=day, **Planification active**) + 1 node simple (ex : `text-input` → `send-telegram`). Sauvegarder.
  2. Vérifier la création de `workflowSchedules/{id}` dans la console Firestore.
  3. Cliquer **« Lancer (serveur) »** → toast de succès + 1 doc dans `users/{uid}/workflowRuns`.
  4. (Optionnel) Forcer `nextRunAt` dans le passé en base → attendre le tick scanner (≤ 10 min) → vérifier `lastRunAt`/`lastStatus` mis à jour + nouveau run.

- [ ] **Step 7: Commit final éventuel** (ajustements knip.json / config)

```bash
git add -A && git commit -m "chore: vérifs + déploiement cron serveur"
```

---

## Self-Review

**Spec coverage :**
- Carte « Cron » dans la palette → Task 15. ✅
- Cadences heure/jour/semaine/mois/N → `every` + `unit`, `computeNextRun` (Tasks 1, 15). ✅
- Exécution 100% serveur → executor headless (Task 12) + scanner `onSchedule` (Task 14). ✅
- Cloud Scheduler + Function → `workflowCronScheduler` (Task 14, auto-provisionné par `onSchedule`). ✅
- Nodes refusés explicitement → `SERVER_UNSUPPORTED` (Tasks 11, 12). ✅
- Historique / feedback utilisateur → `workflowRuns` + panneau statut (Tasks 13, 17). ✅

**Placeholder scan :** les deux blocs marqués « ⚠️ Vérification de fidélité » (Tasks 9, 10) exigent de lire les `configSchema` réels avant commit — ce sont des étapes de vérification explicites, pas des placeholders de code. L'import `FieldValue` non utilisé dans Task 10 est signalé à retirer.

**Type consistency :** `ServerNodeSpec.run`/`ServerRunCtx`/`ServerWorkflow` cohérents entre Tasks 3, 6, 7, 9, 10, 12. `CronConfig`/`computeNextRun`/`normalizeEvery` cohérents entre functions (Task 1) et client (`runtime/cronSchedule.ts` déjà créé). `HeadlessResult` défini Task 12, consommé Tasks 13–14. Callable `runWorkflowNow` signature alignée client (Task 17) ↔ serveur (Task 14).

**Risques connus à surveiller :**
- Noms de champs de config réseau/puits (Tasks 9–10) : à confirmer contre les sources client.
- `functions` exporté depuis `@/lib/firebase/config` avec la bonne région (Task 17).
- Coût/quotas : le scanner tourne toutes les 10 min même à vide (1 lecture indexée) — négligeable.
- Limite : cadence minimale effective = intervalle du scanner (10 min) ; « mois » exécuté à ±10 min près.
