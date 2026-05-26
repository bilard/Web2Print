// src/features/workflows/editor/WorkflowEditorPage.tsx
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Play, Square, Sparkles, Workflow as WorkflowIcon } from 'lucide-react'
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
import { PromptToFlowModal } from '../promptToFlow/PromptToFlowModal'

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
  const [showGenerate, setShowGenerate] = useState(false)

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

  const goToList = useCallback(() => {
    nav('/dashboard', { state: { section: 'workflows' } })
  }, [nav])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Modal « Générer (IA) » ouvert : Escape le ferme au lieu de quitter l'éditeur.
      if (showGenerate) { setShowGenerate(false); return }
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const editable = target?.isContentEditable
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return
      goToList()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goToList, showGenerate])

  if (loading) return <div className="min-h-screen bg-[#0f0f0f] text-white p-8">Chargement…</div>
  if (!wf) return <div className="min-h-screen bg-[#0f0f0f] text-white p-8">Workflow introuvable</div>

  // Exécute le workflow puis confirme le résultat : succès / avertissement / erreur.
  const run = async () => {
    await executeWorkflow(wf)
    const states = Object.values(useRunContext.getState().nodeStates)
    const errors = states.filter((s) => s.status === 'error')
    const ok = states.filter((s) => s.status === 'success').length
    const firstWarn = states
      .filter((s) => s.status === 'success')
      .flatMap((s) => s.logs ?? [])
      .find((l) => l.level === 'warn')
    if (errors.length > 0) {
      toast.error(`Workflow : ${errors.length} node(s) en erreur — ${errors[0].error ?? 'voir les logs'}`.slice(0, 180))
    } else if (firstWarn) {
      toast.warning(`Workflow terminé avec avertissement — ${firstWarn.msg}`.slice(0, 200))
    } else {
      toast.success(`Workflow terminé — ${ok} node(s) exécuté(s).`)
    }
  }
  const stop = () => ac?.abort()

  return (
    <ReactFlowProvider>
      <div className="h-screen bg-[#0f0f0f] text-white flex flex-col">
        <header className="border-b border-neutral-800 px-3 py-2 flex items-center gap-2">
          <button
            onClick={goToList}
            className="p-1.5 hover:bg-white/[0.06] text-white/40 hover:text-white/80 rounded-md transition-colors"
            aria-label="Retour aux workflows"
            title="Retour aux workflows (Esc)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <nav className="flex items-center gap-1.5 text-sm min-w-0 flex-1" aria-label="Fil d'Ariane">
            <button
              onClick={goToList}
              className="flex items-center gap-1.5 text-white/45 hover:text-white/80 hover:bg-white/[0.06] px-2 py-1 rounded-md transition-colors shrink-0"
              title="Retour aux workflows"
            >
              <WorkflowIcon className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
              <span>Workflows</span>
            </button>
            <span className="text-white/20" aria-hidden="true">/</span>
            <input
              value={wf.name}
              onChange={(e) => useWorkflowStore.getState().patch({ name: e.target.value })}
              className="bg-transparent border-none outline-none text-sm flex-1 min-w-0 px-2 py-1 rounded-md hover:bg-white/[0.04] focus:bg-white/[0.04] transition-colors"
              aria-label="Nom du workflow"
            />
          </nav>
          <span className="text-xs text-neutral-500 shrink-0">{dirty ? 'Modifications…' : 'Enregistré'}</span>
          <button
            onClick={() => setShowGenerate(true)}
            className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2 text-sm"
            title="Générer un workflow depuis un prompt (IA)"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" /> Générer (IA)
          </button>
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
        {showGenerate && <PromptToFlowModal onClose={() => setShowGenerate(false)} />}
    </ReactFlowProvider>
  )
}
