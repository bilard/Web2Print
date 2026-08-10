// Jumeau CLIENT de `firstWatchId` (functions/src/workflow/preflight.ts) : sert à rattacher
// un incident NAVIGATEUR (carte en erreur) au bon journal de la veille tarifaire — cf.
// `src/features/priceWatch/ops/incidents.ts`. PUR.
//
// ⚠ Ne tranche pas entre plusieurs suivis distincts (`validateWorkflow` le signale déjà
// au pré-vol) : un incident mal aiguillé reste préférable à aucun incident consigné.
import type { Workflow } from '../types'
import { WATCH_NODES } from './validateWorkflow'
import { watchIdOf } from './alignWatchIds'

/** Premier suivi adressé par ce workflow, ou `null` s'il n'en désigne aucun — un flux sans
 *  veille tarifaire n'a rien à faire dans le journal des incidents. */
export function firstWatchId(wf: Workflow): string | null {
  const connected = new Set<string>()
  for (const e of wf.edges) { connected.add(e.source); connected.add(e.target) }
  const active = wf.nodes.filter((n) => wf.edges.length === 0 || connected.has(n.id))
  const watcher = active.find((n) => WATCH_NODES.has(n.type))
  if (!watcher) return null
  return watchIdOf(wf, watcher.id, (watcher.config ?? {}) as Record<string, unknown>)
}
