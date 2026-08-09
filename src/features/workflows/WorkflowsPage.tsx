import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import {
  ArrowLeft, LayoutGrid, List, Plus, Trash2, Workflow as WorkflowIcon,
  Folder, FolderPlus, Pencil, Check, X, ChevronDown, ChevronRight, Star, Clock,
} from 'lucide-react'
import { findActiveCron } from './persistence/scheduleSync'
import { describeCron } from './runtime/cronLabels'
import {
  listWorkflows, newWorkflow, saveWorkflow, deleteWorkflow, setWorkflowFolder,
  listFolders, createFolder, renameFolder, deleteFolder,
} from './persistence/workflowsApi'
import { useCan } from '@/features/access/useAccess'
import { OptionHelp } from '@/components/shared/OptionHelp'
import { workflowFromTemplate, type WorkflowTemplate } from './templates'
import { UserTemplatesSection } from './UserTemplatesSection'
import { SaveAsTemplateDialog } from './editor/SaveAsTemplateDialog'
import type { Workflow, WorkflowFolder } from './types'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'

interface WorkflowsPageProps {
  embedded?: boolean
}

type ViewMode = 'grid' | 'list'
const VIEW_MODE_KEY = 'workflows.viewMode'
const COLLAPSED_KEY = 'workflows.collapsedFolders'

