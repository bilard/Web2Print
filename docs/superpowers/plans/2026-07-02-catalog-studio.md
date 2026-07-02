# Module « Catalogue studio » — Plan d'implémentation V1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Module de création de catalogue produit multi-page piloté par un prompt global : sélection PIM → arbre Univers/Famille/Sous-famille → plan IA (`catalog.plan`) → pages HTML/CSS (couverture, sommaire, ouvertures d'univers, grilles produits avec header/footer) → export PDF écran + print pro.

**Architecture:** Moteur pur (`catalogTree.ts` + `catalogEngine.ts`, testés Vitest) qui transforme lignes de merge + plan en descripteurs de pages ; rendu React HTML/CSS data-driven (pattern module promo) ; wizard 5 étapes plein écran sur `/catalog/:id` ; persistance `users/{uid}/catalogs`. Spec : `docs/superpowers/specs/2026-07-02-catalog-studio-design.md`.

**Tech Stack:** React 18, TypeScript strict, Zustand v4 (persist sessionStorage), Zod, Firestore, html2canvas + jsPDF (déjà en deps), `generateJson` (llmRouter), Nano Banana (`useImageGeneration`).

## Global Constraints

- Types : **`npx tsc -b`** (jamais `tsc --noEmit` seul — project references).
- Composants : `PascalCase.tsx`, **max 150 lignes**, pas de logique métier dans l'UI, props typées (pas d'`any`).
- Hooks `useCamelCase.ts`, stores `camelCase.store.ts`.
- Théming par tokens : `bg-background`/`bg-surface`/`bg-surface-2`/`bg-well`, `white` = avant-plan thémable, `text-[#fff]` = blanc vrai. Les pages du catalogue elles-mêmes sont un rendu print (couleurs pilotées par le thème du plan, pas par le thème UI).
- Ne jamais modifier `src/components/ui/**`, `src/lib/firebase/config.ts`, `public/fonts/`.
- Firestore : `stripUndefined` à la frontière (réutiliser `src/features/retail-promo/stripUndefined.ts`), `serverTimestamp` hors strip.
- knip : ne pas exporter un symbole utilisé seulement dans son fichier.
- Tout en français (UI, commentaires, commits).
- Commits fréquents sur `master` (pas de worktree — préférence utilisateur).

## Décisions de conception (précisions vs spec)

