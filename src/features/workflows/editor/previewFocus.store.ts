// src/features/workflows/editor/previewFocus.store.ts
// Tiny ephemeral store linking config-side column chips → DataPreviewPanel.
// Clicking a column chip increments `pulse` so the preview can re-scroll even
// when the same column is focused twice in a row.
import { create } from 'zustand'

interface PreviewFocusState {
  columnLabel: string | null
  pulse: number
  focus(label: string): void
  clear(): void
}

export const usePreviewFocus = create<PreviewFocusState>((set) => ({
  columnLabel: null,
  pulse: 0,
  focus: (label) => set((s) => ({ columnLabel: label, pulse: s.pulse + 1 })),
  clear: () => set({ columnLabel: null }),
}))
