// src/features/workflows/promptToFlow/types.ts
import type { WorkflowNode, WorkflowEdge } from '../types'

/** Node tel que renvoyé par le LLM : ref locale, pas d'id ni de position. */
export interface RawNode {
  ref: string
  type: string
  label?: string
  /** Config en paires {key, value} : un objet à clés arbitraires n'est pas
   *  émis par la sortie structurée de Gemini → on passe par des paires. */
  config?: { key: string; value: string }[]
}

/** Edge tel que renvoyé par le LLM : références aux refs locales + noms de ports. */
export interface RawEdge {
  from: string
  fromPort: string
  to: string
  toPort: string
}

/** Graphe brut renvoyé par le LLM. */
export interface RawGraph {
  title: string
  summary: string
  nodes: RawNode[]
  edges: RawEdge[]
}

/** Problème détecté pendant la validation. `error` = écarté ; `warning` = signalé. */
export interface GraphIssue {
  level: 'error' | 'warning'
  message: string
}

/** Graphe matérialisé + validé, prêt à injecter (positions assignées séparément). */
export interface ValidatedGraph {
  title: string
  summary: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  issues: GraphIssue[]
}