- **Rupture de page à chaque nœud feuille** (sous-famille, ou famille sans sous-familles) : chaque page produits appartient à UN nœud → le header breadcrumb est toujours exact. « Les familles s'enchaînent » = pas de page d'ouverture aux niveaux 2-3 (ouverture réservée aux univers).
- **Réorganisation de l'arbre v1 = boutons ↑/↓ + renommage inline + déplacement produit par select** (pas de dnd — déterministe, plus simple, testable). La fusion de nœuds = renommer deux nœuds frères au même libellé (le builder regroupe par libellé).
- **Fond perdu v1** : la page est capturée au format rogné ; le PDF print ajoute une marge de fond perdu remplie avec `theme.pageBg` + traits de coupe. (Images plein-bord jusqu'au bleed = phase ultérieure.)
- **Vedette = pleine page** (une page grille 1 par produit vedette).

## Structure des fichiers

```
src/features/catalog/
  catalogTypes.ts        — types + constantes (formats, grilles)
  catalogTree.ts         — guessLevelKeys, buildCatalogTree, flattenTree, TreeEdits
  catalogTree.test.ts
  catalogEngine.ts       — paginateCatalog (pur, 2 passes)
  catalogEngine.test.ts
  catalogPlan.ts         — schéma Zod + sanitizeCatalogPlan + defaultCatalogPlan + generateCatalogPlan
  catalogPlan.test.ts
  catalogsApi.ts         — CRUD users/{uid}/catalogs
  catalogTemplatesApi.ts — CRUD users/{uid}/catalogTemplates
  cropMarks.ts           — drawCropMarks (pur)
  cropMarks.test.ts
  useCatalogExport.ts    — pages HTML → PDF (écran/print)
  CatalogHome.tsx        — liste + création (section Dashboard)
  components/
    CatalogStepsNav.tsx
    pages/
      catalogCss.ts      — CATALOG_CSS + PX_PER_MM + ensureCatalogFonts + RenderCtx
      CatalogHeader.tsx / CatalogFooter.tsx / ProductCell.tsx
      CoverPage.tsx / TocPage.tsx / OpenerPage.tsx / ProductGridPage.tsx
      CatalogPageView.tsx
    steps/
      StepSource.tsx / StepStructure.tsx / StepPrompt.tsx / StepPreview.tsx / StepExport.tsx
src/stores/catalog.store.ts
src/pages/CatalogBuilderPage.tsx
Modifs : src/features/ai/llmRouter.ts, src/features/navigation/modules.ts,
         src/features/access/permissions.ts, src/app/router.tsx,
         src/pages/DashboardPage.tsx, firestore.rules
```

---

### Task 1 : Types + arbre taxonomique (`catalogTypes.ts`, `catalogTree.ts`)

**Files:**
- Create: `src/features/catalog/catalogTypes.ts`
- Create: `src/features/catalog/catalogTree.ts`
- Test: `src/features/catalog/catalogTree.test.ts`

**Interfaces:**
- Consumes: `MergeColumn`, `MergeRow` (`@/stores/merge.store`), `getRowValue` (`@/features/merge/mergeEngine`).
- Produces: tous les types du module + `guessLevelKeys(columns): LevelKeys`, `buildCatalogTree(rows, columns, keys, edits?): CatalogTreeNode[]`, `flattenTree(tree): CatalogTreeNode[]`, `EMPTY_TREE_EDITS`.

- [ ] **Step 1 : Écrire `catalogTypes.ts`** (types seuls, pas de test dédié — vérifiés par les tests des tâches 1-3)

```ts
// src/features/catalog/catalogTypes.ts
// Types du module Catalogue studio. Le moteur (catalogTree/catalogEngine) est pur :
// il ne dépend que de ces types + MergeRow/MergeColumn.
import type { DataSourceRef } from '@/stores/merge.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'

/** Densités de grille autorisées (produits par page). */
export const CATALOG_GRIDS = [1, 2, 3, 4, 6, 8] as const
export type CatalogGrid = (typeof CATALOG_GRIDS)[number]

export interface CatalogFormat { widthMm: number; heightMm: number }

export const CATALOG_FORMAT_PRESETS: { id: string; label: string; format: CatalogFormat }[] = [
  { id: 'a4-portrait', label: 'A4 portrait', format: { widthMm: 210, heightMm: 297 } },
  { id: 'a4-paysage', label: 'A4 paysage', format: { widthMm: 297, heightMm: 210 } },
  { id: 'a5-portrait', label: 'A5 portrait', format: { widthMm: 148, heightMm: 210 } },
  { id: 'carre', label: 'Carré 21 cm', format: { widthMm: 210, heightMm: 210 } },
]

export interface CatalogTreeNode {
  /** Slug déterministe du chemin (ex. 'outillage/perceuses'). */
  id: string
  label: string
  /** 1 = univers, 2 = famille, 3 = sous-famille. */
  level: 1 | 2 | 3
  children: CatalogTreeNode[]
  /** _id des lignes rattachées à CE nœud (pas aux descendants). */
  productIds: string[]
}

export interface CatalogSectionPlan {
  nodeId: string
  productsPerPage: CatalogGrid
  /** Produits vedette : une pleine page chacun. */
  featuredIds: string[]
}

export interface CatalogTheme {
  accent: string
  pageBg: string
  ink: string
  headerBg: string
  headerInk: string
  fontHeading: string
  fontBody: string
}

export interface CatalogPlan {
  theme: CatalogTheme
  sections: CatalogSectionPlan[]
  cover: { title: string; subtitle: string; baseline: string; imagePrompt: string }
  backCover: { title: string; text: string }
  tocTitle: string
}

export interface TocEntry { nodeId: string; label: string; level: 1 | 2 | 3; pageNumber: number }
export interface ProductSlot { rowId: string; featured: boolean }

export type CatalogPageDescriptor =
  | { kind: 'cover'; pageNumber: number }
  | { kind: 'toc'; pageNumber: number; entries: TocEntry[] }
  | { kind: 'opener'; pageNumber: number; nodeId: string; label: string }
  | { kind: 'products'; pageNumber: number; nodeId: string; breadcrumb: string[]; grid: CatalogGrid; slots: ProductSlot[] }
  | { kind: 'back-cover'; pageNumber: number }

/** Colonnes mappées sur les 3 niveaux taxonomiques. */
export interface LevelKeys { univers?: string; famille?: string; sousFamille?: string }

/** Édits utilisateur de l'arbre, appliqués AVANT le regroupement (déterministe). */
export interface TreeEdits {
  /** `${level}:${labelOrigine}` → nouveau libellé. Deux libellés identiques au même parent fusionnent. */
  renames: Record<string, string>
  /** id de nœud parent ('' = racine) → ids enfants dans l'ordre voulu. */
  order: Record<string, string[]>
  /** rowId → chemin de labels cible (déplacement manuel d'un produit). */
  moves: Record<string, string[]>
}

/** Document Firestore users/{uid}/catalogs/{id}. Les lignes ne sont PAS persistées (rechargées via sourceRef). */
export interface CatalogDoc {
  id: string
  name: string
  sourceRef: DataSourceRef | null
  selectedRowIds: string[]
  levelKeys: LevelKeys
  treeEdits: TreeEdits
  prompt: string
  plan: CatalogPlan | null
  fieldMap: Partial<Record<PromoFieldKey, string>>
  format: CatalogFormat
  coverImageUrl: string | null
  backCoverImageUrl: string | null
}
```

- [ ] **Step 2 : Écrire les tests de `catalogTree.ts` (échec attendu)**

```ts
// src/features/catalog/catalogTree.test.ts
import { describe, expect, it } from 'vitest'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import { EMPTY_TREE_EDITS, buildCatalogTree, flattenTree, guessLevelKeys } from './catalogTree'

const columns: MergeColumn[] = [
  { key: 'univers', label: 'Univers', fieldType: 'text' },
  { key: 'fam', label: 'Famille', fieldType: 'text' },
  { key: 'sfam', label: 'Sous-famille', fieldType: 'text' },
  { key: 'name', label: 'Nom', fieldType: 'text' },
]
const row = (id: string, u: string, f = '', sf = ''): MergeRow => ({ _id: id, univers: u, fam: f, sfam: sf })

describe('guessLevelKeys', () => {
  it('devine les 3 niveaux sur les libellés FR', () => {
    expect(guessLevelKeys(columns)).toEqual({ univers: 'univers', famille: 'fam', sousFamille: 'sfam' })
  })
  it('rend un objet vide si rien ne matche', () => {
    expect(guessLevelKeys([{ key: 'x', label: 'Nom', fieldType: 'text' }])).toEqual({})
  })
})

describe('buildCatalogTree', () => {
  const keys = { univers: 'univers', famille: 'fam', sousFamille: 'sfam' }

  it('regroupe par chemin, ordre de première apparition', () => {
    const rows = [row('1', 'Outillage', 'Perceuses'), row('2', 'Jardin'), row('3', 'Outillage', 'Perceuses'), row('4', 'Outillage', 'Scies')]
    const tree = buildCatalogTree(rows, columns, keys, EMPTY_TREE_EDITS)
    expect(tree.map((n) => n.label)).toEqual(['Outillage', 'Jardin'])
    expect(tree[0].children.map((n) => n.label)).toEqual(['Perceuses', 'Scies'])
    expect(tree[0].children[0].productIds).toEqual(['1', '3'])
    expect(tree[1].productIds).toEqual(['2']) // pas de famille → rattaché à l'univers
  })

  it('produit sans aucune valeur taxo → nœud « Autres »', () => {
    const tree = buildCatalogTree([row('1', '')], columns, keys, EMPTY_TREE_EDITS)
    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('Autres')
    expect(tree[0].productIds).toEqual(['1'])
  })

  it('aucune colonne mappée → nœud unique « Produits »', () => {
    const tree = buildCatalogTree([row('1', 'X')], columns, {}, EMPTY_TREE_EDITS)
    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('Produits')
    expect(tree[0].productIds).toEqual(['1'])
  })

  it('renommage fusionne deux nœuds frères', () => {
    const rows = [row('1', 'Outillage'), row('2', 'Outils')]
    const tree = buildCatalogTree(rows, columns, keys, { ...EMPTY_TREE_EDITS, renames: { '1:Outils': 'Outillage' } })
    expect(tree).toHaveLength(1)
    expect(tree[0].productIds).toEqual(['1', '2'])
  })

  it('moves déplace un produit vers un autre chemin', () => {
    const rows = [row('1', 'Outillage', 'Perceuses'), row('2', 'Jardin')]
    const tree = buildCatalogTree(rows, columns, keys, { ...EMPTY_TREE_EDITS, moves: { '2': ['Outillage', 'Perceuses'] } })
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0].productIds).toEqual(['1', '2'])
  })

  it('order réordonne les enfants, inconnus après', () => {
    const rows = [row('1', 'A'), row('2', 'B'), row('3', 'C')]
    const idB = buildCatalogTree([row('2', 'B')], columns, keys, EMPTY_TREE_EDITS)[0].id
    const tree = buildCatalogTree(rows, columns, keys, { ...EMPTY_TREE_EDITS, order: { '': [idB] } })
    expect(tree.map((n) => n.label)).toEqual(['B', 'A', 'C'])
  })

  it('flattenTree parcourt en profondeur', () => {
    const rows = [row('1', 'Outillage', 'Perceuses', 'Visseuses'), row('2', 'Jardin')]
    const flat = flattenTree(buildCatalogTree(rows, columns, keys, EMPTY_TREE_EDITS))
    expect(flat.map((n) => `${n.level}:${n.label}`)).toEqual(['1:Outillage', '2:Perceuses', '3:Visseuses', '1:Jardin'])
  })
})
```

- [ ] **Step 3 : Vérifier l'échec** — Run: `npx vitest run src/features/catalog/catalogTree.test.ts` → FAIL (module inexistant).

- [ ] **Step 4 : Implémenter `catalogTree.ts`**

```ts
// src/features/catalog/catalogTree.ts
// Construction déterministe de l'arbre Univers/Famille/Sous-famille depuis les
// lignes de merge. Les édits utilisateur (renames/order/moves) s'appliquent AVANT
// le regroupement : la fusion de nœuds = deux libellés identiques au même parent.
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import { getRowValue } from '@/features/merge/mergeEngine'
import type { CatalogTreeNode, LevelKeys, TreeEdits } from './catalogTypes'

export const EMPTY_TREE_EDITS: TreeEdits = { renames: {}, order: {}, moves: {} }

const LEVEL_GUESS: Record<keyof LevelKeys, string[]> = {
  univers: ['univers', 'rayon', 'department'],
  famille: ['famille', 'catégorie', 'categorie', 'category'],
  sousFamille: ['sous-famille', 'sous famille', 'sous-catégorie', 'sous-categorie', 'subcategory', 'sub-category'],
}

/** Devine les colonnes des 3 niveaux (même logique d'alias que promoMapping). */
export function guessLevelKeys(columns: MergeColumn[]): LevelKeys {
  const norm = (s: string) => s.toLowerCase().trim()
  const find = (needles: string[]) => {
    for (const n of needles) {
      const exact = columns.find((c) => norm(c.label) === n || norm(c.key) === n)
      if (exact) return exact.key
    }
    for (const n of needles) {
      const partial = columns.find((c) => norm(c.label).includes(n))
      if (partial) return partial.key
    }
    return undefined
  }
  const out: LevelKeys = {}
  const univers = find(LEVEL_GUESS.univers)
  const famille = find(LEVEL_GUESS.famille)
  const sousFamille = find(LEVEL_GUESS.sousFamille)
  if (univers) out.univers = univers
  if (famille && famille !== univers) out.famille = famille
  if (sousFamille && sousFamille !== famille && sousFamille !== univers) out.sousFamille = sousFamille
  return out
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'
}

function pathOf(row: MergeRow, columns: MergeColumn[], keys: LevelKeys, edits: TreeEdits): string[] {
  const moved = edits.moves[row._id]
  const raw = moved ?? ([keys.univers, keys.famille, keys.sousFamille] as const)
    .map((k) => (k ? String(getRowValue(row, k, columns) ?? '').trim() : ''))
  // Tronque au premier niveau vide (un produit sans sous-famille s'arrête à la famille).
  const path: string[] = []
  for (const v of raw) { if (!v) break; path.push(v) }
  const renamed = path.map((label, i) => edits.renames[`${i + 1}:${label}`] ?? label)
  if (renamed.length === 0) return [keys.univers || keys.famille || keys.sousFamille ? 'Autres' : 'Produits']
  return renamed
}

/** Regroupe les lignes en arbre (3 niveaux max), ordre de première apparition puis `edits.order`. */
export function buildCatalogTree(rows: MergeRow[], columns: MergeColumn[], keys: LevelKeys, edits: TreeEdits = EMPTY_TREE_EDITS): CatalogTreeNode[] {
  const roots: CatalogTreeNode[] = []
  const byId = new Map<string, CatalogTreeNode>()
  for (const row of rows) {
    const path = pathOf(row, columns, keys, edits).slice(0, 3)
    let siblings = roots
    let node: CatalogTreeNode | undefined
    for (let i = 0; i < path.length; i++) {
      const id = path.slice(0, i + 1).map(slugify).join('/')
      node = byId.get(id)
      if (!node) {
        node = { id, label: path[i], level: (i + 1) as 1 | 2 | 3, children: [], productIds: [] }
        byId.set(id, node)
        siblings.push(node)
      }
      siblings = node.children
    }
    if (node) node.productIds.push(row._id)
  }
  applyOrder(roots, '', edits)
  return roots
}

function applyOrder(siblings: CatalogTreeNode[], parentId: string, edits: TreeEdits): void {
  const wanted = edits.order[parentId]
  if (wanted) {
    siblings.sort((a, b) => {
      const ia = wanted.indexOf(a.id); const ib = wanted.indexOf(b.id)
      if (ia === -1 && ib === -1) return 0
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  }
  for (const n of siblings) applyOrder(n.children, n.id, edits)
}

/** Parcours en profondeur (préfixe). Utilisé par le moteur de pagination et le plan IA. */
export function flattenTree(tree: CatalogTreeNode[]): CatalogTreeNode[] {
  const out: CatalogTreeNode[] = []
  const walk = (n: CatalogTreeNode) => { out.push(n); n.children.forEach(walk) }
  tree.forEach(walk)
  return out
}
```

Note : `Array.prototype.sort` est stable (ES2019+) → les nœuds hors `order` gardent leur ordre d'apparition.

- [ ] **Step 5 : Vérifier le vert** — Run: `npx vitest run src/features/catalog/catalogTree.test.ts` → PASS (8 tests). Puis `npx tsc -b` → 0 erreur.

- [ ] **Step 6 : Commit**

```bash
git add src/features/catalog/catalogTypes.ts src/features/catalog/catalogTree.ts src/features/catalog/catalogTree.test.ts
git commit -m "feat(catalog): types du module + arbre taxonomique déterministe (guess, renames/order/moves)"
```

---

### Task 2 : Moteur de pagination (`catalogEngine.ts`)

**Files:**
- Create: `src/features/catalog/catalogEngine.ts`
- Test: `src/features/catalog/catalogEngine.test.ts`

**Interfaces:**
- Consumes: types Task 1, `flattenTree`.
- Produces: `paginateCatalog(input: PaginateInput): CatalogPageDescriptor[]`, `TOC_ENTRIES_PER_PAGE = 24`, `DEFAULT_GRID: CatalogGrid = 4`, `PaginateInput { tree: CatalogTreeNode[]; sections: CatalogSectionPlan[] }`.

- [ ] **Step 1 : Écrire les tests (échec attendu)**

```ts
// src/features/catalog/catalogEngine.test.ts
import { describe, expect, it } from 'vitest'
import type { CatalogSectionPlan, CatalogTreeNode } from './catalogTypes'
import { DEFAULT_GRID, TOC_ENTRIES_PER_PAGE, paginateCatalog } from './catalogEngine'

const node = (id: string, label: string, level: 1 | 2 | 3, productIds: string[] = [], children: CatalogTreeNode[] = []): CatalogTreeNode =>
  ({ id, label, level, children, productIds })
const ids = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const sec = (nodeId: string, productsPerPage: CatalogSectionPlan['productsPerPage'], featuredIds: string[] = []): CatalogSectionPlan =>
  ({ nodeId, productsPerPage, featuredIds })

describe('paginateCatalog', () => {
  it('séquence complète : couverture, sommaire, ouverture, produits, 4e de couverture', () => {
    const tree = [node('a', 'Outillage', 1, ids(5))]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4)] })
    expect(pages.map((p) => p.kind)).toEqual(['cover', 'toc', 'opener', 'products', 'products', 'back-cover'])
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 6])
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].slots).toHaveLength(4)
    expect(grids[1].slots).toHaveLength(1)
  })

  it('grille par défaut = 4 si aucune section ne matche', () => {
    const pages = paginateCatalog({ tree: [node('a', 'A', 1, ids(DEFAULT_GRID))], sections: [] })
    expect(pages.filter((p) => p.kind === 'products')).toHaveLength(1)
  })

  it('la grille se hérite du nœud ancêtre le plus proche', () => {
    const tree = [node('a', 'A', 1, [], [node('a/b', 'B', 2, ids(4))])]
    const pages = paginateCatalog({ tree, sections: [sec('a', 2)] })
    expect(pages.filter((p) => p.kind === 'products')).toHaveLength(2) // 4 produits / grille 2 héritée
  })

  it('vedette = une pleine page (grille 1), avant le flux', () => {
    const tree = [node('a', 'A', 1, ids(5))]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4, ['p3'])] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].grid).toBe(1)
    expect(grids[0].slots).toEqual([{ rowId: 'p3', featured: true }])
    expect(grids[1].slots.map((s) => s.rowId)).toEqual(['p1', 'p2', 'p4', 'p5'])
  })

  it('sous-famille = nouvelle page ; breadcrumb exact par page', () => {
    const tree = [node('a', 'Outillage', 1, [], [
      node('a/b', 'Perceuses', 2, ids(2, 'x')),
      node('a/c', 'Scies', 2, ids(2, 'y')),
    ])]
    const pages = paginateCatalog({ tree, sections: [] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids).toHaveLength(2)
    expect(grids[0].breadcrumb).toEqual(['Outillage', 'Perceuses'])
    expect(grids[1].breadcrumb).toEqual(['Outillage', 'Scies'])
  })

  it('univers vide (aucun produit dans le sous-arbre) → ni ouverture ni entrée sommaire', () => {
    const tree = [node('a', 'A', 1, ids(1)), node('b', 'B', 1, [], [node('b/c', 'C', 2)])]
    const pages = paginateCatalog({ tree, sections: [] })
    expect(pages.filter((p) => p.kind === 'opener')).toHaveLength(1)
    const toc = pages.find((p) => p.kind === 'toc')!
    expect(toc.entries.map((e) => e.nodeId)).toEqual(['a'])
  })

  it('sommaire (passe 2) : numéros exacts — univers → ouverture, feuille → première page produits', () => {
    const tree = [
      node('a', 'A', 1, ids(4, 'a')),
      node('b', 'B', 1, [], [node('b/c', 'C', 2, ids(1, 'c'))]),
    ]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4)] })
    // 1 cover, 2 toc, 3 opener A, 4 produits A, 5 opener B, 6 produits C, 7 back
    const toc = pages.find((p) => p.kind === 'toc')!
    expect(toc.entries).toEqual([
      { nodeId: 'a', label: 'A', level: 1, pageNumber: 3 },
      { nodeId: 'b', label: 'B', level: 1, pageNumber: 5 },
      { nodeId: 'b/c', label: 'C', level: 2, pageNumber: 6 },
    ])
  })

  it('plus de 24 entrées → 2 pages de sommaire, numérotation décalée', () => {
    const tree = Array.from({ length: 30 }, (_, i) => node(`u${i}`, `U${i}`, 1 as const, [`p${i}`]))
    const pages = paginateCatalog({ tree, sections: [] })
    const tocs = pages.filter((p) => p.kind === 'toc')
    expect(tocs).toHaveLength(2)
    expect(tocs[0].entries).toHaveLength(TOC_ENTRIES_PER_PAGE)
    expect(tocs[1].entries).toHaveLength(30 - TOC_ENTRIES_PER_PAGE)
    // première ouverture après cover(1) + 2 toc → page 4
    expect(pages.find((p) => p.kind === 'opener')!.pageNumber).toBe(4)
  })

  it('catalogue vide → cover, toc vide, back-cover', () => {
    const pages = paginateCatalog({ tree: [], sections: [] })
    expect(pages.map((p) => p.kind)).toEqual(['cover', 'toc', 'back-cover'])
  })
})
```

- [ ] **Step 2 : Vérifier l'échec** — Run: `npx vitest run src/features/catalog/catalogEngine.test.ts` → FAIL.

- [ ] **Step 3 : Implémenter `catalogEngine.ts`**

```ts
// src/features/catalog/catalogEngine.ts
// Pagination déterministe du catalogue en 2 passes : (1) émettre les pages —
// le nombre de pages de sommaire est connu d'avance (nb de nœuds non vides) ;
// (2) remplir les entrées du sommaire avec les numéros réels.
import type { CatalogGrid, CatalogPageDescriptor, CatalogSectionPlan, CatalogTreeNode, ProductSlot, TocEntry } from './catalogTypes'
import { flattenTree } from './catalogTree'

export const TOC_ENTRIES_PER_PAGE = 24
export const DEFAULT_GRID: CatalogGrid = 4

export interface PaginateInput {
  tree: CatalogTreeNode[]
  sections: CatalogSectionPlan[]
}

function subtreeProductCount(n: CatalogTreeNode): number {
  return n.productIds.length + n.children.reduce((acc, c) => acc + subtreeProductCount(c), 0)
}

export function paginateCatalog(input: PaginateInput): CatalogPageDescriptor[] {
  const byNode = new Map(input.sections.map((s) => [s.nodeId, s]))
  const kept = input.tree.filter((u) => subtreeProductCount(u) > 0)
  const tocNodes = flattenTree(kept).filter((n) => subtreeProductCount(n) > 0)
  const tocPageCount = Math.max(1, Math.ceil(tocNodes.length / TOC_ENTRIES_PER_PAGE))

  const pages: CatalogPageDescriptor[] = [{ kind: 'cover', pageNumber: 1 }]
  for (let i = 0; i < tocPageCount; i++) pages.push({ kind: 'toc', pageNumber: pages.length + 1, entries: [] })

  const nodePage = new Map<string, number>()
  const register = (chain: string[]) => {
    for (const id of chain) if (!nodePage.has(id)) nodePage.set(id, pages.length + 1)
  }

  const emitProducts = (node: CatalogTreeNode, breadcrumb: string[], chain: string[], inheritedGrid: CatalogGrid) => {
    const cfg = byNode.get(node.id)
    const grid = cfg?.productsPerPage ?? inheritedGrid
    const featured = new Set(cfg?.featuredIds ?? [])
    const flow: ProductSlot[] = []
    for (const rowId of node.productIds) {
      if (featured.has(rowId)) {
        register(chain)
        pages.push({ kind: 'products', pageNumber: pages.length + 1, nodeId: node.id, breadcrumb, grid: 1, slots: [{ rowId, featured: true }] })
      } else {
        flow.push({ rowId, featured: false })
      }
    }
    for (let i = 0; i < flow.length; i += grid) {
      register(chain)
      pages.push({ kind: 'products', pageNumber: pages.length + 1, nodeId: node.id, breadcrumb, grid, slots: flow.slice(i, i + grid) })
    }
    for (const child of node.children) {
      if (subtreeProductCount(child) === 0) continue
      emitProducts(child, [...breadcrumb, child.label], [...chain, child.id], grid)
    }
  }

  for (const univers of kept) {
    pages.push({ kind: 'opener', pageNumber: pages.length + 1, nodeId: univers.id, label: univers.label })
    nodePage.set(univers.id, pages.length)
    const grid = byNode.get(univers.id)?.productsPerPage ?? DEFAULT_GRID
    emitProducts(univers, [univers.label], [univers.id], grid)
  }
  pages.push({ kind: 'back-cover', pageNumber: pages.length + 1 })

  // Passe 2 : entrées du sommaire avec numéros réels.
  const entries: TocEntry[] = tocNodes
    .map((n) => ({ nodeId: n.id, label: n.label, level: n.level, pageNumber: nodePage.get(n.id) ?? 0 }))
    .filter((e) => e.pageNumber > 0)
  let cursor = 0
  for (const p of pages) {
    if (p.kind !== 'toc') continue
    p.entries = entries.slice(cursor, cursor + TOC_ENTRIES_PER_PAGE)
    cursor += TOC_ENTRIES_PER_PAGE
  }
  return pages
}
```

⚠️ Piège du test « héritage » : `emitProducts` du nœud univers est appelé avec `grid` déjà résolu depuis sa config — l'héritage descend par le paramètre `inheritedGrid`. Un nœud SANS config ET sans produit propre transmet quand même la grille héritée à ses enfants.

⚠️ Piège vedette : dans le test vedette, `emitProducts` est appelé pour un nœud qui a config grille 4 ; la boucle featured émet AVANT le flux → l'ordre attendu (vedette d'abord) tient. `register(chain)` avant chaque page garantit que `nodePage` pointe la PREMIÈRE page du nœud.

