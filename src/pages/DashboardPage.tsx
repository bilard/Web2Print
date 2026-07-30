import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, LogOut, Loader2, Library, Settings, LayoutGrid, List, Trash2, X, ExternalLink } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useSignOut } from '@/features/auth/useAuth'
import { useIsPending, useIsBlocked, useAccessLoading, useCan } from '@/features/access/useAccess'
import { useIsAdmin } from '@/features/access/useAccess'
import { AccessAdminPage } from '@/features/access/admin/AccessAdminPage'
import { PendingAccessScreen } from '@/features/access/PendingAccessScreen'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { useProjects } from '@/features/projects/useProjects'
import { useCreateProject, slugify } from '@/features/projects/useCreateProject'
import { useDeleteProject } from '@/features/projects/useDeleteProject'
import { useDuplicateProject } from '@/features/projects/useDuplicateProject'
import { useProjectStore } from '@/stores/project.store'
import { useExcelImport } from '@/features/excel/useExcelImport'
import { useExcelStore } from '@/stores/excel.store'
import { ProjectCard, type ProjectViewMode } from '@/components/shared/ProjectCard'
import { NewDocumentPanel } from '@/components/shared/NewDocumentPanel'
import { ImportPanel } from '@/components/shared/ImportPanel'
import { SettingsPanel } from '@/components/shared/SettingsPanel'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LiveLlmUsagePanel } from '@/components/shared/LiveLlmUsagePanel'
import type { DocumentConfig } from '@/components/shared/NewDocumentPanel'
import type { ImportSelection } from '@/components/shared/ImportPanel'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { LibraryTaxonomyFilter } from '@/components/shared/LibraryTaxonomyFilter'
import { DamPage } from '../features/dam/components/DamPage'
import { useHighlight } from '@/features/help/hooks/useHighlight'
import { useHelpStore } from '@/features/help/help.store'
import { useAccessStore } from '@/stores/access.store'
import { TourLauncher } from '@/features/tour/TourLauncher'
import { registerTourSectionNavigator } from '@/features/tour/tour.store'
import { MODULE_ITEMS as menuItems, SECTION_PERMISSION, groupModules, type Section } from '@/features/navigation/modules'
import { useTranslation } from '@/lib/i18n'
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher'
import { ModuleTree } from '@/features/navigation/ModuleTree'
import { useModuleIntentStore } from '@/stores/moduleIntent.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { trackSection } from '@/features/analytics/track'

