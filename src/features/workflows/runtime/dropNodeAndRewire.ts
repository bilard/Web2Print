// Retirer une carte SANS couper le flux. Supprimer un node laisse ses voisins orphelins :
// l'aval perd sa source et ne repart pas — la « correction » remplace donc une panne par
// une autre, et il faut retrouver à la main quel lien rétablir. Ici on recoud : chaque
// sortie du node retiré est rebranchée sur l'entrée qui l'alimentait, quand les deux
// ports parlent le même type.
//
// PUR : le resolver de spec est injecté, aucun accès au store ni au registre.
import type { Workflow, WorkflowEdge, NodeSpec } from '../types'

/** Deux ports se branchent si leurs types coïncident — `any` accepte tout, des deux
 *  côtés (c'est la règle du canevas : cf. la validation de connexion de l'éditeur). */
function compatible(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return a === b || a === 'any' || b === 'any'
}

/**
 * Rend un workflow sans le node `nodeId`, ses liens recousus quand c'est possible.
 *
 * Un lien sortant sans entrée compatible est simplement supprimé : mieux vaut un aval
 * visiblement débranché — le pré-vol le signale aussitôt — qu'un lien inventé qui ferait
 * transiter une donnée d'un autre type.
 */
export function dropNodeAndRewire(
  wf: Workflow,
  nodeId: string,
  getSpec: (type: string) => NodeSpec | undefined,
): Workflow {
  const nodeById = new Map(wf.nodes.map((n) => [n.id, n]))
  const incoming = wf.edges.filter((e) => e.target === nodeId)
  const outgoing = wf.edges.filter((e) => e.source === nodeId)

  /** Type émis par la source d'un lien entrant (ce qui arrivait dans le node retiré). */
  const upstreamType = (e: WorkflowEdge): string | undefined => {
    const src = nodeById.get(e.source)
    return src && getSpec(src.type)?.outputs.find((p) => p.name === e.sourceHandle)?.type
  }
  /** Type attendu par la cible d'un lien sortant (ce que l'aval réclame). */
  const downstreamType = (e: WorkflowEdge): string | undefined => {
    const tgt = nodeById.get(e.target)
    return tgt && getSpec(tgt.type)?.inputs.find((p) => p.name === e.targetHandle)?.type
  }

  const rewired: WorkflowEdge[] = []
  for (const out of outgoing) {
    const want = downstreamType(out)
    const from = incoming.find((inc) => compatible(upstreamType(inc), want))
    if (!from) continue
    const edge: WorkflowEdge = {
      id: `e_${from.source}_${from.sourceHandle}_${out.target}_${out.targetHandle}`,
      source: from.source,
      sourceHandle: from.sourceHandle,
      target: out.target,
      targetHandle: out.targetHandle,
    }
    // Le lien existe peut-être déjà (l'amont alimentait aussi l'aval en direct) : un
    // doublon d'id ferait deux arêtes superposées dans le canevas.
    if (!wf.edges.some((e) => e.id === edge.id) && !rewired.some((e) => e.id === edge.id)) {
      rewired.push(edge)
    }
  }

  return {
    ...wf,
    nodes: wf.nodes.filter((n) => n.id !== nodeId),
    edges: [...wf.edges.filter((e) => e.source !== nodeId && e.target !== nodeId), ...rewired],
  }
}
