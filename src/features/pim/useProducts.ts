// src/features/pim/useProducts.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { saveProducts } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { useQuota } from '@/features/access/useAccess'
import { incrementUsage } from '@/features/access/usage'
import { DEMO_LIMITS } from '@/features/access/permissions'
import type { Product } from './types'

const KEY = (projectId: string) => ['pim', 'products', projectId] as const

export function useUpsertProducts(projectId: string) {
  const qc = useQueryClient()
  const upsertProducts = usePimStore((s) => s.upsertProducts)
  const quota = useQuota()
  const bumpUsage = useAccessStore((s) => s.bumpUsage)
  const uid = useAuthStore((s) => s.user?.uid)
  return useMutation({
    mutationFn: async (products: Product[]) => {
      // Quota démo : plafonne le nombre de lignes cumulées. On compte chaque upsert
      // (conservateur : un ré-import consomme du quota) — suffisant pour une démo.
      if (quota.isDemo && !quota.canAddPim(products.length)) {
        const msg = quota.pimRows.remaining <= 0
          ? `Limite démo atteinte : ${DEMO_LIMITS.pimRows} lignes PIM maximum.`
          : `Limite démo : il reste ${quota.pimRows.remaining} ligne(s) sur ${DEMO_LIMITS.pimRows}.`
        toast.error(msg)
        throw new Error(msg)
      }
      await saveProducts(projectId, products)
      upsertProducts(products)
      if (quota.isDemo && uid) {
        bumpUsage({ pimRows: products.length }) // miroir local immédiat
        void incrementUsage(uid, { pimRows: products.length }).catch(() => {}) // compteur serveur (best-effort)
      }
      return products
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(projectId) }),
  })
}

