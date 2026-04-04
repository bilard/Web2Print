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
