// src/features/workflows/types.ts
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export type PortType = string

export interface Port {
  name: string
  type: PortType
  required?: boolean
}

type ConfigFieldKind =
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

type NodeRuntime = 'client' | 'server' | 'any'

export interface NodeSpec<C = unknown, I = unknown, O = unknown> {
  type: string
  category:
    | 'import'
    | 'enrichment'
    | 'transformation'
    | 'persistence'
    | 'export'
    | 'utility'
    | 'logic'
    | 'communication'
  label: string
  description: string
  icon: LucideIcon
  inputs: Port[]
  outputs: Port[]
  configSchema: ConfigField[]
  defaultConfig: C
  runtime: NodeRuntime
  /**
   * Connecteurs / services externes utilisés par le node (ids du registre
   * `registry/connectors.ts`), affichés en pastilles sous le titre de la carte.
   * Optionnel : si absent, un mapping par type prend le relais (cf. `connectorsForType`).
   */
  connectors?: string[]
  /**
   * Résumé court dérivé de la config courante, affiché sous le titre de la carte
   * (ex. planning d'un node cron). Recalculé à chaque édition de la config.
   * Retourner une chaîne vide pour ne rien afficher.
   */
  cardSummary?: (config: C) => string
  run: (ctx: RunContextApi, config: C, inputs: I) => Promise<O>
  ConfigComponent?: ComponentType<{
    config: C
    onChange: (next: C) => void
    /**
     * Colonnes/champs disponibles via les nodes upstream (typiquement les
     * en-têtes d'un CSV importé). Permet aux UIs de proposer une auto-
     * complétion sur les variables {{...}}.
     */
    availableColumns?: string[]
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
  /** Dossier de regroupement (null/absent = « Sans dossier »). */
  folderId?: string | null
}

/** Dossier de regroupement des workflows dans l'écran liste. */
export interface WorkflowFolder {
  id: string
  name: string
  createdAt: number
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
  /**
   * Config brut (sans interpolation des {{...}}) — utile pour les nodes qui
   * ont besoin de ré-interpoler eux-mêmes (ex : Send Gmail en mode "iterate"
   * pour envoyer un mail différent par row).
   */
  rawConfig?: unknown
}
