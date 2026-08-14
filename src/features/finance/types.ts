// Vue minimale des stats d'usage consommée par le modèle de coûts (découple costModel
// de useUsageStats → testable sans Firestore).
export interface UsageStatsLike {
  aiCost: {
    total: number
    /** ⚠ `byModel` est OPTIONNEL : les écritures antérieures à 2026-05 n'en portent pas.
     *  Il est indispensable pour rattraper un coût sous-compté (modèle hors catalogue,
     *  tarif ajouté en cours de mois) — cf. `resolveProviderCost`. */
    byProvider: Record<string, {
      tokensIn: number; tokensOut: number; costUsd: number
      byModel?: Record<string, { tokensIn: number; tokensOut: number; costUsd: number }>
    }>
  }
  scrape: { total: number; byPlatform: Record<string, { tokens: number; requests: number; costUsd: number }> }
  brightData: { requests: number; costUsd: number }
  removebg: { images: number; credits: number; costUsd: number }
}
