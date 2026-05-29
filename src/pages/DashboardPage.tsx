import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, LogOut, Loader2, Library, FilePlus, FileSpreadsheet, Settings, Upload, FolderTree, LayoutGrid, List, Image as ImageIcon, Database, BookOpen, MessageSquare, Send, Workflow, Film, Trash2, X } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useSignOut } from '@/features/auth/useAuth'
import { useProjects } from '@/features/projects/useProjects'
import { useCreateProject, slugify } from '@/features/projects/useCreateProject'
import { useDeleteProject } from '@/features/projects/useDeleteProject'
import { useDuplicateProject } from '@/features/projects/useDuplicateProject'
import { useProjectStore } from '@/stores/project.store'
import { useExcelImport } from '@/features/excel/useExcelImport'
import { ProjectCard, type ProjectViewMode } from '@/components/shared/ProjectCard'
import { NewDocumentPanel } from '@/components/shared/NewDocumentPanel'
import { ImportPanel } from '@/components/shared/ImportPanel'
import { SettingsPanel } from '@/components/shared/SettingsPanel'
import { LiveLlmUsagePanel } from '@/components/shared/LiveLlmUsagePanel'
import type { DocumentConfig } from '@/components/shared/NewDocumentPanel'
import type { ImportSelection } from '@/components/shared/ImportPanel'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { LibraryTaxonomyFilter } from '@/components/shared/LibraryTaxonomyFilter'
import { DamPage } from '../features/dam/components/DamPage'
import { useHighlight } from '@/features/help/hooks/useHighlight'

