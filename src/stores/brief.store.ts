import { create } from 'zustand'

export type TaxonomyTab = 'tree' | 'briefs'

interface BriefUIState {
  // Onglet actif dans TaxonomiesPage
  currentTab: TaxonomyTab
  setCurrentTab: (tab: TaxonomyTab) => void

  // Modale du builder de formulaire
  formBuilderOpen: boolean
  openFormBuilder: () => void
  closeFormBuilder: () => void

  // Brief en cours d'édition (Lot 3) — placeholder ici
  currentBriefId: string | null
  setCurrentBriefId: (id: string | null) => void
}

export const useBriefUIStore = create<BriefUIState>((set) => ({
  currentTab: 'tree',
  setCurrentTab: (tab) => set({ currentTab: tab }),

  formBuilderOpen: false,
  openFormBuilder: () => set({ formBuilderOpen: true }),
  closeFormBuilder: () => set({ formBuilderOpen: false }),

  currentBriefId: null,
  setCurrentBriefId: (id) => set({ currentBriefId: id }),
}))
