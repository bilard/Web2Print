import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { ref as storageRef, listAll, deleteObject } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { Brief } from './types'
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

/**
 * Supprime récursivement tous les fichiers sous un préfixe Storage.
 * Parcourt les sous-dossiers via listAll (Firebase Web SDK n'expose pas de
 * suppression récursive native).
 */
async function deleteStorageFolder(path: string): Promise<void> {
  const folderRef = storageRef(storage, path)
  const listing = await listAll(folderRef)
  await Promise.all([
    ...listing.items.map((item) => deleteObject(item).catch(() => undefined)),
    ...listing.prefixes.map((prefix) => deleteStorageFolder(prefix.fullPath)),
  ])
}

export function useDeleteBrief() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (briefId: string) => {
      // 1. Supprimer la sous-collection Firestore briefs/{id}/images
      const imagesSnap = await getDocs(
        collection(db, 'briefs', briefId, 'images'),
      )
      await Promise.all(imagesSnap.docs.map((d) => deleteDoc(d.ref)))

      // 2. Supprimer tous les fichiers Storage sous briefs/{id}/
      await deleteStorageFolder(`briefs/${briefId}`)

      // 3. Supprimer le document brief lui-même
      await deleteDoc(doc(db, 'briefs', briefId))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}