- [ ] **Step 4 : Vérifier le vert** — Run: `npx vitest run src/features/catalog/catalogEngine.test.ts` → PASS (9 tests). Puis `npx tsc -b` → 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/features/catalog/catalogEngine.ts src/features/catalog/catalogEngine.test.ts
git commit -m "feat(catalog): moteur de pagination pur — sommaire 2 passes, vedettes, héritage de grille"
```

---

### Task 3 : Plan IA `catalog.plan` (`catalogPlan.ts` + routeur LLM)

**Files:**
- Modify: `src/features/ai/llmRouter.ts` (3 endroits : union `LLMTask` l.46-67, `TASK_ROUTING` l.81-148, `TASK_TEMPERATURE` l.151-179)
- Create: `src/features/catalog/catalogPlan.ts`
- Test: `src/features/catalog/catalogPlan.test.ts`

**Interfaces:**
- Consumes: `generateJson` (`@/features/ai/llmRouter`), `FONT_OPTIONS` (`@/features/retail-promo/RetailPromoCard`), types + `flattenTree`.
- Produces: `generateCatalogPlan(brief: string, ctx: CatalogPlanContext): Promise<CatalogPlan>`, `defaultCatalogPlan(tree: CatalogTreeNode[], catalogName: string): CatalogPlan`, `sanitizeCatalogPlan(raw: RawCatalogPlan, tree, catalogName): CatalogPlan`, `CatalogPlanContext { catalogName: string; tree: CatalogTreeNode[]; sampleNames: Record<string, string[]> }` (sampleNames : nodeId → jusqu'à 3 noms de produits), `RawCatalogPlan` (z.infer du schéma).

- [ ] **Step 1 : Ajouter la tâche au routeur LLM** (`src/features/ai/llmRouter.ts`)

Dans l'union `LLMTask` (après `| 'design.promoPlan'`) :
```ts
  | 'catalog.plan'
```
Dans `TASK_ROUTING` (après la ligne `'design.promoPlan'`) :
```ts
  // Plan de catalogue multi-page (thème + grilles + couvertures) : raisonnement structuré
  // créatif → claude primary (prend son défaut) ; fallback gemini ÉPINGLÉ 3.1-pro-preview
  // (modelForProvider n'applique l'override qu'au provider du préfixe correspondant —
  // même pattern que 'data.columnCompletion' ; JAMAIS gemini-3.5-flash pour du JSON).
  'catalog.plan': { primary: 'claude', fallback: 'gemini', model: 'gemini-3.1-pro-preview' },
```
Dans `TASK_TEMPERATURE` :
```ts
  // Plan de catalogue : composition créative (thème, densités) mais bornée par le schéma.
  'catalog.plan': 0.5,
```

- [ ] **Step 2 : Écrire les tests des fonctions pures (échec attendu)**

```ts
// src/features/catalog/catalogPlan.test.ts
import { describe, expect, it } from 'vitest'
import type { CatalogTreeNode } from './catalogTypes'
import { defaultCatalogPlan, sanitizeCatalogPlan } from './catalogPlan'

const node = (id: string, label: string, level: 1 | 2 | 3, productIds: string[] = [], children: CatalogTreeNode[] = []): CatalogTreeNode =>
  ({ id, label, level, children, productIds })

describe('defaultCatalogPlan', () => {
  it('une section grille 4 par nœud ayant des produits, thème neutre, couverture typographique', () => {
    const tree = [node('a', 'A', 1, ['p1'], [node('a/b', 'B', 2, ['p2'])]), node('c', 'C', 1)]
    const plan = defaultCatalogPlan(tree, 'Mon catalogue')
    expect(plan.sections.map((s) => s.nodeId)).toEqual(['a', 'a/b'])
    expect(plan.sections.every((s) => s.productsPerPage === 4 && s.featuredIds.length === 0)).toBe(true)
    expect(plan.cover.title).toBe('Mon catalogue')
    expect(plan.cover.imagePrompt).toBe('')
    expect(plan.theme.accent).toBe('#6366f1')
    expect(plan.tocTitle).toBe('Sommaire')
  })
})

describe('sanitizeCatalogPlan', () => {
  const tree = [node('a', 'A', 1, ['p1', 'p2', 'p3'])]
  const raw = {
    theme: { accent: '#e11d48', pageBg: '#fff', ink: '#111', headerBg: '#0f172a', headerInk: '#fff', fontHeading: 'Archivo', fontBody: 'Inter' },
    sections: [
      { nodeId: 'a', productsPerPage: 5, featuredIds: ['p2', 'zzz'] },
      { nodeId: 'inconnu', productsPerPage: 4 },
    ],
    cover: { title: 'T', imagePrompt: 'photo outillage' },
    backCover: { title: 'T', text: 'Merci' },
    tocTitle: 'Sommaire',
  }
  it('clampe la grille à la valeur autorisée la plus proche, filtre nodeIds/featuredIds inconnus', () => {
    const plan = sanitizeCatalogPlan(raw, tree, 'X')
    expect(plan.sections).toHaveLength(1)
    expect(plan.sections[0].productsPerPage).toBe(4) // 5 → 4 (plus proche dans {1,2,3,4,6,8})
    expect(plan.sections[0].featuredIds).toEqual(['p2'])
  })
  it('complète les sections manquantes avec la grille par défaut', () => {
    const plan = sanitizeCatalogPlan({ ...raw, sections: [] }, tree, 'X')
    expect(plan.sections).toEqual([{ nodeId: 'a', productsPerPage: 4, featuredIds: [] }])
  })
  it('complète les champs texte optionnels manquants', () => {
    const plan = sanitizeCatalogPlan(raw, tree, 'X')
    expect(plan.cover.subtitle).toBe('')
    expect(plan.cover.baseline).toBe('')
  })
})
```

- [ ] **Step 3 : Vérifier l'échec** — Run: `npx vitest run src/features/catalog/catalogPlan.test.ts` → FAIL.

- [ ] **Step 4 : Implémenter `catalogPlan.ts`**

```ts
// src/features/catalog/catalogPlan.ts
// Génération du plan de catalogue via prompt global (tâche LLM 'catalog.plan'),
// sanitisation stricte contre l'arbre réel, et plan par défaut déterministe
// (la génération ne doit JAMAIS être bloquée par un échec IA).
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { FONT_OPTIONS } from '@/features/retail-promo/RetailPromoCard'
import { CATALOG_GRIDS, type CatalogGrid, type CatalogPlan, type CatalogTreeNode } from './catalogTypes'
import { flattenTree } from './catalogTree'

const ThemeSchema = z.object({
  accent: z.string(), pageBg: z.string(), ink: z.string(),
  headerBg: z.string(), headerInk: z.string(),
  fontHeading: z.enum(FONT_OPTIONS), fontBody: z.enum(FONT_OPTIONS),
})
const SectionSchema = z.object({
  nodeId: z.string(),
  productsPerPage: z.number(),
  featuredIds: z.array(z.string()).optional(),
})
const PlanSchema = z.object({
  theme: ThemeSchema,
  sections: z.array(SectionSchema),
  cover: z.object({ title: z.string(), subtitle: z.string().optional(), baseline: z.string().optional(), imagePrompt: z.string() }),
  backCover: z.object({ title: z.string(), text: z.string() }),
  tocTitle: z.string(),
})
export type RawCatalogPlan = z.infer<typeof PlanSchema>

const SCHEMA_FOR_LLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    theme: {
      type: 'object',
      description: 'identité graphique du catalogue, déclinée sur toutes les pages',
      properties: {
        accent: { type: 'string', description: 'hex couleur d’accent (prix, filets, badges)' },
        pageBg: { type: 'string', description: 'hex fond de page (clair pour un catalogue print)' },
        ink: { type: 'string', description: 'hex texte principal' },
        headerBg: { type: 'string', description: 'hex bandeau header/footer' },
        headerInk: { type: 'string', description: 'hex texte du bandeau' },
        fontHeading: { type: 'string', enum: [...FONT_OPTIONS] },
        fontBody: { type: 'string', enum: [...FONT_OPTIONS] },
      },
      required: ['accent', 'pageBg', 'ink', 'headerBg', 'headerInk', 'fontHeading', 'fontBody'],
    },
    sections: {
      type: 'array',
      description: 'densité de grille par nœud (nodeId EXACT de la liste fournie) : peu de produits ou produits premium → 1-2/page ; gamme large → 6-8/page',
      items: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          productsPerPage: { type: 'number', enum: [...CATALOG_GRIDS] },
          featuredIds: { type: 'array', items: { type: 'string' }, description: 'ids produits vedette (pleine page), choisis parmi les exemples fournis, 0-2 par section' },
        },
        required: ['nodeId', 'productsPerPage'],
      },
    },
    cover: {
      type: 'object',
      properties: {
        title: { type: 'string' }, subtitle: { type: 'string' }, baseline: { type: 'string' },
        imagePrompt: { type: 'string', description: 'prompt EN ANGLAIS pour générer le visuel de couverture (photo réaliste, sans texte incrusté)' },
      },
      required: ['title', 'imagePrompt'],
    },
    backCover: {
      type: 'object',
      properties: { title: { type: 'string' }, text: { type: 'string', description: 'texte de 4e de couverture (contact, mentions, remerciement)' } },
      required: ['title', 'text'],
    },
    tocTitle: { type: 'string' },
  },
  required: ['theme', 'sections', 'cover', 'backCover', 'tocTitle'],
}

const DEFAULT_GRID: CatalogGrid = 4

function clampGrid(n: number): CatalogGrid {
  let best: CatalogGrid = DEFAULT_GRID
  let diff = Infinity
  for (const g of CATALOG_GRIDS) {
    const d = Math.abs(g - n)
    if (d < diff) { diff = d; best = g }
  }
  return best
}

function nodesWithProducts(tree: CatalogTreeNode[]): CatalogTreeNode[] {
  return flattenTree(tree).filter((n) => n.productIds.length > 0)
}

/** Plan neutre déterministe : repli si l'IA échoue, base avant première génération. */
export function defaultCatalogPlan(tree: CatalogTreeNode[], catalogName: string): CatalogPlan {
  return {
    theme: {
      accent: '#6366f1', pageBg: '#ffffff', ink: '#111827',
      headerBg: '#111827', headerInk: '#ffffff', fontHeading: 'Archivo', fontBody: 'Inter',
    },
    sections: nodesWithProducts(tree).map((n) => ({ nodeId: n.id, productsPerPage: DEFAULT_GRID, featuredIds: [] })),
    cover: { title: catalogName || 'Catalogue', subtitle: '', baseline: '', imagePrompt: '' },
    backCover: { title: catalogName || 'Catalogue', text: '' },
    tocTitle: 'Sommaire',
  }
}

/** Valide le plan IA contre l'arbre réel : grilles clampées, ids inconnus filtrés, sections manquantes complétées. */
export function sanitizeCatalogPlan(raw: RawCatalogPlan, tree: CatalogTreeNode[], catalogName: string): CatalogPlan {
  const valid = nodesWithProducts(tree)
  const productsByNode = new Map(valid.map((n) => [n.id, new Set(n.productIds)]))
  const sections = raw.sections
    .filter((s) => productsByNode.has(s.nodeId))
    .map((s) => ({
      nodeId: s.nodeId,
      productsPerPage: clampGrid(s.productsPerPage),
      featuredIds: (s.featuredIds ?? []).filter((id) => productsByNode.get(s.nodeId)!.has(id)),
    }))
  const covered = new Set(sections.map((s) => s.nodeId))
  for (const n of valid) {
    if (!covered.has(n.id)) sections.push({ nodeId: n.id, productsPerPage: DEFAULT_GRID, featuredIds: [] })
  }
  return {
    theme: raw.theme,
    sections,
    cover: { title: raw.cover.title || catalogName, subtitle: raw.cover.subtitle ?? '', baseline: raw.cover.baseline ?? '', imagePrompt: raw.cover.imagePrompt },
    backCover: raw.backCover,
    tocTitle: raw.tocTitle || 'Sommaire',
  }
}

export interface CatalogPlanContext {
  catalogName: string
  tree: CatalogTreeNode[]
  /** nodeId → jusqu'à 3 « id — nom produit » (pour le choix des vedettes). */
  sampleNames: Record<string, string[]>
}

