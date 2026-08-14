// Ce qu'un modèle a RÉELLEMENT coûté, à partir de ce que la base a enregistré. PUR.
//
// ⚠⚠ Le coût est figé en base au moment de l'appel : `recordAiUsage` tarife via `getModel()`
// et un identifiant absent du catalogue retombe sur un tarif nul, sans le moindre signal.
// Ajouter le tarif après coup ne répare pas le passé — mais les tokens, eux, sont là.
//
// ⚠⚠ Et le cas MIXTE, mesuré en production le 2026-08-14 : `deepseek-v4-flash` cumulait
// 328 600 / 1 180 000 tokens pour « 0,0034 € », parce que le tarif n'est arrivé au catalogue
// qu'en cours de mois. Le montant n'était donc plus nul — donc plus rattrapé — alors qu'il
// valait cent fois moins que la réalité (≈ 0,376 $). Un coût enregistré n'est pas une preuve
// qu'il est complet : on compare toujours au recalcul, et on retient le plus élevé.
import { getModel, type AiProvider } from '@/lib/aiModels'
import { computeCost } from './aiUsageTracking'

export interface UsageLeaf { tokensIn: number; tokensOut: number; costUsd: number }

export interface ResolvedCost {
  /** Le montant à afficher — jamais moins que ce que la base affirme. */
  costUsd: number
  /** Des tokens consommés, aucun coût, et aucun tarif connu : le montant est introuvable. */
  unpriced: boolean
  /** Le montant a été relevé par recalcul : la base sous-comptait (tarif ajouté depuis).
   *  Il se distingue à l'affichage plutôt que de se faire passer pour un relevé. */
  estimated: boolean
}

/** En deçà, l'écart tient à l'arrondi ou à un centième de tarif — pas à un manque. Le
 *  signaler « estimé » ferait clignoter tous les modèles correctement facturés. */
const GAP_TOLERANCE = 0.01

export function resolveModelCost(provider: AiProvider, modelId: string, leaf: UsageLeaf): ResolvedCost {
  const used = leaf.tokensIn + leaf.tokensOut > 0
  const info = getModel(provider, modelId)
  // Un modèle sans tokens n'a rien à rattraper — et un coût nul n'y est pas une anomalie.
  if (!used) return { costUsd: leaf.costUsd, unpriced: false, estimated: false }
  // Hors catalogue : on ne peut PAS chiffrer. Le dire vaut mieux que d'afficher « gratuit ».
  // ⚠ Un tarif à zéro EXISTE au catalogue (modèles gratuits) : seule l'absence du modèle
  // est un tarif manquant.
  if (!info) return { costUsd: leaf.costUsd, unpriced: leaf.costUsd === 0, estimated: false }
  const recomputed = computeCost({ input: leaf.tokensIn, output: leaf.tokensOut }, info.pricing)
  const rescued = recomputed > leaf.costUsd * (1 + GAP_TOLERANCE)
  return {
    costUsd: rescued ? recomputed : leaf.costUsd,
    unpriced: false,
    estimated: rescued,
  }
}

/** Ce qu'un fournisseur a coûté, une fois ses modèles rattrapés. Le cumul de la BASE fait
 *  plancher : jamais moins que ce qu'elle affirme, jamais moins que la somme de ses lignes. */
export function resolveProviderCost(
  provider: AiProvider,
  /** ⚠ `byModel` peut MANQUER — écritures antérieures à son introduction, et fixtures. Sans
   *  détail par modèle il n'y a rien à rattraper : le cumul de la base fait foi. */
  usage: { costUsd: number; byModel?: Record<string, UsageLeaf> },
): number {
  const fromModels = Object.entries(usage.byModel ?? {})
    .reduce((n, [id, leaf]) => n + resolveModelCost(provider, id, leaf).costUsd, 0)
  return Math.max(usage.costUsd, fromModels)
}
