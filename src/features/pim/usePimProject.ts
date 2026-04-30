// src/features/pim/usePimProject.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProjects, loadProject, saveProjectHeader, deleteProject } from './usePimFirebase'
import { usePimStore } from '@/stores/pim.store'
import type { Project } from './types'

const KEYS = {
  list: ['pim', 'projects'] as const,
  byId: (id: string) => ['pim', 'project', id] as const,
}

export function useProjectsList() {
  const setProjects = usePimStore((s) => s.setProjects)
  return useQuery({
    queryKey: KEYS.list,
    queryFn: async () => {
      const projects = await listProjects()
      setProjects(projects)
      return projects
    },
  })
}

export function useProject(projectId: string | null) {
  const upsertProject = usePimStore((s) => s.upsertProject)
  return useQuery({
    queryKey: KEYS.byId(projectId ?? '_'),
    queryFn: async () => {
      if (!projectId) return null
      const project = await loadProject(projectId)
      if (project) upsertProject(project)
      return project
    },
    enabled: !!projectId,
  })
}

export function useSaveProjectHeader() {
  const qc = useQueryClient()
  const upsertProject = usePimStore((s) => s.upsertProject)
  return useMutation({
    mutationFn: async (project: Project) => {
      await saveProjectHeader(project)
      upsertProject(project)
      return project
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: KEYS.list })
      qc.setQueryData(KEYS.byId(project.id), project)
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  const removeProject = usePimStore((s) => s.removeProject)
  return useMutation({
    mutationFn: async (projectId: string) => {
      await deleteProject(projectId)
      removeProject(projectId)
      return projectId
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  })
}
