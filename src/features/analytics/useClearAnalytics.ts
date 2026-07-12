import { useMutation, useQueryClient } from '@tanstack/react-query'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'

// Timeout client allongé : la suppression peut porter sur beaucoup d'events.
const clearAnalytics = httpsCallable<void, { deleted: number }>(functions, 'clearAnalytics', { timeout: 300_000 })
const deleteAnalyticsEvents = httpsCallable<{ ids: string[] }, { deleted: number }>(functions, 'deleteAnalyticsEvents', { timeout: 300_000 })

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

/** Supprime une liste précise d'events (le résultat filtré affiché) — owner-only côté serveur. */
export function useDeleteFilteredAnalytics() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      if (ids.length === 0) return 0
      const { data } = await deleteAnalyticsEvents({ ids })
      return data.deleted
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analyticsEvents'] })
    },
  })
}

