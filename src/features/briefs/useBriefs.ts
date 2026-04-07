import { useQuery } from '@tanstack/react-query'
import {
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { Brief } from './types'

interface UseBriefsOptions {
  taxonomyId?: string
  limit?: number
}

async function fetchBriefs(
  userId: string,
  opts: UseBriefsOptions,
): Promise<Brief[]> {
  const constraints: QueryConstraint[] = [where('ownerId', '==', userId)]

  if (opts.taxonomyId) {
    constraints.push(where('taxonomyId', '==', opts.taxonomyId))
  }
  constraints.push(orderBy('updatedAt', 'desc'))
  if (typeof opts.limit === 'number') {
    constraints.push(fbLimit(opts.limit))
  }

  const q = query(collection(db, 'briefs'), ...constraints)
  const snapshot = await getDocs(q)
  return snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() } as Brief),
  )
}

/**
 * Liste les briefs de l'utilisateur courant.
 */
export function useBriefs(opts: UseBriefsOptions = {}) {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['briefs', user?.uid, opts.taxonomyId ?? null, opts.limit ?? null],
    queryFn: () => fetchBriefs(user!.uid, opts),
    enabled: !!user,
  })
}
