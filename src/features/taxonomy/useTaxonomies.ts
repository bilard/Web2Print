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
  const list = snapshot.docs.map(
    (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Taxonomy)
  )
  return list.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
}

export function useTaxonomies() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['taxonomies', user?.uid],
    queryFn: () => fetchTaxonomies(user!.uid),
    enabled: !!user,
  })
}
