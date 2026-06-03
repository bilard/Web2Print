import { useQuery } from '@tanstack/react-query'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { isOwnerEmail } from '@/features/auth/useAuth'

export interface BrightDataAccountStats {
  balanceUsd: number | null
  pendingBalanceUsd: number | null
  consumedThisMonthUsd: number | null
  bandwidthThisMonthBytes: number | null
  accountStatus: string | null
  nextBillingDate: string
  nextBillingDateFromApi: boolean
  month: string
  fetchedAt: string
  errors: { balance?: string; zoneCost?: string }
  rawBalanceResponse?: unknown
}

const callGetBrightDataAccount = httpsCallable<undefined, BrightDataAccountStats>(
  functions,
  'getBrightDataAccount',
)

/**
 * Récupère solde et consommation Bright Data en direct. Auto-refresh 60 s.
 * Nécessite le déploiement de la Cloud Function `getBrightDataAccount`.
 */
export function useBrightDataAccount() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['brightDataAccount', user?.uid],
    queryFn: async () => {
      const res = await callGetBrightDataAccount()
      return res.data
    },
    // Données financières du compte Bright Data partagé → réservées au propriétaire :
    // on ne déclenche même pas la Cloud Function pour les autres comptes.
    enabled: isOwnerEmail(user?.email),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  })
}
