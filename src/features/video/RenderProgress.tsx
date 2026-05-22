import { Loader2, Check, AlertTriangle } from 'lucide-react'

export interface StepInfo {
  status: 'pending' | 'active' | 'done' | 'error'
  startedAt?: number
  finishedAt?: number
}

interface Props {
  capture: StepInfo
  extract?: StepInfo
  compose?: StepInfo
  render: StepInfo
  logs: string[]
  now: number
  estimatedRenderMs?: number
}

function elapsedMs(s: StepInfo, now: number) {
  if (!s.startedAt) return 0
  return (s.finishedAt ?? now) - s.startedAt
}

function fmtSec(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`
}

function adaptiveEstimate(elapsedMs: number, base: number) {
  if (elapsedMs <= base * 0.85) return base
  return Math.max(base, elapsedMs + 15000)
}

export function RenderProgress({ capture, extract, compose, render, logs, now, estimatedRenderMs = 60000 }: Props) {
  const captureMs = elapsedMs(capture, now)
  const extractMs = extract ? elapsedMs(extract, now) : 0
  const composeMs = compose ? elapsedMs(compose, now) : 0
  const renderMs = elapsedMs(render, now)
  const effectiveEstimate = adaptiveEstimate(renderMs, estimatedRenderMs)
  const overEstimate = render.status === 'active' && renderMs > estimatedRenderMs
  const renderProgress =
    render.status === 'done' ? 1
    : render.status === 'active' ? Math.min(renderMs / effectiveEstimate, 0.98)
    : 0
  const showCapture = capture.status !== 'pending'
  const showExtract = !!extract && extract.status !== 'pending'
  const showCompose = !!compose && compose.status !== 'pending'

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2.5">
      {showCapture && (
        <StepRow label="Capture de la page" status={capture.status} elapsedMs={captureMs} progress={capture.status === 'done' ? 1 : capture.status === 'active' ? 0.6 : 0} />
      )}
      {showExtract && (
        <StepRow
          label="Analyse des fichiers (Gemini multimodal)"
          status={extract!.status}
          elapsedMs={extractMs}
          progress={extract!.status === 'done' ? 1 : extract!.status === 'active' ? 0.5 : 0}
        />
      )}
      {showCompose && (
        <StepRow
          label="Composition multi-scènes"
          status={compose!.status}
          elapsedMs={composeMs}
          progress={compose!.status === 'done' ? 1 : compose!.status === 'active' ? 0.5 : 0}
        />
      )}
      <StepRow label="Rendu vidéo Annimation" status={render.status} elapsedMs={renderMs} progress={renderProgress} estimateMs={overEstimate ? undefined : estimatedRenderMs} />

      {logs.length > 0 && (
        <div className="font-mono text-[10px] text-white/45 space-y-0.5 max-h-24 overflow-y-auto border-t border-white/10 pt-2">
          {logs.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
    </div>
  )
}

interface RowProps {
  label: string
  status: StepInfo['status']
  elapsedMs: number
  progress: number
  estimateMs?: number
}

function StepRow({ label, status, elapsedMs, progress, estimateMs }: RowProps) {
  const iconClass = status === 'done' ? 'text-emerald-400'
    : status === 'error' ? 'text-red-400'
    : 'text-indigo-400 animate-spin'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        {status === 'done' && <Check className={`w-3.5 h-3.5 shrink-0 ${iconClass}`} />}
        {status === 'active' && <Loader2 className={`w-3.5 h-3.5 shrink-0 ${iconClass}`} />}
        {status === 'error' && <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${iconClass}`} />}
        {status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-white/15 shrink-0" />}
        <span className={`flex-1 ${status === 'pending' ? 'text-white/40' : 'text-white/85'}`}>{label}</span>
        {elapsedMs > 0 && (
          <span className="text-white/45 font-mono tabular-nums text-[11px]">
            {fmtSec(elapsedMs)}
            {status === 'active' && estimateMs && (
              <span className="text-white/30"> / ~{fmtSec(estimateMs)}</span>
            )}
          </span>
        )}
      </div>
      {status !== 'pending' && (
        <div className="h-1 bg-white/5 rounded-full overflow-hidden ml-5.5">
          <div
            className={`h-full transition-all duration-300 ease-out ${status === 'done' ? 'bg-emerald-400' : status === 'error' ? 'bg-red-400' : 'bg-indigo-400'}`}
            style={{ width: `${Math.max(progress * 100, 4)}%` }}
          />
        </div>
      )}
    </div>
  )
}
