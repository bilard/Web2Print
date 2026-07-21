// src/features/finance/types.ts
// Vue minimale des stats d'usage consommée par le modèle de coûts (découple costModel
// de useUsageStats → testable sans Firestore).
export interface UsageStatsLike {
  aiCost: {
    total: number
    byProvider: Record<string, { tokensIn: number; tokensOut: number; costUsd: number }>
  }
  scrape: { total: number; byPlatform: Record<string, { tokens: number; requests: number; costUsd: number }> }
  brightData: { requests: number; costUsd: number }
  removebg: { images: number; credits: number; costUsd: number }
}
