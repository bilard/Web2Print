import { Check, Loader2, AlertTriangle, Sparkles, X } from 'lucide-react'
import type { Step, FailableStep } from './useGenerateDesign'
import type { DesignResult } from './types'

interface Props {
  step: Step
  progress: string
  error: string | null
  failedStep: FailableStep | null
  lastResult: DesignResult | null
  /** Image Nano Banana, affichée en preview dans la modale comme référence visuelle. */
  nanobananaRef?: string | null
  onClose: () => void
  onRetry: () => void
}

interface StepDef {
  id: FailableStep
  agent: string
  role: string
  description: string
}

const PIPELINE: StepDef[] = [
  {
    id: 'illustrating',
    agent: 'Nano Banana',
    role: 'Référence visuelle',
    description: 'Génère l\'image cible à partir du brief. Sert uniquement de référence — jamais posée sur le canvas.',
  },
  {
    id: 'analyzing',
    agent: 'Traitement',
    role: 'Vectorisation complète',
    description: 'Décompose l\'image en éléments vectoriels : fond, formes décoratives, textes, zones image.',
  },
  {
    id: 'rendering',
    agent: 'Canvas',
    role: 'Reconstruction vectorielle',
    description: 'Rebuild 100% vectoriel : fond + formes + textes + slots image — tous les éléments éditables.',
  },
]

const HEADER_ICON = {
  done: <Check className="w-4 h-4 text-emerald-400" />,
  error: <AlertTriangle className="w-4 h-4 text-red-400" />,
  running: <Sparkles className="w-4 h-4 text-indigo-400" />,
}
const HEADER_TITLE = {
  done: 'Design généré',
  error: 'Génération échouée',
  running: 'Génération en cours…',
}

function computeCurrentIdx(step: Step, failedStep: FailableStep | null): number {
  if (step === 'done') return PIPELINE.length
  if (step === 'error') {
    const idx = PIPELINE.findIndex((p) => p.id === (failedStep ?? 'illustrating'))
    return Math.max(0, idx)
  }
  return Math.max(0, PIPELINE.findIndex((p) => p.id === step))
}

function StepStatusIcon({ state, index }: { state: 'failed' | 'done' | 'active' | 'pending'; index: number }) {
  if (state === 'failed') return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
  if (state === 'done') return <Check className="w-3.5 h-3.5 text-emerald-400" />
  if (state === 'active') return <Loader2 className="w-3.5 h-3.5 text-indigo-300 animate-spin" />
  return <span className="text-[10px] font-medium text-neutral-500">{index + 1}</span>
}

export function DesignProgress({ step, progress, error, failedStep, lastResult, nanobananaRef, onClose, onRetry }: Props) {
  if (step === 'idle') return null

  const phase: 'done' | 'error' | 'running' = step === 'done' ? 'done' : step === 'error' ? 'error' : 'running'
  const isRunning = phase === 'running'
  const currentIdx = computeCurrentIdx(step, failedStep)
  const pct = phase === 'done' ? 100 : phase === 'error' ? 0 : Math.round(((currentIdx + 0.5) / PIPELINE.length) * 100)
  const progressBarColor =
    phase === 'error' ? 'bg-red-500' : phase === 'done' ? 'bg-emerald-500' : 'bg-indigo-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#1a1a1a] border border-neutral-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-[#0f0f0f]">
          <div className="flex items-center gap-2">
            {HEADER_ICON[phase]}
            <h2 className="text-sm font-medium text-neutral-100">{HEADER_TITLE[phase]}</h2>
          </div>
          {!isRunning && (
            <button
              type="button"
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-200 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-5 pt-4 pb-3">
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${progressBarColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-neutral-500">
            <span>{currentIdx + (phase === 'done' ? 0 : 1)}/{PIPELINE.length}</span>
            <span>{pct}%</span>
          </div>
        </div>

        <ul className="px-5 pb-4 space-y-3 flex-1 overflow-y-auto">
          {PIPELINE.map((p, i) => {
            const isDone = phase === 'done' || i < currentIdx
            const isActive = i === currentIdx && isRunning
            const isPending = !isDone && !isActive
            const failed = phase === 'error' && i === currentIdx
            const iconState: 'failed' | 'done' | 'active' | 'pending' = failed
              ? 'failed'
              : isDone
                ? 'done'
                : isActive
                  ? 'active'
                  : 'pending'
            const ringClass = failed
              ? 'bg-red-500/20 ring-1 ring-red-500/50'
              : isDone
                ? 'bg-emerald-500/20 ring-1 ring-emerald-500/50'
                : isActive
                  ? 'bg-indigo-500/20 ring-1 ring-indigo-500/50'
                  : 'bg-neutral-800 ring-1 ring-neutral-700'
            const labelColor = isDone
              ? 'text-emerald-200'
              : isActive
                ? 'text-indigo-100'
                : failed
                  ? 'text-red-300'
                  : 'text-neutral-400'

            return (
              <li key={p.id} className="flex gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center ${ringClass}`}>
                    <StepStatusIcon state={iconState} index={i} />
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-medium ${labelColor}`}>{p.agent}</span>
                    <span className="text-[11px] uppercase tracking-wide text-neutral-500">{p.role}</span>
                  </div>
                  <p className={`text-xs mt-0.5 ${isPending ? 'text-neutral-600' : 'text-neutral-400'}`}>
                    {p.description}
                  </p>
                  {isActive && progress && (
                    <p className="text-xs mt-1 text-indigo-300 italic">▸ {progress}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {nanobananaRef && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-[#0f0f0f] space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              <p className="text-xs font-medium text-indigo-200">Aperçu Nano Banana</p>
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">référence vectorisée</span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Image cible générée par Nano Banana. Le traitement la décompose en éléments vectoriels éditables.
            </p>
            <img
              src={nanobananaRef}
              alt="Référence Nano Banana"
              className="w-full max-h-64 object-contain rounded border border-neutral-800 bg-black"
            />
          </div>
        )}

        {phase === 'done' && lastResult && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-emerald-500/5 space-y-1">
            <p className="text-xs text-emerald-300 font-medium">Design prêt sur le canvas</p>
            {lastResult.rationale && (
              <p className="text-[11px] text-neutral-400 leading-relaxed">{lastResult.rationale}</p>
            )}
          </div>
        )}

        {phase === 'error' && error && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-red-500/5">
            <p className="text-xs text-red-300 leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-[#0f0f0f]">
          <div>
            {isRunning && (
              <span className="text-[11px] text-neutral-500">
                Ne ferme pas cette fenêtre pendant la génération
              </span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {phase === 'done' && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-colors"
                >
                  Voir le résultat
                </button>
              </>
            )}
            {phase === 'error' && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-3 py-1.5 rounded bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-colors"
                >
                  Réessayer
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
