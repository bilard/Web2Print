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

export type FormulaResultType = 'auto' | 'number' | 'text'

export interface FormulaConfig {
  resultType: FormulaResultType
  decimals: number | null
}

interface MergeState {
  // Source
  dataSource: DataSourceRef | null
  columns: MergeColumn[]
  rows: MergeRow[]

  // Navigation
  currentRowIndex: number
  isConnected: boolean

  // Formulas: variable name → formula string (e.g. '"[brands]"')
  formulas: Record<string, string>
  setFormula: (variable: string, formula: string) => void
  removeFormula: (variable: string) => void

  // Formula configs: variable name → type + decimals options
  formulaConfigs: Record<string, FormulaConfig>
  setFormulaConfig: (variable: string, config: FormulaConfig) => void
  removeFormulaConfig: (variable: string) => void

  // hideLineIfEmpty: variable names where the entire line is removed when value is empty
  hideLineIfEmpty: Record<string, boolean>
  setHideLineIfEmpty: (variable: string, hide: boolean) => void

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
  formulas: {},
  setFormula: (variable, formula) =>
    set((s) => ({ formulas: { ...s.formulas, [variable]: formula } })),
  removeFormula: (variable) =>
    set((s) => {
      const f = { ...s.formulas }
      delete f[variable]
      return { formulas: f }
    }),
  formulaConfigs: {},
  setFormulaConfig: (variable, config) =>
    set((s) => ({ formulaConfigs: { ...s.formulaConfigs, [variable]: config } })),
  removeFormulaConfig: (variable) =>
    set((s) => {
      const f = { ...s.formulaConfigs }
      delete f[variable]
      return { formulaConfigs: f }
    }),
  hideLineIfEmpty: {},
  setHideLineIfEmpty: (variable, hide) =>
    set((s) => ({ hideLineIfEmpty: { ...s.hideLineIfEmpty, [variable]: hide } })),
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
