import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { BriefImage } from './types'

async function fetchBriefImages(briefId: string): Promise<BriefImage[]> {
  const snap = await getDocs(collection(db, 'briefs', briefId, 'images'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BriefImage))
}

export function useBriefImages(briefId: string | null | undefined) {
  return useQuery({
    queryKey: ['brief-images', briefId],
    queryFn: () => fetchBriefImages(briefId!),
    enabled: !!briefId,
  })
}

interface UpsertBriefImageInput {
  briefId: string
  image: Omit<BriefImage, 'updatedAt'>
}

/**
 * Upsert d'une image de brief.
 * Régénération = écrasement (1 slot par rôle, clé naturelle = id).
 */
export function useUpsertBriefImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ briefId, image }: UpsertBriefImageInput) => {
      const ref = doc(db, 'briefs', briefId, 'images', image.id)
      await setDoc(ref, {
        ...image,
        updatedAt: serverTimestamp(),
      })
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['brief-images', vars.briefId] })
    },
  })
}
