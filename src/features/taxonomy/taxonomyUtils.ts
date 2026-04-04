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
  const visited = new Set<string>()
  let current: TaxonomyNode | undefined = nodes[nodeId]
  while (current) {
    if (visited.has(current.id)) break  // corrupt data: cycle detected
    visited.add(current.id)
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
  nodeId: string,
  visited: Set<string> = new Set()
): string[] {
  const result: string[] = []
  const children = Object.values(nodes).filter((n) => n.parentId === nodeId)
  for (const child of children) {
    if (visited.has(child.id)) continue  // cycle guard
    visited.add(child.id)
    result.push(child.id)
    result.push(...getAllDescendantIds(nodes, child.id, visited))
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
