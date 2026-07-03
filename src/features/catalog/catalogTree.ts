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

/** Nombre de produits du nœud ET de ses descendants (un univers peut n'avoir aucun produit direct). */
export function subtreeProductCount(n: CatalogTreeNode): number {
  return n.productIds.length + n.children.reduce((acc, c) => acc + subtreeProductCount(c), 0)
}

/** Parcours en profondeur (préfixe). Utilisé par le moteur de pagination et le plan IA. */
export function flattenTree(tree: CatalogTreeNode[]): CatalogTreeNode[] {
  const out: CatalogTreeNode[] = []
  const walk = (n: CatalogTreeNode) => { out.push(n); n.children.forEach(walk) }
  tree.forEach(walk)
  return out
}
