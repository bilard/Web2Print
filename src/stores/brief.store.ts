import { create } from 'zustand'

export type TaxonomyTab = 'tree' | 'briefs'

interface BriefUIState {
  currentTab: TaxonomyTab
  setCurrentTab: (tab: TaxonomyTab) => void

  formBuilderOpen: boolean
  openFormBuilder: () => void
  closeFormBuilder: () => void

  briefEditorOpen: boolean
  currentBriefId: string | null
  openBriefEditor: (id: string) => void
  closeBriefEditor: () => void
  setCurrentBriefId: (id: string | null) => void
}

export const useBriefUIStore = create<BriefUIState>((set) => ({
  currentTab: 'tree',
  setCurrentTab: (tab) => set({ currentTab: tab }),

  formBuilderOpen: false,
  openFormBuilder: () => set({ formBuilderOpen: true }),
  closeFormBuilder: () => set({ formBuilderOpen: false }),

  briefEditorOpen: false,
  currentBriefId: null,
  openBriefEditor: (id) => set({ briefEditorOpen: true, currentBriefId: id }),
  closeBriefEditor: () => set({ briefEditorOpen: false, currentBriefId: null }),
  setCurrentBriefId: (id) => set({ currentBriefId: id }),
}))
