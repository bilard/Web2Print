// src/features/workflows/editor/WorkflowEditorPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Play, Square } from 'lucide-react'
import { ReactFlowProvider } from '@xyflow/react'
import { useAuthStore } from '@/stores/auth.store'
import { getWorkflow, saveWorkflow } from '../persistence/workflowsApi'
import { useWorkflowStore, startAutosave } from '../persistence/workflow.store'
import { useRunContext } from '../runtime/runContext'
import { executeWorkflow } from '../runtime/executor'
import { initWorkflowsRegistry } from '../registry/builtin'
import { WorkflowEditor } from './WorkflowEditor'
import { NodePalette } from './NodePalette'
import { NodeConfigPanel } from './NodeConfigPanel'
import { RunPanel } from './RunPanel'
import { DataPreviewPanel } from './DataPreviewPanel'

export function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const uid = useAuthStore((s) => s.user?.uid)
  const wf = useWorkflowStore((s) => s.current)
  const setCurrent = useWorkflowStore((s) => s.setCurrent)
  const dirty = useWorkflowStore((s) => s.dirty)
  const isRunning = useRunContext((s) => s.isRunning)
  const ac = useRunContext((s) => s.abortController)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initWorkflowsRegistry()
  }, [])

  useEffect(() => {
    if (!uid || !id) return
    setLoading(true)
    getWorkflow(uid, id).then((w) => {
      setCurrent(w)
      setLoading(false)
    })
    return () => setCurrent(null)
  }, [uid, id, setCurrent])

  useEffect(() => {
    if (!uid) return
    return startAutosave(uid)
  }, [uid])

  if (loading) return <div className="min-h-screen bg-[#0f0f0f] text-white p-8">Chargement…</div>
  if (!wf) return <div className="min-h-screen bg-[#0f0f0f] text-white p-8">Workflow introuvable</div>

  const run = () => executeWorkflow(wf)
  const stop = () => ac?.abort()

  return (
    <ReactFlowProvider>
      <div className="h-screen bg-[#0f0f0f] text-white flex flex-col">
        <header className="border-b border-neutral-800 px-4 py-2 flex items-center gap-3">
          <button onClick={() => nav('/workflows')} className="p-2 hover:bg-neutral-800 rounded">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <input
            value={wf.name}
            onChange={(e) => useWorkflowStore.getState().patch({ name: e.target.value })}
            className="bg-transparent border-none outline-none text-sm flex-1"
          />
          <span className="text-xs text-neutral-500">{dirty ? 'Modifications…' : 'Enregistré'}</span>
          {isRunning ? (
            <button onClick={stop} className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 flex items-center gap-2 text-sm">
              <Square className="w-4 h-4" /> Stop
            </button>
          ) : (
            <button onClick={run} className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2 text-sm">
              <Play className="w-4 h-4" /> Run
            </button>
          )}
          <button
            onClick={() => uid && saveWorkflow(uid, wf)}
            className="p-2 hover:bg-neutral-800 rounded"
            aria-label="Save"
          >
            <Save className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 flex overflow-hidden">
          <NodePalette />
          <div className="flex-1 flex flex-col min-w-0">
            <WorkflowEditor />
            <DataPreviewPanel />
          </div>
          <NodeConfigPanel />
        </div>
        <RunPanel />
      </div>
    </ReactFlowProvider>
  )
}
