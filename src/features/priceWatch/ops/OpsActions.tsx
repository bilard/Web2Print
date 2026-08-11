// Actions du suivi : lancer, arrêter, suspendre — sans quitter l'écran. Les opérations
// vivent dans radarScheduleActions.ts (PWA mobile, clefées par le WORKFLOW) ; on ne fait
// qu'orchestrer leur appel ici.
//
// ⚠ TROIS boutons, plus quatre. « Relancer ce qui reste » appelait exactement le même
// `runWorkflowNow(workflowId)` que « Lancer (serveur) » — aucun drapeau de reprise n'était
// transmis nulle part, et il ne s'activait que lorsque la carte « Textes » était DÉJÀ
// réglée en reprise incrémentale, cas où un lancement normal ne refait déjà que le reste.
// Un doublon, donc, qui occupait la place en laissant croire à une action distincte. Ce
// qu'il apportait vraiment — savoir ce qu'un lancement va faire — est désormais DIT, par
// la phrase sous les boutons.
// ⚠ La permission `priceWatch.opsAct` se vérifie ICI, pas seulement sur l'entrée de menu :
// masquer un bouton n'interdit rien, l'intent (palette, URL) contourne le rendu — d'où la
// garde répétée dans `guard` et dans le gestionnaire d'intent.
import { useState } from 'react'
import { Play, Square, PauseCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { runWorkflowNow, stopServerRun, suspendWorkflow } from '../radar/radarScheduleActions'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCan } from '@/features/access/useAccess'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { OpsConfirm } from './OpsConfirm'
import { resumeModeKey } from './opsFormat'
import type { ResumeMode } from './opsTypes'
import type { RunView } from './buildWatchOps'
import { duration } from '../dashboard/format'
import { useTranslation } from '@/lib/i18n'

type Kind = 'run' | 'stop' | 'suspend'
type ConfirmKind = 'stop' | 'suspend'

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

export function OpsActions({ workflowId, run, resumeMode }: {
  workflowId: string | null; run: RunView | null
  /** Lu une fois par l'écran, avec le plafond de la même carte — deux lectures du flux
   *  pour les deux réglages de la MÊME carte n'auraient rien apporté. */
  resumeMode: ResumeMode
}) {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const canAct = useCan('priceWatch.opsAct')
  const [busy, setBusy] = useState<Kind | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)
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
  // Le CLIC/l'intent n'ouvre que la confirmation — l'action réelle attend `onConfirm`.
  const doStop = () => guard('stop', async () => { await stopServerRun(uid!, workflowId!); toast.info(t('ops.actions.stop.done')) })
  const doSuspend = () => guard('suspend', async () => {
    const done = await suspendWorkflow(uid!, workflowId!)
    if (done) toast.success(t('ops.actions.suspend.done'))
    else toast.info(t('ops.actions.suspend.noCron'))
  })
  const onConfirm = () => {
    const kind = confirmKind
    setConfirmKind(null)
    if (kind === 'stop') doStop()
    else if (kind === 'suspend') doSuspend()
  }
  // Déclenchable sans passer par le bouton : `guard` revérifie `canAct` à l'exécution, et
  // l'intent ouvre la MÊME confirmation qu'un clic — jamais un contournement silencieux.
  useModuleIntent('watch-ops', (action) => {
    if (action === 'action:run') onRun()
    else if (action === 'action:stop' && run?.alive) setConfirmKind('stop')
    else if (action === 'action:suspend') setConfirmKind('suspend')
  })
  if (!canAct) return null
  const resumeKey = resumeModeKey(resumeMode)

  return (
    <div className="space-y-2" data-pw-section="ops-actions">
      <div className="flex flex-wrap items-center gap-2">
        {run?.alive ? (
          <Btn onClick={() => setConfirmKind('stop')} busy={busy === 'stop'} icon={Square} tone="stop">{t('ops.actions.stop')}</Btn>
        ) : (
          <Btn onClick={onRun} busy={busy === 'run'} icon={Play} tone="go">{t('ops.actions.run')}</Btn>
        )}
        <Btn onClick={() => setConfirmKind('suspend')} busy={busy === 'suspend'} icon={PauseCircle} tone="warn">{t('ops.actions.suspend')}</Btn>
      </div>
      {/* Ce qu'un lancement fera, dit AVANT de cliquer — le réglage vit sur la carte
          « Textes » du flux et décidait jusqu'ici en silence. */}
      {resumeKey && <p className="text-xs text-white/45">{t(resumeKey)}</p>}
      <OpsConfirm
        open={confirmKind !== null}
        onOpenChange={(o) => { if (!o) setConfirmKind(null) }}
        title={confirmKind === 'stop' ? t('ops.actions.stop.confirmTitle') : t('ops.actions.suspend.confirmTitle')}
        description={confirmKind === 'stop'
          ? t('ops.actions.stop.confirm', { duration: duration(run?.elapsedMs ?? 0) })
          : t('ops.actions.suspend.confirm')}
        actionLabel={confirmKind === 'stop' ? t('ops.actions.stop') : t('ops.actions.suspend')}
        onConfirm={onConfirm}
      />
    </div>
  )
}
