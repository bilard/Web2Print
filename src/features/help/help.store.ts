import { create } from 'zustand'

interface HelpState {
  open: boolean
  currentSectionId: string | null
  highlightTarget: string | null
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
  goToSection: (id: string) => void
  setHighlightTarget: (id: string | null) => void
}

let resetTimer: ReturnType<typeof setTimeout> | null = null

export const useHelpStore = create<HelpState>((set) => ({
  open: false,
  currentSectionId: null,
  highlightTarget: null,

  openDrawer: () => set({ open: true }),
  closeDrawer: () => set({ open: false }),
  toggleDrawer: () => set((s) => ({ open: !s.open })),

  goToSection: (id) => set({ open: true, currentSectionId: id }),

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
