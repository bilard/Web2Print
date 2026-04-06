import { create } from 'zustand'
import type { IdmlUploadState } from '@/features/idml/useIdmlUpload'

export interface PendingImport {
  type: 'idml' | 'pptx' | 'image'
  files: File[]
}

interface ProjectState {
  // IDML assembly prêt pour parsing
  pendingIdml: IdmlUploadState | null
  setPendingIdml: (state: IdmlUploadState | null) => void
  // Import from dashboard
  pendingImport: PendingImport | null
  setPendingImport: (imp: PendingImport | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  pendingIdml: null,
  setPendingIdml: (pendingIdml) => set({ pendingIdml }),
  pendingImport: null,
  setPendingImport: (pendingImport) => set({ pendingImport }),
}))