/** Appelle l'IA (cascade + retry Zod gérés par llmRouter). L'appelant gère le repli defaultCatalogPlan. */
export async function generateCatalogPlan(brief: string, ctx: CatalogPlanContext): Promise<CatalogPlan> {
  const treeDesc = flattenTree(ctx.tree)
    .map((n) => {
      const samples = ctx.sampleNames[n.id]?.length ? ` — ex. ${ctx.sampleNames[n.id].join(' ; ')}` : ''
      return `${'  '.repeat(n.level - 1)}- [${n.id}] ${n.label} (${n.productIds.length} produits)${samples}`
    })
    .join('\n')
  const raw = await generateJson<RawCatalogPlan>({
    task: 'catalog.plan',
    version: 'catalog.plan.v1',
    prompt:
      `Tu conçois l'identité graphique d'un CATALOGUE PRODUIT professionnel multi-page (style prospectus/catalogue retail, lumineux, lisible — jamais sombre/cinématique).\n` +
      `Nom du catalogue : « ${ctx.catalogName} ».\n` +
      `Structure (nodeId entre crochets — à réutiliser tel quel) :\n${treeDesc}\n\n` +
      `Produis un plan complet : thème (couleurs hex cohérentes avec la demande, polices STRICTEMENT parmi ${FONT_OPTIONS.join(', ')}), ` +
      `une section par nodeId avec la densité adaptée (productsPerPage parmi ${CATALOG_GRIDS.join('/')}), 0-2 produits vedette par section ` +
      `choisis parmi les exemples (renvoie l'id AVANT le tiret), textes de couverture et 4e de couverture en FRANÇAIS, ` +
      `et un imagePrompt de couverture en anglais (photo réaliste, sans texte).\n\nDemande : ${brief}`,
    schema: PlanSchema,
    schemaForLLM: SCHEMA_FOR_LLM,
  })
  return sanitizeCatalogPlan(raw, ctx.tree, ctx.catalogName)
}
```

- [ ] **Step 5 : Vérifier le vert** — Run: `npx vitest run src/features/catalog/catalogPlan.test.ts` → PASS (4 tests). Puis `npx tsc -b` → 0 erreur (vérifie l'union `LLMTask` complète dans les deux Records).

- [ ] **Step 6 : Commit**

```bash
git add src/features/ai/llmRouter.ts src/features/catalog/catalogPlan.ts src/features/catalog/catalogPlan.test.ts
git commit -m "feat(catalog): tâche LLM catalog.plan — plan IA sanitisé + plan par défaut déterministe"
```

---

### Task 4 : Persistance Firestore (`catalogsApi.ts`, `catalogTemplatesApi.ts`, règles, permissions)

**Files:**
- Create: `src/features/catalog/catalogsApi.ts`
- Create: `src/features/catalog/catalogTemplatesApi.ts`
- Modify: `firestore.rules` (après le bloc `promoTemplates`, ~l.211)
- Modify: `src/features/access/permissions.ts` (après les lignes `retailPromo.*`, l.57-58)

**Interfaces:**
- Consumes: `CatalogDoc`, `CatalogTheme`, `CatalogGrid` (Task 1) ; `stripUndefined` (`@/features/retail-promo/stripUndefined`) ; `auth`, `db` (`@/lib/firebase/config`).
- Produces: `listCatalogs(): Promise<CatalogSummary[]>` (`CatalogSummary { id, name, updatedAt: Date | null }`), `loadCatalog(id): Promise<CatalogDoc | null>`, `saveCatalog(doc: CatalogDoc): Promise<string>` (retourne l'id, en crée un si `doc.id` vide), `deleteCatalog(id)`, `newCatalogDoc(name: string): CatalogDoc` ; `CatalogTemplate { id, name, theme: CatalogTheme, defaultGrid: CatalogGrid }`, `listCatalogTemplates()`, `saveCatalogTemplate(name, theme, defaultGrid)`, `deleteCatalogTemplate(id)`.

- [ ] **Step 1 : Implémenter `catalogsApi.ts`**

```ts
// src/features/catalog/catalogsApi.ts
// CRUD users/{uid}/catalogs — même pattern que promoTemplatesApi (stripUndefined
// à la frontière : un seul undefined ferait rejeter tout le setDoc).
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { stripUndefined } from '@/features/retail-promo/stripUndefined'
import { EMPTY_TREE_EDITS } from './catalogTree'
import { CATALOG_FORMAT_PRESETS, type CatalogDoc } from './catalogTypes'

export interface CatalogSummary { id: string; name: string; updatedAt: Date | null }

const colPath = (uid: string) => collection(db, 'users', uid, 'catalogs')

export function newCatalogDoc(name: string): CatalogDoc {
  return {
    id: '', name, sourceRef: null, selectedRowIds: [], levelKeys: {}, treeEdits: EMPTY_TREE_EDITS,
    prompt: '', plan: null, fieldMap: {}, format: CATALOG_FORMAT_PRESETS[0].format,
    coverImageUrl: null, backCoverImageUrl: null,
  }
}

export async function listCatalogs(): Promise<CatalogSummary[]> {
  const uid = auth.currentUser?.uid
  if (!uid) return []
  const snap = await getDocs(colPath(uid))
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id), updatedAt: d.data().updatedAt?.toDate?.() ?? null }))
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
}

export async function loadCatalog(id: string): Promise<CatalogDoc | null> {
  const uid = auth.currentUser?.uid
  if (!uid) return null
  const snap = await getDoc(doc(db, 'users', uid, 'catalogs', id))
  if (!snap.exists()) return null
  const base = newCatalogDoc('')
  return { ...base, ...(snap.data() as Partial<CatalogDoc>), id: snap.id }
}

/** Upsert : `doc.id` vide → création (retourne le nouvel id). */
export async function saveCatalog(docData: CatalogDoc): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non connecté')
  const ref = docData.id ? doc(db, 'users', uid, 'catalogs', docData.id) : doc(colPath(uid))
  const { id: _omit, ...payload } = docData
  await setDoc(ref, { ...stripUndefined(payload), updatedAt: serverTimestamp() })
  return ref.id
}

export async function deleteCatalog(id: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return
  await deleteDoc(doc(db, 'users', uid, 'catalogs', id))
}
```

- [ ] **Step 2 : Implémenter `catalogTemplatesApi.ts`** (miroir exact de `promoTemplatesApi.ts`)

```ts
// src/features/catalog/catalogTemplatesApi.ts
// Modèles réutilisables (thème + grille par défaut, SANS données ni sélection).
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { stripUndefined } from '@/features/retail-promo/stripUndefined'
import type { CatalogGrid, CatalogTheme } from './catalogTypes'

export interface CatalogTemplate { id: string; name: string; theme: CatalogTheme; defaultGrid: CatalogGrid }

const colPath = (uid: string) => collection(db, 'users', uid, 'catalogTemplates')

export async function listCatalogTemplates(): Promise<CatalogTemplate[]> {
  const uid = auth.currentUser?.uid
  if (!uid) return []
  const snap = await getDocs(colPath(uid))
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.data().name ?? d.id), theme: d.data().theme as CatalogTheme, defaultGrid: (d.data().defaultGrid ?? 4) as CatalogGrid }))
    .filter((t) => t.theme)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Upsert par nom (pas de doublon). */
export async function saveCatalogTemplate(name: string, theme: CatalogTheme, defaultGrid: CatalogGrid): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Non connecté')
  const existing = (await listCatalogTemplates()).find((t) => t.name === name)
  const ref = existing ? doc(db, 'users', uid, 'catalogTemplates', existing.id) : doc(colPath(uid))
  await setDoc(ref, { ...stripUndefined({ name, theme, defaultGrid }), createdAt: serverTimestamp() })
}

export async function deleteCatalogTemplate(id: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return
  await deleteDoc(doc(db, 'users', uid, 'catalogTemplates', id))
}
```

- [ ] **Step 3 : Règles Firestore** — dans `firestore.rules`, juste après le bloc `match /users/{uid}/promoTemplates/{templateId} { ... }` :

```
    // Catalogues multi-pages (module Catalogue studio).
    match /users/{uid}/catalogs/{catalogId} {
      allow read:   if isAuthenticated() && request.auth.uid == uid;
      allow write:  if hasPermission('catalog.edit') && request.auth.uid == uid;
    }
    match /users/{uid}/catalogTemplates/{templateId} {
      allow read:   if isAuthenticated() && request.auth.uid == uid;
      allow write:  if hasPermission('catalog.edit') && request.auth.uid == uid;
    }
```

- [ ] **Step 4 : Permissions RBAC** — dans `src/features/access/permissions.ts`, après les deux lignes `retailPromo.*` (l.57-58), en respectant le format des entrées existantes :

```ts
  { key: 'catalog.view', module: 'Catalogue studio', label: 'Voir le module Catalogue studio' },
  { key: 'catalog.edit', module: 'Catalogue studio', label: 'Créer/éditer des catalogues' },
```

- [ ] **Step 5 : Vérifier** — Run: `npx tsc -b` → 0 erreur. (Les API Firestore ne sont pas testées unitairement — pattern du projet ; les règles seront déployées en Task 15.)

- [ ] **Step 6 : Commit**

```bash
git add src/features/catalog/catalogsApi.ts src/features/catalog/catalogTemplatesApi.ts firestore.rules src/features/access/permissions.ts
git commit -m "feat(catalog): persistance users/{uid}/catalogs + catalogTemplates, règles Firestore, permissions RBAC"
```

---

### Task 5 : Store du builder (`stores/catalog.store.ts`)

**Files:**
- Create: `src/stores/catalog.store.ts`

**Interfaces:**
- Consumes: types Task 1, `MergeColumn`/`MergeRow`/`DataSourceRef`, `PromoFieldKey`, `EMPTY_TREE_EDITS`.
- Produces: `useCatalogStore` avec l'état/actions ci-dessous. `CatalogStep = 'source' | 'structure' | 'prompt' | 'preview' | 'export'`.

- [ ] **Step 1 : Implémenter le store** (pattern exact de `retailPromo.store.ts` : persist sessionStorage tolérant au quota)

```ts
// src/stores/catalog.store.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'
import type { CatalogDoc, CatalogFormat, CatalogGrid, CatalogPlan, LevelKeys, TreeEdits } from '@/features/catalog/catalogTypes'
import { CATALOG_FORMAT_PRESETS } from '@/features/catalog/catalogTypes'
import { EMPTY_TREE_EDITS } from '@/features/catalog/catalogTree'

export type CatalogStep = 'source' | 'structure' | 'prompt' | 'preview' | 'export'

interface CatalogState {
  catalogId: string | null
  name: string
  step: CatalogStep
  sourceRef: DataSourceRef | null
  rawColumns: MergeColumn[]
  rawRows: MergeRow[]
  selectedRowIds: string[]
  levelKeys: LevelKeys
  treeEdits: TreeEdits
  prompt: string
  plan: CatalogPlan | null
  fieldMap: Partial<Record<PromoFieldKey, string>>
  format: CatalogFormat
  coverImageUrl: string | null
  backCoverImageUrl: string | null

  hydrate: (doc: CatalogDoc, id: string) => void
  toDoc: () => CatalogDoc
  setStep: (step: CatalogStep) => void
  setName: (name: string) => void
  setSource: (ref: DataSourceRef, columns: MergeColumn[], rows: MergeRow[]) => void
  setSelectedRowIds: (ids: string[]) => void
  setLevelKeys: (keys: LevelKeys) => void
  setTreeEdits: (patch: Partial<TreeEdits>) => void
  setPrompt: (prompt: string) => void
  setPlan: (plan: CatalogPlan | null) => void
  setSectionGrid: (nodeId: string, grid: CatalogGrid) => void
  toggleFeatured: (nodeId: string, rowId: string) => void
  setFieldMap: (map: Partial<Record<PromoFieldKey, string>>) => void
  setFormat: (format: CatalogFormat) => void
  setCoverImageUrl: (url: string | null) => void
  setBackCoverImageUrl: (url: string | null) => void
  reset: () => void
}

const defaultState = {
  catalogId: null as string | null,
  name: 'Nouveau catalogue',
  step: 'source' as CatalogStep,
  sourceRef: null as DataSourceRef | null,
  rawColumns: [] as MergeColumn[],
  rawRows: [] as MergeRow[],
  selectedRowIds: [] as string[],
  levelKeys: {} as LevelKeys,
  treeEdits: EMPTY_TREE_EDITS,
  prompt: '',
  plan: null as CatalogPlan | null,
  fieldMap: {} as Partial<Record<PromoFieldKey, string>>,
  format: CATALOG_FORMAT_PRESETS[0].format,
  coverImageUrl: null as string | null,
  backCoverImageUrl: null as string | null,
}

// sessionStorage tolérant au quota : un gros catalogue ne doit jamais casser l'édition.
const safeSessionStorage = {
  getItem: (k: string) => sessionStorage.getItem(k),
  setItem: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* quota : on continue sans persistance */ } },
  removeItem: (k: string) => sessionStorage.removeItem(k),
}

export const useCatalogStore = create<CatalogState>()(persist((set, get) => ({
  ...defaultState,
  hydrate: (doc, id) => set({
    catalogId: id, name: doc.name, sourceRef: doc.sourceRef, selectedRowIds: doc.selectedRowIds,
    levelKeys: doc.levelKeys, treeEdits: doc.treeEdits, prompt: doc.prompt, plan: doc.plan,
    fieldMap: doc.fieldMap, format: doc.format, coverImageUrl: doc.coverImageUrl, backCoverImageUrl: doc.backCoverImageUrl,
  }),
  toDoc: () => {
    const s = get()
    return {
      id: s.catalogId ?? '', name: s.name, sourceRef: s.sourceRef, selectedRowIds: s.selectedRowIds,
      levelKeys: s.levelKeys, treeEdits: s.treeEdits, prompt: s.prompt, plan: s.plan,
      fieldMap: s.fieldMap, format: s.format, coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl,
    }
  },
  setStep: (step) => set({ step }),
  setName: (name) => set({ name }),
  setSource: (sourceRef, rawColumns, rawRows) => set({ sourceRef, rawColumns, rawRows }),
  setSelectedRowIds: (selectedRowIds) => set({ selectedRowIds }),
  setLevelKeys: (levelKeys) => set({ levelKeys }),
  setTreeEdits: (patch) => set((s) => ({ treeEdits: { ...s.treeEdits, ...patch } })),
  setPrompt: (prompt) => set({ prompt }),
  setPlan: (plan) => set({ plan }),
  setSectionGrid: (nodeId, grid) => set((s) => s.plan ? ({
    plan: { ...s.plan, sections: s.plan.sections.map((x) => x.nodeId === nodeId ? { ...x, productsPerPage: grid } : x) },
  }) : {}),
  toggleFeatured: (nodeId, rowId) => set((s) => s.plan ? ({
    plan: { ...s.plan, sections: s.plan.sections.map((x) => x.nodeId === nodeId
      ? { ...x, featuredIds: x.featuredIds.includes(rowId) ? x.featuredIds.filter((i) => i !== rowId) : [...x.featuredIds, rowId] }
      : x) },
  }) : {}),
  setFieldMap: (fieldMap) => set({ fieldMap }),
  setFormat: (format) => set({ format }),
  setCoverImageUrl: (coverImageUrl) => set({ coverImageUrl }),
  setBackCoverImageUrl: (backCoverImageUrl) => set({ backCoverImageUrl }),
  reset: () => set(defaultState),
}), {
  name: 'catalog-builder-session',
  storage: createJSONStorage(() => safeSessionStorage),
  partialize: (s) => ({
    catalogId: s.catalogId, name: s.name, step: s.step, sourceRef: s.sourceRef,
    rawColumns: s.rawColumns, rawRows: s.rawRows, selectedRowIds: s.selectedRowIds,
    levelKeys: s.levelKeys, treeEdits: s.treeEdits, prompt: s.prompt, plan: s.plan,
    fieldMap: s.fieldMap, format: s.format, coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl,
  }),
}))
```

- [ ] **Step 2 : Vérifier** — Run: `npx tsc -b` → 0 erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/stores/catalog.store.ts
git commit -m "feat(catalog): store Zustand du builder (session survit au rechargement, quota toléré)"
```

---

