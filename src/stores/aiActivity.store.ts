/**
 * aiActivity.store — état temps réel des requêtes LLM en vol.
 *
 * Alimenté par les routeurs (`llmRouter`, `chatRouter`, `geminiImageClient`)
 * pour exposer dans l'UI un indicateur "live" : quel provider/modèle répond
 * à quelle tâche, en ce moment. Inclut aussi la dernière requête terminée
 * pour conserver un signal en idle.
 *
 * Volontairement non persisté : c'est un état éphémère de session.
 */

import { create } from 'zustand'
import type { LLMProviderId } from '@/features/ai/llmRouter'

export type AiActivityKind = 'json' | 'chat' | 'image'
export type AiActivityStatus = 'running' | 'success' | 'error'

export interface AiActivityRecord {
  id: string
  provider: LLMProviderId | 'gemini-image'
  model: string
  /** Étiquette lisible (ex: "design.templateFill", "chat", "Nano Banana"). */
  label: string
  kind: AiActivityKind
  startedAt: number
  status: AiActivityStatus
  /** Présent quand status !== 'running'. */
  endedAt?: number
  /** Présent quand status === 'error'. */
  errorMessage?: string
  /** Tokens consommés (renseigné quand le provider remonte une `usage`). */
  inputTokens?: number
  outputTokens?: number
  /** Coût estimé en USD (calculé depuis pricing × tokens). */
  costUsd?: number
}

export interface AiActivityEndPayload {
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
}

export interface AiSessionTotals {
  tokensIn: number
  tokensOut: number
  costUsd: number
  requestCount: number
  errorCount: number
}

interface AiActivityState {
  /** Requêtes actuellement en vol (status === 'running'). */
  active: Record<string, AiActivityRecord>
  /** Dernière requête terminée — sert d'idle signal. */
  last: AiActivityRecord | null
  /** Cumul depuis le démarrage de la session (rafraîchissement page). */
  session: AiSessionTotals
  start: (input: Omit<AiActivityRecord, 'startedAt' | 'status'>) => void
  /** Mute le provider/model d'une requête en vol (utile pour les fallbacks). */
  update: (id: string, patch: Partial<Pick<AiActivityRecord, 'provider' | 'model' | 'label'>>) => void
  end: (
    id: string,
    status: 'success' | 'error',
    payload?: AiActivityEndPayload & { errorMessage?: string },
  ) => void
  /** Remet à zéro les compteurs cumulés (sans toucher aux requêtes en vol). */
  resetSession: () => void
}

const emptyTotals = (): AiSessionTotals => ({
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0,
  requestCount: 0,
  errorCount: 0,
})

export const useAiActivityStore = create<AiActivityState>((set) => ({
  active: {},
  last: null,
  session: emptyTotals(),
  start: (input) =>
    set((s) => ({
      active: {
        ...s.active,
        [input.id]: { ...input, startedAt: Date.now(), status: 'running' },
      },
    })),
  update: (id, patch) =>
    set((s) => {
      const existing = s.active[id]
      if (!existing) return s
      return { active: { ...s.active, [id]: { ...existing, ...patch } } }
    }),
  end: (id, status, payload) =>
    set((s) => {
      const record = s.active[id]
      if (!record) return s
      const finished: AiActivityRecord = {
        ...record,
        status,
        endedAt: Date.now(),
        errorMessage: payload?.errorMessage,
        inputTokens: payload?.inputTokens ?? record.inputTokens,
        outputTokens: payload?.outputTokens ?? record.outputTokens,
        costUsd: payload?.costUsd ?? record.costUsd,
      }
      const { [id]: _, ...rest } = s.active
      const session: AiSessionTotals = {
        tokensIn: s.session.tokensIn + (payload?.inputTokens ?? 0),
        tokensOut: s.session.tokensOut + (payload?.outputTokens ?? 0),
        costUsd: s.session.costUsd + (payload?.costUsd ?? 0),
        requestCount: s.session.requestCount + 1,
        errorCount: s.session.errorCount + (status === 'error' ? 1 : 0),
      }
      return { active: rest, last: finished, session }
    }),
  resetSession: () => set({ session: emptyTotals(), last: null }),
}))

let _idCounter = 0
export function nextAiActivityId(prefix: string): string {
  _idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${_idCounter}`
}
