# Prompt-to-Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Générer automatiquement un workflow complet (nodes + connexions + config best-effort) depuis un prompt en langage naturel, via le registre de nodes existant.

**Architecture:** Un appel LLM unique (`generateJson`) reçoit le catalogue des nodes et renvoie un graphe JSON avec refs locales. Une validation déterministe (types, ports, compatibilité, cycle) matérialise le graphe (ref→id, merge config sur defaults) et écarte ce qui est invalide. Un layout en couches gauche→droite assigne les positions. Un modal affiche un aperçu avant injection dans le store React Flow.

**Tech Stack:** React 18 + TypeScript, Zustand (`useWorkflowStore`), React Flow (@xyflow/react), Zod, Vitest. LLM via `@/features/ai/llmRouter` (`generateJson`).

**Référence spec :** `docs/superpowers/specs/2026-05-25-prompt-to-flow-design.md`

---

## Structure de fichiers

Nouveau module `src/features/workflows/promptToFlow/` :

| Fichier | Responsabilité |
|---|---|
| `types.ts` | Types partagés : `RawGraph`, `RawNode`, `RawEdge`, `GraphIssue`, `ValidatedGraph` |
| `buildRegistryContext.ts` | Sérialise `nodeRegistry.list()` en catalogue texte pour le prompt |
| `layoutGraph.ts` | Layout en couches (longest-path) → positions `{x,y}` par id |
| `validateGraph.ts` | Matérialise + valide un `RawGraph` → `ValidatedGraph` |
| `generateWorkflow.ts` | Prompt + schéma + appel `generateJson` (+ mode réparation) |
| `usePromptToFlow.ts` | Hook d'orchestration (generate → validate → repair → layout → apply) |
| `PromptToFlowPreview.tsx` | Aperçu (titre, résumé, étapes, warnings) |
| `PromptToFlowModal.tsx` | Modal (textarea, sélecteur modèle, bouton Générer, aperçu, Accepter) |

Modifs :
- `src/features/ai/llmRouter.ts` — ajouter le `LLMTask` `'workflow.generate'`.
- `src/features/workflows/editor/WorkflowEditorPage.tsx` — bouton « Générer (IA) » dans le header.

---

## Task 1: Enregistrer le LLMTask `workflow.generate`

**Files:**
- Modify: `src/features/ai/llmRouter.ts:45-58` (union `LLMTask`), `:71-99` (`TASK_ROUTING`), `:102-116` (`TASK_TEMPERATURE`)

- [ ] **Step 1: Ajouter le membre à l'union `LLMTask`**

Dans la définition `type LLMTask =` (après `| 'design.semanticLayout'`), ajouter une ligne :

```typescript
  | 'design.semanticLayout'
  | 'workflow.generate'
```

- [ ] **Step 2: Ajouter la route dans `TASK_ROUTING`**

Après la ligne `'design.semanticLayout': { ... },` ajouter :

```typescript
  // Prompt-to-Flow : génération de graphe structuré. gemini-3.1-pro-preview en primary
  // (JSON fiable via responseSchema sur v1beta + disponibilité), Claude Opus 4.7 en
  // fallback (meilleur raisonnement de graphe si la clé Gemini manque).
  'workflow.generate': { primary: 'gemini', fallback: 'claude', model: 'gemini-3.1-pro-preview' },
```

- [ ] **Step 3: Ajouter la température dans `TASK_TEMPERATURE`**

Après `'design.semanticLayout': 0,` ajouter :

```typescript
  'workflow.generate':      0.2,
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: exit code 0, aucune erreur (l'union exhaustive `Record<LLMTask, …>` force la présence des 3 entrées — une omission casse le build).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/llmRouter.ts
git commit -m "feat(workflows): route LLM task workflow.generate"
```

---

## Task 2: Types partagés du module

**Files:**
- Create: `src/features/workflows/promptToFlow/types.ts`

- [ ] **Step 1: Créer le fichier de types**

```typescript
// src/features/workflows/promptToFlow/types.ts
import type { WorkflowNode, WorkflowEdge } from '../types'

/** Node tel que renvoyé par le LLM : ref locale, pas d'id ni de position. */
export interface RawNode {
  ref: string
  type: string
  label?: string
  config?: Record<string, unknown>
}

/** Edge tel que renvoyé par le LLM : références aux refs locales + noms de ports. */
export interface RawEdge {
  from: string
  fromPort: string
  to: string
  toPort: string
}

/** Graphe brut renvoyé par le LLM. */
export interface RawGraph {
  title: string
  summary: string
  nodes: RawNode[]
  edges: RawEdge[]
}

/** Problème détecté pendant la validation. `error` = écarté ; `warning` = signalé. */
export interface GraphIssue {
  level: 'error' | 'warning'
  message: string
}

/** Graphe matérialisé + validé, prêt à injecter (positions assignées séparément). */
export interface ValidatedGraph {
  title: string
  summary: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  issues: GraphIssue[]
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/promptToFlow/types.ts
git commit -m "feat(workflows): types partagés Prompt-to-Flow"
```

