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

interface PendingEntry {
  tokensIn: number
  tokensOut: number
  costUsd: number
}

/** Délai d'agrégation avant flush Firestore. Trade-off : trop court = un write
 *  par message en chat actif ; trop long = perte au refresh non-flushé.
 *  5 s couvre la rafale type "5 messages d'affilée" sans risque mesurable. */
const FLUSH_DELAY_MS = 5_000

const pending: Map<AiProvider, PendingEntry> = new Map()
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function flushPending() {
  flushTimer = null
  if (pending.size === 0) return
  const userId = useAuthStore.getState().user?.uid
  if (!userId) {
    pending.clear()
    return
  }
  const month = new Date().toISOString().slice(0, 7)
  const docId = `${userId}_${month}`

  const byProvider: Record<string, { tokensIn: ReturnType<typeof increment>; tokensOut: ReturnType<typeof increment>; costUsd: ReturnType<typeof increment> }> = {}
  let totalCost = 0
  for (const [provider, entry] of pending) {
    byProvider[provider] = {
      tokensIn:  increment(entry.tokensIn),
      tokensOut: increment(entry.tokensOut),
      costUsd:   increment(entry.costUsd),
    }
    totalCost += entry.costUsd
  }
  pending.clear()

  try {
    await setDoc(
      doc(db, 'aiUsage', docId),
      {
        ownerId: userId,
        month,
        byProvider,
        total: { costUsd: increment(totalCost) },
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[aiUsageTracking] flushPending failed:', e)
  }
}

/** Flush immédiat — utile sur unmount, beforeunload, navigation route. */
export function flushAiUsage(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  return flushPending()
}

if (typeof window !== 'undefined') {
  // Best-effort : on ne peut pas await dans beforeunload, mais setDoc est déjà
  // dispatché de manière synchrone côté Firestore SDK avant la fermeture.
  window.addEventListener('beforeunload', () => { void flushAiUsage() })
}

/**
 * Persiste l'usage en Firestore (agrégat mensuel par provider) et retourne le
 * coût USD calculé. Les writes Firestore sont batchés sur {@link FLUSH_DELAY_MS}
 * pour éviter un setDoc par message — le coût est retourné en synchrone, donc
 * l'UI live peut l'afficher avant le flush réseau.
 */
export function recordAiUsage(params: RecordParams): number {
  const info = getModel(params.provider, params.model)
  const pricing = info?.pricing ?? { input: 0, output: 0 }
  const costUsd = computeCost(
    { input: params.inputTokens, output: params.outputTokens },
    pricing,
  )

  const existing = pending.get(params.provider) ?? { tokensIn: 0, tokensOut: 0, costUsd: 0 }
  existing.tokensIn += params.inputTokens
  existing.tokensOut += params.outputTokens
  existing.costUsd += costUsd
  pending.set(params.provider, existing)

  if (!flushTimer) {
    flushTimer = setTimeout(() => { void flushPending() }, FLUSH_DELAY_MS)
  }
  return costUsd
}
