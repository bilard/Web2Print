import { useQuery } from '@tanstack/react-query'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { ProjectData } from '@/types/project'

async function fetchProjects(userId: string): Promise<ProjectData[]> {
  const q = query(
    collection(db, 'projects'),
    where('ownerId', '==', userId),
    orderBy('updatedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  // IMPORTANT : `id: doc.id` doit venir APRÈS le spread pour ne jamais être écrasé
  // par un champ `id` résiduel présent dans doc.data() (ex: docs dupliqués).
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as ProjectData))
}

export function useProjects() {
  const user = useAuthStore((s) => s.user)

  return useQuery({
    queryKey: ['projects', user?.uid],
    queryFn: () => fetchProjects(user!.uid),
    enabled: !!user,
  })
}
