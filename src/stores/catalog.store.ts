import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey, CustomFieldMap } from '@/features/retail-promo/promoTypes'
import { defaultPromoFieldMap } from '@/features/retail-promo/promoMapping'
import type { CatalogCharte, CatalogDensity, CatalogDoc, CatalogFormat, CatalogPlan, LevelKeys, TreeEdits } from '@/features/catalog/catalogTypes'
import { CATALOG_FORMAT_PRESETS, DEFAULT_CARD_STYLE } from '@/features/catalog/catalogTypes'
import { normalizeCardLinks } from '@/features/catalog/components/pages/freeLayout'
import { EMPTY_TREE_EDITS } from '@/features/catalog/catalogTree'

/** Corrections d'une ligne produit propres à CE catalogue (publication) :
 *  rowId → { colonne → valeur }. Appliquées par-dessus la source au rendu. */
type CatalogRowOverrides = Record<string, Record<string, string>>

/** Garde-fou systémique : tout plan écrit dans le store passe par la purge des
 *  cycles de liaison (un override ref→unit + le lien PAR DÉFAUT unit→ref rendait
 *  les positions instables et l'UI incohérente). */
function withNormalizedLinks(plan: CatalogPlan | null): CatalogPlan | null {
  if (!plan?.cardStyle) return plan
  const cs = { ...DEFAULT_CARD_STYLE, ...plan.cardStyle }
  const norm = normalizeCardLinks(cs)
  return norm === cs ? plan : { ...plan, cardStyle: { ...plan.cardStyle, layout: norm.layout } }
}

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
  /** Charte extraite des éléments joints (palette/typos/consignes) — moteur créatif. */
  charte: CatalogCharte | null
  fieldMap: Partial<Record<PromoFieldKey, string>>
  fieldMapOverrides: Partial<Record<PromoFieldKey, string>>
  customFields: CustomFieldMap
  format: CatalogFormat
  coverImageUrl: string | null
  backCoverImageUrl: string | null
  /** Visuel du LOGO de marque (Storage) — repli sur le logo typographique (plan.brandName). */
  logoUrl: string | null
  /** Détourages déjà produits, clefés par URL SOURCE : un produit ré-ajouté (ou
   *  partageant son visuel) retrouve sa version détourée SANS nouveau traitement. */
  cutoutBySource: Record<string, string>
  /** L'utilisateur a lancé le détourage au moins une fois → les nouveaux produits le sont aussi. */
  autoCutout: boolean
  /** Ordre manuel des pages du chemin de fer (clés stables, vide = ordre moteur). */
  pageOrder: string[]
  /** Corrections produit propres à CE catalogue (sauvegarde « publication »). */
  rowOverrides: CatalogRowOverrides
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
  setCharte: (charte: CatalogCharte | null) => void
  setSectionDensity: (nodeId: string, density: CatalogDensity) => void
  /**
   * Densité par défaut : applique la valeur à TOUTES les sections d'un coup.
   * `nodeIds` = nœuds de l'arbre COURANT : une section est créée pour chacun
   * s'il n'en a pas (un plan partiel laisserait sinon des univers à la grille 4
   * implicite → le sélecteur resterait « mixte » et semblerait inopérant).
   */
  setAllSectionsDensity: (density: CatalogDensity, nodeIds: string[]) => void
  toggleFeatured: (nodeId: string, rowId: string) => void
  /** Couleur du chapitre (univers) — '' = palette cyclique par défaut. */
  setSectionColor: (nodeId: string, color: string) => void
  setFieldMap: (map: Partial<Record<PromoFieldKey, string>>) => void
  setFieldMapOverride: (key: PromoFieldKey, column: string | null) => void
  setCustomFields: (map: CustomFieldMap) => void
  setFormat: (format: CatalogFormat) => void
  setCoverImageUrl: (url: string | null) => void
  setBackCoverImageUrl: (url: string | null) => void
  setLogoUrl: (url: string | null) => void
  /** Mémorise des détourages (source → détouré) et, optionnellement, arme le détourage automatique. */
  rememberCutouts: (entries: Record<string, string>, auto?: boolean) => void
  /** Oublie TOUS les détourages mémorisés — un nouveau lot repart d'un traitement neuf. */
  clearCutouts: () => void
  setPageOrder: (order: string[]) => void
  setPreviewIndex: (index: number | null) => void
  /** Pose/retire les corrections publication d'une ligne ('' ou null = champ rendu à la source). */
  setRowOverride: (rowId: string, patch: Record<string, string | null>) => void
  clearRowOverride: (rowId: string) => void
  /** Répercute une sauvegarde MASTER dans les lignes chargées (sans re-fetch). */
  applyMasterPatch: (rowId: string, patch: Record<string, string>) => void
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
  charte: null as CatalogCharte | null,
  fieldMap: {} as Partial<Record<PromoFieldKey, string>>,
  fieldMapOverrides: {} as Partial<Record<PromoFieldKey, string>>,
  customFields: [] as CustomFieldMap,
  format: CATALOG_FORMAT_PRESETS[0].format,
  coverImageUrl: null as string | null,
  backCoverImageUrl: null as string | null,
  logoUrl: null as string | null,
  cutoutBySource: {} as Record<string, string>,
  autoCutout: false,
  pageOrder: [] as string[],
  rowOverrides: {} as CatalogRowOverrides,
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
    // Les docs EXISTANTS passent aussi par la purge des cycles de liaison
    // (un cycle persisté avant le garde-fou survivrait sinon à chaque session).
    levelKeys: doc.levelKeys, treeEdits: doc.treeEdits, prompt: doc.prompt, plan: withNormalizedLinks(doc.plan), charte: doc.charte ?? null,
    fieldMap: doc.fieldMap, fieldMapOverrides: doc.fieldMapOverrides, customFields: doc.customFields,
    format: doc.format, coverImageUrl: doc.coverImageUrl, backCoverImageUrl: doc.backCoverImageUrl,
    logoUrl: doc.logoUrl ?? null, cutoutBySource: doc.cutoutBySource ?? {}, autoCutout: doc.autoCutout ?? false,
    pageOrder: doc.pageOrder, rowOverrides: doc.rowOverrides ?? {}, previewIndex: null,
    // Purge la session précédente (autre catalogue) : rawRows/rawColumns sont
    // rechargés depuis sourceRef par CatalogBuilderPage (garde rawRows.length===0).
    rawRows: [], rawColumns: [],
  }),
  toDoc: () => {
    const s = get()
    return {
      id: s.catalogId ?? '', name: s.name, sourceRef: s.sourceRef, selectedRowIds: s.selectedRowIds,
      levelKeys: s.levelKeys, treeEdits: s.treeEdits, prompt: s.prompt, plan: s.plan,
      fieldMap: s.fieldMap, fieldMapOverrides: s.fieldMapOverrides, customFields: s.customFields,
      format: s.format, coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl, logoUrl: s.logoUrl,
      cutoutBySource: s.cutoutBySource, autoCutout: s.autoCutout,
      pageOrder: s.pageOrder, rowOverrides: s.rowOverrides, charte: s.charte,
    }
  },
  setStep: (step) => set({ step }),
  setName: (name) => set({ name }),
  setSource: (sourceRef, rawColumns, rawRows) => set({ sourceRef, rawColumns, rawRows }),
  setSelectedRowIds: (selectedRowIds) => set({ selectedRowIds }),
  setLevelKeys: (levelKeys) => set({ levelKeys }),
  setTreeEdits: (patch) => set((s) => ({ treeEdits: { ...s.treeEdits, ...patch } })),
  setPrompt: (prompt) => set({ prompt }),
  setPlan: (plan) => set({ plan: withNormalizedLinks(plan) }),
  setCharte: (charte) => set({ charte }),
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
  setSectionColor: (nodeId, color) => set((s) => {
    if (!s.plan) return {}
    const sections = upsertSection(s.plan.sections, nodeId).map((x) => x.nodeId === nodeId ? { ...x, color } : x)
    return { plan: { ...s.plan, sections } }
  }),
  setFieldMap: (fieldMap) => set({ fieldMap }),
  setFieldMapOverride: (key, column) => set((s) => {
    const fieldMapOverrides = { ...s.fieldMapOverrides }
    if (column) fieldMapOverrides[key] = column
    else delete fieldMapOverrides[key]
    const fieldMap = { ...defaultPromoFieldMap(s.rawColumns), ...fieldMapOverrides }
    return { fieldMapOverrides, fieldMap }
  }),
  setCustomFields: (customFields) => set({ customFields }),
  setFormat: (format) => set({ format }),
  setCoverImageUrl: (coverImageUrl) => set({ coverImageUrl }),
  setBackCoverImageUrl: (backCoverImageUrl) => set({ backCoverImageUrl }),
  setLogoUrl: (logoUrl) => set({ logoUrl }),
  rememberCutouts: (entries, auto) => set((s) => ({ cutoutBySource: { ...s.cutoutBySource, ...entries }, autoCutout: auto ?? s.autoCutout })),
  clearCutouts: () => set({ cutoutBySource: {}, autoCutout: false }),
  setPageOrder: (pageOrder) => set({ pageOrder }),
  setPreviewIndex: (previewIndex) => set({ previewIndex }),
  setRowOverride: (rowId, patch) => set((s) => {
    const cur = { ...(s.rowOverrides[rowId] ?? {}) }
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') delete cur[k]
      else cur[k] = v
    }
    const rowOverrides = { ...s.rowOverrides }
    if (Object.keys(cur).length) rowOverrides[rowId] = cur
    else delete rowOverrides[rowId]
    return { rowOverrides }
  }),
  clearRowOverride: (rowId) => set((s) => {
    const rowOverrides = { ...s.rowOverrides }
    delete rowOverrides[rowId]
    return { rowOverrides }
  }),
  applyMasterPatch: (rowId, patch) => set((s) => ({
    rawRows: s.rawRows.map((r) => (r._id === rowId ? { ...r, ...patch } : r)),
  })),
  reset: () => set(defaultState),
}), {
  name: 'catalog-builder-session',
  storage: createJSONStorage(() => safeSessionStorage),
  partialize: (s) => ({
    catalogId: s.catalogId, name: s.name, step: s.step, sourceRef: s.sourceRef,
    // ⚠ rawColumns / rawRows NE SONT PLUS persistés : une copie de la base en
    // session servait des données périmées (visuel régénéré invisible dans le
    // catalogue). Ils sont relus depuis la source à chaque ouverture.
    selectedRowIds: s.selectedRowIds,
    levelKeys: s.levelKeys, treeEdits: s.treeEdits, prompt: s.prompt, plan: s.plan,
    fieldMap: s.fieldMap, fieldMapOverrides: s.fieldMapOverrides, customFields: s.customFields,
    format: s.format, coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl, logoUrl: s.logoUrl,
    cutoutBySource: s.cutoutBySource, autoCutout: s.autoCutout,
    pageOrder: s.pageOrder, rowOverrides: s.rowOverrides, charte: s.charte,
  }),
}))
