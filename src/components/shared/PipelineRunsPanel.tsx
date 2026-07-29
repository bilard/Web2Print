// Viewer des runs de pipelines (enrichissement PIM, décomposition) — onglet
// Statistiques. Liste compacte + détail dépliable (étapes / erreur) : c'est
// l'« étage logs prod » du diagnostic, sans ouvrir la console Firestore.
import { useState } from 'react'
import { Activity, CheckCircle2, ChevronDown, ChevronRight, XCircle } from 'lucide-react'
import { usePipelineRuns, formatRunDuration, type PipelineRun } from '@/features/stats/usePipelineRuns'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

const MODULE_LABEL: Record<PipelineRun['module'], TranslationKey> = {
  enrichment: 'pipeline.module.enrichment',
  decompose: 'pipeline.module.decompose',
}

function RunRow({ run }: { run: PipelineRun }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const hasDetail = run.steps.length > 0 || !!run.error
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 text-left ${hasDetail ? 'hover:bg-white/[0.04] cursor-pointer' : 'cursor-default'}`}
      >
        {run.status === 'success'
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        <span className="px-1.5 py-px rounded bg-white/[0.06] text-[9px] uppercase tracking-wide text-white/40 shrink-0">
          {t(MODULE_LABEL[run.module])}
        </span>
        <span className="text-[11px] text-white/70 truncate flex-1">{run.label}</span>
        <span className="text-[10px] font-mono text-white/30 shrink-0">{formatRunDuration(run.durationMs)}</span>
        <span className="text-[10px] text-white/25 shrink-0 hidden sm:block">
          {new Date(run.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
        {hasDetail && (open
          ? <ChevronDown className="w-3 h-3 text-white/30 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-white/30 shrink-0" />)}
      </button>
      {open && (
        <div className="px-3 pb-2.5 flex flex-col gap-1.5">
          {run.error && (
            <div className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 break-words">
              {run.error}
            </div>
          )}
          {run.steps.length > 0 && (
            <pre className="text-[9px] leading-relaxed text-white/45 bg-well rounded px-2 py-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
              {run.steps.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function PipelineRunsPanel() {
  const { t } = useTranslation()
  const { data: runs, isLoading } = usePipelineRuns()
  const [showAll, setShowAll] = useState(false)

  return (
    <div className="bg-white/[0.03] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
          <Activity className="w-3 h-3" /> Runs des pipelines
        </div>
        {runs && runs.length > 0 && (
          <span className="text-[9px] text-white/20">
            {runs.filter((r) => r.status === 'error').length} échec(s) / {runs.length} runs
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="h-12 bg-white/5 rounded-lg animate-pulse" />
      ) : !runs || runs.length === 0 ? (
        <p className="text-[10px] text-white/25 italic">
          Aucun run enregistré — les enrichissements PIM et décompositions apparaîtront ici.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {(showAll ? runs : runs.slice(0, 8)).map((r) => <RunRow key={r.id} run={r} />)}
          </div>
          {runs.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="self-center text-[10px] text-white/40 hover:text-white/70 px-2 py-1"
            >
              {showAll ? t('pipelineRuns.collapse') : `Afficher les ${runs.length} runs`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
