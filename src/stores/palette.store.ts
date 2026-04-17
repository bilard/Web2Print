import { create } from 'zustand'
import type { GradientConfig } from './editor.store'

export interface PaletteColor {
  id: string
  color: string
  name: string
}

export interface PaletteGradient {
  id: string
  gradient: GradientConfig
  name: string
}

interface PaletteState {
  colors: PaletteColor[]
  gradients: PaletteGradient[]
  addColor: (color: string, name?: string) => void
  removeColor: (id: string) => void
  updateColor: (id: string, patch: Partial<Pick<PaletteColor, 'color' | 'name'>>) => void
  addGradient: (gradient: GradientConfig, name?: string) => void
  removeGradient: (id: string) => void
  updateGradient: (id: string, patch: Partial<Pick<PaletteGradient, 'gradient' | 'name'>>) => void
  setPalette: (colors: PaletteColor[], gradients: PaletteGradient[]) => void
  clearPalette: () => void
}

let _counter = 0
const uid = () => `pal_${Date.now()}_${++_counter}`

export const usePaletteStore = create<PaletteState>((set) => ({
  colors: [],
  gradients: [],

  addColor: (color, name) =>
    set((s) => ({
      colors: [...s.colors, { id: uid(), color, name: name || color }],
    })),

  removeColor: (id) =>
    set((s) => ({ colors: s.colors.filter((c) => c.id !== id) })),

  updateColor: (id, patch) =>
    set((s) => ({
      colors: s.colors.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  addGradient: (gradient, name) =>
    set((s) => ({
      gradients: [
        ...s.gradients,
        { id: uid(), gradient, name: name || `Dégradé ${s.gradients.length + 1}` },
      ],
    })),

  removeGradient: (id) =>
    set((s) => ({ gradients: s.gradients.filter((g) => g.id !== id) })),

  updateGradient: (id, patch) =>
    set((s) => ({
      gradients: s.gradients.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),

  setPalette: (colors, gradients) => set({ colors, gradients }),

  clearPalette: () => set({ colors: [], gradients: [] }),
}))

/**
 * Save palette to Firestore. Call after any palette mutation.
 */
export function savePaletteToFirestore() {
  // Use setTimeout to ensure Zustand state is fully updated
  setTimeout(async () => {
    try {
      const { useEditorStore } = await import('./editor.store')
      const { doc, updateDoc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase/config')

      const pid = useEditorStore.getState().projectId
      if (!pid) return

      const { colors, gradients } = usePaletteStore.getState()
      await updateDoc(doc(db, 'projects', pid), {
        paletteColors: JSON.stringify(colors),
        paletteGradients: JSON.stringify(gradients),
        updatedAt: Date.now(),
      })
    } catch (err) {
      console.error('[Palette] Save error', err)
    }
  }, 100)
}
