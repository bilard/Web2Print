// src/features/telegram/runWorkflowFromInbox.ts
// Logique PURE de la commande /run : résoudre un workflow sauvegardé par son nom, et y injecter
// le texte d'entrée. Aucune dépendance Firebase — l'orchestration (listWorkflows + exécution)
// reste dans le worker. Testable isolément.
import type { Workflow } from '@/features/workflows/types'

export type RunResolution =
  | { ok: true; workflow: Workflow; input: string }
  | { ok: false; reason: 'no-name' | 'not-found'; available: string[] }

/**
 * Résout le workflow visé par `/run <nom> <texte>`. Le nom n'a pas de délimiteur : on retient le
 * plus LONG nom de workflow réel qui préfixe le texte (insensible à la casse) ; le reste est le
 * texte d'entrée. `/run` seul (rest vide) → liste les workflows disponibles (reason 'no-name').
 */
export function resolveRun(workflows: Workflow[], rest: string): RunResolution {
  const trimmed = rest.trim()
  const available = workflows.map((w) => w.name).filter(Boolean)
  if (!trimmed) return { ok: false, reason: 'no-name', available }

  const lower = trimmed.toLowerCase()
  const match = workflows
    .filter((w) => {
      const n = w.name?.toLowerCase()
      return !!n && (lower === n || lower.startsWith(n + ' '))
    })
    .sort((a, b) => b.name.length - a.name.length)[0]

  if (!match) return { ok: false, reason: 'not-found', available }
  return { ok: true, workflow: match, input: trimmed.slice(match.name.length).trim() }
}

/**
 * Injecte le texte d'entrée dans tous les nodes « Saisie texte » (text-input) du workflow.
 * Retourne un CLONE éphémère (à exécuter, JAMAIS à persister via saveWorkflow) + le nombre de
 * nodes ciblés. Un input vide laisse le workflow inchangé.
 */
export function injectTextInput(
  wf: Workflow,
  input: string,
): { workflow: Workflow; injected: number } {
  if (!input) return { workflow: wf, injected: 0 }
  let injected = 0
  const nodes = wf.nodes.map((n) => {
    if (n.type !== 'text-input') return n
    injected++
    return { ...n, config: { ...(n.config as Record<string, unknown>), text: input } }
  })
  return { workflow: { ...wf, nodes }, injected }
}
