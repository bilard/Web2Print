// Lignes du bloc « Coûts des modèles » : fournisseurs consommateurs, et sous chacun le
// détail par modèle. PUR — aucun accès réseau, aucun rendu.
//
// ⚠⚠ `unpriced` est la raison d'être de ce module. `recordAiUsage` tarife via `getModel()` :
// un identifiant absent d'`AI_MODELS` retombe sur un tarif nul, et le coût s'écrit ZÉRO en
// base sans le moindre signal. Relevé en production : 1,18 M tokens de sortie DeepSeek
// affichés « 0,000000 € », parce que `deepseek-v4-flash` n'était pas au catalogue. Des
// tokens comptés sans coût ne sont pas gratuits — ils sont NON CHIFFRÉS, et un total qui
// les contient est un plancher, jamais un total.
import { getModel, type AiProvider } from '@/lib/aiModels'
import { computeCost } from '@/features/stats/aiUsageTracking'
import type { AiCostStats } from '@/features/stats/useUsageStats'

interface ModelCostRow {
  id: string
  /** Libellé du catalogue quand il existe, sinon l'identifiant brut — qui est justement
   *  l'information utile lorsqu'un modèle n'est pas reconnu. */
  label: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  /** Des tokens consommés, aucun coût, et AUCUN tarif connu : le montant est introuvable. */
  unpriced: boolean
  /** Coût RECALCULÉ ici, faute d'avoir été enregistré. Le montant est bon, mais il ne vient
   *  pas de la base : il se distingue à l'affichage plutôt que de se faire passer pour un
   *  relevé. */
  estimated: boolean
}

interface ProviderCostRow {
  provider: AiProvider
  tokensIn: number
  tokensOut: number
  costUsd: number
  models: ModelCostRow[]
}

export interface OpsCostSummary {
  rows: ProviderCostRow[]
  /** Somme des coûts CONNUS. */
  totalUsd: number
  /** Au moins un modèle non tarifé : `totalUsd` est un minimum. */
  partial: boolean
}

export function buildOpsCostRows(
  providers: readonly AiProvider[],
  stats: AiCostStats | undefined,
): OpsCostSummary {
  const rows: ProviderCostRow[] = []
  for (const provider of providers) {
    const usage = stats?.byProvider[provider]
    // Un fournisseur qui n'a rien consommé n'a rien à dire : un écran d'exploitation ne
    // montre pas huit lignes à zéro pour en cacher deux qui travaillent.
    if (!usage || (usage.costUsd <= 0 && usage.tokensIn <= 0)) continue
    const models = Object.entries(usage.byModel)
      .map(([id, leaf]) => {
        const info = getModel(provider, id)
        const used = leaf.tokensIn + leaf.tokensOut > 0
        // ⚠ Le coût est FIGÉ en base au moment de l'appel : ajouter un tarif au catalogue
        // ne répare pas le passé. Les tokens, eux, sont là — et le tarif désormais aussi,
        // donc le montant se recalcule. Sans ça, un mois entier resterait marqué
        // « tarif inconnu » alors que le prix est connu depuis.
        const rescued = leaf.costUsd === 0 && used && info
          ? computeCost({ input: leaf.tokensIn, output: leaf.tokensOut }, info.pricing)
          : 0
        return {
          id,
          label: info?.label ?? id,
          tokensIn: leaf.tokensIn,
          tokensOut: leaf.tokensOut,
          costUsd: leaf.costUsd || rescued,
          // Un tarif à zéro EXISTE au catalogue (modèles gratuits) : ce n'est pas un
          // tarif manquant. Seule l'absence du modèle l'est.
          unpriced: leaf.costUsd === 0 && used && !info,
          estimated: rescued > 0,
        }
      })
      // Le plus cher d'abord ; à coût égal — donc souvent à zéro — le plus gros volume :
      // c'est lui qui pèse sur la facture qu'on ne sait pas encore chiffrer.
      .sort((a, b) => b.costUsd - a.costUsd || (b.tokensIn + b.tokensOut) - (a.tokensIn + a.tokensOut))
    // Le cumul du fournisseur est celui de la BASE : il ignore les coûts rattrapés. On
    // prend le plus élevé des deux — jamais moins que ce que la base affirme, jamais
    // moins que la somme de ses propres modèles.
    const fromModels = models.reduce((n, m) => n + m.costUsd, 0)
    rows.push({
      provider, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut,
      costUsd: Math.max(usage.costUsd, fromModels), models,
    })
  }
  return {
    rows,
    totalUsd: rows.reduce((n, r) => n + r.costUsd, 0),
    partial: rows.some((r) => r.models.some((m) => m.unpriced)),
  }
}
