import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { ClientFormField } from '@/features/taxonomy/types'

interface SaveFormTemplateInput {
  taxonomyId: string
  fields: ClientFormField[]
}

/**
 * Mutation pour sauvegarder le `formTemplate` d'une taxonomie.
 * Le template est stocké directement sur le doc `taxonomies/{id}` (1:1).
 */
export function useSaveFormTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taxonomyId, fields }: SaveFormTemplateInput) => {
      const ref = doc(db, 'taxonomies', taxonomyId)
      await updateDoc(ref, {
        formTemplate: fields,
        updatedAt: serverTimestamp(),
      })
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['taxonomy', vars.taxonomyId] })
      queryClient.invalidateQueries({ queryKey: ['taxonomies'] })
    },
  })
}
