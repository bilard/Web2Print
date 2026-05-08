# Workflow Orchestration Studio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual workflow orchestration screen (à la Make.com / n8n) that lets users chain existing DesignStudio features (imports, scraping/AI enrichment, PIM/DAM, exports) into reusable workflows.

**Architecture:** React Flow (`@xyflow/react`) as the canvas + a typed `nodeRegistry` whose specs are auto-registered from per-node files. A topological executor with a middleware chain runs the DAG client-side; `NodeSpec.runtime` reserves the option of server execution later. Workflows are persisted in Firestore (`users/{uid}/workflows/{id}`) with a `schemaVersion` and `migrate()` for forward-compatibility.

**Tech Stack:** React 18, Vite, TypeScript strict, `@xyflow/react`, Zustand v4, Firebase Firestore v10, Tailwind v3, Lucide React, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-08-workflow-orchestration-design.md`.

---

## Conventions

- All files target `src/features/workflows/` unless stated otherwise.
- Dark mode mandatory: bg `#0f0f0f`, surface `#1a1a1a`, accent `#6366f1`.
- Tests live next to the file (`foo.ts` + `foo.test.ts`).
- Run a single test: `npm run test:run -- src/features/workflows/runtime/executor.test.ts`.
- Commit message format: `feat(workflows): <thing>` (or `test`, `refactor`).

---

## Phase 1 — Foundation

### Task 1: Add `@xyflow/react` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependency**

Run:
```bash
npm install @xyflow/react@^12
```

- [ ] **Step 2: Verify build still passes**

Run:
```bash
npm run build
```
Expected: build green, no type errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(workflows): add @xyflow/react dependency"
```

---

### Task 2: Core types

**Files:**
- Create: `src/features/workflows/types.ts`

- [ ] **Step 1: Write the file**

```ts
// src/features/workflows/types.ts
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export type PortType = string

export interface Port {
  name: string
  type: PortType
  required: boolean
}

export type ConfigFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'expression'
  | 'columnRef'

export interface ConfigField {
  name: string
  kind: ConfigFieldKind
  label: string
  required?: boolean
  options?: { value: string; label: string }[]
  default?: unknown
  help?: string
}

export type NodeRuntime = 'client' | 'server' | 'any'

export interface NodeSpec<C = unknown, I = unknown, O = unknown> {
  type: string
  category: 'import' | 'enrichment' | 'persistence' | 'export' | 'utility'
  label: string
  description: string
  icon: LucideIcon
  inputs: Port[]
  outputs: Port[]
  configSchema: ConfigField[]
  defaultConfig: C
  runtime: NodeRuntime
  run: (ctx: RunContextApi, config: C, inputs: I) => Promise<O>
  ConfigComponent?: ComponentType<{
    config: C
    onChange: (next: C) => void
  }>
}

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  config: unknown
}

