import { create } from 'zustand'
import type { LlmRequestInfo } from '@/features/ai/llmRouter'
import type { EnrichmentEntry, EnrichmentProgress, EnrichedProduct } from './types'
import { enrichmentKey } from './types'

/** Cache des données scrapées — persiste entre les re-generates */
export interface ScrapeCache {
  productUrl: string
  additionalSources: string[]
  markdownContent: string | null
  scrapeProvider: string
  /** URLs effectivement scrapées par le bundle (onglets, PDFs…) — informatif pour l'UI. */
  sourcesScrapped?: string[]
  /** Images « primaires » extraites des meta tags HTML (og:image, twitter:image, JSON-LD, link rel=image_src). */
  primaryImages?: string[]
  /** HTML brut de la page principale (pour ré-extraire images/prix/breadcrumb sans re-hit Jina). */
  primaryHtml?: string | null
}

interface EnrichmentState {
  /** Cache en mémoire : `${sheetName}::${rowId}` → entry */
  entries: Record<string, EnrichmentEntry>
  /** Cache scraping : survit au clear() pour éviter de re-scraper lors de Re-générer */
  scrapeCache: Record<string, ScrapeCache>
  /** Logs temps réel par clé d'enrichissement */
  logs: Record<string, string[]>
  /** Kill-switch : désactiver la découverte d'URLs liées (fallback scrape single-URL). */
  multiUrlEnabled: boolean
  setMultiUrlEnabled: (v: boolean) => void

  getEntry: (sheetName: string, rowId: string) => EnrichmentEntry | undefined
  getScrapeCache: (sheetName: string, rowId: string) => ScrapeCache | undefined
  setScrapeCache: (sheetName: string, rowId: string, cache: ScrapeCache) => void
  clearScrapeCache: (sheetName: string, rowId: string) => void
  setProgress: (sheetName: string, rowId: string, progress: EnrichmentProgress) => void
  setData: (sheetName: string, rowId: string, data: EnrichedProduct) => void
  setError: (sheetName: string, rowId: string, error: string) => void
  setLlmRequest: (sheetName: string, rowId: string, request: LlmRequestInfo) => void
  addLog: (sheetName: string, rowId: string, message: string) => void
  clearLogs: (sheetName: string, rowId: string) => void
  clear: (sheetName: string, rowId: string) => void
}

const emptyEntry: EnrichmentEntry = {
  progress: { status: 'idle', message: '' },
  data: null,
  error: null,
}

export const useEnrichmentStore = create<EnrichmentState>((set, get) => {
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    queueMicrotask(() => {
      ;(window as unknown as { __enrichStore?: unknown }).__enrichStore = useEnrichmentStore
    })
  }
  return ({
  entries: {},
  scrapeCache: {},
  logs: {},
  multiUrlEnabled: true,
  setMultiUrlEnabled: (v) => set({ multiUrlEnabled: v }),

  getEntry: (sheetName, rowId) => get().entries[enrichmentKey(sheetName, rowId)],

  getScrapeCache: (sheetName, rowId) => get().scrapeCache[enrichmentKey(sheetName, rowId)],

  setScrapeCache: (sheetName, rowId, cache) =>
    set((state) => ({
      scrapeCache: { ...state.scrapeCache, [enrichmentKey(sheetName, rowId)]: cache },
    })),

  clearScrapeCache: (sheetName, rowId) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const next = { ...state.scrapeCache }
      delete next[key]
      return { scrapeCache: next }
    }),

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

  addLog: (sheetName, rowId, message) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const prev = state.logs[key] ?? []
      return { logs: { ...state.logs, [key]: [...prev, message] } }
    }),

  clearLogs: (sheetName, rowId) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const next = { ...state.logs }
      delete next[key]
      return { logs: next }
    }),

  clear: (sheetName, rowId) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const next = { ...state.entries }
      delete next[key]
      return { entries: next }
    }),
  })
})
