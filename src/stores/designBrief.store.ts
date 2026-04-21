import { create } from 'zustand'
import { DEFAULT_DESIGN_BRIEF, type DesignBriefState } from '@/features/ai-design/types'

interface DesignBriefStore {
  brief: DesignBriefState | null
  setBrief: (patch: Partial<DesignBriefState>) => void
  resetBrief: () => void
  hydrateBrief: (brief: DesignBriefState | null) => void
  setPromptOptimized: (optimized: string) => void
}

export const useDesignBriefStore = create<DesignBriefStore>((set) => ({
  brief: null,
  setBrief: (patch) =>
    set((s) => {
      const base = s.brief ?? DEFAULT_DESIGN_BRIEF
      return { brief: { ...base, ...patch, updatedAt: Date.now() } }
    }),
  resetBrief: () => set({ brief: null }),
  hydrateBrief: (brief) => set({ brief }),
  setPromptOptimized: (optimized) =>
    set((s) => {
      const base = s.brief ?? DEFAULT_DESIGN_BRIEF
      return { brief: { ...base, promptOptimized: optimized, updatedAt: Date.now() } }
    }),
}))

/**
 * Selector hook — always returns a full DesignBriefState.
 * Falls back to DEFAULT_DESIGN_BRIEF when nothing is loaded / stored.
 */
export function useDesignBrief(): DesignBriefState {
  return useDesignBriefStore((s) => s.brief ?? DEFAULT_DESIGN_BRIEF)
}
