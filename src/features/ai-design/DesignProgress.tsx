import { Check, Loader2, AlertTriangle, Sparkles, X } from 'lucide-react'
import type { Step } from './useGenerateDesign'
import type { DesignResult } from './types'
import type { DesignPlan } from './artDirectorSchema'

interface Props {
  step: Step
  progress: string
  error: string | null
  lastResult: DesignResult | null
  lastPlan: DesignPlan | null
  nanobananaImage?: string
  onClose: () => void
  onRetry: () => void
}

interface StepDef {
  id: Exclude<Step, 'idle' | 'done' | 'error'>
  agent: string
  role: string
  description: string
}

const PIPELINE: StepDef[] = [
  {
    id: 'planning',
    agent: 'Art Director',
    role: 'Planification',
    description: 'Analyse du brief et composition de la structure visuelle (zones, typographie, palette, slots images).',
  },
  {
    id: 'illustrating',
    agent: 'SVG Engineer + Nano Banana',
    role: 'Génération',
    description: 'Construction du SVG vectoriel et génération des images IA des slots, en parallèle.',
  },
  {
    id: 'sanitizing',
    agent: 'Sanitizer',
    role: 'Validation',
    description: 'Nettoyage et validation du SVG pour assurer la compatibilité avec Fabric.js.',
  },
  {
    id: 'rendering',
    agent: 'Canvas',
    role: 'Rendu',
    description: 'Import du design sur le canvas, ajustement à la taille du document.',
  },
]

export function DesignProgress({ step, progress, error, lastResult, lastPlan, nanobananaImage, onClose, onRetry }: Props) {
  if (step === 'idle') return null

  const guessErrorStep = (msg: string): StepDef['id'] => {
    if (msg.includes('Art Director')) return 'planning'
    if (msg.includes('SVG') || msg.includes('Nano')) return 'illustrating'
    if (msg.includes('Validation')) return 'sanitizing'
    return 'rendering'
  }
  const currentIdx = step === 'done'
    ? PIPELINE.length
    : step === 'error'
      ? Math.max(0, PIPELINE.findIndex((p) => p.id === guessErrorStep(error ?? progress ?? '')))
      : Math.max(0, PIPELINE.findIndex((p) => p.id === step))
  const pct = step === 'done' ? 100 : step === 'error' ? 0 : Math.round(((currentIdx + 0.5) / PIPELINE.length) * 100)

  const isRunning = step !== 'done' && step !== 'error'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-[#1a1a1a] border border-neutral-800 rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-[#0f0f0f]">
          <div className="flex items-center gap-2">
            {step === 'done' ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : step === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-indigo-400" />
            )}
            <h2 className="text-sm font-medium text-neutral-100">
              {step === 'done' ? 'Design généré' : step === 'error' ? 'Génération échouée' : 'Génération en cours…'}
            </h2>
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
              className={`h-full transition-all duration-500 ease-out ${
                step === 'error' ? 'bg-red-500' : step === 'done' ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-neutral-500">
            <span>{currentIdx + (step === 'done' ? 0 : 1)}/{PIPELINE.length}</span>
            <span>{pct}%</span>
          </div>
        </div>

        <ul className="px-5 pb-4 space-y-3">
          {PIPELINE.map((p, i) => {
            const isDone = step === 'done' || i < currentIdx
            const isActive = i === currentIdx && isRunning
            const isPending = !isDone && !isActive
            const failed = step === 'error' && i === currentIdx

            return (
              <li key={p.id} className="flex gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      failed
                        ? 'bg-red-500/20 ring-1 ring-red-500/50'
                        : isDone
                          ? 'bg-emerald-500/20 ring-1 ring-emerald-500/50'
                          : isActive
                            ? 'bg-indigo-500/20 ring-1 ring-indigo-500/50'
                            : 'bg-neutral-800 ring-1 ring-neutral-700'
                    }`}
                  >
                    {failed ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    ) : isDone ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : isActive ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-300 animate-spin" />
                    ) : (
                      <span className="text-[10px] font-medium text-neutral-500">{i + 1}</span>
                    )}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-sm font-medium ${
                        isDone ? 'text-emerald-200' : isActive ? 'text-indigo-100' : failed ? 'text-red-300' : 'text-neutral-400'
                      }`}
                    >
                      {p.agent}
                    </span>
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

        {nanobananaImage && (step === 'illustrating' || step === 'sanitizing' || step === 'rendering' || step === 'done') && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-900">
            <p className="text-xs text-neutral-400 mb-2">📷 Référence créative (Nano Banana)</p>
            <img
              src={nanobananaImage}
              alt="Nano Banana reference"
              className="w-full rounded border border-neutral-700 object-cover max-h-48"
            />
          </div>
        )}

        {step === 'done' && lastResult && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-emerald-500/5 space-y-1">
            <p className="text-xs text-emerald-300 font-medium">Design prêt sur le canvas</p>
            {lastResult.rationale && (
              <p className="text-[11px] text-neutral-400 leading-relaxed">{lastResult.rationale}</p>
            )}
            {(lastResult.slots?.length ?? 0) > 0 && (
              <p className="text-[11px] text-neutral-500">
                {lastResult.slots.length} slot(s) image à remplir manuellement
              </p>
            )}
            {lastPlan && (
              <p className="text-[10px] text-neutral-600">
                {lastPlan.zones?.length ?? 0} zones · {lastPlan.typography?.hierarchy?.length ?? 0} textes · {lastPlan.slots?.length ?? 0} slots images
              </p>
            )}
          </div>
        )}

        {step === 'error' && error && (
          <div className="px-5 py-3 border-t border-neutral-800 bg-red-500/5">
            <p className="text-xs text-red-300 leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-800 bg-[#0f0f0f]">
          {step === 'done' && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-colors"
            >
              Voir le résultat
            </button>
          )}
          {step === 'error' && (
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
          {isRunning && (
            <span className="text-[11px] text-neutral-500">
              Ne ferme pas cette fenêtre pendant la génération
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