---

## Task 3: `buildRegistryContext` (catalogue pour le prompt)

**Files:**
- Create: `src/features/workflows/promptToFlow/buildRegistryContext.ts`
- Test: `src/features/workflows/promptToFlow/buildRegistryContext.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/features/workflows/promptToFlow/buildRegistryContext.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { initWorkflowsRegistry } from '../registry/builtin'
import { nodeRegistry } from '../registry'
import { buildRegistryContext } from './buildRegistryContext'

describe('buildRegistryContext', () => {
  beforeAll(() => initWorkflowsRegistry())

  it('liste chaque node enregistré avec son type', () => {
    const ctx = buildRegistryContext()
    for (const spec of nodeRegistry.list()) {
      expect(ctx).toContain(`type: ${spec.type}`)
    }
  })

  it('documente ports et config d’un node connu', () => {
    const ctx = buildRegistryContext()
    // import-csv : in file:file, out sheet:sheet, config headerRow:checkbox
    expect(ctx).toMatch(/type: import-csv/)
    expect(ctx).toMatch(/in: file:file/)
    expect(ctx).toMatch(/out: sheet:sheet/)
    expect(ctx).toMatch(/headerRow:checkbox/)
  })

  it('marque les sources sans input', () => {
    const ctx = buildRegistryContext()
    // upload n’a aucun input
    expect(ctx).toMatch(/type: upload[\s\S]*?in: \(aucun\)/)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/features/workflows/promptToFlow/buildRegistryContext.test.ts`
Expected: FAIL — `buildRegistryContext` introuvable (module non créé).

- [ ] **Step 3: Implémenter `buildRegistryContext`**

```typescript
// src/features/workflows/promptToFlow/buildRegistryContext.ts
import { nodeRegistry } from '../registry'
import type { Port, ConfigField, NodeSpec } from '../types'

function fmtPorts(ports: Port[]): string {
  if (ports.length === 0) return '(aucun)'
  return ports.map((p) => `${p.name}:${p.type}${p.required ? '*' : ''}`).join(', ')
}

function fmtConfig(fields: ConfigField[]): string {
  if (fields.length === 0) return '(aucune)'
  return fields.map((f) => `${f.name}:${f.kind}(${f.label})`).join(', ')
}

function fmtNode(spec: NodeSpec): string {
  return [
    `- type: ${spec.type} | cat: ${spec.category} | ${spec.label}`,
    `  desc: ${spec.description}`,
    `  in: ${fmtPorts(spec.inputs)}`,
    `  out: ${fmtPorts(spec.outputs)}`,
    `  config: ${fmtConfig(spec.configSchema)}`,
  ].join('\n')
}

/**
 * Sérialise le registre de nodes en catalogue texte déterministe, injecté dans
 * le prompt de génération. Le `*` après un type de port signale `required`.
 * L'ordre suit `nodeRegistry.list()` (ordre d'enregistrement).
 */
export function buildRegistryContext(): string {
  return nodeRegistry
    .list()
    .map(fmtNode)
    .join('\n')
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/features/workflows/promptToFlow/buildRegistryContext.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/promptToFlow/buildRegistryContext.ts src/features/workflows/promptToFlow/buildRegistryContext.test.ts
git commit -m "feat(workflows): buildRegistryContext (catalogue de nodes pour le LLM)"
```

---

## Task 4: `layoutGraph` (positions en couches)

**Files:**
- Create: `src/features/workflows/promptToFlow/layoutGraph.ts`
- Test: `src/features/workflows/promptToFlow/layoutGraph.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/features/workflows/promptToFlow/layoutGraph.test.ts
import { describe, it, expect } from 'vitest'
import { layoutGraph } from './layoutGraph'
import type { WorkflowNode, WorkflowEdge } from '../types'

const node = (id: string): WorkflowNode => ({ id, type: 'noop', position: { x: 0, y: 0 }, config: {} })
const edge = (s: string, t: string): WorkflowEdge => ({ id: `${s}->${t}`, source: s, sourceHandle: 'o', target: t, targetHandle: 'i' })

describe('layoutGraph', () => {
  it('aligne une chaîne en colonnes croissantes', () => {
    const pos = layoutGraph([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'c')])
    expect(pos.a.x).toBe(0)
    expect(pos.b.x).toBe(320)
    expect(pos.c.x).toBe(640)
    expect(pos.a.y).toBe(0)
  })

  it('place le nœud de jointure du diamant après ses deux prédécesseurs', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
    const pos = layoutGraph(nodes, edges)
    expect(pos.a.x).toBe(0)
    expect(pos.b.x).toBe(320)
    expect(pos.c.x).toBe(320)
    expect(pos.d.x).toBe(640) // max(layer(b),layer(c))+1
    // b et c dans la même couche → empilés verticalement
    expect(pos.b.y).not.toBe(pos.c.y)
  })

  it('est déterministe', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('a', 'b')]
    expect(layoutGraph(nodes, edges)).toEqual(layoutGraph(nodes, edges))
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/features/workflows/promptToFlow/layoutGraph.test.ts`
Expected: FAIL — `layoutGraph` introuvable.

