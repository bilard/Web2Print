# IA complétion — remplissage de colonne par IA — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à la DataPage un modal « IA complétion » qui remplit en masse une colonne (nouvelle ou existante) via un prompt LLM référençant d'autres colonnes, par lots, avec aperçu.

**Architecture:** Toute la logique (découpage en lots, résolution des références `[colonne]`, schéma JSON, mapping des résultats, ET la boucle d'orchestration avec abort) vit dans un **engine pur** (`columnCompletionEngine.ts`) avec dépendances injectées → testable à 100 % sans React ni réseau. Un hook fin (`useColumnCompletion.ts`) fournit les dépendances réelles (`generateJson`, `updateCell`, état). Le modal et l'intégration DataPage suivent les patterns existants (`ScrapingModal`, lazy + Suspense).

**Tech Stack:** TypeScript strict (ES2022), Zustand (`useExcelStore`), `generateJson` (llmRouter), Zod, Vitest, React + shadcn/Tailwind.

## Global Constraints

- TypeScript strict, pas d'`any`, typer explicitement les props. Composants ≤ 150 lignes (sortir la logique de l'UI).
- Vérifier les types avec **`npx tsc -b`** (project references — `tsc --noEmit` ne vérifie rien).
- Tests : `npm run test:run -- <chemin>`. Knip exit 0 (n'exporter que ce qui est consommé hors du fichier).
- **Ne jamais modifier** `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`.
- Théming par tokens : `bg-surface`, `border-white/10`, `text-white/70` ; blanc vrai = `text-[#fff]` ; pas d'hex sombre en dur.
- Store = **`useExcelStore`** (`addColumn(sheetIdx, col, position?)`, `updateCell(sheetIdx, rowId, colKey, value)`), PAS le merge.store.
- Pas de modèle LLM par appel : le modèle est fixé par **tâche** via `TASK_ROUTING` ; il faut ajouter la tâche `data.columnCompletion`.
- Clé de nouvelle colonne = slug du label fourni par l'utilisateur, unique dans la sheet — **sans préfixe `ai_`** (les `ai_*` sont la cible d'un nettoyage automatique d'enrichissement ; une colonne voulue par l'utilisateur ne doit pas y être exposée).
- Lots de 20, aperçu sur 5 lignes, rate-limit ~300 ms entre lots, annulation entre lots.

---

### Task 1 : Engine — transformations pures

**Files:**
- Create: `src/features/excel/ai-completion/columnCompletionEngine.ts`
- Test: `src/features/excel/ai-completion/columnCompletionEngine.test.ts`

**Interfaces:**
- Consumes: `ExcelRow`, `ExcelColumn` (`@/features/excel/types`).
- Produces:
  - `buildChunks<T>(rows: T[], size?: number): T[][]`
  - `resolveColumnRefs(prompt: string, row: ExcelRow, columns: ExcelColumn[]): string`
  - `isRowEmpty(prompt: string, row: ExcelRow, columns: ExcelColumn[]): boolean`
  - `buildBatchPrompt(userPrompt: string, chunk: ExcelRow[], columns: ExcelColumn[]): string`
  - `CompletionBatchSchema` (Zod), `type CompletionBatch`, `COMPLETION_SCHEMA_FOR_LLM` (objet JSON Schema)
  - `mapResults(parsed: CompletionBatch, chunk: ExcelRow[]): Record<string, string>`
  - `uniqueColumnKey(label: string, existing: ExcelColumn[]): string`

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/excel/ai-completion/columnCompletionEngine.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildChunks, resolveColumnRefs, isRowEmpty, buildBatchPrompt,
  mapResults, uniqueColumnKey, CompletionBatchSchema,
} from './columnCompletionEngine'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'

const col = (key: string, label: string): ExcelColumn =>
  ({ key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 100 })
const COLS = [col('desc', 'Description'), col('name', 'Nom')]

describe('buildChunks', () => {
  it('découpe 174 lignes en lots de 20 (dernier = 14)', () => {
    const rows = Array.from({ length: 174 }, (_, i) => ({ _id: `r${i}` }))
    const chunks = buildChunks(rows, 20)
    expect(chunks.length).toBe(9)
    expect(chunks[8].length).toBe(14)
  })
})

describe('resolveColumnRefs', () => {
  it('remplace [Label] et [key] par la valeur de la ligne', () => {
    const row: ExcelRow = { _id: 'r1', desc: 'Perceuse 18V', name: '' }
    expect(resolveColumnRefs('Nom court de [Description]', row, COLS)).toBe('Nom court de Perceuse 18V')
    expect(resolveColumnRefs('val [desc]', row, COLS)).toBe('val Perceuse 18V')
  })
  it('référence inconnue → chaîne vide', () => {
    const row: ExcelRow = { _id: 'r1', desc: 'x', name: 'y' }
    expect(resolveColumnRefs('[Inexistant]', row, COLS)).toBe('')
  })
})

