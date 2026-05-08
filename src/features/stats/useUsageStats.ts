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

interface BrightDataUsage {
  requests: number
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
  brightData: BrightDataUsage
}

const emptyProvider = (): AiProviderUsage => ({ tokensIn: 0, tokensOut: 0, costUsd: 0 })
const emptyBrightData = (): BrightDataUsage => ({ requests: 0, costUsd: 0 })

async function fetchAiCost(userId: string): Promise<UsageStats['aiCost']> {
  const month = new Date().toISOString().slice(0, 7)
  const snap = await getDoc(doc(db, 'aiUsage', `${userId}_${month}`))
  if (!snap.exists()) {
    return {
      total: 0,
      byProvider: { claude: emptyProvider(), gemini: emptyProvider(), openai: emptyProvider(), deepseek: emptyProvider(), qwen: emptyProvider(), kimi: emptyProvider(), openrouter: emptyProvider() },
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
    byProvider: { claude: merge('claude'), gemini: merge('gemini'), openai: merge('openai'), deepseek: merge('deepseek'), qwen: merge('qwen'), kimi: merge('kimi'), openrouter: merge('openrouter') },
  }
}

async function fetchBrightData(userId: string): Promise<BrightDataUsage> {
  const month = new Date().toISOString().slice(0, 7)
  const snap = await getDoc(doc(db, 'brightDataUsage', `${userId}_${month}`))
  if (!snap.exists()) return emptyBrightData()
  const data = snap.data() as Partial<BrightDataUsage>
  return {
    requests: data.requests ?? 0,
    costUsd: data.costUsd ?? 0,
  }
}

async function fetchStats(userId: string): Promise<UsageStats> {
  const q = query(collection(db, 'projects'), where('ownerId', '==', userId))
  const safeAiCost = (): Promise<UsageStats['aiCost']> =>
    fetchAiCost(userId).catch((e) => {
      console.warn('[useUsageStats] fetchAiCost failed:', e)
      return {
        total: 0,
        byProvider: { claude: emptyProvider(), gemini: emptyProvider(), openai: emptyProvider(), deepseek: emptyProvider(), qwen: emptyProvider(), kimi: emptyProvider(), openrouter: emptyProvider() },
      }
    })
  const safeBrightData = (): Promise<BrightDataUsage> =>
    fetchBrightData(userId).catch((e) => {
      console.warn('[useUsageStats] fetchBrightData failed:', e)
      return emptyBrightData()
    })
  const [snap, aiCost, brightData] = await Promise.all([getDocs(q), safeAiCost(), safeBrightData()])

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
    brightData,
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
