import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  FileSpreadsheet, Upload, Download, Search, ArrowLeft,
  Table2, Tag, Plus, Save, Cloud, CloudOff,
  Loader2, Trash2, Columns3, RefreshCw, FolderTree, Group, List, Globe,
  MoreVertical, ExternalLink, Store,
  PanelLeftClose, PanelRightClose, ChevronsRight, ChevronsLeft,
  Database, Folder, FolderOpen, Pencil, Check, ChevronRight, GripVertical,
  Wand2, FolderUp, Link2, ImagePlus, X, Factory,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SheetsColumn } from '@/components/pim/SheetsColumn'
import { useExcelStore } from '@/stores/excel.store'
import { useDamMigration } from '@/features/dam/useDamMigration'
import { LinkDriveImagesModal } from '@/features/dam/LinkDriveImagesModal'
import { usePimStore } from '@/stores/pim.store'
import { SourceSyncModal } from '@/features/pim/SourceSyncModal'
import { useSourceSyncPrompt } from '@/features/pim/useSourceSyncPrompt'
import type { SourceIdent } from '@/features/pim/linkedPublications'
import { useExcelImport } from '@/features/excel/useExcelImport'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { fetchSheetsQuiet } from '@/features/manufacturer-verify/insights/fetchSheetsQuiet'
import { aggregateInsights } from '@/features/manufacturer-verify/insights/insightsAggregate'
const ExcelImportModal = lazy(() =>
  import('@/features/excel/ExcelImportModal').then((m) => ({ default: m.ExcelImportModal })),
)
import { DataTable } from '@/features/excel/DataTable'
import { TaxonomyManager } from '@/features/excel/TaxonomyManager'
import { FieldsPanel } from '@/features/excel/FieldsPanel'
import { TaxonomyNavigator } from '@/features/excel/TaxonomyNavigator'
import { ProductSheet } from '@/features/excel/ProductSheet'
const UpdatePreviewModal = lazy(() =>
  import('@/features/excel/UpdatePreviewModal').then((m) => ({ default: m.UpdatePreviewModal })),
)
const ScrapingModal = lazy(() =>
  import('@/features/scraping/ScrapingModal').then((m) => ({ default: m.ScrapingModal })),
)
// Explorateur des fiches concurrents (veille tarifaire) : chargé à la demande — il tire
// tout le module priceWatch, inutile tant que l'écran n'est pas ouvert.
const CompetitorExplorerPanel = lazy(() =>
  import('@/features/priceWatch/explorer/CompetitorExplorerPanel').then((m) => ({ default: m.CompetitorExplorerPanel })),
)
const ColumnCompletionModal = lazy(() =>
  import('@/features/excel/ai-completion/ColumnCompletionModal').then((m) => ({ default: m.ColumnCompletionModal })),
)
const ColumnImageGenModal = lazy(() =>
  import('@/features/excel/ai-image/ColumnImageGenModal').then((m) => ({ default: m.ColumnImageGenModal })),
)
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useRenameTaxonomy } from '@/features/taxonomy/useTaxonomyMutations'
import { hasTaxoNav, buildTaxoNavPredicate } from '@/features/excel/taxoNavSelection'
import { useCan, useQuota } from '@/features/access/useAccess'
import { DemoQuotaBanner } from '@/features/access/DemoQuotaBanner'
import { EasyCatalogExportModal } from '@/features/easycatalog/EasyCatalogExportModal'
import { OptionHelp } from '@/components/shared/OptionHelp'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { useTranslation, intlLocale } from '@/lib/i18n'

type RightTab = 'fields' | 'taxonomy'

