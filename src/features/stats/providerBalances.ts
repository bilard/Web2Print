// src/features/stats/providerBalances.ts
// Soldes RÉELS récupérés par API — uniquement DeepSeek et OpenRouter (seuls providers
// à exposer un endpoint de solde ; Claude/OpenAI/Gemini/Qwen/Kimi gèrent le solde dans
// leur console de facturation, pas via API). Les autres → restant calculé (budget −
// dépensé) côté composant. Appels CORS-OK depuis le navigateur (mêmes endpoints que les
// tests de clé existants).
import { getApiKey } from '@/lib/apiKeys'

export async function fetchProviderBalances(): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {}

  // DeepSeek : GET /user/balance → balance_infos[].total_balance (string, USD).
  const ds = getApiKey('deepseek')
  if (ds) {
    try {
      const res = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${ds}` },
      })
      if (res.ok) {
        const j = (await res.json()) as { balance_infos?: { currency?: string; total_balance?: string }[] }
        const info = j.balance_infos?.find((b) => b.currency === 'USD') ?? j.balance_infos?.[0]
        const n = info ? Number(info.total_balance) : NaN
        if (Number.isFinite(n)) out.deepseek = n
      }
    } catch { /* CORS / réseau → pas de solde */ }
  }

  // OpenRouter : GET /api/v1/auth/key → data.limit_remaining (null = crédits illimités).
  const or = getApiKey('openrouter')
  if (or) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${or}` },
      })
      if (res.ok) {
        const j = (await res.json()) as { data?: { limit_remaining?: number | null } }
        const rem = j.data?.limit_remaining
        if (typeof rem === 'number') out.openrouter = rem
      }
    } catch { /* ignore */ }
  }

  return out
}
