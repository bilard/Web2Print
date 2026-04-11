import { create } from 'zustand'
import type { DamImage, DamFilters, DamTab } from '../features/dam/types'

interface DamState {
  query: string
  filters: DamFilters
  results: DamImage[]
  loading: boolean
  hasMore: boolean
  page: number
  totalResults: number
  lastError: string | null

  suggestions: string[]
  recentSearches: string[]

  activeTab: DamTab
  lightboxImage: DamImage | null
  selectedCollection: string | null
  selectedProjectId: string | null

  setQuery: (q: string) => void
  setFilters: (f: Partial<DamFilters>) => void
  setResults: (images: DamImage[], totalResults: number, hasMore: boolean) => void
  appendResults: (images: DamImage[], hasMore: boolean) => void
  setLoading: (loading: boolean) => void
  setPage: (page: number) => void
  setLastError: (err: string | null) => void
  setSuggestions: (suggestions: string[]) => void
  addRecentSearch: (term: string) => void
  setActiveTab: (tab: DamTab) => void
  openLightbox: (image: DamImage) => void
  closeLightbox: () => void
  setSelectedCollection: (id: string | null) => void
  setSelectedProjectId: (id: string | null) => void
  reset: () => void
}

const DEFAULT_FILTERS: DamFilters = {
  source: 'all',
  orientation: 'all',
  color: null,
  category: null,
  sortBy: 'relevant',
}

const loadRecentSearches = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem('dam_recent_searches') || '[]')
  } catch {
    return []
  }
}

export const useDamStore = create<DamState>((set, get) => ({
  query: '',
  filters: DEFAULT_FILTERS,
  results: [],
  loading: false,
  hasMore: false,
  page: 1,
  totalResults: 0,
  lastError: null,

  suggestions: [],
  recentSearches: loadRecentSearches(),

  activeTab: 'stock',
  lightboxImage: null,
  selectedCollection: null,
  selectedProjectId: null,

  setQuery: (query) => set({ query }),
  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial }, page: 1 })),
  setResults: (results, totalResults, hasMore) => set({ results, totalResults, hasMore }),
  appendResults: (images, hasMore) =>
    set((s) => ({ results: [...s.results, ...images], hasMore })),
  setLoading: (loading) => set({ loading }),
  setPage: (page) => set({ page }),
  setLastError: (lastError) => set({ lastError }),
  setSuggestions: (suggestions) => set({ suggestions }),
  addRecentSearch: (term) => {
    const trimmed = term.trim()
    if (!trimmed) return
    const current = get().recentSearches.filter((s) => s !== trimmed)
    const updated = [trimmed, ...current].slice(0, 20)
    localStorage.setItem('dam_recent_searches', JSON.stringify(updated))
    set({ recentSearches: updated })
  },
  setActiveTab: (activeTab) =>
    set((s) => ({
      activeTab,
      // Reset project drill-down when leaving the Projets tab
      selectedProjectId: activeTab === 'projects' ? s.selectedProjectId : null,
    })),
  openLightbox: (image) => set({ lightboxImage: image }),
  closeLightbox: () => set({ lightboxImage: null }),
  setSelectedCollection: (selectedCollection) => set({ selectedCollection }),
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  reset: () =>
    set({
      query: '',
      filters: DEFAULT_FILTERS,
      results: [],
      loading: false,
      hasMore: false,
      page: 1,
      totalResults: 0,
      suggestions: [],
    }),
}))
