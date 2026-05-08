import { create } from 'zustand'
import type { ExcelSheet, ExcelColumn, ExcelRow, TaxonomyCategory, TaxonomyTag, TaxonomyLevelMap, FieldTypeId } from '@/features/excel/types'

interface ExcelState {
  sheets: ExcelSheet[]
  activeSheetIndex: number
  selectedColumnKey: string | null
  importModalOpen: boolean
  detecting: boolean
  searchQuery: string
  currentFileName: string | null
  /** docId Firestore stable de la base actuellement chargée. Null si rien chargé
   *  ou si la base en mémoire n'a pas encore été sauvegardée (import local). */
  currentDocId: string | null
  /** Chemin courant dans l'arbre hiérarchique des bases de données (ex: ["B2B", "Perceuses"]).
   *  Utilisé comme path cible pour les imports et scrapes lancés depuis un nœud. */
  currentPath: string[]
  /** Active taxonomy filter: { colKey, value } to filter rows by taxonomy value */
  taxonomyFilter: { colKey: string; value: string } | null
  /** Multi-level taxonomy navigation filter: map of colKey → selected value */
  taxonomyNavFilter: Record<string, string>
  /** Row ID for the product sheet panel */
  sheetRowId: string | null
  /** Whether to group rows by taxonomy levels in the table */
  groupByTaxonomy: boolean
  // Actions
  setSheets: (sheets: ExcelSheet[]) => void
  setActiveSheet: (index: number) => void
  setSelectedColumn: (key: string | null) => void
  setImportModalOpen: (open: boolean) => void
  setDetecting: (v: boolean) => void
  setSearchQuery: (q: string) => void
  setTaxonomyFilter: (filter: { colKey: string; value: string } | null) => void
  setTaxonomyNavFilter: (filter: Record<string, string>) => void
  setSheetRowId: (id: string | null) => void
  setCurrentFileName: (name: string | null) => void
  setCurrentDocId: (id: string | null) => void
  setCurrentPath: (path: string[]) => void
  setGroupByTaxonomy: (v: boolean) => void

  // Column actions
  updateColumnType: (sheetIdx: number, colKey: string, type: FieldTypeId) => void
  setColumnPrimary: (sheetIdx: number, colKey: string) => void
  updateColumnLabel: (sheetIdx: number, colKey: string, label: string) => void
  updateColumnWidth: (sheetIdx: number, colKey: string, width: number) => void
  updateColumnDecimals: (sheetIdx: number, colKey: string, decimals: number) => void
  moveColumn: (sheetIdx: number, colKey: string, direction: 'left' | 'right') => void
  moveColumnTo: (sheetIdx: number, colKey: string, position: 'first' | 'last') => void
  reorderColumns: (sheetIdx: number, fromIndex: number, toIndex: number) => void
  hideColumn: (sheetIdx: number, colKey: string) => void
  updateColumnFormula: (sheetIdx: number, colKey: string, formula: string) => void
  addColumn: (sheetIdx: number, col: import('@/features/excel/types').ExcelColumn, position?: 'start' | 'end') => void

  // Sheet actions
  deleteSheet: (sheetIdx: number) => void
  renameSheet: (sheetIdx: number, newName: string) => void

  // Row actions
  addRow: (sheetIdx: number, row: ExcelRow) => void
  updateCell: (sheetIdx: number, rowId: string, colKey: string, value: string | number | boolean | null) => void
  deleteRow: (sheetIdx: number, rowId: string) => void

  /** Reset une feuille devenue vide après suppression d'un produit scrapé :
   *  retire les colonnes IA — *, le breadcrumb d'Ariane, et reset le name si
   *  c'était un hostname (ex: "fr.rs-online.com" → "Feuille 1"). Idempotent. */
  pruneEmptySheet: (sheetIdx: number) => void

