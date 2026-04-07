import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { Brief, BriefStep } from './types'
import type { ClientFormField } from '@/features/taxonomy/types'

interface CreateBriefInput {
  taxonomyId: string
  clientName: string
  formTemplateSnapshot: ClientFormField[]
}

interface UpdateBriefInput {
  briefId: string
  patch: Partial<Omit<Brief, 'id' | 'ownerId' | 'createdAt'>>
}

interface AdvanceStepInput {
  briefId: string
  step: BriefStep
}

export function useCreateBrief() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateBriefInput): Promise<string> => {
      if (!user) throw new Error('not authenticated')
      const ref = await addDoc(collection(db, 'briefs'), {
        taxonomyId: input.taxonomyId,
        ownerId: user.uid,
        clientName: input.clientName,
        status: 'draft',
        currentStep: 1,
        client: {
          formTemplateSnapshot: input.formTemplateSnapshot,
          values: {},
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return ref.id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}

export function useUpdateBrief() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ briefId, patch }: UpdateBriefInput) => {
      const ref = doc(db, 'briefs', briefId)
      await updateDoc(ref, {
        ...patch,
        updatedAt: serverTimestamp(),
      })
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['brief', vars.briefId] })
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}

export function useDeleteBrief() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (briefId: string) => {
      await deleteDoc(doc(db, 'briefs', briefId))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}

export function useAdvanceBriefStep() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ briefId, step }: AdvanceStepInput) => {
      const ref = doc(db, 'briefs', briefId)
      await updateDoc(ref, {
        currentStep: step,
        updatedAt: serverTimestamp(),
      })
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['brief', vars.briefId] })
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}
