# PIM Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer l'écran « Données » en interface PIM 3 colonnes (Projets / Sources / Produits master) avec auto-merge SKU à l'ingestion.

**Architecture:** Promotion de la primitive du niveau sheet vers le niveau projet. Les produits deviennent des « masters » fusionnés par SKU/EAN, les sheets deviennent des `Source` avec snapshot brut conservé. Pipeline d'ingestion unifié : import Excel, scrape (3 modes), saisie manuelle convergent vers `matchRows()` + preview avant écriture.

**Tech Stack:** TypeScript strict, Zustand v4, React Query v5, Firebase Firestore (sub-collection), Vitest + RTL, Tailwind dark mode (#0f0f0f / #1a1a1a / #6366f1).

**Spec:** [`docs/superpowers/specs/2026-04-30-pim-architecture-design.md`](../specs/2026-04-30-pim-architecture-design.md)

**Branche:** travail direct sur `master` (pas de worktree, par feedback utilisateur).

---

## Carte des fichiers

### Créés

```
src/features/pim/
├─ types.ts                              Project, Source, Product, SourceLink, MergePreview
├─ matching/
│   ├─ normalizeSku.ts                   sku/ean/gtin → clé canonique
│   ├─ normalizeSku.test.ts
│   ├─ matchRows.ts                      (rows entrants, products) → MergePreview
│   ├─ matchRows.test.ts
│   ├─ mergeStrategy.ts                  applique preview → produits master
│   └─ mergeStrategy.test.ts
├─ migration/
│   ├─ migrateLegacyBdd.ts               sheets[] → sources[] + products[]
│   ├─ migration.test.ts
│   └─ legacyFixture.ts                  fixture BDD legacy pour les tests
├─ usePimProject.ts                      React Query : load/save project
├─ usePimFirebase.ts                     Firestore CRUD (remplace useExcelFirebase)
├─ useProducts.ts                        lecture filtrée des products master
├─ useSources.ts                         CRUD sources + dédup
└─ index.ts

src/stores/pim.store.ts                  Zustand (remplace excel.store.ts à terme)

src/components/pim/
├─ ProjectsColumn.tsx                    col 1 (refonte ProjectsList existant)
├─ SourcesColumn.tsx                     col 2 nouvelle
├─ SourceItem.tsx                        ligne source dans la liste
├─ SourceGroup.tsx                       en-tête groupe collapsible
├─ AddSourceMenu.tsx                     bouton "+ Source ▾"
├─ SourceContextMenu.tsx                 menu kebab par source
├─ MatchPreviewModal.tsx                 preview merge avant écriture
├─ ProductMasterCell.tsx                 cellule multi-source (prix, image…)
├─ DedupPopover.tsx                      popover "Fusionner avec…" pour needsDedup
└─ MigrationModal.tsx                    UI migration legacy → PIM

docs/superpowers/plans/2026-04-30-pim-architecture.md   ← ce fichier
```

### Modifiés

| Fichier | Changement |
|---|---|
| `src/pages/DataPage.tsx` | Layout 3 colonnes, suppression onglets sheets, breadcrumb dynamique |
| `src/features/scraping/ScrapingModal.tsx` | Sortie via `matchRows()` au lieu de `setSheets()` ; suppression `appendSheetRows`/`mergeSheet` |
| `src/features/excel/ExcelImportModal.tsx` | Pré-sélection projet courant + détection SKU + preview matching |
| `src/features/excel/UpdatePreviewModal.tsx` | Diff au niveau master (pas row par row) |
| `src/features/excel/ProductSheet.tsx` | Nouvel onglet « Sources » avec snapshots |
| `src/components/ui-sub/...` | Aucun changement (fichiers shadcn intouchables) |

### Supprimés (en fin de plan, après migration validée)

- `src/stores/excel.store.ts` (remplacé par `pim.store.ts`)
- `src/features/excel/useExcelFirebase.ts` (remplacé par `usePimFirebase.ts`)

---

## Phase 1 — Types & matching (TDD pur, fondations sans UI)

### Task 1.1 : Types PIM

**Files:**
- Create: `src/features/pim/types.ts`

- [ ] **Step 1: Créer le fichier types**

```typescript
// src/features/pim/types.ts
import type { ExcelColumn, TaxonomyCategory, TaxonomyLevelMap } from '@/features/excel/types'

/** Document Firestore racine. Remplace l'ancien doc `excel_data`. */
export interface Project {
  id: string
  name: string
  path: string[]
  taxonomyLevels?: TaxonomyLevelMap
  taxonomy: TaxonomyCategory[]
  sources: Source[]
  createdAt: number
  updatedAt: number
}

export type SourceKind = 'scrape' | 'import' | 'manual'

export interface Source {
  id: string
  name: string
  kind: SourceKind
  url?: string
  favicon?: string
  group?: string
  schema: ExcelColumn[]
  productCount: number
  enrichedCount: number
  lastSyncedAt?: number
}

/** Produit master, sub-collection projects/{id}/products/{productId}. */
export interface Product {
  _id: string
  masterSku: string | null
  masterEan: string | null
  primarySourceId: string
  fields: Record<string, ProductField>
  sourceLinks: SourceLink[]
  taxonomyPath: string[]
  needsDedup: boolean
  createdAt: number
  updatedAt: number
}

export interface ProductField {
  value: string | number | boolean | null
  winningSourceId: string
  overridden?: boolean
}

export interface SourceLink {
  sourceId: string
  externalSku?: string
  externalUrl?: string
  snapshot: Record<string, string | number | boolean | null>
}

export interface MergePreview {
  newMasters: PreviewRow[]
  mergedOnExisting: PreviewMerge[]
  needsDedup: PreviewRow[]
}

export interface PreviewRow {
  rowIndex: number
  detectedSku: string | null
  snapshot: Record<string, string | number | boolean | null>
}

export interface PreviewMerge extends PreviewRow {
  targetProductId: string
  targetMasterSku: string | null
  fieldChanges: Array<{ key: string; from: unknown; to: unknown; willApply: boolean; reason?: string }>
}
```

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc --noEmit -p .`
Expected: aucune erreur (les imports `ExcelColumn`, `TaxonomyCategory`, `TaxonomyLevelMap` existent déjà).

- [ ] **Step 3: Commit**

```bash
git add src/features/pim/types.ts
git commit -m "feat(pim): add Project/Source/Product types"
```

---

### Task 1.2 : `normalizeSku` (TDD)

**Files:**
- Create: `src/features/pim/matching/normalizeSku.ts`
- Test: `src/features/pim/matching/normalizeSku.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```typescript
// src/features/pim/matching/normalizeSku.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeSku } from './normalizeSku'

describe('normalizeSku', () => {
  it('canonicalise des variantes du même SKU', () => {
    expect(normalizeSku({ sku: 'MIL-4933478577' })).toBe('mil4933478577')
    expect(normalizeSku({ sku: 'mil 4933478577' })).toBe('mil4933478577')
    expect(normalizeSku({ sku: '  4933478577 ' })).toBe('4933478577')
  })

  it('renvoie null pour absence/empty', () => {
    expect(normalizeSku({})).toBeNull()
    expect(normalizeSku({ sku: '' })).toBeNull()
    expect(normalizeSku({ sku: '   ' })).toBeNull()
    expect(normalizeSku({ sku: null as unknown as string })).toBeNull()
  })

  it('priorise EAN sur SKU si les deux présents', () => {
    expect(normalizeSku({ sku: 'X1', ean: '4002395123456' })).toBe('4002395123456')
  })

  it('reconnaît gtin et ref comme fallbacks', () => {
    expect(normalizeSku({ gtin: '4002395999111' })).toBe('4002395999111')
    expect(normalizeSku({ ref: 'REF-A12' })).toBe('refa12')
  })

  it('garde uniquement alphanumérique en lowercase', () => {
    expect(normalizeSku({ sku: 'A.B/C-D_E' })).toBe('abcde')
    expect(normalizeSku({ sku: 'éàç-123' })).toBe('123')  // accents éliminés
  })
})
```

- [ ] **Step 2: Run et constater l'échec**

Run: `npx vitest run src/features/pim/matching/normalizeSku.test.ts`
Expected: `Cannot find module './normalizeSku'`

- [ ] **Step 3: Implémenter `normalizeSku`**

```typescript
// src/features/pim/matching/normalizeSku.ts

/** Champs candidats triés par priorité (EAN/GTIN d'abord car internationaux). */
const SKU_FIELDS = ['ean', 'gtin', 'sku', 'ref', 'reference', 'code'] as const

export interface SkuCandidate {
  sku?: string | null
  ean?: string | null
  gtin?: string | null
  ref?: string | null
  reference?: string | null
  code?: string | null
  [key: string]: unknown
}

/** Canonicalise une clé d'identité produit.
 *  - lowercase
 *  - garde uniquement [a-z0-9]
 *  - renvoie null si moins d'un caractère utile
 */
export function normalizeSku(row: SkuCandidate): string | null {
  for (const field of SKU_FIELDS) {
    const raw = row[field]
    if (typeof raw !== 'string') continue
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (cleaned.length > 0) return cleaned
  }
  return null
}
```

- [ ] **Step 4: Run et vérifier que tout passe**

Run: `npx vitest run src/features/pim/matching/normalizeSku.test.ts`
Expected: 5 tests passants.

- [ ] **Step 5: Commit**

```bash
git add src/features/pim/matching/normalizeSku.ts src/features/pim/matching/normalizeSku.test.ts
git commit -m "feat(pim): normalizeSku with EAN priority and TDD coverage"
```

---

### Task 1.3 : `matchRows` (TDD)

**Files:**
- Create: `src/features/pim/matching/matchRows.ts`
- Test: `src/features/pim/matching/matchRows.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```typescript
// src/features/pim/matching/matchRows.test.ts
import { describe, it, expect } from 'vitest'
import { matchRows } from './matchRows'
import type { Product } from '../types'

const makeProduct = (id: string, sku: string | null): Product => ({
  _id: id, masterSku: sku, masterEan: null, primarySourceId: 'src_x',
  fields: {}, sourceLinks: [], taxonomyPath: [], needsDedup: false,
  createdAt: 0, updatedAt: 0,
})

describe('matchRows', () => {
  it('preview vide = 0 nouveaux 0 mergés 0 needsDedup', () => {
    const preview = matchRows([], [])
    expect(preview.newMasters).toHaveLength(0)
    expect(preview.mergedOnExisting).toHaveLength(0)
    expect(preview.needsDedup).toHaveLength(0)
  })

  it('toutes les rows nouvelles si aucun match', () => {
    const rows = [{ sku: 'A1', name: 'a' }, { sku: 'B2', name: 'b' }]
    const preview = matchRows(rows, [])
    expect(preview.newMasters).toHaveLength(2)
    expect(preview.mergedOnExisting).toHaveLength(0)
  })

  it('match exact sur masterSku → mergé', () => {
    const products = [makeProduct('p1', 'a1')]
    const rows = [{ sku: 'A1', name: 'updated' }]
    const preview = matchRows(rows, products)
    expect(preview.mergedOnExisting).toHaveLength(1)
    expect(preview.mergedOnExisting[0].targetProductId).toBe('p1')
  })

  it('row sans SKU → needsDedup', () => {
    const rows = [{ name: 'pack inconnu' }]
    const preview = matchRows(rows, [])
    expect(preview.needsDedup).toHaveLength(1)
    expect(preview.newMasters).toHaveLength(0)
  })

  it('collision intra-batch (même SKU 2 fois) → 1 merge dans newMasters', () => {
    const rows = [{ sku: 'A1', name: 'a' }, { sku: 'A1', name: 'a-bis' }]
    const preview = matchRows(rows, [])
    expect(preview.newMasters).toHaveLength(1)
    // La 2e row mergée avec la 1ère via batch index, pas via existing.
    expect(preview.mergedOnExisting).toHaveLength(1)
    expect(preview.mergedOnExisting[0].targetProductId).toMatch(/^batch:/)
  })

  it('mix : 2 nouveaux, 1 mergé, 1 needsDedup', () => {
    const products = [makeProduct('p1', 'a1')]
    const rows = [
      { sku: 'A1', name: 'merge' },
      { sku: 'B2', name: 'new' },
      { sku: 'C3', name: 'new aussi' },
      { name: 'no sku' },
    ]
    const preview = matchRows(rows, products)
    expect(preview.mergedOnExisting).toHaveLength(1)
    expect(preview.newMasters).toHaveLength(2)
    expect(preview.needsDedup).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run et constater l'échec**

Run: `npx vitest run src/features/pim/matching/matchRows.test.ts`
Expected: 6 tests échouent (`Cannot find module './matchRows'`).

- [ ] **Step 3: Implémenter `matchRows`**

```typescript
// src/features/pim/matching/matchRows.ts
import type { Product, MergePreview, PreviewRow, PreviewMerge } from '../types'
import { normalizeSku, type SkuCandidate } from './normalizeSku'

type RawRow = SkuCandidate & Record<string, unknown>

/** Indexe les products existants par leur clé canonique. */
function indexExisting(products: Product[]): Map<string, Product> {
  const index = new Map<string, Product>()
  for (const p of products) {
    if (p.masterSku) index.set(p.masterSku, p)
    if (p.masterEan) index.set(p.masterEan, p)
  }
  return index
}

export function matchRows(rows: RawRow[], existing: Product[]): MergePreview {
  const existingIndex = indexExisting(existing)
  const batchIndex = new Map<string, number>()  // sku → index dans newMasters

  const newMasters: PreviewRow[] = []
  const mergedOnExisting: PreviewMerge[] = []
  const needsDedup: PreviewRow[] = []

  rows.forEach((row, rowIndex) => {
    const sku = normalizeSku(row)
    const snapshot = sanitize(row)
    const previewRow: PreviewRow = { rowIndex, detectedSku: sku, snapshot }

    if (!sku) {
      needsDedup.push(previewRow)
      return
    }

    const existingMatch = existingIndex.get(sku)
    if (existingMatch) {
      mergedOnExisting.push({
        ...previewRow,
        targetProductId: existingMatch._id,
        targetMasterSku: existingMatch.masterSku,
        fieldChanges: [],  // calculé dans mergeStrategy
      })
      return
    }

    const batchHit = batchIndex.get(sku)
    if (batchHit !== undefined) {
      // 2e occurrence du même SKU dans le batch : merge sur le 1er
      mergedOnExisting.push({
        ...previewRow,
        targetProductId: `batch:${batchHit}`,
        targetMasterSku: newMasters[batchHit].detectedSku,
        fieldChanges: [],
      })
      return
    }

    batchIndex.set(sku, newMasters.length)
    newMasters.push(previewRow)
  })

  return { newMasters, mergedOnExisting, needsDedup }
}

/** Convertit unknown → primitive supportée par snapshot (string|number|boolean|null). */
function sanitize(row: RawRow): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    } else if (v !== undefined) {
      out[k] = String(v)
    }
  }
  return out
}
```

- [ ] **Step 4: Run, ajuster jusqu'au vert**

Run: `npx vitest run src/features/pim/matching/matchRows.test.ts`
Expected: 6 tests passants.

- [ ] **Step 5: Commit**

```bash
git add src/features/pim/matching/matchRows.ts src/features/pim/matching/matchRows.test.ts
git commit -m "feat(pim): matchRows preview with intra-batch dedup"
```

---

### Task 1.4 : `mergeStrategy` (TDD)

**Files:**
- Create: `src/features/pim/matching/mergeStrategy.ts`
- Test: `src/features/pim/matching/mergeStrategy.test.ts`

- [ ] **Step 1: Écrire les tests**

```typescript
// src/features/pim/matching/mergeStrategy.test.ts
import { describe, it, expect } from 'vitest'
import { applyPreview, PER_SOURCE_FIELDS } from './mergeStrategy'
import type { Product } from '../types'
import { matchRows } from './matchRows'

const baseProduct = (over: Partial<Product> = {}): Product => ({
  _id: 'p1', masterSku: 'a1', masterEan: null, primarySourceId: 'src_a',
  fields: {}, sourceLinks: [], taxonomyPath: [], needsDedup: false,
  createdAt: 0, updatedAt: 0, ...over,
})

describe('applyPreview', () => {
  it('crée des nouveaux masters depuis newMasters', () => {
    const rows = [{ sku: 'X1', name: 'Foo', price: 10 }]
    const preview = matchRows(rows, [])
    const result = applyPreview(preview, [], 'src_new', { now: 1000 })
    expect(result.products).toHaveLength(1)
    const p = result.products[0]
    expect(p.masterSku).toBe('x1')
    expect(p.primarySourceId).toBe('src_new')
    expect(p.fields.name?.value).toBe('Foo')
    // price reste dans le snapshot, pas dans fields master
    expect(p.fields.price).toBeUndefined()
    expect(p.sourceLinks[0].snapshot.price).toBe(10)
  })

  it('merge sur master existant : ajoute sourceLink, garde primarySource', () => {
    const existing = baseProduct({
      fields: { name: { value: 'Original', winningSourceId: 'src_a' } },
      sourceLinks: [{ sourceId: 'src_a', snapshot: { sku: 'A1', name: 'Original', price: 20 } }],
    })
    const rows = [{ sku: 'A1', name: 'Updated', price: 25 }]
    const preview = matchRows(rows, [existing])
    const result = applyPreview(preview, [existing], 'src_b', { now: 2000 })
    expect(result.products).toHaveLength(1)
    const p = result.products[0]
    expect(p.primarySourceId).toBe('src_a')             // primary inchangé
    expect(p.fields.name?.value).toBe('Original')        // nouveau ne gagne pas
    expect(p.sourceLinks).toHaveLength(2)
    expect(p.sourceLinks[1].snapshot.price).toBe(25)
  })

  it('field overridden résiste au merge', () => {
    const existing = baseProduct({
      fields: { name: { value: 'Verrouillé', winningSourceId: 'src_a', overridden: true } },
      sourceLinks: [{ sourceId: 'src_a', snapshot: { sku: 'A1', name: 'Verrouillé' } }],
    })
    const preview = matchRows([{ sku: 'A1', name: 'Tentative écrasement' }], [existing])
    const result = applyPreview(preview, [existing], 'src_b', { now: 3000 })
    expect(result.products[0].fields.name?.value).toBe('Verrouillé')
    expect(result.products[0].fields.name?.overridden).toBe(true)
  })

  it('PER_SOURCE_FIELDS ne sont jamais dans fields master', () => {
    expect(PER_SOURCE_FIELDS).toContain('price')
    expect(PER_SOURCE_FIELDS).toContain('image')
    expect(PER_SOURCE_FIELDS).toContain('stock')
    expect(PER_SOURCE_FIELDS).toContain('external_url')
  })

  it('row sans SKU → master synthétique avec needsDedup', () => {
    const rows = [{ name: 'no-sku-pack' }]
    const preview = matchRows(rows, [])
    const result = applyPreview(preview, [], 'src_x', { now: 4000 })
    expect(result.products).toHaveLength(1)
    expect(result.products[0].needsDedup).toBe(true)
    expect(result.products[0].masterSku).toBeNull()
  })
})
```

- [ ] **Step 2: Run et constater l'échec**

Run: `npx vitest run src/features/pim/matching/mergeStrategy.test.ts`
Expected: échec module manquant.

- [ ] **Step 3: Implémenter `mergeStrategy`**

```typescript
// src/features/pim/matching/mergeStrategy.ts
import type { Product, ProductField, MergePreview, PreviewRow, SourceLink } from '../types'

/** Champs jamais consolidés sur le master ; toujours par-source dans snapshot. */
export const PER_SOURCE_FIELDS = new Set([
  'price', 'price_ttc', 'price_ht', 'currency',
  'image', 'image_url', 'images',
  'stock', 'availability',
  'external_url', 'url', 'product_url', 'source_url',
  'sku', 'ean', 'gtin', 'ref', 'reference', 'code',
])

interface Options {
  /** Permet l'injection d'un horloge pour les tests. */
  now: number
}

interface ApplyResult {
  /** Liste des produits master après application (créés + mergés). Pas de mutation : nouveaux objets. */
  products: Product[]
  /** Compteurs pour UI / logs. */
  stats: { created: number; merged: number; needsDedup: number }
}

export function applyPreview(
  preview: MergePreview,
  existing: Product[],
  sourceId: string,
  opts: Options,
): ApplyResult {
  const productsById = new Map(existing.map((p) => [p._id, p]))
  const created: Product[] = []
  let mergedCount = 0
  let needsDedupCount = 0

  // 1. Crée les nouveaux masters (newMasters)
  preview.newMasters.forEach((row, idx) => {
    const product = createMaster(row, sourceId, opts.now, /* needsDedup */ false)
    created.push(product)
    productsById.set(product._id, product)
    // mémorise l'index pour batch:N → product._id
    productsById.set(`batch:${idx}`, product)
  })

  // 2. Merge sur masters existants ou batch
  preview.mergedOnExisting.forEach((merge) => {
    const target = productsById.get(merge.targetProductId)
    if (!target) return
    const updated = mergeIntoMaster(target, merge.snapshot, sourceId, opts.now)
    productsById.set(target._id, updated)
    mergedCount++
  })

  // 3. needsDedup : crée master synthétique avec flag
  preview.needsDedup.forEach((row) => {
    const product = createMaster(row, sourceId, opts.now, /* needsDedup */ true)
    created.push(product)
    productsById.set(product._id, product)
    needsDedupCount++
  })

  // Récupère uniquement les products réels (filtre les alias batch:N)
  const realProducts = Array.from(productsById.values()).filter(
    (v): v is Product => typeof v === 'object' && v !== null && '_id' in v && !v._id.startsWith('batch:'),
  )

  return {
    products: realProducts,
    stats: { created: created.length - needsDedupCount, merged: mergedCount, needsDedup: needsDedupCount },
  }
}

function createMaster(
  row: PreviewRow,
  sourceId: string,
  now: number,
  needsDedup: boolean,
): Product {
  const fields: Record<string, ProductField> = {}
  for (const [k, v] of Object.entries(row.snapshot)) {
    if (PER_SOURCE_FIELDS.has(k)) continue
    fields[k] = { value: v, winningSourceId: sourceId }
  }
  const link: SourceLink = {
    sourceId,
    externalSku: extractString(row.snapshot.sku) ?? extractString(row.snapshot.ref),
    externalUrl: extractString(row.snapshot.url) ?? extractString(row.snapshot.external_url),
    snapshot: row.snapshot,
  }
  return {
    _id: needsDedup
      ? `dedup_${sourceId}_${row.rowIndex}_${now}`
      : `prod_${row.detectedSku ?? `idx${row.rowIndex}`}_${now}`,
    masterSku: row.detectedSku,
    masterEan: extractString(row.snapshot.ean) ?? extractString(row.snapshot.gtin),
    primarySourceId: sourceId,
    fields,
    sourceLinks: [link],
    taxonomyPath: [],
    needsDedup,
    createdAt: now,
    updatedAt: now,
  }
}

function mergeIntoMaster(
  target: Product,
  snapshot: Record<string, string | number | boolean | null>,
  sourceId: string,
  now: number,
): Product {
  const newFields: Record<string, ProductField> = { ...target.fields }
  for (const [k, v] of Object.entries(snapshot)) {
    if (PER_SOURCE_FIELDS.has(k)) continue
    const existing = newFields[k]
    if (existing?.overridden) continue                       // verrouillé
    if (existing && existing.winningSourceId !== sourceId) {
      // Source primaire gagne par défaut → on ne change pas si valeur existante
      if (target.primarySourceId !== sourceId) continue
    }
    newFields[k] = { ...existing, value: v, winningSourceId: sourceId }
  }
  const link: SourceLink = {
    sourceId,
    externalSku: extractString(snapshot.sku) ?? extractString(snapshot.ref),
    externalUrl: extractString(snapshot.url) ?? extractString(snapshot.external_url),
    snapshot,
  }
  // Remplace le link existant pour cette sourceId, ou ajoute
  const existingLinkIdx = target.sourceLinks.findIndex((sl) => sl.sourceId === sourceId)
  const newLinks =
    existingLinkIdx >= 0
      ? target.sourceLinks.map((sl, i) => (i === existingLinkIdx ? link : sl))
      : [...target.sourceLinks, link]

  return { ...target, fields: newFields, sourceLinks: newLinks, updatedAt: now }
}

function extractString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
```

- [ ] **Step 4: Run et faire passer**

Run: `npx vitest run src/features/pim/matching/mergeStrategy.test.ts`
Expected: 5 tests passants.

- [ ] **Step 5: Commit**

```bash
git add src/features/pim/matching/mergeStrategy.ts src/features/pim/matching/mergeStrategy.test.ts
git commit -m "feat(pim): mergeStrategy with override-respecting field merge"
```

---

## Phase 2 — Store + Firebase

### Task 2.1 : Store Zustand `pim.store.ts`

**Files:**
- Create: `src/stores/pim.store.ts`

- [ ] **Step 1: Écrire le store complet**

```typescript
// src/stores/pim.store.ts
import { create } from 'zustand'
import type { Project, Product, Source } from '@/features/pim/types'

interface PimState {
  /** Liste des projets de l'utilisateur (chargée à la connexion). */
  projects: Project[]
  /** Projet actuellement ouvert (null si vue dashboard). */
  currentProjectId: string | null
  /** Produits master du projet courant, paginés. */
  products: Product[]
  /** Sources sélectionnées dans la col 2 ; vide = vue globale projet. */
  selectedSourceIds: string[]
  /** Filtre taxonomique multi-niveaux (chemin sélectionné). */
  taxonomyNavFilter: string[]
  /** Recherche dans la table principale. */
  searchQuery: string
  /** Filtre IA tri-état (existant). */
  aiFilter: 'all' | 'enriched' | 'raw'
  /** Produit ouvert dans la fiche (sheet). */
  openProductId: string | null
  /** Modale de migration legacy ouverte. */
  migrationModalOpen: boolean

  // Actions projets
  setProjects: (p: Project[]) => void
  setCurrentProjectId: (id: string | null) => void
  upsertProject: (project: Project) => void
  removeProject: (id: string) => void

  // Actions produits
  setProducts: (p: Product[]) => void
  upsertProducts: (products: Product[]) => void
  removeProduct: (id: string) => void

  // Actions sources
  upsertSource: (projectId: string, source: Source) => void
  removeSource: (projectId: string, sourceId: string) => void

  // Sélection / filtres
  setSelectedSourceIds: (ids: string[]) => void
  toggleSelectedSource: (id: string) => void
  setTaxonomyNavFilter: (path: string[]) => void
  setSearchQuery: (q: string) => void
  setAiFilter: (v: 'all' | 'enriched' | 'raw') => void
  setOpenProductId: (id: string | null) => void
  setMigrationModalOpen: (open: boolean) => void
}

export const usePimStore = create<PimState>((set) => ({
  projects: [],
  currentProjectId: null,
  products: [],
  selectedSourceIds: [],
  taxonomyNavFilter: [],
  searchQuery: '',
  aiFilter: 'all',
  openProductId: null,
  migrationModalOpen: false,

  setProjects: (projects) => set({ projects }),
  setCurrentProjectId: (currentProjectId) =>
    set({ currentProjectId, selectedSourceIds: [], taxonomyNavFilter: [], openProductId: null }),
  upsertProject: (project) =>
    set((s) => {
      const idx = s.projects.findIndex((p) => p.id === project.id)
      const projects = idx >= 0
        ? s.projects.map((p, i) => (i === idx ? project : p))
        : [...s.projects, project]
      return { projects }
    }),
  removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

  setProducts: (products) => set({ products }),
  upsertProducts: (incoming) =>
    set((s) => {
      const map = new Map(s.products.map((p) => [p._id, p]))
      for (const p of incoming) map.set(p._id, p)
      return { products: Array.from(map.values()) }
    }),
  removeProduct: (id) =>
    set((s) => ({ products: s.products.filter((p) => p._id !== id) })),

  upsertSource: (projectId, source) =>
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p
        const idx = p.sources.findIndex((src) => src.id === source.id)
        const sources = idx >= 0
          ? p.sources.map((src, i) => (i === idx ? source : src))
          : [...p.sources, source]
        return { ...p, sources }
      }),
    })),
  removeSource: (projectId, sourceId) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, sources: p.sources.filter((src) => src.id !== sourceId) } : p,
      ),
    })),

  setSelectedSourceIds: (selectedSourceIds) => set({ selectedSourceIds, openProductId: null }),
  toggleSelectedSource: (id) =>
    set((s) => ({
      selectedSourceIds: s.selectedSourceIds.includes(id)
        ? s.selectedSourceIds.filter((x) => x !== id)
        : [...s.selectedSourceIds, id],
      openProductId: null,
    })),
  setTaxonomyNavFilter: (taxonomyNavFilter) => set({ taxonomyNavFilter, openProductId: null }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setAiFilter: (aiFilter) => set({ aiFilter }),
  setOpenProductId: (openProductId) => set({ openProductId }),
  setMigrationModalOpen: (migrationModalOpen) => set({ migrationModalOpen }),
}))
```

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc --noEmit -p .`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/stores/pim.store.ts
git commit -m "feat(pim): zustand store for projects/products/sources"
```

---

### Task 2.2 : `usePimFirebase`

**Files:**
- Create: `src/features/pim/usePimFirebase.ts`

- [ ] **Step 1: Implémenter avec sub-collection products**

```typescript
// src/features/pim/usePimFirebase.ts
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import type { Project, Product, Source } from './types'

const COLLECTION = 'pim_projects'
const PRODUCTS_SUB = 'products'

function requireUser() {
  const u = auth.currentUser
  if (!u) throw new Error('Utilisateur non authentifié')
  return u
}

/** Charge tous les projets de l'utilisateur (header + sources, sans products). */
export async function listProjects(): Promise<Project[]> {
  const user = requireUser()
  const q = query(collection(db, COLLECTION), where('userId', '==', user.uid))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name,
      path: data.path ?? [],
      taxonomyLevels: data.taxonomyLevels ?? undefined,
      taxonomy: data.taxonomy ?? [],
      sources: data.sources ?? [],
      createdAt: data.createdAt?.toMillis?.() ?? 0,
      updatedAt: data.updatedAt?.toMillis?.() ?? 0,
    }
  })
}

/** Charge le détail d'un projet (sans products). */
export async function loadProject(projectId: string): Promise<Project | null> {
  requireUser()
  const ref = doc(db, COLLECTION, projectId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: snap.id,
    name: data.name,
    path: data.path ?? [],
    taxonomyLevels: data.taxonomyLevels ?? undefined,
    taxonomy: data.taxonomy ?? [],
    sources: data.sources ?? [],
    createdAt: data.createdAt?.toMillis?.() ?? 0,
    updatedAt: data.updatedAt?.toMillis?.() ?? 0,
  }
}

/** Crée ou met à jour le header projet (pas les products). */
export async function saveProjectHeader(project: Project): Promise<void> {
  const user = requireUser()
  const ref = doc(db, COLLECTION, project.id)
  await setDoc(
    ref,
    {
      userId: user.uid,
      name: project.name,
      path: project.path,
      taxonomyLevels: project.taxonomyLevels ?? null,
      taxonomy: project.taxonomy,
      sources: project.sources,
      updatedAt: serverTimestamp(),
      createdAt: project.createdAt ? new Date(project.createdAt) : serverTimestamp(),
    },
    { merge: true },
  )
}

export async function deleteProject(projectId: string): Promise<void> {
  requireUser()
  // Note : Firestore ne cascade pas. La sub-collection devra être purgée à part.
  const productsCol = collection(db, COLLECTION, projectId, PRODUCTS_SUB)
  const productsSnap = await getDocs(productsCol)
  const batch = writeBatch(db)
  productsSnap.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(db, COLLECTION, projectId))
  await batch.commit()
}

/** Charge les products d'un projet. Pagination simple par limite ; si besoin
 *  réel de pagination, ajouter cursor + orderBy plus tard. */
export async function loadProducts(projectId: string): Promise<Product[]> {
  requireUser()
  const productsCol = collection(db, COLLECTION, projectId, PRODUCTS_SUB)
  const snap = await getDocs(productsCol)
  return snap.docs.map((d) => d.data() as Product)
}

/** Écrit un lot de products via writeBatch (max 500 par batch Firestore). */
export async function saveProducts(projectId: string, products: Product[]): Promise<void> {
  requireUser()
  const chunks: Product[][] = []
  for (let i = 0; i < products.length; i += 400) chunks.push(products.slice(i, i + 400))
  for (const chunk of chunks) {
    const batch = writeBatch(db)
    chunk.forEach((p) => {
      const ref = doc(db, COLLECTION, projectId, PRODUCTS_SUB, p._id)
      batch.set(ref, p, { merge: true })
    })
    await batch.commit()
  }
}

export async function deleteProductsByIds(projectId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  requireUser()
  const batch = writeBatch(db)
  ids.forEach((id) => batch.delete(doc(db, COLLECTION, projectId, PRODUCTS_SUB, id)))
  await batch.commit()
}

/** Met à jour uniquement les sources d'un projet (sans toucher aux products). */
export async function saveSources(projectId: string, sources: Source[]): Promise<void> {
  requireUser()
  await setDoc(doc(db, COLLECTION, projectId), { sources, updatedAt: serverTimestamp() }, { merge: true })
}
```

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc --noEmit -p .`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/features/pim/usePimFirebase.ts
git commit -m "feat(pim): firestore CRUD with sub-collection products"
```

---

### Task 2.3 : Hooks React Query `usePimProject` / `useProducts` / `useSources`

**Files:**
- Create: `src/features/pim/usePimProject.ts`
- Create: `src/features/pim/useProducts.ts`
- Create: `src/features/pim/useSources.ts`
- Create: `src/features/pim/index.ts`

- [ ] **Step 1: `usePimProject.ts`**

```typescript
// src/features/pim/usePimProject.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProjects, loadProject, saveProjectHeader, deleteProject } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import type { Project } from './types'

const KEYS = {
  list: ['pim', 'projects'] as const,
  byId: (id: string) => ['pim', 'project', id] as const,
}

export function useProjectsList() {
  const setProjects = usePimStore((s) => s.setProjects)
  return useQuery({
    queryKey: KEYS.list,
    queryFn: async () => {
      const projects = await listProjects()
      setProjects(projects)
      return projects
    },
  })
}

export function useProject(projectId: string | null) {
  const upsertProject = usePimStore((s) => s.upsertProject)
  return useQuery({
    queryKey: KEYS.byId(projectId ?? '_'),
    queryFn: async () => {
      if (!projectId) return null
      const project = await loadProject(projectId)
      if (project) upsertProject(project)
      return project
    },
    enabled: !!projectId,
  })
}

export function useSaveProjectHeader() {
  const qc = useQueryClient()
  const upsertProject = usePimStore((s) => s.upsertProject)
  return useMutation({
    mutationFn: async (project: Project) => {
      await saveProjectHeader(project)
      upsertProject(project)
      return project
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: KEYS.list })
      qc.setQueryData(KEYS.byId(project.id), project)
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  const removeProject = usePimStore((s) => s.removeProject)
  return useMutation({
    mutationFn: async (projectId: string) => {
      await deleteProject(projectId)
      removeProject(projectId)
      return projectId
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  })
}
```

- [ ] **Step 2: `useProducts.ts`**

```typescript
// src/features/pim/useProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { loadProducts, saveProducts, deleteProductsByIds } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import type { Product } from './types'

const KEY = (projectId: string) => ['pim', 'products', projectId] as const

export function useProducts(projectId: string | null) {
  const setProducts = usePimStore((s) => s.setProducts)
  return useQuery({
    queryKey: KEY(projectId ?? '_'),
    queryFn: async () => {
      if (!projectId) return []
      const products = await loadProducts(projectId)
      setProducts(products)
      return products
    },
    enabled: !!projectId,
  })
}

export function useUpsertProducts(projectId: string) {
  const qc = useQueryClient()
  const upsertProducts = usePimStore((s) => s.upsertProducts)
  return useMutation({
    mutationFn: async (products: Product[]) => {
      await saveProducts(projectId, products)
      upsertProducts(products)
      return products
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(projectId) }),
  })
}

export function useDeleteProducts(projectId: string) {
  const qc = useQueryClient()
  const removeProduct = usePimStore.getState().removeProduct
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await deleteProductsByIds(projectId, ids)
      ids.forEach(removeProduct)
      return ids
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(projectId) }),
  })
}
```

- [ ] **Step 3: `useSources.ts`**

```typescript
// src/features/pim/useSources.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveSources } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import type { Source, Product } from './types'
import { useDeleteProducts } from './useProducts'

export function useUpsertSource(projectId: string) {
  const qc = useQueryClient()
  const upsertSource = usePimStore((s) => s.upsertSource)
  return useMutation({
    mutationFn: async (source: Source) => {
      const project = usePimStore.getState().projects.find((p) => p.id === projectId)
      if (!project) throw new Error('Projet introuvable')
      const idx = project.sources.findIndex((s) => s.id === source.id)
      const sources = idx >= 0
        ? project.sources.map((s, i) => (i === idx ? source : s))
        : [...project.sources, source]
      await saveSources(projectId, sources)
      upsertSource(projectId, source)
      return source
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pim', 'project', projectId] }),
  })
}

/** Supprime une source ET cascade : produits dont c'est la dernière source → supprimés. */
export function useRemoveSource(projectId: string) {
  const qc = useQueryClient()
  const removeSource = usePimStore((s) => s.removeSource)
  const deleteProducts = useDeleteProducts(projectId)
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const project = usePimStore.getState().projects.find((p) => p.id === projectId)
      if (!project) return { removedProductIds: [] as string[] }

      // 1. Supprime la source
      const newSources = project.sources.filter((s) => s.id !== sourceId)
      await saveSources(projectId, newSources)
      removeSource(projectId, sourceId)

      // 2. Cascade products
      const products = usePimStore.getState().products
      const orphans: string[] = []
      const toUpdate: Product[] = []
      for (const p of products) {
        const remainingLinks = p.sourceLinks.filter((l) => l.sourceId !== sourceId)
        if (remainingLinks.length === 0) {
          orphans.push(p._id)
        } else if (remainingLinks.length !== p.sourceLinks.length) {
          toUpdate.push({ ...p, sourceLinks: remainingLinks })
        }
      }
      if (orphans.length > 0) {
        await deleteProducts.mutateAsync(orphans)
      }
      // Note : toUpdate écrits via batch séparé pour rester atomique
      // (à brancher dans Phase 6 quand l'UI le déclenchera).
      return { removedProductIds: orphans, updatedProducts: toUpdate }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pim', 'project', projectId] }),
  })
}
```

- [ ] **Step 4: `index.ts` barrel**

```typescript
// src/features/pim/index.ts
export * from './types'
export { matchRows } from './matching/matchRows'
export { applyPreview, PER_SOURCE_FIELDS } from './matching/mergeStrategy'
export { normalizeSku } from './matching/normalizeSku'
export { useProjectsList, useProject, useSaveProjectHeader, useDeleteProject } from './usePimProject'
export { useProducts, useUpsertProducts, useDeleteProducts } from './useProducts'
export { useUpsertSource, useRemoveSource } from './useSources'
```

- [ ] **Step 5: Vérifier compilation**

Run: `npx tsc --noEmit -p .`
Expected: pas d'erreur.

- [ ] **Step 6: Commit**

```bash
git add src/features/pim/usePimProject.ts src/features/pim/useProducts.ts src/features/pim/useSources.ts src/features/pim/index.ts
git commit -m "feat(pim): React Query hooks for projects/products/sources"
```

---

## Phase 3 — Migration legacy

### Task 3.1 : `migrateLegacyBdd` (TDD)

**Files:**
- Create: `src/features/pim/migration/legacyFixture.ts`
- Create: `src/features/pim/migration/migrateLegacyBdd.ts`
- Create: `src/features/pim/migration/migration.test.ts`

- [ ] **Step 1: Fixture legacy**

```typescript
// src/features/pim/migration/legacyFixture.ts
import type { ExcelSheet } from '@/features/excel/types'

export function makeLegacyDoc(sheets: ExcelSheet[]) {
  return {
    docId: 'legacy_abc',
    fileName: 'Castorama',
    path: ['Distribution'],
    sheets,
  }
}

export const sampleSheets: ExcelSheet[] = [
  {
    name: 'nicoll.fr',
    columns: [
      { key: 'sku', label: 'SKU', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 100 },
      { key: 'name', label: 'Nom', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 200 },
      { key: 'price', label: 'Prix', fieldType: 'currency', detectedType: 'currency', isPrimary: false, width: 80 },
    ],
    rows: [
      { _id: 'r1', sku: 'NIC-001', name: 'Tube PVC 32', price: 4.5 },
      { _id: 'r2', sku: 'NIC-002', name: 'Coude 90°', price: 1.2 },
    ],
    taxonomy: [],
  },
  {
    name: 'fr.milwaukeetool.eu',
    columns: [
      { key: 'sku', label: 'SKU', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 100 },
      { key: 'name', label: 'Nom', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 200 },
    ],
    rows: [
      { _id: 'r3', sku: 'MIL-4933', name: 'Visseuse M18' },
      { _id: 'r4', sku: 'NIC-001', name: 'Aussi vendu' },  // SKU collision avec nicoll
    ],
    taxonomy: [],
  },
]
```

- [ ] **Step 2: Tests**

```typescript
// src/features/pim/migration/migration.test.ts
import { describe, it, expect } from 'vitest'
import { migrateLegacyBdd } from './migrateLegacyBdd'
import { makeLegacyDoc, sampleSheets } from './legacyFixture'

describe('migrateLegacyBdd', () => {
  it('crée 1 projet + N sources depuis N sheets', () => {
    const result = migrateLegacyBdd(makeLegacyDoc(sampleSheets), { now: 1000 })
    expect(result.project.id).toBe('legacy_abc')
    expect(result.project.name).toBe('Castorama')
    expect(result.project.path).toEqual(['Distribution'])
    expect(result.project.sources).toHaveLength(2)
    expect(result.project.sources[0].name).toBe('nicoll.fr')
    expect(result.project.sources[0].kind).toBe('scrape')
  })

  it('SKU partagé entre sheets → 1 produit master avec 2 sourceLinks', () => {
    const result = migrateLegacyBdd(makeLegacyDoc(sampleSheets), { now: 1000 })
    const shared = result.products.find((p) => p.masterSku === 'nic001')
    expect(shared).toBeDefined()
    expect(shared!.sourceLinks).toHaveLength(2)
  })

  it('total products = 3 (NIC-001 unique, NIC-002, MIL-4933)', () => {
    const result = migrateLegacyBdd(makeLegacyDoc(sampleSheets), { now: 1000 })
    expect(result.products).toHaveLength(3)
  })

  it('row sans SKU → needsDedup', () => {
    const noSkuSheets = [{ ...sampleSheets[0], rows: [{ _id: 'x', name: 'orphan', price: 10 }] }]
    const result = migrateLegacyBdd(makeLegacyDoc(noSkuSheets), { now: 1000 })
    expect(result.products[0].needsDedup).toBe(true)
  })

  it('totaux dryRun stats valides', () => {
    const result = migrateLegacyBdd(makeLegacyDoc(sampleSheets), { now: 1000 })
    expect(result.stats.sourcesCreated).toBe(2)
    expect(result.stats.productsCreated).toBe(3)
    expect(result.stats.rowsMerged).toBe(1)
  })
})
```

- [ ] **Step 3: Run et constater l'échec**

Run: `npx vitest run src/features/pim/migration/migration.test.ts`
Expected: 5 tests échouent.

- [ ] **Step 4: Implémenter `migrateLegacyBdd`**

```typescript
// src/features/pim/migration/migrateLegacyBdd.ts
import type { ExcelSheet } from '@/features/excel/types'
import type { Project, Source, Product } from '../types'
import { matchRows } from '../matching/matchRows'
import { applyPreview } from '../matching/mergeStrategy'

interface LegacyDoc {
  docId: string
  fileName: string
  path?: string[]
  sheets: ExcelSheet[]
  taxonomyLevels?: unknown
}

interface Options { now: number }

interface MigrationResult {
  project: Project
  products: Product[]
  stats: { sourcesCreated: number; productsCreated: number; rowsMerged: number; needsDedup: number }
}

function inferSourceKind(name: string): Source['kind'] {
  return /\.[a-z]{2,}/i.test(name) ? 'scrape' : 'import'
}

export function migrateLegacyBdd(legacy: LegacyDoc, opts: Options): MigrationResult {
  const sources: Source[] = legacy.sheets.map((sheet, idx) => ({
    id: `src_${legacy.docId}_${idx}`,
    name: sheet.name,
    kind: inferSourceKind(sheet.name),
    schema: sheet.columns,
    productCount: 0,
    enrichedCount: 0,
    lastSyncedAt: opts.now,
  }))

  let products: Product[] = []
  let totalMerged = 0
  let totalNeedsDedup = 0

  legacy.sheets.forEach((sheet, idx) => {
    const sourceId = sources[idx].id
    const rows = sheet.rows.map((r) => {
      const { _id, ...rest } = r
      return rest as Record<string, string | number | boolean | null>
    })
    const preview = matchRows(rows, products)
    const result = applyPreview(preview, products, sourceId, { now: opts.now })
    products = result.products
    totalMerged += result.stats.merged
    totalNeedsDedup += result.stats.needsDedup
  })

  // Met à jour productCount par source
  for (const src of sources) {
    src.productCount = products.filter((p) =>
      p.sourceLinks.some((l) => l.sourceId === src.id),
    ).length
  }

  const project: Project = {
    id: legacy.docId,
    name: legacy.fileName,
    path: legacy.path ?? [],
    taxonomy: [],
    sources,
    createdAt: opts.now,
    updatedAt: opts.now,
  }

  return {
    project,
    products,
    stats: {
      sourcesCreated: sources.length,
      productsCreated: products.length - totalNeedsDedup,
      rowsMerged: totalMerged,
      needsDedup: totalNeedsDedup,
    },
  }
}
```

- [ ] **Step 5: Run et faire passer**

Run: `npx vitest run src/features/pim/migration/migration.test.ts`
Expected: 5 tests passants.

- [ ] **Step 6: Commit**

```bash
git add src/features/pim/migration/
git commit -m "feat(pim): legacy BDD migration with cross-sheet SKU merging"
```

---

### Task 3.2 : Migration UI (modal + bouton)

**Files:**
- Create: `src/components/pim/MigrationModal.tsx`
- Modify: `src/pages/DataPage.tsx` (ajout bouton)

- [ ] **Step 1: `MigrationModal.tsx`**

```tsx
// src/components/pim/MigrationModal.tsx
import { useState } from 'react'
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { migrateLegacyBdd } from '@/features/pim/migration/migrateLegacyBdd'
import { saveProjectHeader, saveProducts } from '@/features/pim/usePimFirebase'
import { Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'

interface Props { open: boolean; onClose: () => void }

interface DryRunRow {
  docId: string
  fileName: string
  sheets: number
  productsAfter: number
  needsDedup: number
}

export function MigrationModal({ open, onClose }: Props) {
  const [phase, setPhase] = useState<'idle' | 'dry-run' | 'preview' | 'running' | 'done'>('idle')
  const [rows, setRows] = useState<DryRunRow[]>([])
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const runDryRun = async () => {
    setPhase('dry-run')
    setError(null)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Non authentifié')
      const q = query(collection(db, 'excel_data'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const now = Date.now()
      const out: DryRunRow[] = []
      for (const d of snap.docs) {
        const data = d.data()
        if (data.migratedTo) continue
        const sheets = JSON.parse(data.sheets ?? '[]')
        const result = migrateLegacyBdd(
          { docId: d.id, fileName: data.fileName ?? 'Sans nom', path: data.path ?? [], sheets },
          { now },
        )
        out.push({
          docId: d.id,
          fileName: data.fileName ?? 'Sans nom',
          sheets: sheets.length,
          productsAfter: result.products.length,
          needsDedup: result.stats.needsDedup,
        })
      }
      setRows(out)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  const runMigration = async () => {
    setPhase('running')
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Non authentifié')
      const now = Date.now()
      for (const r of rows) {
        const ref = doc(db, 'excel_data', r.docId)
        const snap = await getDocs(query(collection(db, 'excel_data'), where('userId', '==', user.uid)))
        const legacyData = snap.docs.find((d) => d.id === r.docId)?.data()
        if (!legacyData) continue
        const sheets = JSON.parse(legacyData.sheets ?? '[]')
        const result = migrateLegacyBdd(
          { docId: r.docId, fileName: legacyData.fileName, path: legacyData.path ?? [], sheets },
          { now },
        )
        await saveProjectHeader(result.project)
        await saveProducts(r.docId, result.products)
        await updateDoc(ref, { migratedTo: r.docId, migratedAt: now })
      }
      setPhase('done')
      toast.success(`${rows.length} BDD migrées vers le PIM`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('preview')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white/85">Migrer mes BDD vers le PIM</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-4 py-4 overflow-y-auto flex-1">
          {phase === 'idle' && (
            <>
              <p className="text-[12px] text-white/60 mb-3">
                Cette opération convertit toutes vos bases existantes en projets PIM avec produits master.
                Les données legacy ne sont <strong>pas supprimées</strong> ; elles sont marquées <code>migratedTo</code>.
              </p>
              <button
                onClick={runDryRun}
                className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 rounded-md text-[12px] text-white"
              >
                Lancer le dry-run
              </button>
            </>
          )}

          {phase === 'dry-run' && (
            <p className="flex items-center gap-2 text-white/60"><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</p>
          )}

          {phase === 'preview' && (
            <>
              <table className="w-full text-[12px] text-white/70">
                <thead className="text-[10px] uppercase text-white/30">
                  <tr><th className="text-left py-1">Nom</th><th>Sheets</th><th>Produits</th><th>À dédup</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.docId} className="border-t border-white/5">
                      <td className="py-1">{r.fileName}</td>
                      <td className="text-center">{r.sheets}</td>
                      <td className="text-center">{r.productsAfter}</td>
                      <td className="text-center text-amber-400/80">{r.needsDedup || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="text-white/40 text-[12px]">Aucune BDD à migrer.</p>}
              {rows.length > 0 && (
                <button
                  onClick={runMigration}
                  className="mt-4 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-md text-[12px] text-white"
                >
                  Confirmer la migration
                </button>
              )}
            </>
          )}

          {phase === 'running' && (
            <p className="flex items-center gap-2 text-white/60"><Loader2 className="w-4 h-4 animate-spin" /> Écriture en cours…</p>
          )}

          {phase === 'done' && (
            <p className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Migration terminée.</p>
          )}

          {error && (
            <p className="mt-3 flex items-start gap-2 text-red-400 text-[12px]">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Brancher dans `DataPage.tsx`**

Modifier `src/pages/DataPage.tsx`, ajouter en haut de l'imports :

```tsx
import { MigrationModal } from '@/components/pim/MigrationModal'
import { usePimStore } from '@/stores/pim.store'
```

Ajouter dans le composant (à côté des autres `useState` actuels) :

```tsx
const migrationModalOpen = usePimStore((s) => s.migrationModalOpen)
const setMigrationModalOpen = usePimStore((s) => s.setMigrationModalOpen)
```

Et juste avant la fermeture `</div>` racine du return, ajouter :

```tsx
<MigrationModal open={migrationModalOpen} onClose={() => setMigrationModalOpen(false)} />
```

Ajouter un bouton « Migrer » dans le sidebar `BASES DE DONNEES`, juste sous le bouton `+ Créer` (chercher la section avec `Cloud` icon, ligne ~277) :

```tsx
<button
  onClick={() => setMigrationModalOpen(true)}
  className="w-full text-left px-2 py-1 text-[10px] text-white/40 hover:text-white/70 hover:bg-white/[0.04] rounded"
>
  Migrer mes BDD → PIM
</button>
```

- [ ] **Step 3: Vérifier compilation et lancement dev**

Run: `npx tsc --noEmit -p .`
Expected: pas d'erreur.

Run: `npm run dev` puis ouvrir le navigateur, cliquer sur le bouton « Migrer mes BDD » dans le sidebar, vérifier que le dry-run s'affiche.

- [ ] **Step 4: Commit**

```bash
git add src/components/pim/MigrationModal.tsx src/pages/DataPage.tsx
git commit -m "feat(pim): migration modal with dry-run preview"
```

---

## Phase 4 — UI col 2 (Sources)

### Task 4.1 : `SourceItem.tsx`

**Files:**
- Create: `src/components/pim/SourceItem.tsx`

- [ ] **Step 1: Composant**

```tsx
// src/components/pim/SourceItem.tsx
import { Globe, FileText, Edit3, Sparkles, MoreVertical } from 'lucide-react'
import type { Source } from '@/features/pim/types'
import { cn } from '@/lib/utils'

interface Props {
  source: Source
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

const KIND_ICONS = {
  scrape: Globe,
  import: FileText,
  manual: Edit3,
} as const

export function SourceItem({ source, selected, onSelect, onContextMenu }: Props) {
  const Icon = KIND_ICONS[source.kind]
  return (
    <button
      onClick={onSelect}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e) }}
      className={cn(
        'group w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded-md transition-colors',
        selected
          ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/25'
          : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80 border border-transparent',
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" />
      <span className="flex-1 truncate text-left">{source.name}</span>
      <span className="text-[10px] tabular-nums text-white/30">{source.productCount}</span>
      {source.enrichedCount > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] text-indigo-300/70">
          <Sparkles className="w-2.5 h-2.5" /> {source.enrichedCount}
        </span>
      )}
      <MoreVertical
        className="w-3 h-3 opacity-0 group-hover:opacity-60 hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onContextMenu(e) }}
      />
    </button>
  )
}
```

- [ ] **Step 2: Vérifier compilation**

Run: `npx tsc --noEmit -p .`
Expected: pas d'erreur (vérifier `cn` est exporté de `@/lib/utils` ; sinon utiliser `clsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/pim/SourceItem.tsx
git commit -m "feat(pim): SourceItem row with kind icon and counts"
```

---

### Task 4.2 : `SourceGroup.tsx`

**Files:**
- Create: `src/components/pim/SourceGroup.tsx`

- [ ] **Step 1: Composant**

```tsx
// src/components/pim/SourceGroup.tsx
import { useState, type ReactNode } from 'react'
import { ChevronRight, ChevronDown, Folder } from 'lucide-react'

interface Props {
  label: string
  count: number
  defaultOpen?: boolean
  children: ReactNode
}

export function SourceGroup({ label, count, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-white/30 hover:text-white/50"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Folder className="w-3 h-3 opacity-60" />
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="tabular-nums text-white/25">{count}</span>
      </button>
      {open && <div className="space-y-px mt-0.5">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Compile et commit**

```bash
npx tsc --noEmit -p .
git add src/components/pim/SourceGroup.tsx
git commit -m "feat(pim): SourceGroup collapsible header"
```

---

### Task 4.3 : `AddSourceMenu.tsx`

**Files:**
- Create: `src/components/pim/AddSourceMenu.tsx`

- [ ] **Step 1: Menu déroulant**

```tsx
// src/components/pim/AddSourceMenu.tsx
import { useState, useRef, useEffect } from 'react'
import { Plus, Upload, Globe, Edit3, ChevronDown } from 'lucide-react'

interface Props {
  onPickImport: () => void
  onPickScrape: () => void
  onPickManual: () => void
}

export function AddSourceMenu({ onPickImport, onPickScrape, onPickManual }: Props) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const choose = (fn: () => void) => () => { fn(); setOpen(false) }

  return (
    <div ref={wrapper} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/25 rounded-md text-[12px] text-indigo-200 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Source
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-[#1a1a1a] border border-white/10 rounded-md shadow-lg py-1">
          <button onClick={choose(onPickImport)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white">
            <Upload className="w-3.5 h-3.5 opacity-60" /> Importer un fichier
          </button>
          <button onClick={choose(onPickScrape)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white">
            <Globe className="w-3.5 h-3.5 opacity-60" /> Scraper une URL
          </button>
          <button onClick={choose(onPickManual)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white">
            <Edit3 className="w-3.5 h-3.5 opacity-60" /> Saisir manuellement
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Compile et commit**

```bash
npx tsc --noEmit -p .
git add src/components/pim/AddSourceMenu.tsx
git commit -m "feat(pim): AddSourceMenu dropdown with 3 ingestion modes"
```

---

### Task 4.4 : `SourceContextMenu.tsx`

**Files:**
- Create: `src/components/pim/SourceContextMenu.tsx`

- [ ] **Step 1: Menu kebab**

```tsx
// src/components/pim/SourceContextMenu.tsx
import { useEffect, useRef } from 'react'
import { Pencil, RefreshCw, FolderInput, Trash2 } from 'lucide-react'

interface Props {
  x: number
  y: number
  onRename: () => void
  onResync: () => void
  onMove: () => void
  onDelete: () => void
  onClose: () => void
}

export function SourceContextMenu({ x, y, onRename, onResync, onMove, onDelete, onClose }: Props) {
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [onClose])

  const item = (Icon: typeof Pencil, label: string, fn: () => void, danger = false) => (
    <button
      onClick={() => { fn(); onClose() }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-white/[0.06] ${danger ? 'text-red-300 hover:text-red-200' : 'text-white/70 hover:text-white'}`}
    >
      <Icon className="w-3.5 h-3.5 opacity-60" /> {label}
    </button>
  )

  return (
    <div
      ref={wrapper}
      style={{ left: x, top: y }}
      className="fixed z-30 min-w-[180px] bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl py-1"
    >
      {item(Pencil, 'Renommer', onRename)}
      {item(RefreshCw, 'Mettre à jour (re-scrape)', onResync)}
      {item(FolderInput, 'Déplacer dans un groupe…', onMove)}
      <div className="my-1 h-px bg-white/10" />
      {item(Trash2, 'Supprimer la source', onDelete, true)}
    </div>
  )
}
```

- [ ] **Step 2: Compile et commit**

```bash
npx tsc --noEmit -p .
git add src/components/pim/SourceContextMenu.tsx
git commit -m "feat(pim): SourceContextMenu with rename/resync/move/delete"
```

---

### Task 4.5 : `SourcesColumn.tsx` (assemblage + virtualisation simple)

**Files:**
- Create: `src/components/pim/SourcesColumn.tsx`

- [ ] **Step 1: Composant principal**

```tsx
// src/components/pim/SourcesColumn.tsx
import { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { usePimStore } from '@/stores/pim.store'
import { useRemoveSource } from '@/features/pim/useSources'
import { SourceItem } from './SourceItem'
import { SourceGroup } from './SourceGroup'
import { AddSourceMenu } from './AddSourceMenu'
import { SourceContextMenu } from './SourceContextMenu'
import type { Source } from '@/features/pim/types'

interface Props {
  onPickImport: () => void
  onPickScrape: () => void
  onPickManual: () => void
}

const UNGROUPED = '__ungrouped__'

export function SourcesColumn({ onPickImport, onPickScrape, onPickManual }: Props) {
  const project = usePimStore((s) => {
    const id = s.currentProjectId
    return id ? s.projects.find((p) => p.id === id) : null
  })
  const selectedIds = usePimStore((s) => s.selectedSourceIds)
  const setSelected = usePimStore((s) => s.setSelectedSourceIds)
  const toggleSelected = usePimStore((s) => s.toggleSelectedSource)
  const removeSource = useRemoveSource(project?.id ?? '')

  const [filter, setFilter] = useState('')
  const [menu, setMenu] = useState<{ source: Source; x: number; y: number } | null>(null)

  const grouped = useMemo(() => {
    if (!project) return new Map<string, Source[]>()
    const sources = project.sources.filter(
      (s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()),
    )
    const map = new Map<string, Source[]>()
    for (const s of sources) {
      const key = s.group ?? UNGROUPED
      const arr = map.get(key) ?? []
      arr.push(s)
      map.set(key, arr)
    }
    return map
  }, [project, filter])

  if (!project) {
    return (
      <aside className="w-[240px] shrink-0 border-r border-white/[0.06] bg-[#0f0f0f] p-3">
        <p className="text-[11px] text-white/30">Sélectionne un projet</p>
      </aside>
    )
  }

  const handleSelect = (source: Source) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      toggleSelected(source.id)
    } else if (selectedIds.length === 1 && selectedIds[0] === source.id) {
      setSelected([])  // re-click = vue globale
    } else {
      setSelected([source.id])
    }
  }

  const handleContext = (source: Source) => (e: React.MouseEvent) => {
    setMenu({ source, x: e.clientX, y: e.clientY })
  }

  const totalCount = project.sources.length

  return (
    <aside className="w-[240px] shrink-0 border-r border-white/[0.06] bg-[#0f0f0f] flex flex-col">
      <div className="p-2 border-b border-white/[0.06] space-y-2">
        <AddSourceMenu onPickImport={onPickImport} onPickScrape={onPickScrape} onPickManual={onPickManual} />
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06] rounded-md px-2 py-1">
          <Search className="w-3 h-3 text-white/30" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filtrer ${totalCount} sources…`}
            className="bg-transparent text-[11px] text-white/70 placeholder:text-white/25 outline-none flex-1"
          />
          {filter && (
            <button onClick={() => setFilter('')} className="text-white/30 hover:text-white/60">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {Array.from(grouped.entries()).map(([groupKey, sources]) => {
          const label = groupKey === UNGROUPED ? 'Sans groupe' : groupKey
          return (
            <SourceGroup key={groupKey} label={label} count={sources.length}>
              {sources.map((src) => (
                <SourceItem
                  key={src.id}
                  source={src}
                  selected={selectedIds.includes(src.id)}
                  onSelect={handleSelect(src)}
                  onContextMenu={handleContext(src)}
                />
              ))}
            </SourceGroup>
          )
        })}
        {project.sources.length === 0 && (
          <p className="text-[11px] text-white/30 px-2">Aucune source. Ajoutes-en une avec « + Source ».</p>
        )}
      </div>

      {menu && (
        <SourceContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => alert('TODO: prompt rename — branché Phase 7')}
          onResync={() => alert('TODO: re-scrape — branché Phase 7')}
          onMove={() => alert('TODO: move group — branché Phase 7')}
          onDelete={async () => {
            if (!confirm(`Supprimer la source « ${menu.source.name} » ? Les produits sans autre source seront perdus.`)) return
            await removeSource.mutateAsync(menu.source.id)
          }}
        />
      )}
    </aside>
  )
}
```

Note : les `alert('TODO …')` sont temporaires et seront remplacés en Phase 7. Ils existent ici pour permettre un commit fonctionnel partiel avant la Phase 7.

- [ ] **Step 2: Compile**

Run: `npx tsc --noEmit -p .`
Expected: pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/pim/SourcesColumn.tsx
git commit -m "feat(pim): SourcesColumn with search and grouped layout"
```

---

## Phase 5 — Pipeline d'ingestion unifié

### Task 5.1 : `MatchPreviewModal.tsx`

**Files:**
- Create: `src/components/pim/MatchPreviewModal.tsx`

- [ ] **Step 1: Composant**

```tsx
// src/components/pim/MatchPreviewModal.tsx
import { Loader2, Plus, Link2, AlertTriangle, X } from 'lucide-react'
import type { MergePreview } from '@/features/pim/types'

interface Props {
  open: boolean
  preview: MergePreview | null
  loading: boolean
  sourceName: string
  onConfirm: () => void
  onClose: () => void
}

export function MatchPreviewModal({ open, preview, loading, sourceName, onConfirm, onClose }: Props) {
  if (!open) return null

  const stats = preview
    ? {
        new: preview.newMasters.length,
        merged: preview.mergedOnExisting.length,
        dedup: preview.needsDedup.length,
        total: preview.newMasters.length + preview.mergedOnExisting.length + preview.needsDedup.length,
      }
    : { new: 0, merged: 0, dedup: 0, total: 0 }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white/85">
            Aperçu de l'import · {sourceName} <span className="text-white/40">· {stats.total} ligne{stats.total > 1 ? 's' : ''}</span>
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-4 py-4 overflow-y-auto flex-1 space-y-3">
          {loading && (
            <p className="flex items-center gap-2 text-white/60">
              <Loader2 className="w-4 h-4 animate-spin" /> Calcul du matching…
            </p>
          )}
          {!loading && preview && (
            <>
              <Section
                icon={<Plus className="w-3.5 h-3.5 text-emerald-400" />}
                color="emerald"
                title={`${stats.new} nouveau${stats.new > 1 ? 'x produits' : ' produit'}`}
                items={preview.newMasters.slice(0, 8).map((r) => ({
                  primary: stringField(r.snapshot, 'name') ?? `Ligne ${r.rowIndex + 1}`,
                  secondary: r.detectedSku ?? 'sans SKU',
                }))}
                more={preview.newMasters.length - 8}
              />
              <Section
                icon={<Link2 className="w-3.5 h-3.5 text-indigo-400" />}
                color="indigo"
                title={`${stats.merged} mergé${stats.merged > 1 ? 's' : ''} sur existant`}
                items={preview.mergedOnExisting.slice(0, 8).map((m) => ({
                  primary: stringField(m.snapshot, 'name') ?? `Ligne ${m.rowIndex + 1}`,
                  secondary: `→ ${m.targetMasterSku ?? m.targetProductId}`,
                }))}
                more={preview.mergedOnExisting.length - 8}
              />
              <Section
                icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                color="amber"
                title={`${stats.dedup} sans SKU · à dédupliquer`}
                items={preview.needsDedup.slice(0, 8).map((r) => ({
                  primary: stringField(r.snapshot, 'name') ?? `Ligne ${r.rowIndex + 1}`,
                  secondary: 'sera créé comme master synthétique',
                }))}
                more={preview.needsDedup.length - 8}
              />
            </>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[12px] text-white/60 hover:text-white/85">
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || !preview}
            className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 rounded-md text-[12px] text-white"
          >
            Confirmer l'import
          </button>
        </footer>
      </div>
    </div>
  )
}

function stringField(snapshot: Record<string, unknown>, key: string): string | null {
  const v = snapshot[key]
  return typeof v === 'string' ? v : null
}

function Section({
  icon, title, items, more, color,
}: {
  icon: React.ReactNode
  title: string
  items: { primary: string; secondary: string }[]
  more: number
  color: 'emerald' | 'indigo' | 'amber'
}) {
  const tones = {
    emerald: 'bg-emerald-500/5 border-emerald-500/20',
    indigo: 'bg-indigo-500/5 border-indigo-500/20',
    amber: 'bg-amber-500/5 border-amber-500/20',
  }[color]
  if (items.length === 0) return null
  return (
    <div className={`border rounded-md ${tones} p-2.5`}>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/70 mb-2">
        {icon} {title}
      </p>
      <ul className="space-y-0.5 text-[12px] text-white/70">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 truncate">
            <span className="truncate">{it.primary}</span>
            <span className="text-[10px] text-white/40 shrink-0">{it.secondary}</span>
          </li>
        ))}
        {more > 0 && <li className="text-[10px] text-white/30">… et {more} autre{more > 1 ? 's' : ''}</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Compile et commit**

```bash
npx tsc --noEmit -p .
git add src/components/pim/MatchPreviewModal.tsx
git commit -m "feat(pim): MatchPreviewModal with 3-section preview"
```

---

### Task 5.2 : Brancher `ScrapingModal` dans le pipeline matching

**Files:**
- Modify: `src/features/scraping/ScrapingModal.tsx`

- [ ] **Step 1: Examiner le point d'écriture actuel**

Run: `grep -n "setSheets\|appendSheetRows\|mergeSheet" src/features/scraping/ScrapingModal.tsx`

Repérer : `handleImportResult` (~ligne 200), `handleImportEnriched` (~ligne 227), `handleImportCrawl` (~ligne 250). Tous appellent `setSheets()` → c'est ce qu'on remplace.

- [ ] **Step 2: Ajouter le pipeline matching**

Dans `ScrapingModal.tsx`, ajouter en haut :

```tsx
import { useState, useMemo } from 'react'
// …existant…
import { matchRows, applyPreview } from '@/features/pim'
import type { MergePreview, Source } from '@/features/pim/types'
import { useUpsertProducts } from '@/features/pim/useProducts'
import { useUpsertSource } from '@/features/pim/useSources'
import { usePimStore } from '@/stores/pim.store'
import { MatchPreviewModal } from '@/components/pim/MatchPreviewModal'
```

Puis ajouter dans le composant, après les hooks existants :

```tsx
const projectId = usePimStore((s) => s.currentProjectId)
const products = usePimStore((s) => s.products)
const upsertProducts = useUpsertProducts(projectId ?? '')
const upsertSource = useUpsertSource(projectId ?? '')

const [previewOpen, setPreviewOpen] = useState(false)
const [pendingRows, setPendingRows] = useState<Record<string, unknown>[]>([])
const [pendingSource, setPendingSource] = useState<Source | null>(null)

const preview: MergePreview | null = useMemo(() => {
  if (!previewOpen || pendingRows.length === 0) return null
  return matchRows(pendingRows as never, products)
}, [previewOpen, pendingRows, products])

const startPreview = (rows: Record<string, unknown>[], source: Source) => {
  setPendingRows(rows)
  setPendingSource(source)
  setPreviewOpen(true)
}

const confirmIngest = async () => {
  if (!projectId || !pendingSource || !preview) return
  const result = applyPreview(preview, products, pendingSource.id, { now: Date.now() })
  await upsertSource.mutateAsync(pendingSource)
  await upsertProducts.mutateAsync(result.products)
  toast.success(`${result.stats.created} ajoutés · ${result.stats.merged} mergés`)
  setPreviewOpen(false)
  handleClose()
}
```

- [ ] **Step 3: Remplacer les 3 handlers d'import**

Localiser `handleImportResult`, `handleImportEnriched`, `handleImportCrawl`. Remplacer leur corps par :

```tsx
const handleImportResult = () => {
  if (!result) return
  const source: Source = {
    id: `src_${hostname}_${Date.now()}`,
    name: hostname,
    kind: 'scrape',
    url,
    schema: scrapeResultToColumns(result, lastFields),
    productCount: result.rows.length,
    enrichedCount: 0,
    lastSyncedAt: Date.now(),
  }
  startPreview(result.rows as Record<string, unknown>[], source)
}

const handleImportEnriched = () => {
  if (!enrichEntry?.data) return
  const source: Source = {
    id: `src_${hostname}_${Date.now()}`,
    name: hostname,
    kind: 'scrape',
    url,
    schema: [],  // schema dérivé en applyPreview via fields
    productCount: 1,
    enrichedCount: 1,
    lastSyncedAt: Date.now(),
  }
  startPreview([enrichedProductToRow(enrichEntry.data, productTitle)], source)
}

const handleImportCrawl = () => {
  if (crawlPages.length === 0) return
  const source: Source = {
    id: `src_${hostname}_${Date.now()}`,
    name: hostname,
    kind: 'scrape',
    url,
    schema: [],
    productCount: crawlPages.length,
    enrichedCount: 0,
    lastSyncedAt: Date.now(),
  }
  startPreview(crawlPages as Record<string, unknown>[], source)
}
```

Ajouter dans `src/features/scraping/core/scrapeToRows.ts` (nouveau fichier) :

```typescript
// src/features/scraping/core/scrapeToRows.ts
import type { ScrapeResult, ScrapingField } from './scrapeResultToSheet'  // adapte au chemin réel
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import type { ExcelColumn } from '@/features/excel/types'

/** Extrait UNIQUEMENT les colonnes du résultat scrape (sans construire la sheet).
 *  Réutilise la logique d'inférence colonnes de scrapeResultToSheet. */
export function scrapeResultToColumns(
  result: ScrapeResult,
  fields: ScrapingField[],
): ExcelColumn[] {
  const sample = result.rows[0] ?? {}
  return fields.map<ExcelColumn>((f) => ({
    key: f.key,
    label: f.label ?? f.key,
    fieldType: 'text',
    detectedType: typeof sample[f.key] === 'number' ? 'number' : 'text',
    isPrimary: f.key === 'sku' || f.key === 'ean',
    width: 150,
  }))
}

/** Convertit un EnrichedProduct (1 produit) en row plate (1 ligne tableur).
 *  Inverse de enrichedProductToSheet, qui crée une sheet entière. */
export function enrichedProductToRow(
  data: EnrichedProduct,
  title: string,
): Record<string, unknown> {
  return {
    name: title || data.title || 'Sans titre',
    sku: data.sku ?? null,
    ean: data.ean ?? null,
    brand: data.brand ?? null,
    description: data.description ?? null,
    price: data.price ?? null,
    image: data.images?.[0] ?? null,
    external_url: data.sourceUrl ?? null,
    advantages: Array.isArray(data.advantages) ? data.advantages.join(' · ') : null,
    specifications: Array.isArray(data.specifications)
      ? data.specifications.map((s) => `${s.label}: ${s.value}`).join(' · ')
      : null,
  }
}
```

Importer ces deux helpers dans `ScrapingModal.tsx` à la place des fonctions `scrapeResultToSheet` / `enrichedProductToSheet`. **Ne pas supprimer** les originales encore — la migration legacy en Phase 3 peut s'appuyer sur elles. La Task 8.3 fera la suppression finale.

- [ ] **Step 4: Brancher `MatchPreviewModal` dans le JSX**

Avant le `</Dialog>` ou `</div>` racine du return, ajouter :

```tsx
{pendingSource && (
  <MatchPreviewModal
    open={previewOpen}
    preview={preview}
    loading={false}
    sourceName={pendingSource.name}
    onConfirm={confirmIngest}
    onClose={() => setPreviewOpen(false)}
  />
)}
```

- [ ] **Step 5: Compile**

Run: `npx tsc --noEmit -p .`
Expected: pas d'erreur.

- [ ] **Step 6: Test manuel**

Run: `npm run dev`
Vérifier dans le navigateur : ouvrir un projet PIM (après migration), cliquer + Source → Scraper, scraper un produit unique, valider que la MatchPreviewModal s'ouvre avec les bons compteurs.

- [ ] **Step 7: Commit**

```bash
git add src/features/scraping/ScrapingModal.tsx
git commit -m "feat(pim): scraping pipeline routes through matchRows preview"
```

---

### Task 5.2bis : Mode saisie manuelle

**Files:**
- Modify: `src/pages/DataPage.tsx`

- [ ] **Step 1: Handler `handleCreateManual`**

Dans `DataPage.tsx`, ajouter le handler que `SourcesColumn` invoquera via `onPickManual` :

```tsx
import type { Source, Product } from '@/features/pim/types'
import { useUpsertSource } from '@/features/pim/useSources'
import { useUpsertProducts } from '@/features/pim/useProducts'

const projectId = usePimStore((s) => s.currentProjectId) ?? ''
const upsertSource = useUpsertSource(projectId)
const upsertProducts = useUpsertProducts(projectId)
const setOpenProductId = usePimStore((s) => s.setOpenProductId)

const handleCreateManual = async () => {
  if (!projectId) return
  // 1. Récupère ou crée la source 'Manuel'
  const project = usePimStore.getState().projects.find((p) => p.id === projectId)
  let manualSource = project?.sources.find((s) => s.kind === 'manual' && s.name === 'Manuel')
  if (!manualSource) {
    manualSource = {
      id: `src_manual_${Date.now()}`,
      name: 'Manuel',
      kind: 'manual',
      schema: [],
      productCount: 0,
      enrichedCount: 0,
      lastSyncedAt: Date.now(),
    }
    await upsertSource.mutateAsync(manualSource)
  }
  // 2. Crée un produit master vierge — pas de matching (utilisateur saisira tout)
  const now = Date.now()
  const newProduct: Product = {
    _id: `prod_manual_${now}`,
    masterSku: null,
    masterEan: null,
    primarySourceId: manualSource.id,
    fields: { name: { value: 'Nouveau produit', winningSourceId: manualSource.id } },
    sourceLinks: [{ sourceId: manualSource.id, snapshot: { name: 'Nouveau produit' } }],
    taxonomyPath: [],
    needsDedup: false,
    createdAt: now,
    updatedAt: now,
  }
  await upsertProducts.mutateAsync([newProduct])
  // 3. Ouvre la fiche produit en édition
  setOpenProductId(newProduct._id)
}
```

- [ ] **Step 2: Compile et test**

```
npx tsc --noEmit -p .
npm run dev
```

Tester : `+ Source ▾` → `Saisir manuellement` → vérifier qu'une source `Manuel` apparaît avec 1 produit, et que la fiche s'ouvre en édition.

- [ ] **Step 3: Commit**

```bash
git add src/pages/DataPage.tsx
git commit -m "feat(pim): manual entry creates Manuel source and opens blank product sheet"
```

---

### Task 5.3 : Brancher `ExcelImportModal` dans le pipeline matching

**Files:**
- Modify: `src/features/excel/ExcelImportModal.tsx`

- [ ] **Step 1: Imports**

Ajouter en haut de `ExcelImportModal.tsx` :

```tsx
import { matchRows, applyPreview } from '@/features/pim'
import type { Source } from '@/features/pim/types'
import { useUpsertProducts } from '@/features/pim/useProducts'
import { useUpsertSource } from '@/features/pim/useSources'
import { usePimStore } from '@/stores/pim.store'
import { MatchPreviewModal } from '@/components/pim/MatchPreviewModal'
```

- [ ] **Step 2: État & handler**

Reprendre la même structure que Task 5.2 (`startPreview`, `confirmIngest`, `MatchPreviewModal` dans le JSX), avec les rows venant du fichier importé au lieu du scrape.

Le bouton "Importer" actuel ne doit plus appeler `setSheets()` directement mais `startPreview(parsedRows, source)` où :

```tsx
const source: Source = {
  id: `src_import_${file.name}_${Date.now()}`,
  name: file.name,
  kind: 'import',
  schema: detectedColumns,
  productCount: parsedRows.length,
  enrichedCount: 0,
  lastSyncedAt: Date.now(),
}
```

- [ ] **Step 3: Compile et test manuel**

```
npx tsc --noEmit -p .
npm run dev
```

Importer un fichier Excel avec une colonne SKU dans un projet existant → la preview doit afficher les bons compteurs new/merged.

- [ ] **Step 4: Commit**

```bash
git add src/features/excel/ExcelImportModal.tsx
git commit -m "feat(pim): excel import routes through matchRows preview"
```

---

## Phase 6 — Refonte DataPage en 3 colonnes

### Task 6.1 : Layout 3 colonnes (squelette)

**Files:**
- Modify: `src/pages/DataPage.tsx`

- [ ] **Step 1: Faire un backup avant gros refactor**

```bash
cp src/pages/DataPage.tsx src/pages/DataPage.tsx.bak
git add -A && git commit -m "chore: backup DataPage before 3-column refactor"
```

- [ ] **Step 2: Restructurer le return**

Remplacer la structure du `return (...)` par :

```tsx
return (
  <div className={`${embedded ? 'h-full' : 'h-screen'} bg-[#0f0f0f] text-white flex overflow-hidden`}>
    {/* Col 1 : Projets */}
    {showBdd && <ProjectsColumn />}

    {/* Col 2 : Sources */}
    {hasSelectedDb && (
      <SourcesColumn
        onPickImport={() => setImportModalOpen(true)}
        onPickScrape={() => setScrapingOpen(true)}
        onPickManual={handleCreateManual}
      />
    )}

    {/* Col 3 : Vue principale */}
    <main className="flex-1 flex flex-col overflow-hidden">
      <Header />
      <Toolbar />
      <Breadcrumb />
      <div className="flex-1 overflow-hidden">
        <DataTable {...tableProps} />
      </div>
    </main>

    {/* Panneau droit : Champs / Taxonomie / Fiche produit */}
    {showRight && <RightPanel />}

    {/* Modales */}
    <ScrapingModal open={scrapingOpen} onClose={() => setScrapingOpen(false)} />
    <ExcelImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
    <MigrationModal open={migrationModalOpen} onClose={() => setMigrationModalOpen(false)} />
    <UpdatePreviewModal open={updateModalOpen} onClose={() => setUpdateModalOpen(false)} />
  </div>
)
```

(Détailler les sous-composants `ProjectsColumn`, `Header`, `Toolbar`, `Breadcrumb`, `RightPanel` dans les sous-tâches.)

- [ ] **Step 3: Extraire `ProjectsColumn`**

Créer `src/components/pim/ProjectsColumn.tsx` qui contient ce qui était dans le sidebar `BASES DE DONNEES` (le mapping `savedFiles.map(...)` actuel + bouton Créer + bouton Migrer). Lire l'état depuis `usePimStore` et `useProjectsList`.

- [ ] **Step 4: Compile**

Run: `npx tsc --noEmit -p .`
Expected: pas d'erreur.

- [ ] **Step 5: Test visuel**

```
npm run dev
```

Ouvrir un projet, vérifier que les 3 colonnes apparaissent bien et que la sélection de source filtre la table.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DataPage.tsx src/components/pim/ProjectsColumn.tsx
git commit -m "feat(pim): 3-column layout in DataPage"
```

---

### Task 6.2 : Breadcrumb dynamique + chips taxonomiques

**Files:**
- Create: `src/components/pim/Breadcrumb.tsx`
- Modify: `src/pages/DataPage.tsx`

- [ ] **Step 1: Composant**

```tsx
// src/components/pim/Breadcrumb.tsx
import { ChevronRight, X } from 'lucide-react'
import { usePimStore } from '@/stores/pim.store'

export function Breadcrumb() {
  const project = usePimStore((s) => {
    const id = s.currentProjectId
    return id ? s.projects.find((p) => p.id === id) : null
  })
  const selectedSourceIds = usePimStore((s) => s.selectedSourceIds)
  const setSelectedSourceIds = usePimStore((s) => s.setSelectedSourceIds)
  const taxoFilter = usePimStore((s) => s.taxonomyNavFilter)
  const setTaxoFilter = usePimStore((s) => s.setTaxonomyNavFilter)

  if (!project) return null

  const sources = selectedSourceIds
    .map((id) => project.sources.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[]

  const sourcesLabel =
    sources.length === 0 ? null
    : sources.length === 1 ? sources[0]
    : `${sources.length} sources`

  return (
    <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 text-[12px] flex-wrap">
      <span className="text-white/85">{project.name}</span>
      {sourcesLabel && (
        <>
          <ChevronRight className="w-3 h-3 text-white/30" />
          <span className="text-white/60">{sourcesLabel}</span>
          <button
            onClick={() => setSelectedSourceIds([])}
            className="text-white/30 hover:text-white/70"
            title="Retirer le filtre source"
          >
            <X className="w-3 h-3" />
          </button>
        </>
      )}
      {taxoFilter.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-white/30" />
          <span className="text-white/60">{seg}</span>
          {i === taxoFilter.length - 1 && (
            <button
              onClick={() => setTaxoFilter(taxoFilter.slice(0, -1))}
              className="text-white/30 hover:text-white/70"
              title="Remonter d'un niveau"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Brancher dans `DataPage.tsx`**

Importer `Breadcrumb` et l'insérer juste sous le Header dans la col 3.

- [ ] **Step 3: Compile et commit**

```bash
npx tsc --noEmit -p .
git add src/components/pim/Breadcrumb.tsx src/pages/DataPage.tsx
git commit -m "feat(pim): dynamic breadcrumb with source/taxonomy chips"
```

---

### Task 6.3 : `ProductMasterCell` (cellule multi-source)

**Files:**
- Create: `src/components/pim/ProductMasterCell.tsx`
- Modify: `src/features/excel/DataTable.tsx`

- [ ] **Step 1: Composant**

```tsx
// src/components/pim/ProductMasterCell.tsx
import type { Product } from '@/features/pim/types'
import { usePimStore } from '@/stores/pim.store'

interface Props {
  product: Product
  fieldKey: string
}

/** Affiche la valeur d'un champ par-source si elle l'est (price, image, stock, …),
 *  sinon la valeur master. */
export function ProductMasterCell({ product, fieldKey }: Props) {
  const project = usePimStore((s) => {
    const id = s.currentProjectId
    return id ? s.projects.find((p) => p.id === id) : null
  })
  const PER_SOURCE = ['price', 'image', 'stock', 'external_url']

  if (!PER_SOURCE.includes(fieldKey)) {
    const v = product.fields[fieldKey]?.value
    return <span>{v == null ? '—' : String(v)}</span>
  }

  const valuesBySource = product.sourceLinks
    .map((link) => {
      const v = link.snapshot[fieldKey]
      const sourceName = project?.sources.find((s) => s.id === link.sourceId)?.name ?? link.sourceId
      return v != null ? { sourceName, value: String(v) } : null
    })
    .filter((x): x is { sourceName: string; value: string } => x !== null)

  if (valuesBySource.length === 0) return <span>—</span>
  if (valuesBySource.length === 1) {
    return (
      <span title={`source : ${valuesBySource[0].sourceName}`}>
        {valuesBySource[0].value}
      </span>
    )
  }

  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
      {valuesBySource.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <span className="font-medium">{v.value}</span>
          <span className="text-white/40">· {v.sourceName}</span>
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Adapter DataTable au mode PIM**

Dans `src/features/excel/DataTable.tsx`, ajouter une prop optionnelle :

```tsx
import { ProductMasterCell } from '@/components/pim/ProductMasterCell'
import type { Product } from '@/features/pim/types'

interface DataTableProps {
  // …props existantes…
  /** Si fourni, les rows sont interprétées comme des Products PIM (master).
   *  Les colonnes per-source (price/image/stock/external_url) utilisent ProductMasterCell. */
  mode?: 'sheet' | 'pim'
  pimProducts?: Product[]
}
```

Repérer la fonction de rendu de cellule (chercher `row[col.key]` dans le rendu `<td>` ou `<div role="cell">`). Remplacer le rendu de la cellule par :

```tsx
{mode === 'pim' && pimProducts ? (() => {
  const product = pimProducts[rowIndex]
  if (!product) return null
  // Pour les colonnes per-source, ProductMasterCell choisit l'affichage multi-source
  return <ProductMasterCell product={product} fieldKey={col.key} />
})() : (
  // Rendu legacy : valeur brute de row[col.key]
  <span>{row[col.key] == null ? '—' : String(row[col.key])}</span>
)}
```

Dans `DataPage.tsx` (au moment de l'appel `<DataTable {...} />`), passer :

```tsx
<DataTable
  mode="pim"
  pimProducts={filteredProducts}
  rows={filteredProducts.map(productToTableRow)}
  columns={projectColumns}
  /* …autres props… */
/>
```

Avec un helper `productToTableRow(p)` qui crée une row plate à partir de `p.fields` + valeurs per-source pour les autres colonnes (utilisé pour la recherche/tri textuel ; le rendu visuel passera par `ProductMasterCell`) :

```tsx
function productToTableRow(p: Product): Record<string, unknown> {
  const row: Record<string, unknown> = { _id: p._id }
  for (const [k, f] of Object.entries(p.fields)) row[k] = f.value
  // Per-source : prendre la 1ère valeur trouvée (pour tri/recherche, pas pour le rendu)
  for (const link of p.sourceLinks) {
    for (const [k, v] of Object.entries(link.snapshot)) {
      if (!(k in row)) row[k] = v
    }
  }
  return row
}
```

Placer `productToTableRow` dans `src/features/pim/productToTableRow.ts` pour pouvoir l'importer depuis n'importe où.

- [ ] **Step 3: Compile, test et commit**

```
npx tsc --noEmit -p .
npm run dev
git add src/components/pim/ProductMasterCell.tsx src/features/excel/DataTable.tsx
git commit -m "feat(pim): per-source cell rendering for price/image/stock/url"
```

---

### Task 6.4 : Onglet « Sources » dans `ProductSheet`

**Files:**
- Modify: `src/features/excel/ProductSheet.tsx`

- [ ] **Step 1: Détecter mode PIM et afficher l'onglet**

Dans `ProductSheet.tsx`, accepter une prop `product?: Product`. Si présent, ajouter un onglet `Sources` qui rend :

```tsx
{product && (
  <div className="space-y-2">
    {product.sourceLinks.map((link) => {
      const source = project?.sources.find((s) => s.id === link.sourceId)
      return (
        <div key={link.sourceId} className="border border-white/[0.06] rounded-md p-3">
          <p className="text-[11px] uppercase tracking-wide text-white/40 mb-2">{source?.name ?? link.sourceId}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            {Object.entries(link.snapshot).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-white/40 truncate">{k}</dt>
                <dd className="text-white/80 truncate">{v == null ? '—' : String(v)}</dd>
              </div>
            ))}
          </dl>
          {link.externalUrl && (
            <a href={link.externalUrl} target="_blank" rel="noreferrer" className="text-indigo-300 text-[11px] mt-2 block">
              Voir sur la source ↗
            </a>
          )}
        </div>
      )
    })}
  </div>
)}
```

- [ ] **Step 2: Compile et commit**

```
npx tsc --noEmit -p .
git add src/features/excel/ProductSheet.tsx
git commit -m "feat(pim): Sources tab in ProductSheet showing per-source snapshots"
```

---

### Task 6.5 : Suppression onglets sheets horizontaux

**Files:**
- Modify: `src/pages/DataPage.tsx`

- [ ] **Step 1: Retirer le rendu des onglets**

Dans `DataPage.tsx`, supprimer la section `{sheets.length > 1 ? (...) : (...)}` du Header (ligne ~340 avant refactor). Le breadcrumb (Task 6.2) la remplace.

- [ ] **Step 2: Retirer les imports inutilisés**

Run: `npm run lint` et corriger les unused imports (`X`, `setActiveSheet`, etc., devenus inutiles).

- [ ] **Step 3: Compile, test et commit**

```
npx tsc --noEmit -p .
npm run dev    # vérifier qu'il n'y a plus d'onglets en haut
git add src/pages/DataPage.tsx
git commit -m "feat(pim): remove horizontal sheet tabs (replaced by SourcesColumn)"
```

---

## Phase 7 — Re-scrape & dédup manuelle

### Task 7.1 : Re-scrape via menu source

**Files:**
- Modify: `src/components/pim/SourcesColumn.tsx`
- Modify: `src/features/scraping/ScrapingModal.tsx`

- [ ] **Step 1: Brancher `onResync` du `SourceContextMenu`**

Dans `SourcesColumn.tsx`, remplacer le `alert('TODO …')` du `onResync` par l'ouverture de `ScrapingModal` pré-remplie avec `source.url`. Ajouter une prop dédiée :

```tsx
const [resyncSource, setResyncSource] = useState<Source | null>(null)
// …
onResync={() => setResyncSource(menu.source)}
```

Et passer `resyncSource` à `ScrapingModal` en prop, qui pré-remplit l'URL et marque le mode "re-scrape" (qui réutilisera la même `source.id` au lieu d'en créer une nouvelle).

- [ ] **Step 2: Mode re-scrape dans `ScrapingModal`**

Dans `ScrapingModal.tsx`, ajouter une prop `resyncSource?: Source`. Si présente :
- pré-remplit `url` avec `resyncSource.url`
- au moment de l'ingest, ne crée pas une nouvelle source mais réutilise `resyncSource.id` et passe-la inchangée à `startPreview`

- [ ] **Step 3: Compile et commit**

```
npx tsc --noEmit -p .
git add src/components/pim/SourcesColumn.tsx src/features/scraping/ScrapingModal.tsx
git commit -m "feat(pim): re-scrape via source context menu reuses sourceId"
```

---

### Task 7.2 : Dédup manuelle (popover)

**Files:**
- Create: `src/components/pim/DedupPopover.tsx`
- Modify: `src/features/excel/DataTable.tsx`

- [ ] **Step 1: Composant popover**

```tsx
// src/components/pim/DedupPopover.tsx
import { useState, useMemo } from 'react'
import type { Product } from '@/features/pim/types'
import { usePimStore } from '@/stores/pim.store'
import { useUpsertProducts, useDeleteProducts } from '@/features/pim/useProducts'

interface Props {
  product: Product
  onClose: () => void
}

export function DedupPopover({ product, onClose }: Props) {
  const projectId = usePimStore((s) => s.currentProjectId) ?? ''
  const products = usePimStore((s) => s.products)
  const upsertProducts = useUpsertProducts(projectId)
  const deleteProducts = useDeleteProducts(projectId)
  const [filter, setFilter] = useState('')

  const candidates = useMemo(() => {
    const q = filter.toLowerCase()
    return products.filter(
      (p) =>
        p._id !== product._id &&
        !p.needsDedup &&
        p.taxonomyPath.join('/') === product.taxonomyPath.join('/') &&
        (!q || JSON.stringify(p.fields).toLowerCase().includes(q)),
    ).slice(0, 20)
  }, [products, product, filter])

  const merge = async (target: Product) => {
    const newLinks = [...target.sourceLinks, ...product.sourceLinks]
    await upsertProducts.mutateAsync([{ ...target, sourceLinks: newLinks, updatedAt: Date.now() }])
    await deleteProducts.mutateAsync([product._id])
    onClose()
  }

  const ignore = async () => {
    await upsertProducts.mutateAsync([{ ...product, needsDedup: false, updatedAt: Date.now() }])
    onClose()
  }

  return (
    <div className="absolute z-30 bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl w-[400px] p-3">
      <p className="text-[12px] text-white/85 mb-2">Fusionner « {String(product.fields.name?.value ?? product._id)} » avec :</p>
      <input
        autoFocus
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Rechercher un produit cible…"
        className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md px-2 py-1 text-[12px] text-white/70 mb-2"
      />
      <ul className="max-h-[200px] overflow-y-auto space-y-0.5 text-[12px]">
        {candidates.map((c) => (
          <li key={c._id}>
            <button
              onClick={() => merge(c)}
              className="w-full text-left px-2 py-1 hover:bg-white/[0.06] rounded text-white/70 hover:text-white"
            >
              {String(c.fields.name?.value ?? c._id)}
              <span className="text-[10px] text-white/30 ml-2">{c.masterSku ?? 'sans SKU'}</span>
            </button>
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="text-[11px] text-white/40 px-2">Aucun candidat trouvé.</li>
        )}
      </ul>
      <div className="flex justify-between mt-2 pt-2 border-t border-white/10">
        <button onClick={ignore} className="text-[11px] text-white/50 hover:text-white/85">
          Ignorer (le garder autonome)
        </button>
        <button onClick={onClose} className="text-[11px] text-white/50 hover:text-white/85">
          Annuler
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Brancher dans DataTable**

Sur les rows dont `product.needsDedup === true`, afficher un badge cliquable (« Fusionner… ») qui ouvre `DedupPopover` au-dessus de la row.

- [ ] **Step 3: Compile, test et commit**

```
npx tsc --noEmit -p .
npm run dev   # vérifier qu'un produit needsDedup affiche le badge et le popover
git add src/components/pim/DedupPopover.tsx src/features/excel/DataTable.tsx
git commit -m "feat(pim): manual dedup popover for needsDedup products"
```

---

## Phase 8 — Tests d'intégration & critères d'acceptation

### Task 8.1 : Tests d'intégration `SourcesColumn`

**Files:**
- Create: `src/components/pim/SourcesColumn.test.tsx`

- [ ] **Step 1: Test setup avec store factice**

```tsx
// src/components/pim/SourcesColumn.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SourcesColumn } from './SourcesColumn'
import { usePimStore } from '@/stores/pim.store'
import type { Project, Source } from '@/features/pim/types'

const makeSource = (id: string, name: string, group?: string): Source => ({
  id, name, kind: 'scrape', schema: [], productCount: 10, enrichedCount: 2, group,
})

const project: Project = {
  id: 'p1', name: 'Test', path: [], taxonomy: [],
  sources: [
    makeSource('s1', 'nicoll.fr', 'Fournisseurs'),
    makeSource('s2', 'milwaukee.eu', 'Fournisseurs'),
    makeSource('s3', 'leroy.fr', 'Distributeurs'),
  ],
  createdAt: 0, updatedAt: 0,
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

beforeEach(() => {
  usePimStore.setState({ projects: [project], currentProjectId: 'p1', selectedSourceIds: [] })
})

describe('SourcesColumn', () => {
  it('rend les sources groupées', () => {
    render(<SourcesColumn onPickImport={() => {}} onPickScrape={() => {}} onPickManual={() => {}} />, { wrapper })
    expect(screen.getByText('nicoll.fr')).toBeInTheDocument()
    expect(screen.getByText('Fournisseurs')).toBeInTheDocument()
    expect(screen.getByText('Distributeurs')).toBeInTheDocument()
  })

  it('filtre par recherche', () => {
    render(<SourcesColumn onPickImport={() => {}} onPickScrape={() => {}} onPickManual={() => {}} />, { wrapper })
    const input = screen.getByPlaceholderText(/Filtrer 3 sources/)
    fireEvent.change(input, { target: { value: 'milwaukee' } })
    expect(screen.queryByText('nicoll.fr')).not.toBeInTheDocument()
    expect(screen.getByText('milwaukee.eu')).toBeInTheDocument()
  })

  it('click sélectionne et met selectedSourceIds = [id]', () => {
    render(<SourcesColumn onPickImport={() => {}} onPickScrape={() => {}} onPickManual={() => {}} />, { wrapper })
    fireEvent.click(screen.getByText('nicoll.fr'))
    expect(usePimStore.getState().selectedSourceIds).toEqual(['s1'])
  })

  it('cmd+click toggle multi-sélection', () => {
    render(<SourcesColumn onPickImport={() => {}} onPickScrape={() => {}} onPickManual={() => {}} />, { wrapper })
    fireEvent.click(screen.getByText('nicoll.fr'))
    fireEvent.click(screen.getByText('milwaukee.eu'), { metaKey: true })
    expect(usePimStore.getState().selectedSourceIds).toEqual(['s1', 's2'])
  })
})
```

- [ ] **Step 2: Run et faire passer**

```
npx vitest run src/components/pim/SourcesColumn.test.tsx
```

Expected: 4 tests passants. Si le test 4 échoue parce que la sélection a été remplacée plutôt que toggled, vérifier la logique de `handleSelect` (cmd+click doit appeler `toggleSelected`).

- [ ] **Step 3: Commit**

```bash
git add src/components/pim/SourcesColumn.test.tsx
git commit -m "test(pim): SourcesColumn rendering, filter, selection"
```

---

### Task 8.2 : Smoke test golden path

**Files:** (test manuel, pas de fichier)

- [ ] **Step 1: Lancer dev**

Run: `npm run dev`

- [ ] **Step 2: Exécuter le golden path**

Suivre dans le navigateur :

1. Créer un projet vide via « + Nouveau »
2. Sélectionner ce projet → col 2 vide
3. `+ Source ▾` → `Scraper` → `https://www.nicoll.fr/produit/X` → Produit unique → résultat → MatchPreviewModal `1 nouveau · 0 mergés` → Confirmer
4. Vérifier la source apparaît en col 2 avec `1` produit
5. `+ Source ▾` → `Scraper` → `https://fr.milwaukeetool.eu/catalogue` → Liste → MatchPreviewModal `N nouveaux · 0 mergés` → Confirmer
6. Cliquer la source nicoll.fr → table montre 1 produit
7. Cmd-click la source milwaukee → table montre N+1 produits
8. Click droit nicoll.fr → `Mettre à jour` → MatchPreviewModal `0 nouveaux · 1 mergé` (re-scrape même URL)
9. Éditer manuellement le nom d'un produit dans la table → fermer → re-scraper la source → vérifier que le nom édité persiste (champ flag overridden)
10. Click droit milwaukee → `Supprimer la source` → confirm → produits associés disparaissent (sauf ceux mergés sur d'autres sources)

- [ ] **Step 3: Documenter les bugs trouvés**

Lister tout problème rencontré dans `docs/superpowers/specs/2026-04-30-pim-architecture-design.md` section « Bugs golden path ». Si critique, créer une task corrective ; sinon ouvrir une issue/TODO.

- [ ] **Step 4: Commit du log si bugs trouvés**

```bash
git add docs/superpowers/specs/2026-04-30-pim-architecture-design.md
git commit -m "test(pim): golden path manual run results"
```

---

### Task 8.3 : Suppression du legacy

**Files:**
- Delete: `src/stores/excel.store.ts`
- Delete: `src/features/excel/useExcelFirebase.ts`
- Modify: tout fichier qui les importait encore

- [ ] **Step 1: Vérifier que personne n'utilise plus `excel.store.ts`**

Run: `grep -rn "from '@/stores/excel.store'\|excel.store" src/ --include='*.ts' --include='*.tsx'`
Expected: aucun résultat (sinon migrer ces consommateurs vers `pim.store`).

- [ ] **Step 2: Vérifier `useExcelFirebase`**

Run: `grep -rn "useExcelFirebase" src/ --include='*.ts' --include='*.tsx'`
Expected: aucun résultat.

- [ ] **Step 3: Supprimer**

```bash
git rm src/stores/excel.store.ts src/features/excel/useExcelFirebase.ts
```

- [ ] **Step 4: Compile et commit**

```
npx tsc --noEmit -p .
git commit -m "chore(pim): remove legacy excel.store and useExcelFirebase"
```

---

### Task 8.4 : Critères d'acceptation finaux

- [ ] **Step 1: Type-check + tests**

```
npx tsc --noEmit -p .
npx vitest run
```

Expected: 0 erreur TS, 100% tests verts.

- [ ] **Step 2: Lint**

```
npm run lint
```

Expected: 0 warning critique.

- [ ] **Step 3: Build prod**

```
npm run build
```

Expected: build OK. Comparer la taille du `dist/` au build avant Phase 1 (`du -sh dist/`). Acceptable : +50 KB max.

- [ ] **Step 4: Mesure perf col 2 à 500 sources**

Dans le navigateur, créer un projet factice avec 500 sources via la console JS :

```js
// Console DevTools, après login + sélection projet
const store = window.__PIM_STORE__ || /* récupérer la ref ailleurs */
const fakes = Array.from({ length: 500 }, (_, i) => ({
  id: `fake_${i}`, name: `source-${i}.fake`, kind: 'scrape',
  schema: [], productCount: i, enrichedCount: 0,
}))
// usePimStore.getState().upsertSource(currentId, ...) — boucler
```

Vérifier dans Chrome DevTools → Performance → enregistrer un scroll dans la col 2. Cible : 60 fps soutenu, pas de frame > 16 ms.

Si la perf n'est pas atteinte : ajouter `react-window` à `SourcesColumn` (passe la liste flat dans `FixedSizeList`).

- [ ] **Step 5: Vérifier critères de la spec**

Cocher dans le spec :
- ☑ Aucune perte de données après migration
- ☑ Aucune écriture qui ne passe pas par la préview de matching (sauf saisie manuelle)
- ☑ Re-scrape ne casse jamais un champ flag `overridden`
- ☑ Col 2 fluide à 500 sources
- ☑ Pas de régression : taxonomie, enrichissement IA, export XLSX, filtres IA/non-IA, ProductSheet
- ☑ Toutes les BDD legacy migrables sans intervention manuelle (sauf `needsDedup` annoncée)
- ☑ Type-check + tests verts ; build prod < +50 KB

- [ ] **Step 6: Commit final**

```bash
git add docs/superpowers/specs/2026-04-30-pim-architecture-design.md
git commit -m "feat(pim): acceptance criteria validated, PIM architecture complete"
```

---

## Récap commits attendus

```
1.1  feat(pim): add Project/Source/Product types
1.2  feat(pim): normalizeSku with EAN priority and TDD coverage
1.3  feat(pim): matchRows preview with intra-batch dedup
1.4  feat(pim): mergeStrategy with override-respecting field merge
2.1  feat(pim): zustand store for projects/products/sources
2.2  feat(pim): firestore CRUD with sub-collection products
2.3  feat(pim): React Query hooks for projects/products/sources
3.1  feat(pim): legacy BDD migration with cross-sheet SKU merging
3.2  feat(pim): migration modal with dry-run preview
4.1  feat(pim): SourceItem row with kind icon and counts
4.2  feat(pim): SourceGroup collapsible header
4.3  feat(pim): AddSourceMenu dropdown with 3 ingestion modes
4.4  feat(pim): SourceContextMenu with rename/resync/move/delete
4.5  feat(pim): SourcesColumn with search and grouped layout
5.1  feat(pim): MatchPreviewModal with 3-section preview
5.2     feat(pim): scraping pipeline routes through matchRows preview
5.2bis  feat(pim): manual entry creates Manuel source and opens blank product sheet
5.3     feat(pim): excel import routes through matchRows preview
6.1  feat(pim): 3-column layout in DataPage
6.2  feat(pim): dynamic breadcrumb with source/taxonomy chips
6.3  feat(pim): per-source cell rendering for price/image/stock/url
6.4  feat(pim): Sources tab in ProductSheet showing per-source snapshots
6.5  feat(pim): remove horizontal sheet tabs (replaced by SourcesColumn)
7.1  feat(pim): re-scrape via source context menu reuses sourceId
7.2  feat(pim): manual dedup popover for needsDedup products
8.1  test(pim): SourcesColumn rendering, filter, selection
8.3  chore(pim): remove legacy excel.store and useExcelFirebase
8.4  feat(pim): acceptance criteria validated, PIM architecture complete
```

26 commits sur ~25 tasks. À la fin de l'exécution, l'écran « Données » est devenu un PIM 3 colonnes avec auto-merge SKU, et tous les imports / scrapes passent par la même preview unifiée.
