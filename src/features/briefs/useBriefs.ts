import { useQuery } from '@tanstack/react-query'
import {
  collection,
  query,
  where,
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
  // NB : on n'ajoute PAS de `orderBy('updatedAt')` côté Firestore pour éviter
  // d'exiger un index composite (ownerId + taxonomyId + updatedAt). On trie
  // côté client juste après — coût négligeable pour quelques dizaines de docs.
  if (typeof opts.limit === 'number') {
    constraints.push(fbLimit(opts.limit))
  }

  const q = query(collection(db, 'briefs'), ...constraints)
  const snapshot = await getDocs(q)
  const briefs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Brief))

  // Tri décroissant sur updatedAt (Firestore Timestamp ou string ISO, tolérant).
  return briefs.sort((a, b) => {
    const av = toMillis((a as unknown as { updatedAt?: unknown }).updatedAt)
    const bv = toMillis((b as unknown as { updatedAt?: unknown }).updatedAt)
    return bv - av
  })
}

function toMillis(v: unknown): number {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isNaN(t) ? 0 : t
  }
  if (typeof v === 'object' && v !== null) {
    const obj = v as { toMillis?: () => number; seconds?: number }
    if (typeof obj.toMillis === 'function') return obj.toMillis()
    if (typeof obj.seconds === 'number') return obj.seconds * 1000
  }
  return 0
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
