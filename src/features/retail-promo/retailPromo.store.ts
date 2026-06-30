import { create } from 'zustand'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from './promoTypes'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { DEFAULT_PROMO_CONFIG, type PromoTemplateConfig, type PromoColorKey, type PromoBlockId, type ElementStyle, type BlockFill, type ShapeStyle } from './RetailPromoCard'

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
  setShape: (id: PromoBlockId, patch: Partial<ShapeStyle>) => void
  setHidden: (id: PromoBlockId, hidden: boolean) => void
  setRules: (id: PromoBlockId, rules: ConditionalRule[]) => void
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
  setShape: (id, patch) => set((s) => ({
    config: { ...s.config, shapes: { ...s.config.shapes, [id]: { ...s.config.shapes?.[id], ...patch } } },
  })),
  setHidden: (id, hidden) => set((s) => ({
    config: { ...s.config, hidden: { ...s.config.hidden, [id]: hidden } },
  })),
  setRules: (id, rules) => set((s) => ({
    config: { ...s.config, rules: { ...s.config.rules, [id]: rules } },
  })),
  reset: () => set(defaultState),
}))
