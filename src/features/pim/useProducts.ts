// src/features/pim/useProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { loadProducts, saveProducts, deleteProductsByIds } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import type { Product } from './types'

const KEY = (projectId: string) => ['pim', 'products', projectId] as const

export function useProducts(projectId: string | null) {
  const setProducts = usePimStore((s) => s.setProducts)
  return useQuery({
    queryKey: KEY(projectId ?? '_'),
    queryFn: async () => {
      if (!projectId) return []
      const products = await loadProducts(projectId)
      setProducts(products)
      return products
    },
    enabled: !!projectId,
  })
}

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

export function useDeleteProducts(projectId: string) {
  const qc = useQueryClient()
  const removeProduct = usePimStore.getState().removeProduct
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await deleteProductsByIds(projectId, ids)
      ids.forEach(removeProduct)
      return ids
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(projectId) }),
  })
}
