import type { Timestamp } from 'firebase/firestore'

// ─── Questions dynamiques par nœud ──────────────────────────────────────────
type DynamicQuestionType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'boolean'

export interface DynamicQuestion {
  id: string                 // uuid stable
  label: string
  type: DynamicQuestionType
  options?: string[]         // pour select / multiselect
  required: boolean
  helpText?: string
}

// ─── Champs du formulaire client (template par taxonomie) ───────────────────
export type ClientFormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'select'
  | 'color'
  | 'logo_upload'
  | 'brand_kit_upload'
  | 'budget_range'
  | 'address'

export interface ClientFormField {
  id: string                 // uuid stable
  key: string                // 'companyName', 'siret'...
  label: string
  type: ClientFormFieldType
  required: boolean
  placeholder?: string
  helpText?: string
  options?: string[]         // pour select
  group?: string             // 'Société' | 'Identité visuelle' | ...
  order: number
  builtin: boolean           // non supprimable
  hidden?: boolean           // masqué dans le rendu (Step1Form, preview, etc.)
}

// ─── Nœud de taxonomie ──────────────────────────────────────────────────────
export interface TaxonomyNode {
  id: string
  label: string
  parentId: string | null
  order: number
  level: number
  linkedProjectIds: string[]

  // Lot 1 : nouveaux champs (tous optionnels pour rétro-compat)
  magentoCategoryId?: string
  magentoSkus?: string[]
  questions?: DynamicQuestion[]
  questionsGeneratedAt?: Timestamp
}

// ─── Taxonomie ──────────────────────────────────────────────────────────────
export interface Taxonomy {
  id: string
  name: string
  ownerId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  nodes: Record<string, TaxonomyNode>

  // Lot 1 : template du formulaire client (1:1 avec la taxonomie)
  formTemplate?: ClientFormField[]

  // URL de la source / site web de la nomenclature
  sourceUrl?: string
}

export interface TaxonomyNodeWithChildren extends TaxonomyNode {
  children: TaxonomyNodeWithChildren[]
  isLeaf: boolean
}
