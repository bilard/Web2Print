import { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LogOut, Loader2, Library, FilePlus, FileSpreadsheet, Settings, Upload, HardDrive, FolderTree } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useSignOut } from '@/features/auth/useAuth'
import { useProjects } from '@/features/projects/useProjects'
import { useCreateProject, slugify } from '@/features/projects/useCreateProject'
import { useDeleteProject } from '@/features/projects/useDeleteProject'
import { useProjectStore } from '@/stores/project.store'
import { useGDriveStore } from '@/stores/gdrive.store'
import { useExcelImport } from '@/features/excel/useExcelImport'
import { ProjectCard } from '@/components/shared/ProjectCard'
import { NewDocumentPanel } from '@/components/shared/NewDocumentPanel'
import { ImportPanel } from '@/components/shared/ImportPanel'
import { SettingsPanel } from '@/components/shared/SettingsPanel'
import { GDriveConnect } from '@/features/gdrive/GDriveConnect'
import { GDrivePanel } from '@/features/gdrive/GDrivePanel'
import type { DocumentConfig } from '@/components/shared/NewDocumentPanel'
import type { ImportSelection } from '@/components/shared/ImportPanel'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { LibraryTaxonomyFilter } from '@/components/shared/LibraryTaxonomyFilter'

const DataPage = lazy(() => import('@/pages/DataPage'))
const TaxonomiesPage = lazy(() => import('@/pages/TaxonomiesPage'))

type Section = 'blank' | 'import' | 'library' | 'data' | 'gdrive' | 'settings' | 'taxonomies'

const menuItems: { id: Section; icon: React.ComponentType<{ className?: string }>; label: string; accent: string; activeBg: string; activeText: string }[] = [
  { id: 'blank',  icon: FilePlus,       label: 'Nouveau document', accent: 'text-violet-400',  activeBg: 'bg-violet-500/[0.1]',  activeText: 'text-violet-300' },
  { id: 'import', icon: Upload,         label: 'Importer',         accent: 'text-amber-400',   activeBg: 'bg-amber-500/[0.1]',   activeText: 'text-amber-300' },
  { id: 'library',icon: Library,        label: 'Bibliothèque',     accent: 'text-sky-400',     activeBg: 'bg-sky-500/[0.1]',     activeText: 'text-sky-300' },
  { id: 'data',   icon: FileSpreadsheet,label: 'Données',          accent: 'text-emerald-400', activeBg: 'bg-emerald-500/[0.1]', activeText: 'text-emerald-300' },
  { id: 'gdrive', icon: HardDrive,      label: 'Google Drive',     accent: 'text-blue-400',    activeBg: 'bg-blue-500/[0.1]',    activeText: 'text-blue-300' },
  { id: 'taxonomies', icon: FolderTree, label: 'Taxonomies',       accent: 'text-teal-400',    activeBg: 'bg-teal-500/[0.1]',    activeText: 'text-teal-300' },
]

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const gdriveConnected = useGDriveStore((s) => s.connected)
  const signOut = useSignOut()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<Section>('library')
  const [importLoading, setImportLoading] = useState(false)
  const [filterNodeId, setFilterNodeId] = useState<string | null>(null)
  const [filterProjectIds, setFilterProjectIds] = useState<string[]>([])

  const handleFilterSelect = useCallback((nodeId: string | null, projectIds: string[]) => {
    setFilterNodeId(nodeId)
    setFilterProjectIds(projectIds)
  }, [])

  const { data: projects, isLoading, isError } = useProjects()
  const createProject = useCreateProject()
  const deleteProject = useDeleteProject()
  const setPendingImport = useProjectStore((s) => s.setPendingImport)
  const { importFile: importExcel } = useExcelImport()

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
    })
    navigate(`/editor/${project.id}`, { state: { title: config.title } })
  }

  const handleImport = async (selection: ImportSelection) => {
    // Excel → charger dans le store Données et ouvrir la section
    if (selection.type === 'xlsx' && selection.files[0]) {
      await importExcel(selection.files[0])
      setActiveSection('data')
      return
    }

    setImportLoading(true)
    try {
      const defaults: Record<string, { w: number; h: number }> = {
        idml: { w: 794, h: 1123 },
        pptx: { w: 1920, h: 1080 },
        image: { w: 1920, h: 1080 },
      }
      const { w, h } = defaults[selection.type] ?? { w: 1920, h: 1080 }

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

      setPendingImport(selection)

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
      <aside className="w-56 bg-[#141414] border-r border-white/[0.06] flex flex-col shrink-0" aria-label="Menu principal">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-500 rounded-md flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-white/90 tracking-tight">Web2Print</span>
        </div>

        {/* Menu principal */}
        <nav className="px-2 pb-3 space-y-0.5" role="menubar" aria-orientation="vertical">
          {menuItems.map(({ id, icon: Icon, label, accent, activeBg, activeText }) => {
            const isActive = activeSection === id
            return (
              <button
                id={`menu-${id}`}
                key={id}
                role="menuitem"
                tabIndex={isActive ? 0 : -1}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveSection(id)}
                onKeyDown={(e) => handleKeyDown(e, id)}
                className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[#141414] ${
                  isActive
                    ? `${activeBg} ${activeText} font-medium`
                    : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? accent : 'opacity-50'}`} aria-hidden="true" />
                <span className="flex-1 text-left">{label}</span>
                {id === 'library' && projects && projects.length > 0 && (
                  <span className={`text-[11px] tabular-nums px-1.5 py-px rounded ${
                    isActive ? 'bg-sky-500/[0.15] text-sky-300' : 'text-white/25'
                  }`} aria-label={`${projects.length} projets`}>
                    {projects.length}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Data toolbar portal target */}
        {activeSection === 'data' && (
          <div className="flex-1 overflow-y-auto px-2 border-t border-white/[0.06] pt-2">
            <div id="data-toolbar-portal" />
          </div>
        )}

        {activeSection !== 'data' && <div className="flex-1" />}

        {/* User + Settings */}
        <div className="px-2 py-3 border-t border-white/[0.06]">
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
              </div>

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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" role="list" aria-label="Liste des projets">
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onDelete={(id) => deleteProject.mutate(id)}
                      taxonomyLabel={projectTaxonomyLabel[project.id]}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      ) : (
        <main className="flex-1 p-8 overflow-auto" role="main" aria-label={menuItems.find((m) => m.id === activeSection)?.label}>
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

            {/* ─── GOOGLE DRIVE ─── */}
            {activeSection === 'gdrive' && (
              gdriveConnected
                ? <GDrivePanel />
                : <>
                    <h1 className="text-xl font-bold mb-6">Google Drive</h1>
                    <div className="max-w-xl"><GDriveConnect /></div>
                  </>
            )}

            {/* ─── PARAMÈTRES ─── */}
            {activeSection === 'settings' && (
              <>
                <h1 className="text-xl font-bold mb-6">Paramètres</h1>
                <div className="max-w-lg">
                  <SettingsPanel />
                </div>
              </>
            )}
          </div>
        </main>
      )}
    </div>
  )
}
