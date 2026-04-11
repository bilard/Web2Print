import { useQuery } from '@tanstack/react-query'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

interface UsageStats {
  projectCount: number
  exportCount: number
  storageUsedMb: number
  storageQuotaMb: number
}

async function fetchStats(userId: string): Promise<UsageStats> {
  const q = query(collection(db, 'projects'), where('ownerId', '==', userId))
  const snap = await getDocs(q)

  // Calcul approximatif stockage (taille des canvasData)
  let totalBytes = 0
  snap.docs.forEach((doc) => {
    const data = doc.data()
    if (data.canvasData) totalBytes += (data.canvasData as string).length * 2 // UTF-16
    if (data.thumbnail) totalBytes += (data.thumbnail as string).length * 0.75 // base64
  })

  return {
    projectCount: snap.size,
    exportCount: 0, // À implémenter avec un compteur Firestore
    storageUsedMb: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
    storageQuotaMb: 500,
  }
}

export function useUsageStats() {
  const user = useAuthStore((s) => s.user)

  return useQuery({
    queryKey: ['stats', user?.uid],
    queryFn: () => fetchStats(user!.uid),
    enabled: !!user,
    staleTime: 60_000,
  })
}
