import { create } from 'zustand'
import type { IdmlUploadState } from '@/features/idml/useIdmlUpload'
import type { DamImage } from '@/features/dam/types'

interface PendingImport {
  type: 'idml' | 'pptx' | 'image' | 'svg'
  files: File[]
}

interface ProjectState {
  // IDML assembly prêt pour parsing
  pendingIdml: IdmlUploadState | null
  setPendingIdml: (state: IdmlUploadState | null) => void
  // Import from dashboard
  pendingImport: PendingImport | null
  setPendingImport: (imp: PendingImport | null) => void
  // Image DAM à insérer dès que l'éditeur est monté (navigation depuis dashboard).
  pendingDamInsert: DamImage | null
  setPendingDamInsert: (image: DamImage | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  pendingIdml: null,
  setPendingIdml: (pendingIdml) => set({ pendingIdml }),
  pendingImport: null,
  setPendingImport: (pendingImport) => set({ pendingImport }),
  pendingDamInsert: null,
  setPendingDamInsert: (pendingDamInsert) => set({ pendingDamInsert }),
}))
