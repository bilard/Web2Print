import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LayoutGrid, List, Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { listWorkflows, newWorkflow, saveWorkflow, deleteWorkflow } from './persistence/workflowsApi'
import type { Workflow } from './types'

interface WorkflowsPageProps {
  embedded?: boolean
}

type ViewMode = 'grid' | 'list'
const VIEW_MODE_KEY = 'workflows.viewMode'

export function WorkflowsPage({ embedded = false }: WorkflowsPageProps) {
  const uid = useAuthStore((s) => s.user?.uid)
  const nav = useNavigate()
  const [items, setItems] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY)
    return saved === 'list' ? 'list' : 'grid'
  })

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (!uid) return
    listWorkflows(uid).then((wfs) => {
      setItems(wfs)
      setLoading(false)
    })
  }, [uid])

  const create = async () => {
    if (!uid) return
    const wf = newWorkflow(uid)
    await saveWorkflow(uid, wf)
    nav(`/workflows/${wf.id}`)
  }
  const remove = async (id: string) => {
    if (!uid) return
    await deleteWorkflow(uid, id)
    setItems((prev) => prev.filter((w) => w.id !== id))
  }

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
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <WorkflowIcon className="w-6 h-6 text-indigo-400" />
            Workflows
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white/[0.08] text-white'
                  : 'text-neutral-500 hover:text-white'
              }`}
              aria-label="Vue vignettes"
              aria-pressed={viewMode === 'grid'}
              title="Vignettes"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-white/[0.08] text-white'
                  : 'text-neutral-500 hover:text-white'
              }`}
              aria-label="Vue liste"
              aria-pressed={viewMode === 'list'}
              title="Liste"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={create}
            className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nouveau workflow
          </button>
        </div>
      </header>
      {loading ? (
        <p className="text-neutral-400">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-white/40">
          <WorkflowIcon className="w-16 h-16 opacity-20" aria-hidden="true" />
          <p className="text-lg font-medium text-white/30">Aucun workflow</p>
          <p className="text-sm text-white/20">Créez-en un pour commencer</p>
          <button
            onClick={create}
            className="mt-2 flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Nouveau workflow
          </button>
        </div>
      ) : (
        <ul
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
              : 'flex flex-col gap-2'
          }
        >
          {items.map((wf) => (
            <li
              key={wf.id}
              className={
                viewMode === 'grid'
                  ? 'bg-[#1a1a1a] border border-neutral-800 rounded-lg p-4 hover:border-indigo-500 transition cursor-pointer'
                  : 'bg-[#1a1a1a] border border-neutral-800 rounded-md px-4 py-2.5 hover:border-indigo-500 transition cursor-pointer'
              }
              onClick={() => nav(`/workflows/${wf.id}`)}
            >
              {viewMode === 'grid' ? (
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-medium">{wf.name}</h2>
                    <p className="text-sm text-neutral-500 mt-1">
                      {wf.nodes.length} nodes · {wf.edges.length} liens
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(wf.id)
                    }}
                    className="text-neutral-500 hover:text-red-400 p-1"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <WorkflowIcon className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" />
                    <h2 className="font-medium truncate">{wf.name}</h2>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-neutral-500 tabular-nums">
                      {wf.nodes.length} nodes · {wf.edges.length} liens
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        remove(wf.id)
                      }}
                      className="text-neutral-500 hover:text-red-400 p-1"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
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
    <div className="min-h-screen bg-[#0f0f0f] text-white p-8">
      <div className="max-w-5xl mx-auto">{content}</div>
    </div>
  )
}
