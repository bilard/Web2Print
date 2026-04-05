// src/features/projects/useProjects.ts
import { useQuery } from '@tanstack/react-query'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

export interface Project {
  id: string
  title: string
  ownerId: string
}

async function fetchProjects(userId: string): Promise<Project[]> {
  const q = query(
    collection(db, 'projects'),
    where('ownerId', '==', userId),
    orderBy('title', 'asc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({
    id: d.id,
    title: (d.data().title as string) ?? 'Sans titre',
    ownerId: d.data().ownerId as string,
  }))
}

export function useProjects() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['projects', user?.uid],
    queryFn: () => fetchProjects(user!.uid),
    enabled: !!user,
  })
}