### Task 6 : Navigation (modules, route, Dashboard, `CatalogHome.tsx`)

**Files:**
- Modify: `src/features/navigation/modules.ts`
- Modify: `src/app/router.tsx`
- Modify: `src/pages/DashboardPage.tsx` (chaîne des sections, ~l.757 ; lazy imports ~l.48)
- Create: `src/features/catalog/CatalogHome.tsx`
- Create: `src/pages/CatalogBuilderPage.tsx` (squelette — complété en Task 9)

**Interfaces:**
- Consumes: `listCatalogs`, `deleteCatalog`, `saveCatalog`, `newCatalogDoc` (Task 4), `useCatalogStore` (Task 5).
- Produces: `Section` inclut `'catalog'` ; route `/catalog/:id` ; `CatalogHome` (default export nommé `CatalogHome`).

- [ ] **Step 1 : `modules.ts`** — ajouter `'catalog'` à l'union `Section` (l.18-21) :

```ts
  | 'hyperframes' | 'telegram' | 'access' | 'price-watch' | 'retail-promo' | 'catalog'
```

Ajouter dans `MODULE_ITEMS` juste après l'entrée `retail-promo` (importer `BookText` de lucide-react en tête du fichier — vérifier qu'il n'ombrage rien) :

```ts
  { id: 'catalog', icon: BookText, label: 'Catalogue studio', accent: 'text-cyan-400', activeBg: 'bg-cyan-500/[0.1]', activeText: 'text-cyan-300',
    children: [
      { id: 'action:new',  label: 'Nouveau catalogue', intent: 'catalog:action:new' },
      { id: 'action:list', label: 'Mes catalogues',    intent: 'catalog:action:list' },
    ],
  },
```

Et dans `SECTION_PERMISSION` :

```ts
  catalog: 'catalog.view',
```

- [ ] **Step 2 : Route `/catalog/:id`** — dans `src/app/router.tsx`, ajouter le lazy import et la route (même forme que `/workflows/:id`) :

```tsx
const CatalogBuilderPage = lazy(() => import('@/pages/CatalogBuilderPage'))
```
```tsx
  {
    path: '/catalog/:id',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <CatalogBuilderPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
```

- [ ] **Step 3 : `CatalogHome.tsx`** (liste + création ; rendu dans la section Dashboard)