describe('isRowEmpty', () => {
  it('vrai quand toutes les références résolues sont vides', () => {
    expect(isRowEmpty('[Description]', { _id: 'r1', desc: '', name: 'y' }, COLS)).toBe(true)
    expect(isRowEmpty('[Description]', { _id: 'r1', desc: 'x', name: '' }, COLS)).toBe(false)
  })
})

describe('buildBatchPrompt', () => {
  it('numérote les entrées 0..n-1 avec les références résolues', () => {
    const chunk: ExcelRow[] = [
      { _id: 'a', desc: 'Perceuse', name: '' },
      { _id: 'b', desc: 'Visseuse', name: '' },
    ]
    const p = buildBatchPrompt('Nom court de [Description]', chunk, COLS)
    expect(p).toContain('0:')
    expect(p).toContain('Perceuse')
    expect(p).toContain('1:')
    expect(p).toContain('Visseuse')
  })
})

describe('mapResults', () => {
  it('mappe les résultats indexés vers rowId ; index manquant absent', () => {
    const chunk: ExcelRow[] = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]
    const parsed = CompletionBatchSchema.parse({ results: [{ i: 0, v: 'X' }, { i: 2, v: 'Z' }] })
    const m = mapResults(parsed, chunk)
    expect(m).toEqual({ a: 'X', c: 'Z' })
  })
  it('ignore un index hors plage', () => {
    const chunk: ExcelRow[] = [{ _id: 'a' }]
    const parsed = CompletionBatchSchema.parse({ results: [{ i: 5, v: 'X' }] })
    expect(mapResults(parsed, chunk)).toEqual({})
  })
})

