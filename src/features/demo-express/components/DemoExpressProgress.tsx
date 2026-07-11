// src/features/demo-express/components/DemoExpressProgress.tsx
// Checklist live du pipeline : une ligne par étape (spinner/ok/avertissement/
// erreur/sautée) + bouton d'arrêt pendant l'exécution.
import { Loader2, Check, AlertTriangle, X, Minus, CircleDashed, Square } from 'lucide-react'
import { useDemoExpressStore } from '@/stores/demoExpress.store'
import type { DemoStepStatus } from '../types'

const STATUS_ICON: Record<DemoStepStatus, React.ReactNode> = {
  pending: <CircleDashed className="w-4 h-4 text-white/25" aria-hidden="true" />,
  running: <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" aria-hidden="true" />,
  done: <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />,
  error: <X className="w-4 h-4 text-rose-400" aria-hidden="true" />,
  skipped: <Minus className="w-4 h-4 text-white/25" aria-hidden="true" />,
}

export function DemoExpressProgress() {
  const steps = useDemoExpressStore((s) => s.steps)
  const phase = useDemoExpressStore((s) => s.phase)
  const abortRequested = useDemoExpressStore((s) => s.abortRequested)
  const requestAbort = useDemoExpressStore((s) => s.requestAbort)

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface p-6">
      <ol className="space-y-3">
        {steps.map((st) => (
          <li key={st.id} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">{STATUS_ICON[st.status]}</span>
            <div className="min-w-0">
              <p className={`text-sm ${st.status === 'pending' || st.status === 'skipped' ? 'text-white/40' : 'text-white/90'}`}>
                {st.label}
              </p>
              {st.detail && (
                <p className={`text-xs truncate ${st.status === 'error' ? 'text-rose-400/80' : 'text-white/40'}`}>
                  {st.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {phase === 'running' && (
        <button
          onClick={requestAbort}
          disabled={abortRequested}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 hover:bg-white/[0.04] disabled:opacity-40 px-3 py-2 text-xs text-white/70 transition-colors"
        >
          <Square className="w-3.5 h-3.5" aria-hidden="true" />
          {abortRequested ? 'Arrêt en cours (fin de l’item)…' : 'Arrêter'}
        </button>
      )}
    </div>
  )
}
