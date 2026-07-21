import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { getModel, type AiProvider } from '@/lib/aiModels'
import { useAuthStore } from '@/stores/auth.store'

/** Listener temporaire enregistré par les routeurs LLM pendant qu'une requête
 *  est en vol — leur permet de capter tokens+coût pour l'indicateur live sans
 *  refactoriser tous les sites d'appel. Stack pour supporter les appels
 *  imbriqués (rare mais possible si un provider compose un autre). */
type UsageListener = (entry: { tokensIn: number; tokensOut: number; costUsd: number; source?: string }) => void
const listeners: UsageListener[] = []

/** Observateurs GLOBAUX : notifiés à CHAQUE événement d'usage, indépendamment de
 *  la pile LIFO des listeners scopés (routeurs LLM). Un routeur pousse son
 *  listener au sommet pour compter les tokens de SON activité — mais ça masquait
 *  le coût aux indicateurs live (badge coût du modal de scraping), qui étaient
 *  sous le sommet et ne recevaient donc jamais les coûts LLM. Les observateurs
 *  reçoivent tout, une fois par événement. */
const observers: UsageListener[] = []
function notifyObservers(entry: { tokensIn: number; tokensOut: number; costUsd: number; source?: string }): void {
  for (const o of observers) { try { o(entry) } catch { /* un observateur ne casse pas le tracking */ } }
}

/** Enregistre un observateur global (indicateur live). Renvoie la désinscription. */
export function addUsageObserver(observer: UsageListener): () => void {
  observers.push(observer)
  return () => {
    const idx = observers.indexOf(observer)
    if (idx !== -1) observers.splice(idx, 1)
  }
}

// ── Coût des plateformes de scraping (Jina / Firecrawl / Bright Data) ────────
// Tarifs publics approximatifs — l'objectif est un ordre de grandeur fiable
// dans l'indicateur live, pas une facturation au centime.
export type ScrapePlatform = 'jina' | 'firecrawl' | 'brightdata'
const SCRAPE_RATES: Record<ScrapePlatform, { perMTokens?: number; perRequest?: number }> = {
  jina:       { perMTokens: 0.02 },    // Reader/Search : $0.02 / 1M tokens
  firecrawl:  { perRequest: 0.005 },   // ≈ 1 crédit/scrape (plan 3000 cr ≈ $16)
  brightdata: { perRequest: 0.0015 },  // Web Unlocker ≈ $1.5 / 1000 req
}

/** Comptabilise un appel à une plateforme de scraping et notifie l'indicateur
 *  live (même canal que les LLM). `tokens` pour Jina (réel si l'API le
 *  renvoie, sinon estimé chars/4 par l'appelant) ; `requests` pour les
 *  plateformes facturées à la requête. */
export function recordScrapeUsage(p: { platform: ScrapePlatform; tokens?: number; requests?: number }): number {
  const rate = SCRAPE_RATES[p.platform]
  const tokens = p.tokens ?? 0
  const requests = p.requests ?? (rate.perRequest ? 1 : 0)
  const costUsd = (rate.perMTokens ? (tokens / 1_000_000) * rate.perMTokens : 0)
    + (rate.perRequest ? requests * rate.perRequest : 0)
  const entry = { tokensIn: tokens, tokensOut: 0, costUsd, source: p.platform }
  const activeListener = listeners[listeners.length - 1]
  if (activeListener) activeListener(entry)
  notifyObservers(entry)
  // Persistance (batchée) — jina/firecrawl seulement ; brightdata a sa propre
  // collection (brightDataUsageTracking) → pas de double comptage.
  if (p.platform !== 'brightdata') {
    const e = pendingScrape.get(p.platform) ?? { tokens: 0, requests: 0, costUsd: 0 }
    e.tokens += tokens; e.requests += requests; e.costUsd += costUsd
    pendingScrape.set(p.platform, e)
    scheduleFlush()
  }
  return costUsd
}

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
/** Buffer scrape (jina/firecrawl) → persisté dans `scrapeUsage/{uid}_{month}`. */
interface PendingScrapeLeaf { tokens: number; requests: number; costUsd: number }
const pendingScrape: Map<ScrapePlatform, PendingScrapeLeaf> = new Map()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(() => { void flushPending() }, FLUSH_DELAY_MS)
}

async function flushPending() {
  flushTimer = null
  if (pending.size === 0 && pendingScrape.size === 0) return
  const userId = useAuthStore.getState().user?.uid
  if (!userId) {
    pending.clear()
    pendingScrape.clear()
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
  const hadAi = pending.size > 0
  pending.clear()

  if (hadAi) {
    try {
      await setDoc(
        doc(db, 'aiUsage', docId),
        { ownerId: userId, month, byProvider, total: { costUsd: increment(totalCost) } },
        { merge: true },
      )
    } catch (e) {
      console.warn('[aiUsageTracking] flushPending failed:', e)
    }
  }

  // Scrape (jina/firecrawl) — collection `scrapeUsage/{uid}_{month}`, agrégat mensuel.
  if (pendingScrape.size > 0) {
    const byPlatform: Record<string, { tokens: ReturnType<typeof increment>; requests: ReturnType<typeof increment>; costUsd: ReturnType<typeof increment> }> = {}
    let scrapeTotal = 0
    for (const [platform, e] of pendingScrape) {
      byPlatform[platform] = { tokens: increment(e.tokens), requests: increment(e.requests), costUsd: increment(e.costUsd) }
      scrapeTotal += e.costUsd
    }
    pendingScrape.clear()
    try {
      await setDoc(
        doc(db, 'scrapeUsage', docId),
        { ownerId: userId, month, byPlatform, total: { costUsd: increment(scrapeTotal) } },
        { merge: true },
      )
    } catch (e) {
      console.warn('[aiUsageTracking] scrape flush failed:', e)
    }
  }
}

/** Flush immédiat — utile sur unmount, beforeunload, navigation route. */
function flushAiUsage(): Promise<void> {
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

  // Notifie le listener du dernier routeur actif (LIFO, comptage scopé) PUIS les
  // observateurs globaux (indicateurs live) qui, eux, reçoivent tout.
  const entry = { tokensIn: params.inputTokens, tokensOut: params.outputTokens, costUsd, source: params.provider }
  const activeListener = listeners[listeners.length - 1]
  if (activeListener) activeListener(entry)
  notifyObservers(entry)

  scheduleFlush()
  return costUsd
}
