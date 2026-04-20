import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  FileSpreadsheet, Upload, Download, Search, ArrowLeft,
  Table2, Tag, Plus, Save, Cloud, CloudOff,
  Loader2, Trash2, Columns3, RefreshCw, FolderTree, Group, List, Globe,
  MoreVertical, ExternalLink, Sparkles, Layers, X,
  PanelLeftClose, PanelRightClose, ChevronsRight, ChevronsLeft,
  Database, Folder, FolderOpen, Pencil, Check, ChevronRight,
} from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { useExcelImport } from '@/features/excel/useExcelImport'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { ExcelImportModal } from '@/features/excel/ExcelImportModal'
import { DataTable, isRowEnriched } from '@/features/excel/DataTable'
import { TaxonomyManager } from '@/features/excel/TaxonomyManager'
import { FieldsPanel } from '@/features/excel/FieldsPanel'
import { TaxonomyNavigator } from '@/features/excel/TaxonomyNavigator'
import { ProductSheet } from '@/features/excel/ProductSheet'
import { UpdatePreviewModal } from '@/features/excel/UpdatePreviewModal'
import { ScrapingModal } from '@/features/scraping/ScrapingModal'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useRenameTaxonomy } from '@/features/taxonomy/useTaxonomyMutations'
import { toast } from 'sonner'

type RightTab = 'fields' | 'taxonomy'