const DataPage = lazy(() => import('@/pages/DataPage'))
const TaxonomiesPage = lazy(() => import('@/pages/TaxonomiesPage'))
const ScrapingTemplatesPage = lazy(() => import('@/pages/ScrapingTemplatesPage'))
const ScrapingHubPage = lazy(() => import('@/features/scraping-hub/ScrapingHubPage').then((m) => ({ default: m.ScrapingHubPage })))
const ChatPage = lazy(() => import('@/features/chat/ChatPage').then((m) => ({ default: m.ChatPage })))
const WorkflowsPage = lazy(() => import('@/features/workflows/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })))
const HyperframesPage = lazy(() => import('@/features/video/HyperframesPage').then((m) => ({ default: m.HyperframesPage })))
const TelegramInboxView = lazy(() => import('@/features/telegram/TelegramInboxView').then((m) => ({ default: m.TelegramInboxView })))

type Section = 'blank' | 'import' | 'library' | 'images' | 'data' | 'chat' | 'settings' | 'taxonomies' | 'scraping-templates' | 'scraping-hub' | 'workflows' | 'hyperframes' | 'telegram'

const menuItems: { id: Section; icon: React.ComponentType<{ className?: string }>; label: string; accent: string; activeBg: string; activeText: string }[] = [
  { id: 'blank',  icon: FilePlus,       label: 'Nouveau document', accent: 'text-violet-400',  activeBg: 'bg-violet-500/[0.1]',  activeText: 'text-violet-300' },
  { id: 'import', icon: Upload,         label: 'Importer',         accent: 'text-amber-400',   activeBg: 'bg-amber-500/[0.1]',   activeText: 'text-amber-300' },
  { id: 'library',icon: Library,        label: 'Bibliothèque',     accent: 'text-sky-400',     activeBg: 'bg-sky-500/[0.1]',     activeText: 'text-sky-300' },
  { id: 'images', icon: ImageIcon,      label: 'DAM',              accent: 'text-pink-400',    activeBg: 'bg-pink-500/[0.1]',    activeText: 'text-pink-300' },
  { id: 'data',   icon: FileSpreadsheet,label: 'PIM',              accent: 'text-emerald-400', activeBg: 'bg-emerald-500/[0.1]', activeText: 'text-emerald-300' },
  { id: 'taxonomies', icon: FolderTree, label: 'Taxonomies',       accent: 'text-teal-400',    activeBg: 'bg-teal-500/[0.1]',    activeText: 'text-teal-300' },
  { id: 'scraping-templates', icon: Database, label: 'Templates scraping', accent: 'text-indigo-400', activeBg: 'bg-indigo-500/[0.1]', activeText: 'text-indigo-300' },
  { id: 'scraping-hub', icon: BookOpen, label: 'Scraping Hub', accent: 'text-sky-400', activeBg: 'bg-sky-500/[0.1]', activeText: 'text-sky-300' },
  { id: 'workflows', icon: Workflow, label: 'Workflows', accent: 'text-indigo-400', activeBg: 'bg-indigo-500/[0.1]', activeText: 'text-indigo-300' },
  { id: 'telegram', icon: Send, label: 'Telegram', accent: 'text-blue-400', activeBg: 'bg-blue-500/[0.1]', activeText: 'text-blue-300' },
  { id: 'hyperframes', icon: Film, label: 'Annimation', accent: 'text-fuchsia-400', activeBg: 'bg-fuchsia-500/[0.1]', activeText: 'text-fuchsia-300' },
  { id: 'chat', icon: MessageSquare, label: 'Chat IA', accent: 'text-violet-400', activeBg: 'bg-violet-500/[0.1]', activeText: 'text-violet-300' },
]

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const signOut = useSignOut()
  const navigate = useNavigate()
  const location = useLocation()
  const initialSection = (location.state as { section?: Section } | null)?.section ?? 'library'
  const [activeSection, setActiveSection] = useState<Section>(initialSection)
  // Ouvre la section demandée par la navigation (ex: lien d'aide « Importer un fichier »
  // → state { section: 'import' }). location.key change à chaque navigation, y compris
  // vers la même route → l'écran s'ouvre même si on est déjà sur le dashboard.
  useEffect(() => {
    const requested = (location.state as { section?: Section } | null)?.section
    if (requested) setActiveSection(requested)
  }, [location.key, location.state])
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('dashboard:sidebarOpen') !== 'false'
  })
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem('dashboard:sidebarOpen', String(next))
      } catch {
        /* noop */
      }
      return next
    })
  }, [])
  const [importLoading, setImportLoading] = useState(false)
  const [filterNodeId, setFilterNodeId] = useState<string | null>(null)
  const [filterProjectIds, setFilterProjectIds] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ProjectViewMode>(() => {
    if (typeof window === 'undefined') return 'list'
    const stored = window.localStorage.getItem('library:viewMode')
    return stored === 'grid' ? 'grid' : 'list'
  })
  // Sélection multiple pour suppression groupée (cases toujours visibles sur les cartes)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const handleViewModeChange = useCallback((mode: ProjectViewMode) => {
    setViewMode(mode)
    try {
      window.localStorage.setItem('library:viewMode', mode)
    } catch {
      /* noop */
    }
  }, [])

  const handleFilterSelect = useCallback((nodeId: string | null, projectIds: string[]) => {
    setFilterNodeId(nodeId)
    setFilterProjectIds(projectIds)
  }, [])

  const { data: projects, isLoading, isError } = useProjects()
  const createProject = useCreateProject()
  const deleteProject = useDeleteProject()
  const duplicateProject = useDuplicateProject()
  const setPendingImport = useProjectStore((s) => s.setPendingImport)
  const { importFile: importExcel } = useExcelImport()

  const newProjectHighlight = useHighlight<HTMLButtonElement>('dashboard.new-project')

  const { data: taxonomies } = useTaxonomies()
  const projectTaxonomyLabel = useMemo<Record<string, string>>(() => {
    if (!taxonomies) return {}
    const map: Record<string, string> = {}
    for (const tax of taxonomies) {
      for (const node of Object.values(tax.nodes)) {
        for (const pid of node.linkedProjectIds) {
          map[pid] = node.label
        }
      }
    }
    return map
  }, [taxonomies])

  const filteredProjects = useMemo(() => {
    if (!projects) return []
    if (!filterNodeId) return projects
    const idSet = new Set(filterProjectIds)
    return projects.filter((p) => idSet.has(p.id))
  }, [projects, filterNodeId, filterProjectIds])

  // ─── Sélection multiple / suppression groupée ────────────────────────────
  const allSelected = filteredProjects.length > 0 && filteredProjects.every((p) => selectedIds.has(p.id))

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(() => (allSelected ? new Set() : new Set(filteredProjects.map((p) => p.id))))
  }, [allSelected, filteredProjects])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const msg = `Supprimer ${ids.length} projet${ids.length > 1 ? 's' : ''} ? Cette action est irréversible.`
    if (!window.confirm(msg)) return
    await Promise.allSettled(ids.map((id) => deleteProject.mutateAsync(id)))
    clearSelection()
  }, [selectedIds, deleteProject, clearSelection])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const handleCreate = async (config: DocumentConfig) => {
    const project = await createProject.mutateAsync({
      title: config.title,
      canvasWidth: config.canvasWidth,
      canvasHeight: config.canvasHeight,
      canvasBg: config.canvasBg,
      canvasBgType: config.canvasBgType,
      canvasBgGradient: config.canvasBgGradient,
      canvasBgImage: config.canvasBgImage,
    })
    navigate(`/editor/${project.id}`, { state: { title: config.title } })
  }

  const handleImport = async (selection: ImportSelection) => {
    // Excel → charger dans le store Données et ouvrir la section
    if (selection.type === 'xlsx') {
      if (selection.files[0]) {
        await importExcel(selection.files[0])
        setActiveSection('data')
      }
      return
    }

    setImportLoading(true)
    try {
      const defaults: Record<string, { w: number; h: number }> = {
        idml: { w: 794, h: 1123 },
        pptx: { w: 1920, h: 1080 },
        image: { w: 1920, h: 1080 },
        svg: { w: 1920, h: 1080 },
        'image-to-svg': { w: 1920, h: 1080 },
        'pdf-to-svg': { w: 1920, h: 1080 },
      }
      // image-to-svg / pdf-to-svg : utilise les dimensions natives de la source (transmises par ImportPanel)
      const { w, h } = selection.canvas
        ? { w: selection.canvas.width, h: selection.canvas.height }
        : defaults[selection.type] ?? { w: 1920, h: 1080 }

      let title: string
      let customId: string | undefined

      if (selection.type === 'idml') {
        const idmlFile = selection.files.find((f) => f.name.toLowerCase().endsWith('.idml'))
        const baseName = (idmlFile?.name ?? selection.files[0]?.name ?? 'Import').replace(/\.[^.]+$/, '')
        title = baseName
        customId = slugify(baseName)
      } else {
        title = selection.files[0]?.name.replace(/\.[^.]+$/, '') || 'Import'
      }

      setPendingImport({ type: selection.type, files: selection.files })

      const project = await createProject.mutateAsync({
        title,
        canvasWidth: w,
        canvasHeight: h,
        canvasBg: '#ffffff',
        customId,
      })
      navigate(`/editor/${project.id}`, { state: { title } })
    } catch (err) {
      console.error('Import error', err)
      setImportLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, id: Section) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setActiveSection(id)
    }
    // Arrow key navigation
    const currentIndex = menuItems.findIndex((item) => item.id === id)
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      const next = menuItems[(currentIndex + 1) % menuItems.length]
      setActiveSection(next.id)
      const nextEl = document.getElementById(`menu-${next.id}`)
      nextEl?.focus()
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = menuItems[(currentIndex - 1 + menuItems.length) % menuItems.length]
      setActiveSection(prev.id)
      const prevEl = document.getElementById(`menu-${prev.id}`)
      prevEl?.focus()
    }
  }

  return (
    <div className="h-screen bg-[#0f0f0f] text-white flex overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-14'} bg-[#141414] border-r border-white/[0.06] flex flex-col shrink-0 transition-[width] duration-200`}
        aria-label="Menu principal"
      >
        {/* Logo (clic = toggle sidebar) */}
        <div className={`py-4 flex items-center ${sidebarOpen ? 'px-4' : 'px-0 justify-center'}`}>
          <button
            onClick={toggleSidebar}
            className={`flex items-center rounded-md transition-colors hover:bg-white/[0.04] ${sidebarOpen ? 'gap-2 flex-1 min-w-0 px-1 py-1 -mx-1' : 'p-1'}`}
            title={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-label={sidebarOpen ? 'Fermer le menu principal' : 'Ouvrir le menu principal'}
          >
            <div className="w-7 h-7 bg-indigo-500 rounded-md flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            {sidebarOpen && (
              <span className="flex-1 text-[13px] font-semibold text-white/90 tracking-tight truncate text-left">Web2Print</span>
            )}
          </button>
        </div>

        {/* Menu principal */}
        <nav
          className={`${sidebarOpen ? 'px-2' : 'px-1.5'} pb-3 space-y-0.5`}
          role="menubar"
          aria-orientation="vertical"
        >
          {menuItems.map(({ id, icon: Icon, label, accent, activeBg, activeText }) => {
            const isActive = activeSection === id
            return (
              <button
                id={`menu-${id}`}
                data-help-id={`dashboard.sidebar.${id}`}
                ref={id === 'blank' ? newProjectHighlight.ref : undefined}
                key={id}
                role="menuitem"
                tabIndex={isActive ? 0 : -1}
                aria-current={isActive ? 'page' : undefined}
                aria-label={!sidebarOpen ? label : undefined}
                title={!sidebarOpen ? label : undefined}
                onClick={() => setActiveSection(id)}
                onKeyDown={(e) => handleKeyDown(e, id)}
                className={`w-full flex items-center ${sidebarOpen ? 'gap-2.5 px-3' : 'justify-center px-0'} py-[7px] rounded-md text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[#141414] ${
                  isActive
                    ? `${activeBg} ${activeText} font-medium`
                    : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]'
                } ${id === 'blank' ? newProjectHighlight.className : ''}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? accent : 'opacity-50'}`} aria-hidden="true" />
                {sidebarOpen && (
                  <>
                    <span className="flex-1 text-left">{label}</span>
                    {id === 'library' && projects && projects.length > 0 && (
                      <span className={`text-[11px] tabular-nums px-1.5 py-px rounded ${
                        isActive ? 'bg-sky-500/[0.15] text-sky-300' : 'text-white/25'
                      }`} aria-label={`${projects.length} projets`}>
                        {projects.length}
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          })}
        </nav>

        {/* Data toolbar portal target */}
        {activeSection === 'data' && sidebarOpen && (
          <div className="flex-1 overflow-y-auto px-2 border-t border-white/[0.06] pt-2">
            <div id="data-toolbar-portal" />
          </div>
        )}

        {(activeSection !== 'data' || !sidebarOpen) && <div className="flex-1" />}

        {/* User + Settings */}
        <div className={`${sidebarOpen ? 'px-2' : 'px-1.5'} py-3 border-t border-white/[0.06]`}>
          {sidebarOpen ? (
            <div className="flex items-center gap-2.5 px-2">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName ?? ''} className="w-7 h-7 rounded-full ring-1 ring-white/[0.08] flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-medium text-white/40">{user?.displayName?.charAt(0) ?? '?'}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white/50 truncate">{user?.displayName}</p>
              </div>
              <button
                onClick={() => setActiveSection('settings')}
                className={`flex-shrink-0 p-1 rounded transition-colors ${
                  activeSection === 'settings'
                    ? 'text-indigo-400 bg-indigo-500/10'
                    : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
                title="Paramètres"
                aria-label="Paramètres"
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={handleSignOut}
                className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0 p-1 rounded hover:bg-white/[0.04]"
                title="Se déconnecter"
                aria-label="Se déconnecter"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName ?? ''} className="w-7 h-7 rounded-full ring-1 ring-white/[0.08]" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center">
                  <span className="text-[11px] font-medium text-white/40">{user?.displayName?.charAt(0) ?? '?'}</span>
                </div>
              )}
              <button
                onClick={() => setActiveSection('settings')}
                className={`p-1 rounded transition-colors ${
                  activeSection === 'settings'
                    ? 'text-indigo-400 bg-indigo-500/10'
                    : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
                title="Paramètres"
                aria-label="Paramètres"
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={handleSignOut}
                className="text-white/20 hover:text-white/50 transition-colors p-1 rounded hover:bg-white/[0.04]"
                title="Se déconnecter"
                aria-label="Se déconnecter"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Content */}
      {activeSection === 'data' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          }>
            <DataPage embedded />
          </Suspense>
        </div>
      ) : activeSection === 'taxonomies' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
            </div>
          }>
            <TaxonomiesPage embedded />
          </Suspense>
        </div>
      ) : activeSection === 'scraping-templates' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          }>
            <ScrapingTemplatesPage />
          </Suspense>
        </div>
      ) : activeSection === 'scraping-hub' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
              <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            </div>
          }>
            <ScrapingHubPage />
          </Suspense>
        </div>
      ) : activeSection === 'chat' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          }>
            <ChatPage />
          </Suspense>
        </div>
      ) : activeSection === 'workflows' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          }>
            <WorkflowsPage embedded />
          </Suspense>
        </div>
      ) : activeSection === 'telegram' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          }>
            <TelegramInboxView />
          </Suspense>
        </div>
      ) : activeSection === 'hyperframes' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-[#0f0f0f]">
              <Loader2 className="w-8 h-8 text-fuchsia-500 animate-spin" />
            </div>
          }>
            <HyperframesPage embedded />
          </Suspense>
        </div>
      ) : activeSection === 'images' ? (
        <div className="flex-1 overflow-hidden">
          <DamPage />
        </div>
      ) : activeSection === 'library' ? (
        <div className="flex-1 flex overflow-hidden">
          <LibraryTaxonomyFilter
            selectedNodeId={filterNodeId}
            onSelectNode={handleFilterSelect}
          />
          <main className="flex-1 p-8 overflow-auto" role="main" aria-label="Bibliothèque">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold">
                  Mes projets
                  {filterNodeId && (
                    <span className="text-sm font-normal text-white/40 ml-3">
                      ({filteredProjects.length} résultat{filteredProjects.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </h1>

                <div className="flex items-center gap-2">
                  {/* Toggle vue grille / liste */}
                  <div
                    className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5"
                    role="group"
                    aria-label="Mode d'affichage"
                  >
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('grid')}
                      aria-pressed={viewMode === 'grid'}
                      title="Vue vignettes"
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                        viewMode === 'grid'
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Vignettes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('list')}
                      aria-pressed={viewMode === 'list'}
                      title="Vue liste"
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                        viewMode === 'list'
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Liste</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Barre d'actions de sélection groupée — visible dès qu'un projet est coché */}
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between gap-3 mb-4 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[13px] text-white/60 tabular-nums">
                      {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-[12px] text-indigo-300 hover:text-indigo-200 transition-colors"
                    >
                      {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 transition-colors"
                      title="Effacer la sélection"
                    >
                      <X className="w-3 h-3" />
                      Effacer
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={deleteProject.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    {deleteProject.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Supprimer ({selectedIds.size})
                  </button>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center justify-center py-24" role="status">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Chargement des projets...</span>
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center justify-center py-24 gap-2" role="alert">
                  <p className="text-red-400 text-sm">Erreur lors du chargement des projets</p>
                </div>
              )}

              {!isLoading && !isError && filteredProjects.length === 0 && !filterNodeId && projects?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-white/40">
                  <Library className="w-16 h-16 opacity-20" aria-hidden="true" />
                  <p className="text-lg font-medium text-white/30">Bibliothèque vide</p>
                  <p className="text-sm text-white/20">Créez votre premier document pour commencer</p>
                  <button
                    onClick={() => setActiveSection('blank')}
                    className="mt-2 flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f0f]"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Créer un document
                  </button>
                </div>
              )}

              {!isLoading && !isError && filterNodeId && filteredProjects.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 gap-2 text-white/40">
                  <p className="text-sm">Aucun projet dans cette catégorie</p>
                </div>
              )}

              {!isLoading && !isError && filteredProjects.length > 0 && (
                <div
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
                      : 'flex flex-col gap-1.5'
                  }
                  role="list"
                  aria-label="Liste des projets"
                >
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onDelete={(id) => deleteProject.mutate(id)}
                      onDuplicate={(id) => duplicateProject.mutate(id)}
                      taxonomyLabel={projectTaxonomyLabel[project.id]}
                      view={viewMode}
                      selected={selectedIds.has(project.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      ) : (
        <main className="flex-1 p-8 overflow-auto" role="main" aria-label={menuItems.find((m) => m.id === activeSection)?.label}>
          {activeSection === 'settings' ? (
            // Settings : header (titre + onglets) figé PLEINE LARGEUR au scroll,
            // puis corps deux colonnes (contenu + panneau live conso LLM) qui défile.
            <SettingsPanel
              stickyClassName="sticky top-0 z-10 -mt-8 pt-8 pb-3 bg-[#0f0f0f] before:content-[''] before:absolute before:inset-x-0 before:bottom-full before:h-16 before:bg-[#0f0f0f]"
              header={
                <div className="flex items-baseline gap-3">
                  <h1 className="text-xl font-bold">Paramètres</h1>
                  <span className="text-[11px] font-mono text-white/30">v0.1.0</span>
                </div>
              }
              aside={<LiveLlmUsagePanel />}
            />
          ) : (
            <div className="max-w-6xl mx-auto">
              {/* ─── NOUVEAU DOCUMENT VIERGE ─── */}
              {activeSection === 'blank' && (
                <>
                  <h1 className="text-xl font-bold mb-6">Créer un document</h1>
                  <NewDocumentPanel
                    onConfirm={handleCreate}
                    loading={createProject.isPending}
                  />
                </>
              )}

              {/* ─── IMPORTER ─── */}
              {activeSection === 'import' && (
                <>
                  <h1 className="text-xl font-bold mb-6">Importer</h1>
                  <ImportPanel
                    onImport={handleImport}
                    loading={importLoading || createProject.isPending}
                  />
                </>
              )}
            </div>
          )}
        </main>
      )}
    </div>
  )
}