export function WorkflowsPage({ embedded = false }: WorkflowsPageProps) {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const nav = useNavigate()
  const canCreate = useCan('workflows.create')
  const canEdit = useCan('workflows.edit')
  const canDelete = useCan('workflows.delete')
  // Peut créer un dossier ou y classer un workflow → les dossiers vides lui restent utiles.
  const canOrganise = canCreate || canEdit
  const [items, setItems] = useState<Workflow[]>([])
  const [folders, setFolders] = useState<WorkflowFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [newFolderName, setNewFolderName] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY)
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set<string>()
    }
  })
  const toggleFolder = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
      } catch {
        /* localStorage indisponible : repli en mémoire seule */
      }
      return next
    })
  }
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY)
    return saved === 'list' ? 'list' : 'grid'
  })
  // Workflow ciblé par le dialog « Enregistrer comme modèle » (null = fermé).
  const [templateFor, setTemplateFor] = useState<Workflow | null>(null)
  // Bump pour forcer UserTemplatesSection à relire après création d'un modèle.
  const [templatesVersion, setTemplatesVersion] = useState(0)

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (!uid) return
    Promise.all([listWorkflows(uid), listFolders(uid)]).then(([wfs, fls]) => {
      setItems(wfs)
      setFolders(fls)
      setLoading(false)
    })
  }, [uid])

  // ⚠️ Ces trois actions étaient MUETTES en échec : `if (!uid) return` sans retour,
  // et `onClick={create}` avale le rejet de l'écriture Firestore. Résultat vécu :
  // cliquer « Nouveau workflow » ne faisait RIEN — ni navigation, ni message, ni
  // rejet non capté. Un échec doit toujours se voir.
  const create = async () => {
    if (!uid) { toast.error(t('wf.notSignedIn')); return }
    try {
      const wf = newWorkflow(uid)
      await saveWorkflow(uid, wf)
      nav(`/workflows/${wf.id}`)
    } catch (e) {
      toast.error(t('tst.createFailedWith', { message: e instanceof Error ? e.message : String(e) }))
    }
  }

  useModuleIntent('workflows', (action) => {
    if (action === 'action:new') { void create(); return }
    if (action === 'action:my-templates') {
      document.querySelector<HTMLElement>('[data-wf-section="my-templates"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })

  const createFromTemplate = async (template: WorkflowTemplate) => {
    if (!uid) { toast.error(t('wf.notSignedIn')); return }
    try {
      const wf = workflowFromTemplate(template, uid)
      await saveWorkflow(uid, wf)
      nav(`/workflows/${wf.id}`)
    } catch (e) {
      toast.error(t('tst.createFailedWith', { message: e instanceof Error ? e.message : String(e) }))
    }
  }
  const remove = async (id: string) => {
    if (!uid) { toast.error(t('wf.notSignedIn')); return }
    try {
      await deleteWorkflow(uid, id)
      setItems((prev) => prev.filter((w) => w.id !== id))
    } catch (e) {
      toast.error(t('wf.deleteFailed', { message: e instanceof Error ? e.message : String(e) }))
    }
  }
  const sortFolders = (fls: WorkflowFolder[]) => [...fls].sort((a, b) => a.name.localeCompare(b.name))

  const addFolder = async () => {
    if (!uid || newFolderName == null) return
    const name = newFolderName.trim()
    setNewFolderName(null)
    if (!name) return
    const f = await createFolder(uid, name)
    setFolders((prev) => sortFolders([...prev, f]))
  }
  const saveRename = async () => {
    if (!uid || !renamingId) return
    const id = renamingId
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    setFolders((prev) => sortFolders(prev.map((f) => (f.id === id ? { ...f, name } : f))))
    await renameFolder(uid, id, name)
  }
  const removeFolder = async (id: string) => {
    if (!uid) return
    setFolders((prev) => prev.filter((f) => f.id !== id))
    setItems((prev) => prev.map((w) => (w.folderId === id ? { ...w, folderId: null } : w)))
    await deleteFolder(uid, id)
  }
  const moveWorkflow = async (wf: Workflow, folderId: string | null) => {
    if (!uid) return
    setItems((prev) => prev.map((w) => (w.id === wf.id ? { ...w, folderId } : w)))
    await setWorkflowFolder(uid, wf.id, folderId)
  }

  const folderSelect = (wf: Workflow) =>
    canEdit && folders.length > 0 ? (
      <select
        value={wf.folderId ?? ''}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation()
          void moveWorkflow(wf, e.target.value || null)
        }}
        className="text-[11px] bg-well border border-neutral-700 rounded px-1.5 py-1 text-neutral-300 max-w-[150px] cursor-pointer"
        aria-label={t('wf.folder')}
        title={t('wf.moveToFolder')}
      >
        <option value="">{t('wf.noFolder')}</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
    ) : null

  // Badge « CRON » (planification active) : cadence lisible, affiché sur la carte.
  const cronBadge = (wf: Workflow) => {
    const cron = findActiveCron(wf)
    if (!cron) return null
    return (
      <span
        title={t('wf.scheduled', { cron: describeCron(cron) })}
        className="inline-flex items-center gap-1 shrink-0 text-[10px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded px-1.5 py-0.5 whitespace-nowrap"
      >
        <Clock className="w-3 h-3" /> CRON · {describeCron(cron)}
      </span>
    )
  }
  // Tri : workflows planifiés (CRON actif) EN HAUT, le reste après (ordre d'origine stable).
  const cronFirst = (list: Workflow[]) => {
    const active = new Set(list.filter((w) => findActiveCron(w)).map((w) => w.id))
    return [...list].sort((a, b) => Number(active.has(b.id)) - Number(active.has(a.id)))
  }

  const card = (wf: Workflow) => (
    <li
      key={wf.id}
      className={
        viewMode === 'grid'
          ? 'bg-surface border border-neutral-800 rounded-lg p-4 hover:border-indigo-500 transition cursor-pointer'
          : 'bg-surface border border-neutral-800 rounded-md px-4 py-2.5 hover:border-indigo-500 transition cursor-pointer'
      }
      onClick={() => nav(`/workflows/${wf.id}`)}
    >
      {viewMode === 'grid' ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-medium truncate">{wf.name}</h2>
              {cronBadge(wf)}
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              {t('wf.counts', { nodes: wf.nodes.length, edges: wf.edges.length })}
            </p>
            <div className="mt-2">{folderSelect(wf)}</div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {canCreate && (
              <button
                onClick={(e) => { e.stopPropagation(); setTemplateFor(wf) }}
                className="text-neutral-500 hover:text-amber-400 p-1"
                aria-label={t('wf.saveAsTemplate')}
                title={t('wf.saveAsTemplate.help')}
              >
                <Star className="w-4 h-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); remove(wf.id) }}
                className="text-neutral-500 hover:text-red-400 p-1"
                aria-label={t('wf.delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <WorkflowIcon className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" />
            <h2 className="font-medium truncate">{wf.name}</h2>
            {cronBadge(wf)}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {folderSelect(wf)}
            <span className="text-xs text-neutral-500 tabular-nums">
              {t('wf.counts', { nodes: wf.nodes.length, edges: wf.edges.length })}
            </span>
            {canCreate && (
              <button
                onClick={(e) => { e.stopPropagation(); setTemplateFor(wf) }}
                className="text-neutral-500 hover:text-amber-400 p-1"
                aria-label={t('wf.saveAsTemplate')}
                title={t('wf.saveAsTemplate.help')}
              >
                <Star className="w-4 h-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); remove(wf.id) }}
                className="text-neutral-500 hover:text-red-400 p-1"
                aria-label={t('wf.delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )

  const cardList = (list: Workflow[]) => (
    <ul className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'flex flex-col gap-2'}>
      {cronFirst(list).map(card)}
    </ul>
  )

  const knownFolderIds = new Set(folders.map((f) => f.id))
  const ungrouped = items.filter((w) => !w.folderId || !knownFolderIds.has(w.folderId))

  const folderHeader = (folder: WorkflowFolder, count: number) => (
    <div className="flex items-center gap-2 mb-3">
      {renamingId === folder.id ? (
        <>
          <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveRename()
              if (e.key === 'Escape') setRenamingId(null)
            }}
            className="bg-well border border-neutral-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-indigo-500"
          />
          <button onClick={() => void saveRename()} className="p-1 text-emerald-400 hover:text-emerald-300" aria-label={t('wf.validate')}>
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => setRenamingId(null)} className="p-1 text-neutral-500 hover:text-white" aria-label={t('wf.cancel')}>
            <X className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => toggleFolder(folder.id)}
            className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity"
            aria-expanded={!collapsed.has(folder.id)}
            title={t(collapsed.has(folder.id) ? 'wf.expandFolder' : 'wf.collapseFolder')}
          >
            {collapsed.has(folder.id) ? (
              <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
            )}
            <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
            <h3 className="text-sm font-semibold text-white/90 truncate">{folder.name}</h3>
            <span className="text-xs text-neutral-500 tabular-nums">{count}</span>
          </button>
          {canEdit && (
            <button
              onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name) }}
              className="p-1 text-neutral-600 hover:text-white"
              aria-label={t('wf.renameFolder')}
              title={t('wf.rename')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => void removeFolder(folder.id)}
              className="p-1 text-neutral-600 hover:text-red-400"
              aria-label={t('wf.deleteFolder')}
              title={t('wf.deleteFolder.help')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  )

  const content = (
    <>
      <header className="sticky top-0 z-30 -mx-8 px-8 pt-8 pb-4 mb-4 bg-background border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!embedded && (
            <button
              onClick={() => nav('/dashboard')}
              className="p-2 rounded-md hover:bg-white/[0.05] text-neutral-400 hover:text-white transition-colors"
              aria-label={t('wf.backToDashboard')}
              title={t('wf.backToDashboard')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 data-tour="opt-wf-title" className="text-2xl font-semibold flex items-center gap-3">
            <WorkflowIcon className="w-6 h-6 text-indigo-400" />
            {t('wf.title')}
            <OptionHelp text={t('wf.help')} />
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-white'}`}
              aria-label={t('wf.gridView')}
              aria-pressed={viewMode === 'grid'}
              title={t('wf.thumbnails')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-white'}`}
              aria-label={t('wf.listView')}
              aria-pressed={viewMode === 'list'}
              title={t('wf.list')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {canCreate && (
            <button
              onClick={() => setNewFolderName('')}
              className="px-3 py-2 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2"
              title={t('wf.newFolder')}
            >
              <FolderPlus className="w-4 h-4" /> {t('wf.newFolder.label')}
            </button>
          )}
          {canCreate && (
            <button
              onClick={create}
              data-tour="opt-wf-new"
              className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> {t('wf.new')}
              <OptionHelp text={t('wf.new.help')} />
            </button>
          )}
        </div>
      </header>

      {/* Saisie inline du nom d'un nouveau dossier */}
      {newFolderName != null && (
        <div className="mb-6 flex items-center gap-2">
          <Folder className="w-4 h-4 text-indigo-400" />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addFolder()
              if (e.key === 'Escape') setNewFolderName(null)
            }}
            placeholder={t('wf.folderName')}
            className="bg-well border border-neutral-700 rounded px-2.5 py-1.5 text-sm text-white outline-none focus:border-indigo-500 w-64"
          />
          <button onClick={() => void addFolder()} className="px-2.5 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-sm">{t('wf.create')}</button>
          <button onClick={() => setNewFolderName(null)} className="px-2.5 py-1.5 rounded text-neutral-400 hover:text-white text-sm">{t('wf.cancel')}</button>
        </div>
      )}

      {/* Modèles créés par l'utilisateur (privés). Les modèles se créent depuis un
          workflow existant (bouton ⭐ sur chaque carte), plus depuis une galerie. */}
      {canCreate && uid && (
        <div data-wf-section="my-templates">
          <UserTemplatesSection
            key={templatesVersion}
            uid={uid}
            canEdit={canEdit}
            canDelete={canDelete}
            onUse={(t) => void createFromTemplate(t)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-neutral-400">{t('wf.loading')}</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-white/40">
          <WorkflowIcon className="w-16 h-16 opacity-20" aria-hidden="true" />
          <p className="text-lg font-medium text-white/30">{t('wf.empty')}</p>
          <p className="text-sm text-white/20">{t('wf.empty.hint')}</p>
          {canCreate && (
            <button
              onClick={create}
              className="mt-2 flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-[#fff] font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('wf.new')}
            </button>
          )}
        </div>
      ) : folders.length === 0 ? (
        cardList(items)
      ) : (
        <div className="space-y-7">
          {folders.map((folder) => {
            const gItems = items.filter((w) => w.folderId === folder.id)
            // Dossier vide : masqué pour qui ne peut pas le remplir. Un lecteur y
            // voyait une ligne inerte — voire un dossier dont TOUS les workflows
            // lui sont simplement inaccessibles. Celui qui peut créer ou classer
            // le garde : sans ça, un dossier qu'on vient de créer disparaîtrait
            // avant d'avoir pu y ranger quoi que ce soit.
            if (gItems.length === 0 && !canOrganise) return null
            return (
              <section key={folder.id}>
                {folderHeader(folder, gItems.length)}
                {!collapsed.has(folder.id) &&
                  (gItems.length > 0 ? (
                    cardList(gItems)
                  ) : (
                    <p className="text-xs text-neutral-600 italic pl-6">{t('wf.emptyFolder')}</p>
                  ))}
              </section>
            )
          })}
          {ungrouped.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-white/50 mb-3 flex items-center gap-2">
                {t('wf.noFolder')} <span className="text-xs text-neutral-500 tabular-nums">{ungrouped.length}</span>
              </h3>
              {cardList(ungrouped)}
            </section>
          )}
        </div>
      )}

      {templateFor && uid && (
        <SaveAsTemplateDialog
          workflow={templateFor}
          uid={uid}
          onClose={() => setTemplateFor(null)}
          onSaved={() => setTemplatesVersion((v) => v + 1)}
        />
      )}
    </>
  )

  if (embedded) {
    return (
      <main className="flex-1 p-8 overflow-auto" role="main" aria-label={t('wf.title')}>
        <div className="max-w-6xl mx-auto">{content}</div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-background text-white p-8">
      <div className="max-w-5xl mx-auto">{content}</div>
    </div>
  )
}
