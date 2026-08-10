// Actions du suivi : lancer, arrêter, suspendre, reprendre ce qui reste — sans quitter
// l'écran. Les opérations vivent dans radarScheduleActions.ts (PWA mobile, clefées par le
// WORKFLOW) ; on ne fait qu'orchestrer leur appel ici.
// ⚠ La permission `priceWatch.opsAct` se vérifie ICI, pas seulement sur l'entrée de menu :
// masquer un bouton n'interdit rien, l'intent (palette, URL) contourne le rendu — d'où la
// garde répétée dans `guard` et dans le gestionnaire d'intent.
import { useEffect, useState } from 'react'
import { Play, Square, PauseCircle, RotateCcw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getWorkflow } from '@/features/workflows/persistence/workflowsApi'
import { runWorkflowNow, stopServerRun, suspendWorkflow } from '../radar/radarScheduleActions'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCan } from '@/features/access/useAccess'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import type { RunView } from './buildWatchOps'
import { duration } from '../dashboard/format'
import { useTranslation } from '@/lib/i18n'

type Kind = 'run' | 'stop' | 'suspend' | 'resume'
type ResumeState = 'loading' | 'ready' | 'noNode' | 'off' | 'error' | 'noWorkflow'

function Btn({ onClick, busy, disabled, title, icon: Icon, tone, children }: {
  onClick: () => void; busy: boolean; disabled?: boolean; title?: string
  icon: typeof Play; tone: 'go' | 'stop' | 'warn' | 'neutral'; children: React.ReactNode
}) {
  const tones: Record<typeof tone, string> = {
    go: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25',
    stop: 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25',
    warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25',
    neutral: 'bg-well text-white/70 border-white/10 hover:bg-white/10',
  }
  return (
    <button onClick={onClick} disabled={disabled || busy} title={title}
      className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 border disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]}`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {children}
    </button>
  )
}

export function OpsActions({ workflowId, run }: { workflowId: string | null; run: RunView | null }) {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const canAct = useCan('priceWatch.opsAct')
  const [busy, setBusy] = useState<Kind | null>(null)
  const [resumeState, setResumeState] = useState<ResumeState>('loading')

  // Présence du node « Textes » dans CE flux. ⚠ Un échec de lecture reste EXPLICITE
  // (`error`), jamais confondu avec `loading` — un bouton grisé sans raison est une énigme.
  useEffect(() => {
    if (!uid || !workflowId) { setResumeState('noWorkflow'); return }
    let alive = true
    setResumeState('loading')
    getWorkflow(uid, workflowId).then((wf) => {
      if (!alive) return
      const node = wf?.nodes.find((n) => n.type === 'text-enrich')
      if (!node) { setResumeState('noNode'); return }
      setResumeState((node.config as { incremental?: boolean } | undefined)?.incremental === false ? 'off' : 'ready')
    }).catch(() => { if (alive) setResumeState('error') })
    return () => { alive = false }
  }, [uid, workflowId])
  const guard = (kind: Kind, fn: () => Promise<void>) => {
    if (!canAct) return
    if (!uid || !workflowId) { toast.error(t('ops.actions.noWorkflow')); return }
    setBusy(kind)
    fn().catch((e) => toast.error(e instanceof Error ? e.message : t('ops.actions.failed')))
      .finally(() => setBusy(null))
  }
  const onRun = () => guard('run', async () => {
    const r = await runWorkflowNow(workflowId!)
    toast[r.errorCount > 0 ? 'warning' : 'success'](
      t(r.errorCount > 0 ? 'ops.actions.run.errors' : 'ops.actions.run.ok', { nodes: r.nodeCount, errors: r.errorCount }))
  })
  const onStop = () => {
    if (!window.confirm(t('ops.actions.stop.confirm', { duration: duration(run?.elapsedMs ?? 0) }))) return
    guard('stop', async () => { await stopServerRun(uid!, workflowId!); toast.info(t('ops.actions.stop.done')) })
  }
  const onSuspend = () => {
    if (!window.confirm(t('ops.actions.suspend.confirm'))) return
    guard('suspend', async () => {
      const done = await suspendWorkflow(uid!, workflowId!)
      if (done) toast.success(t('ops.actions.suspend.done'))
      else toast.info(t('ops.actions.suspend.noCron'))
    })
  }
  const onResume = () => guard('resume', async () => {
    const r = await runWorkflowNow(workflowId!)
    toast.success(t('ops.actions.resume.ok', { nodes: r.nodeCount }))
  })
  // Déclenchable sans passer par le bouton : `guard` revérifie `canAct` à l'exécution.
  useModuleIntent('watch-ops', (action) => {
    if (action === 'action:run') onRun()
    else if (action === 'action:stop' && run?.alive) onStop()
    else if (action === 'action:suspend') onSuspend()
    else if (action === 'action:resume' && resumeState === 'ready' && !run?.alive) onResume()
  })
  if (!canAct) return null
  // Chaque état grisé porte SA raison — jamais un bouton mort sans explication.
  const resumeReason = run?.alive ? t('ops.actions.resume.running')
    : resumeState === 'loading' ? t('ops.actions.resume.loading')
    : resumeState === 'noWorkflow' ? t('ops.actions.noWorkflow')
    : resumeState === 'error' ? t('ops.actions.resume.error')
    : resumeState === 'noNode' ? t('ops.actions.resume.noNode')
    : resumeState === 'off' ? t('ops.actions.resume.off') : undefined

  return (
    <div className="flex flex-wrap items-center gap-2" data-pw-section="ops-actions">
      {run?.alive ? (
        <Btn onClick={onStop} busy={busy === 'stop'} icon={Square} tone="stop">{t('ops.actions.stop')}</Btn>
      ) : (
        <Btn onClick={onRun} busy={busy === 'run'} icon={Play} tone="go">{t('ops.actions.run')}</Btn>
      )}
      <Btn onClick={onSuspend} busy={busy === 'suspend'} icon={PauseCircle} tone="warn">{t('ops.actions.suspend')}</Btn>
      <Btn onClick={onResume} busy={busy === 'resume'} disabled={resumeState !== 'ready' || !!run?.alive} title={resumeReason}
        icon={RotateCcw} tone="neutral">
        {t('ops.actions.resume')}
      </Btn>
    </div>
  )
}