- [ ] **Step 3: Implémenter `layoutGraph`**

```typescript
// src/features/workflows/promptToFlow/layoutGraph.ts
import type { WorkflowNode, WorkflowEdge } from '../types'

const COL_W = 320
const ROW_H = 160

/**
 * Layout en couches gauche→droite. couche(n) = max(couche(prédécesseurs)) + 1.
 * Dans une couche, les nœuds sont empilés verticalement dans l'ordre du tableau
 * `nodes` (déterministe). Tolère un éventuel cycle résiduel via un garde `computing`.
 */
export function layoutGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Record<string, { x: number; y: number }> {
  const preds = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (preds.has(e.target) && preds.has(e.source)) preds.get(e.target)!.push(e.source)
  }
  const layer = new Map<string, number>()
  const computing = new Set<string>()
  const layerOf = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!
    if (computing.has(id)) return 0 // garde anti-cycle
    computing.add(id)
    const ps = preds.get(id) ?? []
    const v = ps.length === 0 ? 0 : Math.max(...ps.map(layerOf)) + 1
    computing.delete(id)
    layer.set(id, v)
    return v
  }
  for (const n of nodes) layerOf(n.id)

  const rankInLayer = new Map<number, number>()
  const pos: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    const l = layer.get(n.id)!
    const r = rankInLayer.get(l) ?? 0
    rankInLayer.set(l, r + 1)
    pos[n.id] = { x: l * COL_W, y: r * ROW_H }
  }
  return pos
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/features/workflows/promptToFlow/layoutGraph.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/promptToFlow/layoutGraph.ts src/features/workflows/promptToFlow/layoutGraph.test.ts
git commit -m "feat(workflows): layoutGraph (positions en couches)"
```

---

## Task 5: `validateGraph` (matérialisation + validation)

**Files:**
- Create: `src/features/workflows/promptToFlow/validateGraph.ts`
- Test: `src/features/workflows/promptToFlow/validateGraph.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/features/workflows/promptToFlow/validateGraph.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { initWorkflowsRegistry } from '../registry/builtin'
import { validateGraph } from './validateGraph'
import type { RawGraph } from './types'

// genId déterministe pour les assertions
const genId = (i: number) => `n${i}`

describe('validateGraph', () => {
  beforeAll(() => initWorkflowsRegistry())

  it('matérialise un graphe valide (ref→id, edges, merge config)', () => {
    const raw: RawGraph = {
      title: 'T', summary: 'S',
      nodes: [
        { ref: 'u', type: 'upload', config: {} },
        { ref: 'c', type: 'import-csv', config: { headerRow: false } },
      ],
      edges: [{ from: 'u', fromPort: 'file', to: 'c', toPort: 'file' }],
    }
    const g = validateGraph(raw, genId)
    expect(g.issues.filter((i) => i.level === 'error')).toHaveLength(0)
    expect(g.nodes.map((n) => n.id)).toEqual(['n0', 'n1'])
    expect(g.nodes[1].config).toEqual({ headerRow: false }) // override sur default
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ source: 'n0', sourceHandle: 'file', target: 'n1', targetHandle: 'file' })
  })

  it('écarte un node de type inconnu', () => {
    const raw: RawGraph = { title: '', summary: '', nodes: [{ ref: 'x', type: 'does-not-exist' }], edges: [] }
    const g = validateGraph(raw, genId)
    expect(g.nodes).toHaveLength(0)
    expect(g.issues.some((i) => i.level === 'error' && /does-not-exist/.test(i.message))).toBe(true)
  })

  it('écarte une edge dont le port de sortie n’existe pas', () => {
    const raw: RawGraph = {
      title: '', summary: '',
      nodes: [{ ref: 'u', type: 'upload' }, { ref: 'c', type: 'import-csv' }],
      edges: [{ from: 'u', fromPort: 'nope', to: 'c', toPort: 'file' }],
    }
    const g = validateGraph(raw, genId)
    expect(g.edges).toHaveLength(0)
    expect(g.issues.some((i) => /nope/.test(i.message))).toBe(true)
  })

  it('écarte une edge entre types de ports incompatibles', () => {
    // export-excel.out = result:export-result ; import-csv.in = file:file → incompatible
    const raw: RawGraph = {
      title: '', summary: '',
      nodes: [
        { ref: 'e', type: 'export-excel' },
        { ref: 'c', type: 'import-csv' },
      ],
      edges: [{ from: 'e', fromPort: 'result', to: 'c', toPort: 'file' }],
    }
    const g = validateGraph(raw, genId)
    expect(g.edges).toHaveLength(0)
    expect(g.issues.some((i) => /incompatibles/.test(i.message))).toBe(true)
  })

  it('signale (warning) une entrée requise non connectée', () => {
    const raw: RawGraph = { title: '', summary: '', nodes: [{ ref: 'c', type: 'import-csv' }], edges: [] }
    const g = validateGraph(raw, genId)
    // import-csv.in file est required → warning
    expect(g.issues.some((i) => i.level === 'warning' && /file/.test(i.message))).toBe(true)
  })

  it('détecte un cycle', () => {
    const raw: RawGraph = {
      title: '', summary: '',
      nodes: [{ ref: 'a', type: 'transform-filter' }, { ref: 'b', type: 'transform-sort' }],
      edges: [
        { from: 'a', fromPort: 'sheet', to: 'b', toPort: 'sheet' },
        { from: 'b', fromPort: 'sheet', to: 'a', toPort: 'sheet' },
      ],
    }
    const g = validateGraph(raw, genId)
    expect(g.issues.some((i) => /cycle/i.test(i.message))).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/features/workflows/promptToFlow/validateGraph.test.ts`
