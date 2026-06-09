// src/features/pim/useSources.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveSources } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import type { Source } from './types'

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
