// Checklist live du pipeline : une ligne par étape (spinner/ok/avertissement/
// erreur/sautée) + journal console (actions, appels IA, connecteurs) + arrêt.
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Check, AlertTriangle, X, Minus, CircleDashed, Square, Terminal } from 'lucide-react'
import { useDemoExpressStore } from '@/stores/demoExpress.store'
import type { DemoLogKind, DemoStepStatus } from '../types'
import { t, type TranslationKey } from '@/lib/i18n'

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

// ⚠️ CLÉS, pas `t()` : objet évalué au chargement du module.
const LOG_TAG: Record<DemoLogKind, { labelKey: TranslationKey; tag: string; text: string }> = {
  step: { labelKey: 'de.step', tag: 'text-white/45', text: 'text-white/75' },
  ia: { labelKey: 'de.log.ia', tag: 'text-indigo-400', text: 'text-indigo-300' },
  connector: { labelKey: 'de.log.connector', tag: 'text-teal-400', text: 'text-teal-300' },
  error: { labelKey: 'de.log.error', tag: 'text-rose-400', text: 'text-rose-300' },
}

/** Couleur de la LIGNE entière : type + sémantique (✓ bilan = vert, compteur = accent). */
function lineTextCls(kind: DemoLogKind, text: string): string {
  if (kind === 'step' && text.includes('✓')) return 'text-emerald-300'
  return LOG_TAG[kind].text
}

/** Console de logs FIXÉE EN BAS de l'écran (façon terminal/DevTools), repliable,
 *  défilement auto vers la dernière ligne. */
function DemoLogConsole() {
  const logs = useDemoExpressStore((s) => s.logs)
  const [open, setOpen] = useState(true)
  const boxRef = useRef<HTMLDivElement | null>(null)
  // « Collé au bas » façon terminal : l'auto-scroll ne s'applique que si on est
  // déjà en bas — remonter lire l'historique n'est jamais interrompu.
  const stickRef = useRef(true)
  useEffect(() => {
    const el = boxRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [logs.length, open])
  if (logs.length === 0) return null
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-[#0b0b0e]/95 backdrop-blur">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-[11px] text-white/50 hover:text-white/80">
        <Terminal className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
        Journal ({logs.length})
        <span className="ml-auto">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}</span>
      </button>
      {open && (
        <div ref={boxRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
          }}
          className="h-[32vh] overflow-y-scroll overscroll-contain px-4 pb-3 font-mono text-[11px] leading-relaxed
            [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-white/[0.04]
            [&::-webkit-scrollbar-thumb]:bg-white/25 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/40">
          {logs.map((l, i) => (
            <div key={i} className="flex gap-2 items-baseline">
              <span className="shrink-0 text-white/25 tabular-nums">
                {new Date(l.ts).toLocaleTimeString('fr-FR')}
              </span>
              <span className={`shrink-0 w-[74px] ${LOG_TAG[l.kind].tag}`}>{t(LOG_TAG[l.kind].labelKey)}</span>
              <span className={lineTextCls(l.kind, l.text)}>{l.text}</span>
            </div>
          ))}
        </div>
      )}
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
          {abortRequested ? t('de2.arretEnCoursFin') : t('de2.arreter')}
        </button>
      )}
    </div>
  )
}
