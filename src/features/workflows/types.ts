// src/features/workflows/types.ts
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export type PortType = string

export interface Port {
  name: string
  type: PortType
  required?: boolean
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
