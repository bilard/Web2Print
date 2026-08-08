// Brancher un node de collecte EN AMONT du comparatif, pour garantir l'ordre. PUR.
//
// Le comparatif ne lit pas la donnée de cette arête — il relit l'index en Firestore. Le
// lien ne sert qu'à l'ORDONNANCEMENT : sans lui, les deux nodes partent en parallèle et
// la comparaison peut relire l'index avant que la collecte y ait écrit. C'est la raison
// d'être du port `harvest`, typé `any` et documenté comme entrée d'ordonnancement.
import type { Workflow, WorkflowEdge, NodeSpec } from '../types'

/** Port d'ordonnancement du comparatif, dans l'ordre de préférence. */
const ORDER_PORTS = ['harvest', 'rules']

/**
 * Rend un workflow où `feederId` précède `compareId`.
 *
 * Sans port d'ordonnancement libre ni sortie à brancher, le workflow est rendu
 * INCHANGÉ : mieux vaut ne rien faire qu'inventer un lien sur un port qui porte une
 * donnée attendue — la comparaison lirait alors autre chose que son catalogue.
 */
export function orderBeforeCompare(
  wf: Workflow,
  feederId: string,
  compareId: string,
  getSpec: (type: string) => NodeSpec | undefined,
): Workflow {
  const feeder = wf.nodes.find((n) => n.id === feederId)
  const compare = wf.nodes.find((n) => n.id === compareId)
  if (!feeder || !compare) return wf

  const out = getSpec(feeder.type)?.outputs[0]
  if (!out) return wf

  const inputs = getSpec(compare.type)?.inputs ?? []
  // Un port déjà câblé reste tel quel : on ne remplace pas une entrée existante.
  const taken = new Set(wf.edges.filter((e) => e.target === compareId).map((e) => e.targetHandle))
  const port = ORDER_PORTS.find((p) => inputs.some((i) => i.name === p) && !taken.has(p))
  if (!port) return wf

  const edge: WorkflowEdge = {
    id: `e_${feederId}_${out.name}_${compareId}_${port}`,
    source: feederId,
    sourceHandle: out.name,
    target: compareId,
    targetHandle: port,
  }
  if (wf.edges.some((e) => e.id === edge.id)) return wf
  return { ...wf, edges: [...wf.edges, edge] }
}
