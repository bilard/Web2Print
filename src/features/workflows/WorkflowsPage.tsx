import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, LayoutGrid, List, Plus, Trash2, Workflow as WorkflowIcon,
  Folder, FolderPlus, Pencil, Check, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import {
  listWorkflows, newWorkflow, saveWorkflow, deleteWorkflow, setWorkflowFolder,
  listFolders, createFolder, renameFolder, deleteFolder,
} from './persistence/workflowsApi'
import { useCan } from '@/features/access/useAccess'
import { OptionHelp } from '@/components/shared/OptionHelp'
import { WORKFLOW_TEMPLATES, workflowFromTemplate, type WorkflowTemplate } from './templates'
import { UserTemplatesSection } from './UserTemplatesSection'
import type { Workflow, WorkflowFolder } from './types'

interface WorkflowsPageProps {
  embedded?: boolean
}

type ViewMode = 'grid' | 'list'
const VIEW_MODE_KEY = 'workflows.viewMode'
const COLLAPSED_KEY = 'workflows.collapsedFolders'

export function WorkflowsPage({ embedded = false }: WorkflowsPageProps) {
  const uid = useAuthStore((s) => s.user?.uid)
  const nav = useNavigate()
  const canCreate = useCan('workflows.create')
  const canEdit = useCan('workflows.edit')
  const canDelete = useCan('workflows.delete')
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

  const create = async () => {
    if (!uid) return
    const wf = newWorkflow(uid)
    await saveWorkflow(uid, wf)
    nav(`/workflows/${wf.id}`)
  }
  const createFromTemplate = async (template: WorkflowTemplate) => {
    if (!uid) return
    const wf = workflowFromTemplate(template, uid)
    await saveWorkflow(uid, wf)
    nav(`/workflows/${wf.id}`)
  }
  const remove = async (id: string) => {
    if (!uid) return
    await deleteWorkflow(uid, id)
    setItems((prev) => prev.filter((w) => w.id !== id))
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
        aria-label="Dossier du workflow"
        title="Déplacer dans un dossier"
      >
        <option value="">Sans dossier</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
    ) : null

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
            <h2 className="font-medium truncate">{wf.name}</h2>
            <p className="text-sm text-neutral-500 mt-1">
              {wf.nodes.length} nodes · {wf.edges.length} liens
            </p>
            <div className="mt-2">{folderSelect(wf)}</div>
          </div>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); remove(wf.id) }}
              className="text-neutral-500 hover:text-red-400 p-1 shrink-0"
              aria-label="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <WorkflowIcon className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" />
            <h2 className="font-medium truncate">{wf.name}</h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {folderSelect(wf)}
            <span className="text-xs text-neutral-500 tabular-nums">
              {wf.nodes.length} nodes · {wf.edges.length} liens
            </span>
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); remove(wf.id) }}
                className="text-neutral-500 hover:text-red-400 p-1"
                aria-label="Supprimer"
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
      {list.map(card)}
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
          <button onClick={() => void saveRename()} className="p-1 text-emerald-400 hover:text-emerald-300" aria-label="Valider">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => setRenamingId(null)} className="p-1 text-neutral-500 hover:text-white" aria-label="Annuler">
            <X className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => toggleFolder(folder.id)}
            className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity"
            aria-expanded={!collapsed.has(folder.id)}
            title={collapsed.has(folder.id) ? 'Déplier le dossier' : 'Replier le dossier'}
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
              aria-label="Renommer le dossier"
              title="Renommer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => void removeFolder(folder.id)}
              className="p-1 text-neutral-600 hover:text-red-400"
              aria-label="Supprimer le dossier"
              title="Supprimer le dossier (les workflows sont conservés, sans dossier)"
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
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          {!embedded && (
            <button
              onClick={() => nav('/dashboard')}
              className="p-2 rounded-md hover:bg-white/[0.05] text-neutral-400 hover:text-white transition-colors"
              aria-label="Retour au dashboard"
              title="Retour au dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 data-tour="opt-wf-title" className="text-2xl font-semibold flex items-center gap-3">
            <WorkflowIcon className="w-6 h-6 text-indigo-400" />
            Workflows
            <OptionHelp text="Automatisez l'enchaînement des modules (scraping → décomposition → export → Drive/Gmail/Telegram), façon Zapier. Un workflow peut être généré par IA depuis un prompt." />
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-white'}`}
              aria-label="Vue vignettes"
              aria-pressed={viewMode === 'grid'}
              title="Vignettes"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-white'}`}
              aria-label="Vue liste"
              aria-pressed={viewMode === 'list'}
              title="Liste"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {canCreate && (
            <button
              onClick={() => setNewFolderName('')}
              className="px-3 py-2 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2"
              title="Créer un dossier pour regrouper des workflows"
            >
              <FolderPlus className="w-4 h-4" /> Nouveau dossier
            </button>
          )}
          {canCreate && (
            <button
              onClick={create}
              data-tour="opt-wf-new"
              className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Nouveau workflow
              <OptionHelp text="Crée un workflow vierge et ouvre l'éditeur de graphe. Vous pourrez y ajouter des nodes ou le générer par IA." />
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
            placeholder="Nom du dossier…"
            className="bg-well border border-neutral-700 rounded px-2.5 py-1.5 text-sm text-white outline-none focus:border-indigo-500 w-64"
          />
          <button onClick={() => void addFolder()} className="px-2.5 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-sm">Créer</button>
          <button onClick={() => setNewFolderName(null)} className="px-2.5 py-1.5 rounded text-neutral-400 hover:text-white text-sm">Annuler</button>
        </div>
      )}

      {/* Galerie de recettes prêtes à l'emploi */}
      {canCreate && (
        <section className="mb-8" aria-label="Modèles de workflows">
          <h2 className="text-[11px] uppercase tracking-wider text-white/30 mb-3">
            Démarrer depuis un modèle
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {WORKFLOW_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => void createFromTemplate(t)}
                className="text-left bg-surface border border-white/[0.06] rounded-lg p-3.5 hover:border-indigo-500/60 hover:bg-white/[0.02] transition-colors group"
              >
                <div className="text-xl mb-2" aria-hidden="true">{t.emoji}</div>
                <div className="text-[13px] font-medium text-white/80 group-hover:text-white">{t.name}</div>
                <p className="text-[11px] text-white/35 mt-1 leading-snug">{t.description}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Modèles créés par l'utilisateur (privés) */}
      {canCreate && uid && (
        <UserTemplatesSection
          uid={uid}
          canEdit={canEdit}
          canDelete={canDelete}
          onUse={(t) => void createFromTemplate(t)}
        />
      )}

      {loading ? (
        <p className="text-neutral-400">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-white/40">
          <WorkflowIcon className="w-16 h-16 opacity-20" aria-hidden="true" />
          <p className="text-lg font-medium text-white/30">Aucun workflow</p>
          <p className="text-sm text-white/20">Créez-en un pour commencer</p>
          {canCreate && (
            <button
              onClick={create}
              className="mt-2 flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-[#fff] font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Nouveau workflow
            </button>
          )}
        </div>
      ) : folders.length === 0 ? (
        cardList(items)
      ) : (
        <div className="space-y-7">
          {folders.map((folder) => {
            const gItems = items.filter((w) => w.folderId === folder.id)
            return (
              <section key={folder.id}>
                {folderHeader(folder, gItems.length)}
                {!collapsed.has(folder.id) &&
                  (gItems.length > 0 ? (
                    cardList(gItems)
                  ) : (
                    <p className="text-xs text-neutral-600 italic pl-6">Dossier vide — affectez des workflows via leur menu « Dossier ».</p>
                  ))}
              </section>
            )
          })}
          {ungrouped.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-white/50 mb-3 flex items-center gap-2">
                Sans dossier <span className="text-xs text-neutral-500 tabular-nums">{ungrouped.length}</span>
              </h3>
              {cardList(ungrouped)}
            </section>
          )}
        </div>
      )}
    </>
  )

  if (embedded) {
    return (
      <main className="flex-1 p-8 overflow-auto" role="main" aria-label="Workflows">
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
