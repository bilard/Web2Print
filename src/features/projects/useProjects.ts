import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useQuery } from '@tanstack/react-query'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
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
  const uid = useWorkspaceUid()

  return useQuery({
    queryKey: ['projects', uid],
    queryFn: () => fetchProjects(uid!),
    enabled: !!uid,
  })
}
