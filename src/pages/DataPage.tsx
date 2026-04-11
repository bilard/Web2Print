import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  FileSpreadsheet, Upload, Download, Search, ArrowLeft,
  Table2, Tag, Plus, Save, Cloud, CloudOff,
  Loader2, Trash2, Columns3, RefreshCw, FolderTree, Group, List, Globe,
  MoreVertical, ExternalLink,
} from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { useExcelImport } from '@/features/excel/useExcelImport'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { ExcelImportModal } from '@/features/excel/ExcelImportModal'
import { DataTable } from '@/features/excel/DataTable'
import { TaxonomyManager } from '@/features/excel/TaxonomyManager'
import { FieldsPanel } from '@/features/excel/FieldsPanel'
import { TaxonomyNavigator } from '@/features/excel/TaxonomyNavigator'
import { ProductSheet } from '@/features/excel/ProductSheet'
import { UpdatePreviewModal } from '@/features/excel/UpdatePreviewModal'
import { ScrapingModal } from '@/features/scraping/ScrapingModal'

type RightTab = 'fields' | 'taxonomy'

export default function DataPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const {
    sheets, activeSheetIndex, importModalOpen, searchQuery, currentFileName,
    sheetRowId, taxonomyNavFilter, groupByTaxonomy,
    setImportModalOpen, setActiveSheet, setSearchQuery, setSheets, setCurrentFileName,
    setSheetRowId, setGroupByTaxonomy,
  } = useExcelStore()
  const { exportToXlsx, createEmpty } = useExcelImport()
  const { saveToFirebase, loadFromFirebase, listSavedFiles, deleteFromFirebase } = useExcelFirebase()
  const [rightTab, setRightTab] = useState<RightTab>('fields')
  const [showRight, setShowRight] = useState(true)
  const [showBdd, setShowBdd] = useState(true)
  const [showNav, setShowNav] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [savedFiles, setSavedFiles] = useState<{ fileName: string; docId: string; totalRows: number; updatedAt: Date | null }[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [scrapingOpen, setScrapingOpen] = useState(false)
  const [sheetWidth, setSheetWidth] = useState(Math.round(window.innerWidth / 2))
  const sheetDragRef = useRef<{ startX: number; startW: number } | null>(null)
  const prevSheetRowId = useRef<string | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!sheetDragRef.current) return
      const delta = sheetDragRef.current.startX - e.clientX
      setSheetWidth(Math.max(320, Math.min(window.innerWidth - 200, sheetDragRef.current.startW + delta)))
    }
    const onUp = () => { sheetDragRef.current = null; document.body.style.cursor = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // Quand l'utilisateur clique sur un nœud de la taxonomie, fermer la fiche
  // produit pour revenir à la vue liste (DataTable).
  useEffect(() => {
    setSheetRowId(null)
  }, [taxonomyNavFilter, setSheetRowId])

  // Recalcule la largeur à la première ouverture d'une fiche (après un reset ou un chargement)
  useEffect(() => {
    if (!sheetRowId) { prevSheetRowId.current = null; return }
    if (!prevSheetRowId.current) {
      // Première ouverture sur cette source → calculer selon le nb de lignes
      const rowCount = sheets[activeSheetIndex]?.rows.length ?? 0
      setSheetWidth(rowCount > 1 ? window.innerWidth : Math.round(window.innerWidth / 2))
    }
    prevSheetRowId.current = sheetRowId
  }, [sheetRowId])  

  const sheet = sheets[activeSheetIndex]
  const hasData = sheets.length > 0 && (sheet?.rows.length > 0 || sheet?.columns.length > 0)

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
    return rows.map((r) => r._id)
  }, [sheet, taxonomyNavFilter, searchQuery])

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

  // Auto-save on data change (debounced)
  useEffect(() => {
    if (!currentFileName || sheets.length === 0) return
    const timer = setTimeout(async () => {
      setSaving(true)
      try {
        await saveToFirebase(currentFileName, sheets)
        setSaveStatus('saved')
        console.log(`[DataPage] Auto-saved "${currentFileName}"`)
      } catch (err) {
        console.error('[DataPage] Auto-save error:', err)
        setSaveStatus('error')
      } finally {
        setSaving(false)
      }
    }, 3000)
    return () => clearTimeout(timer)
  }, [sheets, currentFileName])  

  const handleSave = async () => {
    const name = currentFileName ?? sheet?.name ?? 'data'
    if (!name) return
    console.log(`[DataPage] Manual save "${name}"`)
    setSaving(true)
    try {
      await saveToFirebase(name, sheets)
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

  const handleLoadFile = async (fileName: string) => {
    const loaded = await loadFromFirebase(fileName)
    if (loaded) {
      setCurrentFileName(fileName)
      setSaveStatus('saved')
      setSheetRowId(null) // fermer la fiche produit lors du changement de source
    }
  }

  const handleDeleteFile = async (fileName: string) => {
    await deleteFromFirebase(fileName)
    await refreshFileList()
    if (currentFileName === fileName) {
      setSheets([])
      setCurrentFileName(null)
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
              {sheets.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSheet(i)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                    i === activeSheetIndex
                      ? 'bg-white/[0.08] text-white/70'
                      : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                  }`}
                >
                  {s.name}
                </button>
              ))}
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
        {showBdd && (
          <div className="w-60 bg-[#161616] border-r border-white/10 flex flex-col shrink-0 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/10 flex items-center">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" />
                Bases de donnees
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <SavedFilesPanel
                files={savedFiles}
                loading={loadingFiles}
                currentFileName={currentFileName}
                onLoad={handleLoadFile}
                onDelete={handleDeleteFile}
                onRefresh={refreshFileList}
              />
            </div>
          </div>
        )}

        {/* Main area : top import menu + content (data or empty) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Import type menu — top */}
          <div className="h-14 border-b border-white/[0.06] bg-[#131313] flex items-center gap-2 px-4 shrink-0">
            <button
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              Importer un fichier
            </button>
            <button
              onClick={() => setScrapingOpen(true)}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Globe className="w-4 h-4" />
              Scraper le web
            </button>
            <button
              onClick={createEmpty}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Creer vide
            </button>
          </div>

          {hasData ? (
            <div className="flex-1 flex overflow-hidden">
              {/* Taxonomy navigation sidebar */}
              {showNav && (
                <div className="w-56 bg-[#161616] border-r border-white/10 flex flex-col shrink-0 overflow-hidden">
                  <TaxonomyNavigator />
                </div>
              )}

              {/* Data table */}
              <DataTable />

              {/* Product sheet panel */}
              {sheetRowId && (
                <div
                  className="relative bg-[#1a1a1e] border-l border-white/[0.08] flex flex-col shrink-0 overflow-hidden"
                  style={{ width: sheetWidth }}
                >
                  {/* Drag handle */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 z-10 cursor-col-resize hover:bg-indigo-500/40 transition-colors"
                    onMouseDown={e => {
                      sheetDragRef.current = { startX: e.clientX, startW: sheetWidth }
                      document.body.style.cursor = 'col-resize'
                      e.preventDefault()
                    }}
                  />
                  <ProductSheet
                    rowId={sheetRowId}
                    allRowIds={filteredRowIds}
                    onClose={() => setSheetRowId(null)}
                    onNavigate={(id) => setSheetRowId(id)}
                  />
                </div>
              )}

              {/* Right sidebar — Champs / Taxonomie only */}
              {showRight && (
                <div className="w-72 bg-[#161616] border-l border-white/10 flex flex-col shrink-0 overflow-hidden">
                  {/* Tabs */}
                  <div className="flex border-b border-white/10">
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
              )}
            </div>
          ) : (
            /* Empty illustration */
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-5 max-w-sm text-center">
                <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center">
                  <Table2 className="w-10 h-10 text-white/20" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white/70 mb-2">Aucune donnee</h2>
                  <p className="text-sm text-white/40">
                    Choisissez un type d'import dans le menu ci-dessus, ou selectionnez une base de donnees a gauche.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import modal */}
      <ExcelImportModal open={importModalOpen} onClose={handleImportClose} />

      {/* Scraping modal */}
      <ScrapingModal open={scrapingOpen} onClose={() => setScrapingOpen(false)} />

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

/** Saved files list panel */
function SavedFilesPanel({ files, loading, currentFileName, onLoad, onDelete, onRefresh }: {
  files: { fileName: string; docId: string; totalRows: number; updatedAt: Date | null }[]
  loading: boolean
  currentFileName: string | null
  onLoad: (fileName: string) => void
  onDelete: (fileName: string) => void
  onRefresh: () => void
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  // Close menu on outside click
  const handleOverlayClick = () => setOpenMenu(null)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
          <Cloud className="w-4 h-4 text-indigo-400" />
          Firebase
        </h3>
        <button
          onClick={onRefresh}
          className="text-[10px] text-white/30 hover:text-white/60 px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
        >
          Rafraichir
        </button>
      </div>

      {/* Overlay to close menu */}
      {openMenu && (
        <div className="fixed inset-0 z-40" onClick={handleOverlayClick} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-white/25 text-center py-4">Aucun fichier sauvegarde</p>
      ) : (
        files.map((f) => (
          <div
            key={f.docId}
            className={`relative flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
              currentFileName === f.fileName
                ? 'bg-indigo-500/10 border-indigo-500/30'
                : 'bg-white/5 border-white/10 hover:bg-white/[0.08] hover:border-white/15'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onLoad(f.fileName)}>
              <p className="text-xs font-medium text-white/70 truncate">{f.fileName}</p>
              <p className="text-[10px] text-white/30">
                {f.totalRows} lignes
                {f.updatedAt && ` · ${f.updatedAt.toLocaleDateString('fr-FR')}`}
              </p>
            </div>

            {/* Menu trigger */}
            <button
              onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === f.docId ? null : f.docId) }}
              className="p-1 text-white/20 hover:text-white/60 hover:bg-white/[0.08] rounded transition-colors"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {/* Dropdown menu */}
            {openMenu === f.docId && (
              <div
                className="absolute right-0 top-full mt-1 z-50 w-40 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { onLoad(f.fileName); setOpenMenu(null) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                  Ouvrir
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
                  onClick={() => { onDelete(f.fileName); setOpenMenu(null) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
