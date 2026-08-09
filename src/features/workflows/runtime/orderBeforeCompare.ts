// Brancher un node de collecte EN AMONT du comparatif, pour garantir l'ordre. PUR.
//
// Le comparatif ne lit pas la donnée de cette arête — il relit l'index en Firestore. Le
// lien ne sert qu'à l'ORDONNANCEMENT : sans lui, les deux nodes partent en parallèle et
// la comparaison peut relire l'index avant que la collecte y ait écrit. C'est la raison
// d'être du port `harvest`, typé `any` et documenté comme entrée d'ordonnancement.
import type { Workflow, WorkflowEdge, NodeSpec } from '../types'

/**
 * Le SEUL port d'ordonnancement du comparatif.
 *
 * ⚠ `rules` en faisait partie et n'aurait jamais dû : il porte les règles d'appariement,
 * une donnée que le comparatif LIT. Y brancher la sortie d'un collecteur lui aurait fait
 * prendre une feuille de relevés pour ses règles — exactement ce que le commentaire de ce
 * module interdit. Le repli n'a jamais servi en pratique ; il n'attendait qu'un workflow
 * où `harvest` était pris.
 */
const ORDER_PORT = 'harvest'

/**
 * Rend un workflow où `feederId` précède `compareId`.
 *
 * ⚠ Le port d'ordonnancement se PARTAGE. Deux collecteurs alimentent couramment le même
 * comparatif (moisson + recherche dirigée) et il n'y a qu'un port : le refuser dès qu'il
 * était pris rendait la correction inopérante précisément dans le cas où elle sert.
 * C'est sans risque ici, et seulement ici : `harvest` est typé `any`, sa donnée est
 * IGNORÉE (l'index est relu depuis Firestore, pas depuis l'arête), et l'exécuteur fusionne
 * déjà les entrées multiples sur un même port au lieu de les écraser (`mergeInputValue`,
 * avec son jumeau serveur). La souris l'autorisait d'ailleurs depuis toujours —
 * `isValidConnection` ne regarde que le type, jamais si le handle est occupé.
 *
 * Sans ce port ni sortie à brancher, le workflow est rendu INCHANGÉ : mieux vaut ne rien
 * faire qu'inventer un lien sur un port qui porte une donnée attendue.
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
  if (!inputs.some((i) => i.name === ORDER_PORT)) return wf

  const edge: WorkflowEdge = {
    id: `e_${feederId}_${out.name}_${compareId}_${ORDER_PORT}`,
    source: feederId,
    sourceHandle: out.name,
    target: compareId,
    targetHandle: ORDER_PORT,
  }
  if (wf.edges.some((e) => e.id === edge.id)) return wf
  return { ...wf, edges: [...wf.edges, edge] }
}
