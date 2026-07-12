// src/features/demo-express/components/DemoExpressProgress.tsx
// Checklist live du pipeline : une ligne par étape (spinner/ok/avertissement/
// erreur/sautée) + journal console (actions, appels IA, connecteurs) + arrêt.
import { useEffect, useRef } from 'react'
import { Loader2, Check, AlertTriangle, X, Minus, CircleDashed, Square, Terminal } from 'lucide-react'
import { useDemoExpressStore } from '@/stores/demoExpress.store'
import type { DemoLogKind, DemoStepStatus } from '../types'

const STATUS_ICON: Record<DemoStepStatus, React.ReactNode> = {
  pending: <CircleDashed className="w-4 h-4 text-white/25" aria-hidden="true" />,
  running: <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" aria-hidden="true" />,
  done: <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />,
  error: <X className="w-4 h-4 text-rose-400" aria-hidden="true" />,
  skipped: <Minus className="w-4 h-4 text-white/25" aria-hidden="true" />,
}

/** Détail d'étape COLORÉ : teinte selon l'état, compteur « 5/6 » en accent. */
const DETAIL_CLS: Record<DemoStepStatus, string> = {
  pending: 'text-white/35',
  running: 'text-indigo-300/90',
  done: 'text-emerald-300/80',
  warning: 'text-amber-300/90',
  error: 'text-rose-400/90',
  skipped: 'text-white/35',
}

function StepDetail({ status, detail }: { status: DemoStepStatus; detail: string }) {
  const m = /^(\d+\s*\/\s*\d+)(\s*—\s*)([\s\S]*)$/.exec(detail)
  return (
    <p className={`text-xs truncate ${DETAIL_CLS[status]}`}>
      {m ? (
        <>
          <span className="font-bold text-indigo-400 tabular-nums">{m[1]}</span>
          <span className="text-white/30">{m[2]}</span>
          <span>{m[3]}</span>
        </>
      ) : detail}
    </p>
  )
}

const LOG_TAG: Record<DemoLogKind, { label: string; cls: string }> = {
  step: { label: 'étape', cls: 'text-white/45' },
  ia: { label: 'IA', cls: 'text-indigo-300' },
  connector: { label: 'connecteur', cls: 'text-teal-300' },
  error: { label: 'erreur', cls: 'text-rose-400' },
}

/** Console du run : chaque action horodatée (étapes, appels IA, connecteurs), défilement auto. */
function DemoLogConsole() {
  const logs = useDemoExpressStore((s) => s.logs)
  const boxRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs.length])
  if (logs.length === 0) return null
  return (
    <div className="mt-5">
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-white/40">
        <Terminal className="w-3.5 h-3.5" aria-hidden="true" /> Journal ({logs.length})
      </div>
      <div ref={boxRef} className="rounded-lg bg-well border border-white/[0.06] max-h-56 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
        {logs.map((l, i) => (
          <div key={i} className="flex gap-2 items-baseline">
            <span className="shrink-0 text-white/25 tabular-nums">
              {new Date(l.ts).toLocaleTimeString('fr-FR')}
            </span>
            <span className={`shrink-0 w-[74px] ${LOG_TAG[l.kind].cls}`}>{LOG_TAG[l.kind].label}</span>
            <span className={l.kind === 'error' ? 'text-rose-300/90' : 'text-white/75'}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
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
              {st.detail && <StepDetail status={st.status} detail={st.detail} />}
            </div>
          </li>
        ))}
      </ol>
      <DemoLogConsole />
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