describe('uniqueColumnKey', () => {
  it('slug du label, suffixé si collision', () => {
    const existing = [col('nom_court', 'Nom court')]
    expect(uniqueColumnKey('Nouvelle Col', existing)).toBe('nouvelle_col')
    expect(uniqueColumnKey('Nom court', existing)).toBe('nom_court_2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/excel/ai-completion/columnCompletionEngine.test.ts`
Expected: FAIL — `Cannot find module './columnCompletionEngine'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/features/excel/ai-completion/columnCompletionEngine.ts
import { z } from 'zod'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'

/** Découpe un tableau en lots de `size`. */
export function buildChunks<T>(rows: T[], size = 20): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

/** Remplace les références `[Label]` ou `[key]` par la valeur de la ligne (vide si inconnue). */
export function resolveColumnRefs(prompt: string, row: ExcelRow, columns: ExcelColumn[]): string {
  return prompt.replace(/\[([^\]]+)\]/g, (_m, ref: string) => {
    const r = ref.trim()
    const col = columns.find((c) => c.label === r || c.key === r)
    if (!col) return ''
    const v = row[col.key]
    return v === null || v === undefined ? '' : String(v)
  })
}

/** Vrai si la résolution des références ne produit aucun texte non vide. */
export function isRowEmpty(prompt: string, row: ExcelRow, columns: ExcelColumn[]): boolean {
  return resolveColumnRefs(prompt, row, columns).trim().length === 0
}

/** Construit un prompt unique pour un lot : consigne + entrées numérotées 0..n-1. */
export function buildBatchPrompt(userPrompt: string, chunk: ExcelRow[], columns: ExcelColumn[]): string {
  const entries = chunk
    .map((row, i) => `${i}: ${resolveColumnRefs(userPrompt, row, columns)}`)
    .join('\n')
  return [
    `Pour CHAQUE entrée ci-dessous, applique la consigne et renvoie un résultat.`,
    `Consigne : ${userPrompt}`,
    `Réponds STRICTEMENT en JSON : {"results":[{"i":<index de l'entrée>,"v":"<résultat>"}]}.`,
    `Un objet par entrée, dans l'ordre, sans texte hors JSON.`,
    ``,
    `Entrées :`,
    entries,
  ].join('\n')
}

export const CompletionBatchSchema = z.object({
  results: z.array(z.object({ i: z.number(), v: z.string() })),
})
export type CompletionBatch = z.infer<typeof CompletionBatchSchema>

/** JSON Schema équivalent (Gemini responseSchema / Claude tool input_schema). */
export const COMPLETION_SCHEMA_FOR_LLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: { i: { type: 'number' }, v: { type: 'string' } },
        required: ['i', 'v'],
      },
    },
  },
  required: ['results'],
}

/** Mappe les résultats indexés du lot vers `{ rowId → valeur }`. */
export function mapResults(parsed: CompletionBatch, chunk: ExcelRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { i, v } of parsed.results) {
    const row = chunk[i]
    if (row) out[row._id] = v
  }
  return out
}

/** Slug du label, garanti unique parmi les clés existantes (suffixe _2, _3…). */
export function uniqueColumnKey(label: string, existing: ExcelColumn[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'colonne'
  const keys = new Set(existing.map((c) => c.key))
  if (!keys.has(base)) return base
  let n = 2
  while (keys.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/excel/ai-completion/columnCompletionEngine.test.ts`
Expected: PASS (toutes les assertions).

- [ ] **Step 5: Commit**

```bash
git add src/features/excel/ai-completion/columnCompletionEngine.ts src/features/excel/ai-completion/columnCompletionEngine.test.ts
git commit -m "feat(data): engine IA complétion — chunks, refs colonnes, schéma, mapping"
```

---

### Task 2 : Engine — orchestrateur de lots (avec abort)

**Files:**
- Modify: `src/features/excel/ai-completion/columnCompletionEngine.ts`
- Test: `src/features/excel/ai-completion/runCompletionBatches.test.ts`

**Interfaces:**
- Consumes: `buildChunks`, `isRowEmpty` (Task 1).
- Produces:
  - `interface BatchRunDeps { callBatch: (chunk: ExcelRow[]) => Promise<Record<string, string>>; onItem: (rowId: string, status: CompletionStatus, value?: string, error?: string) => void; onChunkDone?: (index: number, total: number) => void; abortRef: { current: boolean }; rateLimitMs?: number; sleep?: (ms: number) => Promise<void> }`
  - `type CompletionStatus = 'done' | 'failed' | 'skipped' | 'aborted'`
  - `runCompletionBatches(rows: ExcelRow[], prompt: string, columns: ExcelColumn[], deps: BatchRunDeps, chunkSize?: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/excel/ai-completion/runCompletionBatches.test.ts
import { describe, it, expect, vi } from 'vitest'
import { runCompletionBatches } from './columnCompletionEngine'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'

const COLS: ExcelColumn[] = [
  { key: 'desc', label: 'Description', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 100 },
]
const noSleep = () => Promise.resolve()

describe('runCompletionBatches', () => {
  it('appelle callBatch par lot et émet done par ligne résolue', async () => {
    const rows: ExcelRow[] = [{ _id: 'a', desc: 'x' }, { _id: 'b', desc: 'y' }]
    const onItem = vi.fn()
    const callBatch = vi.fn().mockResolvedValue({ a: 'AA', b: 'BB' })
    await runCompletionBatches(rows, '[Description]', COLS, { callBatch, onItem, abortRef: { current: false }, sleep: noSleep }, 20)
    expect(callBatch).toHaveBeenCalledTimes(1)
    expect(onItem).toHaveBeenCalledWith('a', 'done', 'AA')
    expect(onItem).toHaveBeenCalledWith('b', 'done', 'BB')
  })

  it('marque skipped les lignes dont les références sont vides (sans les envoyer)', async () => {
    const rows: ExcelRow[] = [{ _id: 'a', desc: '' }, { _id: 'b', desc: 'y' }]
    const onItem = vi.fn()
    const callBatch = vi.fn().mockImplementation(async (chunk: ExcelRow[]) => {
      expect(chunk.map((r) => r._id)).toEqual(['b']) // 'a' filtrée
      return { b: 'BB' }
    })
    await runCompletionBatches(rows, '[Description]', COLS, { callBatch, onItem, abortRef: { current: false }, sleep: noSleep }, 20)
    expect(onItem).toHaveBeenCalledWith('a', 'skipped')
    expect(onItem).toHaveBeenCalledWith('b', 'done', 'BB')
  })

  it('marque failed une ligne sans résultat dans la réponse', async () => {
    const rows: ExcelRow[] = [{ _id: 'a', desc: 'x' }]
    const onItem = vi.fn()
    const callBatch = vi.fn().mockResolvedValue({}) // aucun résultat
    await runCompletionBatches(rows, '[Description]', COLS, { callBatch, onItem, abortRef: { current: false }, sleep: noSleep }, 20)
    expect(onItem).toHaveBeenCalledWith('a', 'failed', undefined, expect.any(String))
  })

  it('s’arrête entre lots si abortRef passe à true et marque le reste aborted', async () => {
    const rows: ExcelRow[] = Array.from({ length: 40 }, (_, i) => ({ _id: `r${i}`, desc: 'x' }))
    const onItem = vi.fn()
    const abortRef = { current: false }
    const callBatch = vi.fn().mockImplementation(async () => { abortRef.current = true; return {} })
    await runCompletionBatches(rows, '[Description]', COLS, { callBatch, onItem, abortRef, sleep: noSleep }, 20)
    expect(callBatch).toHaveBeenCalledTimes(1) // 2e lot non lancé
    expect(onItem).toHaveBeenCalledWith('r20', 'aborted')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/features/excel/ai-completion/runCompletionBatches.test.ts`
Expected: FAIL — `runCompletionBatches` n'est pas exporté.

- [ ] **Step 3: Write minimal implementation**

Ajouter à la fin de `src/features/excel/ai-completion/columnCompletionEngine.ts` :

```typescript
export type CompletionStatus = 'done' | 'failed' | 'skipped' | 'aborted'

export interface BatchRunDeps {
  callBatch: (chunk: ExcelRow[]) => Promise<Record<string, string>>
  onItem: (rowId: string, status: CompletionStatus, value?: string, error?: string) => void
  onChunkDone?: (index: number, total: number) => void
  abortRef: { current: boolean }
  rateLimitMs?: number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Orchestration des lots, avec dépendances injectées (testable sans React ni réseau).
 * Filtre les lignes vides (skipped), appelle callBatch sur le reste, mappe les résultats
 * (done / failed), s'arrête proprement entre lots si abortRef devient true (aborted).
 */
export async function runCompletionBatches(
  rows: ExcelRow[],
  prompt: string,
  columns: ExcelColumn[],
  deps: BatchRunDeps,
  chunkSize = 20,
): Promise<void> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const rateLimitMs = deps.rateLimitMs ?? 300
  const chunks = buildChunks(rows, chunkSize)

  for (let c = 0; c < chunks.length; c++) {
    if (deps.abortRef.current) {
      for (let k = c; k < chunks.length; k++) for (const row of chunks[k]) deps.onItem(row._id, 'aborted')
      return
    }
    const chunk = chunks[c]
    const toSend: ExcelRow[] = []
    for (const row of chunk) {
      if (isRowEmpty(prompt, row, columns)) deps.onItem(row._id, 'skipped')
      else toSend.push(row)
    }

    if (toSend.length > 0) {
      try {
        const results = await deps.callBatch(toSend)
        for (const row of toSend) {
          if (Object.prototype.hasOwnProperty.call(results, row._id)) {
            deps.onItem(row._id, 'done', results[row._id])
          } else {
            deps.onItem(row._id, 'failed', undefined, 'Aucun résultat renvoyé pour cette ligne')
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur'
        for (const row of toSend) deps.onItem(row._id, 'failed', undefined, msg)
      }
    }

    deps.onChunkDone?.(c, chunks.length)
    if (c < chunks.length - 1 && !deps.abortRef.current) await sleep(rateLimitMs)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/features/excel/ai-completion/runCompletionBatches.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/excel/ai-completion/columnCompletionEngine.ts src/features/excel/ai-completion/runCompletionBatches.test.ts
git commit -m "feat(data): orchestrateur de lots IA complétion (skip vides, abort, mapping)"
```

---

### Task 3 : Tâche LLM + hook orchestrateur

**Files:**
- Modify: `src/features/ai/llmRouter.ts` (type `LLMTask`, `TASK_ROUTING`, `TASK_TEMPERATURE`)
- Create: `src/features/excel/ai-completion/useColumnCompletion.ts`

**Interfaces:**
- Consumes: tout l'engine (Task 1+2) ; `generateJson` (`@/features/ai/llmRouter`) ; `useExcelStore` (`addColumn`, `updateCell`).
- Produces:
  - `interface CompletionInput { prompt: string; rows: ExcelRow[]; columns: ExcelColumn[] }`
  - `interface CompletionItem { rowId: string; status: CompletionStatus; value?: string; error?: string }`
  - `useColumnCompletion()` retournant `{ items, running, runPreview, runAll, abort, ensureTargetColumn }` (types détaillés dans le code ci-dessous).

- [ ] **Step 1: Ajouter la tâche LLM `data.columnCompletion`**

Dans `src/features/ai/llmRouter.ts` :
- au type `LLMTask` (union, vers la ligne 65), ajouter `| 'data.columnCompletion'` ;
- dans `TASK_ROUTING` (Record exhaustif), ajouter :
```typescript
  // claude en primary (JSON fiable via tool-use, prend son défaut), gemini en fallback ÉPINGLÉ
  // sur 3.1-pro-preview : `modelForProvider` n'applique l'override qu'au provider dont le préfixe
  // correspond → ici il épingle le FALLBACK gemini (pas le primary claude). Même pattern que
  // 'telegram.chat'. NE PAS mettre 'claude-opus-4-8' ici, sinon le fallback gemini retombe sur
  // son défaut (souvent gemini-3.5-flash, JSON ~50 % d'échec, cf. mémoire projet).
  'data.columnCompletion': { primary: 'claude', fallback: 'gemini', model: 'gemini-3.1-pro-preview' },
```
- dans `TASK_TEMPERATURE` (Record exhaustif), ajouter :
```typescript
  'data.columnCompletion': 0.4,
```

> Les deux `Record<LLMTask, …>` étant exhaustifs, `tsc -b` échouera tant que les deux entrées
> ne sont pas ajoutées — c'est la vérification de cette étape.

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc -b`
Expected: aucune erreur (les deux entrées présentes rendent les Records exhaustifs).

- [ ] **Step 3: Écrire le hook**

Le hook est un wrapper fin : il fournit le `callBatch` réel (qui appelle `generateJson`) et les
callbacks d'écriture, puis délègue la boucle à `runCompletionBatches` (déjà testé). Aucune
logique de découpage/abort réimplémentée ici.

```typescript
// src/features/excel/ai-completion/useColumnCompletion.ts
import { useCallback, useRef, useState } from 'react'
import { useExcelStore } from '@/stores/excel.store'
import { generateJson } from '@/features/ai/llmRouter'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'
import {
  buildBatchPrompt, mapResults, runCompletionBatches, uniqueColumnKey,
  CompletionBatchSchema, COMPLETION_SCHEMA_FOR_LLM,
  type CompletionStatus,
} from './columnCompletionEngine'

export interface CompletionItem {
  rowId: string
  status: CompletionStatus
  value?: string
  error?: string
}

interface RunInput {
  prompt: string
  rows: ExcelRow[]
  columns: ExcelColumn[]
  targetColKey: string
  write: boolean // true = écrit dans le store (runAll) ; false = aperçu
}

const PREVIEW_COUNT = 5

async function callBatchLLM(
  prompt: string, chunk: ExcelRow[], columns: ExcelColumn[],
): Promise<Record<string, string>> {
  const parsed = await generateJson({
    task: 'data.columnCompletion',
    prompt: buildBatchPrompt(prompt, chunk, columns),
    schema: CompletionBatchSchema,
    schemaForLLM: COMPLETION_SCHEMA_FOR_LLM,
    version: 'column-completion-v1',
  })
  return mapResults(parsed, chunk)
}

export function useColumnCompletion() {
  const [items, setItems] = useState<CompletionItem[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef({ current: false })

  const run = useCallback(async (input: RunInput): Promise<void> => {
    setRunning(true)
    abortRef.current.current = false
    setItems(input.rows.map((r) => ({ rowId: r._id, status: 'failed' as CompletionStatus })))
    const { sheets, activeSheetIndex } = useExcelStore.getState()
    const sheetIdx = activeSheetIndex
    const updateCell = useExcelStore.getState().updateCell
    try {
      await runCompletionBatches(input.rows, input.prompt, input.columns, {
        callBatch: (chunk) => callBatchLLM(input.prompt, chunk, input.columns),
        abortRef: abortRef.current,
        onItem: (rowId, status, value, error) => {
          setItems((prev) => prev.map((it) => (it.rowId === rowId ? { rowId, status, value, error } : it)))
          if (input.write && status === 'done' && value !== undefined) {
            updateCell(sheetIdx, rowId, input.targetColKey, value)
          }
        },
      })
    } finally {
      setRunning(false)
    }
    void sheets
  }, [])

  /** Crée la colonne cible si demandé ; retourne sa clé. */
  const ensureTargetColumn = useCallback((opts: { mode: 'new' | 'existing'; label: string; existingKey?: string }): string => {
    const { sheets, activeSheetIndex, addColumn } = useExcelStore.getState()
    const sheet = sheets[activeSheetIndex]
    if (opts.mode === 'existing' && opts.existingKey) return opts.existingKey
    const key = uniqueColumnKey(opts.label, sheet?.columns ?? [])
    addColumn(activeSheetIndex, {
      key, label: opts.label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 240,
    })
    return key
  }, [])

  const runPreview = useCallback((p: { prompt: string; rows: ExcelRow[]; columns: ExcelColumn[] }) =>
    run({ ...p, rows: p.rows.slice(0, PREVIEW_COUNT), targetColKey: '__preview__', write: false }), [run])

  const runAll = useCallback((p: RunInput) => run(p), [run])

  const abort = useCallback(() => { abortRef.current.current = true }, [])

  return { items, running, runPreview, runAll, abort, ensureTargetColumn }
}
```

- [ ] **Step 4: Vérifier compilation + non-régression**

Run: `npx tsc -b`
Expected: aucune erreur.

Run: `npm run test:run -- src/features/excel/ai-completion`
Expected: PASS (les tests engine restent verts ; le hook n'a pas de test unitaire — sa logique est couverte par l'engine).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/llmRouter.ts src/features/excel/ai-completion/useColumnCompletion.ts
git commit -m "feat(data): tâche LLM data.columnCompletion + hook useColumnCompletion"
```

---

### Task 4 : Modal « IA complétion »

UI uniquement (logique déléguée au hook). Pas de test unitaire de composant (le projet ne teste
pas les composants React) — validation par `tsc -b` + build. Le composant dépasse 150 lignes :
le découper en sous-sections internes au même fichier reste acceptable, mais garder la logique
hors UI (déjà le cas via le hook).

**Files:**
- Create: `src/features/excel/ai-completion/ColumnCompletionModal.tsx`

**Interfaces:**
- Consumes: `useColumnCompletion` (Task 3) ; `pushAiUsageListener` (`@/features/stats/aiUsageTracking`) ; `useExcelStore`.
- Produces: `export function ColumnCompletionModal(props: { open: boolean; onClose: () => void; visibleRowIds: string[] }): JSX.Element | null`

- [ ] **Step 1: Écrire le composant**

```tsx
// src/features/excel/ai-completion/ColumnCompletionModal.tsx
import { useEffect, useMemo, useState } from 'react'
import { Wand2, X } from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { pushAiUsageListener } from '@/features/stats/aiUsageTracking'
import { useColumnCompletion } from './useColumnCompletion'
import type { ExcelRow } from '@/features/excel/types'

interface Props { open: boolean; onClose: () => void; visibleRowIds: string[] }

export function ColumnCompletionModal({ open, onClose, visibleRowIds }: Props) {
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex]
  const { items, running, runPreview, runAll, abort, ensureTargetColumn } = useColumnCompletion()

  const [prompt, setPrompt] = useState('')
  const [destMode, setDestMode] = useState<'new' | 'existing'>('new')
  const [newLabel, setNewLabel] = useState('Résultat IA')
  const [existingKey, setExistingKey] = useState('')
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [scopeAll, setScopeAll] = useState(true)
  const [previewed, setPreviewed] = useState(false)
  const [costUsd, setCostUsd] = useState(0)
  // Garde-fou anti-doublon : clé de la colonne créée pendant CETTE session « nouvelle colonne ».
  // Un 2e clic « Appliquer » réécrit la même colonne au lieu d'en créer une autre (resultat_ia_2…).
  const [appliedNewColKey, setAppliedNewColKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCostUsd(0)
    const unsub = pushAiUsageListener(({ costUsd: c }) => setCostUsd((x) => x + c))
    return unsub
  }, [open])

  const scopedRows: ExcelRow[] = useMemo(() => {
    if (!sheet) return []
    if (scopeAll) return sheet.rows
    const set = new Set(visibleRowIds)
    return sheet.rows.filter((r) => set.has(r._id))
  }, [sheet, scopeAll, visibleRowIds])

  if (!open || !sheet) return null

  const canApply = previewed && prompt.trim().length > 0 && !running &&
    (destMode === 'new' ? newLabel.trim().length > 0 : (existingKey !== '' && confirmOverwrite))

  const handlePreview = async () => {
    await runPreview({ prompt, rows: scopedRows, columns: sheet.columns })
    setPreviewed(true)
  }
  const handleApply = async () => {
    let targetColKey: string
    if (destMode === 'existing') {
      targetColKey = existingKey
    } else if (appliedNewColKey) {
      targetColKey = appliedNewColKey // ré-application : réécrit la colonne déjà créée
    } else {
      targetColKey = ensureTargetColumn({ mode: 'new', label: newLabel.trim() })
      setAppliedNewColKey(targetColKey)
    }
    await runAll({ prompt, rows: scopedRows, columns: sheet.columns, targetColKey, write: true })
  }

  const previewRows = items.slice(0, 5)
  const doneCount = items.filter((i) => i.status === 'done').length

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface border border-white/10 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-white/90 font-medium">
            <Wand2 className="w-4 h-4" /> IA complétion
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white/90"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[13px] text-white/80">
          <div>
            <label className="block mb-1 text-white/60">Consigne (référencez vos colonnes avec [Nom])</label>
            <textarea
              value={prompt} onChange={(e) => { setPrompt(e.target.value); setPreviewed(false) }}
              rows={3} placeholder="Ex : Génère un nom de produit court à partir de [Description]"
              className="w-full bg-well border border-white/10 rounded p-2 text-white/90"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {sheet.columns.map((c) => (
                <button key={c.key} onClick={() => { setPrompt((p) => `${p}[${c.label}]`); setPreviewed(false) }}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 text-[12px]">
                  [{c.label}]
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-white/60">Destination</div>
            <label className="flex items-center gap-2">
              <input type="radio" checked={destMode === 'new'} onChange={() => { setDestMode('new'); setAppliedNewColKey(null) }} />
              Nouvelle colonne
              {destMode === 'new' && (
                <input value={newLabel} onChange={(e) => { setNewLabel(e.target.value); setAppliedNewColKey(null) }}
                  className="ml-2 bg-well border border-white/10 rounded px-2 py-0.5 text-white/90" />
              )}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={destMode === 'existing'} onChange={() => setDestMode('existing')} />
              Colonne existante
              {destMode === 'existing' && (
                <select value={existingKey} onChange={(e) => setExistingKey(e.target.value)}
                  className="ml-2 bg-well border border-white/10 rounded px-2 py-0.5 text-white/90">
                  <option value="">— choisir —</option>
                  {sheet.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              )}
            </label>
            {destMode === 'existing' && existingKey && (
              <label className="flex items-center gap-2 text-amber-400/90">
                <input type="checkbox" checked={confirmOverwrite} onChange={(e) => setConfirmOverwrite(e.target.checked)} />
                J'écrase les valeurs existantes de cette colonne
              </label>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-white/60">Portée</div>
            <label className="flex items-center gap-2">
              <input type="radio" checked={scopeAll} onChange={() => setScopeAll(true)} />
              Toutes les lignes ({sheet.rows.length})
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!scopeAll} onChange={() => setScopeAll(false)} />
              Lignes filtrées ({visibleRowIds.length})
            </label>
          </div>

          {previewed && (
            <div className="border border-white/10 rounded">
              <div className="px-2 py-1 text-white/60 border-b border-white/10">Aperçu</div>
              <table className="w-full text-[12px]">
                <tbody>
                  {previewRows.map((it) => (
                    <tr key={it.rowId} className="border-b border-white/5">
                      <td className="px-2 py-1 text-white/50">{it.status}</td>
                      <td className="px-2 py-1 text-white/90">{it.value ?? it.error ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
          <div className="text-[12px] text-white/50">
            {running ? `En cours… ${doneCount}/${scopedRows.length}` : `Coût : ${costUsd.toFixed(4)} $`}
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <button onClick={abort} className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/80">Annuler</button>
            ) : (
              <>
                <button onClick={handlePreview} disabled={!prompt.trim() || running}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-40">
                  Aperçu (5 lignes)
                </button>
                <button onClick={handleApply} disabled={!canApply}
                  className="px-3 py-1.5 rounded bg-accent text-[#fff] disabled:opacity-40">
                  Appliquer à tout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc -b`
Expected: aucune erreur. (Si la classe `bg-accent` n'existe pas, remplacer par `bg-[#6366f1]` — accent du projet.)

- [ ] **Step 3: Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/features/excel/ai-completion/ColumnCompletionModal.tsx
git commit -m "feat(data): modal IA complétion (prompt, destination, portée, aperçu, coût)"
```

---

### Task 5 : Intégration DataPage

**Files:**
- Modify: `src/pages/DataPage.tsx` (lazy import ~ligne 25-38 ; état ~ligne 76 ; bouton toolbar ~ligne 596-607 ; montage `<Suspense>` ~ligne 734-750)

**Interfaces:**
- Consumes: `ColumnCompletionModal` (Task 4) ; `filteredRowIds` (déjà calculé dans DataPage via useMemo).
- Produces: aucun nouveau symbole exporté.

- [ ] **Step 1: Déclarer le lazy import**

Près des autres `lazy(...)` (vers la ligne 25-38) de `src/pages/DataPage.tsx` :

```typescript
const ColumnCompletionModal = lazy(() =>
  import('@/features/excel/ai-completion/ColumnCompletionModal').then((m) => ({ default: m.ColumnCompletionModal })),
)
```

- [ ] **Step 2: Ajouter l'état d'ouverture**

Près de `const [scrapingOpen, setScrapingOpen] = useState(false)` (vers la ligne 76) :

```typescript
const [aiCompletionOpen, setAiCompletionOpen] = useState(false)
```

- [ ] **Step 3: Ajouter le bouton toolbar**

Juste après le bloc bouton « Scraper le web » (le `{canScrape && (…)}` vers la ligne 596-607),
ajouter un bouton calqué sur le même style :

```tsx
{canScrape && (
  <button
    onClick={() => setAiCompletionOpen(true)}
    disabled={!hasSelectedDb}
    className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 disabled:text-white/25 disabled:hover:bg-white/5 disabled:cursor-not-allowed text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
    title={hasSelectedDb ? 'Compléter une colonne par IA' : 'Sélectionnez une base de données'}
  >
    <Wand2 className="w-4 h-4" />
    IA complétion
  </button>
)}
```

Ajouter `Wand2` à l'import `lucide-react` en tête de fichier (à la liste d'icônes existante).

- [ ] **Step 4: Monter le modal**

Près du montage `<Suspense>` de `ScrapingModal` (vers la ligne 734-750) :

```tsx
<Suspense fallback={null}>
  {aiCompletionOpen && (
    <ColumnCompletionModal
      open={aiCompletionOpen}
      onClose={() => setAiCompletionOpen(false)}
      visibleRowIds={filteredRowIds}
    />
  )}
</Suspense>
```

> `filteredRowIds` est la valeur du `useMemo` existant (DataPage ~ligne 131-168). Si son nom
> diffère légèrement dans le fichier, utiliser la variable réelle des IDs de lignes visibles.

- [ ] **Step 5: Vérifier compilation + build + knip**

Run: `npx tsc -b`
Expected: aucune erreur.

Run: `npm run build`
Expected: build OK.

Run: `npx knip`
Expected: exit 0 (le modal et le hook sont consommés ; l'engine est consommé par le hook + tests).

- [ ] **Step 6: Commit**

```bash
git add src/pages/DataPage.tsx
git commit -m "feat(data): bouton et montage du modal IA complétion dans DataPage"
```

---

## Self-review

- **Couverture spec** : destination nouvelle/existante (T3 `ensureTargetColumn` + T4 UI) ✓ ;
  portée toutes/filtrées (T4 `scopedRows` + T5 `visibleRowIds`) ✓ ; aperçu obligatoire (T4
  `previewed` gate sur `canApply`) ✓ ; lots de 20 (T2 `chunkSize`) ✓ ; abort entre lots (T2) ✓ ;
  ligne vide ignorée (T2 `skipped`) ✓ ; lot incomplet → failed réessayable (T2) ✓ ; confirmation
  d'écrasement (T4 `confirmOverwrite`) ✓ ; coût live (T4 `pushAiUsageListener`) ✓ ; tâche LLM
  fiable JSON (T3 routing claude/gemini) ✓ ; persistance via auto-save existant (aucun code) ✓.
- **Placeholders** : aucun TODO/TBD ; chaque étape de code est complète.
- **Cohérence des types** : `CompletionStatus`/`runCompletionBatches`/`BatchRunDeps` (T2)
  consommés par le hook (T3) ; `buildBatchPrompt`/`mapResults`/`CompletionBatchSchema`/
  `COMPLETION_SCHEMA_FOR_LLM`/`uniqueColumnKey` (T1) consommés par le hook (T3) ;
  `useColumnCompletion` (T3) consommé par le modal (T4) ; `ColumnCompletionModal` (T4) monté par
  DataPage (T5) avec `visibleRowIds`.

## Points à vérifier à l'implémentation (non bloquants)

- **Coût live** : confirmer que `generateJson` enregistre l'usage capté par `pushAiUsageListener`
  (comme `product.enrichment`). Sinon, appeler `recordAiUsage` dans `callBatchLLM` via
  `onProviderUsed` + comptage de tokens.
- **Classe `bg-accent`** : si absente, utiliser `bg-[#6366f1]` (accent projet).
- **`filteredRowIds`** : confirmer le nom exact de la variable du useMemo dans DataPage au moment
  du câblage (T5).
- **Troncature de lot** : `generateJson` fixe `max_tokens = 8192`. Confortable pour des valeurs
  courtes (noms, libellés). Pour des sorties **longues** (paragraphes générés × 20), un lot peut
  tronquer → JSON invalide → tout le lot part en `failed` (dégradation gracieuse, pas de crash, via
  le `catch` de `runCompletionBatches`). Si l'usage réel génère du texte long, réduire `chunkSize`
  (paramètre déjà exposé) à 8-10 lors de l'appel `runCompletionBatches`. Ne pas bloquer le démarrage.
