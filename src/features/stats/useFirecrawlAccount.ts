// Solde de crédits Firecrawl, en direct depuis le navigateur. Même patron que
// `providerBalances` (appel CORS-OK avec la clé de l'utilisateur), et NON pas une Cloud
// Function comme Bright Data : la clé Firecrawl est PERSONNELLE (une par compte), il n'y
// a pas de compte partagé dont les données financières seraient à protéger.
import { useQuery } from '@tanstack/react-query'
import { getApiKey } from '@/lib/apiKeys'
import { parseFirecrawlCredits } from '@/lib/firecrawlCredits'

export interface FirecrawlAccount {
  /** Crédits restants, ou null si l'API n'en renvoie pas de lisible. */
  remainingCredits: number | null
  /** Crédits du plan (dénominateur), quand l'API le donne. */
  totalCredits: number | null
  /** Message d'erreur à montrer plutôt qu'un solde faussement rassurant. */
  error: string | null
  /** Réponse brute quand rien n'a pu être lu — sert le strip de debug de l'UI. */
  rawResponse?: unknown
}

const CREDIT_USAGE_URL = 'https://api.firecrawl.dev/v2/team/credit-usage'

async function fetchFirecrawlAccount(key: string): Promise<FirecrawlAccount> {
  const empty: FirecrawlAccount = { remainingCredits: null, totalCredits: null, error: null }
  try {
    const res = await fetch(CREDIT_USAGE_URL, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) {
      // 402 = plus de crédits : ce n'est pas une panne, c'est LE renseignement cherché.
      const reason = res.status === 401 || res.status === 403 ? 'clé refusée'
        : res.status === 402 ? 'crédits épuisés'
        : `HTTP ${res.status}`
      return { ...empty, error: reason }
    }
    const json = (await res.json()) as unknown
    const { remaining, total } = parseFirecrawlCredits(json)
    if (remaining === undefined && total === undefined) {
      return { ...empty, error: 'format de réponse inattendu', rawResponse: json }
    }
    return { remainingCredits: remaining ?? null, totalCredits: total ?? null, error: null }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Solde Firecrawl rafraîchi toutes les 60 s ; inactif tant qu'aucune clé n'est saisie. */
export function useFirecrawlAccount() {
  const key = getApiKey('firecrawl')
  return useQuery({
    queryKey: ['firecrawlAccount', key.slice(-6)],
    queryFn: () => fetchFirecrawlAccount(key),
    enabled: key !== '',
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  })
}
