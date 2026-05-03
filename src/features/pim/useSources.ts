// src/features/pim/useSources.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveSources } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import type { Source, Product } from './types'
import { useDeleteProducts } from './useProducts'

export function useUpsertSource(projectId: string) {
  const qc = useQueryClient()
  const upsertSource = usePimStore((s) => s.upsertSource)
  return useMutation({
    mutationFn: async (source: Source) => {
      const project = usePimStore.getState().projects.find((p) => p.id === projectId)
      if (!project) throw new Error('Projet introuvable')
      const idx = project.sources.findIndex((s) => s.id === source.id)
      const sources = idx >= 0
        ? project.sources.map((s, i) => (i === idx ? source : s))
        : [...project.sources, source]
      await saveSources(projectId, sources)
      console.log('[useUpsertSource] before upsertSource, projectId:', projectId)
      upsertSource(projectId, source)
      const stateAfter = usePimStore.getState()
      const targetPrj = stateAfter.projects.find((p) => p.id === projectId)
      console.log('[useUpsertSource] after upsertSource:', {
        projectId,
        currentProjectId: stateAfter.currentProjectId,
        projectsCount: stateAfter.projects.length,
        targetProjectSourcesCount: targetPrj?.sources.length,
        targetProjectSourceIds: targetPrj?.sources.map((s) => s.id),
        newSourceId: source.id,
      })
      return source
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pim', 'project', projectId] })
      qc.invalidateQueries({ queryKey: ['pim', 'projects'] })
    },
  })
}

/** Supprime une source ET cascade : produits dont c'est la dernière source → supprimés. */
export function useRemoveSource(projectId: string) {
  const qc = useQueryClient()
  const removeSource = usePimStore((s) => s.removeSource)
  const deleteProducts = useDeleteProducts(projectId)
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const project = usePimStore.getState().projects.find((p) => p.id === projectId)
      if (!project) return { removedProductIds: [] as string[] }

      // 1. Supprime la source
      const newSources = project.sources.filter((s) => s.id !== sourceId)
      await saveSources(projectId, newSources)
      removeSource(projectId, sourceId)

      // 2. Cascade products
      const products = usePimStore.getState().products
      const orphans: string[] = []
      const toUpdate: Product[] = []
      for (const p of products) {
        const remainingLinks = p.sourceLinks.filter((l) => l.sourceId !== sourceId)
        if (remainingLinks.length === 0) {
          orphans.push(p._id)
        } else if (remainingLinks.length !== p.sourceLinks.length) {
          toUpdate.push({ ...p, sourceLinks: remainingLinks })
        }
      }
      if (orphans.length > 0) {
        await deleteProducts.mutateAsync(orphans)
      }
      // Note : toUpdate écrits via batch séparé pour rester atomique
      // (à brancher dans Phase 6 quand l'UI le déclenchera).
      return { removedProductIds: orphans, updatedProducts: toUpdate }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pim', 'project', projectId] })
      qc.invalidateQueries({ queryKey: ['pim', 'projects'] })
    },
  })
}
