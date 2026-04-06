import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Taxonomy } from './types'

async function fetchTaxonomyById(id: string): Promise<Taxonomy | null> {
  const snap = await getDoc(doc(db, 'taxonomies', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Taxonomy
}

export function useTaxonomyById(id: string | null) {
  return useQuery({
    queryKey: ['taxonomy', id],
    queryFn: () => fetchTaxonomyById(id!),
    enabled: !!id,
  })
}