```tsx
// src/features/catalog/CatalogHome.tsx
// Section Dashboard du module : liste des catalogues + création.
// Le builder lui-même est plein écran sur /catalog/:id.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookText, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteCatalog, listCatalogs, newCatalogDoc, saveCatalog, type CatalogSummary } from './catalogsApi'
import { useCatalogStore } from '@/stores/catalog.store'

export function CatalogHome() {
  const navigate = useNavigate()
  const [items, setItems] = useState<CatalogSummary[]>([])
  const [loading, setLoading] = useState(true)
  const reset = useCatalogStore((s) => s.reset)
  const hydrate = useCatalogStore((s) => s.hydrate)

  useEffect(() => {
    listCatalogs().then(setItems).catch((e) => toast.error(String(e?.message ?? e))).finally(() => setLoading(false))
  }, [])

  const createCatalog = async () => {
    try {
      const doc = newCatalogDoc('Nouveau catalogue')
      const id = await saveCatalog(doc)
      reset()
      hydrate(doc, id)
      navigate(`/catalog/${id}`)
    } catch (e) { toast.error(`Création impossible : ${String((e as Error).message)}`) }
  }

  const remove = async (id: string) => {
    await deleteCatalog(id)
    setItems((xs) => xs.filter((x) => x.id !== id))
    toast.success('Catalogue supprimé')
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2"><BookText className="w-5 h-5 text-cyan-400" /> Catalogue studio</h1>
        <button onClick={createCatalog} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[#fff] text-sm font-medium">
          <Plus className="w-4 h-4" /> Nouveau catalogue
        </button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun catalogue. Créez le premier : sélection PIM → prompt → PDF.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between bg-surface rounded-lg px-4 py-3 hover:bg-surface-2">
              <button onClick={() => navigate(`/catalog/${c.id}`)} className="text-left flex-1">
                <span className="text-sm font-medium text-white">{c.name}</span>
                {c.updatedAt && <span className="ml-3 text-xs text-muted-foreground">{c.updatedAt.toLocaleDateString('fr-FR')}</span>}
              </button>
              <button onClick={() => remove(c.id)} className="p-2 text-muted-foreground hover:text-red-400" title="Supprimer">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4 : Brancher la section dans `DashboardPage.tsx`** — ajouter le lazy import à côté de `RetailPromoPage` (~l.48) :

```tsx
const CatalogHome = lazy(() => import('@/features/catalog/CatalogHome').then((m) => ({ default: m.CatalogHome })))
```

Puis insérer dans la chaîne de rendu des sections (juste après le bloc `retail-promo`, ~l.764, en respectant EXACTEMENT la forme ternaire environnante) :

```tsx
      ) : activeSection === 'catalog' && canSee('catalog') ? (
        <div className="flex-1 overflow-auto">
          <Suspense fallback={null}>
            <CatalogHome />
          </Suspense>
        </div>
```

- [ ] **Step 5 : Squelette `CatalogBuilderPage.tsx`** (rend le wizard vide — complété Task 9 ; nécessaire pour que la route compile)

```tsx
// src/pages/CatalogBuilderPage.tsx
import { useParams } from 'react-router-dom'

export default function CatalogBuilderPage() {
  const { id } = useParams<{ id: string }>()
  return <div className="min-h-screen bg-background text-white p-8">Builder catalogue {id} — en construction</div>
}
```

- [ ] **Step 6 : Vérifier** — Run: `npx tsc -b && npm run lint` → 0 erreur. Lancer `npm run dev`, ouvrir `/dashboard` : le module « Catalogue studio » apparaît dans la sidebar ; « Nouveau catalogue » crée un doc et ouvre `/catalog/:id`.

- [ ] **Step 7 : Commit**

```bash
git add src/features/navigation/modules.ts src/app/router.tsx src/pages/DashboardPage.tsx src/features/catalog/CatalogHome.tsx src/pages/CatalogBuilderPage.tsx
git commit -m "feat(catalog): module Catalogue studio dans la navigation + route /catalog/:id + liste des catalogues"
```

---

### Task 7 : CSS des pages + briques de rendu (`catalogCss.ts`, Header, Footer, ProductCell)

**Files:**
- Create: `src/features/catalog/components/pages/catalogCss.ts`
- Create: `src/features/catalog/components/pages/CatalogHeader.tsx`
- Create: `src/features/catalog/components/pages/CatalogFooter.tsx`
- Create: `src/features/catalog/components/pages/ProductCell.tsx`

**Interfaces:**
- Consumes: `CatalogTheme`, `CatalogFormat` ; `extractPromoFields` + `PromoFields` (`@/features/retail-promo/promoMapping`, `promoTypes`) ; `FONTS_HREF` (`@/features/retail-promo/RetailPromoCard`).
- Produces: `PX_PER_MM = 96 / 25.4` ; `CATALOG_CSS: string` ; `ensureCatalogFonts(): void` ; `themeVars(theme: CatalogTheme): React.CSSProperties` ; `pagePx(format: CatalogFormat): { w: number; h: number }` ; `CatalogRenderCtx { plan: CatalogPlan; format: CatalogFormat; rowsById: Map<string, MergeRow>; columns: MergeColumn[]; fieldMap: Partial<Record<PromoFieldKey, string>>; catalogName: string; totalPages: number; coverImageUrl: string | null; backCoverImageUrl: string | null }` ; `formatPrice(n: number | null): string` ; composants `CatalogHeader { breadcrumb: string[] }`, `CatalogFooter { pageNumber: number; totalPages: number; catalogName: string }`, `ProductCell { fields: PromoFields; featured: boolean }`.

- [ ] **Step 1 : `catalogCss.ts`**

```ts
// src/features/catalog/components/pages/catalogCss.ts
// CSS partagé des pages du catalogue (aperçu React + capture html2canvas).
// 1 mm = 96/25.4 px CSS → une page A4 portrait fait 794×1123 px.
import type React from 'react'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'
import { FONTS_HREF } from '@/features/retail-promo/RetailPromoCard'
import type { CatalogFormat, CatalogPlan, CatalogTheme } from '../../catalogTypes'

export const PX_PER_MM = 96 / 25.4

export function pagePx(format: CatalogFormat): { w: number; h: number } {
  return { w: Math.round(format.widthMm * PX_PER_MM), h: Math.round(format.heightMm * PX_PER_MM) }
}

/** Contexte de rendu passé à toutes les pages (une seule prop drill, pas de store dans le rendu). */
export interface CatalogRenderCtx {
  plan: CatalogPlan
  format: CatalogFormat
  rowsById: Map<string, MergeRow>
  columns: MergeColumn[]
  fieldMap: Partial<Record<PromoFieldKey, string>>
  catalogName: string
  totalPages: number
  coverImageUrl: string | null
  backCoverImageUrl: string | null
}

/** Charge une fois les polices Google (nécessaire aussi pour html2canvas). */
export function ensureCatalogFonts(): void {
  if (typeof document === 'undefined' || document.getElementById('catalog-fonts')) return
  const link = document.createElement('link')
  link.id = 'catalog-fonts'; link.rel = 'stylesheet'; link.href = FONTS_HREF
  document.head.appendChild(link)
}

export function themeVars(theme: CatalogTheme): React.CSSProperties {
  return {
    '--cat-accent': theme.accent, '--cat-bg': theme.pageBg, '--cat-ink': theme.ink,
    '--cat-head-bg': theme.headerBg, '--cat-head-ink': theme.headerInk,
    '--cat-font-h': `'${theme.fontHeading}', sans-serif`, '--cat-font-b': `'${theme.fontBody}', sans-serif`,
  } as React.CSSProperties
}

export function formatPrice(n: number | null): string {
  if (n == null) return ''
  return `${n.toFixed(2).replace('.', ',')} €`
}

export const CATALOG_CSS = `
.cat-page * { margin:0; padding:0; box-sizing:border-box; }
.cat-page { position:relative; overflow:hidden; background:var(--cat-bg,#fff); color:var(--cat-ink,#111827);
  font-family:var(--cat-font-b,'Inter',sans-serif); display:flex; flex-direction:column; }
.cat-head { flex:none; background:var(--cat-head-bg,#111827); color:var(--cat-head-ink,#fff);
  padding:14px 32px; display:flex; align-items:baseline; gap:10px; }
.cat-head-univers { font-family:var(--cat-font-h); font-weight:800; font-size:18px; text-transform:uppercase; letter-spacing:.08em; }
.cat-head-crumb { font-size:13px; opacity:.85; }
.cat-head-sep { opacity:.5; }
.cat-foot { flex:none; margin-top:auto; border-top:2px solid var(--cat-accent); padding:10px 32px;
  display:flex; justify-content:space-between; font-size:11px; opacity:.9; }
.cat-grid { flex:1; display:grid; gap:16px; padding:24px 32px; min-height:0; }
.cat-cell { display:flex; flex-direction:column; border:1px solid rgba(0,0,0,.08); border-radius:8px; overflow:hidden; min-height:0; }
.cat-cell-img { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; background:#f8fafc; }
.cat-cell-img img { max-width:100%; max-height:100%; object-fit:contain; }
.cat-cell-img-ph { font-size:11px; color:#94a3b8; }
.cat-cell-body { flex:none; padding:10px 12px; display:flex; flex-direction:column; gap:2px; }
.cat-cell-brand { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--cat-accent); font-weight:700; }
.cat-cell-name { font-family:var(--cat-font-h); font-weight:700; font-size:13px;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cat-cell-desc { font-size:10px; opacity:.75; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cat-cell-row { display:flex; align-items:flex-end; justify-content:space-between; margin-top:4px; }
.cat-cell-ref { font-size:9px; opacity:.55; }
.cat-cell-price { font-family:var(--cat-font-h); font-weight:800; font-size:18px; color:var(--cat-accent); }
.cat-cell-was { font-size:11px; text-decoration:line-through; opacity:.55; margin-right:6px; }
.cat-featured .cat-cell-name { font-size:26px; -webkit-line-clamp:3; }
.cat-featured .cat-cell-desc { font-size:14px; -webkit-line-clamp:5; }
.cat-featured .cat-cell-price { font-size:40px; }
.cat-cover { flex:1; display:flex; flex-direction:column; justify-content:flex-end; padding:48px;
  background-size:cover; background-position:center; }
.cat-cover-title { font-family:var(--cat-font-h); font-weight:900; font-size:56px; line-height:1.05; }
.cat-cover-sub { font-size:20px; margin-top:12px; opacity:.9; }
.cat-cover-base { font-size:14px; margin-top:24px; opacity:.75; }
.cat-cover-band { align-self:flex-start; background:var(--cat-accent); color:#fff; padding:10px 22px;
  border-radius:6px; font-family:var(--cat-font-h); font-weight:800; letter-spacing:.12em; text-transform:uppercase; font-size:13px; margin-bottom:18px; }
.cat-toc { flex:1; padding:40px 48px; }
.cat-toc-title { font-family:var(--cat-font-h); font-weight:900; font-size:34px; margin-bottom:24px;
  border-bottom:3px solid var(--cat-accent); padding-bottom:12px; }
.cat-toc-entry { display:flex; align-items:baseline; gap:8px; padding:5px 0; font-size:13px; }
.cat-toc-entry.lvl1 { font-family:var(--cat-font-h); font-weight:800; font-size:16px; margin-top:10px; }
.cat-toc-entry.lvl2 { padding-left:18px; }
.cat-toc-entry.lvl3 { padding-left:36px; font-size:12px; opacity:.85; }
.cat-toc-dots { flex:1; border-bottom:1px dotted rgba(0,0,0,.35); }
.cat-toc-num { font-weight:700; color:var(--cat-accent); }
.cat-opener { flex:1; display:flex; flex-direction:column; justify-content:center; padding:48px; background:var(--cat-head-bg); color:var(--cat-head-ink); }
.cat-opener-kicker { font-size:13px; letter-spacing:.2em; text-transform:uppercase; color:var(--cat-accent); font-weight:800; }
.cat-opener-title { font-family:var(--cat-font-h); font-weight:900; font-size:48px; margin-top:12px; }
.cat-back { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:48px; text-align:center; }
.cat-back-title { font-family:var(--cat-font-h); font-weight:900; font-size:30px; }
.cat-back-text { font-size:13px; opacity:.8; white-space:pre-wrap; max-width:70%; }
`
```

- [ ] **Step 2 : `CatalogHeader.tsx`, `CatalogFooter.tsx`, `ProductCell.tsx`**

```tsx
// src/features/catalog/components/pages/CatalogHeader.tsx
// Header data-driven : breadcrumb Univers › Famille › Sous-famille de la page.
interface Props { breadcrumb: string[] }

export function CatalogHeader({ breadcrumb }: Props) {
  const [univers, ...rest] = breadcrumb
  return (
    <header className="cat-head">
      <span className="cat-head-univers">{univers}</span>
      {rest.map((label, i) => (
        <span key={i} className="cat-head-crumb"><span className="cat-head-sep">› </span>{label}</span>
      ))}
    </header>
  )
}
```

```tsx
// src/features/catalog/components/pages/CatalogFooter.tsx
interface Props { pageNumber: number; totalPages: number; catalogName: string }

export function CatalogFooter({ pageNumber, totalPages, catalogName }: Props) {
  return (
    <footer className="cat-foot">
      <span>{catalogName}</span>
      <span>{pageNumber} / {totalPages}</span>
    </footer>
  )
}
```

```tsx
// src/features/catalog/components/pages/ProductCell.tsx
// Fiche produit d'une cellule de grille. `featured` = pleine page (typo agrandie via .cat-featured).
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import { formatPrice } from './catalogCss'

interface Props { fields: PromoFields; featured: boolean }

export function ProductCell({ fields: f, featured }: Props) {
  return (
    <div className={`cat-cell${featured ? ' cat-featured' : ''}`}>
      <div className="cat-cell-img">
        {f.image ? <img src={f.image} alt="" crossOrigin="anonymous" /> : <span className="cat-cell-img-ph">Sans visuel</span>}
      </div>
      <div className="cat-cell-body">
        {f.brand && <span className="cat-cell-brand">{f.brand}</span>}
        <span className="cat-cell-name">{f.name || 'Produit'}</span>
        {f.description && <span className="cat-cell-desc">{f.description}</span>}
        <div className="cat-cell-row">
          <span className="cat-cell-ref">{f.ref}</span>
          <span>
            {f.oldPrice != null && f.newPrice != null && f.oldPrice > f.newPrice && <span className="cat-cell-was">{formatPrice(f.oldPrice)}</span>}
            <span className="cat-cell-price">{formatPrice(f.newPrice)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3 : Vérifier** — Run: `npx tsc -b` → 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/features/catalog/components/pages/catalogCss.ts src/features/catalog/components/pages/CatalogHeader.tsx src/features/catalog/components/pages/CatalogFooter.tsx src/features/catalog/components/pages/ProductCell.tsx
git commit -m "feat(catalog): CSS des pages + header/footer breadcrumb + cellule produit"
```

---

### Task 8 : Pages du catalogue (Cover, Toc, Opener, ProductGrid, dispatcher)

**Files:**
- Create: `src/features/catalog/components/pages/CoverPage.tsx`
- Create: `src/features/catalog/components/pages/TocPage.tsx`
- Create: `src/features/catalog/components/pages/OpenerPage.tsx`
- Create: `src/features/catalog/components/pages/ProductGridPage.tsx`
- Create: `src/features/catalog/components/pages/CatalogPageView.tsx`

**Interfaces:**
- Consumes: Task 7 (`CatalogRenderCtx`, `themeVars`, `pagePx`, `CATALOG_CSS`, `ensureCatalogFonts`, `CatalogHeader/Footer/ProductCell`), `extractPromoFields`, types.
- Produces: `CatalogPageView { page: CatalogPageDescriptor; ctx: CatalogRenderCtx }` — rend UNE page complète au format px (racine `div.cat-page` avec `<style>{CATALOG_CSS}</style>` inline, comme `RetailPromoCard` l.454).

- [ ] **Step 1 : Les 4 pages**

```tsx
// src/features/catalog/components/pages/CoverPage.tsx
// Couverture et 4e de couverture (variant). Fond image IA si disponible, sinon aplat thème.
import type { CatalogRenderCtx } from './catalogCss'

interface Props { ctx: CatalogRenderCtx; variant: 'cover' | 'back' }

export function CoverPage({ ctx, variant }: Props) {
  const { plan } = ctx
  const img = variant === 'cover' ? ctx.coverImageUrl : ctx.backCoverImageUrl
  const style = img
    ? { backgroundImage: `linear-gradient(rgba(0,0,0,.15), rgba(0,0,0,.55)), url(${img})`, color: '#fff' }
    : { background: plan.theme.headerBg, color: plan.theme.headerInk }
  if (variant === 'back') {
    return (
      <div className="cat-back" style={style}>
        <div className="cat-back-title">{plan.backCover.title}</div>
        {plan.backCover.text && <div className="cat-back-text">{plan.backCover.text}</div>}
      </div>
    )
  }
  return (
    <div className="cat-cover" style={style}>
      {plan.cover.baseline && <div className="cat-cover-band">{plan.cover.baseline}</div>}
      <h1 className="cat-cover-title">{plan.cover.title}</h1>
      {plan.cover.subtitle && <div className="cat-cover-sub">{plan.cover.subtitle}</div>}
    </div>
  )
}
```

```tsx
// src/features/catalog/components/pages/TocPage.tsx
import type { TocEntry } from '../../catalogTypes'
import type { CatalogRenderCtx } from './catalogCss'

interface Props { ctx: CatalogRenderCtx; entries: TocEntry[]; first: boolean }

export function TocPage({ ctx, entries, first }: Props) {
  return (
    <div className="cat-toc">
      {first && <h2 className="cat-toc-title">{ctx.plan.tocTitle}</h2>}
      {entries.map((e) => (
        <div key={e.nodeId} className={`cat-toc-entry lvl${e.level}`}>
          <span>{e.label}</span>
          <span className="cat-toc-dots" />
          <span className="cat-toc-num">{e.pageNumber}</span>
        </div>
      ))}
    </div>
  )
}
```

```tsx
// src/features/catalog/components/pages/OpenerPage.tsx
// Page d'ouverture d'un univers.
interface Props { label: string; catalogName: string }

export function OpenerPage({ label, catalogName }: Props) {
  return (
    <div className="cat-opener">
      <div className="cat-opener-kicker">{catalogName}</div>
      <h2 className="cat-opener-title">{label}</h2>
    </div>
  )
}
```

```tsx
// src/features/catalog/components/pages/ProductGridPage.tsx
// Grille N-up d'une page produits. Colonnes×lignes par densité (portrait).
import { extractPromoFields } from '@/features/retail-promo/promoMapping'
import type { CatalogGrid, ProductSlot } from '../../catalogTypes'
import type { CatalogRenderCtx } from './catalogCss'
import { ProductCell } from './ProductCell'

const GRID_DIMS: Record<CatalogGrid, [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 8: [2, 4] }

interface Props { ctx: CatalogRenderCtx; grid: CatalogGrid; slots: ProductSlot[] }

export function ProductGridPage({ ctx, grid, slots }: Props) {
  const [cols, rows] = GRID_DIMS[grid]
  return (
    <div className="cat-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {slots.map((slot) => {
        const row = ctx.rowsById.get(slot.rowId)
        if (!row) return <div key={slot.rowId} className="cat-cell" />
        return <ProductCell key={slot.rowId} fields={extractPromoFields(row, ctx.columns, ctx.fieldMap)} featured={slot.featured} />
      })}
    </div>
  )
}
```

- [ ] **Step 2 : Le dispatcher `CatalogPageView.tsx`**

```tsx
// src/features/catalog/components/pages/CatalogPageView.tsx
// Rend UNE page du catalogue à taille réelle (px 96 dpi). Utilisé par l'aperçu
// (mis à l'échelle via transform) ET par l'export (capture html2canvas).
import { useEffect } from 'react'
import type { CatalogPageDescriptor } from '../../catalogTypes'
import { CATALOG_CSS, ensureCatalogFonts, pagePx, themeVars, type CatalogRenderCtx } from './catalogCss'
import { CatalogHeader } from './CatalogHeader'
import { CatalogFooter } from './CatalogFooter'
import { CoverPage } from './CoverPage'
import { TocPage } from './TocPage'
import { OpenerPage } from './OpenerPage'
import { ProductGridPage } from './ProductGridPage'

interface Props { page: CatalogPageDescriptor; ctx: CatalogRenderCtx }

export function CatalogPageView({ page, ctx }: Props) {
  useEffect(() => { ensureCatalogFonts() }, [])
  const { w, h } = pagePx(ctx.format)
  const chrome = page.kind === 'products' || page.kind === 'toc' || page.kind === 'opener'
  return (
    <div className="cat-page" style={{ width: w, height: h, ...themeVars(ctx.plan.theme) }}>
      <style>{CATALOG_CSS}</style>
      {page.kind === 'products' && <CatalogHeader breadcrumb={page.breadcrumb} />}
      {page.kind === 'cover' && <CoverPage ctx={ctx} variant="cover" />}
      {page.kind === 'back-cover' && <CoverPage ctx={ctx} variant="back" />}
      {page.kind === 'toc' && <TocPage ctx={ctx} entries={page.entries} first={page.pageNumber === 2} />}
      {page.kind === 'opener' && <OpenerPage label={page.label} catalogName={ctx.catalogName} />}
      {page.kind === 'products' && <ProductGridPage ctx={ctx} grid={page.grid} slots={page.slots} />}
      {chrome && <CatalogFooter pageNumber={page.pageNumber} totalPages={ctx.totalPages} catalogName={ctx.catalogName} />}
    </div>
  )
}
```

- [ ] **Step 3 : Vérifier** — Run: `npx tsc -b && npm run lint` → 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/features/catalog/components/pages/
git commit -m "feat(catalog): rendu HTML des 5 types de pages (couverture, sommaire, ouverture, grille, 4e)"
```

---

### Task 9 : Shell du wizard (`CatalogBuilderPage.tsx` + `CatalogStepsNav.tsx` + autosauvegarde)

**Files:**
- Modify: `src/pages/CatalogBuilderPage.tsx` (remplace le squelette Task 6)
- Create: `src/features/catalog/components/CatalogStepsNav.tsx`
- Create: `src/features/catalog/useCatalogAutosave.ts`

**Interfaces:**
- Consumes: `useCatalogStore`, `loadCatalog`/`saveCatalog`, `loadPimMergeData`/`isPimSource`/`pimProjectIdFromSource` (`@/features/merge/pimSource`), composants steps (Tasks 10-14 — importés en lazy, chacun a un export nommé : `StepSource`, `StepStructure`, `StepPrompt`, `StepPreview`, `StepExport`).
- Produces: page plein écran : bandeau (nom éditable, retour Dashboard, état de sauvegarde) + nav des étapes + step actif. `useCatalogAutosave(): { saving: boolean }` — sauvegarde debouncée (2 s) du `toDoc()` à chaque changement persisté.

- [ ] **Step 1 : `useCatalogAutosave.ts`**

```ts
// src/features/catalog/useCatalogAutosave.ts
// Autosauvegarde debouncée du catalogue : chaque mutation du store (hors données
// brutes rechargées) réécrit users/{uid}/catalogs/{id} après 2 s d'inactivité.
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { saveCatalog } from './catalogsApi'

export function useCatalogAutosave(): { saving: boolean } {
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const unsub = useCatalogStore.subscribe((s, prev) => {
      if (!s.catalogId) return
      // Champs persistés seulement (rawRows/rawColumns sont rechargés depuis la source).
      const changed = s.name !== prev.name || s.sourceRef !== prev.sourceRef || s.selectedRowIds !== prev.selectedRowIds
        || s.levelKeys !== prev.levelKeys || s.treeEdits !== prev.treeEdits || s.prompt !== prev.prompt
        || s.plan !== prev.plan || s.fieldMap !== prev.fieldMap || s.format !== prev.format
        || s.coverImageUrl !== prev.coverImageUrl || s.backCoverImageUrl !== prev.backCoverImageUrl
      if (!changed) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        setSaving(true)
        try { await saveCatalog(useCatalogStore.getState().toDoc()) }
        catch (e) { toast.error(`Sauvegarde échouée : ${String((e as Error).message)}`) }
        finally { setSaving(false) }
      }, 2000)
    })
    return () => { unsub(); if (timer.current) clearTimeout(timer.current) }
  }, [])
  return { saving }
}
```

- [ ] **Step 2 : `CatalogStepsNav.tsx`**

```tsx
// src/features/catalog/components/CatalogStepsNav.tsx
import type { CatalogStep } from '@/stores/catalog.store'

const STEPS: { id: CatalogStep; label: string }[] = [
  { id: 'source', label: '1 · Source' },
  { id: 'structure', label: '2 · Structure' },
  { id: 'prompt', label: '3 · Prompt & style' },
  { id: 'preview', label: '4 · Aperçu' },
  { id: 'export', label: '5 · Export' },
]

interface Props { step: CatalogStep; onStep: (s: CatalogStep) => void; canLeave: boolean }

export function CatalogStepsNav({ step, onStep, canLeave }: Props) {
  return (
    <nav className="flex gap-1 px-6 py-2 border-b border-border bg-surface">
      {STEPS.map((s) => (
        <button key={s.id} onClick={() => canLeave && onStep(s.id)} disabled={!canLeave && s.id !== step}
          className={`px-3 py-1.5 rounded-md text-sm ${s.id === step ? 'bg-indigo-600 text-[#fff] font-medium' : 'text-muted-foreground hover:text-white hover:bg-surface-2'}`}>
          {s.label}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3 : `CatalogBuilderPage.tsx`**

```tsx
// src/pages/CatalogBuilderPage.tsx
// Builder plein écran d'un catalogue. Charge le doc, reconnecte la source PIM si
// besoin (les lignes ne sont pas persistées), puis rend l'étape active.
import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { loadCatalog } from '@/features/catalog/catalogsApi'
import { isPimSource, loadPimMergeData, pimProjectIdFromSource } from '@/features/merge/pimSource'
import { useCatalogAutosave } from '@/features/catalog/useCatalogAutosave'
import { CatalogStepsNav } from '@/features/catalog/components/CatalogStepsNav'

const StepSource = lazy(() => import('@/features/catalog/components/steps/StepSource').then((m) => ({ default: m.StepSource })))
const StepStructure = lazy(() => import('@/features/catalog/components/steps/StepStructure').then((m) => ({ default: m.StepStructure })))
const StepPrompt = lazy(() => import('@/features/catalog/components/steps/StepPrompt').then((m) => ({ default: m.StepPrompt })))
const StepPreview = lazy(() => import('@/features/catalog/components/steps/StepPreview').then((m) => ({ default: m.StepPreview })))
const StepExport = lazy(() => import('@/features/catalog/components/steps/StepExport').then((m) => ({ default: m.StepExport })))

export default function CatalogBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const s = useCatalogStore()
  const { saving } = useCatalogAutosave()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!id) return
    const boot = async () => {
      if (s.catalogId !== id) {
        const doc = await loadCatalog(id)
        if (!doc) { toast.error('Catalogue introuvable'); navigate('/dashboard'); return }
        s.hydrate(doc, id)
      }
      const st = useCatalogStore.getState()
      if (st.sourceRef && st.rawRows.length === 0 && isPimSource(st.sourceRef)) {
        try {
          const { columns, rows } = await loadPimMergeData(pimProjectIdFromSource(st.sourceRef))
          st.setSource(st.sourceRef, columns, rows)
        } catch (e) { toast.error(`Source PIM indisponible : ${String((e as Error).message)}`) }
      }
      setReady(true)
    }
    void boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!ready) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Chargement du catalogue…</div>
  return (
    <div className="h-screen bg-background text-white flex flex-col">
      <header className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface">
        <button onClick={() => navigate('/dashboard', { state: { section: 'catalog' } })} className="p-2 rounded-md hover:bg-surface-2" title="Retour">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <input value={s.name} onChange={(e) => s.setName(e.target.value)}
          className="bg-transparent text-base font-semibold outline-none focus:bg-surface-2 rounded px-2 py-1 flex-1 max-w-md" />
        <span className="text-xs text-muted-foreground">{saving ? 'Enregistrement…' : 'Enregistré'}</span>
      </header>
      <CatalogStepsNav step={s.step} onStep={s.setStep} canLeave={s.rawRows.length > 0} />
      <main className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={null}>
          {s.step === 'source' && <StepSource />}
          {s.step === 'structure' && <StepStructure />}
          {s.step === 'prompt' && <StepPrompt />}
          {s.step === 'preview' && <StepPreview />}
          {s.step === 'export' && <StepExport />}
        </Suspense>
      </main>
    </div>
  )
}
```

⚠️ Cette tâche ne compile PAS tant que les 5 steps n'existent pas. Créer chaque step en **stub compilable** dans cette tâche (le contenu réel arrive Tasks 10-14) :

```tsx
// src/features/catalog/components/steps/StepSource.tsx  (idem pour les 4 autres, en adaptant le nom)
export function StepSource() {
  return <div className="p-8 text-muted-foreground">Étape en construction</div>
}
```

- [ ] **Step 4 : Vérifier** — Run: `npx tsc -b && npm run lint` → 0 erreur. En dev : `/catalog/:id` affiche le bandeau, la nav d'étapes et le stub.

- [ ] **Step 5 : Commit**

```bash
git add src/pages/CatalogBuilderPage.tsx src/features/catalog/components/CatalogStepsNav.tsx src/features/catalog/useCatalogAutosave.ts src/features/catalog/components/steps/
git commit -m "feat(catalog): shell du builder plein écran — chargement doc, reconnexion PIM, autosave debouncée"
```

---

### Task 10 : Étape 1 — Source & sélection (`StepSource.tsx`)

**Files:**
- Modify: `src/features/catalog/components/steps/StepSource.tsx` (remplace le stub)
- Create: `src/features/catalog/useCatalogSource.ts`

**Interfaces:**
- Consumes: `listPimProjects`, `makePimSourceRef`, `loadPimMergeData` (`@/features/merge/pimSource`), `guessLevelKeys`, `defaultPromoFieldMap` (`@/features/retail-promo/promoMapping`), `useCatalogStore`, `useAuth` (chercher le hook existant : `grep -rn "export function useAuth" src/features/auth/`).
- Produces: `useCatalogSource(): { projects, loadingProjects, connect(projectId, projectName): Promise<void> }` — `connect` charge les données, initialise `fieldMap` (auto-guess) + `levelKeys` (auto-guess) + sélectionne TOUTES les lignes par défaut.

- [ ] **Step 1 : `useCatalogSource.ts`**

```ts
// src/features/catalog/useCatalogSource.ts
// Connexion de la source PIM : charge lignes+colonnes, auto-mappe champs fiche
// et niveaux taxonomiques, sélectionne tout par défaut.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase/config'
import { listPimProjects, loadPimMergeData, makePimSourceRef, type PimProjectSummary } from '@/features/merge/pimSource'
import { defaultPromoFieldMap } from '@/features/retail-promo/promoMapping'
import { guessLevelKeys } from './catalogTree'
import { useCatalogStore } from '@/stores/catalog.store'

