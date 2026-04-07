import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Brief } from './types'

async function fetchBrief(briefId: string): Promise<Brief | null> {
  const snap = await getDoc(doc(db, 'briefs', briefId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Brief
}

export function useBrief(briefId: string | null | undefined) {
  return useQuery({
    queryKey: ['brief', briefId],
    queryFn: () => fetchBrief(briefId!),
    enabled: !!briefId,
  })
}