export default function DataPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    sheets, activeSheetIndex, importModalOpen, searchQuery, currentFileName, currentDocId, currentPath,
    sheetRowId, taxonomyNavFilter, groupByTaxonomy,
    setImportModalOpen, setSearchQuery, setSheets, setCurrentFileName, setCurrentDocId, setCurrentPath,
    setSheetRowId, setGroupByTaxonomy, pruneEmptySheet,
  } = useExcelStore()
  const { exportToXlsx, createEmpty } = useExcelImport()
  const { migrateActiveSheet, running: damRunning } = useDamMigration()
  const { saveToFirebase, loadFromFirebase, listSavedFiles, deleteFromFirebase, renameFile, moveFile, reorderFiles } = useExcelFirebase()
  const { data: taxonomies } = useTaxonomies()
  const renameTaxonomy = useRenameTaxonomy()
  const canExport = useCan('pim.export')
  const canCreate = useCan('pim.create')
  const canImport = useCan('pim.import')
  const canScrape = useCan('pim.scrape')
  // ⚠ Sans garde explicite, une section est visible par TOUS (permissions fail-open).
  // L'explorateur vit dans le PIM et porte donc sa propre permission PIM ; il lit en plus
  // les relevés de veille tarifaire, d'où la double garde (les deux sont requises).
  // (deux appels séparés : `useCan(a) && useCan(b)` court-circuiterait le second hook)
  const canPimCompetitors = useCan('pim.competitors')
  const canPriceWatch = useCan('priceWatch.view')
  const canCompetitors = canPimCompetitors && canPriceWatch
  const quota = useQuota()
  // Quota démo plein → on bloque les actions qui AJOUTENT de la donnée (import/scrape = lignes
  // PIM ; Visuels IA = assets DAM). L'IA complétion (remplit des cellules existantes) et
  // « Créer vide » (0 ligne) ne consomment rien → jamais gatés.
  //
  // PIM : dans DataPage le compteur `usage.pimRows` est DORMANT (l'import/scrape écrivent
  // `excel_data`, pas la CF pimSaveProducts). Le vrai plafond serveur est la rule
  // `excel_data.totalRows <= demoLimit('pimRows')` PAR BASE. On aligne donc le garde-fou UI
  // sur le nombre de lignes RÉEL de la base courante (auto-cicatrisant à la suppression :
  // supprimer des lignes rebaisse le compte et réactive les boutons, sans compteur à gérer).
  const pimRowsUsed = sheets.reduce((acc, s) => acc + s.rows.length, 0)
  const pimReached = quota.isDemo && pimRowsUsed >= quota.pimRows.limit
  const damQuotaFull = quota.isDemo && !quota.canAddDam(1)

  // PIM = source unique de vérité : après une rafale d'éditions, popup listant
  // les publications reliées (catalogues auto-synchro, fiches promo à rafraîchir).
  const sourceIdent = useMemo<SourceIdent | null>(
    () => (currentDocId ? { kind: 'excel', docId: currentDocId } : null),
    [currentDocId],
  )
  const { open: syncPromptOpen, close: closeSyncPrompt } = useSourceSyncPrompt(sourceIdent)

  const [rightTab, setRightTab] = useState<RightTab>('fields')
  const [showRight, setShowRight] = useState(true)
  // Explorateur concurrents : occupe la zone centrale, comme la fiche produit.
  const [competitorsOpen, setCompetitorsOpen] = useState(false)
  /** Ouvre l'explorateur en dégageant la place : colonnes du PIM repliées et menu du
   *  tableau de bord réduit. La comparaison F1 ↔ concurrent est une vue à deux colonnes
   *  d'images — chaque panneau ouvert lui retire de la largeur utile. */
  const openCompetitors = useCallback(() => {
    setCompetitorsOpen((open) => {
      if (!open) {
        setShowBdd(false)
        setShowNav(false)
        setShowRight(false)
        window.dispatchEvent(new CustomEvent('dashboard:collapse-sidebar'))
      }
      return !open
    })
  }, [])
  const [showBdd, setShowBdd] = useState(true)
  const [showNav, setShowNav] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [savedFiles, setSavedFiles] = useState<SavedFileEntry[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [ecExportOpen, setEcExportOpen] = useState(false)
  const [linkImagesOpen, setLinkImagesOpen] = useState(false)
  const [scrapingOpen, setScrapingOpen] = useState(false)
  const [aiCompletionOpen, setAiCompletionOpen] = useState(false)
  const [aiImageGenOpen, setAiImageGenOpen] = useState(false)

  // Le menu latéral filtre déjà ces entrées par permission ; on re-vérifie ici pour qu'un
  // intent émis autrement (raccourci, tour guidé) n'ouvre pas une modale interdite.
  useModuleIntent('data', (action) => {
    switch (action) {
      case 'action:import': if (canImport) setImportModalOpen(true); break
      case 'action:scrape': if (canScrape) setScrapingOpen(true); break
      case 'action:create-empty': if (canCreate) createEmpty(); break
      case 'action:update': if (canImport) setUpdateModalOpen(true); break
      case 'action:export-xlsx':
        if (canExport) exportToXlsx(sheets, `${currentFileName ?? sheets[activeSheetIndex]?.name ?? 'export'}.xlsx`)
        break
      case 'action:export-ec': if (canExport) setEcExportOpen(true); break
    }
  })

  // DataPage = flux legacy BDD uniquement. Reset toute sélection PIM laissée
  // dans le store par une session précédente — sinon ScrapingModal route le
  // scrape vers la branche PIM (qui upsert dans pim_projects au lieu de la
  // BDD active) et la BDD reste vide.
  useEffect(() => {
    usePimStore.getState().setCurrentProjectId(null)
  }, [])

  // Quand l'utilisateur clique sur un nœud de la taxonomie, fermer la fiche
  // produit pour revenir à la vue liste (DataTable).
  useEffect(() => {
    setSheetRowId(null)
  }, [taxonomyNavFilter, setSheetRowId])

  // Auto-cleanup au chargement : si une feuille a 0 ligne mais conserve des
  // colonnes IA — * ou un name de hostname (résidu d'un scrape dont le produit
  // a été supprimé), on les retire pour éviter les "champs fantômes" dans le
  // panneau Champs et le chip URL en haut. pruneEmptySheet est idempotent.
  useEffect(() => {
    sheets.forEach((s, i) => {
      if (s.rows.length === 0 && (s.columns.some((c) => c.key.startsWith('ai_')) || /\.[a-z]{2,}/i.test(s.name))) {
        pruneEmptySheet(i)
      }
    })
  }, [currentDocId])

  const sheet = sheets[activeSheetIndex]
  const hasData = sheets.length > 0 && (sheet?.rows.length > 0 || sheet?.columns.length > 0)
  // Une BDD est sélectionnée si Firebase a un docId courant.
  // Pendant la création (Nouvelle BDD), docId est null le temps du save → état non sélectionné.
  const hasSelectedDb = currentDocId !== null

  const selectedSourceIds = usePimStore((s) => s.selectedSourceIds)

  // Compute filtered row IDs for ProductSheet navigation. Doit refléter
  // EXACTEMENT le scope de DataTable, sinon les flèches prev/next dans la
  // fiche produit naviguent vers des rows invisibles.
  // - Mono-source : rows de l'unique sheet.
  // - Multi-source avec sélection : sources cochées.
  // - Multi-source sans sélection : vide (sauf filtre taxo actif → toutes).
  const filteredRowIds = useMemo(() => {
    if (!sheet) return []
    const hasNavFilter = hasTaxoNav(taxonomyNavFilter)
    let baseRows: typeof sheet.rows
    if (sheets.length <= 1) {
      baseRows = sheet.rows
    } else if (selectedSourceIds.length === 0) {
      baseRows = hasNavFilter ? sheets.flatMap((s) => s.rows) : []
    } else {
      baseRows = sheets
        .filter((s) => selectedSourceIds.includes(s.name))
        .flatMap((s) => s.rows)
    }
    let rows = baseRows
    if (hasNavFilter) {
      rows = rows.filter(buildTaxoNavPredicate(taxonomyNavFilter, taxonomies))
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
  }, [sheet, sheets, selectedSourceIds, taxonomyNavFilter, searchQuery, taxonomies])


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
  // NB : on autorise sheets=[] tant qu'un docId existe — supprimer la dernière
  // sheet/produit DOIT propager l'état vide à Firestore (sinon les anciennes
  // données restent fantômes côté serveur).
  useEffect(() => {
    if (!currentFileName) return
    // Pas de doc à mettre à jour ET pas de contenu : rien à sauver
    if (currentDocId === null && sheets.length === 0) return
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

  /** Réordonne les BDDs d'un même niveau (mêmes `path`). Optimiste : met à
   *  jour l'état local immédiatement avant le round-trip Firestore. */
  const handleReorderSiblings = async (orderedDocIds: string[]) => {
    const updates = orderedDocIds.map((docId, sortIndex) => ({ docId, sortIndex }))
    const indexMap = new Map(updates.map((u) => [u.docId, u.sortIndex]))
    setSavedFiles((prev) => prev.map((f) => (
      indexMap.has(f.docId) ? { ...f, sortIndex: indexMap.get(f.docId) } : f
    )))
    try {
      await reorderFiles(updates)
    } catch (err) {
      console.error('[DataPage] reorderFiles error:', err)
      await refreshFileList()
    }
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
    setCurrentFileName(t('xl.defaultDbName'))
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
            <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 mb-1">{t('pim.display')}</p>
            <div className="space-y-px">
              <button onClick={() => setShowNav(!showNav)} className={sidebarBtn(showNav)}>
                <FolderTree className="w-4 h-4 opacity-50" aria-hidden="true" />
                {t('pim.nav')}
                {showNav && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400/80" />}
              </button>
              <button onClick={() => setGroupByTaxonomy(!groupByTaxonomy)} className={sidebarBtn(groupByTaxonomy)}>
                {groupByTaxonomy ? <Group className="w-4 h-4 opacity-50" aria-hidden="true" /> : <List className="w-4 h-4 opacity-50" aria-hidden="true" />}
                {t('pim.group')}
                {groupByTaxonomy && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400/80" />}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── PANNEAUX ─── toujours visible */}
      <div>
        <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 mb-1">{t('pim.panels')}</p>
        <div className="space-y-px">
          <button onClick={() => setShowBdd(!showBdd)} className={sidebarBtn(showBdd)}>
            <Cloud className="w-4 h-4 opacity-50" aria-hidden="true" />
            {t('pim.databases')}
            {savedFiles.length > 0 && <span className="ml-auto text-[9px] text-white/30">{savedFiles.length}</span>}
            {showBdd && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-indigo-400/80" />}
          </button>
          {hasData && (
            <>
              <button onClick={() => handleToggleRightTab('fields')} className={sidebarBtn(showRight && rightTab === 'fields')}>
                <Columns3 className="w-4 h-4 opacity-50" aria-hidden="true" />
                {t('pim.fields')}
                {showRight && rightTab === 'fields' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400/80" />}
              </button>
              <button onClick={() => handleToggleRightTab('taxonomy')} className={sidebarBtn(showRight && rightTab === 'taxonomy')}>
                <Tag className="w-4 h-4 opacity-50" aria-hidden="true" />
                {t('pim.taxonomy')}
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
    <div className={`${embedded ? 'h-full' : 'h-screen'} bg-background text-white flex flex-col overflow-hidden`}>
      {/* Portal for sidebar toolbar */}
      {portalTarget && createPortal(sidebarToolbar, portalTarget)}

      {/* Popup publications reliées (PIM source unique de vérité) */}
      {sourceIdent && <SourceSyncModal ident={sourceIdent} open={syncPromptOpen} onClose={closeSyncPrompt} />}

      {/* Header */}
      <header className="h-11 bg-well border-b border-white/[0.06] flex items-center px-3 gap-2 shrink-0">
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
              {currentFileName ?? t('pim.data')}
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
          {/* Nom de la sheet active (les onglets ont migré dans la SheetsColumn latérale) */}
          <h1 className="text-[13px] font-medium text-white/70">
            {sheet?.name ?? currentFileName ?? t('pim.data')}
          </h1>
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
                {t('pim.save')}
              </button>
              {canExport && (
                <button
                  onClick={() => exportToXlsx(sheets, `${currentFileName ?? sheet?.name ?? 'export'}.xlsx`)}
                  className={headerBtn}
                >
                  <Download className="w-3.5 h-3.5" />
                  {t('pim.export')}
                </button>
              )}
              {canExport && (
                <button onClick={() => setEcExportOpen(true)} className={headerBtn}>
                  <Download className="w-3.5 h-3.5" />
                  {t('pim.easycatalog')}
                </button>
              )}
              <button
                onClick={() => migrateActiveSheet()}
                disabled={damRunning}
                className={`${headerBtn} disabled:opacity-40`}
                title={t('pim.centraliseImages')}
              >
                {damRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderUp className="w-3.5 h-3.5" />}
                DAM
              </button>
              <button
                onClick={() => setLinkImagesOpen(true)}
                className={headerBtn}
                title={t('pim.linkImages.help')}
              >
                <Link2 className="w-3.5 h-3.5" />
                {t('pim.linkImages')}
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
              placeholder={t('pim.search')}
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
                title={t('pim.taxonomyNav')}
              >
                <FolderTree className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setGroupByTaxonomy(!groupByTaxonomy)}
                className={`p-1.5 rounded-md transition-colors ${
                  groupByTaxonomy ? 'bg-white/[0.08] text-white/60' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
                title={t(groupByTaxonomy ? 'pim.ungroupTaxonomy' : 'pim.groupByTaxonomy')}
              >
                {groupByTaxonomy ? <Group className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setShowRight(!showRight)}
                className={`p-1.5 rounded-md transition-colors ${
                  showRight ? 'bg-white/[0.08] text-white/60' : 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
                title={t('pim.panels')}
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
          <div className="w-60 bg-surface-2 border-r border-white/[0.06] flex flex-col shrink-0 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-indigo-300" />
                {t('pim.databases')}
              </h3>
              <button
                onClick={() => setShowBdd(false)}
                className="p-1 text-white/40 hover:text-white/80 hover:bg-white/10 rounded transition-colors"
                title={t('pim.closeColumn')}
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
                onReorder={handleReorderSiblings}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowBdd(true)}
            className="w-8 bg-surface-2 border-r border-white/[0.06] hover:bg-white/[0.04] hover:border-indigo-500/30 flex flex-col items-center gap-2 pt-3 shrink-0 transition-colors group"
            title={t('pim.openDatabases')}
          >
            <ChevronsRight className="w-5 h-5 text-white/60 group-hover:text-indigo-400" />
            <span className="text-[10px] font-semibold tracking-wider text-white/40 group-hover:text-white/70 [writing-mode:vertical-rl] rotate-180">
              {t('pim.databases.short')}
            </span>
          </button>
        )}

        {/* SheetsColumn : nav latérale des sources scrapées/importées (remplace les onglets
             horizontaux). Affichée dès qu'il y a > 1 sheet. */}
        {sheets.length > 1 && <SheetsColumn />}

        {/* Main area : top import menu + content (data or empty) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Import type menu — top (désactivé si aucune BDD sélectionnée) */}
          <div className="h-14 border-b border-white/[0.06] bg-well flex items-center gap-2 px-4 shrink-0">
            {canImport && (
            <button
              onClick={() => setImportModalOpen(true)}
              disabled={!hasSelectedDb || pimReached}
              data-tour="opt-pim-import"
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-white/5 disabled:hover:bg-white/5 disabled:text-white/25 disabled:cursor-not-allowed text-[#fff] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
              title={pimReached ? t('pim.quota.rows') : hasSelectedDb ? t('pim.import') : t('pim.selectDatabase')}
            >
              <Upload className="w-4 h-4" />
              {t('pim.import')}
              <OptionHelp text={t('pim.import.help')} />
            </button>
            )}
            {canScrape && (
            <button
              onClick={() => setScrapingOpen(true)}
              disabled={!hasSelectedDb || pimReached}
              data-tour="opt-pim-scrape"
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 disabled:text-white/25 disabled:hover:bg-white/5 disabled:cursor-not-allowed text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
              title={pimReached ? t('pim.quota.scrape') : hasSelectedDb ? t('pim.scrape') : t('pim.selectDatabase')}
            >
              <Globe className="w-4 h-4" />
              {t('pim.scrape')}
              <OptionHelp text={t('pim.scrape.help')} />
            </button>
            )}
            {canScrape && (
            <button
              onClick={() => setAiCompletionOpen(true)}
              disabled={!hasSelectedDb}
              data-tour="opt-pim-ai-completion"
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 disabled:text-white/25 disabled:hover:bg-white/5 disabled:cursor-not-allowed text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
              title={hasSelectedDb ? t('pim.aiColumn') : t('pim.selectDatabase')}
            >
              <Wand2 className="w-4 h-4" />
              {t('pim.aiFill')}
            </button>
            )}
            {canScrape && (
            <button
              onClick={() => setAiImageGenOpen(true)}
              disabled={!hasSelectedDb || damQuotaFull}
              data-tour="opt-pim-ai-visuals"
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 disabled:text-white/25 disabled:hover:bg-white/5 disabled:cursor-not-allowed text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
              title={damQuotaFull ? t('pim.quota.visuals') : hasSelectedDb ? t('pim.visuals.help') : t('pim.selectDatabase')}
            >
              <ImagePlus className="w-4 h-4" />
              {t('pim.visuals')}
            </button>
            )}
            {canCreate && (
            <button
              onClick={createEmpty}
              disabled={!hasSelectedDb}
              data-tour="opt-pim-create"
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 disabled:text-white/25 disabled:hover:bg-white/5 disabled:cursor-not-allowed text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
              title={hasSelectedDb ? t('pim.createEmpty.title') : t('pim.selectDatabase')}
            >
              <Plus className="w-4 h-4" />
              {t('pim.createEmpty')}
              <OptionHelp text={t('pim.createEmpty.help')} />
            </button>
            )}
            {/* Explorateur des fiches concurrents. Dans la barre d'actions et non dans la
                colonne latérale : celle-ci passe par un portail qui n'existe QUE dans le
                module Données du tableau de bord — sur /data en plein écran, elle n'est
                jamais montée et l'entrée serait introuvable. */}
            {canCompetitors && (
            <button
              onClick={openCompetitors}
              className={`flex items-center gap-2 border text-[13px] font-medium px-4 py-2 rounded-lg transition-colors ${
                competitorsOpen
                  ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
              }`}
              title={t('pwx.concurrentsResultatsDuScraping')}
            >
              <Store className="w-4 h-4" />
              {t('pwx.competitors')}
            </button>
            )}
          </div>

          {/* Alerte plafond démo (persistante tant que la limite PIM est pleine) */}
          <DemoQuotaBanner reached={pimReached} limit={quota.pimRows.limit} field="pimRows" className="mx-4 mt-3" />

          {/* Breadcrumb PIM désactivé — pas pertinent pour le flux legacy */}

          {/* Explorateur concurrents : plein cadre, indépendant de la base ouverte (celle-ci
              n'alimente que les descriptions et visuels F1 de la colonne de gauche). */}
          {competitorsOpen ? (
            <div className="flex-1 flex overflow-hidden">
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/30 text-sm">{t('dam.loading')}</div>}>
                <CompetitorExplorerPanel onClose={() => setCompetitorsOpen(false)} />
              </Suspense>
            </div>
          ) : hasSelectedDb && hasData ? (
            <div className="flex-1 flex overflow-hidden">
              {/* Taxonomy navigation sidebar */}
              {showNav ? (
                <div className="w-56 bg-well border-r border-white/10 flex flex-col shrink-0 overflow-hidden">
                  <TaxonomyNavigator onClose={() => setShowNav(false)} />
                </div>
              ) : (
                <button
                  onClick={() => setShowNav(true)}
                  className="w-8 bg-well border-r border-white/10 hover:bg-white/[0.04] hover:border-indigo-500/30 flex flex-col items-center gap-2 pt-3 shrink-0 transition-colors group"
                  title={t('pim.openNav')}
                >
                  <ChevronsRight className="w-5 h-5 text-white/60 group-hover:text-indigo-400" />
                  <span className="text-[10px] font-semibold tracking-wider text-white/40 group-hover:text-white/70 [writing-mode:vertical-rl] rotate-180">
                    {t('pim.nav')}
                  </span>
                </button>
              )}

              {/* Main area : table OU fiche produit plein écran (exclusif) */}
              {sheetRowId ? (
                <div className="flex-1 min-w-0 bg-well flex flex-col overflow-hidden">
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
                <div className="w-72 bg-well border-l border-white/10 flex flex-col shrink-0 overflow-hidden">
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
                      title={t('pim.closeColumn')}
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
                  className="w-8 bg-well border-l border-white/10 hover:bg-white/[0.04] hover:border-indigo-500/30 flex flex-col items-center gap-2 pt-3 shrink-0 transition-colors group"
                  title={t('pim.openFields')}
                >
                  <ChevronsLeft className="w-5 h-5 text-white/60 group-hover:text-indigo-400" />
                  <span className="text-[10px] font-semibold tracking-wider text-white/40 group-hover:text-white/70 [writing-mode:vertical-rl]">
                    {t('pim.fieldsTaxo')}
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
                    {t(hasSelectedDb ? 'pim.empty.noData' : 'pim.empty.noDatabase')}
                  </h2>
                  <p className="text-sm text-white/40">
                    {hasSelectedDb
                      ? t('pim.empty.chooseImport')
                      : t('pim.empty.selectDatabase')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals chargés à la demande (lazy) : leur code ne pèse pas sur le chunk DataPage. */}
      <Suspense fallback={null}>
        {importModalOpen && (
          <ExcelImportModal
            open={importModalOpen}
            onClose={() => { handleImportClose(); setPendingTargetPath(null) }}
            targetPath={pendingTargetPath ?? undefined}
          />
        )}

        {scrapingOpen && (
          <ScrapingModal
            open={scrapingOpen}
            onClose={() => { setScrapingOpen(false); setPendingTargetPath(null) }}
            targetPath={pendingTargetPath ?? undefined}
          />
        )}

        {aiCompletionOpen && (
          <ColumnCompletionModal
            open={aiCompletionOpen}
            onClose={() => setAiCompletionOpen(false)}
            visibleRowIds={filteredRowIds}
          />
        )}

        {aiImageGenOpen && (
          <ColumnImageGenModal
            open={aiImageGenOpen}
            onClose={() => setAiImageGenOpen(false)}
            visibleRowIds={filteredRowIds}
          />
        )}

        {updateModalOpen && (
          <UpdatePreviewModal
            open={updateModalOpen}
            onClose={() => setUpdateModalOpen(false)}
            onApply={(newSheets) => {
              setSheets(newSheets)
              setSaveStatus('idle')
            }}
          />
        )}
      </Suspense>

      <EasyCatalogExportModal
        open={ecExportOpen}
        onClose={() => setEcExportOpen(false)}
        sheet={sheet ?? null}
        sourceName={currentFileName ?? sheet?.name ?? 'export'}
      />

      <LinkDriveImagesModal open={linkImagesOpen} onClose={() => setLinkImagesOpen(false)} />

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
  /** Ordre manuel persisté en Firestore (asc). Absent = pas encore drag-trié. */
  sortIndex?: number
}

/** Tri des BDDs d'un même niveau : `sortIndex` ASC d'abord, fallback
 *  `updatedAt` DESC. Items sans `sortIndex` flottent au-dessus (= plus récent
 *  en haut, comportement d'origine). */
function sortSiblings(files: SavedFileEntry[]): SavedFileEntry[] {
  return [...files].sort((a, b) => {
    const ai = typeof a.sortIndex === 'number' ? a.sortIndex : -Infinity
    const bi = typeof b.sortIndex === 'number' ? b.sortIndex : -Infinity
    if (ai !== bi) return ai - bi
    return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
  })
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
/** Minuscule + sans accents, pour une recherche de base tolérante. */
const normDb = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Set vide stable : force le dépliage de tous les dossiers pendant une recherche. */
const NO_COLLAPSE = new Set<string>()

/** Cache module (survit aux remontages) du nb de produits « challenge Fabricant »
 *  par base, invalidé quand la base change (clé = updatedAt). Évite de re-scanner
 *  les payloads Firestore à chaque ouverture du PIM. */
const mfrScanCache = new Map<string, { at: number; count: number }>()

function SavedFilesPanel({ files, loading, currentDocId, onLoad, onDelete, onRename, onMove, onImportAt, onScrapeAt, onCreateAt, onRefresh, onReorder }: {
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
  onReorder: (orderedDocIds: string[]) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const canCreate = useCan('pim.create')
  const canImport = useCan('pim.import')
  const canScrape = useCan('pim.scrape')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [openAddMenu, setOpenAddMenu] = useState<string | null>(null)
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [movingDocId, setMovingDocId] = useState<string | null>(null)
  const [moveValue, setMoveValue] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')

  const q = normDb(query.trim())
  const filteredFiles = useMemo(
    () => (q ? files.filter((f) => normDb(f.fileName).includes(q) || f.path.some((p) => normDb(p).includes(q))) : files),
    [files, q],
  )
  const tree = useMemo(() => buildDatabaseTree(filteredFiles), [filteredFiles])

  // Scan en arrière-plan (pool de 4, sans toucher au store) : nb de produits
  // « challenge Fabricant » par base → picto. Résultats mis en cache module,
  // invalidés quand la base change (updatedAt). Base active comptée depuis le store.
  const [mfrCounts, setMfrCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    if (files.length === 0) return
    let cancelled = false
    const keyOf = (f: SavedFileEntry) => f.updatedAt?.getTime() ?? 0
    const seed: Record<string, number> = {}
    const toScan: SavedFileEntry[] = []
    for (const f of files) {
      const c = mfrScanCache.get(f.docId)
      if (c && c.at === keyOf(f)) seed[f.docId] = c.count
      else toScan.push(f)
    }
    if (Object.keys(seed).length) setMfrCounts((m) => ({ ...m, ...seed }))
    const queue = [...toScan]
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift()
        if (!f) break
        const { sheets, currentDocId: activeId } = useExcelStore.getState()
        const s = f.docId === activeId ? sheets : await fetchSheetsQuiet(f.docId)
        const count = s ? aggregateInsights(s).verifiedCount : 0
        mfrScanCache.set(f.docId, { at: keyOf(f), count })
        if (cancelled) return
        setMfrCounts((m) => ({ ...m, [f.docId]: count }))
      }
    }
    void Promise.all(Array.from({ length: 4 }, worker))
    return () => { cancelled = true }
  }, [files])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const a = files.find((f) => f.docId === active.id)
    const b = files.find((f) => f.docId === over.id)
    if (!a || !b) return
    // No-op silencieux si drop entre deux niveaux différents (différents `path`)
    if (pathKey(a.path) !== pathKey(b.path)) return
    // Reconstruit l'ordre visible courant pour ce niveau, puis échange a/b
    const siblings = sortSiblings(files.filter((f) => pathKey(f.path) === pathKey(a.path)))
    const oldIdx = siblings.findIndex((f) => f.docId === a.docId)
    const newIdx = siblings.findIndex((f) => f.docId === b.docId)
    if (oldIdx === -1 || newIdx === -1) return
    const next = [...siblings]
    next.splice(newIdx, 0, ...next.splice(oldIdx, 1))
    void onReorder(next.map((f) => f.docId))
  }

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
          {(canCreate || canImport || canScrape) && (
          <div className="flex items-center bg-white/[0.04] border border-white/10 rounded-md overflow-hidden">
            {canCreate && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpenAddMenu(openAddMenu === '__root_create__' ? null : '__root_create__') }}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
              title={t('pim.createDatabase')}
            >
              <Plus className="w-3 h-3" />
              {t('pim.create')}
            </button>
            )}
            {canCreate && (canImport || canScrape) && <div className="w-px h-3 bg-white/10" />}
            {(canImport || canScrape) && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpenAddMenu(openAddMenu === '__root_import__' ? null : '__root_import__') }}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
              title={t('pim.importOrScrape')}
            >
              <Upload className="w-3 h-3" />
              {t('pim.import.short')}
            </button>
            )}
          </div>
          )}
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
          {t('pim.refresh')}
        </button>
      </div>

      {files.length > 0 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pim.searchDatabase')}
            className="w-full pl-8 pr-7 py-1.5 rounded-md bg-well border border-white/10 text-[12px] placeholder:text-white/30 focus:outline-none focus:border-indigo-500/40"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              aria-label={t('pim.clearSearch')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {openMenu || openAddMenu ? (
        <div className="fixed inset-0 z-40" onClick={handleOverlayClick} />
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-white/25 text-center py-4">{t('pim.noDatabase')}</p>
      ) : filteredFiles.length === 0 ? (
        <p className="text-xs text-white/25 text-center py-4">{t('pim.noResult', { query })}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <TreeLevel
            node={tree}
            depth={0}
            mfrCounts={mfrCounts}
            collapsed={q ? NO_COLLAPSE : collapsed}
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
        </DndContext>
      )}
    </div>
  )
}

function AddMenu({ onImport, onScrape }: { onImport: () => void; onScrape: () => void }) {
  const canImport = useCan('pim.import')
  const canScrape = useCan('pim.scrape')
  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 w-44 bg-surface-2 border border-white/10 rounded-lg shadow-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {canImport && (
      <button
        onClick={onImport}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
      >
        <Upload className="w-3.5 h-3.5 text-emerald-400" />
        Importer Excel
      </button>
      )}
      {canScrape && (
      <button
        onClick={onScrape}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
      >
        <Globe className="w-3.5 h-3.5 text-indigo-400" />
        Scraper
      </button>
      )}
    </div>
  )
}

function CreateMenu({ onCreateDb }: { onCreateDb: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 w-44 bg-surface-2 border border-white/10 rounded-lg shadow-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onCreateDb}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
      >
        <Database className="w-3.5 h-3.5 text-indigo-400" />
        {t('dataPage.createADatabase')}
      </button>
    </div>
  )
}

interface TreeLevelProps {
  node: FolderNode
  depth: number
  /** Nb de produits « challenge Fabricant » par docId (pour le picto). */
  mfrCounts: Record<string, number>
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
  // Tri alphanumérique (« ..._2026 » avant « ..._2027 ») pour dossiers ET bases.
  const alpha = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })
  const folders = [...node.folders.values()].sort((a, b) => alpha(a.name, b.name))
  const files = [...node.files].sort((a, b) => alpha(a.fileName, b.fileName))
  const fileIds = files.map((f) => f.docId)

  return (
    <div className={depth === 0 ? 'space-y-1' : 'space-y-0.5 mt-0.5'}>
      {folders.map((f) => (
        <FolderRow key={`folder-${pathKey(f.path)}`} folder={f} {...props} />
      ))}
      <SortableContext items={fileIds} strategy={verticalListSortingStrategy}>
        {files.map((f) => (
          <FileRow key={f.docId} file={f} {...props} />
        ))}
      </SortableContext>
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
  mfrCounts,
}: { file: SavedFileEntry } & TreeLevelProps) {
  const { t, locale } = useTranslation()
  const isActive = currentDocId === f.docId
  const isRenaming = renamingDocId === f.docId
  const isMoving = movingDocId === f.docId
  const mfrCount = mfrCounts[f.docId] ?? 0
  const FolderIcon = isActive ? FolderOpen : Folder
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.docId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${depth * 12 + 4}px`,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-center gap-1.5 pr-1.5 py-1.5 rounded-md border transition-colors ${
        isDragging
          ? 'bg-indigo-500/15 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
          : isActive
            ? 'bg-indigo-500/[0.18] border-indigo-400/60 ring-1 ring-indigo-400/30'
            : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]'
      }`}
    >
      {/* Active accent bar — barre verticale indigo pour repérer la BDD courante */}
      {isActive && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-indigo-400" />
      )}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-white/15 hover:text-white/40 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        title={t('pim.reorder')}
      >
        <GripVertical className="w-3 h-3" />
      </button>
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
            placeholder={t('pim.taxonomyExample')}
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
            <p className={`text-[11.5px] font-medium truncate ${isActive ? 'text-indigo-100' : 'text-white/70'}`}>{f.fileName}</p>
            <p className={`text-[9.5px] ${isActive ? 'text-indigo-300/70' : 'text-white/30'}`}>
              {t(f.totalRows > 1 ? 'pim.products.other' : 'pim.products.one', { count: f.totalRows })}
              {f.updatedAt && ` · ${f.updatedAt.toLocaleDateString(intlLocale(locale))}`}
            </p>
          </div>
        )}
      </div>

      {!isRenaming && !isMoving && mfrCount > 0 && (
        <span
          title={t('pim.mfrChallenge', { count: mfrCount })}
          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-indigo-500/15 text-indigo-300 text-[9px] font-semibold shrink-0"
        >
          <Factory className="w-2.5 h-2.5" />
          {mfrCount}
        </span>
      )}

      {isRenaming || isMoving ? (
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            if (isRenaming) void commitRename(f)
            else void commitMove(f)
          }}
          className="p-0.5 text-emerald-300/80 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors"
          title={t('pim.validate')}
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
          className="absolute right-0 top-full mt-1 z-50 w-44 bg-surface-2 border border-white/10 rounded-lg shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { onLoad(f.docId); setOpenMenu(null) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            {t('pim.open')}
          </button>
          <button
            onClick={() => startRename(f)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-amber-400" />
            {t('pim.rename')}
          </button>
          <button
            onClick={() => startMove(f)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
          >
            <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
            {t('pim.moveTo')}
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
            {t('pim.delete')}
          </button>
        </div>
      )}
    </div>
  )
}
