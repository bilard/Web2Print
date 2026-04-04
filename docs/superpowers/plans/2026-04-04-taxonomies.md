# Taxonomies Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Taxonomies module — arborescences hiérarchiques stockées en Firestore avec import Markdown/CSV/XLSX, Tree View drag-and-drop, CRUD inline, recherche avec autocomplétion, et liaison avec les projets existants.

**Architecture:** React Query (useQuery + optimistic useMutation) pour les données Firestore, Zustand pour l'état UI uniquement (expand/collapse, recherche, sélection). Arbre sérialisé en map plate dans le document Firestore principal. @dnd-kit/sortable pour le drag-and-drop.

**Tech Stack:** React 18, TypeScript strict, Zustand v4, React Query v5, Firebase Firestore v10, @dnd-kit/core + @dnd-kit/sortable, xlsx, shadcn/ui, Sonner, Lucide React, Tailwind v3

---

## File Map

| Fichier | Statut | Rôle |
|---|---|---|
| `src/features/taxonomy/types.ts` | Créer | Types TypeScript partagés |
| `src/features/taxonomy/taxonomyUtils.ts` | Créer | buildTree, flattenTree, findPath, getBreadcrumb, getAllDescendantIds, getNextOrder |
| `src/features/taxonomy/parsers/sharedParser.ts` | Créer | nodesFromRows (CSV/XLSX commun) |
| `src/features/taxonomy/parsers/parseMarkdown.ts` | Créer | Parser H2 + bold bullets + indented |
| `src/features/taxonomy/parsers/parseCsv.ts` | Créer | Parser CSV via xlsx |
| `src/features/taxonomy/parsers/parseXlsx.ts` | Créer | Parser XLSX via xlsx |
| `src/stores/taxonomy.store.ts` | Créer | UI state : expand, search, selection |
| `src/features/taxonomy/useTaxonomies.ts` | Créer | useQuery → liste toutes les taxonomies |
| `src/features/taxonomy/useTaxonomyById.ts` | Créer | useQuery → une taxonomie par ID |
| `src/features/taxonomy/useTaxonomyMutations.ts` | Créer | Toutes les mutations CRUD |
| `src/components/taxonomy/TaxonomyNode.tsx` | Créer | Nœud récursif avec D&D, inline edit, actions |
| `src/components/taxonomy/TaxonomyTree.tsx` | Créer | Arbre complet d'une taxonomie |
| `src/components/taxonomy/TaxonomySidebar.tsx` | Créer | Liste multi-taxonomies (panneau gauche) |
| `src/components/taxonomy/TaxonomySearchBar.tsx` | Créer | Input + dropdown autocomplétion |
| `src/components/taxonomy/TaxonomyImportModal.tsx` | Créer | Upload + prévisualisation + confirmation |
| `src/components/taxonomy/LinkProjectsModal.tsx` | Créer | Sélecteur de projets à lier |
| `src/components/taxonomy/TaxonomyEmptyState.tsx` | Créer | État vide avec CTA import |
| `src/pages/TaxonomiesPage.tsx` | Créer | Assemblage final |
| `src/app/router.tsx` | Modifier | Ajouter route `/taxonomies` |
| `src/pages/DashboardPage.tsx` | Modifier | Ajouter entrée menu + section embarquée |
| `src/components/shared/ProjectCard.tsx` | Modifier | Ajouter prop `taxonomyLabel?: string` + badge |
| `firestore.rules` | Modifier | Ajouter règle `taxonomies` |

---

## Task 1 — Types TypeScript

**Files:**
- Create: `src/features/taxonomy/types.ts`

- [ ] **Créer le fichier de types**

```typescript
// src/features/taxonomy/types.ts
import type { Timestamp } from 'firebase/firestore'

export interface TaxonomyNode {
  id: string
  label: string
  parentId: string | null
  order: number             // position parmi les frères (0-based)
  level: number             // 0 = racine
  linkedProjectIds: string[] // IDs de projets liés (nœuds terminaux)
}

export interface Taxonomy {
  id: string
  name: string
  ownerId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  nodes: Record<string, TaxonomyNode> // map plate sérialisée
}

export interface TaxonomyNodeWithChildren extends TaxonomyNode {
  children: TaxonomyNodeWithChildren[]
  isLeaf: boolean
}
```

- [ ] **Valider les types**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print && npx tsc --noEmit
```

Attendu : aucune erreur TypeScript.

- [ ] **Commit**

```bash
git add src/features/taxonomy/types.ts
git commit -m "feat(taxonomy): add TypeScript types"
```

---

## Task 2 — Utilitaires de l'arbre

**Files:**
- Create: `src/features/taxonomy/taxonomyUtils.ts`

- [ ] **Créer le fichier d'utilitaires**

```typescript
// src/features/taxonomy/taxonomyUtils.ts
import type { TaxonomyNode, TaxonomyNodeWithChildren } from './types'

/** Construit un arbre hiérarchique depuis la map plate. */
export function buildTree(
  nodes: Record<string, TaxonomyNode>
): TaxonomyNodeWithChildren[] {
  const nodeMap = new Map<string, TaxonomyNodeWithChildren>()

  for (const node of Object.values(nodes)) {
    nodeMap.set(node.id, { ...node, children: [], isLeaf: false })
  }

  const roots: TaxonomyNodeWithChildren[] = []

  for (const node of nodeMap.values()) {
    if (node.parentId === null) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(node.parentId)
      if (parent) parent.children.push(node)
    }
  }

  function sortByOrder(arr: TaxonomyNodeWithChildren[]): void {
    arr.sort((a, b) => a.order - b.order)
    for (const n of arr) sortByOrder(n.children)
  }
  sortByOrder(roots)

  function markLeaves(arr: TaxonomyNodeWithChildren[]): void {
    for (const n of arr) {
      n.isLeaf = n.children.length === 0
      markLeaves(n.children)
    }
  }
  markLeaves(roots)

  return roots
}

/** Retourne tous les nœuds aplatis dans l'ordre level/order. */
export function flattenTree(nodes: Record<string, TaxonomyNode>): TaxonomyNode[] {
  return Object.values(nodes).sort((a, b) =>
    a.level !== b.level ? a.level - b.level : a.order - b.order
  )
}

/** Retourne le chemin [root, …, nodeId] en IDs. */
export function findPath(
  nodes: Record<string, TaxonomyNode>,
  nodeId: string
): string[] {
  const path: string[] = []
  let current: TaxonomyNode | undefined = nodes[nodeId]
  while (current) {
    path.unshift(current.id)
    current = current.parentId ? nodes[current.parentId] : undefined
  }
  return path
}

/** Retourne le breadcrumb "Racine › Parent › Nœud". */
export function getBreadcrumb(
  nodes: Record<string, TaxonomyNode>,
  nodeId: string
): string {
  return findPath(nodes, nodeId)
    .map((id) => nodes[id]?.label ?? '')
    .join(' › ')
}

/** Retourne tous les IDs descendants d'un nœud (récursif). */
export function getAllDescendantIds(
  nodes: Record<string, TaxonomyNode>,
  nodeId: string
): string[] {
  const result: string[] = []
  const children = Object.values(nodes).filter((n) => n.parentId === nodeId)
  for (const child of children) {
    result.push(child.id)
    result.push(...getAllDescendantIds(nodes, child.id))
  }
  return result
}

/** Retourne l'order suivant parmi les frères d'un parent donné. */
export function getNextOrder(
  nodes: Record<string, TaxonomyNode>,
  parentId: string | null
): number {
  const siblings = Object.values(nodes).filter((n) => n.parentId === parentId)
  return siblings.length > 0 ? Math.max(...siblings.map((n) => n.order)) + 1 : 0
}

/**
 * Vérifie si un nœud ou l'un de ses descendants correspond à la query.
 * Utilisé pour le filtre live de l'arbre.
 */