const DataPage = lazy(() => import('@/pages/DataPage'))
const TaxonomiesPage = lazy(() => import('@/pages/TaxonomiesPage'))
const ScrapingTemplatesPage = lazy(() => import('@/pages/ScrapingTemplatesPage'))
const ScrapingHubPage = lazy(() => import('@/features/scraping-hub/ScrapingHubPage').then((m) => ({ default: m.ScrapingHubPage })))
const ChatPage = lazy(() => import('@/features/chat/ChatPage').then((m) => ({ default: m.ChatPage })))
const WorkflowsPage = lazy(() => import('@/features/workflows/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })))
const HyperframesPage = lazy(() => import('@/features/video/HyperframesPage').then((m) => ({ default: m.HyperframesPage })))
const TelegramInboxView = lazy(() => import('@/features/telegram/TelegramInboxView').then((m) => ({ default: m.TelegramInboxView })))
const PriceWatchPanel = lazy(() => import('@/features/priceWatch/PriceWatchPanel').then((m) => ({ default: m.PriceWatchPanel })))
const FinancePanel = lazy(() => import('@/features/finance/FinancePanel').then((m) => ({ default: m.FinancePanel })))
const RetailPromoPage = lazy(() => import('@/features/retail-promo/RetailPromoPage').then((m) => ({ default: m.RetailPromoPage })))
const CatalogHome = lazy(() => import('@/features/catalog/CatalogHome').then((m) => ({ default: m.CatalogHome })))
const DemoExpressPage = lazy(() => import('@/features/demo-express/DemoExpressPage').then((m) => ({ default: m.DemoExpressPage })))
const ManufacturerInsightsScreen = lazy(() => import('@/features/manufacturer-verify/insights/ManufacturerInsightsScreen').then((m) => ({ default: m.ManufacturerInsightsScreen })))

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const signOut = useSignOut()
  const isAdmin = useIsAdmin()
  const canDeleteProject = useCan('library.delete')
  const permissions = useAccessStore((s) => s.permissions)
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const setHelpContext = useHelpStore((s) => s.setActiveContext)
  const setModuleIntent = useModuleIntentStore((s) => s.set)
  const querySection = new URLSearchParams(location.search).get('section') as Section | null
  const initialSection =
    (location.state as { section?: Section } | null)?.section ?? querySection ?? 'library'
  const [activeSection, setActiveSection] = useState<Section>(initialSection)
  // Deep-link par URL (bookmarkable) : `?section=access&intent=access:tab:analytics`
  // ouvre directement le module et son onglet. Appliqué une fois au montage.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const section = params.get('section') as Section | null
    const intent = params.get('intent')
    if (section) setActiveSection(section)
    if (intent) setModuleIntent(intent)
  }, [])
  // Ouvre la section demandée par la navigation (ex: lien d'aide « Importer un fichier »
  // → state { section: 'import' }). location.key change à chaque navigation, y compris
  // vers la même route → l'écran s'ouvre même si on est déjà sur le dashboard.
  useEffect(() => {
    const state = location.state as { section?: Section; intent?: string } | null
    if (state?.section) setActiveSection(state.section)
    setModuleIntent(state?.intent ?? null)
    // `location.state` est stocké dans l'History API et SURVIT à un reload : sans
    // ça, recharger rejouerait section+intent (→ ré-ouverture de la modale d'import).
    // On les retire de l'état d'historique APRÈS les avoir appliqués en mémoire ;
    // React Router garde sa location courante (pas de re-render), mais un reload
    // repartira propre sur l'accueil.
    if (state?.section || state?.intent) {
      const h = window.history.state
      if (h?.usr) {
        const usr = { ...h.usr }
        delete usr.section
        delete usr.intent
        window.history.replaceState({ ...h, usr }, '')
      }
    }
  }, [location.key, location.state, setModuleIntent])
  // Permet aux étapes du tour guidé d'ouvrir une section (navigation injectée).
  useEffect(() => {
    registerTourSectionNavigator((section) => setActiveSection(section as Section))
    return () => registerTourSectionNavigator(null)
  }, [])
  // Aligne l'aide contextuelle sur le module ouvert : ouvrir le panneau d'aide depuis
  // une section pré-sélectionne l'article correspondant (DAM → « DAM », PIM → « PIM »…).
  useEffect(() => {
    setHelpContext(activeSection)
  }, [activeSection, setHelpContext])
  // Analytics : les modules n'étant pas des routes, chaque section ouverte est
  // enregistrée comme page virtuelle `/dashboard/<section>`.
  useEffect(() => {
    trackSection(activeSection)
  }, [activeSection])
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

  // Deep-link des fonctions Bibliothèque (rendue inline ici) : bascule de vue.
  useModuleIntent('library', (action) => {
    if (action === 'view:grid') handleViewModeChange('grid')
    else if (action === 'view:list') handleViewModeChange('list')
  })

  // Module « Importer » → « Importer un Excel » : bascule sur le PIM et ouvre
  // l'assistant d'import (avec l'animation de conversion des formules Excel).
  useModuleIntent('import', (action) => {
    if (action !== 'action:excel') return
    setActiveSection('data')
    useExcelStore.getState().setImportModalOpen(true)
  })

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
    const msg = t(ids.length > 1 ? 'cfm.pj.bulkDelete.many' : 'cfm.pj.bulkDelete.one', { count: ids.length })
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

      setPendingImport({ type: selection.type, files: selection.files, fonts: selection.fonts })

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
    const currentIndex = visibleMenuItems.findIndex((item) => item.id === id)
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      const next = visibleMenuItems[(currentIndex + 1) % visibleMenuItems.length]
      setActiveSection(next.id)
      const nextEl = document.getElementById(`menu-${next.id}`)
      nextEl?.focus()
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = visibleMenuItems[(currentIndex - 1 + visibleMenuItems.length) % visibleMenuItems.length]
      setActiveSection(prev.id)
      const prevEl = document.getElementById(`menu-${prev.id}`)
      prevEl?.focus()
    }
  }

  const accessLoading = useAccessLoading()
  const pending = useIsPending()
  const blocked = useIsBlocked()
  if (accessLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (blocked) return <PendingAccessScreen blocked />
  if (pending) return <PendingAccessScreen />

  const canSee = (id: Section) => {
    if (id === 'access') return isAdmin
    const perm = SECTION_PERMISSION[id]
    return isAdmin || !perm || permissions.has(perm)
  }
  const visibleMenuItems = menuItems.filter((m) => canSee(m.id))
  // Libellé du module ouvert, pour l'`aria-label` de la zone de contenu.
  const activeModule = menuItems.find((m) => m.id === activeSection)
  const activeLabel = activeModule ? t(activeModule.labelKey) : undefined

  return (
    <div className="h-screen bg-background text-white flex overflow-hidden">
      {/* Onboarding : réclame une clé LLM si aucune n'est configurée */}
      <OnboardingWizard />
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-14'} bg-surface-2 border-r border-white/[0.06] flex flex-col shrink-0 transition-[width] duration-200`}
        aria-label={t('dashboard.mainMenu')}
      >
        {/* Logo (clic = toggle sidebar) */}
        <div className={`py-4 flex items-center ${sidebarOpen ? 'px-4' : 'px-0 justify-center'}`}>
          <button
            onClick={toggleSidebar}
            className={`flex items-center rounded-md transition-colors hover:bg-white/[0.04] ${sidebarOpen ? 'gap-2 flex-1 min-w-0 px-1 py-1 -mx-1' : 'p-1'}`}
            title={t(sidebarOpen ? 'dashboard.sidebar.close' : 'dashboard.sidebar.open')}
            aria-label={t(sidebarOpen ? 'dashboard.sidebar.closeAria' : 'dashboard.sidebar.openAria')}
          >
            <img
              src="/logo.png"
              alt="IBS Studio"
              className={`${sidebarOpen ? 'h-40' : 'h-10'} w-auto object-contain flex-shrink-0`}
            />
          </button>
        </div>

        {/* Menu principal */}
        {/* min-h-0 + overflow : l'arbre déplié scrolle DANS la sidebar au lieu de pousser
            le bloc utilisateur (avatar/réglages/déconnexion) hors de l'écran. */}
        <nav
          data-tour="sidebar"
          className={`${sidebarOpen ? 'px-2' : 'px-1.5'} pb-3 space-y-0.5 min-h-0 overflow-y-auto overscroll-contain`}
          aria-label={t('dashboard.moduleNav')}
        >
          {sidebarOpen ? (
            <ModuleTree
              modules={visibleMenuItems}
              activeSection={activeSection}
              onOpen={(section) => setActiveSection(section)}
              onOpenChild={(section, intent, routeTo) => {
                if (routeTo) { navigate(routeTo); return }
                navigate('/dashboard', { state: { section, intent } })
              }}
              moduleRowExtras={(m) => ({
                id: `menu-${m.id}`,
                ref: m.id === 'blank' ? newProjectHighlight.ref : undefined,
                className: m.id === 'blank' ? newProjectHighlight.className : undefined,
                tabIndex: activeSection === m.id ? 0 : -1,
                title: t(m.labelKey),
                'data-help-id': `dashboard.sidebar.${m.id}`,
                'aria-label': t(m.labelKey),
                onKeyDown: (e) => handleKeyDown(e, m.id),
              })}
            />
          ) : (
            groupModules(visibleMenuItems).map(({ group, items }, gi) => (
              <div key={group.id} className={gi > 0 ? 'mt-1 pt-1 border-t border-white/[0.06]' : ''}>
                {items.map(({ id, icon: Icon, labelKey, accent, activeBg, activeText }) => {
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
                      aria-label={t(labelKey)}
                      title={t(labelKey)}
                      onClick={() => setActiveSection(id)}
                      onKeyDown={(e) => handleKeyDown(e, id)}
                      className={`w-full flex items-center justify-center px-0 py-[7px] rounded-md text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2 ${
                        isActive
                          ? `${activeBg} ${activeText} font-medium`
                          : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]'
                      } ${id === 'blank' ? newProjectHighlight.className : ''}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? accent : 'opacity-50'}`} aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </nav>

        {/* Data toolbar portal target */}
        {activeSection === 'data' && sidebarOpen && (
          <div className="flex-1 overflow-y-auto px-2 border-t border-white/[0.06] pt-2">
            <div id="data-toolbar-portal" />
          </div>
        )}

        {(activeSection !== 'data' || !sidebarOpen) && <div className="flex-1" />}

        {/* User + Settings */}
        <div data-tour="user-menu" className={`${sidebarOpen ? 'px-2' : 'px-1.5'} py-3 border-t border-white/[0.06]`}>
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
                <p className="text-[12px] text-white/50 truncate" title={user?.displayName ?? undefined}>{user?.displayName}</p>
              </div>
              {/* Les 4 contrôles sont groupés dans leur propre rangée serrée : avec
                  `gap-2.5` sur chacun, la place restante pour le nom tombait à 25 px
                  (« Fr… »). Ici le nom en récupère ~67 — plus qu'avant l'ajout de la
                  langue. Variante `compact` : le groupe FR|EN complet ne tient pas. */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <LocaleSwitcher compact />
                <ThemeToggle
                  className="p-1 rounded text-white/20 hover:text-white/50 hover:bg-white/[0.04]"
                  iconClassName="w-3.5 h-3.5"
                />
                <button
                  data-help-id="dashboard.sidebar.settings"
                  onClick={() => setActiveSection('settings')}
                  className={`p-1 rounded transition-colors ${
                    activeSection === 'settings'
                      ? 'text-indigo-400 bg-indigo-500/10'
                      : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'
                  }`}
                  title={t('dashboard.settings')}
                  aria-label={t('dashboard.settings')}
                >
                  <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  onClick={handleSignOut}
                  className="text-white/20 hover:text-white/50 transition-colors p-1 rounded hover:bg-white/[0.04]"
                  title={t('dashboard.signOut')}
                  aria-label={t('dashboard.signOut')}
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
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
              {/* ⚠️ PAS de sélecteur de langue ici. Le pied de la sidebar REPLIÉE
                  (56 px) est déjà recouvert par les pastilles flottantes
                  `fixed bottom-4/bottom-16 left-4` (modules, notifications) :
                  tout élément ajouté remonte le bouton de thème SOUS la cloche
                  et le rend incliquable — mesuré via elementFromPoint. La langue
                  se change dans la sidebar dépliée ou dans le tiroir de modules,
                  tous deux accessibles depuis cet état. */}
              <ThemeToggle
                className="p-1 rounded text-white/20 hover:text-white/50 hover:bg-white/[0.04]"
                iconClassName="w-3.5 h-3.5"
              />
              <button
                data-help-id="dashboard.sidebar.settings"
                onClick={() => setActiveSection('settings')}
                className={`p-1 rounded transition-colors ${
                  activeSection === 'settings'
                    ? 'text-indigo-400 bg-indigo-500/10'
                    : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'
                }`}
                title={t('dashboard.settings')}
                aria-label={t('dashboard.settings')}
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={handleSignOut}
                className="text-white/20 hover:text-white/50 transition-colors p-1 rounded hover:bg-white/[0.04]"
                title={t('dashboard.signOut')}
                aria-label={t('dashboard.signOut')}
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Content */}
      {activeSection === 'data' && canSee('data') ? (
        <div data-tour="section-data" className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          }>
            <DataPage embedded />
          </Suspense>
        </div>
      ) : activeSection === 'taxonomies' && canSee('taxonomies') ? (
        <div data-tour="section-taxonomies" className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
            </div>
          }>
            <TaxonomiesPage embedded />
          </Suspense>
        </div>
      ) : activeSection === 'scraping-templates' && canSee('scraping-templates') ? (
        <div data-tour="section-scraping-templates" className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          }>
            <ScrapingTemplatesPage />
          </Suspense>
        </div>
      ) : activeSection === 'scraping-hub' && canSee('scraping-hub') ? (
        <div data-tour="section-scraping-hub" className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            </div>
          }>
            <ScrapingHubPage />
          </Suspense>
        </div>
      ) : activeSection === 'chat' && canSee('chat') ? (
        <div data-tour="section-chat" className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          }>
            <ChatPage />
          </Suspense>
        </div>
      ) : activeSection === 'workflows' && canSee('workflows') ? (
        <div data-tour="section-workflows" className="flex-1 flex overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          }>
            <WorkflowsPage embedded />
          </Suspense>
        </div>
      ) : activeSection === 'mfr-insights' && canSee('mfr-insights') ? (
        <div data-tour="section-mfr-insights" className="flex-1 flex overflow-hidden bg-background">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          }>
            <ManufacturerInsightsScreen />
          </Suspense>
        </div>
      ) : activeSection === 'price-watch' && canSee('price-watch') ? (
        <div data-tour="section-price-watch" className="flex-1 overflow-auto px-8 pb-8 bg-background">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            </div>
          }>
            <PriceWatchPanel />
          </Suspense>
        </div>
      ) : activeSection === 'finances' && isAdmin ? (
        <div data-tour="section-finances" className="flex-1 overflow-auto p-8 bg-background">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          }>
            <FinancePanel />
          </Suspense>
        </div>
      ) : activeSection === 'access' && isAdmin ? (
        <div data-tour="section-access" className="flex-1 overflow-hidden">
          <AccessAdminPage />
        </div>
      ) : activeSection === 'telegram' && canSee('telegram') ? (
        <div data-tour="section-telegram" className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          }>
            <TelegramInboxView />
          </Suspense>
        </div>
      ) : activeSection === 'hyperframes' && canSee('hyperframes') ? (
        <div data-tour="section-hyperframes" className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-fuchsia-500 animate-spin" />
            </div>
          }>
            <HyperframesPage embedded />
          </Suspense>
        </div>
      ) : activeSection === 'images' && canSee('images') ? (
        <div data-tour="section-images" className="flex-1 overflow-hidden">
          <DamPage />
        </div>
      ) : activeSection === 'library' && canSee('library') ? (
        <div data-tour="section-library" className="flex-1 flex overflow-hidden">
          <LibraryTaxonomyFilter
            selectedNodeId={filterNodeId}
            onSelectNode={handleFilterSelect}
          />
          <main className="flex-1 p-8 overflow-auto" role="main" aria-label={t('nav.library')}>
            {/* Hors du conteneur centré : le toggle reste ancré au bord DROIT du module
                quelle que soit la largeur d'écran (sinon il flotte au bord de la colonne 6xl). */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-xl font-bold">
                {t('library.title')}
                {filterNodeId && (
                  <span className="text-sm font-normal text-white/40 ml-3">
                    {t(filteredProjects.length === 1 ? 'library.results.one' : 'library.results.other', { count: filteredProjects.length })}
                  </span>
                )}
              </h1>

              <div className="flex items-center gap-2">
                  {/* Toggle vue grille / liste */}
                  <div
                    className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5"
                    role="group"
                    aria-label={t('library.viewMode')}
                  >
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('grid')}
                      aria-pressed={viewMode === 'grid'}
                      title={t('library.view.grid')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                        viewMode === 'grid'
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t('library.view.gridShort')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('list')}
                      aria-pressed={viewMode === 'list'}
                      title={t('library.view.list')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                        viewMode === 'list'
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t('library.view.listShort')}</span>
                    </button>
                  </div>
              </div>
            </div>

            <div className="max-w-6xl mx-auto">
              {/* Barre d'actions de sélection groupée — visible dès qu'un projet est coché */}
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between gap-3 mb-4 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[13px] text-white/60 tabular-nums">
                      {t(selectedIds.size === 1 ? 'library.selected.one' : 'library.selected.other', { count: selectedIds.size })}
                    </span>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-[12px] text-indigo-300 hover:text-indigo-200 transition-colors"
                    >
                      {t(allSelected ? 'library.deselectAll' : 'library.selectAll')}
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 transition-colors"
                      title={t('library.clearSelection')}
                    >
                      <X className="w-3 h-3" />
                      {t('library.clear')}
                    </button>
                  </div>
                  {canDeleteProject && (
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
                      {t('library.delete', { count: selectedIds.size })}
                    </button>
                  )}
                </div>
              )}

              {isLoading && (
                <div className="flex items-center justify-center py-24" role="status">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" aria-hidden="true" />
                  <span className="sr-only">{t('library.loading')}</span>
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center justify-center py-24 gap-2" role="alert">
                  <p className="text-red-400 text-sm">{t('library.error')}</p>
                </div>
              )}

              {!isLoading && !isError && filteredProjects.length === 0 && !filterNodeId && projects?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-white/40">
                  <Library className="w-16 h-16 opacity-20" aria-hidden="true" />
                  <p className="text-lg font-medium text-white/30">{t('library.empty.title')}</p>
                  <p className="text-sm text-white/20">{t('library.empty.subtitle')}</p>
                  <button
                    onClick={() => setActiveSection('blank')}
                    className="mt-2 flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-[#fff] font-medium px-6 py-2.5 rounded-lg transition-colors text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    {t('dashboard.createDocument')}
                  </button>
                </div>
              )}

              {!isLoading && !isError && filterNodeId && filteredProjects.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 gap-2 text-white/40">
                  <p className="text-sm">{t('library.empty.filtered')}</p>
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
                  aria-label={t('library.list')}
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
      ) : activeSection === 'retail-promo' && canSee('retail-promo') ? (
        <div data-tour="section-retail-promo" className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
            </div>
          }>
            <RetailPromoPage />
          </Suspense>
        </div>
      ) : activeSection === 'catalog' && canSee('catalog') ? (
        <div data-tour="section-catalog" className="flex-1 overflow-auto">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            </div>
          }>
            <CatalogHome />
          </Suspense>
        </div>
      ) : activeSection === 'demo-express' && canSee('demo-express') ? (
        <div data-tour="section-demo-express" className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center h-full bg-background">
              <Loader2 className="w-8 h-8 text-lime-500 animate-spin" />
            </div>
          }>
            <DemoExpressPage />
          </Suspense>
        </div>
      ) : (
        <main
          className={`flex-1 ${activeSection === 'settings' ? 'overflow-hidden' : 'p-8 overflow-auto'}`}
          role="main"
          aria-label={activeLabel}
        >
          {activeSection === 'settings' ? (
            // Settings : header (titre + onglets) FIXE en haut, puis 2 colonnes
            // (contenu + panneau live conso LLM) qui défilent indépendamment.
            <div data-tour="section-settings" className="h-full p-8">
              <SettingsPanel
                fillHeight
                header={
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h1 className="text-xl font-bold">{t('dashboard.settings')}</h1>
                    <span className="text-[11px] font-mono text-white/30">v0.1.0</span>
                    <a
                      href="https://app.hyperframe.ai/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('dashboard.officialApp')}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors self-center"
                    >
                      app.hyperframe.ai
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                }
                aside={<LiveLlmUsagePanel />}
              />
            </div>
          ) : (
            <div className="max-w-6xl mx-auto">
              {/* ─── NOUVEAU DOCUMENT VIERGE ─── */}
              {activeSection === 'blank' && (
                <div data-tour="section-blank">
                  <h1 className="text-xl font-bold mb-6">{t('dashboard.createDocument')}</h1>
                  <NewDocumentPanel
                    onConfirm={handleCreate}
                    loading={createProject.isPending}
                  />
                </div>
              )}

              {/* ─── IMPORTER ─── */}
              {activeSection === 'import' && canSee('import') && (
                <div data-tour="section-import">
                  <h1 className="text-xl font-bold mb-6">{t('dashboard.import')}</h1>
                  <ImportPanel
                    onImport={handleImport}
                    loading={importLoading || createProject.isPending}
                  />
                </div>
              )}
            </div>
          )}
        </main>
      )}

      <TourLauncher tourId="dashboard" />
    </div>
  )
}