export default function DataPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const {
    sheets, activeSheetIndex, importModalOpen, searchQuery, currentFileName, currentDocId, currentPath,
    sheetRowId, taxonomyNavFilter, groupByTaxonomy, aiFilter,
    setImportModalOpen, setActiveSheet, setSearchQuery, setSheets, setCurrentFileName, setCurrentDocId, setCurrentPath,
    setSheetRowId, setGroupByTaxonomy, setAiFilter, deleteSheet,
  } = useExcelStore()
  const { exportToXlsx, createEmpty } = useExcelImport()
  const { saveToFirebase, loadFromFirebase, listSavedFiles, deleteFromFirebase, renameFile, moveFile } = useExcelFirebase()
  const { data: taxonomies } = useTaxonomies()
  const renameTaxonomy = useRenameTaxonomy()
  const [rightTab, setRightTab] = useState<RightTab>('fields')
  const [showRight, setShowRight] = useState(true)
  const [showBdd, setShowBdd] = useState(true)
  const [showNav, setShowNav] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [savedFiles, setSavedFiles] = useState<SavedFileEntry[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [scrapingOpen, setScrapingOpen] = useState(false)
  // Quand l'utilisateur clique sur un nœud de la taxonomie, fermer la fiche
  // produit pour revenir à la vue liste (DataTable).
  useEffect(() => {
    setSheetRowId(null)
  }, [taxonomyNavFilter, setSheetRowId])

  const sheet = sheets[activeSheetIndex]
  const hasData = sheets.length > 0 && (sheet?.rows.length > 0 || sheet?.columns.length > 0)
  // Une BDD est sélectionnée si Firebase a un docId courant.
  // Pendant la création (Nouvelle BDD), docId est null le temps du save → état non sélectionné.
  const hasSelectedDb = currentDocId !== null

  // Compute filtered row IDs for ProductSheet navigation
  const filteredRowIds = useMemo(() => {
    if (!sheet) return []
    let rows = sheet.rows
    const navEntries = Object.entries(taxonomyNavFilter)
    if (navEntries.length > 0) {
      rows = rows.filter((r) => navEntries.every(([k, v]) => String(r[k]) === v))
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter((r) =>
        sheet.columns.some((col) => {
          const v = r[col.key]
          return v !== null && String(v).toLowerCase().includes(q)
        })
      )
    }
    if (aiFilter === 'enriched') {
      rows = rows.filter(isRowEnriched)
    } else if (aiFilter === 'raw') {
      rows = rows.filter((r) => !isRowEnriched(r))
    }
    return rows.map((r) => r._id)
  }, [sheet, taxonomyNavFilter, searchQuery, aiFilter])

  // Compteurs pour le toggle IA : total / enrichis / non-enrichis (sur l'ensemble de la feuille)
  const aiCounts = useMemo(() => {
    if (!sheet) return { total: 0, enriched: 0, raw: 0 }
    let enriched = 0
    for (const r of sheet.rows) if (isRowEnriched(r)) enriched++
    return { total: sheet.rows.length, enriched, raw: sheet.rows.length - enriched }
  }, [sheet])

  // Load saved files list
  const refreshFileList = useCallback(async () => {
    setLoadingFiles(true)
    try {
      const files = await listSavedFiles()
      setSavedFiles(files)
    } catch { /* ignore */ }
    finally { setLoadingFiles(false) }
  }, [listSavedFiles])

  useEffect(() => {
    refreshFileList()
  }, [])  

  // Auto-save on data change (debounced sauf pour les nouvelles BDD :
  // quand currentDocId est null, on sauve immédiatement et on rafraîchit la liste).
  useEffect(() => {
    if (!currentFileName || sheets.length === 0) return
    const delay = currentDocId === null ? 0 : 3000
    const timer = setTimeout(async () => {
      setSaving(true)
      try {
        const savedDocId = await saveToFirebase(currentFileName, sheets, currentPath, currentDocId)
        if (savedDocId && savedDocId !== currentDocId) {
          setCurrentDocId(savedDocId)
          await refreshFileList()
        }
        setSaveStatus('saved')
      } catch (err) {
        console.error('[DataPage] Auto-save error:', err)
        setSaveStatus('error')
      } finally {
        setSaving(false)
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [sheets, currentFileName, currentPath, currentDocId])

  const handleSave = async () => {
    const name = currentFileName ?? sheet?.name ?? 'data'
    if (!name) return
    setSaving(true)
    try {
      const savedDocId = await saveToFirebase(name, sheets, currentPath, currentDocId)
      if (savedDocId) setCurrentDocId(savedDocId)
      setCurrentFileName(name)
      setSaveStatus('saved')
      await refreshFileList()
    } catch (err) {
      console.error('[DataPage] Manual save error:', err)
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const handleLoadFile = async (docId: string) => {
    const file = savedFiles.find((f) => f.docId === docId)
    if (!file) return
    const loaded = await loadFromFirebase(docId)
    if (loaded) {
      setCurrentDocId(docId)
      setCurrentFileName(file.fileName)
      setCurrentPath(file.path ?? [])
      setSaveStatus('saved')
      setSheetRowId(null) // fermer la fiche produit lors du changement de source
    }
  }

  const handleDeleteFile = async (docId: string) => {
    await deleteFromFirebase(docId)
    await refreshFileList()
    if (currentDocId === docId) {
      setSheets([])
      setCurrentFileName(null)
      setCurrentDocId(null)
    }
  }

  const handleMoveFile = async (docId: string, nextPath: string[]) => {
    await moveFile(docId, nextPath)
    await refreshFileList()
    if (currentDocId === docId) setCurrentPath(nextPath)
  }

  /** Chemin cible en attente d'import/scrape. Appliqué au store seulement
   *  si l'utilisateur valide réellement la modale (sinon on ne migre pas la
   *  base courante via auto-save). */
  const [pendingTargetPath, setPendingTargetPath] = useState<string[] | null>(null)

  const handleImportAtPath = (path: string[]) => {
    setPendingTargetPath(path)
    setImportModalOpen(true)
  }

  const handleScrapeAtPath = (path: string[]) => {
    setPendingTargetPath(path)
    setScrapingOpen(true)
  }

  const handleCreateAtPath = (path: string[]) => {
    setSheets([])
    setCurrentDocId(null)
    setCurrentFileName('Nouvelle BDD')
    setCurrentPath(path)
    setSheetRowId(null)
    createEmpty()
    // L'auto-save déclenche immédiatement (delay=0 quand docId est null)
    // et rafraîchit la liste après création du doc Firebase.
  }

  const handleRenameFile = async (docId: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    // Récupère l'ancien nom avant rename pour retrouver la taxonomie associée.
    const oldName = savedFiles.find((f) => f.docId === docId)?.fileName
    await renameFile(docId, trimmed)
    await refreshFileList()
    if (currentDocId === docId) setCurrentFileName(trimmed)
    // Renomme la taxonomie associée (même nom que la BDD avant rename).
    if (oldName && oldName !== trimmed && taxonomies) {
      const matching = taxonomies.find((t) => t.name === oldName)
      if (matching) {
        renameTaxonomy.mutate({ id: matching.id, name: trimmed })
      }
    }
  }

  const handleImportClose = () => {
    setImportModalOpen(false)
  }

  // Sidebar toolbar rendered via portal when embedded
  const portalTarget = embedded ? document.getElementById('data-toolbar-portal') : null

  const handleToggleRightTab = (tab: RightTab) => {
    if (showRight && rightTab === tab) {
      setShowRight(false)
    } else {
      setRightTab(tab)
      setShowRight(true)
    }
  }

  const sidebarBtn = (active: boolean) =>
    `w-full flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] transition-colors ${
      active
        ? 'bg-white/[0.08] text-white/80'
        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
    }`

  const sidebarToolbar = (
    <div className="space-y-3">
      {hasData && (
        <>
          {/* ─── AFFICHAGE ─── */}
          <div>
            <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 mb-1">Affichage</p>
            <div className="space-y-px">
              <button onClick={() => setShowNav(!showNav)} className={sidebarBtn(showNav)}>
                <FolderTree className="w-4 h-4 opacity-50" aria-hidden="true" />
                Navigation
                {showNav && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400/80" />}
              </button>
              <button onClick={() => setGroupByTaxonomy(!groupByTaxonomy)} className={sidebarBtn(groupByTaxonomy)}>
                {groupByTaxonomy ? <Group className="w-4 h-4 opacity-50" aria-hidden="true" /> : <List className="w-4 h-4 opacity-50" aria-hidden="true" />}
                Grouper
                {groupByTaxonomy && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400/80" />}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── PANNEAUX ─── toujours visible */}
      <div>
        <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 mb-1">Panneaux</p>
        <div className="space-y-px">
          <button onClick={() => setShowBdd(!showBdd)} className={sidebarBtn(showBdd)}>
            <Cloud className="w-4 h-4 opacity-50" aria-hidden="true" />
            Bases de donnees
            {savedFiles.length > 0 && <span className="ml-auto text-[9px] text-white/30">{savedFiles.length}</span>}
            {showBdd && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-indigo-400/80" />}
          </button>
          {hasData && (
            <>
              <button onClick={() => handleToggleRightTab('fields')} className={sidebarBtn(showRight && rightTab === 'fields')}>
                <Columns3 className="w-4 h-4 opacity-50" aria-hidden="true" />
                Champs
                {showRight && rightTab === 'fields' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400/80" />}
              </button>
              <button onClick={() => handleToggleRightTab('taxonomy')} className={sidebarBtn(showRight && rightTab === 'taxonomy')}>
                <Tag className="w-4 h-4 opacity-50" aria-hidden="true" />
                Taxonomie
                {showRight && rightTab === 'taxonomy' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400/80" />}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  const headerBtn = 'flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-colors'

  return (
    <div className={`${embedded ? 'h-full' : 'h-screen'} bg-[#0f0f0f] text-white flex flex-col overflow-hidden`}>
      {/* Portal for sidebar toolbar */}
      {portalTarget && createPortal(sidebarToolbar, portalTarget)}

      {/* Header */}
      <header className="h-11 bg-[#161616] border-b border-white/[0.06] flex items-center px-3 gap-2 shrink-0">
        {!embedded && (
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-md transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-white/30" />
          {/* Nom du fichier — masqué si identique à la feuille active (projet 1 feuille) */}
          {sheets.length > 1 && (
            <span className="text-[13px] font-medium text-white/50">
              {currentFileName ?? 'Données'}
            </span>
          )}
          {/* Save status */}
          {hasData && (
            <span className="flex items-center">
              {saving ? (
                <Loader2 className="w-3 h-3 text-white/25 animate-spin" />
              ) : saveStatus === 'saved' ? (
                <Cloud className="w-3 h-3 text-emerald-400/60" />
              ) : saveStatus === 'error' ? (
                <CloudOff className="w-3 h-3 text-red-400/60" />
              ) : null}
            </span>
          )}
          {/* Sheet tabs (multi-feuilles) ou nom unique */}
          {sheets.length > 1 ? (
            <div className="flex items-center gap-0.5 border-l border-white/[0.06] pl-2">
              {sheets.map((s, i) => {
                const active = i === activeSheetIndex
                return (
                  <div
                    key={i}
                    className={`group/tab flex items-center gap-0.5 pl-2.5 pr-1 rounded-md transition-colors ${
                      active
                        ? 'bg-white/[0.08] text-white/70'
                        : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                    }`}
                  >
                    <button
                      onClick={() => setActiveSheet(i)}
                      className="text-[11px] py-1 max-w-[140px] truncate"
                      title={s.name}
                    >
                      {s.name}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSheet(i)
                        toast.success(`Onglet « ${s.name} » supprimé`)
                      }}
                      className={`${active ? 'opacity-60' : 'opacity-0'} group-hover/tab:opacity-100 hover:bg-white/10 rounded p-0.5 transition-opacity text-white/60 hover:text-white cursor-pointer`}
                      title={`Supprimer « ${s.name} »`}
                      aria-label={`Supprimer ${s.name}`}
                    >
                      <X className="w-3 h-3 pointer-events-none" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <h1 className="text-[13px] font-medium text-white/70">
              {currentFileName ?? sheet?.name ?? 'Données'}
            </h1>
          )}
        </div>

        {/* Separator */}
        <div className="h-5 w-px bg-white/[0.06] mx-1" />

        {/* File actions */}
        <div className="flex items-center gap-0.5">
          {hasData && (
            <>
              <button onClick={() => setUpdateModalOpen(true)} className={headerBtn}>
                <RefreshCw className="w-3.5 h-3.5" />
                Maj
              </button>
              <button onClick={handleSave} disabled={saving} className={`${headerBtn} disabled:opacity-40`}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Sauver
              </button>
              <button
                onClick={() => exportToXlsx(sheets, `${currentFileName ?? sheet?.name ?? 'export'}.xlsx`)}
                className={headerBtn}
              >
                <Download className="w-3.5 h-3.5" />
                Exporter
              </button>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Search */}
        {hasData && (
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-md px-2.5 py-1.5 w-56">
            <Search className="w-3.5 h-3.5 text-white/25" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-[12px] text-white/60 placeholder:text-white/25 outline-none flex-1"
            />
          </div>
        )}

        {/* Filtre IA : segment 3 options (Tous / IA / Non-IA) */}
        {hasData && (
          <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-md p-0.5 gap-0.5">
            <button
              onClick={() => setAiFilter('all')}
              title="Afficher tous les produits"
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                aiFilter === 'all'
                  ? 'bg-white/[0.08] text-white/85'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Tous
              <span className="text-[10px] text-white/40 tabular-nums">{aiCounts.total}</span>
            </button>
            <button
              onClick={() => setAiFilter('enriched')}
              title="Afficher uniquement les produits enrichis par l'IA"
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                aiFilter === 'enriched'
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25'
                  : 'text-white/40 hover:text-indigo-300/70 hover:bg-indigo-500/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              IA
              <span className={`text-[10px] tabular-nums ${aiFilter === 'enriched' ? 'text-indigo-300/70' : 'text-white/40'}`}>
                {aiCounts.enriched}
              </span>
            </button>
            <button
              onClick={() => setAiFilter('raw')}
              title="Afficher uniquement les produits non enrichis"
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                aiFilter === 'raw'
                  ? 'bg-white/[0.08] text-white/85 border border-white/15'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
              }`}
            >
              Non-IA
              <span className="text-[10px] text-white/40 tabular-nums">{aiCounts.raw}</span>
            </button>
          </div>
        )}

        {/* Standalone toggle buttons */}
        {!embedded && hasData && (
          <>
            <div className="h-5 w-px bg-white/[0.06] mx-1" />
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setShowNav(!showNav)}
                className={`p-1.5 rounded-md transition-colors ${
                  showNav ? 'bg-white/[0.08] text-white/60' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
                title="Navigation taxonomie"
              >
                <FolderTree className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setGroupByTaxonomy(!groupByTaxonomy)}
                className={`p-1.5 rounded-md transition-colors ${
                  groupByTaxonomy ? 'bg-white/[0.08] text-white/60' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
                title={groupByTaxonomy ? 'Degrouper la taxonomie' : 'Grouper par taxonomie'}
              >
                {groupByTaxonomy ? <Group className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setShowRight(!showRight)}
                className={`p-1.5 rounded-md transition-colors ${
                  showRight ? 'bg-white/[0.08] text-white/60' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
                title="Panneaux"
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — Bases de donnees (always available) */}
        {showBdd ? (
          <div className="w-60 bg-[#161616] border-r border-white/10 flex flex-col shrink-0 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" />
                Bases de donnees
              </h3>
              <button
                onClick={() => setShowBdd(false)}
                className="p-1 text-white/40 hover:text-white/80 hover:bg-white/10 rounded transition-colors"
                title="Fermer la colonne"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <SavedFilesPanel
                files={savedFiles}
                loading={loadingFiles}
                currentDocId={currentDocId}
                onLoad={handleLoadFile}
                onDelete={handleDeleteFile}
                onRename={handleRenameFile}
                onMove={handleMoveFile}
                onImportAt={handleImportAtPath}
                onScrapeAt={handleScrapeAtPath}
                onCreateAt={handleCreateAtPath}
                onRefresh={refreshFileList}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowBdd(true)}
            className="w-8 bg-[#161616] border-r border-white/10 hover:bg-white/[0.04] hover:border-indigo-500/30 flex flex-col items-center gap-2 pt-3 shrink-0 transition-colors group"
            title="Ouvrir Bases de données"
          >
            <ChevronsRight className="w-5 h-5 text-white/60 group-hover:text-indigo-400" />
            <span className="text-[10px] font-semibold tracking-wider text-white/40 group-hover:text-white/70 [writing-mode:vertical-rl] rotate-180">
              Bases
            </span>
          </button>
        )}

        {/* Main area : top import menu + content (data or empty) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Import type menu — top (désactivé si aucune BDD sélectionnée) */}
          <div className="h-14 border-b border-white/[0.06] bg-[#131313] flex items-center gap-2 px-4 shrink-0">
            <button
              onClick={() => setImportModalOpen(true)}
              disabled={!hasSelectedDb}
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-white/5 disabled:hover:bg-white/5 disabled:text-white/25 disabled:cursor-not-allowed text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
              title={hasSelectedDb ? 'Importer un fichier' : 'Sélectionnez une base de données'}
            >
              <Upload className="w-4 h-4" />
              Importer un fichier
            </button>
            <button
              onClick={() => setScrapingOpen(true)}
              disabled={!hasSelectedDb}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 disabled:text-white/25 disabled:hover:bg-white/5 disabled:cursor-not-allowed text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
              title={hasSelectedDb ? 'Scraper le web' : 'Sélectionnez une base de données'}
            >
              <Globe className="w-4 h-4" />
              Scraper le web
            </button>
            <button
              onClick={createEmpty}
              disabled={!hasSelectedDb}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 disabled:text-white/25 disabled:hover:bg-white/5 disabled:cursor-not-allowed text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
              title={hasSelectedDb ? 'Créer un tableau vide' : 'Sélectionnez une base de données'}
            >
              <Plus className="w-4 h-4" />
              Creer vide
            </button>
          </div>

          {hasSelectedDb && hasData ? (
            <div className="flex-1 flex overflow-hidden">
              {/* Taxonomy navigation sidebar */}
              {showNav ? (
                <div className="w-56 bg-[#161616] border-r border-white/10 flex flex-col shrink-0 overflow-hidden">
                  <TaxonomyNavigator onClose={() => setShowNav(false)} />
                </div>
              ) : (
                <button
                  onClick={() => setShowNav(true)}
                  className="w-8 bg-[#161616] border-r border-white/10 hover:bg-white/[0.04] hover:border-indigo-500/30 flex flex-col items-center gap-2 pt-3 shrink-0 transition-colors group"
                  title="Ouvrir Navigation"
                >
                  <ChevronsRight className="w-5 h-5 text-white/60 group-hover:text-indigo-400" />
                  <span className="text-[10px] font-semibold tracking-wider text-white/40 group-hover:text-white/70 [writing-mode:vertical-rl] rotate-180">
                    Navigation
                  </span>
                </button>
              )}

              {/* Main area : table OU fiche produit plein écran (exclusif) */}
              {sheetRowId ? (
                <div className="flex-1 min-w-0 bg-[#1a1a1e] flex flex-col overflow-hidden">
                  <ProductSheet
                    rowId={sheetRowId}
                    allRowIds={filteredRowIds}
                    onClose={() => setSheetRowId(null)}
                    onNavigate={(id) => setSheetRowId(id)}
                  />
                </div>
              ) : (
                <DataTable />
              )}

              {/* Right sidebar — Champs / Taxonomie — masqué quand la fiche produit est ouverte */}
              {!sheetRowId && (showRight ? (
                <div className="w-72 bg-[#161616] border-l border-white/10 flex flex-col shrink-0 overflow-hidden">
                  {/* Tabs + close */}
                  <div className="flex border-b border-white/10 items-stretch">
                    {([
                      { id: 'fields' as const, icon: Columns3, label: 'Champs' },
                      { id: 'taxonomy' as const, icon: Tag, label: 'Taxonomie' },
                    ]).map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setRightTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-2.5 text-[11px] font-medium transition-colors ${
                          rightTab === tab.id
                            ? 'text-indigo-400 border-b-2 border-indigo-400'
                            : 'text-white/40 hover:text-white/60'
                        }`}
                      >
                        <tab.icon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowRight(false)}
                      className="px-2 text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors border-l border-white/10"
                      title="Fermer la colonne"
                    >
                      <PanelRightClose className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-y-auto p-3">
                    {rightTab === 'fields' ? (
                      <FieldsPanel />
                    ) : (
                      <TaxonomyManager />
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowRight(true)}
                  className="w-8 bg-[#161616] border-l border-white/10 hover:bg-white/[0.04] hover:border-indigo-500/30 flex flex-col items-center gap-2 pt-3 shrink-0 transition-colors group"
                  title="Ouvrir Champs / Taxonomie"
                >
                  <ChevronsLeft className="w-5 h-5 text-white/60 group-hover:text-indigo-400" />
                  <span className="text-[10px] font-semibold tracking-wider text-white/40 group-hover:text-white/70 [writing-mode:vertical-rl]">
                    Champs / Taxo
                  </span>
                </button>
              ))}
            </div>
          ) : (
            /* Empty illustration */
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-5 max-w-sm text-center">
                <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center">
                  <Table2 className="w-10 h-10 text-white/20" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white/70 mb-2">
                    {hasSelectedDb ? 'Aucune donnee' : 'Aucune base selectionnee'}
                  </h2>
                  <p className="text-sm text-white/40">
                    {hasSelectedDb
                      ? 'Choisissez un type d\'import dans le menu ci-dessus.'
                      : 'Selectionnez une base de donnees a gauche, ou creez-en une via le bouton +.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import modal */}
      <ExcelImportModal
        open={importModalOpen}
        onClose={() => { handleImportClose(); setPendingTargetPath(null) }}
        targetPath={pendingTargetPath ?? undefined}
      />

      {/* Scraping modal */}
      <ScrapingModal
        open={scrapingOpen}
        onClose={() => { setScrapingOpen(false); setPendingTargetPath(null) }}
        targetPath={pendingTargetPath ?? undefined}
      />

      {/* Update/diff modal */}
      <UpdatePreviewModal
        open={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        onApply={(newSheets) => {
          setSheets(newSheets)
          setSaveStatus('idle')
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Arbre hiérarchique des bases de données
// ─────────────────────────────────────────────────────────────────────────────

interface SavedFileEntry {
  fileName: string
  docId: string
  totalRows: number
  updatedAt: Date | null
  path: string[]
}

interface FolderNode {
  /** Segment courant du chemin (racine = "") */
  name: string
  /** Chemin complet jusqu'à ce dossier (sans le segment courant pour la racine) */
  path: string[]
  folders: Map<string, FolderNode>
  /** Bases de données directement rattachées à ce dossier */
  files: SavedFileEntry[]
}

/** Construit un arbre de dossiers à partir des `path` des bases. */
function buildDatabaseTree(files: SavedFileEntry[]): FolderNode {
  const root: FolderNode = { name: '', path: [], folders: new Map(), files: [] }
  for (const f of files) {
    let node = root
    for (let i = 0; i < f.path.length; i++) {
      const seg = f.path[i]
      let child = node.folders.get(seg)
      if (!child) {
        child = { name: seg, path: f.path.slice(0, i + 1), folders: new Map(), files: [] }
        node.folders.set(seg, child)
      }
      node = child
    }
    node.files.push(f)
  }
  return root
}

function pathKey(path: string[]): string {
  return path.join('/')
}

/** Saved files list panel */
function SavedFilesPanel({ files, loading, currentDocId, onLoad, onDelete, onRename, onMove, onImportAt, onScrapeAt, onCreateAt, onRefresh }: {
  files: SavedFileEntry[]
  loading: boolean
  currentDocId: string | null
  onLoad: (docId: string) => void
  onDelete: (docId: string) => void
  onRename: (docId: string, newName: string) => void | Promise<void>
  onMove: (docId: string, nextPath: string[]) => void | Promise<void>
  onImportAt: (path: string[]) => void
  onScrapeAt: (path: string[]) => void
  onCreateAt: (path: string[]) => void
  onRefresh: () => void
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [openAddMenu, setOpenAddMenu] = useState<string | null>(null)
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [movingDocId, setMovingDocId] = useState<string | null>(null)
  const [moveValue, setMoveValue] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const tree = useMemo(() => buildDatabaseTree(files), [files])

  const handleOverlayClick = () => { setOpenMenu(null); setOpenAddMenu(null) }

  const startRename = (f: SavedFileEntry) => {
    setRenamingDocId(f.docId)
    setRenameValue(f.fileName)
    setOpenMenu(null)
  }
  const cancelRename = () => {
    setRenamingDocId(null)
    setRenameValue('')
  }
  const commitRename = async (f: SavedFileEntry) => {
    const next = renameValue.trim()
    if (next && next !== f.fileName) await onRename(f.docId, next)
    cancelRename()
  }

  const startMove = (f: SavedFileEntry) => {
    setMovingDocId(f.docId)
    setMoveValue(f.path.join(' / '))
    setOpenMenu(null)
  }
  const cancelMove = () => {
    setMovingDocId(null)
    setMoveValue('')
  }
  const commitMove = async (f: SavedFileEntry) => {
    const next = moveValue
      .split(/[\\/]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    await onMove(f.docId, next)
    cancelMove()
  }

  const toggleFolder = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-1">
        <div className="relative">
          <div className="flex items-center bg-white/[0.04] border border-white/10 rounded-md overflow-hidden">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenAddMenu(openAddMenu === '__root_create__' ? null : '__root_create__') }}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
              title="Créer une nouvelle base"
            >
              <Plus className="w-3 h-3" />
              Créer
            </button>
            <div className="w-px h-3 bg-white/10" />
            <button
              onClick={(e) => { e.stopPropagation(); setOpenAddMenu(openAddMenu === '__root_import__' ? null : '__root_import__') }}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
              title="Importer ou scraper"
            >
              <Upload className="w-3 h-3" />
              Import
            </button>
          </div>
          {openAddMenu === '__root_create__' && (
            <CreateMenu
              onCreateDb={() => { onCreateAt([]); setOpenAddMenu(null) }}
            />
          )}
          {openAddMenu === '__root_import__' && (
            <AddMenu
              onImport={() => { onImportAt([]); setOpenAddMenu(null) }}
              onScrape={() => { onScrapeAt([]); setOpenAddMenu(null) }}
            />
          )}
        </div>
        <button
          onClick={onRefresh}
          className="text-[10px] text-white/30 hover:text-white/60 px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
        >
          Rafraichir
        </button>
      </div>

      {openMenu || openAddMenu ? (
        <div className="fixed inset-0 z-40" onClick={handleOverlayClick} />
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-white/25 text-center py-4">Aucune base de données</p>
      ) : (
        <TreeLevel
          node={tree}
          depth={0}
          collapsed={collapsed}
          onToggleFolder={toggleFolder}
          currentDocId={currentDocId}
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          openAddMenu={openAddMenu}
          setOpenAddMenu={setOpenAddMenu}
          renamingDocId={renamingDocId}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          commitRename={commitRename}
          cancelRename={cancelRename}
          startRename={startRename}
          movingDocId={movingDocId}
          moveValue={moveValue}
          setMoveValue={setMoveValue}
          commitMove={commitMove}
          cancelMove={cancelMove}
          startMove={startMove}
          onLoad={onLoad}
          onDelete={onDelete}
          onImportAt={onImportAt}
          onScrapeAt={onScrapeAt}
        />
      )}
    </div>
  )
}

function AddMenu({ onImport, onScrape }: { onImport: () => void; onScrape: () => void }) {
  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 w-44 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onImport}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
      >
        <Upload className="w-3.5 h-3.5 text-emerald-400" />
        Importer Excel
      </button>
      <button
        onClick={onScrape}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
      >
        <Globe className="w-3.5 h-3.5 text-indigo-400" />
        Scraper
      </button>
    </div>
  )
}

function CreateMenu({ onCreateDb }: { onCreateDb: () => void }) {
  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 w-44 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onCreateDb}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
      >
        <Database className="w-3.5 h-3.5 text-indigo-400" />
        Créer une BDD
      </button>
    </div>
  )
}

interface TreeLevelProps {
  node: FolderNode
  depth: number
  collapsed: Set<string>
  onToggleFolder: (key: string) => void
  currentDocId: string | null
  openMenu: string | null
  setOpenMenu: (v: string | null) => void
  openAddMenu: string | null
  setOpenAddMenu: (v: string | null) => void
  renamingDocId: string | null
  renameValue: string
  setRenameValue: (v: string) => void
  commitRename: (f: SavedFileEntry) => void | Promise<void>
  cancelRename: () => void
  startRename: (f: SavedFileEntry) => void
  movingDocId: string | null
  moveValue: string
  setMoveValue: (v: string) => void
  commitMove: (f: SavedFileEntry) => void | Promise<void>
  cancelMove: () => void
  startMove: (f: SavedFileEntry) => void
  onLoad: (docId: string) => void
  onDelete: (docId: string) => void
  onImportAt: (path: string[]) => void
  onScrapeAt: (path: string[]) => void
}

function TreeLevel(props: TreeLevelProps) {
  const { node, depth } = props
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const files = [...node.files].sort((a, b) => {
    const ta = a.updatedAt?.getTime() ?? 0
    const tb = b.updatedAt?.getTime() ?? 0
    return tb - ta
  })

  return (
    <div className={depth === 0 ? 'space-y-1' : 'space-y-0.5 mt-0.5'}>
      {folders.map((f) => (
        <FolderRow key={`folder-${pathKey(f.path)}`} folder={f} {...props} />
      ))}
      {files.map((f) => (
        <FileRow key={f.docId} file={f} depth={depth} {...props} />
      ))}
    </div>
  )
}

function FolderRow({ folder, ...props }: { folder: FolderNode } & TreeLevelProps) {
  const { depth, collapsed, onToggleFolder, openAddMenu, setOpenAddMenu, onImportAt, onScrapeAt } = props
  const key = pathKey(folder.path)
  const isCollapsed = collapsed.has(key)
  const itemCount = countFiles(folder)

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-white/[0.04] group"
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        <button
          onClick={() => onToggleFolder(key)}
          className="shrink-0 text-white/30 hover:text-white/70 transition-colors"
        >
          <ChevronRightIcon collapsed={isCollapsed} />
        </button>
        {isCollapsed ? (
          <Folder className="w-3.5 h-3.5 text-amber-300/80 shrink-0" />
        ) : (
          <FolderOpen className="w-3.5 h-3.5 text-amber-300/80 shrink-0" />
        )}
        <span className="flex-1 min-w-0 text-[12px] text-white/75 font-medium truncate">{folder.name}</span>
        <span className="text-[9px] text-white/30 tabular-nums shrink-0">{itemCount}</span>
        <div className="relative shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setOpenAddMenu(openAddMenu === key ? null : key) }}
            className="p-0.5 text-white/25 hover:text-indigo-300 hover:bg-white/5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title={`Ajouter dans ${folder.name}`}
          >
            <Plus className="w-3 h-3" />
          </button>
          {openAddMenu === key && (
            <AddMenu
              onImport={() => { onImportAt(folder.path); setOpenAddMenu(null) }}
              onScrape={() => { onScrapeAt(folder.path); setOpenAddMenu(null) }}
            />
          )}
        </div>
      </div>
      {!isCollapsed && (
        <TreeLevel {...props} node={folder} depth={depth + 1} />
      )}
    </div>
  )
}

function countFiles(node: FolderNode): number {
  let n = node.files.length
  for (const child of node.folders.values()) n += countFiles(child)
  return n
}

function ChevronRightIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <ChevronRight className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
  )
}

function FileRow({
  file: f,
  depth,
  currentDocId,
  openMenu,
  setOpenMenu,
  renamingDocId,
  renameValue,
  setRenameValue,
  commitRename,
  cancelRename,
  startRename,
  movingDocId,
  moveValue,
  setMoveValue,
  commitMove,
  cancelMove,
  startMove,
  onLoad,
  onDelete,
}: { file: SavedFileEntry } & TreeLevelProps) {
  const isActive = currentDocId === f.docId
  const isRenaming = renamingDocId === f.docId
  const isMoving = movingDocId === f.docId
  const FolderIcon = isActive ? FolderOpen : Folder

  return (
    <div
      className={`relative flex items-center gap-2 pr-1.5 py-1.5 rounded-md border transition-colors ${
        isActive
          ? 'bg-indigo-500/10 border-indigo-500/30'
          : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <FolderIcon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-300' : 'text-amber-300/70'}`} />
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void commitRename(f) }
              else if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
            }}
            onBlur={() => void commitRename(f)}
            className="w-full bg-white/[0.08] border border-indigo-400/40 rounded px-1.5 py-0.5 text-[11px] text-white/90 outline-none focus:border-indigo-400"
          />
        ) : isMoving ? (
          <input
            autoFocus
            value={moveValue}
            onChange={(e) => setMoveValue(e.target.value)}
            placeholder="B2B / Perceuses / Milwaukee"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void commitMove(f) }
              else if (e.key === 'Escape') { e.preventDefault(); cancelMove() }
            }}
            onBlur={() => void commitMove(f)}
            className="w-full bg-white/[0.08] border border-indigo-400/40 rounded px-1.5 py-0.5 text-[11px] text-white/90 outline-none focus:border-indigo-400 placeholder:text-white/20"
          />
        ) : (
          <div className="cursor-pointer" onClick={() => onLoad(f.docId)}>
            <p className="text-[11.5px] font-medium text-white/70 truncate">{f.fileName}</p>
            <p className="text-[9.5px] text-white/30">
              {f.totalRows} produit{f.totalRows > 1 ? 's' : ''}
              {f.updatedAt && ` · ${f.updatedAt.toLocaleDateString('fr-FR')}`}
            </p>
          </div>
        )}
      </div>

      {isRenaming || isMoving ? (
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            if (isRenaming) void commitRename(f)
            else void commitMove(f)
          }}
          className="p-0.5 text-emerald-300/80 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors"
          title="Valider"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === f.docId ? null : f.docId) }}
          className="p-0.5 text-white/20 hover:text-white/60 hover:bg-white/[0.08] rounded transition-colors"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      )}

      {!isRenaming && !isMoving && openMenu === f.docId && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-44 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { onLoad(f.docId); setOpenMenu(null) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            Ouvrir
          </button>
          <button
            onClick={() => startRename(f)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-amber-400" />
            Renommer
          </button>
          <button
            onClick={() => startMove(f)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
          >
            <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
            Déplacer vers…
          </button>
          <a
            href={`https://console.firebase.google.com/project/web2print-6fe5a/firestore/databases/-default-/data/excel_data/${f.docId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpenMenu(null)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
            Firebase
          </a>
          <div className="h-px bg-white/[0.06] mx-2" />
          <button
            onClick={() => { onDelete(f.docId); setOpenMenu(null) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Supprimer
          </button>
        </div>
      )}
    </div>
  )
}
