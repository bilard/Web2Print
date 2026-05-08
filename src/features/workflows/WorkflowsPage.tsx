import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { listWorkflows, newWorkflow, saveWorkflow, deleteWorkflow } from './persistence/workflowsApi'
import type { Workflow } from './types'

export function WorkflowsPage() {
  const uid = useAuthStore((s) => s.user?.uid)
  const nav = useNavigate()
  const [items, setItems] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            <WorkflowIcon className="w-6 h-6 text-indigo-400" />
            Workflows
          </h1>
          <button
            onClick={create}
            className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nouveau workflow
          </button>
        </header>
        {loading ? (
          <p className="text-neutral-400">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-neutral-400">Aucun workflow. Créez-en un pour commencer.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((wf) => (
              <li
                key={wf.id}
                className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-4 hover:border-indigo-500 transition cursor-pointer"
                onClick={() => nav(`/workflows/${wf.id}`)}
              >
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
