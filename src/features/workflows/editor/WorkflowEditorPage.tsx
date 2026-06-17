// src/features/workflows/editor/WorkflowEditorPage.tsx
import { useCallback, useEffect, useState } from 'react'
import { notify } from '@/lib/notify'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Play, Square, Sparkles, StepForward, Workflow as WorkflowIcon, BarChart3, BookmarkPlus } from 'lucide-react'
import { ReactFlowProvider } from '@xyflow/react'
import { useAuthStore } from '@/stores/auth.store'
import { getWorkflow, saveWorkflow } from '../persistence/workflowsApi'
import { useWorkflowStore, startAutosave } from '../persistence/workflow.store'
import { useRunContext, stepMiddleware } from '../runtime/runContext'
import { executeWorkflow } from '../runtime/executor'
import { notifyRunOutcome } from '../runtime/notifyRunOutcome'
import { nodeRegistry } from '../registry'
import { initWorkflowsRegistry } from '../registry/builtin'
import { WorkflowEditor } from './WorkflowEditor'
import { NodePalette } from './NodePalette'
import { NodeConfigPanel } from './NodeConfigPanel'
import { RunPanel } from './RunPanel'
import { DataPreviewPanel } from './DataPreviewPanel'
import { CronStatusPanel } from './CronStatusPanel'
import { useServerRunLive } from '../runtime/useServerRunLive'
import { WebhookPanel } from './WebhookPanel'
import { PromptToFlowModal } from '../promptToFlow/PromptToFlowModal'
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog'
import { useCan } from '@/features/access/useAccess'

export function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const uid = useAuthStore((s) => s.user?.uid)
  const wf = useWorkflowStore((s) => s.current)
  const setCurrent = useWorkflowStore((s) => s.setCurrent)
  const dirty = useWorkflowStore((s) => s.dirty)
  const isRunning = useRunContext((s) => s.isRunning)
  const pausedNodeId = useRunContext((s) => s.pausedNodeId)
  const canRun = useCan('workflows.run')
  const canEdit = useCan('workflows.edit')
  const ac = useRunContext((s) => s.abortController)
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)

  // Affiche sur les cartes l'état des runs SERVEUR (cron / « Lancer serveur »).
  useServerRunLive(wf?.id)

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

  if (loading) return <div className="min-h-screen bg-background text-white p-8">Chargement…</div>
  if (!wf) return <div className="min-h-screen bg-background text-white p-8">Workflow introuvable</div>

  // Exécute le workflow puis confirme le résultat : succès / avertissement / erreur.
  // stepByStep = mode debug : pause avant chaque node jusqu'au clic « Étape suivante ».
  const run = async (stepByStep = false) => {
    const outcome = await executeWorkflow(wf, stepByStep ? { middleware: [stepMiddleware] } : {})
    notifyRunOutcome(outcome, wf.name)
  }
  const stop = () => ac?.abort()
  // Sauvegarde manuelle avec confirmation visuelle (succès / erreur).
  const saveNow = async () => {
    if (!uid) return
    try {
      await saveWorkflow(uid, wf)
      notify.success('Workflow enregistré', `« ${wf.name} » a bien été sauvegardé.`)
    } catch (e) {
      notify.error("Échec de l'enregistrement", e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen bg-background text-white flex flex-col">
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
          <button
            onClick={() => nav(`/workflows/${wf.id}/result`)}
            className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2 text-sm"
            title="Visualiser le résultat du dernier run"
          >
            <BarChart3 className="w-4 h-4 text-indigo-400" /> Résultat
          </button>
          {canEdit && (
            <button
              onClick={() => setShowSaveTemplate(true)}
              className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2 text-sm"
              title="Enregistrer ce montage comme modèle réutilisable"
            >
              <BookmarkPlus className="w-4 h-4 text-indigo-400" /> Modèle
            </button>
          )}
          <WebhookPanel workflowId={wf.id} />
          <CronStatusPanel workflowId={wf.id} />
          {isRunning ? (
            <>
              {pausedNodeId && (() => {
                const pausedNode = wf.nodes.find((n) => n.id === pausedNodeId)
                const label = pausedNode ? nodeRegistry.get(pausedNode.type)?.label ?? pausedNode.type : '?'
                return (
                  <button
                    onClick={() => useRunContext.getState().continueStep()}
                    className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-[#000] flex items-center gap-2 text-sm font-medium"
                    title={`En pause avant « ${label} » — cliquer pour exécuter ce node`}
                  >
                    <StepForward className="w-4 h-4" /> Étape : {label}
                  </button>
                )
              })()}
              <button onClick={stop} className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 flex items-center gap-2 text-sm">
                <Square className="w-4 h-4" /> Stop
              </button>
            </>
          ) : (
            canRun && (
              <>
                <button
                  onClick={() => void run(true)}
                  className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2 text-sm"
                  title="Exécuter node par node : pause avant chaque étape pour inspecter les sorties"
                >
                  <StepForward className="w-4 h-4 text-amber-400" /> Pas à pas
                </button>
                <button onClick={() => void run()} className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2 text-sm">
                  <Play className="w-4 h-4" /> Run
                </button>
              </>
            )
          )}
          {canEdit && (
            <button
              onClick={() => void saveNow()}
              className="p-2 hover:bg-neutral-800 rounded"
              aria-label="Save"
              title="Enregistrer le workflow"
            >
              <Save className="w-4 h-4" />
            </button>
          )}
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
        {showSaveTemplate && uid && (
          <SaveAsTemplateDialog workflow={wf} uid={uid} onClose={() => setShowSaveTemplate(false)} />
        )}
    </ReactFlowProvider>
  )
}
