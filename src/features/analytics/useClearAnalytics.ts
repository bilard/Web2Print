import { useMutation, useQueryClient } from '@tanstack/react-query'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'

// Timeout client allongé : la suppression peut porter sur beaucoup d'events.
const clearAnalytics = httpsCallable<void, { deleted: number }>(functions, 'clearAnalytics', { timeout: 300_000 })

/** Vide tout l'historique analytics (owner-only côté serveur), puis rafraîchit les vues. */
export function useClearAnalytics() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data } = await clearAnalytics()
      return data.deleted
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analyticsEvents'] })
    },
  })
}