export function useCatalogSource() {
  const [projects, setProjects] = useState<PimProjectSummary[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) { setLoadingProjects(false); return }
    listPimProjects(uid).then(setProjects).catch((e) => toast.error(String(e?.message ?? e))).finally(() => setLoadingProjects(false))
  }, [])

  const connect = async (projectId: string, projectName: string) => {
    setConnecting(true)
    try {
      const { columns, rows } = await loadPimMergeData(projectId)
      const s = useCatalogStore.getState()
      s.setSource(makePimSourceRef(projectId, projectName), columns, rows)
      s.setSelectedRowIds(rows.map((r) => r._id))
      s.setFieldMap(defaultPromoFieldMap(columns))
      s.setLevelKeys(guessLevelKeys(columns))
      toast.success(`${rows.length} produits chargés`)
    } catch (e) { toast.error(String((e as Error).message)) }
    finally { setConnecting(false) }
  }

  return { projects, loadingProjects, connecting, connect }
}
```

- [ ] **Step 2 : `StepSource.tsx`** — deux panneaux : gauche = projets PIM (boutons `connect`) ; droite = table de sélection (visible quand `rawRows.length > 0`) avec recherche, « Tout / Rien », cases à cocher, rendu limité aux 200 premières lignes filtrées (compteur « +N autres » au-delà), colonne nom via `fieldMap.name`. Bouton « Continuer → Structure » (`setStep('structure')`, disabled si 0 sélection). Respecter ≤150 lignes : extraire la ligne de table en petit composant local NON exporté si besoin. Utiliser `getRowValue(row, fieldMapName, columns)` pour afficher le nom.

- [ ] **Step 3 : Vérifier en dev** — connecter un projet PIM réel : toast « N produits chargés », sélection/recherche OK, « Continuer » passe à l'étape 2. `npx tsc -b && npm run lint` → 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/features/catalog/components/steps/StepSource.tsx src/features/catalog/useCatalogSource.ts
git commit -m "feat(catalog): étape Source — picker PIM + sélection produits avec auto-mapping"
```

---

### Task 11 : Étape 2 — Structure (`StepStructure.tsx`)

**Files:**
- Modify: `src/features/catalog/components/steps/StepStructure.tsx`
- Create: `src/features/catalog/components/steps/StructureTreeNode.tsx`

**Interfaces:**
- Consumes: `buildCatalogTree`, `flattenTree`, `useCatalogStore`, `CATALOG_FORMAT_PRESETS`.
- Produces: UI de l'arbre. L'arbre est TOUJOURS recalculé (`useMemo`) depuis `selectedRows + levelKeys + treeEdits` — jamais stocké tel quel (source de vérité = données + édits).

- [ ] **Step 1 : `StepStructure.tsx`** — trois zones :
  1. **Mapping des niveaux** : 3 `<select>` (Univers/Famille/Sous-famille) listant `rawColumns` (option « (aucun) ») → `setLevelKeys`.
  2. **Format de page** : select des `CATALOG_FORMAT_PRESETS` + champs « Personnalisé (mm) » largeur/hauteur → `setFormat`.
  3. **Arbre** : `const tree = useMemo(() => buildCatalogTree(selectedRows, rawColumns, levelKeys, treeEdits), [...])` rendu via `StructureTreeNode` récursif.
  Bouton « Continuer → Prompt & style ».