Expected: FAIL — `validateGraph` introuvable.

- [ ] **Step 3: Implémenter `validateGraph`**

```typescript
// src/features/workflows/promptToFlow/validateGraph.ts
import { nodeRegistry } from '../registry'
import { isCompatible } from '../runtime/ports'
import { topoSort } from '../runtime/topo'
import type { WorkflowNode, WorkflowEdge } from '../types'
import type { RawGraph, GraphIssue, ValidatedGraph } from './types'

function defaultGenId(i: number): string {
  return `n_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Matérialise un graphe brut (ref→id, merge config sur defaults) et le valide :
 * types connus, ports existants, compatibilité des ports, absence de cycle,
 * entrées requises connectées. Les éléments invalides sont écartés et listés
 * dans `issues` (level `error`), les manques non bloquants en `warning`.
 */
export function validateGraph(
  raw: RawGraph,
  genId: (i: number) => string = defaultGenId,
): ValidatedGraph {
  const issues: GraphIssue[] = []
  const refToId = new Map<string, string>()
  const nodes: WorkflowNode[] = []

  raw.nodes.forEach((rn, i) => {
    const spec = nodeRegistry.get(rn.type)
    if (!spec) {
      issues.push({ level: 'error', message: `Node inconnu ignoré : "${rn.type}" (ref ${rn.ref}).` })
      return
    }
    const id = genId(i)
    refToId.set(rn.ref, id)
    nodes.push({
      id,
      type: rn.type,
      position: { x: 0, y: 0 }, // assigné par layoutGraph en aval
      config: { ...(spec.defaultConfig as Record<string, unknown>), ...(rn.config ?? {}) },
    })
  })

  const resolve = (ref: string) => {
    const id = refToId.get(ref)
    if (!id) return undefined
    const n = nodes.find((x) => x.id === id)
    if (!n) return undefined
    return { id, spec: nodeRegistry.get(n.type)! }
  }

  const edges: WorkflowEdge[] = []
  for (const re of raw.edges) {
    const src = resolve(re.from)
    const tgt = resolve(re.to)
    if (!src || !tgt) {
      issues.push({ level: 'error', message: `Edge ignorée : ref introuvable (${re.from} → ${re.to}).` })
      continue
    }
    const out = src.spec.outputs.find((p) => p.name === re.fromPort)
    const inp = tgt.spec.inputs.find((p) => p.name === re.toPort)
    if (!out) {
      issues.push({ level: 'error', message: `Port de sortie "${re.fromPort}" absent de ${src.spec.type}.` })
      continue
    }
    if (!inp) {
      issues.push({ level: 'error', message: `Port d'entrée "${re.toPort}" absent de ${tgt.spec.type}.` })
      continue
    }
    if (!isCompatible(out.type, inp.type)) {
      issues.push({ level: 'error', message: `Types incompatibles ${out.type} → ${inp.type} (${src.spec.type} → ${tgt.spec.type}).` })
      continue
    }
    edges.push({
      id: `e_${src.id}_${re.fromPort}_${tgt.id}_${re.toPort}`,
      source: src.id,
      sourceHandle: re.fromPort,
      target: tgt.id,
      targetHandle: re.toPort,
    })
  }

  try {
    topoSort(nodes, edges)
  } catch {
    issues.push({ level: 'error', message: 'Le graphe contient un cycle.' })
  }

  for (const n of nodes) {
    const spec = nodeRegistry.get(n.type)!
    for (const p of spec.inputs) {
      if (p.required && !edges.some((e) => e.target === n.id && e.targetHandle === p.name)) {
        issues.push({ level: 'warning', message: `Entrée requise "${p.name}" non connectée sur ${spec.label}.` })
      }
    }
  }

  return { title: raw.title, summary: raw.summary, nodes, edges, issues }
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/features/workflows/promptToFlow/validateGraph.test.ts`
Expected: PASS (6 tests). Si un test de compatibilité échoue, vérifier dans `exportNodes.ts` que `export-excel` sort bien `result:export-result` (sinon ajuster le test au port réel — ne pas changer l'implémentation).

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/promptToFlow/validateGraph.ts src/features/workflows/promptToFlow/validateGraph.test.ts
git commit -m "feat(workflows): validateGraph (matérialisation + validation du graphe généré)"
```

---

## Task 6: `generateWorkflow` (appel LLM + réparation)

**Files:**
- Create: `src/features/workflows/promptToFlow/generateWorkflow.ts`
- Test: `src/features/workflows/promptToFlow/generateWorkflow.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// src/features/workflows/promptToFlow/generateWorkflow.test.ts
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { initWorkflowsRegistry } from '../registry/builtin'

const generateJsonMock = vi.fn()
vi.mock('@/features/ai/llmRouter', () => ({
  generateJson: (opts: unknown) => generateJsonMock(opts),
}))

import { generateWorkflow } from './generateWorkflow'

describe('generateWorkflow', () => {
  beforeAll(() => initWorkflowsRegistry())

  it('appelle generateJson avec la task workflow.generate et renvoie le graphe', async () => {
    const raw = {
      title: 'X', summary: 'Y',
      nodes: [{ ref: 'u', type: 'upload', config: {} }],
      edges: [],
    }
    generateJsonMock.mockResolvedValueOnce(raw)
    const result = await generateWorkflow('charge un fichier')
    expect(generateJsonMock).toHaveBeenCalledTimes(1)
    const opts = generateJsonMock.mock.calls[0][0] as { task: string; prompt: string }
    expect(opts.task).toBe('workflow.generate')
    expect(opts.prompt).toContain('charge un fichier')
    expect(opts.prompt).toContain('type: upload') // catalogue injecté
    expect(result).toEqual(raw)
  })

  it('injecte les issues de réparation dans le prompt', async () => {
    generateJsonMock.mockResolvedValueOnce({ title: '', summary: '', nodes: [], edges: [] })
    await generateWorkflow('p', { repairIssues: ['Node inconnu : "foo".'] })
    const opts = generateJsonMock.mock.calls.at(-1)![0] as { prompt: string }
    expect(opts.prompt).toContain('Node inconnu : "foo".')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/features/workflows/promptToFlow/generateWorkflow.test.ts`
Expected: FAIL — `generateWorkflow` introuvable.

- [ ] **Step 3: Implémenter `generateWorkflow`**

```typescript
// src/features/workflows/promptToFlow/generateWorkflow.ts
import { z } from 'zod'
import { generateJson, type LLMProviderId } from '@/features/ai/llmRouter'
import { buildRegistryContext } from './buildRegistryContext'
import type { RawGraph } from './types'

const rawSchema = z.object({
  title: z.string(),
  summary: z.string(),
  nodes: z.array(
    z.object({
      ref: z.string(),
      type: z.string(),
      label: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(), // zod v4 : record à 2 args (clé, valeur)
    }),
  ),
  edges: z.array(
    z.object({ from: z.string(), fromPort: z.string(), to: z.string(), toPort: z.string() }),
  ),
})

const schemaForLLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Titre court du workflow.' },
    summary: { type: 'string', description: 'Résumé en une phrase.' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Référence locale unique (ex: n1).' },
          type: { type: 'string', description: 'Type exact d’un node du catalogue.' },
          label: { type: 'string' },
          config: { type: 'object', description: 'Valeurs de config déduites du prompt.' },
        },
        required: ['ref', 'type'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'ref du node source.' },
          fromPort: { type: 'string', description: 'nom du port de sortie.' },
          to: { type: 'string', description: 'ref du node cible.' },
          toPort: { type: 'string', description: 'nom du port d’entrée.' },
        },
        required: ['from', 'fromPort', 'to', 'toPort'],
      },
    },
  },
  required: ['title', 'summary', 'nodes', 'edges'],
}

export interface GenerateWorkflowOptions {
  forceProvider?: LLMProviderId
  /** Messages d'erreur d'une tentative précédente, injectés pour réparation. */
  repairIssues?: string[]
}

function buildPrompt(catalog: string, userPrompt: string, opts?: GenerateWorkflowOptions): string {
  const parts: string[] = []
  parts.push(
    `Tu es un architecte de workflows data. À partir de la demande de l'utilisateur, conçois un
workflow en sélectionnant UNIQUEMENT des nodes du catalogue ci-dessous, en les connectant de
manière cohérente, et en émettant le résultat via l'outil.

RÈGLES IMPÉRATIVES :
- N'utilise QUE des "type" présents dans le catalogue. N'invente jamais de type ni de port.
- Connecte un port de sortie à un port d'entrée de TYPE compatible (même type, ou cible "any").
  Le suffixe "*" sur un port d'entrée signale qu'il est REQUIS : il doit recevoir une connexion.
- Les nodes "in: (aucun)" sont des sources (Upload, Scrape URL, imports Drive) : ne leur connecte
  aucune entrée.
- Donne à chaque node une "ref" locale unique (n1, n2, …) ; les edges référencent ces refs.
- Pré-remplis "config" au mieux à partir de la demande, en utilisant EXACTEMENT les noms de champs
  de config indiqués (ex: urlColumn, fields, prompt, titleColumn, expression…). Laisse vide si tu
  n'as pas l'information.
- Produis un pipeline acyclique, du plus en amont (sources) vers l'aval (exports/persistance).`,
  )
  parts.push(`═══ CATALOGUE DES NODES ═══\n${catalog}`)
  parts.push(`═══ DEMANDE DE L'UTILISATEUR ═══\n${userPrompt}`)
  if (opts?.repairIssues && opts.repairIssues.length > 0) {
    parts.push(
      `═══ CORRECTIONS À APPORTER ═══\nLa tentative précédente comportait ces problèmes. Corrige-les :\n` +
        opts.repairIssues.map((m) => `- ${m}`).join('\n'),
    )
  }
  return parts.join('\n\n')
}

