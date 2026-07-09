// src/features/pim/useProducts.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { saveProducts } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import { useAccessStore } from '@/stores/access.store'
import { useQuota } from '@/features/access/useAccess'
import { DEMO_LIMITS } from '@/features/access/permissions'
import type { Product } from './types'

const KEY = (projectId: string) => ['pim', 'products', projectId] as const

export function useUpsertProducts(projectId: string) {
  const qc = useQueryClient()
  const upsertProducts = usePimStore((s) => s.upsertProducts)
  const quota = useQuota()
  const bumpUsage = useAccessStore((s) => s.bumpUsage)
  return useMutation({
    mutationFn: async (products: Product[]) => {
      // Quota démo : pré-check UX (évite un aller-retour CF voué à l'échec). L'ENFORCEMENT
      // réel est serveur : saveProducts route les démos par la CF pimSaveProducts, qui
      // vérifie le quota et incrémente users/{uid}.usage.pimRows (les rules refusent
      // l'écriture directe des produits aux démos). On compte chaque upsert (conservateur).
      if (quota.isDemo && !quota.canAddPim(products.length)) {
        const msg = quota.pimRows.remaining <= 0
          ? `Limite démo atteinte : ${DEMO_LIMITS.pimRows} lignes PIM maximum.`
          : `Limite démo : il reste ${quota.pimRows.remaining} ligne(s) sur ${DEMO_LIMITS.pimRows}.`
        toast.error(msg)
        throw new Error(msg)
      }
      await saveProducts(projectId, products)
      upsertProducts(products)
      if (quota.isDemo) bumpUsage({ pimRows: products.length }) // miroir local (compteur serveur tenu par la CF)
      return products
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(projectId) }),
  })
}

