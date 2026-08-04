import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { notify } from '@/lib/notify'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Play, Square, Sparkles, StepForward, Workflow as WorkflowIcon, BarChart3, BookmarkPlus, Check, Loader2, CircleDot, AlertTriangle } from 'lucide-react'
import { ReactFlowProvider } from '@xyflow/react'
import { getWorkflow, saveWorkflow } from '../persistence/workflowsApi'
import { useWorkflowStore, startAutosave } from '../persistence/workflow.store'
import { loadLatestRunStates } from '../persistence/runHistoryClient'
import { useRunContext, stepMiddleware } from '../runtime/runContext'
import { executeWorkflow } from '../runtime/executor'
import { validateWorkflow, type WorkflowIssue } from '../runtime/validateWorkflow'
import { RunPreflightDialog } from './RunPreflightDialog'
import { PreflightBanner } from './PreflightBanner'
import { useFocusNode } from './focusNodeStore'
import { notifyRunOutcome } from '../runtime/notifyRunOutcome'
import { recordAudit } from '@/lib/auditLog'
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
import { ReadOnlyWorkflowDialog } from './ReadOnlyWorkflowDialog'
import { PromptToFlowModal } from '../promptToFlow/PromptToFlowModal'
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog'
import { useCan } from '@/features/access/useAccess'
import { TourLauncher } from '@/features/tour/TourLauncher'
import { useTranslation, intlLocale } from '@/lib/i18n'