/** Appelle le LLM pour produire un graphe brut. Ne valide PAS (voir validateGraph). */
export async function generateWorkflow(
  userPrompt: string,
  opts?: GenerateWorkflowOptions,
): Promise<RawGraph> {
  const prompt = buildPrompt(buildRegistryContext(), userPrompt, opts)
  return await generateJson({
    task: 'workflow.generate',
    prompt,
    schema: rawSchema,
    schemaForLLM,
    version: 'workflow.generate.v1',
    forceProvider: opts?.forceProvider,
  })
}
```

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `npx vitest run src/features/workflows/promptToFlow/generateWorkflow.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Vérifier l'export `LLMProviderId`**

Run: `npx tsc --noEmit`
Expected: exit code 0. `LLMProviderId` est déjà exporté depuis `llmRouter.ts:20` (`export type LLMProviderId`).

- [ ] **Step 6: Commit**

```bash
git add src/features/workflows/promptToFlow/generateWorkflow.ts src/features/workflows/promptToFlow/generateWorkflow.test.ts
git commit -m "feat(workflows): generateWorkflow (prompt + appel LLM + réparation)"
```

---

## Task 7: `usePromptToFlow` (hook d'orchestration)

**Files:**
- Create: `src/features/workflows/promptToFlow/usePromptToFlow.ts`

