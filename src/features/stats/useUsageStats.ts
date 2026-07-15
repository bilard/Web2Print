import { useQuery } from '@tanstack/react-query'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { AiProvider } from '@/lib/aiModels'

interface AiUsageLeaf {
  tokensIn: number
  tokensOut: number
  costUsd: number
}

interface AiProviderUsage extends AiUsageLeaf {
  /** Détail par modèle (rempli depuis 2026-05). Vide ou absent pour les
   *  écritures antérieures, dans ce cas l'UI utilise uniquement l'agrégat. */
  byModel: Record<string, AiUsageLeaf>
}

export interface BrightDataUsage {
  requests: number
  costUsd: number
}

interface RemoveBgUsage {
  images: number
  credits: number
  costUsd: number
}

/** Coûts IA agrégés du mois (un total + le détail par provider). */
export type AiCostStats = UsageStats['aiCost']

interface UsageStats {
  projectCount: number
  storageUsedMb: number
  storageQuotaMb: number
  aiCost: {
    total: number
    byProvider: Record<AiProvider, AiProviderUsage>
  }
  brightData: BrightDataUsage
  removebg: RemoveBgUsage
}

const emptyProvider = (): AiProviderUsage => ({ tokensIn: 0, tokensOut: 0, costUsd: 0, byModel: {} })
const emptyBrightData = (): BrightDataUsage => ({ requests: 0, costUsd: 0 })
const emptyRemoveBg = (): RemoveBgUsage => ({ images: 0, credits: 0, costUsd: 0 })

export async function fetchAiCost(userId: string): Promise<UsageStats['aiCost']> {
  const month = new Date().toISOString().slice(0, 7)
  const snap = await getDoc(doc(db, 'aiUsage', `${userId}_${month}`))
  if (!snap.exists()) {
    return {
      total: 0,
      byProvider: { claude: emptyProvider(), gemini: emptyProvider(), openai: emptyProvider(), deepseek: emptyProvider(), qwen: emptyProvider(), kimi: emptyProvider(), glm: emptyProvider(), openrouter: emptyProvider() },
    }
  }
  const data = snap.data() as {
    total?: { costUsd?: number }
    byProvider?: Partial<Record<AiProvider, Partial<AiProviderUsage> & {
      byModel?: Record<string, Partial<AiUsageLeaf>>
    }>>
  }
  const merge = (p: AiProvider): AiProviderUsage => {
    const rawByModel = data.byProvider?.[p]?.byModel ?? {}
    const byModel: Record<string, AiUsageLeaf> = {}
    for (const [modelId, leaf] of Object.entries(rawByModel)) {
      byModel[modelId] = {
        tokensIn:  leaf?.tokensIn  ?? 0,
        tokensOut: leaf?.tokensOut ?? 0,
        costUsd:   leaf?.costUsd   ?? 0,
      }
    }
    return {
      tokensIn:  data.byProvider?.[p]?.tokensIn  ?? 0,
      tokensOut: data.byProvider?.[p]?.tokensOut ?? 0,
      costUsd:   data.byProvider?.[p]?.costUsd   ?? 0,
      byModel,
    }
  }
  return {
    total: data.total?.costUsd ?? 0,
    byProvider: { claude: merge('claude'), gemini: merge('gemini'), openai: merge('openai'), deepseek: merge('deepseek'), qwen: merge('qwen'), kimi: merge('kimi'), glm: merge('glm'), openrouter: merge('openrouter') },
  }
}

export async function fetchBrightData(userId: string): Promise<BrightDataUsage> {
  const month = new Date().toISOString().slice(0, 7)
  const snap = await getDoc(doc(db, 'brightDataUsage', `${userId}_${month}`))
  if (!snap.exists()) return emptyBrightData()
  const data = snap.data() as Partial<BrightDataUsage>
  return {
    requests: data.requests ?? 0,
    costUsd: data.costUsd ?? 0,
  }
}

async function fetchRemoveBg(userId: string): Promise<RemoveBgUsage> {
  const month = new Date().toISOString().slice(0, 7)
  const snap = await getDoc(doc(db, 'removebgUsage', `${userId}_${month}`))
  if (!snap.exists()) return emptyRemoveBg()
  const data = snap.data() as Partial<RemoveBgUsage>
  return {
    images: data.images ?? 0,
    credits: data.credits ?? 0,
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
        byProvider: { claude: emptyProvider(), gemini: emptyProvider(), openai: emptyProvider(), deepseek: emptyProvider(), qwen: emptyProvider(), kimi: emptyProvider(), glm: emptyProvider(), openrouter: emptyProvider() },
      }
    })
  const safeBrightData = (): Promise<BrightDataUsage> =>
    fetchBrightData(userId).catch((e) => {
      console.warn('[useUsageStats] fetchBrightData failed:', e)
      return emptyBrightData()
    })
  const safeRemoveBg = (): Promise<RemoveBgUsage> =>
    fetchRemoveBg(userId).catch((e) => {
      console.warn('[useUsageStats] fetchRemoveBg failed:', e)
      return emptyRemoveBg()
    })
  const [snap, aiCost, brightData, removebg] = await Promise.all([
    getDocs(q), safeAiCost(), safeBrightData(), safeRemoveBg(),
  ])

  let totalBytes = 0
  snap.docs.forEach((d) => {
    const data = d.data()
    if (data.canvasData) totalBytes += (data.canvasData as string).length * 2
    if (data.thumbnail) totalBytes += (data.thumbnail as string).length * 0.75
  })

  return {
    projectCount: snap.size,
    storageUsedMb: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
    storageQuotaMb: 500,
    aiCost,
    brightData,
    removebg,
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
