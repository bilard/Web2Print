import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import {
  createPrompt,
  deletePrompt,
  listPrompts,
  recordPromptUse,
  updatePrompt,
} from './promptsApi'
import type { Prompt, PromptDraft } from './types'

const KEY = ['chat', 'prompts'] as const

export interface UsePromptsResult {
  prompts: Prompt[]
  isLoading: boolean
  error: Error | null
  uid: string | null
  create: (draft: PromptDraft) => Promise<Prompt>
  update: (
    id: string,
    patch: Partial<PromptDraft> & { favorite?: boolean },
  ) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  recordUse: (id: string) => Promise<void>
  duplicate: (id: string) => Promise<Prompt | null>
}

export function usePrompts(): UsePromptsResult {
  const uid = useAuthStore((s) => s.user?.uid ?? null)
  const qc = useQueryClient()

  const queryKey = [...KEY, uid] as const

  const query = useQuery<Prompt[]>({
    queryKey,
    queryFn: () => (uid ? listPrompts(uid) : Promise.resolve([])),
    enabled: !!uid,
    staleTime: 30_000,
  })

  const prompts = query.data ?? []

  const createMut = useMutation({
    mutationFn: async (draft: PromptDraft) => {
      if (!uid) throw new Error('Utilisateur non connecté')
      return createPrompt(uid, draft)
    },
    onSuccess: (p) => {
      qc.setQueryData<Prompt[]>(queryKey, (prev) => [p, ...(prev ?? [])])
    },
  })

  const updateMut = useMutation({
    mutationFn: async (args: {
      id: string
      patch: Partial<PromptDraft> & { favorite?: boolean }
    }) => {
      if (!uid) throw new Error('Utilisateur non connecté')
      await updatePrompt(uid, args.id, args.patch)
      return args
    },
    onSuccess: ({ id, patch }) => {
      qc.setQueryData<Prompt[]>(queryKey, (prev) =>
        (prev ?? []).map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
        ),
      )
    },
  })

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      if (!uid) throw new Error('Utilisateur non connecté')
      await deletePrompt(uid, id)
      return id
    },
    onSuccess: (id) => {
      qc.setQueryData<Prompt[]>(queryKey, (prev) =>
        (prev ?? []).filter((p) => p.id !== id),
      )
    },
  })

  const recordUseMut = useMutation({
    mutationFn: async (id: string) => {
      if (!uid) return
      await recordPromptUse(uid, id)
      return id
    },
    onSuccess: (id) => {
      if (!id) return
      qc.setQueryData<Prompt[]>(queryKey, (prev) =>
        (prev ?? []).map((p) =>
          p.id === id
            ? { ...p, usageCount: p.usageCount + 1, lastUsedAt: Date.now() }
            : p,
        ),
      )
    },
  })

  return {
    prompts,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    uid,
    create: (draft) => createMut.mutateAsync(draft),
    update: (id, patch) => updateMut.mutateAsync({ id, patch }).then(() => undefined),
    remove: (id) => removeMut.mutateAsync(id).then(() => undefined),
    toggleFavorite: async (id) => {
      const p = prompts.find((x) => x.id === id)
      if (!p) return
      await updateMut.mutateAsync({ id, patch: { favorite: !p.favorite } })
    },
    recordUse: async (id) => {
      await recordUseMut.mutateAsync(id)
    },
    duplicate: async (id) => {
      const p = prompts.find((x) => x.id === id)
      if (!p) return null
      return createMut.mutateAsync({
        title: `${p.title} (copie)`,
        content: p.content,
        category: p.category,
      })
    },
  }
}
