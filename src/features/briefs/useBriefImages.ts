import { useQuery } from '@tanstack/react-query'
import {
  collection,
  getDocs,
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
