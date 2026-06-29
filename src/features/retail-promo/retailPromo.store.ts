import { create } from 'zustand'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from './promoTypes'
import { DEFAULT_PROMO_CONFIG, type PromoTemplateConfig } from './RetailPromoCard'

interface RetailPromoState {
  step: 'source' | 'mapping' | 'template'
  rawColumns: MergeColumn[]
  rawRows: MergeRow[]
  fieldMap: Partial<Record<PromoFieldKey, string>>
  sourceRef: DataSourceRef | null
  config: PromoTemplateConfig

  setStep: (step: RetailPromoState['step']) => void
  setSource: (ref: DataSourceRef, columns: MergeColumn[], rows: MergeRow[]) => void
  setFieldMap: (map: Partial<Record<PromoFieldKey, string>>) => void
  setConfig: (patch: Partial<PromoTemplateConfig>) => void
  reset: () => void
}

const defaultState = {
  step: 'source' as const,
  rawColumns: [] as MergeColumn[],
  rawRows: [] as MergeRow[],
  fieldMap: {} as Partial<Record<PromoFieldKey, string>>,
  sourceRef: null,
  config: DEFAULT_PROMO_CONFIG,
}

export const useRetailPromoStore = create<RetailPromoState>((set) => ({
  ...defaultState,
  setStep: (step) => set({ step }),
  setSource: (sourceRef, rawColumns, rawRows) => set({ sourceRef, rawColumns, rawRows }),
  setFieldMap: (fieldMap) => set({ fieldMap }),
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  reset: () => set(defaultState),
}))
