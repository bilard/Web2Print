import { create } from 'zustand'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from './promoTypes'
import { DEFAULT_PROMO_CONFIG, type PromoTemplateConfig, type PromoColorKey, type PromoBlockId, type ElementStyle, type BlockFill } from './RetailPromoCard'

interface RetailPromoState {
  step: 'source' | 'mapping' | 'template'
  rawColumns: MergeColumn[]
  rawRows: MergeRow[]
  fieldMap: Partial<Record<PromoFieldKey, string>>
  sourceRef: DataSourceRef | null
  config: PromoTemplateConfig
  selectedKey: PromoBlockId | null

  setStep: (step: RetailPromoState['step']) => void
  setSource: (ref: DataSourceRef, columns: MergeColumn[], rows: MergeRow[]) => void
  setFieldMap: (map: Partial<Record<PromoFieldKey, string>>) => void
  setConfig: (patch: Partial<PromoTemplateConfig>) => void
  setSelectedKey: (key: PromoBlockId | null) => void
  setElementStyle: (key: PromoColorKey, patch: Partial<ElementStyle>) => void
  setBlockFill: (id: PromoBlockId, patch: Partial<BlockFill>) => void
  reset: () => void
}

const defaultState = {
  step: 'source' as const,
  rawColumns: [] as MergeColumn[],
  rawRows: [] as MergeRow[],
  fieldMap: {} as Partial<Record<PromoFieldKey, string>>,
  sourceRef: null,
  config: DEFAULT_PROMO_CONFIG,
  selectedKey: null as PromoBlockId | null,
}

export const useRetailPromoStore = create<RetailPromoState>((set) => ({
  ...defaultState,
  setStep: (step) => set({ step }),
  setSource: (sourceRef, rawColumns, rawRows) => set({ sourceRef, rawColumns, rawRows }),
  setFieldMap: (fieldMap) => set({ fieldMap }),
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  setSelectedKey: (selectedKey) => set({ selectedKey }),
  setElementStyle: (key, patch) => set((s) => ({
    config: { ...s.config, styles: { ...s.config.styles, [key]: { ...s.config.styles?.[key], ...patch } } },
  })),
  setBlockFill: (id, patch) => set((s) => ({
    config: { ...s.config, blockFills: { ...s.config.blockFills, [id]: { fillType: 'solid', ...s.config.blockFills?.[id], ...patch } } },
  })),
  reset: () => set(defaultState),
}))