export interface WorkflowEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface Workflow {
  id: string
  schemaVersion: number
  name: string
  description: string
  ownerId: string
  createdAt: number
  updatedAt: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type NodeStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

export interface NodeRunState {
  status: NodeStatus
  startedAt?: number
  endedAt?: number
  durationMs?: number
  logs: { ts: number; level: 'info' | 'warn' | 'error'; msg: string }[]
  error?: string
  outputs?: Record<string, unknown>
}

export interface RunContextApi {
  signal: AbortSignal
  log: (level: 'info' | 'warn' | 'error', msg: string) => void
  setProgress?: (pct: number) => void
}
```

- [ ] **Step 2: Run typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/types.ts
git commit -m "feat(workflows): core types (NodeSpec, Workflow, RunContext)"
```

---

### Task 3: `portTypeRegistry` with built-in port types

**Files:**
- Create: `src/features/workflows/runtime/ports.ts`
- Create: `src/features/workflows/runtime/ports.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/workflows/runtime/ports.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { portTypeRegistry, registerBuiltinPorts, isCompatible } from './ports'

describe('portTypeRegistry', () => {
  beforeEach(() => {
    portTypeRegistry.clear()
    registerBuiltinPorts()
  })

  it('registers built-in port types', () => {
    expect(portTypeRegistry.has('file')).toBe(true)
    expect(portTypeRegistry.has('sheet')).toBe(true)
    expect(portTypeRegistry.has('product[]')).toBe(true)
    expect(portTypeRegistry.has('asset[]')).toBe(true)
    expect(portTypeRegistry.has('pim-products')).toBe(true)
    expect(portTypeRegistry.has('export-result')).toBe(true)
  })

  it('isCompatible returns true for same type', () => {
    expect(isCompatible('sheet', 'sheet')).toBe(true)
  })

  it('isCompatible returns false for unrelated types', () => {
    expect(isCompatible('sheet', 'file')).toBe(false)
  })

  it('throws when registering same type twice', () => {
    expect(() =>
      portTypeRegistry.register({
        type: 'sheet',
        label: 'Sheet',
        validator: () => true,
        Previewer: () => null,
      })
    ).toThrow(/already registered/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/features/workflows/runtime/ports.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ports.ts`**

```ts
// src/features/workflows/runtime/ports.ts
import type { ComponentType } from 'react'
import type { PortType } from '../types'

export interface PortTypeSpec {
  type: PortType
  label: string
  validator: (value: unknown) => boolean
  Previewer: ComponentType<{ value: unknown }>
  converter?: (value: unknown, target: PortType) => unknown
}

class PortTypeRegistry {
  private map = new Map<PortType, PortTypeSpec>()

  register(spec: PortTypeSpec): void {
    if (this.map.has(spec.type)) {
      throw new Error(`Port type "${spec.type}" already registered`)
    }
    this.map.set(spec.type, spec)
  }
  get(type: PortType): PortTypeSpec | undefined {
    return this.map.get(type)
  }
  has(type: PortType): boolean {
    return this.map.has(type)
  }
  list(): PortTypeSpec[] {
    return Array.from(this.map.values())
  }
  clear(): void {
    this.map.clear()
  }
}

export const portTypeRegistry = new PortTypeRegistry()

export function isCompatible(source: PortType, target: PortType): boolean {
  if (source === target) return true
  const src = portTypeRegistry.get(source)
  return Boolean(src?.converter)
}

const NoopPreviewer: ComponentType<{ value: unknown }> = () => null

export function registerBuiltinPorts(): void {
  const builtins: PortTypeSpec[] = [
    { type: 'file', label: 'File', validator: (v) => v instanceof File || v instanceof Blob, Previewer: NoopPreviewer },
    { type: 'sheet', label: 'Sheet', validator: (v) => typeof v === 'object' && v !== null, Previewer: NoopPreviewer },
    { type: 'product[]', label: 'Product[]', validator: (v) => Array.isArray(v), Previewer: NoopPreviewer },
    { type: 'asset[]', label: 'Asset[]', validator: (v) => Array.isArray(v), Previewer: NoopPreviewer },
    { type: 'pim-products', label: 'PIM result', validator: (v) => typeof v === 'object' && v !== null, Previewer: NoopPreviewer },
    { type: 'export-result', label: 'Export result', validator: (v) => typeof v === 'object' && v !== null, Previewer: NoopPreviewer },
  ]
  for (const b of builtins) portTypeRegistry.register(b)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/features/workflows/runtime/ports.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/runtime/ports.ts src/features/workflows/runtime/ports.test.ts
git commit -m "feat(workflows): portTypeRegistry + 6 built-in port types"
```

---

### Task 4: Topological sort utility

**Files:**
- Create: `src/features/workflows/runtime/topo.ts`
- Create: `src/features/workflows/runtime/topo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/workflows/runtime/topo.test.ts
import { describe, it, expect } from 'vitest'
import { topoSort } from './topo'
import type { WorkflowEdge, WorkflowNode } from '../types'

const node = (id: string): WorkflowNode => ({ id, type: 'noop', position: { x: 0, y: 0 }, config: {} })
const edge = (source: string, target: string): WorkflowEdge => ({
  id: `${source}->${target}`,
  source,
  sourceHandle: 'out',
  target,
  targetHandle: 'in',
})

describe('topoSort', () => {
  it('returns empty array for empty graph', () => {
    expect(topoSort([], [])).toEqual([])
  })

  it('orders simple chain', () => {
    const nodes = [node('c'), node('a'), node('b')]
    const edges = [edge('a', 'b'), edge('b', 'c')]
    expect(topoSort(nodes, edges).map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('orders diamond', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
    const order = topoSort(nodes, edges).map((n) => n.id)
    expect(order[0]).toBe('a')
    expect(order[3]).toBe('d')
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'))
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'))
  })

  it('throws on cycle', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('a', 'b'), edge('b', 'a')]
    expect(() => topoSort(nodes, edges)).toThrow(/cycle/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/features/workflows/runtime/topo.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `topo.ts`**

```ts
// src/features/workflows/runtime/topo.ts
import type { WorkflowEdge, WorkflowNode } from '../types'

export function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    out.get(e.source)!.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  }
  const queue: string[] = []
  for (const [id, d] of indeg) if (d === 0) queue.push(id)
  const result: WorkflowNode[] = []
  while (queue.length) {
    const id = queue.shift()!
    result.push(byId.get(id)!)
    for (const next of out.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1
      indeg.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  if (result.length !== nodes.length) {
    throw new Error('Workflow contains a cycle')
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/features/workflows/runtime/topo.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/runtime/topo.ts src/features/workflows/runtime/topo.test.ts
git commit -m "feat(workflows): topological sort with cycle detection"
```

---

### Task 5: `RunContext` Zustand store

**Files:**
- Create: `src/features/workflows/runtime/runContext.ts`

- [ ] **Step 1: Write the file**

```ts
// src/features/workflows/runtime/runContext.ts
import { create } from 'zustand'
import type { NodeRunState, NodeStatus } from '../types'

interface RunContextState {
  isRunning: boolean
  abortController: AbortController | null
  nodeStates: Record<string, NodeRunState>
  edgesActive: Set<string>
  startRun: () => AbortController
  endRun: () => void
  resetRun: () => void
  setNodeStatus: (id: string, status: NodeStatus) => void
  startNode: (id: string) => void
  endNode: (id: string, status: NodeStatus, error?: string) => void
  appendLog: (id: string, level: 'info' | 'warn' | 'error', msg: string) => void
  setNodeOutputs: (id: string, outputs: Record<string, unknown>) => void
}

const blankNode = (): NodeRunState => ({ status: 'pending', logs: [] })

export const useRunContext = create<RunContextState>((set, get) => ({
  isRunning: false,
  abortController: null,
  nodeStates: {},
  edgesActive: new Set(),
  startRun: () => {
    const ac = new AbortController()
    set({ isRunning: true, abortController: ac, nodeStates: {}, edgesActive: new Set() })
    return ac
  },
  endRun: () => set({ isRunning: false, abortController: null }),
  resetRun: () => set({ isRunning: false, abortController: null, nodeStates: {}, edgesActive: new Set() }),
  setNodeStatus: (id, status) =>
    set((s) => ({
      nodeStates: { ...s.nodeStates, [id]: { ...(s.nodeStates[id] ?? blankNode()), status } },
    })),
  startNode: (id) =>
    set((s) => ({
      nodeStates: {
        ...s.nodeStates,
        [id]: { ...(s.nodeStates[id] ?? blankNode()), status: 'running', startedAt: Date.now() },
      },
    })),
  endNode: (id, status, error) =>
    set((s) => {
      const prev = s.nodeStates[id] ?? blankNode()
      const endedAt = Date.now()
      return {
        nodeStates: {
          ...s.nodeStates,
          [id]: {
            ...prev,
            status,
            endedAt,
            durationMs: prev.startedAt ? endedAt - prev.startedAt : undefined,
            error,
          },
        },
      }
    }),
  appendLog: (id, level, msg) =>
    set((s) => {
      const prev = s.nodeStates[id] ?? blankNode()
      return {
        nodeStates: {
          ...s.nodeStates,
          [id]: { ...prev, logs: [...prev.logs, { ts: Date.now(), level, msg }] },
        },
      }
    }),
  setNodeOutputs: (id, outputs) =>
    set((s) => {
      const prev = s.nodeStates[id] ?? blankNode()
      return {
        nodeStates: { ...s.nodeStates, [id]: { ...prev, outputs } },
      }
    }),
}))
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/runtime/runContext.ts
git commit -m "feat(workflows): RunContext Zustand store (status/logs/outputs per node)"
```

---

### Task 6: Executor with middleware chain

**Files:**
- Create: `src/features/workflows/runtime/executor.ts`
- Create: `src/features/workflows/runtime/executor.test.ts`
- Create: `src/features/workflows/registry/index.ts`

- [ ] **Step 1: Write minimal `nodeRegistry`**

```ts
// src/features/workflows/registry/index.ts
import type { NodeSpec } from '../types'

class NodeRegistry {
  private map = new Map<string, NodeSpec>()
  register(spec: NodeSpec): void {
    if (this.map.has(spec.type)) {
      throw new Error(`Node type "${spec.type}" already registered`)
    }
    this.map.set(spec.type, spec)
  }
  get(type: string): NodeSpec | undefined {
    return this.map.get(type)
  }
  list(): NodeSpec[] {
    return Array.from(this.map.values())
  }
  clear(): void {
    this.map.clear()
  }
}

export const nodeRegistry = new NodeRegistry()
```

- [ ] **Step 2: Write the failing executor test**

```ts
// src/features/workflows/runtime/executor.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Box } from 'lucide-react'
import { executeWorkflow } from './executor'
import { nodeRegistry } from '../registry'
import { portTypeRegistry, registerBuiltinPorts } from './ports'
import { useRunContext } from './runContext'
import type { NodeSpec, Workflow } from '../types'

const makeWorkflow = (nodes: Workflow['nodes'], edges: Workflow['edges']): Workflow => ({
  id: 'wf', schemaVersion: 1, name: 'test', description: '', ownerId: 'u',
  createdAt: 0, updatedAt: 0, nodes, edges,
})

const noopSpec = (type: string, body?: (inputs: any) => unknown): NodeSpec => ({
  type, category: 'utility', label: type, description: '', icon: Box,
  inputs: [{ name: 'in', type: 'sheet', required: false }],
  outputs: [{ name: 'out', type: 'sheet' }],
  configSchema: [], defaultConfig: {}, runtime: 'client',
  run: async (_ctx, _config, inputs) => ({ out: body ? body(inputs) : inputs }),
})

describe('executeWorkflow', () => {
  beforeEach(() => {
    nodeRegistry.clear()
    portTypeRegistry.clear()
    registerBuiltinPorts()
    useRunContext.getState().resetRun()
  })

  it('runs single node', async () => {
    nodeRegistry.register(noopSpec('a', () => ({ value: 1 })))
    const wf = makeWorkflow(
      [{ id: 'n1', type: 'a', position: { x: 0, y: 0 }, config: {} }],
      []
    )
    await executeWorkflow(wf)
    const state = useRunContext.getState().nodeStates['n1']
    expect(state.status).toBe('success')
    expect(state.outputs).toEqual({ out: { value: 1 } })
  })

  it('passes outputs along edges', async () => {
    nodeRegistry.register(noopSpec('src', () => 'hello'))
    nodeRegistry.register(noopSpec('dst', (inputs) => inputs.in + ' world'))
    const wf = makeWorkflow(
      [
        { id: 'n1', type: 'src', position: { x: 0, y: 0 }, config: {} },
        { id: 'n2', type: 'dst', position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' }]
    )
    await executeWorkflow(wf)
    expect(useRunContext.getState().nodeStates['n2'].outputs).toEqual({ out: 'hello world' })
  })

  it('marks downstream as skipped on error', async () => {
    nodeRegistry.register({
      ...noopSpec('boom'),
      run: async () => {
        throw new Error('kaboom')
      },
    })
    nodeRegistry.register(noopSpec('after'))
    const wf = makeWorkflow(
      [
        { id: 'n1', type: 'boom', position: { x: 0, y: 0 }, config: {} },
        { id: 'n2', type: 'after', position: { x: 0, y: 0 }, config: {} },
      ],
      [{ id: 'e1', source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' }]
    )
    await executeWorkflow(wf)
    const states = useRunContext.getState().nodeStates
    expect(states['n1'].status).toBe('error')
    expect(states['n1'].error).toContain('kaboom')
    expect(states['n2'].status).toBe('skipped')
  })

  it('respects abort signal', async () => {
    nodeRegistry.register({
      ...noopSpec('slow'),
      run: async (ctx) => {
        await new Promise((r) => setTimeout(r, 50))
        if (ctx.signal.aborted) throw new Error('aborted')
        return { out: 'done' }
      },
    })
    const wf = makeWorkflow(
      [{ id: 'n1', type: 'slow', position: { x: 0, y: 0 }, config: {} }],
      []
    )
    const promise = executeWorkflow(wf)
    setTimeout(() => useRunContext.getState().abortController?.abort(), 10)
    await promise
    expect(useRunContext.getState().nodeStates['n1'].status).toBe('error')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:run -- src/features/workflows/runtime/executor.test.ts
```
Expected: FAIL.

- [ ] **Step 4: Implement `executor.ts`**

```ts
// src/features/workflows/runtime/executor.ts
import type { Workflow, WorkflowNode, RunContextApi } from '../types'
import { nodeRegistry } from '../registry'
import { topoSort } from './topo'
import { useRunContext } from './runContext'

export type Middleware = (
  node: WorkflowNode,
  next: () => Promise<void>
) => Promise<void>

export interface ExecuteOptions {
  middleware?: Middleware[]
}

export async function executeWorkflow(wf: Workflow, opts: ExecuteOptions = {}): Promise<void> {
  const ctxStore = useRunContext.getState()
  const ac = ctxStore.startRun()
  try {
    const ordered = topoSort(wf.nodes, wf.edges)
    const outputs = new Map<string, Record<string, unknown>>()
    const skipped = new Set<string>()

    for (const node of ordered) {
      // Skip if any upstream is skipped or errored
      const upstream = wf.edges.filter((e) => e.target === node.id)
      const upstreamFailed = upstream.some(
        (e) => skipped.has(e.source) || useRunContext.getState().nodeStates[e.source]?.status === 'error'
      )
      if (upstreamFailed) {
        skipped.add(node.id)
        useRunContext.getState().setNodeStatus(node.id, 'skipped')
        continue
      }

      if (ac.signal.aborted) {
        useRunContext.getState().endNode(node.id, 'error', 'Run aborted')
        continue
      }

      const spec = nodeRegistry.get(node.type)
      if (!spec) {
        useRunContext.getState().endNode(node.id, 'error', `Unknown node type: ${node.type}`)
        continue
      }

      const inputs: Record<string, unknown> = {}
      for (const e of upstream) {
        const src = outputs.get(e.source)
        if (src && e.sourceHandle in src) inputs[e.targetHandle] = src[e.sourceHandle]
      }

      const ctxApi: RunContextApi = {
        signal: ac.signal,
        log: (level, msg) => useRunContext.getState().appendLog(node.id, level, msg),
      }

      const exec = async (): Promise<void> => {
        useRunContext.getState().startNode(node.id)
        try {
          const result = (await spec.run(ctxApi, node.config, inputs)) as Record<string, unknown>
          outputs.set(node.id, result ?? {})
          useRunContext.getState().setNodeOutputs(node.id, result ?? {})
          useRunContext.getState().endNode(node.id, 'success')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          useRunContext.getState().endNode(node.id, 'error', msg)
        }
      }

      // Compose middleware chain
      const chain = (opts.middleware ?? []).reduceRight<() => Promise<void>>(
        (next, mw) => () => mw(node, next),
        exec
      )
      await chain()
    }
  } finally {
    useRunContext.getState().endRun()
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:run -- src/features/workflows/runtime/executor.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/workflows/runtime/executor.ts src/features/workflows/runtime/executor.test.ts src/features/workflows/registry/index.ts
git commit -m "feat(workflows): executor with middleware chain + nodeRegistry"
```

---

### Task 7: Persistence — migrations + Firestore API

**Files:**
- Create: `src/features/workflows/persistence/migrations.ts`
- Create: `src/features/workflows/persistence/migrations.test.ts`
- Create: `src/features/workflows/persistence/workflowsApi.ts`

- [ ] **Step 1: Write the failing migrations test**

```ts
// src/features/workflows/persistence/migrations.test.ts
import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations'

describe('migrate', () => {
  it('returns workflow as-is when at current version', () => {
    const wf = { schemaVersion: CURRENT_SCHEMA_VERSION, nodes: [], edges: [] } as any
    expect(migrate(wf).schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('throws when version is from the future', () => {
    const wf = { schemaVersion: CURRENT_SCHEMA_VERSION + 1 } as any
    expect(() => migrate(wf)).toThrow(/from the future/i)
  })

  it('handles missing schemaVersion as v1', () => {
    const wf = { nodes: [], edges: [] } as any
    expect(migrate(wf).schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/features/workflows/persistence/migrations.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `migrations.ts`**

```ts
// src/features/workflows/persistence/migrations.ts
import type { Workflow } from '../types'

export const CURRENT_SCHEMA_VERSION = 1

type Migrator = (wf: any) => any

const migrators: Record<number, Migrator> = {
  // Future: 1: (wf) => ({ ...wf, schemaVersion: 2, /* changes */ }),
}

export function migrate(wf: Partial<Workflow> & { schemaVersion?: number }): Workflow {
  let from = wf.schemaVersion ?? 1
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Workflow schemaVersion ${from} is from the future (current=${CURRENT_SCHEMA_VERSION})`)
  }
  let current = { ...wf, schemaVersion: from } as any
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const m = migrators[current.schemaVersion]
    if (!m) throw new Error(`Missing migrator for v${current.schemaVersion}`)
    current = m(current)
  }
  return current as Workflow
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/features/workflows/persistence/migrations.test.ts
```
Expected: PASS.

- [ ] **Step 5: Implement `workflowsApi.ts`**

```ts
// src/features/workflows/persistence/workflowsApi.ts
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Workflow } from '../types'
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations'

const col = (uid: string) => collection(db, 'users', uid, 'workflows')

export async function listWorkflows(uid: string): Promise<Workflow[]> {
  const snap = await getDocs(query(col(uid), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => migrate(d.data() as Workflow))
}

export async function getWorkflow(uid: string, id: string): Promise<Workflow | null> {
  const snap = await getDoc(doc(col(uid), id))
  if (!snap.exists()) return null
  return migrate(snap.data() as Workflow)
}

export async function saveWorkflow(uid: string, wf: Workflow): Promise<void> {
  const next: Workflow = { ...wf, schemaVersion: CURRENT_SCHEMA_VERSION, updatedAt: Date.now() }
  await setDoc(doc(col(uid), wf.id), next)
}

export async function deleteWorkflow(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(col(uid), id))
}

export function newWorkflow(uid: string): Workflow {
  const now = Date.now()
  return {
    id: `wf_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: 'Untitled workflow',
    description: '',
    ownerId: uid,
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
  }
}
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/workflows/persistence/migrations.ts src/features/workflows/persistence/migrations.test.ts src/features/workflows/persistence/workflowsApi.ts
git commit -m "feat(workflows): persistence — migrations + Firestore API"
```

---

### Task 8: `workflow.store.ts` Zustand store with autosave

**Files:**
- Create: `src/features/workflows/persistence/workflow.store.ts`

- [ ] **Step 1: Write the file**

```ts
// src/features/workflows/persistence/workflow.store.ts
import { create } from 'zustand'
import type { Workflow, WorkflowNode, WorkflowEdge } from '../types'
import { saveWorkflow } from './workflowsApi'

interface WorkflowStoreState {
  current: Workflow | null
  dirty: boolean
  saving: boolean
  lastSavedAt: number | null
  setCurrent: (wf: Workflow | null) => void
  patch: (patch: Partial<Workflow>) => void
  setNodes: (nodes: WorkflowNode[]) => void
  setEdges: (edges: WorkflowEdge[]) => void
  upsertNode: (node: WorkflowNode) => void
  removeNode: (id: string) => void
  upsertEdge: (edge: WorkflowEdge) => void
  removeEdge: (id: string) => void
  flush: (uid: string) => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useWorkflowStore = create<WorkflowStoreState>((set, get) => {
  const markDirty = () => {
    set({ dirty: true })
  }
  return {
    current: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
    setCurrent: (wf) => set({ current: wf, dirty: false, lastSavedAt: null }),
    patch: (p) => {
      const cur = get().current
      if (!cur) return
      set({ current: { ...cur, ...p } })
      markDirty()
    },
    setNodes: (nodes) => {
      const cur = get().current
      if (!cur) return
      set({ current: { ...cur, nodes } })
      markDirty()
    },
    setEdges: (edges) => {
      const cur = get().current
      if (!cur) return
      set({ current: { ...cur, edges } })
      markDirty()
    },
    upsertNode: (node) => {
      const cur = get().current
      if (!cur) return
      const i = cur.nodes.findIndex((n) => n.id === node.id)
      const nodes = i === -1 ? [...cur.nodes, node] : cur.nodes.map((n) => (n.id === node.id ? node : n))
      set({ current: { ...cur, nodes } })
      markDirty()
    },
    removeNode: (id) => {
      const cur = get().current
      if (!cur) return
      const nodes = cur.nodes.filter((n) => n.id !== id)
      const edges = cur.edges.filter((e) => e.source !== id && e.target !== id)
      set({ current: { ...cur, nodes, edges } })
      markDirty()
    },
    upsertEdge: (edge) => {
      const cur = get().current
      if (!cur) return
      const i = cur.edges.findIndex((e) => e.id === edge.id)
      const edges = i === -1 ? [...cur.edges, edge] : cur.edges.map((e) => (e.id === edge.id ? edge : e))
      set({ current: { ...cur, edges } })
      markDirty()
    },
    removeEdge: (id) => {
      const cur = get().current
      if (!cur) return
      set({ current: { ...cur, edges: cur.edges.filter((e) => e.id !== id) } })
      markDirty()
    },
    flush: async (uid) => {
      const cur = get().current
      if (!cur || !get().dirty) return
      set({ saving: true })
      try {
        await saveWorkflow(uid, cur)
        set({ dirty: false, lastSavedAt: Date.now() })
      } finally {
        set({ saving: false })
      }
    },
  }
})

export function startAutosave(uid: string, intervalMs = 1500): () => void {
  return useWorkflowStore.subscribe((s) => {
    if (saveTimer) clearTimeout(saveTimer)
    if (s.dirty && !s.saving && s.current) {
      saveTimer = setTimeout(() => useWorkflowStore.getState().flush(uid), intervalMs)
    }
  }) as unknown as () => void
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/persistence/workflow.store.ts
git commit -m "feat(workflows): workflow.store with debounced autosave"
```

---

## Phase 2 — Editor UI

### Task 9: `WorkflowsPage` (list view)

**Files:**
- Create: `src/features/workflows/WorkflowsPage.tsx`
- Create: `src/pages/WorkflowsPage.tsx` (route entry)
- Modify: `src/app/router.tsx`

- [ ] **Step 1: Implement the list page**

```tsx
// src/features/workflows/WorkflowsPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { listWorkflows, newWorkflow, saveWorkflow, deleteWorkflow } from './persistence/workflowsApi'
import type { Workflow } from './types'

export function WorkflowsPage() {
  const uid = useAuthStore((s) => s.user?.uid)
  const nav = useNavigate()
  const [items, setItems] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    listWorkflows(uid).then((wfs) => {
      setItems(wfs)
      setLoading(false)
    })
  }, [uid])

  const create = async () => {
    if (!uid) return
    const wf = newWorkflow(uid)
    await saveWorkflow(uid, wf)
    nav(`/workflows/${wf.id}`)
  }
  const remove = async (id: string) => {
    if (!uid) return
    await deleteWorkflow(uid, id)
    setItems((prev) => prev.filter((w) => w.id !== id))
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <WorkflowIcon className="w-6 h-6 text-indigo-400" />
            Workflows
          </h1>
          <button
            onClick={create}
            className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nouveau workflow
          </button>
        </header>
        {loading ? (
          <p className="text-neutral-400">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-neutral-400">Aucun workflow. Créez-en un pour commencer.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((wf) => (
              <li
                key={wf.id}
                className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-4 hover:border-indigo-500 transition cursor-pointer"
                onClick={() => nav(`/workflows/${wf.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-medium">{wf.name}</h2>
                    <p className="text-sm text-neutral-500 mt-1">
                      {wf.nodes.length} nodes · {wf.edges.length} liens
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(wf.id)
                    }}
                    className="text-neutral-500 hover:text-red-400 p-1"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Page entry**

```tsx
// src/pages/WorkflowsPage.tsx
export { WorkflowsPage as default } from '@/features/workflows/WorkflowsPage'
```

- [ ] **Step 3: Add the route**

Modify `src/app/router.tsx`:
```tsx
const WorkflowsPage = lazy(() => import('@/pages/WorkflowsPage'))
const WorkflowEditorPage = lazy(() => import('@/pages/WorkflowEditorPage'))
// ...
// inside the routes array:
{
  path: '/workflows',
  element: (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        <WorkflowsPage />
      </Suspense>
    </ProtectedRoute>
  ),
},
{
  path: '/workflows/:id',
  element: (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        <WorkflowEditorPage />
      </Suspense>
    </ProtectedRoute>
  ),
},
```

- [ ] **Step 4: Page entry for editor**

```tsx
// src/pages/WorkflowEditorPage.tsx
export { WorkflowEditorPage as default } from '@/features/workflows/editor/WorkflowEditorPage'
```

(The editor file is created in Task 10; this stub references it now to keep the route registered.)

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```
Expected: errors about missing `WorkflowEditorPage` export — accepted, fixed in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/features/workflows/WorkflowsPage.tsx src/pages/WorkflowsPage.tsx src/pages/WorkflowEditorPage.tsx src/app/router.tsx
git commit -m "feat(workflows): list page + routes /workflows and /workflows/:id"
```

---

### Task 10: `WorkflowEditorPage` with React Flow canvas

**Files:**
- Create: `src/features/workflows/editor/WorkflowEditorPage.tsx`
- Create: `src/features/workflows/editor/WorkflowEditor.tsx`
- Create: `src/features/workflows/editor/nodes/BaseNode.tsx`
- Create: `src/features/workflows/registry/builtin.ts`

- [ ] **Step 1: Create a placeholder builtin registry init**

```ts
// src/features/workflows/registry/builtin.ts
import { portTypeRegistry, registerBuiltinPorts } from '../runtime/ports'
import { nodeRegistry } from './index'

let initialized = false

export function initWorkflowsRegistry(): void {
  if (initialized) return
  initialized = true
  if (portTypeRegistry.list().length === 0) registerBuiltinPorts()
  // Node specs are registered here once each *.node.ts module is added (Phase 3).
  // Importing them is enough — they call nodeRegistry.register at module load.
}
```

- [ ] **Step 2: BaseNode component**

```tsx
// src/features/workflows/editor/nodes/BaseNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useRunContext } from '../../runtime/runContext'
import { nodeRegistry } from '../../registry'
import { CheckCircle2, Circle, Loader2, AlertCircle, MinusCircle } from 'lucide-react'

const STATUS_ICON = {
  pending: <Circle className="w-3 h-3 text-neutral-600" />,
  running: <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />,
  success: <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
  error: <AlertCircle className="w-3 h-3 text-red-500" />,
  skipped: <MinusCircle className="w-3 h-3 text-neutral-500" />,
}

export function BaseNode({ id, data }: NodeProps) {
  const nodeType = (data as any).type as string
  const spec = nodeRegistry.get(nodeType)
  const state = useRunContext((s) => s.nodeStates[id])
  const Icon = spec?.icon

  if (!spec) {
    return <div className="bg-red-900 text-white text-xs p-2 rounded">Unknown: {nodeType}</div>
  }

  return (
    <div className="bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-lg min-w-[180px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        {Icon ? <Icon className="w-4 h-4 text-indigo-400" /> : null}
        <span className="text-sm text-white flex-1">{spec.label}</span>
        {STATUS_ICON[state?.status ?? 'pending']}
      </div>
      <div className="px-3 py-2 text-xs text-neutral-500">
        {spec.inputs.map((p) => (
          <div key={p.name} className="relative py-1">
            <Handle
              type="target"
              id={p.name}
              position={Position.Left}
              className="!bg-indigo-500 !w-2 !h-2"
            />
            <span className="ml-2">{p.name}</span>
          </div>
        ))}
        {spec.outputs.map((p) => (
          <div key={p.name} className="relative py-1 text-right">
            <span className="mr-2">{p.name}</span>
            <Handle
              type="source"
              id={p.name}
              position={Position.Right}
              className="!bg-indigo-500 !w-2 !h-2"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: WorkflowEditor**

```tsx
// src/features/workflows/editor/WorkflowEditor.tsx
import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { BaseNode } from './nodes/BaseNode'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { isCompatible } from '../runtime/ports'

const nodeTypes = { base: BaseNode }

function toRfNodes(workflowNodes: ReturnType<typeof useWorkflowStore.getState>['current'] extends infer T ? any : never): Node[] {
  return [] as Node[]
}

export function WorkflowEditor() {
  const wf = useWorkflowStore((s) => s.current)
  const setNodes = useWorkflowStore((s) => s.setNodes)
  const setEdges = useWorkflowStore((s) => s.setEdges)
  const upsertEdge = useWorkflowStore((s) => s.upsertEdge)

  const rfNodes: Node[] = useMemo(
    () =>
      (wf?.nodes ?? []).map((n) => ({
        id: n.id,
        type: 'base',
        position: n.position,
        data: { type: n.type, config: n.config },
      })),
    [wf?.nodes]
  )
  const rfEdges: Edge[] = useMemo(
    () =>
      (wf?.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
    [wf?.edges]
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!wf) return
      const next = applyNodeChanges(changes, rfNodes)
      setNodes(
        next.map((n) => {
          const existing = wf.nodes.find((x) => x.id === n.id)
          return {
            id: n.id,
            type: existing?.type ?? (n.data as any).type,
            position: n.position,
            config: existing?.config ?? (n.data as any).config,
          }
        })
      )
    },
    [wf, rfNodes, setNodes]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!wf) return
      const next = applyEdgeChanges(changes, rfEdges)
      setEdges(
        next.map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle ?? 'out',
          target: e.target,
          targetHandle: e.targetHandle ?? 'in',
        }))
      )
    },
    [wf, rfEdges, setEdges]
  )

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!wf || !conn.source || !conn.target) return
      const sourceSpec = nodeRegistry.get(wf.nodes.find((n) => n.id === conn.source)!.type)
      const targetSpec = nodeRegistry.get(wf.nodes.find((n) => n.id === conn.target)!.type)
      const srcPort = sourceSpec?.outputs.find((o) => o.name === conn.sourceHandle)
      const tgtPort = targetSpec?.inputs.find((i) => i.name === conn.targetHandle)
      if (!srcPort || !tgtPort || !isCompatible(srcPort.type, tgtPort.type)) return
      upsertEdge({
        id: `e_${conn.source}_${conn.sourceHandle}_${conn.target}_${conn.targetHandle}`,
        source: conn.source,
        sourceHandle: conn.sourceHandle ?? 'out',
        target: conn.target,
        targetHandle: conn.targetHandle ?? 'in',
      })
    },
    [wf, upsertEdge]
  )

  return (
    <div className="flex-1 bg-[#0f0f0f]">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#222" gap={20} />
        <Controls className="!bg-[#1a1a1a] !border-neutral-800" />
        <MiniMap className="!bg-[#1a1a1a]" maskColor="rgba(0,0,0,0.6)" />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 4: WorkflowEditorPage shell**

```tsx
// src/features/workflows/editor/WorkflowEditorPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Play, Square } from 'lucide-react'
import { ReactFlowProvider } from '@xyflow/react'
import { useAuthStore } from '@/stores/auth.store'
import { getWorkflow, saveWorkflow } from '../persistence/workflowsApi'
import { useWorkflowStore, startAutosave } from '../persistence/workflow.store'
import { useRunContext } from '../runtime/runContext'
import { executeWorkflow } from '../runtime/executor'
import { initWorkflowsRegistry } from '../registry/builtin'
import { WorkflowEditor } from './WorkflowEditor'
import { NodePalette } from './NodePalette'
import { NodeConfigPanel } from './NodeConfigPanel'
import { RunPanel } from './RunPanel'

export function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const uid = useAuthStore((s) => s.user?.uid)
  const wf = useWorkflowStore((s) => s.current)
  const setCurrent = useWorkflowStore((s) => s.setCurrent)
  const dirty = useWorkflowStore((s) => s.dirty)
  const isRunning = useRunContext((s) => s.isRunning)
  const ac = useRunContext((s) => s.abortController)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initWorkflowsRegistry()
  }, [])

  useEffect(() => {
    if (!uid || !id) return
    setLoading(true)
    getWorkflow(uid, id).then((w) => {
      setCurrent(w)
      setLoading(false)
    })
    return () => setCurrent(null)
  }, [uid, id, setCurrent])

  useEffect(() => {
    if (!uid) return
    return startAutosave(uid)
  }, [uid])

  if (loading) return <div className="min-h-screen bg-[#0f0f0f] text-white p-8">Chargement…</div>
  if (!wf) return <div className="min-h-screen bg-[#0f0f0f] text-white p-8">Workflow introuvable</div>

  const run = () => executeWorkflow(wf)
  const stop = () => ac?.abort()

  return (
    <ReactFlowProvider>
      <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col">
        <header className="border-b border-neutral-800 px-4 py-2 flex items-center gap-3">
          <button onClick={() => nav('/workflows')} className="p-2 hover:bg-neutral-800 rounded">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <input
            value={wf.name}
            onChange={(e) => useWorkflowStore.getState().patch({ name: e.target.value })}
            className="bg-transparent border-none outline-none text-sm flex-1"
          />
          <span className="text-xs text-neutral-500">{dirty ? 'Modifications…' : 'Enregistré'}</span>
          {isRunning ? (
            <button onClick={stop} className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 flex items-center gap-2 text-sm">
              <Square className="w-4 h-4" /> Stop
            </button>
          ) : (
            <button onClick={run} className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2 text-sm">
              <Play className="w-4 h-4" /> Run
            </button>
          )}
          <button
            onClick={() => uid && saveWorkflow(uid, wf)}
            className="p-2 hover:bg-neutral-800 rounded"
            aria-label="Save"
          >
            <Save className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 flex overflow-hidden">
          <NodePalette />
          <WorkflowEditor />
          <NodeConfigPanel />
        </div>
        <RunPanel />
      </div>
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```
Expected: errors about NodePalette/NodeConfigPanel/RunPanel — accepted, fixed in following tasks.

- [ ] **Step 6: Commit**

```bash
git add src/features/workflows/editor/WorkflowEditorPage.tsx src/features/workflows/editor/WorkflowEditor.tsx src/features/workflows/editor/nodes/BaseNode.tsx src/features/workflows/registry/builtin.ts
git commit -m "feat(workflows): editor page + React Flow canvas + BaseNode"
```

---

### Task 11: NodePalette (drag&drop spawn)

**Files:**
- Create: `src/features/workflows/editor/NodePalette.tsx`

- [ ] **Step 1: Implement palette**

```tsx
// src/features/workflows/editor/NodePalette.tsx
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import type { NodeSpec } from '../types'

const CATEGORY_LABEL: Record<NodeSpec['category'], string> = {
  import: 'Import',
  enrichment: 'Enrichissement',
  persistence: 'Sauvegarde',
  export: 'Export',
  utility: 'Utilitaires',
}

export function NodePalette() {
  const upsertNode = useWorkflowStore((s) => s.upsertNode)
  const rf = useReactFlow()

  const grouped = nodeRegistry.list().reduce<Record<string, NodeSpec[]>>((acc, spec) => {
    ;(acc[spec.category] ??= []).push(spec)
    return acc
  }, {})

  const spawn = (spec: NodeSpec) => {
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    upsertNode({
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: spec.type,
      position: center,
      config: spec.defaultConfig,
    })
  }

  return (
    <aside className="w-56 border-r border-neutral-800 bg-[#0f0f0f] overflow-y-auto p-3">
      <h3 className="text-xs uppercase text-neutral-500 font-semibold mb-3">Palette</h3>
      {Object.entries(grouped).map(([cat, specs]) => (
        <section key={cat} className="mb-4">
          <h4 className="text-xs text-neutral-400 mb-2">{CATEGORY_LABEL[cat as NodeSpec['category']]}</h4>
          <ul className="space-y-1">
            {specs.map((spec) => {
              const Icon = spec.icon
              return (
                <li key={spec.type}>
                  <button
                    onClick={() => spawn(spec)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left bg-[#1a1a1a] hover:bg-[#222] border border-neutral-800"
                  >
                    <Icon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{spec.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/workflows/editor/NodePalette.tsx
git commit -m "feat(workflows): NodePalette grouped by category"
```

---

### Task 12: `NodeConfigPanel` + declarative config field renderers

**Files:**
- Create: `src/features/workflows/editor/configFields/index.tsx`
- Create: `src/features/workflows/editor/NodeConfigPanel.tsx`

- [ ] **Step 1: Field renderers**

```tsx
// src/features/workflows/editor/configFields/index.tsx
import type { ConfigField } from '../../types'

interface FieldProps {
  field: ConfigField
  value: unknown
  onChange: (next: unknown) => void
}

const inputCls = 'w-full bg-[#0f0f0f] border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-indigo-500 outline-none'

export function ConfigFieldRenderer({ field, value, onChange }: FieldProps) {
  switch (field.kind) {
    case 'text':
    case 'expression':
    case 'columnRef':
      return <input type="text" className={inputCls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={field.help} />
    case 'textarea':
      return <textarea className={inputCls + ' min-h-[80px]'} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    case 'number':
      return <input type="number" className={inputCls} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />
    case 'checkbox':
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
    case 'select':
      return (
        <select className={inputCls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    default:
      return <span className="text-xs text-red-400">Unknown field kind: {(field as any).kind}</span>
  }
}
```

- [ ] **Step 2: NodeConfigPanel**

```tsx
// src/features/workflows/editor/NodeConfigPanel.tsx
import { useReactFlow, useStore } from '@xyflow/react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { ConfigFieldRenderer } from './configFields'

export function NodeConfigPanel() {
  const selected = useStore((s) => Array.from(s.nodeLookup.values()).find((n) => (n as any).selected) as { id: string } | undefined)
  const wf = useWorkflowStore((s) => s.current)
  const upsertNode = useWorkflowStore((s) => s.upsertNode)

  const node = wf?.nodes.find((n) => n.id === selected?.id)
  const spec = node ? nodeRegistry.get(node.type) : undefined

  return (
    <aside className="w-72 border-l border-neutral-800 bg-[#0f0f0f] overflow-y-auto p-4">
      <h3 className="text-xs uppercase text-neutral-500 font-semibold mb-3">Configuration</h3>
      {!node || !spec ? (
        <p className="text-sm text-neutral-500">Sélectionnez un node pour voir ses paramètres.</p>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium text-white">{spec.label}</div>
          {spec.ConfigComponent ? (
            <spec.ConfigComponent
              config={node.config as any}
              onChange={(c) => upsertNode({ ...node, config: c })}
            />
          ) : (
            spec.configSchema.map((f) => (
              <label key={f.name} className="block">
                <span className="text-xs text-neutral-400 mb-1 block">{f.label}</span>
                <ConfigFieldRenderer
                  field={f}
                  value={(node.config as Record<string, unknown>)[f.name]}
                  onChange={(v) =>
                    upsertNode({
                      ...node,
                      config: { ...(node.config as Record<string, unknown>), [f.name]: v },
                    })
                  }
                />
                {f.help ? <span className="text-[11px] text-neutral-600 mt-1 block">{f.help}</span> : null}
              </label>
            ))
          )}
        </div>
      )}
    </aside>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/editor/configFields/index.tsx src/features/workflows/editor/NodeConfigPanel.tsx
git commit -m "feat(workflows): NodeConfigPanel + declarative config field renderers"
```

---

### Task 13: RunPanel (logs + intermediate previews)

**Files:**
- Create: `src/features/workflows/editor/RunPanel.tsx`

- [ ] **Step 1: Implement RunPanel**

```tsx
// src/features/workflows/editor/RunPanel.tsx
import { useState } from 'react'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'

export function RunPanel() {
  const states = useRunContext((s) => s.nodeStates)
  const wf = useWorkflowStore((s) => s.current)
  const [open, setOpen] = useState(true)
  const entries = Object.entries(states)

  return (
    <div className="border-t border-neutral-800 bg-[#0f0f0f] text-sm">
      <button
        className="w-full px-4 py-1.5 text-xs uppercase text-neutral-500 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▾' : '▸'} Run logs ({entries.length} nodes)
      </button>
      {open ? (
        <div className="max-h-56 overflow-y-auto px-4 pb-3 space-y-2">
          {entries.map(([id, st]) => {
            const node = wf?.nodes.find((n) => n.id === id)
            const spec = node ? nodeRegistry.get(node.type) : undefined
            return (
              <div key={id} className="bg-[#1a1a1a] rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">
                    {spec?.label ?? node?.type ?? id} <span className="text-neutral-600">· {st.status}</span>
                  </span>
                  {st.durationMs ? <span className="text-neutral-600">{st.durationMs}ms</span> : null}
                </div>
                {st.error ? <div className="text-red-400 mt-1">{st.error}</div> : null}
                {st.logs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.level === 'error'
                        ? 'text-red-400'
                        : l.level === 'warn'
                        ? 'text-amber-400'
                        : 'text-neutral-400'
                    }
                  >
                    · {l.msg}
                  </div>
                ))}
                {st.outputs ? (
                  <details className="mt-1">
                    <summary className="text-neutral-500 cursor-pointer">Outputs</summary>
                    <pre className="text-[10px] text-neutral-400 overflow-x-auto">
                      {JSON.stringify(st.outputs, null, 2).slice(0, 2000)}
                    </pre>
                  </details>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/editor/RunPanel.tsx
git commit -m "feat(workflows): RunPanel with per-node logs and outputs preview"
```

---

### Task 14: Add nav entry to dashboard / main nav

**Files:**
- Modify: `src/pages/DashboardPage.tsx` (or whatever exposes the main nav)

- [ ] **Step 1: Locate nav and add entry**

Run:
```bash
grep -rn "Editor\|Taxonomies\|Données" src/pages/DashboardPage.tsx src/components/ 2>/dev/null | head
```

- [ ] **Step 2: Add a "Workflows" link / card next to Editor / Données**

Match the existing pattern (Tailwind dark, indigo accent, Lucide icon `Workflow`). Example button in DashboardPage:

```tsx
<Link to="/workflows" className="… same classes as Editor card …">
  <Workflow className="w-6 h-6 text-indigo-400" />
  <span>Workflows</span>
</Link>
```

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```
- Open http://localhost:5173/workflows
- Click "Nouveau workflow" → should navigate to `/workflows/<id>` and show the empty editor.
- Check the palette is empty (no nodes registered yet — Phase 3 fixes that).

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(workflows): add Workflows entry in main nav"
```

---

## Phase 3 — Node catalog

### Task 15: Refactor `useProductEnrichment` core to a pure async function

The existing hook lives in `src/features/excel/ai-enrichment/useProductEnrichment.ts`. We need a callable function so a workflow node can call it outside React.

**Files:**
- Modify: `src/features/excel/ai-enrichment/useProductEnrichment.ts`
- Create: `src/features/excel/ai-enrichment/enrichRow.ts`

- [ ] **Step 1: Read the current hook**

```bash
cat src/features/excel/ai-enrichment/useProductEnrichment.ts
```

- [ ] **Step 2: Identify the pure core**

Locate the core enrichment logic (calls to scrape + LLM) inside the hook and extract it into a standalone async function `enrichRow(input: EnrichRowInput): Promise<EnrichedRow>` in `enrichRow.ts`. The function must NOT use React hooks. Inputs needed: URL, target columns, model id, abort signal, optional progress callback.

- [ ] **Step 3: Re-implement the hook to call the pure function**

The hook keeps its public API; internally it calls `enrichRow()` per row.

- [ ] **Step 4: Run existing tests**

```bash
npm run test:run -- src/features/excel/ai-enrichment/
```
Expected: PASS (no regression).

- [ ] **Step 5: Commit**

```bash
git add src/features/excel/ai-enrichment/
git commit -m "refactor(enrichment): extract pure enrichRow() callable outside React"
```

---

### Task 16: `import-csv` node (simplest, sets template for other imports)

**Files:**
- Create: `src/features/workflows/registry/importNodes.ts`

- [ ] **Step 1: Implement Import CSV/Excel node**

```ts
// src/features/workflows/registry/importNodes.ts
import { FileSpreadsheet, FileText, FileImage } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { parseExcelFile } from '@/features/excel/parseExcelFile' // adapt to actual path
import { parseIDMLFile } from '@/features/idml/parseIDMLFile'     // adapt to actual path
import { parseSVGFile } from '@/features/svg/parseSVGFile'         // adapt to actual path

interface CsvConfig {
  delimiter: ','  | ';' | '\t'
  headerRow: boolean
}

export const importCsvNode: NodeSpec<CsvConfig, { file: File }, { sheet: unknown }> = {
  type: 'import-csv',
  category: 'import',
  label: 'Import CSV/Excel',
  description: "Charge un fichier .csv/.xlsx et produit une Sheet.",
  icon: FileSpreadsheet,
  inputs: [{ name: 'file', type: 'file', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    { name: 'delimiter', kind: 'select', label: 'Délimiteur', default: ',', options: [
      { value: ',', label: 'Virgule' }, { value: ';', label: 'Point-virgule' }, { value: '\t', label: 'Tab' },
    ]},
    { name: 'headerRow', kind: 'checkbox', label: 'Première ligne = en-têtes', default: true },
  ],
  defaultConfig: { delimiter: ',', headerRow: true },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    ctx.log('info', `Parsing file: ${inputs.file?.name ?? '<no file>'}`)
    const sheet = await parseExcelFile(inputs.file, { delimiter: config.delimiter, headerRow: config.headerRow })
    return { sheet }
  },
}

interface IdmlConfig { /* mapping fields TBD */ }

export const importIdmlNode: NodeSpec<IdmlConfig, { file: File }, { sheet: unknown }> = {
  type: 'import-idml',
  category: 'import',
  label: 'Import IDML',
  description: 'Charge un .idml et extrait une Sheet de produits.',
  icon: FileText,
  inputs: [{ name: 'file', type: 'file', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [],
  defaultConfig: {},
  runtime: 'client',
  run: async (ctx, _config, inputs) => {
    ctx.log('info', `Parsing IDML: ${inputs.file?.name ?? '<no file>'}`)
    const sheet = await parseIDMLFile(inputs.file)
    return { sheet }
  },
}

interface SvgConfig { scale: number; dpi: number }

export const importSvgNode: NodeSpec<SvgConfig, { file: File }, { sheet: unknown }> = {
  type: 'import-svg',
  category: 'import',
  label: 'Import SVG',
  description: 'Charge un .svg et extrait une Sheet.',
  icon: FileImage,
  inputs: [{ name: 'file', type: 'file', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    { name: 'scale', kind: 'number', label: 'Scale', default: 1 },
    { name: 'dpi', kind: 'number', label: 'DPI', default: 300 },
  ],
  defaultConfig: { scale: 1, dpi: 300 },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    ctx.log('info', `Parsing SVG: ${inputs.file?.name ?? '<no file>'}`)
    const sheet = await parseSVGFile(inputs.file, { scale: config.scale, dpi: config.dpi })
    return { sheet }
  },
}

nodeRegistry.register(importCsvNode)
nodeRegistry.register(importIdmlNode)
nodeRegistry.register(importSvgNode)
```

> **Important**: the imports `parseExcelFile`, `parseIDMLFile`, `parseSVGFile` need to be matched to the **actual** entry-point functions in `features/excel/`, `features/idml/`, `features/svg/`. Inspect those folders before writing this file and adjust the calls; do not invent APIs.

- [ ] **Step 2: Wire registration into `initWorkflowsRegistry`**

Edit `src/features/workflows/registry/builtin.ts`:
```ts
import './importNodes'
```
(triggers side-effect registration)

- [ ] **Step 3: Typecheck and smoke-test**

```bash
npx tsc --noEmit && npm run dev
```
- Open the editor, palette should show 3 import nodes under "Import".

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/registry/importNodes.ts src/features/workflows/registry/builtin.ts
git commit -m "feat(workflows): import nodes — CSV/Excel, IDML, SVG"
```

---

### Task 17: `enrichment` node

**Files:**
- Create: `src/features/workflows/registry/enrichmentNodes.ts`

- [ ] **Step 1: Implement enrichment node**

```ts
// src/features/workflows/registry/enrichmentNodes.ts
import { Sparkles } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { enrichRow } from '@/features/excel/ai-enrichment/enrichRow'
import { useAiSettingsStore } from '@/stores/aiSettings.store'

interface EnrichConfig {
  urlColumn: string
  fields: string  // comma-separated list of columns to enrich
  model: string   // claude / gemini model id
}

export const enrichmentNode: NodeSpec<
  EnrichConfig,
  { sheet: any },
  { sheet: any; assets: unknown[] }
> = {
  type: 'enrichment',
  category: 'enrichment',
  label: 'Enrichissement',
  description: 'Scrape les URLs d\'une colonne et complète les champs cibles via LLM.',
  icon: Sparkles,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [
    { name: 'sheet', type: 'sheet' },
    { name: 'assets', type: 'asset[]' },
  ],
  configSchema: [
    { name: 'urlColumn', kind: 'text', label: 'Colonne URL', default: 'url', required: true },
    { name: 'fields', kind: 'text', label: 'Colonnes à enrichir (séparées par virgule)', default: 'title,description,price', required: true },
    { name: 'model', kind: 'select', label: 'Modèle LLM', default: 'claude-opus-4-7', options: [
      { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
    ]},
  ],
  defaultConfig: { urlColumn: 'url', fields: 'title,description,price', model: 'claude-opus-4-7' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const sheet = inputs.sheet
    const fields = config.fields.split(',').map((s) => s.trim()).filter(Boolean)
    const collectedAssets: unknown[] = []
    const enrichedRows = []
    for (const row of sheet?.rows ?? []) {
      if (ctx.signal.aborted) break
      const url = row[config.urlColumn]
      if (!url) {
        enrichedRows.push(row)
        continue
      }
      ctx.log('info', `Enriching ${url}`)
      try {
        const result = await enrichRow({
          url,
          targetFields: fields,
          model: config.model,
          signal: ctx.signal,
        })
        enrichedRows.push({ ...row, ...result.fields })
        collectedAssets.push(...(result.assets ?? []))
      } catch (err) {
        ctx.log('error', `Failed for ${url}: ${err instanceof Error ? err.message : err}`)
        enrichedRows.push(row)
      }
    }
    return { sheet: { ...sheet, rows: enrichedRows }, assets: collectedAssets }
  },
}

nodeRegistry.register(enrichmentNode)
```

- [ ] **Step 2: Register**

Edit `builtin.ts`:
```ts
import './enrichmentNodes'
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS (assuming `enrichRow` exposes `{ fields, assets }` from Task 15 — adjust shape if your refactor used a different shape).

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/registry/enrichmentNodes.ts src/features/workflows/registry/builtin.ts
git commit -m "feat(workflows): enrichment node (sheet → sheet + asset[])"
```

---

### Task 18: Persistence nodes — `save-pim`, `save-dam`

**Files:**
- Create: `src/features/workflows/registry/persistenceNodes.ts`

- [ ] **Step 1: Implement Save PIM**

```ts
// src/features/workflows/registry/persistenceNodes.ts
import { Database, FolderUp } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { savePimFromSheet } from '@/features/pim/savePimFromSheet'      // adapt
import { uploadAssetsToDam } from '@/features/dam/uploadAssetsToDam'    // adapt

interface SavePimConfig {
  collection: string
  dedupeKey: string
}

export const savePimNode: NodeSpec<
  SavePimConfig,
  { sheet: any },
  { result: unknown }
> = {
  type: 'save-pim',
  category: 'persistence',
  label: 'Save PIM',
  description: 'Persiste les rows comme produits PIM.',
  icon: Database,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'pim-products' }],
  configSchema: [
    { name: 'collection', kind: 'text', label: 'Collection cible', default: 'products' },
    { name: 'dedupeKey', kind: 'text', label: 'Clé de dédoublonnage', default: 'sku' },
  ],
  defaultConfig: { collection: 'products', dedupeKey: 'sku' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    ctx.log('info', `Saving ${inputs.sheet?.rows?.length ?? 0} rows to PIM (${config.collection})`)
    const result = await savePimFromSheet(inputs.sheet, {
      collection: config.collection,
      dedupeKey: config.dedupeKey,
    })
    return { result }
  },
}

interface SaveDamConfig { folder: string }

export const saveDamNode: NodeSpec<
  SaveDamConfig,
  { assets: unknown[] },
  { assets: unknown[] }
> = {
  type: 'save-dam',
  category: 'persistence',
  label: 'Save DAM',
  description: 'Upload les assets dans le DAM.',
  icon: FolderUp,
  inputs: [{ name: 'assets', type: 'asset[]', required: true }],
  outputs: [{ name: 'assets', type: 'asset[]' }],
  configSchema: [
    { name: 'folder', kind: 'text', label: 'Dossier DAM', default: '/imported' },
  ],
  defaultConfig: { folder: '/imported' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    ctx.log('info', `Uploading ${inputs.assets?.length ?? 0} assets to DAM (${config.folder})`)
    const result = await uploadAssetsToDam(inputs.assets ?? [], { folder: config.folder })
    return { assets: result }
  },
}

nodeRegistry.register(savePimNode)
nodeRegistry.register(saveDamNode)
```

> **Important**: `savePimFromSheet` and `uploadAssetsToDam` are the names we want — the actual `pim.store.ts` and `dam.store.ts` will likely have actions named differently. Inspect them and either (a) call existing actions directly, or (b) create thin wrapper modules with the names above. Prefer (b) so the workflow node doesn't import a Zustand store directly.

- [ ] **Step 2: Register**

Edit `builtin.ts`:
```ts
import './persistenceNodes'
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/registry/persistenceNodes.ts src/features/workflows/registry/builtin.ts src/features/pim/savePimFromSheet.ts src/features/dam/uploadAssetsToDam.ts
git commit -m "feat(workflows): persistence nodes — save-pim, save-dam"
```

---

### Task 19: Export nodes — `export-excel`, `export-pptx`

**Files:**
- Create: `src/features/workflows/registry/exportNodes.ts`

- [ ] **Step 1: Implement export nodes**

```ts
// src/features/workflows/registry/exportNodes.ts
import { FileDown, Presentation } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { exportSheetToXlsx } from '@/features/excel/exportSheetToXlsx'  // adapt
import { exportSheetToPptx } from '@/features/pptx/exportSheetToPptx'   // adapt

interface ExportXlsxConfig { columns: string }

export const exportExcelNode: NodeSpec<
  ExportXlsxConfig,
  { sheet: any },
  { result: { url: string; mime: string; filename: string } }
> = {
  type: 'export-excel',
  category: 'export',
  label: 'Export Excel',
  description: 'Génère un .xlsx depuis une Sheet.',
  icon: FileDown,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'export-result' }],
  configSchema: [
    { name: 'columns', kind: 'text', label: 'Colonnes (séparées par virgule, vide=toutes)', default: '' },
  ],
  defaultConfig: { columns: '' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const cols = config.columns.split(',').map((s) => s.trim()).filter(Boolean)
    ctx.log('info', `Exporting ${inputs.sheet?.rows?.length ?? 0} rows to .xlsx`)
    const blob = await exportSheetToXlsx(inputs.sheet, { columns: cols.length ? cols : undefined })
    const url = URL.createObjectURL(blob)
    return { result: { url, mime: blob.type, filename: `export-${Date.now()}.xlsx` } }
  },
}

interface ExportPptxConfig { template: string }

export const exportPptxNode: NodeSpec<
  ExportPptxConfig,
  { sheet: any },
  { result: { url: string; mime: string; filename: string } }
> = {
  type: 'export-pptx',
  category: 'export',
  label: 'Export PPTX',
  description: 'Génère un .pptx depuis une Sheet.',
  icon: Presentation,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'export-result' }],
  configSchema: [
    { name: 'template', kind: 'text', label: 'Template id', default: 'default' },
  ],
  defaultConfig: { template: 'default' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    ctx.log('info', `Exporting ${inputs.sheet?.rows?.length ?? 0} rows to .pptx`)
    const blob = await exportSheetToPptx(inputs.sheet, { template: config.template })
    const url = URL.createObjectURL(blob)
    return { result: { url, mime: blob.type, filename: `export-${Date.now()}.pptx` } }
  },
}

nodeRegistry.register(exportExcelNode)
nodeRegistry.register(exportPptxNode)
```

> **Important**: `exportSheetToXlsx` and `exportSheetToPptx` likely don't exist with those names — match to the actual entry points of `features/excel/` and `features/pptx/`, or create wrappers. Same rule as Task 18.

- [ ] **Step 2: Register**

Edit `builtin.ts`:
```ts
import './exportNodes'
```

- [ ] **Step 3: Typecheck + dev smoke test**

```bash
npx tsc --noEmit && npm run dev
```
- Editor palette should now show 3 import + enrichment + 2 persistence + 2 export = 8 nodes.

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/registry/exportNodes.ts src/features/workflows/registry/builtin.ts
git commit -m "feat(workflows): export nodes — Excel, PPTX"
```

---

### Task 20: File-input node so users can feed import nodes a file

The import nodes need a `file` input, but our editor has no way to inject one yet. Add a simple `Upload` node that opens a file picker and emits a `file`.

**Files:**
- Modify: `src/features/workflows/registry/importNodes.ts`

- [ ] **Step 1: Add `upload` node spec**

Add at top of file (after imports):

```ts
import { Upload } from 'lucide-react'

interface UploadConfig { lastFileName: string }

export const uploadNode: NodeSpec<UploadConfig, {}, { file: File | null }> = {
  type: 'upload',
  category: 'import',
  label: 'Upload',
  description: 'Sélectionne un fichier local.',
  icon: Upload,
  inputs: [],
  outputs: [{ name: 'file', type: 'file' }],
  configSchema: [],
  defaultConfig: { lastFileName: '' },
  runtime: 'client',
  ConfigComponent: ({ config, onChange }) => (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          onChange({ ...config, lastFileName: f.name })
          ;(window as any).__workflowFiles ??= new Map<string, File>()
          ;(window as any).__workflowFiles.set(config.lastFileName || '__pending', f)
        }}
        className="text-xs text-neutral-300"
      />
      <div className="text-[10px] text-neutral-500 mt-1">{config.lastFileName || 'Aucun fichier'}</div>
    </div>
  ),
  run: async (ctx, config) => {
    const f = (window as any).__workflowFiles?.get(config.lastFileName)
    if (!f) {
      ctx.log('warn', 'Aucun fichier sélectionné')
      return { file: null }
    }
    return { file: f }
  },
}
```

Register at the bottom:
```ts
nodeRegistry.register(uploadNode)
```

> Note: storing `File` on `window.__workflowFiles` is a deliberate MVP shortcut. Files cannot be persisted in Firestore. Phase 2 may move them to `IndexedDB` keyed by node id, or replace this node with a "DAM picker" / "Recent uploads" picker.

- [ ] **Step 2: Convert `importNodes.ts` to `.tsx`**

Rename file to `.tsx` because the new node spec contains JSX. Run:
```bash
git mv src/features/workflows/registry/importNodes.ts src/features/workflows/registry/importNodes.tsx
```

- [ ] **Step 3: Smoke test in browser**

```bash
npm run dev
```
- Open `/workflows/<id>`
- Drag in `Upload` + `Import CSV/Excel`
- Connect `Upload.file` → `Import CSV/Excel.file`
- In Upload config, select a CSV file
- Click ▶ Run
- Check the Import node's output preview shows the parsed sheet

- [ ] **Step 4: Commit**

```bash
git add src/features/workflows/registry/importNodes.tsx
git commit -m "feat(workflows): upload node (file picker → file output)"
```

---

## Phase 4 — Integration test

### Task 21: End-to-end integration test

**Files:**
- Create: `src/features/workflows/runtime/integration.test.ts`
- Create: `src/features/workflows/test-fixtures/` (folder, with a fixture CSV/IDML)

- [ ] **Step 1: Add a small CSV fixture**

```bash
mkdir -p src/features/workflows/test-fixtures
cat > src/features/workflows/test-fixtures/products.csv <<'EOF'
sku,url,title
A1,https://example.com/p/a1,
A2,https://example.com/p/a2,
EOF
```

- [ ] **Step 2: Write the integration test**

```ts
// src/features/workflows/runtime/integration.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { Box } from 'lucide-react'
import { executeWorkflow } from './executor'
import { nodeRegistry } from '../registry'
import { portTypeRegistry, registerBuiltinPorts } from './ports'
import { useRunContext } from './runContext'
import type { NodeSpec, Workflow } from '../types'

// Mock the heavy real nodes with stubs
const stub = (type: string, run: NodeSpec['run']): NodeSpec => ({
  type,
  category: 'utility',
  label: type,
  description: '',
  icon: Box,
  inputs: type === 'parse' ? [{ name: 'file', type: 'file', required: true }] :
          type === 'enrich' ? [{ name: 'sheet', type: 'sheet', required: true }] :
          [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: type === 'parse' ? [{ name: 'sheet', type: 'sheet' }] :
           type === 'enrich' ? [{ name: 'sheet', type: 'sheet' }] :
           [{ name: 'result', type: 'export-result' }],
  configSchema: [],
  defaultConfig: {},
  runtime: 'client',
  run,
})

describe('full workflow integration', () => {
  beforeAll(() => {
    nodeRegistry.clear()
    portTypeRegistry.clear()
    registerBuiltinPorts()
    nodeRegistry.register(stub('parse', async () => ({ sheet: { rows: [{ sku: 'A1' }, { sku: 'A2' }] } })))
    nodeRegistry.register(stub('enrich', async (_c, _cfg, inputs: any) => ({ sheet: { rows: inputs.sheet.rows.map((r: any) => ({ ...r, title: 'enriched' })) } })))
    nodeRegistry.register(stub('export', async (_c, _cfg, inputs: any) => ({ result: { url: 'blob:test', mime: 'application/x-test', filename: 'out.xlsx', count: inputs.sheet.rows.length } })))
  })

  it('parse → enrich → export', async () => {
    const wf: Workflow = {
      id: 'wf', schemaVersion: 1, name: 't', description: '', ownerId: 'u',
      createdAt: 0, updatedAt: 0,
      nodes: [
        { id: 'p', type: 'parse', position: { x: 0, y: 0 }, config: {} },
        { id: 'e', type: 'enrich', position: { x: 0, y: 0 }, config: {} },
        { id: 'x', type: 'export', position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'p', sourceHandle: 'sheet', target: 'e', targetHandle: 'sheet' },
        { id: 'e2', source: 'e', sourceHandle: 'sheet', target: 'x', targetHandle: 'sheet' },
      ],
    }
    await executeWorkflow(wf)
    const states = useRunContext.getState().nodeStates
    expect(states['p'].status).toBe('success')
    expect(states['e'].status).toBe('success')
    expect(states['x'].status).toBe('success')
    expect((states['x'].outputs as any).result.count).toBe(2)
  })
})
```

- [ ] **Step 3: Run test**

```bash
npm run test:run -- src/features/workflows/runtime/integration.test.ts
```
Expected: PASS.

- [ ] **Step 4: Run full test suite**

```bash
npm run test:run
```
Expected: full suite PASS (no regression in unrelated tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/workflows/runtime/integration.test.ts src/features/workflows/test-fixtures/
git commit -m "test(workflows): end-to-end parse→enrich→export integration test"
```

---

### Task 22: Manual UI acceptance run + final build

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Build a real workflow in the browser**

Acceptance scenarios — perform each in the browser:

1. **List + create**: navigate to `/workflows` → click "Nouveau workflow" → editor opens with empty canvas.
2. **Palette**: 8+ nodes visible in the palette grouped by category (Import / Enrichissement / Sauvegarde / Export).
3. **Drag + connect**: drag `Upload` + `Import CSV/Excel` + `Enrichissement` + `Save PIM` + `Export PPTX`. Connect them. Connections to incompatible types (e.g. `file` → `sheet`) must be rejected (no edge created).
4. **Configure**: select each node, fill its config in the right panel.
5. **Run**: click ▶ Run. Watch live status badges + logs in RunPanel. Verify each node turns green.
6. **Stop**: start a workflow, click ▣ Stop mid-run, verify in-flight node ends in error state and downstream is skipped.
7. **Persistence**: refresh the page → the workflow is restored from Firestore exactly.
8. **Delete**: from `/workflows`, delete the workflow → it disappears from the list.

- [ ] **Step 3: Final build**

```bash
npm run build
```
Expected: PASS, no type errors.

- [ ] **Step 4: Commit (only if any fix was needed during acceptance)**

If any small fix was needed:
```bash
git add -p
git commit -m "fix(workflows): <short description>"
```

---

## Self-Review Notes

- **Spec coverage** : All 13 spec sections have at least one task. Folder structure (§3) → Tasks 2-13. Data model (§4) → Task 2. Runtime (§5) → Tasks 4-6. Editor UI (§6) → Tasks 9-13. Persistence (§7) → Tasks 7-8. Catalogue MVP (§8) → Tasks 16-19 (note: 8 spec nodes + 1 helper Upload node added in Task 20). Intégration existant (§9) → Task 15 (refactor enrichment) + adapter notes in Tasks 16/18/19. Évolutivité (§10) → built-in: open registry (Task 6), portTypeRegistry (Task 3), declarative config (Task 12), middleware chain (Task 6), `schemaVersion` + `migrate()` (Task 7), `runtime` flag (Task 2). Tests (§12) → Tasks 3-7-21.
- **Integration risk** : Tasks 16, 18, 19 reference adapter functions (`parseExcelFile`, `savePimFromSheet`, `exportSheetToXlsx`, etc.) whose actual names must be matched against the codebase. The plan calls this out explicitly so the engineer doesn't invent APIs.
- **Decoupling** : nodes register themselves on import (side-effect); the only place that knows the catalog list is `registry/builtin.ts` (one import line per node file). Adding a new node = 1 file + 1 import line.
- **Phase 2 is unblocked** : middleware chain accepts user-supplied middleware; persistence is versioned; runtime flag exists; nothing in Phase 1 needs to be rewritten when adding cron / If / forEach / templating in Phase 2.