  // Taxonomy actions
  addTaxonomyCategory: (sheetIdx: number, cat: TaxonomyCategory) => void
  updateTaxonomyCategory: (sheetIdx: number, catId: string, updates: Partial<TaxonomyCategory>) => void
  deleteTaxonomyCategory: (sheetIdx: number, catId: string) => void
  addTaxonomyTag: (sheetIdx: number, catId: string, tag: TaxonomyTag) => void
  deleteTaxonomyTag: (sheetIdx: number, catId: string, tagId: string) => void

  // Taxonomy levels
  setTaxonomyLevels: (sheetIdx: number, levels: TaxonomyLevelMap) => void
  setTaxonomyFromLevels: (sheetIdx: number, levels: TaxonomyLevelMap, taxonomy: TaxonomyCategory[]) => void

  // Field visibility
  toggleColumnVisibility: (sheetIdx: number, colKey: string) => void
  showAllColumns: (sheetIdx: number) => void
  hideAllColumns: (sheetIdx: number) => void

  // Reset
  reset: () => void
}

export const useExcelStore = create<ExcelState>((set) => ({
  sheets: [],
  activeSheetIndex: 0,
  selectedColumnKey: null,
  importModalOpen: false,
  detecting: false,
  searchQuery: '',
  currentFileName: null,
  currentDocId: null,
  currentPath: [],
  taxonomyFilter: null,
  taxonomyNavFilter: {},
  sheetRowId: null,
  groupByTaxonomy: true,

  setSheets: (sheets) =>
    set((s) => {
      // Clamp activeSheetIndex pour éviter un index hors-bornes après
      // remplacement (import/load Firebase). Sans ça, sheets[activeSheetIndex]
      // devient undefined → DataTable retourne null et TaxonomyNavigator
      // affiche l'état vide, alors que les onglets sont bien présents.
      const activeSheetIndex =
        sheets.length === 0
          ? 0
          : Math.min(Math.max(s.activeSheetIndex, 0), sheets.length - 1)
      // Migration : retirer le préfixe "IA — " / "IA - " / "IA—" hérité
      // d'une ancienne version sur les labels des colonnes ai_*. Le label
      // corrigé est persisté à la prochaine auto-save Firestore.
      const AI_PREFIX_RE = /^IA\s*[—\-–]\s*/i
      const normalizedSheets = sheets.map((sheet) => {
        let mutated = false
        const cleaned = sheet.columns.map((col) => {
          if (col.key.startsWith('ai_') && AI_PREFIX_RE.test(col.label)) {
            mutated = true
            return { ...col, label: col.label.replace(AI_PREFIX_RE, '') }
          }
          return col
        })
        return mutated ? { ...sheet, columns: cleaned } : sheet
      })
      // Toute fiche produit ouverte référait à une ligne de l'ancien jeu de
      // données — on ferme par sécurité.
      return { sheets: normalizedSheets, activeSheetIndex, sheetRowId: null }
    }),
  setActiveSheet: (activeSheetIndex) =>
    // Fermer toute fiche produit ouverte : son rowId référait à une ligne
    // de l'ancienne feuille et n'existe pas dans la nouvelle → ProductSheet
    // rendrait null, laissant l'écran vide à la place du DataTable.
    set({ activeSheetIndex, sheetRowId: null }),
  setSelectedColumn: (selectedColumnKey) => set({ selectedColumnKey }),
  setImportModalOpen: (importModalOpen) => set({ importModalOpen }),
  setDetecting: (detecting) => set({ detecting }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setTaxonomyFilter: (taxonomyFilter) => set({ taxonomyFilter }),
  setTaxonomyNavFilter: (taxonomyNavFilter) => set({ taxonomyNavFilter }),
  setSheetRowId: (sheetRowId) => set({ sheetRowId }),
  setCurrentFileName: (currentFileName) => set({ currentFileName }),
  setCurrentDocId: (currentDocId) => set({ currentDocId }),
  setCurrentPath: (currentPath) => set({ currentPath }),
  setGroupByTaxonomy: (groupByTaxonomy) => set({ groupByTaxonomy }),

  updateColumnType: (sheetIdx, colKey, type) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.columns = sheet.columns.map((c) =>
        c.key === colKey ? { ...c, fieldType: type } : c,
      )
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  setColumnPrimary: (sheetIdx, colKey) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.columns = sheet.columns.map((c) => ({
        ...c,
        isPrimary: c.key === colKey,
      }))
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  updateColumnLabel: (sheetIdx, colKey, label) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.columns = sheet.columns.map((c) =>
        c.key === colKey ? { ...c, label } : c,
      )
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  updateColumnWidth: (sheetIdx, colKey, width) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.columns = sheet.columns.map((c) =>
        c.key === colKey ? { ...c, width: Math.max(80, width) } : c,
      )
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  updateColumnDecimals: (sheetIdx, colKey, decimals) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.columns = sheet.columns.map((c) =>
        c.key === colKey ? { ...c, decimals } : c,
      )
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  moveColumn: (sheetIdx, colKey, direction) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      const cols = [...sheet.columns]
      const idx = cols.findIndex((c) => c.key === colKey)
      if (idx < 0) return s
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= cols.length) return s
      ;[cols[idx], cols[targetIdx]] = [cols[targetIdx], cols[idx]]
      sheet.columns = cols
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  moveColumnTo: (sheetIdx, colKey, position) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      const cols = [...sheet.columns]
      const idx = cols.findIndex((c) => c.key === colKey)
      if (idx < 0) return s
      const [col] = cols.splice(idx, 1)
      if (position === 'first') cols.unshift(col)
      else cols.push(col)
      sheet.columns = cols
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  reorderColumns: (sheetIdx, fromIndex, toIndex) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      const cols = [...sheet.columns]
      const [moved] = cols.splice(fromIndex, 1)
      cols.splice(toIndex, 0, moved)
      sheet.columns = cols
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  hideColumn: (sheetIdx, colKey) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.columns = sheet.columns.filter((c) => c.key !== colKey)
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  updateColumnFormula: (sheetIdx, colKey, formula) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.columns = sheet.columns.map((c) =>
        c.key === colKey ? { ...c, formula } : c,
      )
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  addColumn: (sheetIdx, col, position) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.columns = position === 'start' ? [col, ...sheet.columns] : [...sheet.columns, col]
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  deleteSheet: (sheetIdx) =>
    set((s) => {
      if (sheetIdx < 0 || sheetIdx >= s.sheets.length) return s
      const sheets = s.sheets.filter((_, i) => i !== sheetIdx)
      // Recalcule l'index actif : si on supprime avant l'actif, décrémente ;
      // si on supprime l'actif, reste sur la même position (clampée à la fin).
      let activeSheetIndex = s.activeSheetIndex
      if (sheetIdx < s.activeSheetIndex) {
        activeSheetIndex = s.activeSheetIndex - 1
      } else if (sheetIdx === s.activeSheetIndex) {
        activeSheetIndex = Math.min(s.activeSheetIndex, sheets.length - 1)
      }
      if (activeSheetIndex < 0) activeSheetIndex = 0
      // Toute fiche produit ouverte référait potentiellement à une ligne de
      // la feuille supprimée — on ferme par sécurité.
      return { sheets, activeSheetIndex, sheetRowId: null }
    }),

  renameSheet: (sheetIdx, newName) =>
    set((s) => {
      if (sheetIdx < 0 || sheetIdx >= s.sheets.length) return s
      const sheets = [...s.sheets]
      sheets[sheetIdx] = { ...sheets[sheetIdx], name: newName }
      return { sheets }
    }),

  addRow: (sheetIdx, row) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.rows = [...sheet.rows, row]
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  updateCell: (sheetIdx, rowId, colKey, value) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.rows = sheet.rows.map((r) =>
        r._id === rowId ? { ...r, [colKey]: value } : r,
      )
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  deleteRow: (sheetIdx, rowId) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.rows = sheet.rows.filter((r) => r._id !== rowId)

      // Auto-cleanup quand la feuille devient vide ET avait des colonnes IA — *
      // (issues d'un import scrape précédent). On retire les colonnes fantômes
      // et on reset le name si c'était un hostname, pour que l'utilisateur
      // ne voie pas un chip "fr.rs-online.com" sur une feuille vide.
      if (sheet.rows.length === 0 && sheet.columns.some((c) => c.key.startsWith('ai_'))) {
        sheet.columns = sheet.columns.filter((c) => !c.key.startsWith('ai_') && c.key !== 'breadcrumb')
        if (/\.[a-z]{2,}/i.test(sheet.name)) sheet.name = `Feuille ${sheetIdx + 1}`
        sheet.taxonomy = []
        sheet.taxonomyLevels = undefined
      }

      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  pruneEmptySheet: (sheetIdx) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = sheets[sheetIdx]
      if (!sheet || sheet.rows.length > 0) return s
      const hasAiCols = sheet.columns.some((c) => c.key.startsWith('ai_'))
      const hasHostName = /\.[a-z]{2,}/i.test(sheet.name)
      if (!hasAiCols && !hasHostName) return s
      const next = { ...sheet }
      next.columns = sheet.columns.filter((c) => !c.key.startsWith('ai_') && c.key !== 'breadcrumb')
      if (hasHostName) next.name = `Feuille ${sheetIdx + 1}`
      next.taxonomy = []
      next.taxonomyLevels = undefined
      sheets[sheetIdx] = next
      return { sheets }
    }),

  addTaxonomyCategory: (sheetIdx, cat) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.taxonomy = [...sheet.taxonomy, cat]
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  updateTaxonomyCategory: (sheetIdx, catId, updates) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.taxonomy = sheet.taxonomy.map((c) =>
        c.id === catId ? { ...c, ...updates } : c,
      )
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  deleteTaxonomyCategory: (sheetIdx, catId) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.taxonomy = sheet.taxonomy.filter((c) => c.id !== catId)
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  addTaxonomyTag: (sheetIdx, catId, tag) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.taxonomy = sheet.taxonomy.map((c) =>
        c.id === catId ? { ...c, tags: [...c.tags, tag] } : c,
      )
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  deleteTaxonomyTag: (sheetIdx, catId, tagId) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.taxonomy = sheet.taxonomy.map((c) =>
        c.id === catId ? { ...c, tags: c.tags.filter((t) => t.id !== tagId) } : c,
      )
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  setTaxonomyLevels: (sheetIdx, levels) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.taxonomyLevels = levels
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  setTaxonomyFromLevels: (sheetIdx, levels, taxonomy) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.taxonomyLevels = levels
      sheet.taxonomy = taxonomy
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  toggleColumnVisibility: (sheetIdx, colKey) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      const hidden = sheet.hiddenColumns ?? []
      sheet.hiddenColumns = hidden.includes(colKey)
        ? hidden.filter((k) => k !== colKey)
        : [...hidden, colKey]
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  showAllColumns: (sheetIdx) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.hiddenColumns = []
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  hideAllColumns: (sheetIdx) =>
    set((s) => {
      const sheets = [...s.sheets]
      const sheet = { ...sheets[sheetIdx] }
      sheet.hiddenColumns = sheet.columns.map((c) => c.key)
      sheets[sheetIdx] = sheet
      return { sheets }
    }),

  reset: () =>
    set({
      sheets: [],
      activeSheetIndex: 0,
      selectedColumnKey: null,
      importModalOpen: false,
      detecting: false,
      searchQuery: '',
      currentFileName: null,
      currentDocId: null,
      currentPath: [],
    }),
}))
