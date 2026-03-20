import { create } from 'zustand'

export interface MergeRow {
  _id: string
  [key: string]: unknown
}

export interface MergeColumn {
  key: string
  label: string
  fieldType: string
}

export interface DataSourceRef {
  excelDocId: string
  sheetIndex: number
  fileName: string
}

interface MergeState {
  // Source
  dataSource: DataSourceRef | null
  columns: MergeColumn[]
  rows: MergeRow[]

  // Navigation
  currentRowIndex: number
  isConnected: boolean

  // Persisted source reference
  savedDataSource: DataSourceRef | null
  setSavedDataSource: (source: DataSourceRef | null) => void

  // Actions
  connect: (source: DataSourceRef, columns: MergeColumn[], rows: MergeRow[]) => void
  disconnect: () => void
  setCurrentRow: (index: number) => void
  nextRow: () => void
  prevRow: () => void
}

export const useMergeStore = create<MergeState>((set, get) => ({
  dataSource: null,
  columns: [],
  rows: [],
  currentRowIndex: 0,
  isConnected: false,
  savedDataSource: null,
  setSavedDataSource: (source) => set({ savedDataSource: source }),

  connect: (source, columns, rows) =>
    set({ dataSource: source, columns, rows, currentRowIndex: 0, isConnected: true }),

  disconnect: () =>
    set({ dataSource: null, columns: [], rows: [], currentRowIndex: 0, isConnected: false }),

  setCurrentRow: (index) => {
    const { rows } = get()
    if (index >= 0 && index < rows.length) {
      set({ currentRowIndex: index })
    }
  },

  nextRow: () => {
    const { currentRowIndex, rows } = get()
    if (currentRowIndex < rows.length - 1) {
      set({ currentRowIndex: currentRowIndex + 1 })
    }
  },

  prevRow: () => {
    const { currentRowIndex } = get()
    if (currentRowIndex > 0) {
      set({ currentRowIndex: currentRowIndex - 1 })
    }
  },
}))
