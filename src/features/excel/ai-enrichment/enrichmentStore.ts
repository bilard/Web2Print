import { create } from 'zustand'
import type { LlmRequestInfo } from '@/features/ai/llmRouter'
import type { EnrichmentEntry, EnrichmentProgress, EnrichedProduct } from './types'
import { enrichmentKey } from './types'

interface EnrichmentState {
  /** Cache en mémoire : `${sheetName}::${rowId}` → entry */
  entries: Record<string, EnrichmentEntry>

  getEntry: (sheetName: string, rowId: string) => EnrichmentEntry | undefined
  setProgress: (sheetName: string, rowId: string, progress: EnrichmentProgress) => void
  setData: (sheetName: string, rowId: string, data: EnrichedProduct) => void
  setError: (sheetName: string, rowId: string, error: string) => void
  setLlmRequest: (sheetName: string, rowId: string, request: LlmRequestInfo) => void
  clear: (sheetName: string, rowId: string) => void
}

const emptyEntry: EnrichmentEntry = {
  progress: { status: 'idle', message: '' },
  data: null,
  error: null,
}

export const useEnrichmentStore = create<EnrichmentState>((set, get) => ({
  entries: {},

  getEntry: (sheetName, rowId) => get().entries[enrichmentKey(sheetName, rowId)],

  setProgress: (sheetName, rowId, progress) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const prev = state.entries[key] ?? emptyEntry
      return {
        entries: {
          ...state.entries,
          [key]: { ...prev, progress, error: progress.status === 'error' ? prev.error : null },
        },
      }
    }),

  setData: (sheetName, rowId, data) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const prev = state.entries[key] ?? emptyEntry
      return {
        entries: {
          ...state.entries,
          [key]: {
            progress: { status: 'done', message: 'Enrichissement terminé' },
            data,
            error: null,
            // Préserve le snapshot llmRequest capturé pendant l'étape reasoning.
            llmRequest: prev.llmRequest,
          },
        },
      }
    }),

  setLlmRequest: (sheetName, rowId, request) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const prev = state.entries[key] ?? emptyEntry
      return {
        entries: {
          ...state.entries,
          [key]: { ...prev, llmRequest: request },
        },
      }
    }),

  setError: (sheetName, rowId, error) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const prev = state.entries[key] ?? emptyEntry
      return {
        entries: {
          ...state.entries,
          [key]: { ...prev, progress: { status: 'error', message: error }, error },
        },
      }
    }),

  clear: (sheetName, rowId) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const next = { ...state.entries }
      delete next[key]
      return { entries: next }
    }),
}))
