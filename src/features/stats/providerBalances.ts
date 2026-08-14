// Soldes RÉELS récupérés par API — DeepSeek, OpenRouter (endpoints publics, CORS-OK) et
// OpenAI (par Cloud Function : ses endpoints de facturation refusent le navigateur).
// Claude/Gemini/Qwen/Kimi ne publient leur solde que dans leur console : pour eux, la
// colonne montre le restant calculé (budget − dépensé), côté composant.
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { getApiKey } from '@/lib/apiKeys'

/** Détail du dernier appel OpenAI — pourquoi le solde manque, quand il manque. Lu par le
 *  panneau live pour ne pas se contenter d'un tiret muet. */
export interface OpenAiBalanceInfo {
  balanceUsd: number | null
  spentThisMonthUsd: number | null
  source: 'credit_grants' | 'costs' | null
  errors: { creditGrants?: string; costs?: string }
}
let lastOpenAi: OpenAiBalanceInfo | null = null
export function lastOpenAiBalanceInfo(): OpenAiBalanceInfo | null { return lastOpenAi }

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

  // OpenAI : passe par la Function `getOpenAiBalance` — ses endpoints de facturation ne
  // portent pas d'en-tête CORS, un `fetch` du navigateur échoue avant même l'authentification.
  // ⚠ L'échec est ATTENDU sur une clé de projet ordinaire (OpenAI réserve le solde à une clé
  // de session) : on garde alors la raison plutôt que de laisser croire à une panne.
  if (getApiKey('openai')) {
    try {
      const call = httpsCallable<undefined, OpenAiBalanceInfo>(functions, 'getOpenAiBalance')
      const info = (await call()).data
      lastOpenAi = info
      if (typeof info.balanceUsd === 'number') out.openai = info.balanceUsd
    } catch (e) {
      lastOpenAi = {
        balanceUsd: null, spentThisMonthUsd: null, source: null,
        errors: { creditGrants: e instanceof Error ? e.message : String(e) },
      }
    }
  }

  return out
}
