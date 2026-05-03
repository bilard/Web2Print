import { create } from 'zustand'
import type { LlmRequestInfo } from '@/features/ai/llmRouter'
import type { EnrichmentEntry, EnrichmentProgress, EnrichedProduct } from './types'
import { enrichmentKey } from './types'

/** En-têtes de table dupliqués entre sections : "Valeur", "*Valeur*",
 *  "Caractéristique"… — recopiés par certains scrapers et que le LLM
 *  conserve parfois. Filtre appliqué à l'entrée du store pour purger
 *  immédiatement, peu importe la source des specs (pipeline frais,
 *  désérialisation Excel, edit utilisateur). */
const PLACEHOLDER_HEADER_RE = /^[\s*_]*(valeur|value|caract[eé]ristique|description|sp[eé]cification|name|nom|d[eé]signation|propri[eé]t[eé])[\s*_]*$/i
const BRACKETED_HEADER_RE = /^\s*\[[^[\]()]+\]\s*$/

/** Compte les `[` et `]` dans une chaîne — utile pour détecter les noms ou
 *  valeurs avec crochets déséquilibrés (ex: `[Fiche technique Trappes de visite`
 *  ou `Nicoll]CHUTUNIC® EVO` issus d'un mégamenu Drupal mal converti en
 *  markdown puis halluciné en KEY/VALUE par le LLM). Un libellé produit
 *  légitime a TOUJOURS ses crochets appariés (ex: `Tension [V]`). */
function hasUnbalancedBrackets(s: string): boolean {
  const opens = (s.match(/\[/g) || []).length
  const closes = (s.match(/\]/g) || []).length
  return opens !== closes
}

export function sanitizeIncomingProduct(data: EnrichedProduct): EnrichedProduct {
  const cleanSpecs = data.specifications.filter((s) => {
    // Valeur ou nom vide → spec inutilisable (la valeur affichée ne serait que
    // le placeholder "Valeur" — exactement le bug Nicoll observé).
    if (!s.name?.trim() || !s.value?.trim()) return false
    if (PLACEHOLDER_HEADER_RE.test(s.value) || PLACEHOLDER_HEADER_RE.test(s.name)) return false
    if (BRACKETED_HEADER_RE.test(s.name)) return false
    // Crochets déséquilibrés sur le nom OU la valeur → bruit de mégamenu.
    if (hasUnbalancedBrackets(s.name) || hasUnbalancedBrackets(s.value)) return false
    return true
  })
  if (cleanSpecs.length === data.specifications.length) return data
  return { ...data, specifications: cleanSpecs }
}

/** Cache des données scrapées — persiste entre les re-generates */
export interface ScrapeCache {
  productUrl: string
  additionalSources: string[]
  markdownContent: string | null
  scrapeProvider: string
  /** URLs effectivement scrapées par le bundle (onglets, PDFs…) — informatif pour l'UI. */
  sourcesScrapped?: string[]
}

export type HiddenGroupSection = 'specifications' | 'advantages'

export interface HiddenGroups {
  specifications: string[]
  advantages: string[]
}

interface EnrichmentState {
  /** Cache en mémoire : `${sheetName}::${rowId}` → entry */
  entries: Record<string, EnrichmentEntry>
  /** Cache scraping : survit au clear() pour éviter de re-scraper lors de Re-générer */
  scrapeCache: Record<string, ScrapeCache>
  /** Logs temps réel par clé d'enrichissement */
  logs: Record<string, string[]>
  /** Groupes cachés par section et par clé (session-only, non persisté) */
  hiddenGroups: Record<string, HiddenGroups>
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
  setLlmUsed: (sheetName: string, rowId: string, info: { provider: string; model: string }) => void
  addLog: (sheetName: string, rowId: string, message: string) => void
  clearLogs: (sheetName: string, rowId: string) => void
  toggleHiddenGroup: (sheetName: string, rowId: string, section: HiddenGroupSection, groupName: string) => void
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
  hiddenGroups: {},
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
            data: sanitizeIncomingProduct(data),
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

  setLlmUsed: (sheetName, rowId, info) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const prev = state.entries[key] ?? emptyEntry
      return {
        entries: {
          ...state.entries,
          [key]: { ...prev, llmUsed: info },
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

  toggleHiddenGroup: (sheetName, rowId, section, groupName) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const current = state.hiddenGroups[key] ?? { specifications: [], advantages: [] }
      const list = current[section]
      const nextList = list.includes(groupName)
        ? list.filter((g) => g !== groupName)
        : [...list, groupName]
      return {
        hiddenGroups: {
          ...state.hiddenGroups,
          [key]: { ...current, [section]: nextList },
        },
      }
    }),

  clear: (sheetName, rowId) =>
    set((state) => {
      const key = enrichmentKey(sheetName, rowId)
      const nextEntries = { ...state.entries }
      delete nextEntries[key]
      const nextHidden = { ...state.hiddenGroups }
      delete nextHidden[key]
      return { entries: nextEntries, hiddenGroups: nextHidden }
    }),
  })
})
