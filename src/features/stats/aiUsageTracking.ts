import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { getModel, type AiProvider } from '@/lib/aiModels'
import { useAuthStore } from '@/stores/auth.store'

/** Listener temporaire enregistré par les routeurs LLM pendant qu'une requête
 *  est en vol — leur permet de capter tokens+coût pour l'indicateur live sans
 *  refactoriser tous les sites d'appel. Stack pour supporter les appels
 *  imbriqués (rare mais possible si un provider compose un autre). */
type UsageListener = (entry: { tokensIn: number; tokensOut: number; costUsd: number }) => void
const listeners: UsageListener[] = []

/** Enregistre un listener pour la durée d'un bloc — pattern push/pop pour
 *  supporter les appels concurrents. Renvoie une fonction de désinscription. */
export function pushAiUsageListener(listener: UsageListener): () => void {
  listeners.push(listener)
  return () => {
    const idx = listeners.lastIndexOf(listener)
    if (idx !== -1) listeners.splice(idx, 1)
  }
}

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

interface PendingLeaf {
  tokensIn: number
  tokensOut: number
  costUsd: number
}
interface PendingEntry extends PendingLeaf {
  /** Détail par modèle, agrégé en plus du total provider — permet à l'UI
   *  d'afficher chaque modèle (texte vs image) sur sa propre ligne. */
  byModel: Map<string, PendingLeaf>
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

  type FirestoreLeaf = {
    tokensIn: ReturnType<typeof increment>
    tokensOut: ReturnType<typeof increment>
    costUsd: ReturnType<typeof increment>
  }
  type FirestoreProviderEntry = FirestoreLeaf & {
    byModel: Record<string, FirestoreLeaf>
  }
  const byProvider: Record<string, FirestoreProviderEntry> = {}
  let totalCost = 0
  for (const [provider, entry] of pending) {
    const byModel: Record<string, FirestoreLeaf> = {}
    for (const [modelId, leaf] of entry.byModel) {
      byModel[modelId] = {
        tokensIn:  increment(leaf.tokensIn),
        tokensOut: increment(leaf.tokensOut),
        costUsd:   increment(leaf.costUsd),
      }
    }
    byProvider[provider] = {
      tokensIn:  increment(entry.tokensIn),
      tokensOut: increment(entry.tokensOut),
      costUsd:   increment(entry.costUsd),
      byModel,
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

  const existing: PendingEntry =
    pending.get(params.provider) ?? { tokensIn: 0, tokensOut: 0, costUsd: 0, byModel: new Map() }
  existing.tokensIn += params.inputTokens
  existing.tokensOut += params.outputTokens
  existing.costUsd += costUsd
  const modelLeaf = existing.byModel.get(params.model) ?? { tokensIn: 0, tokensOut: 0, costUsd: 0 }
  modelLeaf.tokensIn += params.inputTokens
  modelLeaf.tokensOut += params.outputTokens
  modelLeaf.costUsd += costUsd
  existing.byModel.set(params.model, modelLeaf)
  pending.set(params.provider, existing)

  // Notifie le listener du dernier routeur actif (LIFO) — pour l'indicateur live.
  const activeListener = listeners[listeners.length - 1]
  if (activeListener) {
    activeListener({
      tokensIn: params.inputTokens,
      tokensOut: params.outputTokens,
      costUsd,
    })
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => { void flushPending() }, FLUSH_DELAY_MS)
  }
  return costUsd
}
