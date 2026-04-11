import { useQuery } from '@tanstack/react-query'
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { Taxonomy } from './types'

async function fetchTaxonomies(userId: string): Promise<Taxonomy[]> {
  const q = query(
    collection(db, 'taxonomies'),
    where('ownerId', '==', userId)
  )
  const snapshot = await getDocs(q)
  const items = snapshot.docs.map(
    (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Taxonomy)
  )
  return items.sort((a, b) => {
    const ta = (a as any).createdAt?.toMillis?.() ?? 0
    const tb = (b as any).createdAt?.toMillis?.() ?? 0
    return ta - tb
  })
}

export function useTaxonomies() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['taxonomies', user?.uid],
    queryFn: () => fetchTaxonomies(user!.uid),
    enabled: !!user,
  })
}