- [ ] **Step 1: Implémenter le hook**

(Pas de test unitaire : glue mince au-dessus d'unités déjà testées + store. Vérifié par tsc + smoke test manuel en Task 9.)

```typescript
// src/features/workflows/promptToFlow/usePromptToFlow.ts
import { useCallback, useState } from 'react'
import type { LLMProviderId } from '@/features/ai/llmRouter'
import { useWorkflowStore } from '../persistence/workflow.store'
import { generateWorkflow } from './generateWorkflow'
import { validateGraph } from './validateGraph'
import { layoutGraph } from './layoutGraph'
import type { ValidatedGraph } from './types'

type Phase = 'idle' | 'generating' | 'preview' | 'error'

export interface UsePromptToFlow {
  phase: Phase
  preview: ValidatedGraph | null
  error: string | null
  generate: (prompt: string, forceProvider?: LLMProviderId) => Promise<void>
  apply: () => boolean
  reset: () => void
}

export function usePromptToFlow(): UsePromptToFlow {
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<ValidatedGraph | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async (prompt: string, forceProvider?: LLMProviderId) => {
    setPhase('generating')
    setError(null)
    try {
      const raw = await generateWorkflow(prompt, { forceProvider })
      let validated = validateGraph(raw)
      // 1 réparation si erreurs bloquantes
      const errs = validated.issues.filter((i) => i.level === 'error').map((i) => i.message)
      if (errs.length > 0) {
        const raw2 = await generateWorkflow(prompt, { forceProvider, repairIssues: errs })
        validated = validateGraph(raw2)
      }
      if (validated.nodes.length === 0) {
        setError('Aucun node valide généré. Reformule ta demande.')
        setPhase('error')
        return
      }
      const pos = layoutGraph(validated.nodes, validated.edges)
      validated.nodes.forEach((n) => { n.position = pos[n.id] ?? { x: 0, y: 0 } })
      setPreview(validated)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [])

  const apply = useCallback((): boolean => {
    if (!preview) return false
    const store = useWorkflowStore.getState()
    const cur = store.current
    if (cur && cur.nodes.length > 0) {
      const ok = window.confirm('Le workflow courant sera remplacé par le graphe généré. Continuer ?')
      if (!ok) return false
    }
    store.setNodes(preview.nodes)
    store.setEdges(preview.edges)
    if (preview.title) store.patch({ name: preview.title })
    reset()
    return true
  }, [preview])

  const reset = useCallback(() => {
    setPhase('idle')
    setPreview(null)
    setError(null)
  }, [])

  return { phase, preview, error, generate, apply, reset }
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/promptToFlow/usePromptToFlow.ts
git commit -m "feat(workflows): usePromptToFlow (orchestration generate→validate→apply)"
```

---

## Task 8: `PromptToFlowPreview` (composant d'aperçu)

**Files:**
- Create: `src/features/workflows/promptToFlow/PromptToFlowPreview.tsx`

- [ ] **Step 1: Implémenter le composant**

```tsx
// src/features/workflows/promptToFlow/PromptToFlowPreview.tsx
import { AlertTriangle, ArrowDown } from 'lucide-react'
import type { ValidatedGraph } from './types'

export function PromptToFlowPreview({ graph }: { graph: ValidatedGraph }) {
  const errors = graph.issues.filter((i) => i.level === 'error')
  const warnings = graph.issues.filter((i) => i.level === 'warning')
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-white">{graph.title || 'Workflow généré'}</p>
        {graph.summary && <p className="text-xs text-white/40 mt-0.5">{graph.summary}</p>}
      </div>

      <div className="rounded-md border border-neutral-800 bg-[#0f0f0f] p-3 space-y-1.5 max-h-64 overflow-auto">
        {graph.nodes.map((n, i) => (
          <div key={n.id}>
            {i > 0 && <ArrowDown className="w-3 h-3 text-white/20 mx-auto my-0.5" />}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-white/30 tabular-nums">{i + 1}.</span>
              <span className="text-white/80">{n.type}</span>
            </div>
          </div>
        ))}
        <p className="text-[10px] text-white/30 pt-1">{graph.edges.length} connexion(s)</p>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1">
          {errors.map((iss, k) => (
            <p key={`e${k}`} className="text-[11px] text-red-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {iss.message}
            </p>
          ))}
          {warnings.map((iss, k) => (
            <p key={`w${k}`} className="text-[11px] text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {iss.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/promptToFlow/PromptToFlowPreview.tsx
git commit -m "feat(workflows): PromptToFlowPreview (aperçu du graphe généré)"
```

---

## Task 9: `PromptToFlowModal` (modal de saisie)

**Files:**
- Create: `src/features/workflows/promptToFlow/PromptToFlowModal.tsx`

- [ ] **Step 1: Implémenter le modal**

```tsx
// src/features/workflows/promptToFlow/PromptToFlowModal.tsx
import { useState } from 'react'
import { Sparkles, Loader2, X } from 'lucide-react'
import type { LLMProviderId } from '@/features/ai/llmRouter'
import { usePromptToFlow } from './usePromptToFlow'
import { PromptToFlowPreview } from './PromptToFlowPreview'

const EXAMPLES = [
  'Importe un CSV, enrichis chaque produit via son URL, puis exporte en PPTX.',
  'Scrape une liste d’URLs produits et sauvegarde le résultat dans le PIM.',
  'Importe un Excel, filtre les lignes en rupture, trie par prix, exporte en PDF.',
]

export function PromptToFlowModal({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<'' | LLMProviderId>('')
  const { phase, preview, error, generate, apply, reset } = usePromptToFlow()

  const busy = phase === 'generating'

  const onGenerate = () => {
    if (!prompt.trim() || busy) return
    void generate(prompt.trim(), provider || undefined)
  }

  const onAccept = () => {
    if (apply()) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-neutral-800 bg-[#1a1a1a] p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium text-white">
            <Sparkles className="w-4 h-4 text-indigo-400" /> Générer un workflow (IA)
          </h2>
          <button onClick={onClose} className="p-1 rounded text-white/40 hover:text-white hover:bg-white/5" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase !== 'preview' ? (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décris ce que le workflow doit faire…"
              rows={4}
              className="w-full rounded-md border border-neutral-700 bg-[#0f0f0f] p-2.5 text-sm text-white outline-none focus:border-indigo-500 resize-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="text-[11px] text-left rounded border border-neutral-700 bg-[#0f0f0f] px-2 py-1 text-white/50 hover:text-white/80 hover:border-neutral-600"
                >
                  {ex}
                </button>
              ))}
            </div>
            {error && <p className="text-[11px] text-red-300">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as '' | LLMProviderId)}
                className="rounded-md border border-neutral-700 bg-[#0f0f0f] px-2 py-1.5 text-xs text-white/70 outline-none"
                aria-label="Modèle"
              >
                <option value="">Modèle auto</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
              </select>
              <button
                onClick={onGenerate}
                disabled={!prompt.trim() || busy}
                className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm text-white"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {busy ? 'Génération…' : 'Générer'}
              </button>
            </div>
          </>
        ) : (
          <>
            {preview && <PromptToFlowPreview graph={preview} />}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={reset} className="px-3 py-1.5 rounded text-sm text-white/60 hover:text-white hover:bg-white/5">
                Recommencer
              </button>
              <button onClick={onAccept} className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-sm text-white">
                Accepter
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/promptToFlow/PromptToFlowModal.tsx
git commit -m "feat(workflows): PromptToFlowModal (saisie + aperçu)"
```

---

## Task 10: Brancher le bouton dans le header de l'éditeur

**Files:**
- Modify: `src/features/workflows/editor/WorkflowEditorPage.tsx`

- [ ] **Step 1: Importer le modal et l'icône**

Modifier l'import lucide (`:4`) pour ajouter `Sparkles` :

```typescript
import { ArrowLeft, Save, Play, Square, Sparkles, Workflow as WorkflowIcon } from 'lucide-react'
```

Ajouter après l'import de `DataPreviewPanel` (`:16`) :

```typescript
import { PromptToFlowModal } from '../promptToFlow/PromptToFlowModal'
```

- [ ] **Step 2: Ajouter l'état d'ouverture du modal**

Après `const [loading, setLoading] = useState(true)` (`:27`), ajouter :

```typescript
  const [showGenerate, setShowGenerate] = useState(false)
```

- [ ] **Step 3: Ajouter le bouton dans le header**

Juste avant le bloc `{isRunning ? ( … ) : ( … )}` (`:101`), insérer :

```tsx
          <button
            onClick={() => setShowGenerate(true)}
            className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2 text-sm"
            title="Générer un workflow depuis un prompt (IA)"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" /> Générer (IA)
          </button>
```

- [ ] **Step 4: Rendre le modal**

Juste avant `</ReactFlowProvider>` (`:128`), insérer :

```tsx
        {showGenerate && <PromptToFlowModal onClose={() => setShowGenerate(false)} />}
```

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/workflows/editor/WorkflowEditorPage.tsx
git commit -m "feat(workflows): bouton Générer (IA) dans l'éditeur de workflow"
```

---

## Task 11: Vérification finale (build + smoke test)

**Files:** aucun (vérification)

- [ ] **Step 1: Lancer toute la suite de tests du module**

Run: `npx vitest run src/features/workflows/promptToFlow`
Expected: PASS (buildRegistryContext 3, layoutGraph 3, validateGraph 6, generateWorkflow 2).

- [ ] **Step 2: Vérifier types + build**

Run: `npx tsc --noEmit && npm run build`
Expected: exit code 0, build OK.

- [ ] **Step 3: Smoke test manuel**

Lancer `npm run dev`, ouvrir un workflow, cliquer « Générer (IA) », saisir
« Importe un CSV, enrichis via URL, exporte en PPTX », Générer.
Vérifier : aperçu listant Upload → Parser CSV → Enrichissement → Export PPTX,
0 erreur bloquante, puis Accepter → les nodes apparaissent câblés et étalés en
colonnes sur le canvas. Vérifier la confirmation de remplacement si le canvas
contenait déjà des nodes.

- [ ] **Step 4: Mettre à jour la mémoire projet**

Ajouter une entrée mémoire `project_prompt_to_flow.md` (+ ligne dans `MEMORY.md`)
résumant le module livré et son point d'entrée.

---

## Self-Review (effectué)

- **Couverture spec :** schéma de sortie (Task 6), validation types/ports/compatibilité/cycle/inputs requis (Task 5), layout sans dagre (Task 4), catalogue LLM (Task 3), aperçu + accepter (Tasks 8-9), confirmation si canvas non-vide (Task 7), bouton header + task LLM (Tasks 1, 10), réparation 1 retry (Task 7), tests (Tasks 3-6), gestion d'erreurs (Task 7/9). ✔
- **Placeholders :** aucun — tout le code est fourni.
- **Cohérence des types :** `RawGraph`/`ValidatedGraph`/`GraphIssue` (Task 2) réutilisés tels quels en Tasks 5-9 ; `validateGraph(raw, genId?)`, `layoutGraph(nodes, edges)`, `generateWorkflow(prompt, opts?)`, `usePromptToFlow()` signatures stables d'un task à l'autre ; `LLMProviderId` importé depuis `llmRouter`. ✔
- **Note de garde (Task 5 Step 4) :** si un type de port réel diffère du test de compatibilité, ajuster le test (pas l'implémentation).
