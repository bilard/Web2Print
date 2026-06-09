// src/features/pim/useProducts.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveProducts } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import type { Product } from './types'

const KEY = (projectId: string) => ['pim', 'products', projectId] as const

export function useUpsertProducts(projectId: string) {
  const qc = useQueryClient()
  const upsertProducts = usePimStore((s) => s.upsertProducts)
  return useMutation({
    mutationFn: async (products: Product[]) => {
      await saveProducts(projectId, products)
      upsertProducts(products)
      return products
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(projectId) }),
  })
}