export function WorkflowEditorPage() {
  const { t, locale } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const uid = useWorkspaceUid()
  const wf = useWorkflowStore((s) => s.current)
  const setCurrent = useWorkflowStore((s) => s.setCurrent)
  const dirty = useWorkflowStore((s) => s.dirty)
  const saving = useWorkflowStore((s) => s.saving)
  const lastSavedAt = useWorkflowStore((s) => s.lastSavedAt)
  const isRunning = useRunContext((s) => s.isRunning)
  const pausedNodeId = useRunContext((s) => s.pausedNodeId)
  const canRun = useCan('workflows.run')
  const canEdit = useCan('workflows.edit')
  // ⚠️ `workflows.edit` seul, pas `create` : l'éditeur travaille TOUJOURS sur un
  // workflow déjà enregistré (la création se fait depuis la liste). C'est aussi
  // le droit qui conditionne le bouton « Enregistrer » — les deux doivent
  // s'accorder, sinon on annonce une sauvegarde possible sans bouton pour la faire.
  const canSave = canEdit
  // Alerte UNE fois par ouverture, au moment où l'utilisateur modifie quelque
  // chose : l'ouvrir dès l'arrivée interromprait une simple consultation.
  const [readOnlyWarned, setReadOnlyWarned] = useState(false)
  const [showReadOnly, setShowReadOnly] = useState(false)
  useEffect(() => {
    if (dirty && !canSave && !readOnlyWarned) {
      setShowReadOnly(true)
      setReadOnlyWarned(true)
    }
  }, [dirty, canSave, readOnlyWarned])
  const ac = useRunContext((s) => s.abortController)
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  // Contrôle de cohérence avant lancement : trous détectés + le mode de run demandé.
  // `inspectOnly` : ouvert depuis le bandeau, pas depuis « Lancer » → pas de bouton
  // « Lancer quand même », on vient seulement lire ce qui cloche.
  const [preflight, setPreflight] = useState<{ issues: WorkflowIssue[]; stepByStep: boolean; inspectOnly?: boolean } | null>(null)

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
    // Réhydrate l'aperçu de l'éditeur depuis le DERNIER run durable (workflowRuns) : sinon,
    // après un ⌘R, les cartes repartent « Sheet vide » alors que le run a bien produit des
    // données. `hydrateServerRun` ne fait rien si un run est déjà en cours (garde isRunning) ;
    // un écho serveur réellement plus récent reprend la main ensuite (cf. useServerRunLive).
    loadLatestRunStates(uid, id).then((latest) => {
      if (latest && !useRunContext.getState().isRunning) {
        useRunContext.getState().hydrateServerRun(latest.states, { reset: true })
      }
    })
    return () => setCurrent(null)
  }, [uid, id, setCurrent])

  useEffect(() => {
    if (!uid) return
    // ⚠️ Sans le droit d'enregistrer, l'enregistrement automatique repartait toutes
    // les 1,5 s : autant d'écritures refusées par le serveur, en boucle et sans
    // rien afficher. On ne le démarre pas — l'alerte s'en charge une seule fois.
    if (!canSave) return
    return startAutosave(uid)
  }, [uid, canSave])

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

  // Contrôle PERMANENT : les incohérences n'apparaissaient qu'au clic sur « Lancer », et
  // seulement s'il y en avait — un workflow mal câblé se signalait donc au pire moment,
  // ou jamais (run planifié, lancement depuis une carte). Recalculé à chaque édition.
  //
  // ⚠ DÉCLARÉ AVANT les retours anticipés (« Chargement… », « introuvable ») : un hook
  // posé après eux change le nombre de hooks entre deux rendus — React error #310.
  // D'où le `wf` optionnel géré ici plutôt qu'un appel plus bas.
  // ⚠ `validateWorkflow` FORGE ses messages : ils sont figés dans la langue du
  // calcul. Sans `locale` en dépendance, changer de langue laisse le bandeau et le
  // dialogue de pré-vol dans l'ancienne.
  const liveIssues = useMemo(
    () => (wf ? validateWorkflow(wf, (ty) => nodeRegistry.get(ty)) : []),
    [wf, locale],
  )
  const liveErrors = liveIssues.filter((i) => i.severity === 'error').length

  if (loading) return <div className="min-h-screen bg-background text-white p-8">{t('wfe.loading')}</div>
  if (!wf) return <div className="min-h-screen bg-background text-white p-8">{t('wfe.notFound')}</div>

  // Exécution effective (après contrôle de cohérence). Confirme le résultat.
  const executeNow = async (stepByStep: boolean) => {
    recordAudit({ action: 'workflow.run', module: 'workflows', targetId: wf.id, targetLabel: wf.name })
    // Panneau par défaut pendant le run : si le workflow a un node « Sites sources »,
    // on le sélectionne (ouvre son tableau d'activité live) SANS recadrer la vue.
    const sitesNode = wf.nodes.find((n) => n.type === 'source-sites')
    if (sitesNode) useFocusNode.getState().focus(sitesNode.id, { fit: false })
    const outcome = await executeWorkflow(wf, stepByStep ? { middleware: [stepMiddleware] } : {})
    notifyRunOutcome(outcome, wf.name)
  }
  // Lancement : contrôle de cohérence D'ABORD (sources / paramètres d'export manquants).
  // Un trou → popup pour corriger (ou forcer). Rien à signaler → on lance directement.
  // stepByStep = mode debug : pause avant chaque node jusqu'au clic « Étape suivante ».
  const run = async (stepByStep = false) => {
    const issues = validateWorkflow(wf, (t) => nodeRegistry.get(t))
    if (issues.length > 0) { setPreflight({ issues, stepByStep }); return }
    await executeNow(stepByStep)
  }
  const stop = () => ac?.abort()
  // Sauvegarde manuelle avec confirmation visuelle (succès / erreur).
  const saveNow = async () => {
    if (!uid) return
    // Sans le droit d'écrire, l'appel partirait quand même et reviendrait en
    // « Missing or insufficient permissions » : message illisible, et l'utilisateur
    // croit à une panne. On refuse ici, en expliquant.
    if (!canSave) {
      notify.error(t('wfe.readOnly.title'), t('wfe.readOnly.body'))
      return
    }
    try {
      await saveWorkflow(uid, wf)
      notify.success(t('wfe.saved'), `« ${wf.name} » a bien été sauvegardé.`)
    } catch (e) {
      notify.error("Échec de l'enregistrement", e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen bg-background text-white flex flex-col">
        <PreflightBanner
          issues={liveIssues}
          errors={liveErrors}
          onOpen={() => setPreflight({ issues: liveIssues, stepByStep: false, inspectOnly: true })}
        />
        <header className="border-b border-neutral-800 px-3 py-2 flex items-center gap-2">
          <button
            onClick={goToList}
            className="p-1.5 hover:bg-white/[0.06] text-white/40 hover:text-white/80 rounded-md transition-colors"
            aria-label={t('wfe.back')}
            title={t('wfe.back.esc')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <nav className="flex items-center gap-1.5 text-sm min-w-0 flex-1" aria-label={t('wfe.breadcrumb')}>
            <button
              onClick={goToList}
              className="flex items-center gap-1.5 text-white/45 hover:text-white/80 hover:bg-white/[0.06] px-2 py-1 rounded-md transition-colors shrink-0"
              title={t('wfe.back')}
            >
              <WorkflowIcon className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
              <span>Workflows</span>
            </button>
            <span className="text-white/20" aria-hidden="true">/</span>
            <input
              data-tour="wf-name"
              value={wf.name}
              onChange={(e) => useWorkflowStore.getState().patch({ name: e.target.value })}
              className="bg-transparent border-none outline-none text-sm flex-1 min-w-0 px-2 py-1 rounded-md hover:bg-white/[0.04] focus:bg-white/[0.04] transition-colors"
              aria-label={t('wfe.name')}
            />
          </nav>
          {/* État de sauvegarde CLAIR : en cours / non enregistré (ambre) / enregistré (vert). */}
          {saving ? (
            <span className="text-xs text-white/50 shrink-0 flex items-center gap-1.5" title={t('wfe.saving')}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('wfe.savingLabel')}
            </span>
          ) : !canSave ? (
            // ⚠️ Prime sur « non enregistré » : annoncer des modifications en attente
            // à quelqu'un qui ne pourra jamais les enregistrer est trompeur.
            <span className="text-xs text-amber-300 shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md border border-amber-400/30 bg-amber-500/[0.08]"
              title={t('wfe.readOnly.body')}>
              <AlertTriangle className="w-3.5 h-3.5" /> {t('wfe.readOnly.badge')}
            </span>
          ) : dirty ? (
            <span className="text-xs text-amber-400 shrink-0 flex items-center gap-1.5" title={t('wfe.unsaved')}>
              <CircleDot className="w-3.5 h-3.5" /> {t('wfe.unsaved.label')}
            </span>
          ) : (
            <span
              className="text-xs text-emerald-400 shrink-0 flex items-center gap-1.5"
              title={lastSavedAt ? t('wfe.savedAt', { time: new Date(lastSavedAt).toLocaleTimeString(intlLocale(locale)) }) : t('wfe.upToDate')}
            >
              <Check className="w-3.5 h-3.5" /> {t('wfe.savedShort')}
            </span>
          )}
          <button
            data-tour="wf-generate-ai"
            onClick={() => setShowGenerate(true)}
            className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2 text-sm"
            title={t('wfe.generateAi')}
          >
            <Sparkles className="w-4 h-4 text-indigo-400" /> {t('wfe.generateAi.label')}
          </button>
          <button
            data-tour="wf-results"
            onClick={() => nav(`/workflows/${wf.id}/result`)}
            className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2 text-sm"
            title={t('wfe.viewResult')}
          >
            <BarChart3 className="w-4 h-4 text-indigo-400" /> {t('wfe.result')}
          </button>
          {canEdit && (
            <button
              data-tour="wf-save-template"
              onClick={() => setShowSaveTemplate(true)}
              className="px-3 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/80 flex items-center gap-2 text-sm"
              title={t('wfe.saveTemplate')}
            >
              <BookmarkPlus className="w-4 h-4 text-indigo-400" /> {t('wfe.template')}
            </button>
          )}
          <WebhookPanel workflowId={wf.id} />
          {/* Le bloc de statut cron « absorbe » les contrôles de run (Pas à pas / Run,
              ou Étape / Stop en cours d'exécution) : passés en children, ils sont rendus
              À L'INTÉRIEUR de la bordure quand une planification est active, sinon nus. */}
          <CronStatusPanel workflowId={wf.id}>
            {isRunning ? (
              <>
                {pausedNodeId && (() => {
                  const pausedNode = wf.nodes.find((n) => n.id === pausedNodeId)
                  const psp = pausedNode ? nodeRegistry.get(pausedNode.type) : undefined
                  const label = psp ? t(psp.labelKey) : pausedNode?.type ?? '?'
                  return (
                    <button
                      onClick={() => useRunContext.getState().continueStep()}
                      className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-[#000] flex items-center gap-2 text-sm font-medium"
                      title={t('wfr.stepTitle', { node: label })}
                    >
                      <StepForward className="w-4 h-4" /> {t('wfr.stepLabel', { node: label })}
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
                    title={t('wfe.stepByStep')}
                  >
                    <StepForward className="w-4 h-4 text-amber-400" /> {t('wfe.stepByStep.label')}
                  </button>
                  <button data-tour="wf-run" onClick={() => void run()} className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2 text-sm">
                    <Play className="w-4 h-4" /> Run
                  </button>
                </>
              )
            )}
          </CronStatusPanel>
          {canEdit && (
            <button
              onClick={() => void saveNow()}
              className="p-2 hover:bg-neutral-800 rounded"
              aria-label="Save"
              title={t('wfe.save')}
            >
              <Save className="w-4 h-4" />
            </button>
          )}
        </header>
        {/* La console (RunPanel) vit SOUS le canevas, pas en pleine largeur : le panneau
            de droite (liste des concurrents « Sites sources ») garde ainsi toute la
            hauteur et s'affiche en entier — demande utilisateur. */}
        <div className="flex-1 flex overflow-hidden">
          <NodePalette />
          <div className="flex-1 flex flex-col min-w-0">
            <WorkflowEditor />
            <DataPreviewPanel />
            <RunPanel />
          </div>
          <NodeConfigPanel />
        </div>
      </div>
        <TourLauncher tourId="workflow" />
        {showReadOnly && <ReadOnlyWorkflowDialog onClose={() => setShowReadOnly(false)} />}
        {showGenerate && <PromptToFlowModal onClose={() => setShowGenerate(false)} />}
        {showSaveTemplate && uid && (
          <SaveAsTemplateDialog workflow={wf} uid={uid} onClose={() => setShowSaveTemplate(false)} />
        )}
        {preflight && (
          <RunPreflightDialog
            issues={preflight.issues}
            onCancel={() => setPreflight(null)}
            onProceed={preflight.inspectOnly ? undefined : () => { const s = preflight.stepByStep; setPreflight(null); void executeNow(s) }}
            onFocus={(nodeId) => { useFocusNode.getState().focus(nodeId); setPreflight(null) }}
          />
        )}
    </ReactFlowProvider>
  )
}
