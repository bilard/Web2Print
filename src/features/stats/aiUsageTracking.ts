import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { getModel, type AiProvider } from '@/lib/aiModels'
import { useAuthStore } from '@/stores/auth.store'

export function computeCost(
  tokens: { input: number; output: number },
  pricing: { input: number; output: number },
): number {
  return (tokens.input * pricing.input + tokens.output * pricing.output) / 1_000_000
}

interface RecordParams {
  provider: AiProvider
  model: string
  inputTokens: number
  outputTokens: number
}

export async function recordAiUsage(params: RecordParams): Promise<void> {
  try {
    const userId = useAuthStore.getState().user?.uid
    if (!userId) return

    const info = getModel(params.provider, params.model)
    const pricing = info?.pricing ?? { input: 0, output: 0 }
    const costUsd = computeCost(
      { input: params.inputTokens, output: params.outputTokens },
      pricing,
    )

    const month = new Date().toISOString().slice(0, 7)
    const docId = `${userId}_${month}`

    await setDoc(
      doc(db, 'aiUsage', docId),
      {
        ownerId: userId,
        month,
        [`byProvider.${params.provider}.tokensIn`]: increment(params.inputTokens),
        [`byProvider.${params.provider}.tokensOut`]: increment(params.outputTokens),
        [`byProvider.${params.provider}.costUsd`]: increment(costUsd),
        'total.costUsd': increment(costUsd),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[aiUsageTracking] recordAiUsage failed:', e)
  }
}