- [ ] **Step 2 : `StructureTreeNode.tsx`** — par nœud : libellé (double-clic → input de renommage → `setTreeEdits({ renames: { ...renames, [`${level}:${labelOrigine}`]: nouveau } })` ; attention : la clé utilise le label AVANT renommage — conserver le label d'origine dans les props), compteur produits du sous-arbre, boutons ↑/↓ (réordonne les ids frères → `setTreeEdits({ order: { ...order, [parentId]: nouvelOrdre } })` où `parentId` = id du parent ou `''` à la racine). Enfants indentés récursivement.

⚠️ Renommage : `buildCatalogTree` applique `renames` sur le label BRUT des données. Pour retrouver le label d'origine d'un nœud affiché (déjà renommé), inverser : passer à `StructureTreeNode` un `originalLabel` calculé en construisant une fois l'arbre SANS renames (`useMemo` parallèle) et en alignant par position, OU plus simple : stocker le mapping inverse `renamesInverse` construit depuis `treeEdits.renames`. Implémentation retenue (simple) : le nœud affiché avec label L au niveau N a pour clé de renommage `${N}:${origine}` où `origine = Object.entries(renames).find(([k, v]) => k.startsWith(`${N}:`) && v === L)?.[0].split(':')[1] ?? L`.

- [ ] **Step 3 : Vérifier en dev** — renommer un nœud (fusion en cas de doublon), réordonner, changer le mapping des niveaux : l'arbre se recalcule instantanément. `npx tsc -b && npm run lint` → 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/features/catalog/components/steps/StepStructure.tsx src/features/catalog/components/steps/StructureTreeNode.tsx
git commit -m "feat(catalog): étape Structure — mapping niveaux, format de page, arbre renommable/réordonnable"
```

---

### Task 12 : Étape 3 — Prompt & style (`StepPrompt.tsx` + génération couverture)

**Files:**
- Modify: `src/features/catalog/components/steps/StepPrompt.tsx`
- Create: `src/features/catalog/components/steps/PlanSectionRow.tsx`
- Create: `src/features/catalog/useCoverImage.ts`

**Interfaces:**
- Consumes: `generateCatalogPlan`, `defaultCatalogPlan` (Task 3), `useImageGeneration` (`@/features/nanobana/useImageGeneration`), `extractPromoFields`, `buildCatalogTree`, `useCatalogStore`, `CATALOG_GRIDS`, `pagePx`.
- Produces: plan généré dans le store ; `useCoverImage(): { generating, generateCover(prompt: string, target: 'cover' | 'back'): Promise<void> }`.

- [ ] **Step 1 : `useCoverImage.ts`**

```ts
// src/features/catalog/useCoverImage.ts
// Visuel de couverture via Nano Banana. L'image générée est uploadée à la galerie
// (useImageGallery) : on stocke son URL dans le doc catalogue.
import { useState } from 'react'
import { toast } from 'sonner'
import { useImageGeneration } from '@/features/nanobana/useImageGeneration'
import { useCatalogStore } from '@/stores/catalog.store'
import { pagePx } from './components/pages/catalogCss'

export function useCoverImage() {
  const { generateImage } = useImageGeneration()
  const [generating, setGenerating] = useState(false)

  const generateCover = async (prompt: string, target: 'cover' | 'back') => {
    if (!prompt.trim()) { toast.error('Renseignez d’abord le prompt image (plan IA ou saisie manuelle)'); return }
    setGenerating(true)
    try {
      const s = useCatalogStore.getState()
      const { w, h } = pagePx(s.format)
      const image = await generateImage({ prompt, targetWidth: w, targetHeight: h })
      if (!image) { toast.error('Génération du visuel échouée — couverture typographique conservée'); return }
      if (target === 'cover') s.setCoverImageUrl(image.url)
      else s.setBackCoverImageUrl(image.url)
      toast.success('Visuel de couverture généré')
    } finally { setGenerating(false) }
  }
  return { generating, generateCover }
}
```

⚠️ Vérifier le type retourné par `uploadToGallery` (champ URL : lire `src/features/nanobana/useImageGallery.ts` — adapter `image.url` au vrai nom de champ, ex. `image.url` ou `image.downloadURL`).

- [ ] **Step 2 : `StepPrompt.tsx`** — colonne gauche : textarea du prompt global + bouton « Générer le plan (IA) » :

```tsx
const generate = async () => {
  setBusy(true)
  try {
    const tree = buildCatalogTree(selectedRows, rawColumns, levelKeys, treeEdits)
    const sampleNames: Record<string, string[]> = {}
    for (const n of flattenTree(tree)) {
      sampleNames[n.id] = n.productIds.slice(0, 3).map((id) => {
        const row = rowsById.get(id)
        const f = row ? extractPromoFields(row, rawColumns, fieldMap) : null
        return `${id} — ${f?.name ?? id}`
      })
    }
    setPlan(await generateCatalogPlan(prompt, { catalogName: name, tree, sampleNames }))
    toast.success('Plan généré — ajustez-le librement ci-contre')
  } catch (e) {
    setPlan(defaultCatalogPlan(tree, name))
    toast.error(`IA indisponible (${String((e as Error).message).slice(0, 120)}) — plan par défaut appliqué`)
  } finally { setBusy(false) }
}
```

Colonne droite (si `plan`) : thème (inputs couleur pour accent/pageBg/ink/headerBg/headerInk, selects polices `FONT_OPTIONS`), textes couverture/4e (inputs contrôlés → `setPlan({ ...plan, cover: { ... } })`), boutons « Générer le visuel de couverture » / « … de 4e » (`useCoverImage`), et la liste des sections via `PlanSectionRow` (label du nœud, select grille `CATALOG_GRIDS`, vedettes en badges cliquables sur les 3 premiers produits du nœud → `toggleFeatured`). Bouton « Continuer → Aperçu » (disabled sans plan).

- [ ] **Step 3 : `PlanSectionRow.tsx`** — une ligne par section : `{ node: CatalogTreeNode; section: CatalogSectionPlan; sampleFields: { id: string; name: string }[]; onGrid: (g: CatalogGrid) => void; onToggleFeatured: (rowId: string) => void }`.

- [ ] **Step 4 : Vérifier en dev** — générer un plan avec un prompt réel (« catalogue outillage pro, bleu industriel, moderne ») : plan JSON appliqué, sections éditables, couverture générée par Nano Banana visible à l'étape 4. Tester le repli : couper le réseau → toast + plan par défaut. `npx tsc -b && npm run lint` → 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/features/catalog/components/steps/StepPrompt.tsx src/features/catalog/components/steps/PlanSectionRow.tsx src/features/catalog/useCoverImage.ts
git commit -m "feat(catalog): étape Prompt & style — plan IA éditable + visuels de couverture Nano Banana"
```

---

### Task 13 : Étape 4 — Aperçu (`StepPreview.tsx`)

**Files:**
- Modify: `src/features/catalog/components/steps/StepPreview.tsx`
- Create: `src/features/catalog/useCatalogPages.ts`

**Interfaces:**
- Consumes: `paginateCatalog`, `buildCatalogTree`, `CatalogPageView`, `CatalogRenderCtx`, `pagePx`, `useCatalogStore`.
- Produces: `useCatalogPages(): { pages: CatalogPageDescriptor[]; ctx: CatalogRenderCtx | null }` — hook partagé Aperçu + Export (source unique de la pagination).

- [ ] **Step 1 : `useCatalogPages.ts`**

```ts
// src/features/catalog/useCatalogPages.ts
// Source unique de la pagination : Aperçu ET Export consomment le même résultat.
import { useMemo } from 'react'
import { useCatalogStore } from '@/stores/catalog.store'
import { buildCatalogTree } from './catalogTree'
import { paginateCatalog } from './catalogEngine'
import { defaultCatalogPlan } from './catalogPlan'
import type { CatalogPageDescriptor } from './catalogTypes'
import type { CatalogRenderCtx } from './components/pages/catalogCss'

export function useCatalogPages(): { pages: CatalogPageDescriptor[]; ctx: CatalogRenderCtx | null } {
  const s = useCatalogStore()
  return useMemo(() => {
    if (s.rawRows.length === 0) return { pages: [], ctx: null }
    const selected = new Set(s.selectedRowIds)
    const rows = s.rawRows.filter((r) => selected.has(r._id))
    const tree = buildCatalogTree(rows, s.rawColumns, s.levelKeys, s.treeEdits)
    const plan = s.plan ?? defaultCatalogPlan(tree, s.name)
    const pages = paginateCatalog({ tree, sections: plan.sections })
    const ctx: CatalogRenderCtx = {
      plan, format: s.format, rowsById: new Map(rows.map((r) => [r._id, r])), columns: s.rawColumns,
      fieldMap: s.fieldMap, catalogName: s.name, totalPages: pages.length,
      coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl,
    }
    return { pages, ctx }
  }, [s.rawRows, s.rawColumns, s.selectedRowIds, s.levelKeys, s.treeEdits, s.plan, s.format, s.fieldMap, s.name, s.coverImageUrl, s.backCoverImageUrl])
}
```

- [ ] **Step 2 : `StepPreview.tsx`** — rail gauche de vignettes (une par page : numéro + kind, rendu **léger** : pas de CatalogPageView par vignette — un simple bouton libellé « 3 · Ouverture Outillage ») + zone centrale : la page courante en `CatalogPageView` mise à l'échelle pour tenir (`transform: scale(k)` avec `k = min(availW / w, availH / h)`, wrapper `overflow-hidden` de taille `w*k × h*k`). Navigation ←/→ clavier + boutons. Compteur « page X / N ». Bouton « Continuer → Export ».

- [ ] **Step 3 : Vérifier en dev** — catalogue PIM réel : la séquence couverture → sommaire (numéros exacts) → ouvertures → grilles avec header breadcrumb et footer paginé s'affiche ; navigation fluide sur 50+ pages (une seule page montée à la fois). `npx tsc -b && npm run lint` → 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/features/catalog/components/steps/StepPreview.tsx src/features/catalog/useCatalogPages.ts
git commit -m "feat(catalog): étape Aperçu — pagination live, viewer page à page mis à l'échelle"
```

---

### Task 14 : Étape 5 — Export PDF (`cropMarks.ts`, `useCatalogExport.ts`, `StepExport.tsx`)

**Files:**
- Create: `src/features/catalog/cropMarks.ts`
- Test: `src/features/catalog/cropMarks.test.ts`
- Create: `src/features/catalog/useCatalogExport.ts`
- Modify: `src/features/catalog/components/steps/StepExport.tsx`

**Interfaces:**
- Consumes: `useCatalogPages` (Task 13), `CatalogPageView`, `pagePx`, html2canvas + jspdf (imports dynamiques, pattern `src/lib/domExport.ts`), `createRoot`/`flushSync` (react-dom).
- Produces: `drawCropMarks(pdf: MarkCanvas, wMm, hMm, bleedMm): void` avec `MarkCanvas { setDrawColor(r,g,b): void; setLineWidth(w): void; line(x1,y1,x2,y2): void }` ; `useCatalogExport(): { exporting, progress, exportPdf(pages, ctx, opts: CatalogExportOptions): Promise<void> }` avec `CatalogExportOptions { mode: 'screen' | 'print'; dpi: 150 | 300; bleedMm: number; fileName: string }`.

- [ ] **Step 1 : Tests de `cropMarks.ts` (échec attendu)**

```ts
// src/features/catalog/cropMarks.test.ts
import { describe, expect, it } from 'vitest'
import { drawCropMarks, type MarkCanvas } from './cropMarks'

function fake(): { pdf: MarkCanvas; lines: number[][] } {
  const lines: number[][] = []
  return { lines, pdf: { setDrawColor: () => {}, setLineWidth: () => {}, line: (...a: number[]) => { lines.push(a) } } as MarkCanvas }
}

describe('drawCropMarks', () => {
  it('trace 8 traits (2 par coin) dans la marge de fond perdu', () => {
    const { pdf, lines } = fake()
    drawCropMarks(pdf, 210, 297, 3)
    expect(lines).toHaveLength(8)
    // Trait horizontal du coin haut-gauche : de x=0 à x=bleed-gap (2), à y=bleed (3).
    expect(lines).toContainEqual([0, 3, 2, 3])
    // Trait vertical du coin bas-droit : x = bleed+w (213), de y = bleed+h+gap (301) à y = pageH (303).
    expect(lines).toContainEqual([213, 301, 213, 303])
  })
  it('fond perdu nul ou trop petit → aucun trait', () => {
    const { pdf, lines } = fake()
    drawCropMarks(pdf, 210, 297, 0)
    drawCropMarks(pdf, 210, 297, 0.5)
    expect(lines).toHaveLength(0)
  })
})
```

- [ ] **Step 2 : Vérifier l'échec** — Run: `npx vitest run src/features/catalog/cropMarks.test.ts` → FAIL.

- [ ] **Step 3 : Implémenter `cropMarks.ts`**

```ts
// src/features/catalog/cropMarks.ts
// Traits de coupe aux 4 coins, en mm, dans la marge de fond perdu.
// Page PDF = (w+2b) × (h+2b) ; zone rognée = (b,b)-(b+w,b+h). GAP entre trait et zone.
const GAP_MM = 1

export interface MarkCanvas {
  setDrawColor(r: number, g: number, b: number): void
  setLineWidth(w: number): void
  line(x1: number, y1: number, x2: number, y2: number): void
}

export function drawCropMarks(pdf: MarkCanvas, wMm: number, hMm: number, bleedMm: number): void {
  if (bleedMm <= GAP_MM) return
  const b = bleedMm
  const inner = b - GAP_MM // longueur utile du trait depuis le bord de page
  const W = wMm + 2 * b
  const H = hMm + 2 * b
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.2)
  const corners: [number, number][] = [[b, b], [b + wMm, b], [b, b + hMm], [b + wMm, b + hMm]]
  for (const [x, y] of corners) {
    // Trait horizontal : vers le bord gauche ou droit.
    if (x === b) pdf.line(0, y, inner, y)
    else pdf.line(W - inner, y, W, y)
    // Trait vertical : vers le bord haut ou bas.
    if (y === b) pdf.line(x, 0, x, inner)
    else pdf.line(x, H - inner, x, H)
  }
}
```

⚠️ Aligner le test « bas-droit » sur cette implémentation : le trait vertical bas-droit est `line(213, H - inner, 213, H)` avec `H = 303`, `inner = 2` → `[213, 301, 213, 303]`. ✓

- [ ] **Step 4 : Vérifier le vert** — Run: `npx vitest run src/features/catalog/cropMarks.test.ts` → PASS.

- [ ] **Step 5 : Implémenter `useCatalogExport.ts`**

```ts
// src/features/catalog/useCatalogExport.ts
// Export PDF : rend chaque page hors écran (createRoot + flushSync), attend polices
// et images, capture html2canvas (scale = dpi/96), ajoute une page jsPDF en mm.
// Mode print : page agrandie du fond perdu + traits de coupe (drawCropMarks).
// Une page qui échoue ne bloque pas l'export : page blanche + récapitulatif.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import type { CatalogPageDescriptor } from './catalogTypes'
import { CatalogPageView } from './components/pages/CatalogPageView'
import { pagePx, type CatalogRenderCtx } from './components/pages/catalogCss'
import { drawCropMarks } from './cropMarks'

export interface CatalogExportOptions { mode: 'screen' | 'print'; dpi: 150 | 300; bleedMm: number; fileName: string }

async function waitAssets(host: HTMLElement): Promise<void> {
  await document.fonts.ready
  await Promise.all(Array.from(host.querySelectorAll('img')).map((img) =>
    img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res() }),
  ))
}

export function useCatalogExport() {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)

  const exportPdf = async (pages: CatalogPageDescriptor[], ctx: CatalogRenderCtx, opts: CatalogExportOptions) => {
    setExporting(true)
    setProgress(0)
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-99999px;top:0;'
    document.body.appendChild(host)
    const root = createRoot(host)
    const failed: number[] = []
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      const { widthMm: w, heightMm: h } = ctx.format
      const b = opts.mode === 'print' ? opts.bleedMm : 0
      const scale = opts.dpi / 96
      const pdf = new jsPDF({ orientation: w + 2 * b >= h + 2 * b ? 'landscape' : 'portrait', unit: 'mm', format: [w + 2 * b, h + 2 * b] })
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage([w + 2 * b, h + 2 * b], w + 2 * b >= h + 2 * b ? 'landscape' : 'portrait')
        if (b > 0) { pdf.setFillColor(ctx.plan.theme.pageBg); pdf.rect(0, 0, w + 2 * b, h + 2 * b, 'F') }
        try {
          flushSync(() => root.render(<CatalogPageView page={pages[i]} ctx={ctx} />))
          await waitAssets(host)
          const el = host.firstElementChild as HTMLElement
          const canvas = await html2canvas(el, { scale, useCORS: true, logging: false, backgroundColor: ctx.plan.theme.pageBg })
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', b, b, w, h)
        } catch (e) {
          failed.push(pages[i].pageNumber)
          console.error('[catalog export] page', pages[i].pageNumber, e)
        }
        if (opts.mode === 'print') drawCropMarks(pdf, w, h, b)
        setProgress(Math.round(((i + 1) / pages.length) * 100))
      }
      pdf.save(opts.fileName)
      if (failed.length) toast.error(`Pages en échec (laissées blanches) : ${failed.join(', ')}`)
      else toast.success(`PDF exporté (${pages.length} pages)`)
    } finally {
      root.unmount()
      host.remove()
      setExporting(false)
    }
  }
  return { exporting, progress, exportPdf }
}
```

⚠️ `pagePx` inutilisé ici si non référencé — ne l'importer que si le fichier l'utilise réellement (sinon lint error). Le fichier est `.ts` avec du JSX (`root.render(<CatalogPageView …/>)`) → **le nommer `useCatalogExport.tsx`** et adapter les imports.

- [ ] **Step 6 : `StepExport.tsx`** — deux cartes : « PDF écran » (bouton direct, dpi 150, bleed 0) et « PDF print pro » (select DPI 150/300, input fond perdu mm défaut 3, note traits de coupe) ; nom de fichier prérempli `slug(name).pdf` ; barre de progression pendant l'export (`progress` %) ; récapitulatif nb pages depuis `useCatalogPages`.

- [ ] **Step 7 : Vérifier en dev** — exporter un catalogue réel en écran (léger) puis print 300 dpi + bleed 3 mm : ouvrir le PDF, vérifier traits de coupe aux 4 coins, numéros de sommaire cliquables non requis (v1), fidélité visuelle vs aperçu. `npx tsc -b && npm run lint && npm run test:run` → 0 erreur.

- [ ] **Step 8 : Commit**

```bash
git add src/features/catalog/cropMarks.ts src/features/catalog/cropMarks.test.ts src/features/catalog/useCatalogExport.tsx src/features/catalog/components/steps/StepExport.tsx
git commit -m "feat(catalog): export PDF écran + print pro (fond perdu, traits de coupe, pages en échec non bloquantes)"
```

---

### Task 15 : Vérification finale, déploiement

**Files:**
- Aucun nouveau fichier (corrections éventuelles).

- [ ] **Step 1 : Vérifications projet complètes**

```bash
npx tsc -b && npm run lint && npm run test:run && npx knip
```
Expected : 0 erreur type/lint, tous les tests verts (dont les ~23 nouveaux), knip exit 0 (si un export du module n'est utilisé nulle part → le dé-exporter ou l'utiliser).

- [ ] **Step 2 : Build de production**

```bash
npm run build
```
Expected : build OK. Vérifier qu'aucun chunk n'explose (html2canvas/jspdf restent en imports dynamiques).

- [ ] **Step 3 : Smoke test live complet** — en dev : créer un catalogue depuis un projet PIM réel, dérouler les 5 étapes (plan IA réel + couverture Nano Banana), exporter les deux PDF, rouvrir le catalogue depuis « Mes catalogues » (reprise d'édition), recharger l'onglet en cours d'édition (session survit).

- [ ] **Step 4 : Déploiement** (convention projet : commit puis deploy à chaque fin de tâche majeure)

```bash
firebase deploy --only firestore:rules && npm run build && firebase deploy --only hosting
```

- [ ] **Step 5 : Commit final éventuel + mise à jour mémoire projet** (fichier de mémoire du module : statut LIVRÉ, restes éventuels).

---

## Auto-revue du plan (faite)

- **Couverture spec** : wizard 5 étapes ✓, prompt global → `catalog.plan` ✓, couvertures IA ✓, sommaire 2 passes ✓, N produits/page IA + override ✓, headers/footers breadcrumb ✓, ouverture par univers ✓, formats ✓, PDF écran+print ✓, persistance + modèles ✓ (`catalogTemplatesApi` livré ; son UI de branchement = V1.1 si non câblée dans StepPrompt), repli sans IA ✓, RBAC+règles ✓. Phases 2/3 hors périmètre ✓.
- **Écart spec assumé** : réorganisation de l'arbre par boutons ↑/↓ (pas @dnd-kit) et rupture de page par nœud feuille — documentés en tête de plan.
- **Cohérence de types** : `CatalogRenderCtx` défini Task 7, consommé Tasks 8/13/14 ; `PaginateInput` Task 2 = usage Task 13 ; `MarkCanvas` Task 14 test = impl.
