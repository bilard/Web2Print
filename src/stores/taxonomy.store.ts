import { create } from 'zustand'

interface TaxonomyUIState {
  selectedTaxonomyId: string | null
  expandedNodeIds: Set<string>
  searchQuery: string
  highlightedNodeId: string | null

  setSelectedTaxonomy: (id: string | null) => void
  toggleNode: (id: string) => void
  expandAll: (nodeIds: string[]) => void
  collapseAll: () => void
  setSearch: (q: string) => void
  setHighlighted: (id: string | null) => void
}

export const useTaxonomyStore = create<TaxonomyUIState>((set) => ({
  selectedTaxonomyId: null,
  expandedNodeIds: new Set<string>(),
  searchQuery: '',
  highlightedNodeId: null,

  setSelectedTaxonomy: (id) => set({ selectedTaxonomyId: id }),

  toggleNode: (id) =>
    set((s) => {
      const next = new Set(s.expandedNodeIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedNodeIds: next }
    }),

  expandAll: (nodeIds) =>
    set((s) => {
      const next = new Set(s.expandedNodeIds)
      for (const id of nodeIds) next.add(id)
      return { expandedNodeIds: next }
    }),

  collapseAll: () => set({ expandedNodeIds: new Set<string>() }),

  setSearch: (q) => set({ searchQuery: q }),

  setHighlighted: (id) => set({ highlightedNodeId: id }),
}))
