import { useQuery } from '@tanstack/react-query'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { Taxonomy } from './types'

async function fetchTaxonomies(userId: string): Promise<Taxonomy[]> {
  const q = query(
    collection(db, 'taxonomies'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'asc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(
    (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Taxonomy)
  )
}

export function useTaxonomies() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['taxonomies', user?.uid],
    queryFn: () => fetchTaxonomies(user!.uid),
    enabled: !!user,
  })
}
