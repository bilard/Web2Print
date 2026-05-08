import { create } from 'zustand'

interface HelpState {
  open: boolean
  currentSectionId: string | null
  highlightTarget: string | null
  searchQuery: string
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
  goToSection: (id: string) => void
  setHighlightTarget: (id: string | null) => void
  setSearchQuery: (q: string) => void
}

let resetTimer: ReturnType<typeof setTimeout> | null = null

export const useHelpStore = create<HelpState>((set) => ({
  open: false,
  currentSectionId: null,
  highlightTarget: null,
  searchQuery: '',

  openDrawer: () => set({ open: true }),
  closeDrawer: () => set({ open: false }),
  toggleDrawer: () => set((s) => ({ open: !s.open })),

  goToSection: (id) => set({ open: true, currentSectionId: id }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setHighlightTarget: (id) => {
    if (resetTimer) {
      clearTimeout(resetTimer)
      resetTimer = null
    }
    set({ highlightTarget: id })
    if (id !== null) {
      resetTimer = setTimeout(() => {
        set({ highlightTarget: null })
        resetTimer = null
      }, 3000)
    }
  },
}))