export function nodeMatchesSearch(
  node: TaxonomyNodeWithChildren,
  query: string
): boolean {
  const q = query.toLowerCase()
  if (node.label.toLowerCase().includes(q)) return true
  return node.children.some((child) => nodeMatchesSearch(child, q))
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Commit**

```bash
git add src/features/taxonomy/taxonomyUtils.ts
git commit -m "feat(taxonomy): add tree utility functions"
```

---

## Task 3 — Parsers d'import

**Files:**
- Create: `src/features/taxonomy/parsers/sharedParser.ts`
- Create: `src/features/taxonomy/parsers/parseMarkdown.ts`
- Create: `src/features/taxonomy/parsers/parseCsv.ts`
- Create: `src/features/taxonomy/parsers/parseXlsx.ts`

- [ ] **Créer sharedParser.ts** (logique commune CSV/XLSX)

```typescript
// src/features/taxonomy/parsers/sharedParser.ts
import type { TaxonomyNode } from '../types'

/**
 * Convertit des lignes avec colonnes level_1, level_2, …level_N
 * en TaxonomyNodes. Les valeurs identiques à même niveau sont dédupliquées.
 */
export function nodesFromRows(rows: Record<string, string>[]): TaxonomyNode[] {
  if (rows.length === 0) return []

  const sampleRow = rows[0]
  const levelKeys = Object.keys(sampleRow)
    .filter((k) => /^level_\d+$/i.test(k))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10)
      const nb = parseInt(b.replace(/\D/g, ''), 10)
      return na - nb
    })

  if (levelKeys.length === 0) return []

  const nodes: TaxonomyNode[] = []
  const pathToId = new Map<string, string>()

  for (const row of rows) {
    let parentId: string | null = null

    for (let i = 0; i < levelKeys.length; i++) {
      const key = levelKeys[i]
      const label = String(row[key] ?? '').trim()
      if (!label) break

      const pathKey = levelKeys
        .slice(0, i + 1)
        .map((k) => String(row[k] ?? '').trim())
        .join('|||')

      if (!pathToId.has(pathKey)) {
        const id = crypto.randomUUID()
        pathToId.set(pathKey, id)

        const siblings = nodes.filter(
          (n) => n.parentId === parentId && n.level === i
        )

        nodes.push({
          id,
          label,
          parentId,
          order: siblings.length,
          level: i,
          linkedProjectIds: [],
        })
      }

      parentId = pathToId.get(pathKey)!
    }
  }

  return nodes
}
```

- [ ] **Créer parseMarkdown.ts**

```typescript
// src/features/taxonomy/parsers/parseMarkdown.ts
import type { TaxonomyNode } from '../types'

/**
 * Parse un fichier Markdown de nomenclature :
 * - `## N. Titre` → niveau 0 (racine)
 * - `- **Gras**`  → niveau 1
 * - `  - Texte`   → niveau 2+ (indenté)
 * - `- Texte`     → niveau 1 (bullet simple, parent = H2 courant)
 */
export function parseMarkdown(content: string): TaxonomyNode[] {
  const nodes: TaxonomyNode[] = []
  const lines = content.split('\n')

  let currentLevel0: TaxonomyNode | null = null
  let currentLevel1: TaxonomyNode | null = null
  let order0 = 0
  let order1 = 0
  let order2 = 0

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue

    // H2 → niveau 0
    const h2 = line.match(/^##\s+(?:\d+\.\s+)?(.+)$/)
    if (h2) {
      const node: TaxonomyNode = {
        id: crypto.randomUUID(),
        label: h2[1].trim(),
        parentId: null,
        order: order0++,
        level: 0,
        linkedProjectIds: [],
      }
      nodes.push(node)
      currentLevel0 = node
      currentLevel1 = null
      order1 = 0
      continue
    }

    // Bold bullet → niveau 1
    const bold = line.match(/^-\s+\*\*(.+?)\*\*\s*$/)
    if (bold && currentLevel0) {
      const node: TaxonomyNode = {
        id: crypto.randomUUID(),
        label: bold[1].trim(),
        parentId: currentLevel0.id,
        order: order1++,
        level: 1,
        linkedProjectIds: [],
      }
      nodes.push(node)
      currentLevel1 = node
      order2 = 0
      continue
    }

    // Indented bullet → niveau 2 (sous level1 si présent, sinon level0)
    const indented = line.match(/^\s+-\s+(.+)$/)
    if (indented) {
      const parent = currentLevel1 ?? currentLevel0
      if (!parent) continue
      nodes.push({
        id: crypto.randomUUID(),
        label: indented[1].trim(),
        parentId: parent.id,
        order: order2++,
        level: parent.level + 1,
        linkedProjectIds: [],
      })
      continue
    }

    // Plain bullet → niveau 1 (sous level0 courant)
    const plain = line.match(/^-\s+(.+)$/)
    if (plain && currentLevel0) {
      const node: TaxonomyNode = {
        id: crypto.randomUUID(),
        label: plain[1].trim(),
        parentId: currentLevel0.id,
        order: order1++,
        level: 1,
        linkedProjectIds: [],
      }
      nodes.push(node)
      currentLevel1 = node
      order2 = 0
    }
  }

  return nodes
}
```

- [ ] **Créer parseCsv.ts**

```typescript
// src/features/taxonomy/parsers/parseCsv.ts
import * as XLSX from 'xlsx'
import type { TaxonomyNode } from '../types'
import { nodesFromRows } from './sharedParser'

export function parseCsv(content: string): TaxonomyNode[] {
  const wb = XLSX.read(content, { type: 'string' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
    defval: '',
  })
  return nodesFromRows(rows)
}
```

- [ ] **Créer parseXlsx.ts**

```typescript
// src/features/taxonomy/parsers/parseXlsx.ts
import * as XLSX from 'xlsx'
import type { TaxonomyNode } from '../types'
import { nodesFromRows } from './sharedParser'

export function parseXlsx(buffer: ArrayBuffer): TaxonomyNode[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
    defval: '',
  })
  return nodesFromRows(rows)
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Commit**

```bash
git add src/features/taxonomy/parsers/
git commit -m "feat(taxonomy): add import parsers (Markdown, CSV, XLSX)"
```

---

## Task 4 — Store Zustand (UI state)

**Files:**
- Create: `src/stores/taxonomy.store.ts`

- [ ] **Créer le store**

```typescript
// src/stores/taxonomy.store.ts
import { create } from 'zustand'

interface TaxonomyUIState {
  selectedTaxonomyId: string | null
  expandedNodeIds: Set<string>
  searchQuery: string
  highlightedNodeId: string | null

  setSelectedTaxonomy: (id: string | null) => void
  toggleNode: (id: string) => void
  expandAll: (nodeIds: string[]) => void
  collapseAll: () => void
  setSearch: (q: string) => void
  setHighlighted: (id: string | null) => void
}

export const useTaxonomyStore = create<TaxonomyUIState>((set) => ({
  selectedTaxonomyId: null,
  expandedNodeIds: new Set<string>(),
  searchQuery: '',
  highlightedNodeId: null,

  setSelectedTaxonomy: (id) => set({ selectedTaxonomyId: id }),

  toggleNode: (id) =>
    set((s) => {
      const next = new Set(s.expandedNodeIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedNodeIds: next }
    }),

  expandAll: (nodeIds) =>
    set((s) => {
      const next = new Set(s.expandedNodeIds)
      for (const id of nodeIds) next.add(id)
      return { expandedNodeIds: next }
    }),

  collapseAll: () => set({ expandedNodeIds: new Set<string>() }),

  setSearch: (q) => set({ searchQuery: q }),

  setHighlighted: (id) => set({ highlightedNodeId: id }),
}))
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/stores/taxonomy.store.ts
git commit -m "feat(taxonomy): add Zustand UI store"
```

---

## Task 5 — Hooks Firebase (lecture)

**Files:**
- Create: `src/features/taxonomy/useTaxonomies.ts`
- Create: `src/features/taxonomy/useTaxonomyById.ts`

- [ ] **Créer useTaxonomies.ts**

```typescript
// src/features/taxonomy/useTaxonomies.ts
import { useQuery } from '@tanstack/react-query'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { Taxonomy } from './types'

async function fetchTaxonomies(userId: string): Promise<Taxonomy[]> {
  const q = query(
    collection(db, 'taxonomies'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'asc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(
    (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Taxonomy)
  )
}

export function useTaxonomies() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['taxonomies', user?.uid],
    queryFn: () => fetchTaxonomies(user!.uid),
    enabled: !!user,
  })
}
```

