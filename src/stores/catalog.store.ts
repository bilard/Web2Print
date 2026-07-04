import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'
import type { CatalogDensity, CatalogDoc, CatalogFormat, CatalogPlan, LevelKeys, TreeEdits } from '@/features/catalog/catalogTypes'
import { CATALOG_FORMAT_PRESETS } from '@/features/catalog/catalogTypes'
import { EMPTY_TREE_EDITS } from '@/features/catalog/catalogTree'

export type CatalogStep = 'source' | 'structure' | 'prompt' | 'flatplan' | 'preview' | 'export'

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
  /** Ordre manuel des pages du chemin de fer (clés stables, vide = ordre moteur). */
  pageOrder: string[]
  /** Index de page à ouvrir en arrivant sur l'étape Aperçu (transient, non persisté). */
  previewIndex: number | null

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
  setSectionDensity: (nodeId: string, density: CatalogDensity) => void
  /**
   * Densité par défaut : applique la valeur à TOUTES les sections d'un coup.
   * `nodeIds` = nœuds de l'arbre COURANT : une section est créée pour chacun
   * s'il n'en a pas (un plan partiel laisserait sinon des univers à la grille 4
   * implicite → le sélecteur resterait « mixte » et semblerait inopérant).
   */
  setAllSectionsDensity: (density: CatalogDensity, nodeIds: string[]) => void
  toggleFeatured: (nodeId: string, rowId: string) => void
  setFieldMap: (map: Partial<Record<PromoFieldKey, string>>) => void
  setFormat: (format: CatalogFormat) => void
  setCoverImageUrl: (url: string | null) => void
  setBackCoverImageUrl: (url: string | null) => void
  setPageOrder: (order: string[]) => void
  setPreviewIndex: (index: number | null) => void
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
  pageOrder: [] as string[],
  previewIndex: null as number | null,
}

/**
 * Assure qu'une section existe pour `nodeId` (append par défaut grille 4/aucune
 * vedette si absente) — évite qu'un nœud apparu APRÈS la génération du plan
 * (arbre retouché en étape Structure) reste inconfigurable dans StepPrompt.
 */
function upsertSection(sections: CatalogPlan['sections'], nodeId: string): CatalogPlan['sections'] {
  if (sections.some((x) => x.nodeId === nodeId)) return sections
  return [...sections, { nodeId, productsPerPage: 4, randomDensity: false, featuredIds: [] }]
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
    pageOrder: doc.pageOrder, previewIndex: null,
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
      pageOrder: s.pageOrder,
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
  setSectionDensity: (nodeId, density) => set((s) => {
    if (!s.plan) return {}
    const sections = upsertSection(s.plan.sections, nodeId).map((x) => x.nodeId === nodeId
      ? (density === 'random' ? { ...x, randomDensity: true } : { ...x, productsPerPage: density, randomDensity: false })
      : x)
    return { plan: { ...s.plan, sections } }
  }),
  setAllSectionsDensity: (density, nodeIds) => set((s) => {
    if (!s.plan) return {}
    let sections = s.plan.sections
    for (const id of nodeIds) sections = upsertSection(sections, id)
    sections = sections.map((x) => density === 'random'
      ? { ...x, randomDensity: true }
      : { ...x, productsPerPage: density, randomDensity: false })
    return { plan: { ...s.plan, sections } }
  }),
  toggleFeatured: (nodeId, rowId) => set((s) => {
    if (!s.plan) return {}
    const sections = upsertSection(s.plan.sections, nodeId).map((x) => x.nodeId === nodeId
      ? { ...x, featuredIds: x.featuredIds.includes(rowId) ? x.featuredIds.filter((i) => i !== rowId) : [...x.featuredIds, rowId] }
      : x)
    return { plan: { ...s.plan, sections } }
  }),
  setFieldMap: (fieldMap) => set({ fieldMap }),
  setFormat: (format) => set({ format }),
  setCoverImageUrl: (coverImageUrl) => set({ coverImageUrl }),
  setBackCoverImageUrl: (backCoverImageUrl) => set({ backCoverImageUrl }),
  setPageOrder: (pageOrder) => set({ pageOrder }),
  setPreviewIndex: (previewIndex) => set({ previewIndex }),
  reset: () => set(defaultState),
}), {
  name: 'catalog-builder-session',
  storage: createJSONStorage(() => safeSessionStorage),
  partialize: (s) => ({
    catalogId: s.catalogId, name: s.name, step: s.step, sourceRef: s.sourceRef,
    rawColumns: s.rawColumns, rawRows: s.rawRows, selectedRowIds: s.selectedRowIds,
    levelKeys: s.levelKeys, treeEdits: s.treeEdits, prompt: s.prompt, plan: s.plan,
    fieldMap: s.fieldMap, format: s.format, coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl,
    pageOrder: s.pageOrder,
  }),
}))
