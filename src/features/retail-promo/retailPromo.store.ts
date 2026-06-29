import { create } from 'zustand'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey, PromoLayout } from './promoTypes'

interface PendingPromoApply {
  projectId: string
  layout: PromoLayout
  sourceRef: DataSourceRef
  columns: MergeColumn[]
  rows: MergeRow[]
}

interface RetailPromoState {
  step: 'source' | 'mapping' | 'template'
  rawColumns: MergeColumn[]
  rawRows: MergeRow[]
  fieldMap: Partial<Record<PromoFieldKey, string>>
  sourceRef: DataSourceRef | null
  pendingApply: PendingPromoApply | null

  setStep: (step: RetailPromoState['step']) => void
  setSource: (ref: DataSourceRef, columns: MergeColumn[], rows: MergeRow[]) => void
  setFieldMap: (map: Partial<Record<PromoFieldKey, string>>) => void
  reset: () => void
  setPendingApply: (apply: PendingPromoApply) => void
  clearPendingApply: () => void
}

const defaultState = {
  step: 'source' as const,
  rawColumns: [] as MergeColumn[],
  rawRows: [] as MergeRow[],
  fieldMap: {} as Partial<Record<PromoFieldKey, string>>,
  sourceRef: null,
  pendingApply: null,
}

export const useRetailPromoStore = create<RetailPromoState>((set) => ({
  ...defaultState,
  setStep: (step) => set({ step }),
  setSource: (sourceRef, rawColumns, rawRows) =>
    set({ sourceRef, rawColumns, rawRows }),
  setFieldMap: (fieldMap) => set({ fieldMap }),
  reset: () => set(defaultState),
  setPendingApply: (pendingApply) => set({ pendingApply }),
  clearPendingApply: () => set({ pendingApply: null }),
}))
