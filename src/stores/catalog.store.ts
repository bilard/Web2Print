import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'
import type { CatalogDoc, CatalogFormat, CatalogGrid, CatalogPlan, LevelKeys, TreeEdits } from '@/features/catalog/catalogTypes'
import { CATALOG_FORMAT_PRESETS } from '@/features/catalog/catalogTypes'
import { EMPTY_TREE_EDITS } from '@/features/catalog/catalogTree'

export type CatalogStep = 'source' | 'structure' | 'prompt' | 'preview' | 'export'

interface CatalogState {
  catalogId: string | null
  name: string
  step: CatalogStep
  sourceRef: DataSourceRef | null
  rawColumns: MergeColumn[]
  rawRows: MergeRow[]
  selectedRowIds: string[]
  levelKeys: LevelKeys
  treeEdits: TreeEdits
  prompt: string
  plan: CatalogPlan | null
  fieldMap: Partial<Record<PromoFieldKey, string>>
  format: CatalogFormat
  coverImageUrl: string | null
  backCoverImageUrl: string | null

  hydrate: (doc: CatalogDoc, id: string) => void
  toDoc: () => CatalogDoc
  setStep: (step: CatalogStep) => void
  setName: (name: string) => void
  setSource: (ref: DataSourceRef, columns: MergeColumn[], rows: MergeRow[]) => void
  setSelectedRowIds: (ids: string[]) => void
  setLevelKeys: (keys: LevelKeys) => void
  setTreeEdits: (patch: Partial<TreeEdits>) => void
  setPrompt: (prompt: string) => void
  setPlan: (plan: CatalogPlan | null) => void
  setSectionGrid: (nodeId: string, grid: CatalogGrid) => void
  toggleFeatured: (nodeId: string, rowId: string) => void
  setFieldMap: (map: Partial<Record<PromoFieldKey, string>>) => void
  setFormat: (format: CatalogFormat) => void
  setCoverImageUrl: (url: string | null) => void
  setBackCoverImageUrl: (url: string | null) => void
  reset: () => void
}

const defaultState = {
  catalogId: null as string | null,
  name: 'Nouveau catalogue',
  step: 'source' as CatalogStep,
  sourceRef: null as DataSourceRef | null,
  rawColumns: [] as MergeColumn[],
  rawRows: [] as MergeRow[],
  selectedRowIds: [] as string[],
  levelKeys: {} as LevelKeys,
  treeEdits: EMPTY_TREE_EDITS,
  prompt: '',
  plan: null as CatalogPlan | null,
  fieldMap: {} as Partial<Record<PromoFieldKey, string>>,
  format: CATALOG_FORMAT_PRESETS[0].format,
  coverImageUrl: null as string | null,
  backCoverImageUrl: null as string | null,
}

// sessionStorage tolérant au quota : un gros catalogue ne doit jamais casser l'édition.
// En cas d'échec (quota dépassé), on purge la clé plutôt que de laisser un snapshot
// PARTIEL/périmé survivre : au reboot, l'absence de session force un rechargement
// propre depuis Firestore (cf. CatalogBuilderPage) au lieu de rejouer un état bâtard.
const safeSessionStorage = {
  getItem: (k: string) => sessionStorage.getItem(k),
  setItem: (k: string, v: string) => {
    try { sessionStorage.setItem(k, v) }
    catch { try { sessionStorage.removeItem(k) } catch { /* rien de plus à faire */ } }
  },
  removeItem: (k: string) => sessionStorage.removeItem(k),
}

export const useCatalogStore = create<CatalogState>()(persist((set, get) => ({
  ...defaultState,
  hydrate: (doc, id) => set({
    catalogId: id, name: doc.name, step: 'source', sourceRef: doc.sourceRef, selectedRowIds: doc.selectedRowIds,
    levelKeys: doc.levelKeys, treeEdits: doc.treeEdits, prompt: doc.prompt, plan: doc.plan,
    fieldMap: doc.fieldMap, format: doc.format, coverImageUrl: doc.coverImageUrl, backCoverImageUrl: doc.backCoverImageUrl,
    // Purge la session précédente (autre catalogue) : rawRows/rawColumns sont
    // rechargés depuis sourceRef par CatalogBuilderPage (garde rawRows.length===0).
    rawRows: [], rawColumns: [],
  }),
  toDoc: () => {
    const s = get()
    return {
      id: s.catalogId ?? '', name: s.name, sourceRef: s.sourceRef, selectedRowIds: s.selectedRowIds,
      levelKeys: s.levelKeys, treeEdits: s.treeEdits, prompt: s.prompt, plan: s.plan,
      fieldMap: s.fieldMap, format: s.format, coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl,
    }
  },
  setStep: (step) => set({ step }),
  setName: (name) => set({ name }),
  setSource: (sourceRef, rawColumns, rawRows) => set({ sourceRef, rawColumns, rawRows }),
  setSelectedRowIds: (selectedRowIds) => set({ selectedRowIds }),
  setLevelKeys: (levelKeys) => set({ levelKeys }),
  setTreeEdits: (patch) => set((s) => ({ treeEdits: { ...s.treeEdits, ...patch } })),
  setPrompt: (prompt) => set({ prompt }),
  setPlan: (plan) => set({ plan }),
  setSectionGrid: (nodeId, grid) => set((s) => s.plan ? ({
    plan: { ...s.plan, sections: s.plan.sections.map((x) => x.nodeId === nodeId ? { ...x, productsPerPage: grid } : x) },
  }) : {}),
  toggleFeatured: (nodeId, rowId) => set((s) => s.plan ? ({
    plan: { ...s.plan, sections: s.plan.sections.map((x) => x.nodeId === nodeId
      ? { ...x, featuredIds: x.featuredIds.includes(rowId) ? x.featuredIds.filter((i) => i !== rowId) : [...x.featuredIds, rowId] }
      : x) },
  }) : {}),
  setFieldMap: (fieldMap) => set({ fieldMap }),
  setFormat: (format) => set({ format }),
  setCoverImageUrl: (coverImageUrl) => set({ coverImageUrl }),
  setBackCoverImageUrl: (backCoverImageUrl) => set({ backCoverImageUrl }),
  reset: () => set(defaultState),
}), {
  name: 'catalog-builder-session',
  storage: createJSONStorage(() => safeSessionStorage),
  partialize: (s) => ({
    catalogId: s.catalogId, name: s.name, step: s.step, sourceRef: s.sourceRef,
    rawColumns: s.rawColumns, rawRows: s.rawRows, selectedRowIds: s.selectedRowIds,
    levelKeys: s.levelKeys, treeEdits: s.treeEdits, prompt: s.prompt, plan: s.plan,
    fieldMap: s.fieldMap, format: s.format, coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl,
  }),
}))
