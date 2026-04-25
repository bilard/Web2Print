import { useQuery } from '@tanstack/react-query'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { AiProvider } from '@/lib/aiModels'

interface AiProviderUsage {
  tokensIn: number
  tokensOut: number
  costUsd: number
}

interface UsageStats {
  projectCount: number
  exportCount: number
  storageUsedMb: number
  storageQuotaMb: number
  aiCost: {
    total: number
    byProvider: Record<AiProvider, AiProviderUsage>
  }
}

const EMPTY_PROVIDER: AiProviderUsage = { tokensIn: 0, tokensOut: 0, costUsd: 0 }

async function fetchAiCost(userId: string): Promise<UsageStats['aiCost']> {
  const month = new Date().toISOString().slice(0, 7)
  const snap = await getDoc(doc(db, 'aiUsage', `${userId}_${month}`))
  if (!snap.exists()) {
    return {
      total: 0,
      byProvider: { claude: EMPTY_PROVIDER, gemini: EMPTY_PROVIDER, openai: EMPTY_PROVIDER },
    }
  }
  const data = snap.data() as {
    total?: { costUsd?: number }
    byProvider?: Partial<Record<AiProvider, Partial<AiProviderUsage>>>
  }
  const merge = (p: AiProvider): AiProviderUsage => ({
    tokensIn:  data.byProvider?.[p]?.tokensIn  ?? 0,
    tokensOut: data.byProvider?.[p]?.tokensOut ?? 0,
    costUsd:   data.byProvider?.[p]?.costUsd   ?? 0,
  })
  return {
    total: data.total?.costUsd ?? 0,
    byProvider: { claude: merge('claude'), gemini: merge('gemini'), openai: merge('openai') },
  }
}

async function fetchStats(userId: string): Promise<UsageStats> {
  const q = query(collection(db, 'projects'), where('ownerId', '==', userId))
  const [snap, aiCost] = await Promise.all([getDocs(q), fetchAiCost(userId)])

  let totalBytes = 0
  snap.docs.forEach((d) => {
    const data = d.data()
    if (data.canvasData) totalBytes += (data.canvasData as string).length * 2
    if (data.thumbnail) totalBytes += (data.thumbnail as string).length * 0.75
  })

  return {
    projectCount: snap.size,
    exportCount: 0,
    storageUsedMb: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
    storageQuotaMb: 500,
    aiCost,
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
