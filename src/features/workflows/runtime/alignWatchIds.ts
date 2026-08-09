// Aligner toutes les cartes de Veille tarifaire sur UN suivi. PUR.
//
// La divergence de `watchId` est la panne la plus coûteuse du module : la moisson écrit
// sous un chemin Firestore, le comparatif relit sous un autre, le rapport sort VIDE et
// rien ne le signale. Le pré-vol la détecte ; ce module la referme.
//
// ⚠ Écrit la valeur DÉRIVÉE dans la config. `deriveWatchId` la repasse par `stableId`,
// qui est idempotent — sans quoi l'alignement dériverait une seconde fois et produirait
// un troisième chemin.
import { deriveWatchId } from '@/features/priceWatch/sourceSites'
import type { Workflow } from '../types'

/** Le node est-il piloté par un « Sites sources » branché ? Sa config locale est alors
 *  IGNORÉE à l'exécution : y écrire un suivi ne changerait rien. */
export function drivenBySourceSites(wf: Workflow, nodeId: string): boolean {
  const src = wf.edges.find((e) => e.target === nodeId && e.targetHandle === 'sites')
  return !!src && wf.nodes.find((n) => n.id === src.source)?.type === 'source-sites'
}

/** Le suivi réellement adressé, mêmes règles que `resolveSitesInput`. */
export function watchIdOf(wf: Workflow, nodeId: string, config: Record<string, unknown>): string {
  const src = wf.edges.find((e) => e.target === nodeId && e.targetHandle === 'sites')
  const srcNode = src ? wf.nodes.find((n) => n.id === src.source) : undefined
  if (srcNode?.type === 'source-sites') {
    const c = (srcNode.config ?? {}) as Record<string, unknown>
    return deriveWatchId(String(c.watchId ?? ''), wf.id)
  }
  return deriveWatchId(String(config.watchId ?? ''), wf.id)
}

/** Écrit `watchId` sur les cartes désignées. Les autres, et le reste du graphe, intacts. */
export function alignWatchIds(wf: Workflow, nodeIds: string[], watchId: string): Workflow {
  const targets = new Set(nodeIds)
  return {
    ...wf,
    nodes: wf.nodes.map((n) =>
      targets.has(n.id) ? { ...n, config: { ...(n.config ?? {}), watchId } } : n),
  }
}