- [ ] **Créer useTaxonomyById.ts**

```typescript
// src/features/taxonomy/useTaxonomyById.ts
import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Taxonomy } from './types'

async function fetchTaxonomyById(id: string): Promise<Taxonomy | null> {
  const snap = await getDoc(doc(db, 'taxonomies', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Taxonomy
}

export function useTaxonomyById(id: string | null) {
  return useQuery({
    queryKey: ['taxonomy', id],
    queryFn: () => fetchTaxonomyById(id!),
    enabled: !!id,
  })
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/features/taxonomy/useTaxonomies.ts src/features/taxonomy/useTaxonomyById.ts
git commit -m "feat(taxonomy): add Firestore read hooks"
```

---

## Task 6 — Mutations Firestore

**Files:**
- Create: `src/features/taxonomy/useTaxonomyMutations.ts`

- [ ] **Créer useTaxonomyMutations.ts**

```typescript
// src/features/taxonomy/useTaxonomyMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { toast } from 'sonner'
import { getAllDescendantIds, getNextOrder } from './taxonomyUtils'
import type { Taxonomy, TaxonomyNode } from './types'

// ─── Clés React Query ─────────────────────────────────────────────────────────

const taxListKey = (uid: string) => ['taxonomies', uid]
const taxKey = (id: string) => ['taxonomy', id]

// ─── Helper : récupère les taxonomies depuis le cache ─────────────────────────

function getCachedList(qc: ReturnType<typeof useQueryClient>, uid: string) {
  return qc.getQueryData<Taxonomy[]>(taxListKey(uid)) ?? []
}

// ─── createTaxonomy ───────────────────────────────────────────────────────────

export function useCreateTaxonomy() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      nodes,
    }: {
      name: string
      nodes: Record<string, TaxonomyNode>
    }) => {
      const id = crypto.randomUUID()
      const now = Timestamp.now()
      const taxonomy: Taxonomy = {
        id,
        name,
        ownerId: user!.uid,
        createdAt: now,
        updatedAt: now,
        nodes,
      }
      await setDoc(doc(db, 'taxonomies', id), taxonomy)
      return taxonomy
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
    onError: () => toast.error('Erreur lors de la création'),
  })
}

// ─── renameTaxonomy ───────────────────────────────────────────────────────────

export function useRenameTaxonomy() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await updateDoc(doc(db, 'taxonomies', id), {
        name,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: taxListKey(user!.uid) })
      const previous = getCachedList(qc, user!.uid)
      qc.setQueryData<Taxonomy[]>(taxListKey(user!.uid), (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, name } : t))
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(taxListKey(user!.uid), ctx?.previous)
      toast.error('Erreur lors du renommage')
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
  })
}

// ─── deleteTaxonomy ───────────────────────────────────────────────────────────

export function useDeleteTaxonomy() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'taxonomies', id))
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taxListKey(user!.uid) })
      const previous = getCachedList(qc, user!.uid)
      qc.setQueryData<Taxonomy[]>(taxListKey(user!.uid), (old) =>
        (old ?? []).filter((t) => t.id !== id)
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(taxListKey(user!.uid), ctx?.previous)
      toast.error('Erreur lors de la suppression')
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
  })
}

// ─── duplicateTaxonomy ────────────────────────────────────────────────────────

export function useDuplicateTaxonomy() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const source = getCachedList(qc, user!.uid).find((t) => t.id === id)
      if (!source) throw new Error('Taxonomie introuvable')

      // Remap les IDs pour éviter les collisions
      const idMap = new Map<string, string>()
      for (const nodeId of Object.keys(source.nodes)) {
        idMap.set(nodeId, crypto.randomUUID())
      }

      const newNodes: Record<string, TaxonomyNode> = {}
      for (const [oldId, node] of Object.entries(source.nodes)) {
        const newId = idMap.get(oldId)!
        newNodes[newId] = {
          ...node,
          id: newId,
          parentId: node.parentId ? (idMap.get(node.parentId) ?? null) : null,
          linkedProjectIds: [],
        }
      }

      const newId = crypto.randomUUID()
      const now = Timestamp.now()
      const newTaxonomy: Taxonomy = {
        id: newId,
        name: `${source.name} (copie)`,
        ownerId: user!.uid,
        createdAt: now,
        updatedAt: now,
        nodes: newNodes,
      }
      await setDoc(doc(db, 'taxonomies', newId), newTaxonomy)
      return newTaxonomy
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
    onError: () => toast.error('Erreur lors de la duplication'),
  })
}

// ─── Helper : met à jour les nodes d'une taxonomie avec optimistic update ─────

function useUpdateNodes() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return async (
    taxonomyId: string,
    updater: (nodes: Record<string, TaxonomyNode>) => Record<string, TaxonomyNode>
  ): Promise<{ previous: Taxonomy[] }> => {
    await qc.cancelQueries({ queryKey: taxListKey(user!.uid) })
    const previous = getCachedList(qc, user!.uid)

    qc.setQueryData<Taxonomy[]>(taxListKey(user!.uid), (old) =>
      (old ?? []).map((t) =>
        t.id === taxonomyId ? { ...t, nodes: updater(t.nodes) } : t
      )
    )
    return { previous }
  }
}

// ─── addNode ──────────────────────────────────────────────────────────────────

export function useAddNode() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const applyOptimistic = useUpdateNodes()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      parentId,
      label,
    }: {
      taxonomyId: string
      parentId: string | null
      label: string
    }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')

      const parentNode = parentId ? taxonomy.nodes[parentId] : null
      const id = crypto.randomUUID()
      const node: TaxonomyNode = {
        id,
        label,
        parentId,
        order: getNextOrder(taxonomy.nodes, parentId),
        level: parentNode ? parentNode.level + 1 : 0,
        linkedProjectIds: [],
      }
      const updatedNodes = { ...taxonomy.nodes, [id]: node }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
      return node
    },
    onMutate: async ({ taxonomyId, parentId, label }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) return
      const parentNode = parentId ? taxonomy.nodes[parentId] : null
      const tempId = crypto.randomUUID()
      const tempNode: TaxonomyNode = {
        id: tempId,
        label,
        parentId,
        order: getNextOrder(taxonomy.nodes, parentId),
        level: parentNode ? parentNode.level + 1 : 0,
        linkedProjectIds: [],
      }
      return applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [tempId]: tempNode,
      }))
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error("Erreur lors de l'ajout du nœud")
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── renameNode ───────────────────────────────────────────────────────────────

export function useRenameNode() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const applyOptimistic = useUpdateNodes()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
      label,
    }: {
      taxonomyId: string
      nodeId: string
      label: string
    }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')
      const updatedNodes = {
        ...taxonomy.nodes,
        [nodeId]: { ...taxonomy.nodes[nodeId], label },
      }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId, label }) =>
      applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [nodeId]: { ...nodes[nodeId], label },
      })),
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors du renommage du nœud')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── deleteNode ───────────────────────────────────────────────────────────────

export function useDeleteNode() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const applyOptimistic = useUpdateNodes()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
    }: {
      taxonomyId: string
      nodeId: string
    }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')
      const toDelete = new Set([
        nodeId,
        ...getAllDescendantIds(taxonomy.nodes, nodeId),
      ])
      const updatedNodes: Record<string, TaxonomyNode> = {}
      for (const [id, node] of Object.entries(taxonomy.nodes)) {
        if (!toDelete.has(id)) updatedNodes[id] = node
      }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) return
      const toDelete = new Set([
        nodeId,
        ...getAllDescendantIds(taxonomy.nodes, nodeId),
      ])
      return applyOptimistic(taxonomyId, (nodes) => {
        const next: Record<string, TaxonomyNode> = {}
        for (const [id, node] of Object.entries(nodes)) {
          if (!toDelete.has(id)) next[id] = node
        }
        return next
      })
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors de la suppression du nœud')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── moveNode (D&D) ───────────────────────────────────────────────────────────

export function useMoveNode() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const applyOptimistic = useUpdateNodes()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
      newParentId,
      newOrder,
    }: {
      taxonomyId: string
      nodeId: string
      newParentId: string | null
      newOrder: number
    }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')

      // Recalcule les orders parmi les frères du nouveau parent
      const siblings = Object.values(taxonomy.nodes)
        .filter((n) => n.parentId === newParentId && n.id !== nodeId)
        .sort((a, b) => a.order - b.order)

      const updatedNodes = { ...taxonomy.nodes }

      // Réinsère le nœud déplacé à newOrder
      siblings.splice(newOrder, 0, taxonomy.nodes[nodeId])
      siblings.forEach((n, i) => {
        updatedNodes[n.id] = { ...updatedNodes[n.id], order: i }
      })
      updatedNodes[nodeId] = {
        ...updatedNodes[nodeId],
        parentId: newParentId,
        order: newOrder,
        level: newParentId
          ? (updatedNodes[newParentId]?.level ?? 0) + 1
          : 0,
      }

      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId, newParentId, newOrder }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) return
      return applyOptimistic(taxonomyId, (nodes) => {
        const siblings = Object.values(nodes)
          .filter((n) => n.parentId === newParentId && n.id !== nodeId)
          .sort((a, b) => a.order - b.order)
        const updated = { ...nodes }
        siblings.splice(newOrder, 0, nodes[nodeId])
        siblings.forEach((n, i) => {
          updated[n.id] = { ...updated[n.id], order: i }
        })
        updated[nodeId] = {
          ...updated[nodeId],
          parentId: newParentId,
          order: newOrder,
          level: newParentId ? (updated[newParentId]?.level ?? 0) + 1 : 0,
        }
        return updated
      })
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors du déplacement du nœud')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── linkProject / unlinkProject ─────────────────────────────────────────────

export function useLinkProject() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const applyOptimistic = useUpdateNodes()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
      projectId,
    }: {
      taxonomyId: string
      nodeId: string
      projectId: string
    }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')
      const node = taxonomy.nodes[nodeId]
      if (!node) throw new Error('Nœud introuvable')
      const linkedProjectIds = [...new Set([...node.linkedProjectIds, projectId])]
      const updatedNodes = {
        ...taxonomy.nodes,
        [nodeId]: { ...node, linkedProjectIds },
      }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId, projectId }) =>
      applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [nodeId]: {
          ...nodes[nodeId],
          linkedProjectIds: [
            ...new Set([...nodes[nodeId].linkedProjectIds, projectId]),
          ],
        },
      })),
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors de la liaison')
    },
    onSettled: (_d, _e, vars) =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
  })
}

export function useUnlinkProject() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const applyOptimistic = useUpdateNodes()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
      projectId,
    }: {
      taxonomyId: string
      nodeId: string
      projectId: string
    }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')
      const node = taxonomy.nodes[nodeId]
      if (!node) throw new Error('Nœud introuvable')
      const linkedProjectIds = node.linkedProjectIds.filter(
        (id) => id !== projectId
      )
      const updatedNodes = {
        ...taxonomy.nodes,
        [nodeId]: { ...node, linkedProjectIds },
      }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId, projectId }) =>
      applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [nodeId]: {
          ...nodes[nodeId],
          linkedProjectIds: nodes[nodeId].linkedProjectIds.filter(
            (id) => id !== projectId
          ),
        },
      })),
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors de la déliaison')
    },
    onSettled: (_d, _e, vars) =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
  })
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur TypeScript.

- [ ] **Commit**

```bash
git add src/features/taxonomy/useTaxonomyMutations.ts
git commit -m "feat(taxonomy): add Firestore mutations with optimistic updates"
```

---

## Task 7 — Composant TaxonomyNode

**Files:**
- Create: `src/components/taxonomy/TaxonomyNode.tsx`

- [ ] **Créer TaxonomyNode.tsx**

```typescript
// src/components/taxonomy/TaxonomyNode.tsx
import { useState, useRef, useEffect } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Link,
  GripVertical,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useRenameNode, useDeleteNode, useAddNode } from '@/features/taxonomy/useTaxonomyMutations'
