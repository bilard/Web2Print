// src/features/demo-express/types.ts
// Types du module « Démo express » : pipeline d'ensemencement du studio
// (PIM, DAM, catalogue, promo, workflow) avec les données du site d'un prospect.

export type DemoStepId =
  | 'charte'
  | 'discover'
  | 'enrich'
  | 'dam'
  | 'sheet'
  | 'catalog'
  | 'promo'
  | 'workflow'

export type DemoStepStatus = 'pending' | 'running' | 'done' | 'warning' | 'error' | 'skipped'

export interface DemoStep {
  id: DemoStepId
  label: string
  status: DemoStepStatus
  /** Détail live (« 3/12 — Perceuse GBH 5-40 ») ou motif d'échec. */
  detail?: string
}

/** Identifiants des artefacts créés, pour le panneau « Découvrez vos données ». */
export interface DemoResultLinks {
  sheetDocId?: string
  sheetName?: string
  productCount?: number
  damCount?: number
  catalogId?: string
  promoId?: string
  workflowId?: string
}