import type { TaxonomyNodeWithChildren } from '@/features/taxonomy/types'

interface TaxonomyNodeProps {
  node: TaxonomyNodeWithChildren
  taxonomyId: string
  onLinkProjects: (nodeId: string) => void
  searchQuery: string
}

export function TaxonomyNode({
  node,
  taxonomyId,
  onLinkProjects,
  searchQuery,
}: TaxonomyNodeProps) {
  const { expandedNodeIds, highlightedNodeId, toggleNode } = useTaxonomyStore()
  const isExpanded = expandedNodeIds.has(node.id)
  const isHighlighted = highlightedNodeId === node.id
  const [isEditing, setIsEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(node.label)
  const [showActions, setShowActions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const renameNode = useRenameNode()
  const deleteNode = useDeleteNode()
  const addNode = useAddNode()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const handleRename = () => {
    const trimmed = editLabel.trim()
    if (trimmed && trimmed !== node.label) {
      renameNode.mutate({ taxonomyId, nodeId: node.id, label: trimmed })
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename()
    if (e.key === 'Escape') {
      setEditLabel(node.label)
      setIsEditing(false)
    }
  }

  const handleAddChild = () => {
    addNode.mutate({
      taxonomyId,
      parentId: node.id,
      label: 'Nouveau nœud',
    })
    if (!isExpanded) toggleNode(node.id)
  }

  // Mise en surbrillance de la query dans le label
  const highlightLabel = (label: string) => {
    if (!searchQuery) return <span>{label}</span>
    const idx = label.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx === -1) return <span>{label}</span>
    return (
      <span>
        {label.slice(0, idx)}
        <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">
          {label.slice(idx, idx + searchQuery.length)}
        </mark>
        {label.slice(idx + searchQuery.length)}
      </span>
    )
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`group flex items-center gap-1 px-2 py-[3px] rounded-md cursor-pointer select-none
          ${isHighlighted ? 'bg-indigo-500/20 ring-1 ring-indigo-500/40' : 'hover:bg-white/[0.04]'}
        `}
        style={{ paddingLeft: `${node.level * 16 + 8}px` }}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 flex-shrink-0"
          aria-label={`Déplacer ${node.label}`}
        >
          <GripVertical className="w-3 h-3" />
        </button>

        {/* Expand/collapse toggle */}
        <button
          onClick={() => !node.isLeaf && toggleNode(node.id)}
          className="flex-shrink-0 text-white/30 hover:text-white/60 w-4 h-4 flex items-center justify-center"
          aria-label={isExpanded ? `Réduire ${node.label}` : `Développer ${node.label}`}
        >
          {!node.isLeaf ? (
            isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-white/20 block" />
          )}
        </button>

        {/* Label */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-white/10 rounded px-1.5 py-0.5 text-[12px] text-white outline-none ring-1 ring-indigo-500"
          />
        ) : (
          <span
            className="flex-1 text-[12px] text-white/70 truncate"
            onDoubleClick={() => { setIsEditing(true); setEditLabel(node.label) }}
          >
            {highlightLabel(node.label)}
          </span>
        )}

        {/* Linked projects badge */}
        {node.linkedProjectIds.length > 0 && (
          <span className="text-[10px] text-teal-400/70 bg-teal-500/10 px-1.5 rounded-full flex-shrink-0">
            {node.linkedProjectIds.length}
          </span>
        )}

        {/* Actions */}
        {(showActions || isEditing) && !isEditing && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={handleAddChild}
              className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
              aria-label={`Ajouter un enfant à ${node.label}`}
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setIsEditing(true); setEditLabel(node.label) }}
              className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
              aria-label={`Renommer ${node.label}`}
            >
              <Pencil className="w-3 h-3" />
            </button>
            {node.isLeaf && (
              <button
                onClick={() => onLinkProjects(node.id)}
                className="p-0.5 rounded text-white/30 hover:text-teal-400 hover:bg-teal-500/10 transition-colors"
                aria-label={`Lier des projets à ${node.label}`}
              >
                <Link className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => deleteNode.mutate({ taxonomyId, nodeId: node.id })}
              className="p-0.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label={`Supprimer ${node.label}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {!node.isLeaf && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TaxonomyNode
              key={child.id}
              node={child}
              taxonomyId={taxonomyId}
              onLinkProjects={onLinkProjects}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/components/taxonomy/TaxonomyNode.tsx
git commit -m "feat(taxonomy): add TaxonomyNode recursive component"
```

---

## Task 8 — Composant TaxonomyTree

**Files:**
- Create: `src/components/taxonomy/TaxonomyTree.tsx`

- [ ] **Créer TaxonomyTree.tsx**

```typescript
// src/components/taxonomy/TaxonomyTree.tsx
import { useEffect, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useMoveNode } from '@/features/taxonomy/useTaxonomyMutations'
import { buildTree, nodeMatchesSearch } from '@/features/taxonomy/taxonomyUtils'
import { TaxonomyNode } from './TaxonomyNode'
import type { Taxonomy, TaxonomyNodeWithChildren } from '@/features/taxonomy/types'

interface TaxonomyTreeProps {
  taxonomy: Taxonomy
  onLinkProjects: (nodeId: string) => void
}

export function TaxonomyTree({ taxonomy, onLinkProjects }: TaxonomyTreeProps) {
  const { expandedNodeIds, searchQuery, expandAll } = useTaxonomyStore()
  const moveNode = useMoveNode()
  const initialized = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Initialise l'état expand : niveau 0 toujours ouvert
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const level0Ids = Object.values(taxonomy.nodes)
      .filter((n) => n.level === 0)
      .map((n) => n.id)
    expandAll(level0Ids)
  }, [taxonomy.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const tree = buildTree(taxonomy.nodes)

  // Filtrage search : ne garde que les branches qui contiennent un match
  const filteredTree = searchQuery
    ? tree.filter((n) => nodeMatchesSearch(n, searchQuery))
    : tree

  const flatIds = filteredTree.map((n) => n.id)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = String(active.id)
    const overId = String(over.id)
    const draggedNode = taxonomy.nodes[draggedId]
    const overNode = taxonomy.nodes[overId]
    if (!draggedNode || !overNode) return

    // Si même parent → réordonnement
    const newParentId = overNode.parentId
    const siblings = Object.values(taxonomy.nodes)
      .filter((n) => n.parentId === newParentId && n.id !== draggedId)
      .sort((a, b) => a.order - b.order)
    const overIndex = siblings.findIndex((n) => n.id === overId)
    const newOrder = overIndex === -1 ? siblings.length : overIndex

    moveNode.mutate({
      taxonomyId: taxonomy.id,
      nodeId: draggedId,
      newParentId,
      newOrder,
    })
  }

  function renderNodes(nodes: TaxonomyNodeWithChildren[]) {
    return nodes.map((node) => (
      <TaxonomyNode
        key={node.id}
        node={node}
        taxonomyId={taxonomy.id}
        onLinkProjects={onLinkProjects}
        searchQuery={searchQuery}
      />
    ))
  }

  if (Object.keys(taxonomy.nodes).length === 0) {
    return (
      <p className="text-[12px] text-white/30 px-4 py-3">
        Aucun nœud. Utilisez + pour en ajouter.
      </p>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
        <div className="py-1">{renderNodes(filteredTree)}</div>
      </SortableContext>
    </DndContext>
  )
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/components/taxonomy/TaxonomyTree.tsx
git commit -m "feat(taxonomy): add TaxonomyTree with DnD support"
```

---

## Task 9 — Composant TaxonomySidebar

**Files:**
- Create: `src/components/taxonomy/TaxonomySidebar.tsx`

- [ ] **Créer TaxonomySidebar.tsx**

```typescript
// src/components/taxonomy/TaxonomySidebar.tsx
import { useState } from 'react'
import { Plus, MoreVertical, Pencil, Copy, Trash2 } from 'lucide-react'
import {
  useRenameTaxonomy,
  useDeleteTaxonomy,
  useDuplicateTaxonomy,
} from '@/features/taxonomy/useTaxonomyMutations'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import type { Taxonomy } from '@/features/taxonomy/types'

interface TaxonomySidebarProps {
  taxonomies: Taxonomy[]
  onImport: () => void
}

export function TaxonomySidebar({
  taxonomies,
  onImport,
}: TaxonomySidebarProps) {
  const { selectedTaxonomyId, setSelectedTaxonomy } = useTaxonomyStore()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const rename = useRenameTaxonomy()
  const deleteTax = useDeleteTaxonomy()
  const duplicate = useDuplicateTaxonomy()

  const handleRename = (id: string) => {
    const trimmed = editName.trim()
    if (trimmed) rename.mutate({ id, name: trimmed })
    setEditingId(null)
  }

  const formatDate = (ts: { toDate: () => Date }) =>
    ts.toDate().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    })

  const nodeCount = (tax: Taxonomy) => Object.keys(tax.nodes).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
          Taxonomies
        </h2>
        <button
          onClick={onImport}
          className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
          aria-label="Importer une taxonomie"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {taxonomies.length === 0 ? (
          <p className="text-[11px] text-white/25 text-center py-6">
            Aucune taxonomie
          </p>
        ) : (
          taxonomies.map((tax) => (
            <div
              key={tax.id}
              className={`relative group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                selectedTaxonomyId === tax.id
                  ? 'bg-teal-500/[0.1] text-teal-300'
                  : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70'
              }`}
              onClick={() => setSelectedTaxonomy(tax.id)}
            >
              <div className="flex-1 min-w-0">
                {editingId === tax.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => handleRename(tax.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(tax.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="w-full bg-white/10 rounded px-1.5 py-0.5 text-[12px] text-white outline-none ring-1 ring-indigo-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <p className="text-[12px] font-medium truncate">
                      {tax.name}
                    </p>
                    <p className="text-[10px] text-white/25">
                      {nodeCount(tax)} nœuds · {formatDate(tax.updatedAt)}
                    </p>
                  </>
                )}
              </div>

              {/* Menu */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenu(openMenu === tax.id ? null : tax.id)
                }}
                className="p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/[0.08] transition-colors opacity-0 group-hover:opacity-100"
                aria-label={`Options pour ${tax.name}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {openMenu === tax.id && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setOpenMenu(null)}
                  />
                  <div className="absolute right-2 top-8 z-50 w-36 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditName(tax.name)
                        setEditingId(tax.id)
                        setOpenMenu(null)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Renommer
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        duplicate.mutate({ id: tax.id })
                        setOpenMenu(null)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Dupliquer
                    </button>
                    <div className="h-px bg-white/[0.06] mx-2" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteTax.mutate(tax.id)
                        if (selectedTaxonomyId === tax.id)
                          setSelectedTaxonomy(null)
                        setOpenMenu(null)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/components/taxonomy/TaxonomySidebar.tsx
git commit -m "feat(taxonomy): add TaxonomySidebar with CRUD actions"
```

---

## Task 10 — Composant TaxonomySearchBar

**Files:**
- Create: `src/components/taxonomy/TaxonomySearchBar.tsx`

- [ ] **Créer TaxonomySearchBar.tsx**

```typescript
// src/components/taxonomy/TaxonomySearchBar.tsx
import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { getBreadcrumb, findPath } from '@/features/taxonomy/taxonomyUtils'
import type { Taxonomy } from '@/features/taxonomy/types'

interface TaxonomySearchBarProps {
  taxonomy: Taxonomy | null
}

interface SearchResult {
  nodeId: string
  label: string
  breadcrumb: string
}

export function TaxonomySearchBar({ taxonomy }: TaxonomySearchBarProps) {
  const { searchQuery, setSearch, expandAll, setHighlighted } =
    useTaxonomyStore()
  const [results, setResults] = useState<SearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!taxonomy || searchQuery.length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }
    const q = searchQuery.toLowerCase()
    const matched: SearchResult[] = Object.values(taxonomy.nodes)
      .filter((n) => n.label.toLowerCase().includes(q))
      .slice(0, 12)
      .map((n) => ({
        nodeId: n.id,
        label: n.label,
        breadcrumb: getBreadcrumb(taxonomy.nodes, n.id),
      }))
    setResults(matched)
    setShowDropdown(matched.length > 0)
  }, [searchQuery, taxonomy])

  const handleSelect = (nodeId: string) => {
    if (!taxonomy) return
    const path = findPath(taxonomy.nodes, nodeId)
    expandAll(path)
    setHighlighted(nodeId)
    setShowDropdown(false)
    // Scroll to node after render
    setTimeout(() => {
      document.getElementById(`taxonomy-node-${nodeId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 100)
  }

  const handleClear = () => {
    setSearch('')
    setHighlighted(null)
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 focus-within:border-indigo-500/50 transition-colors">
        <Search className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Rechercher un nœud…"
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          className="flex-1 bg-transparent text-[12px] text-white/70 placeholder:text-white/25 outline-none"
        />
        {searchQuery && (
          <button
            onClick={handleClear}
            className="text-white/25 hover:text-white/60 transition-colors"
            aria-label="Effacer la recherche"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 z-20 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto"
          >
            {results.map((r) => (
              <button
                key={r.nodeId}
                onClick={() => handleSelect(r.nodeId)}
                className="w-full flex flex-col items-start px-3 py-2 hover:bg-white/[0.06] transition-colors text-left"
              >
                <span className="text-[12px] text-white/80">{r.label}</span>
                <span className="text-[10px] text-white/30 truncate w-full">
                  {r.breadcrumb}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/components/taxonomy/TaxonomySearchBar.tsx
git commit -m "feat(taxonomy): add search bar with autocomplete"
```

---

## Task 11 — Composant TaxonomyImportModal

**Files:**
- Create: `src/components/taxonomy/TaxonomyImportModal.tsx`

- [ ] **Créer TaxonomyImportModal.tsx**

```typescript
// src/components/taxonomy/TaxonomyImportModal.tsx
import { useState, useCallback } from 'react'
import { Upload, FileText, X, Check } from 'lucide-react'
import { useCreateTaxonomy } from '@/features/taxonomy/useTaxonomyMutations'
import { parseMarkdown } from '@/features/taxonomy/parsers/parseMarkdown'
import { parseCsv } from '@/features/taxonomy/parsers/parseCsv'
import { parseXlsx } from '@/features/taxonomy/parsers/parseXlsx'
import { buildTree } from '@/features/taxonomy/taxonomyUtils'
import { TaxonomyNode as TaxonomyNodeComponent } from './TaxonomyNode'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import type { TaxonomyNode } from '@/features/taxonomy/types'

interface TaxonomyImportModalProps {
  open: boolean
  onClose: () => void
}

type Step = 'upload' | 'preview'

export function TaxonomyImportModal({
  open,
  onClose,
}: TaxonomyImportModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [parsedNodes, setParsedNodes] = useState<TaxonomyNode[]>([])
  const [taxName, setTaxName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createTaxonomy = useCreateTaxonomy()
  const { setSelectedTaxonomy } = useTaxonomyStore()

  const processFile = useCallback(async (file: File) => {
    setError(null)
    try {
      let nodes: TaxonomyNode[] = []
      const name = file.name.replace(/\.[^.]+$/, '')

      if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        const text = await file.text()
        nodes = parseMarkdown(text)
      } else if (file.name.endsWith('.csv')) {
        const text = await file.text()
        nodes = parseCsv(text)
      } else if (
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls')
      ) {
        const buffer = await file.arrayBuffer()
        nodes = parseXlsx(buffer)
      } else {
        setError('Format non supporté. Utilisez .md, .csv ou .xlsx')
        return
      }

      if (nodes.length === 0) {
        setError('Aucun nœud détecté dans ce fichier.')
        return
      }

      setFileName(file.name)
      setTaxName(name)
      setParsedNodes(nodes)
      setStep('preview')
    } catch {
      setError('Erreur lors du parsing du fichier.')
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleConfirm = async () => {
    if (!taxName.trim() || parsedNodes.length === 0) return
    const nodesMap: Record<string, TaxonomyNode> = {}
    for (const node of parsedNodes) nodesMap[node.id] = node

    const result = await createTaxonomy.mutateAsync({
      name: taxName.trim(),
      nodes: nodesMap,
    })
    setSelectedTaxonomy(result.id)
    handleClose()
  }

  const handleClose = () => {
    setStep('upload')
    setFileName('')
    setParsedNodes([])
    setTaxName('')
    setError(null)
    onClose()
  }

  if (!open) return null

  // Preview nodes as tree (read-only)
  const previewNodesMap: Record<string, TaxonomyNode> = {}
  for (const n of parsedNodes) previewNodesMap[n.id] = n
  const previewTree = buildTree(previewNodesMap)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-[14px] font-semibold text-white/90">
            {step === 'upload'
              ? 'Importer une taxonomie'
              : `Prévisualisation — ${parsedNodes.length} nœuds`}
          </h2>
          <button
            onClick={handleClose}
            className="text-white/30 hover:text-white/70 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 'upload' ? (
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={() => setIsDragOver(false)}
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 transition-colors ${
                  isDragOver
                    ? 'border-teal-500/60 bg-teal-500/5'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <Upload className="w-10 h-10 text-white/20" />
                <div className="text-center">
                  <p className="text-[13px] text-white/60 mb-1">
                    Glissez votre fichier ici
                  </p>
                  <p className="text-[11px] text-white/30">
                    Formats : .md, .csv, .xlsx
                  </p>
                </div>
                <label className="cursor-pointer bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white/60 text-[12px] px-4 py-2 rounded-lg transition-colors">
                  Parcourir
                  <input
                    type="file"
                    accept=".md,.csv,.xlsx,.xls,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              {error && (
                <p className="mt-3 text-[12px] text-red-400">{error}</p>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-4 h-4 text-white/40 flex-shrink-0" />
                <span className="text-[11px] text-white/40 truncate">
                  {fileName}
                </span>
              </div>
              <div className="mb-4">
                <label className="text-[11px] text-white/50 block mb-1.5">
                  Nom de la taxonomie
                </label>
                <input
                  value={taxName}
                  onChange={(e) => setTaxName(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/80 outline-none focus:border-indigo-500/50"
                />
              </div>
              <div className="bg-[#141414] rounded-lg border border-white/[0.06] max-h-64 overflow-y-auto py-1">
                {previewTree.map((node) => (
                  <TaxonomyNodeComponent
                    key={node.id}
                    node={node}
                    taxonomyId=""
                    onLinkProjects={() => {}}
                    searchQuery=""
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <button
              onClick={() => setStep('upload')}
              className="text-[12px] text-white/40 hover:text-white/70 transition-colors"
            >
              ← Changer de fichier
            </button>
            <button
              onClick={handleConfirm}
              disabled={createTaxonomy.isPending || !taxName.trim()}
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-[12px] font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Importer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/components/taxonomy/TaxonomyImportModal.tsx
git commit -m "feat(taxonomy): add import modal with file parsing and preview"
```

---

## Task 12 — Composant LinkProjectsModal

**Files:**
- Create: `src/components/taxonomy/LinkProjectsModal.tsx`

- [ ] **Créer LinkProjectsModal.tsx**

```typescript
// src/components/taxonomy/LinkProjectsModal.tsx
import { useState } from 'react'
import { X, FileImage, Search, Link } from 'lucide-react'
import { useProjects } from '@/features/projects/useProjects'
import {
  useLinkProject,
  useUnlinkProject,
} from '@/features/taxonomy/useTaxonomyMutations'
import type { Taxonomy } from '@/features/taxonomy/types'

interface LinkProjectsModalProps {
  open: boolean
  taxonomyId: string
  nodeId: string | null
  taxonomy: Taxonomy | null
  onClose: () => void
}

export function LinkProjectsModal({
  open,
  taxonomyId,
  nodeId,
  taxonomy,
  onClose,
}: LinkProjectsModalProps) {
  const [search, setSearch] = useState('')
  const { data: projects } = useProjects()
  const link = useLinkProject()
  const unlink = useUnlinkProject()

  if (!open || !nodeId || !taxonomy) return null

  const node = taxonomy.nodes[nodeId]
  if (!node) return null

  const filtered = (projects ?? []).filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  const isLinked = (projectId: string) =>
    node.linkedProjectIds.includes(projectId)

  const handleToggle = (projectId: string) => {
    if (isLinked(projectId)) {
      unlink.mutate({ taxonomyId, nodeId, projectId })
    } else {
      link.mutate({ taxonomyId, nodeId, projectId })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-labelledby="link-modal-title"
        aria-modal="true"
        className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-[440px] max-h-[70vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2
              id="link-modal-title"
              className="text-[14px] font-semibold text-white/90 flex items-center gap-2"
            >
              <Link className="w-4 h-4 text-teal-400" />
              Lier des projets
            </h2>
            <p className="text-[11px] text-white/35 mt-0.5 truncate max-w-[320px]">
              {node.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-white/25" />
            <input
              type="text"
              placeholder="Rechercher un projet…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-white/70 placeholder:text-white/25 outline-none"
            />
          </div>
        </div>

        {/* Projects list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {filtered.length === 0 ? (
            <p className="text-[12px] text-white/30 text-center py-6">
              Aucun projet trouvé
            </p>
          ) : (
            filtered.map((project) => {
              const linked = isLinked(project.id)
              return (
                <label
                  key={project.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    linked
                      ? 'bg-teal-500/10 hover:bg-teal-500/15'
                      : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={linked}
                    onChange={() => handleToggle(project.id)}
                    className="w-3.5 h-3.5 rounded accent-teal-500"
                  />
                  <div className="w-8 h-8 bg-[#111] rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {project.thumbnail ? (
                      <img
                        src={project.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FileImage className="w-4 h-4 text-white/15" />
                    )}
                  </div>
                  <span className="text-[12px] text-white/70 truncate">
                    {project.title}
                  </span>
                </label>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-between items-center">
          <span className="text-[11px] text-white/30">
            {node.linkedProjectIds.length} projet
            {node.linkedProjectIds.length !== 1 ? 's' : ''} lié
            {node.linkedProjectIds.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={onClose}
            className="text-[12px] font-medium text-white/60 hover:text-white/90 bg-white/[0.06] hover:bg-white/10 px-4 py-2 rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/components/taxonomy/LinkProjectsModal.tsx
git commit -m "feat(taxonomy): add LinkProjectsModal"
```

---

## Task 13 — TaxonomyEmptyState

**Files:**
- Create: `src/components/taxonomy/TaxonomyEmptyState.tsx`

- [ ] **Créer TaxonomyEmptyState.tsx**

```typescript
// src/components/taxonomy/TaxonomyEmptyState.tsx
import { FolderTree, Upload } from 'lucide-react'

interface TaxonomyEmptyStateProps {
  onImport: () => void
}

export function TaxonomyEmptyState({ onImport }: TaxonomyEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 max-w-xs text-center">
        <div className="w-16 h-16 bg-white/[0.04] rounded-2xl flex items-center justify-center">
          <FolderTree className="w-8 h-8 text-white/15" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-white/60 mb-1.5">
            Aucune taxonomie
          </h3>
          <p className="text-[12px] text-white/35 leading-relaxed">
            Importez un fichier Markdown, CSV ou Excel pour créer votre
            première arborescence.
          </p>
        </div>
        <button
          onClick={onImport}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-[13px] font-medium px-5 py-2.5 rounded-xl transition-colors"
        >
          <Upload className="w-4 h-4" />
          Importer une taxonomie
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/components/taxonomy/TaxonomyEmptyState.tsx
git commit -m "feat(taxonomy): add TaxonomyEmptyState"
```

---

## Task 14 — Page TaxonomiesPage

**Files:**
- Create: `src/pages/TaxonomiesPage.tsx`

- [ ] **Créer TaxonomiesPage.tsx**

```typescript
// src/pages/TaxonomiesPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useAddNode } from '@/features/taxonomy/useTaxonomyMutations'
import { TaxonomySidebar } from '@/components/taxonomy/TaxonomySidebar'
import { TaxonomyTree } from '@/components/taxonomy/TaxonomyTree'
import { TaxonomySearchBar } from '@/components/taxonomy/TaxonomySearchBar'
import { TaxonomyImportModal } from '@/components/taxonomy/TaxonomyImportModal'
import { LinkProjectsModal } from '@/components/taxonomy/LinkProjectsModal'
import { TaxonomyEmptyState } from '@/components/taxonomy/TaxonomyEmptyState'
import { Loader2 } from 'lucide-react'

interface TaxonomiesPageProps {
  embedded?: boolean
}

export default function TaxonomiesPage({ embedded = false }: TaxonomiesPageProps) {
  const navigate = useNavigate()
  const { data: taxonomies, isLoading } = useTaxonomies()
  const { selectedTaxonomyId } = useTaxonomyStore()
  const addNode = useAddNode()

  const [importOpen, setImportOpen] = useState(false)
  const [linkNodeId, setLinkNodeId] = useState<string | null>(null)

  const selectedTaxonomy =
    taxonomies?.find((t) => t.id === selectedTaxonomyId) ?? null

  const handleAddRootNode = () => {
    if (!selectedTaxonomyId) return
    addNode.mutate({
      taxonomyId: selectedTaxonomyId,
      parentId: null,
      label: 'Nouveau nœud',
    })
  }

  return (
    <div
      className={`${embedded ? 'h-full' : 'h-screen'} bg-[#0f0f0f] text-white flex flex-col overflow-hidden`}
    >
      {/* Header */}
      {!embedded && (
        <header className="h-11 bg-[#161616] border-b border-white/[0.06] flex items-center px-3 gap-2 shrink-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-md transition-colors"
            aria-label="Retour au tableau de bord"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-[13px] font-semibold text-white/70">
            Taxonomies
          </h1>
        </header>
      )}

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — taxonomy list */}
        <aside className="w-52 bg-[#141414] border-r border-white/[0.06] flex flex-col shrink-0 overflow-hidden">
          <TaxonomySidebar
            taxonomies={taxonomies ?? []}
            onImport={() => setImportOpen(true)}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
            </div>
          ) : !taxonomies || taxonomies.length === 0 ? (
            <TaxonomyEmptyState onImport={() => setImportOpen(true)} />
          ) : !selectedTaxonomy ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px] text-white/30">
                Sélectionnez une taxonomie dans la liste
              </p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="h-11 bg-[#161616] border-b border-white/[0.06] flex items-center px-4 gap-3 shrink-0">
                <div className="flex-1 max-w-sm">
                  <TaxonomySearchBar taxonomy={selectedTaxonomy} />
                </div>
                <button
                  onClick={handleAddRootNode}
                  className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] px-3 py-1.5 rounded-md transition-colors"
                  aria-label="Ajouter un nœud racine"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nœud racine
                </button>
              </div>

              {/* Tree */}
              <div className="flex-1 overflow-y-auto">
                <TaxonomyTree
                  taxonomy={selectedTaxonomy}
                  onLinkProjects={(nodeId) => setLinkNodeId(nodeId)}
                />
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <TaxonomyImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
      <LinkProjectsModal
        open={!!linkNodeId}
        taxonomyId={selectedTaxonomyId ?? ''}
        nodeId={linkNodeId}
        taxonomy={selectedTaxonomy}
        onClose={() => setLinkNodeId(null)}
      />
    </div>
  )
}
```

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/pages/TaxonomiesPage.tsx
git commit -m "feat(taxonomy): add TaxonomiesPage assembly"
```

---

## Task 15 — Navigation : router + Dashboard + ProjectCard

**Files:**
- Modify: `src/app/router.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/components/shared/ProjectCard.tsx`

- [ ] **Ajouter la route dans router.tsx**

Dans `src/app/router.tsx`, ajouter après la ligne `const DataPage = lazy(...)` :

```typescript
const TaxonomiesPage = lazy(() => import('@/pages/TaxonomiesPage'))
```

Ajouter dans le tableau de routes, après le bloc `/data` :

```typescript
{
  path: '/taxonomies',
  element: (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        <TaxonomiesPage />
      </Suspense>
    </ProtectedRoute>
  ),
},
```

- [ ] **Modifier DashboardPage.tsx**

**1.** Dans les imports, ajouter `FolderTree` à la liste des icônes Lucide (ligne 3) :

```typescript
import { Plus, LogOut, Loader2, Library, FilePlus, FileSpreadsheet, Settings, Upload, HardDrive, FolderTree } from 'lucide-react'
```

**2.** Modifier le type `Section` (ligne 23) en ajoutant `'taxonomies'` :

```typescript
type Section = 'blank' | 'import' | 'library' | 'data' | 'gdrive' | 'settings' | 'taxonomies'
```

**3.** Ajouter l'entrée dans le tableau `menuItems` après l'entrée `gdrive` :

```typescript
{ id: 'taxonomies', icon: FolderTree, label: 'Taxonomies', accent: 'text-teal-400', activeBg: 'bg-teal-500/[0.1]', activeText: 'text-teal-300' },
```

**4.** Ajouter l'import lazy en haut du fichier (après `const DataPage = lazy(...)`) :

```typescript
const TaxonomiesPage = lazy(() => import('@/pages/TaxonomiesPage'))
```

**5.** Dans la zone de rendu principal, ajouter le bloc après `{activeSection === 'data' ? ... : (` — juste avant la balise `<main>` pour les autres sections — en modifiant la condition ternaire :

```typescript
{activeSection === 'data' ? (
  <div className="flex-1 overflow-hidden">
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    }>
      <DataPage embedded />
    </Suspense>
  </div>
) : activeSection === 'taxonomies' ? (
  <div className="flex-1 overflow-hidden">
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    }>
      <TaxonomiesPage embedded />
    </Suspense>
  </div>
) : (
  // ... existing <main> block unchanged
)}
```

- [ ] **Modifier ProjectCard.tsx** — ajouter le prop `taxonomyLabel`

Remplacer l'interface `ProjectCardProps` :

```typescript
interface ProjectCardProps {
  project: ProjectData
  onDelete: (id: string) => void
  taxonomyLabel?: string
}
```

Mettre à jour la signature de la fonction :

```typescript
export function ProjectCard({ project, onDelete, taxonomyLabel }: ProjectCardProps) {
```

Ajouter le badge sous le titre du projet dans la zone Info (après la `<p>` du titre) :

```typescript
{taxonomyLabel && (
  <span className="text-[9px] text-teal-400/70 bg-teal-500/10 px-1.5 py-0.5 rounded-full truncate max-w-full block mt-0.5">
    {taxonomyLabel}
  </span>
)}
```

- [ ] **Calculer le taxonomyLabel dans DashboardPage.tsx**

Dans le corps de `DashboardPage`, après le hook `useTaxonomies` (à ajouter) :

```typescript
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'

// Dans le corps du composant :
const { data: taxonomies } = useTaxonomies()

// Calcule le mapping projectId → taxonomyLabel
const projectTaxonomyLabel = useMemo<Record<string, string>>(() => {
  if (!taxonomies) return {}
  const map: Record<string, string> = {}
  for (const tax of taxonomies) {
    for (const node of Object.values(tax.nodes)) {
      for (const pid of node.linkedProjectIds) {
        map[pid] = node.label
      }
    }
  }
  return map
}, [taxonomies])
```

Passer le prop dans les `<ProjectCard>` :

```typescript
<ProjectCard
  key={project.id}
  project={project}
  onDelete={(id) => deleteProject.mutate(id)}
  taxonomyLabel={projectTaxonomyLabel[project.id]}
/>
```

Ajouter l'import `useMemo` dans les imports React si pas déjà présent.

- [ ] **Valider**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/app/router.tsx src/pages/DashboardPage.tsx src/components/shared/ProjectCard.tsx
git commit -m "feat(taxonomy): integrate route, Dashboard section, and ProjectCard badge"
```

---

## Task 16 — Règles Firestore

**Files:**
- Modify: `firestore.rules`

- [ ] **Ajouter la règle `taxonomies`**

Dans `firestore.rules`, après le bloc `match /excel_data/{docId}` et avant la fermeture `}` du bloc principal, ajouter :

```
// ── Taxonomies ────────────────────────────────────────────────────────────────

match /taxonomies/{taxonomyId} {
  allow read:   if isAuthenticated() && resource.data.ownerId == request.auth.uid;
  allow create: if isAuthenticated() && request.resource.data.ownerId == request.auth.uid;
  allow update, delete: if isAuthenticated() && resource.data.ownerId == request.auth.uid;
}
```

- [ ] **Valider la syntaxe Firestore rules** (optionnel si Firebase CLI installé)

```bash
firebase emulators:start --only firestore 2>/dev/null || echo "Firebase CLI non dispo — valider manuellement dans la console Firebase"
```

- [ ] **Commit**

```bash
git add firestore.rules
git commit -m "feat(taxonomy): add Firestore security rules for taxonomies"
```

---

## Task 17 — Vérification finale dev server

- [ ] **Lancer le dev server**

```bash
npm run dev
```

- [ ] **Tester les flows principaux**

1. Naviguer sur `/dashboard` → vérifier que l'entrée "Taxonomies" apparaît dans le menu sidebar
2. Cliquer "Taxonomies" → le module s'affiche en embarqué
3. Naviguer sur `/taxonomies` → la page s'affiche en standalone
4. Cliquer "+" → `TaxonomyImportModal` s'ouvre
5. Importer `Doublet/Nomenclature.md` → 250+ nœuds parsés, prévisualisation correcte
6. Confirmer l'import → la taxonomie apparaît dans `TaxonomySidebar`
7. Cliquer la taxonomie → l'arbre s'affiche avec niveau 0 ouvert
8. Double-cliquer un nœud → inline edit, Enter confirme, Escape annule
9. Cliquer "+" sur un nœud → enfant ajouté
10. Drag-and-drop d'un nœud → repositionnement correct
11. Taper 2+ caractères dans la searchbar → dropdown d'autocomplétion
12. Sélectionner un résultat → arbre déplié jusqu'au nœud, surbrillance
13. Sur un nœud terminal (feuille), cliquer icône Link → `LinkProjectsModal` s'ouvre
14. Cocher un projet → badge count apparaît sur le nœud
15. Sur `/dashboard` → badge taxonomie visible sous le titre du projet lié

- [ ] **Commit final**

```bash
git add -A
git commit -m "feat(taxonomy): complete Taxonomies module"
```

---

## Self-Review

**Couverture spec :**
- ✅ Navigation : section Dashboard embarquée + route `/taxonomies`
- ✅ Import Markdown (H2 + bold bullets + indented) + CSV + XLSX
- ✅ Prévisualisation avant confirmation
- ✅ Tree View récursif avec expand/collapse
- ✅ Comportement initial : niveau 0 ouvert, reste fermé
- ✅ D&D avec `@dnd-kit/sortable`
- ✅ CRUD : addNode, renameNode (inline), deleteNode
- ✅ Mutations optimistes avec rollback
- ✅ Multi-taxonomies dans TaxonomySidebar (rename, duplicate, delete)
- ✅ Recherche + autocomplétion (2 chars min, breadcrumb, expandAll + highlight)
- ✅ Filtre live sur l'arbre
- ✅ Liaison projets ↔ nœuds terminaux (LinkProjectsModal)
- ✅ Badge taxonomie sur ProjectCard dans Dashboard
- ✅ Firestore rules
- ✅ aria-labels sur tous les boutons d'action
- ✅ Aucune nouvelle dépendance

**Types cohérents :** `TaxonomyNode`, `Taxonomy`, `TaxonomyNodeWithChildren` définis en Task 1, utilisés identiquement dans toutes les tâches suivantes. `useTaxonomies` retourne `Taxonomy[]`, consommé tel quel par `TaxonomySidebar` et `DashboardPage`.

**Note :** Pas de framework de test installé dans ce projet — les validations utilisent `tsc --noEmit` + vérification manuelle dev server. Pour ajouter des tests unitaires (parsers, utilitaires), installer vitest séparément.
