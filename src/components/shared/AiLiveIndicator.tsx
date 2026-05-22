import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Loader2, AlertTriangle, ChevronDown, Coins, RotateCcw } from 'lucide-react'
import { useAiActivityStore, type AiActivityRecord } from '@/stores/aiActivity.store'
import { getModel, type AiProvider } from '@/lib/aiModels'

const PROVIDER_STYLE: Record<string, { color: string; ring: string; bg: string; label: string }> = {
  claude:         { color: 'text-orange-300',  ring: 'ring-orange-400/40',  bg: 'bg-orange-500/15',  label: 'Claude' },
  gemini:         { color: 'text-sky-300',     ring: 'ring-sky-400/40',     bg: 'bg-sky-500/15',     label: 'Gemini' },
  'gemini-image': { color: 'text-amber-300',   ring: 'ring-amber-400/40',   bg: 'bg-amber-500/15',   label: 'Nano Banana' },
  openai:         { color: 'text-emerald-300', ring: 'ring-emerald-400/40', bg: 'bg-emerald-500/15', label: 'OpenAI' },
  deepseek:       { color: 'text-violet-300',  ring: 'ring-violet-400/40',  bg: 'bg-violet-500/15',  label: 'DeepSeek' },
  openrouter:     { color: 'text-pink-300',    ring: 'ring-pink-400/40',    bg: 'bg-pink-500/15',    label: 'OpenRouter' },
}

function styleFor(provider: string) {
  return PROVIDER_STYLE[provider] ?? { color: 'text-white/70', ring: 'ring-white/20', bg: 'bg-white/10', label: provider }
}

function modelLabel(provider: string, modelId: string): string {
  if (provider === 'gemini-image') return modelId
  const info = getModel(provider as AiProvider, modelId)
  return info?.label ?? modelId
}

function useElapsed(startedAt: number, running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [running])
  return Math.max(0, now - startedAt)
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTokens(n: number): string {
  return n.toLocaleString('fr-FR')
}

function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

const USD_TO_EUR = 0.92
function formatCostEur(usd: number): string {
  const eur = usd * USD_TO_EUR
  if (eur >= 1) return `${eur.toFixed(2)} €`
  if (eur >= 0.01) return `${eur.toFixed(4)} €`
  return `${eur.toFixed(5)} €`
}

interface RowProps {
  record: AiActivityRecord
  primary?: boolean
}

function ActivityRow({ record, primary = false }: RowProps) {
  const s = styleFor(record.provider)
  const running = record.status === 'running'
  const elapsed = useElapsed(record.startedAt, running)
  const finalDuration = record.endedAt ? record.endedAt - record.startedAt : elapsed
  const duration = running ? elapsed : finalDuration

  const Icon = record.status === 'error'
    ? AlertTriangle
    : running
      ? Loader2
      : Sparkles

  const hasTokens =
    typeof record.inputTokens === 'number' &&
    typeof record.outputTokens === 'number' &&
    (record.inputTokens > 0 || record.outputTokens > 0)
  const hasCost = typeof record.costUsd === 'number' && record.costUsd > 0

  const totalTokens = hasTokens ? record.inputTokens! + record.outputTokens! : 0
  const tooltipParts = [
    modelLabel(record.provider, record.model),
    record.label,
    hasTokens ? `${formatTokens(record.inputTokens!)} in / ${formatTokens(record.outputTokens!)} out` : null,
    hasCost ? `$${record.costUsd!.toFixed(5)}` : null,
  ].filter(Boolean)

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1 rounded-full ring-1 ${s.bg} ${s.ring} backdrop-blur-md
        ${primary ? 'shadow-lg shadow-black/30' : ''}
        ${record.status === 'error' ? 'ring-red-400/50 bg-red-500/15' : ''}`}
      title={tooltipParts.join(' · ')}
    >
      <span className="relative flex items-center justify-center">
        {running && (
          <span className={`absolute inline-flex h-2 w-2 rounded-full ${s.bg.replace('/15', '/60')} animate-ping`} />
        )}
        <Icon className={`w-3 h-3 ${record.status === 'error' ? 'text-red-300' : s.color} ${running ? 'animate-spin' : ''}`} />
      </span>
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${s.color}`}>
        {s.label}
      </span>
      <span className={`text-[10px] tabular-nums ${running ? 'text-white/60' : 'text-white/45'}`}>
        {formatElapsed(duration)}
      </span>
      {hasTokens && (
        <span className="text-[10px] tabular-nums text-white/55 font-mono whitespace-nowrap">
          {formatTokensShort(totalTokens)}t
        </span>
      )}
      {hasCost && (
        <span className="text-[10px] tabular-nums font-mono text-emerald-300/90 whitespace-nowrap font-semibold">
          {formatCostEur(record.costUsd!)}
        </span>
      )}
    </div>
  )
}

function SessionTotalsBadge() {
  const session = useAiActivityStore((s) => s.session)
  const reset = useAiActivityStore((s) => s.resetSession)
  // Avec 0 requête → rien à afficher.
  // Avec 1 requête → l'info est déjà dans la pilule active (même tokens, même coût) :
  // afficher le cumul ferait doublon. Le badge n'a de sens qu'à partir de 2+ requêtes.
  if (session.requestCount < 2) return null
  const totalTokens = session.tokensIn + session.tokensOut
  const tooltipParts = [
    `${session.requestCount} requête${session.requestCount > 1 ? 's' : ''}`,
    session.errorCount > 0
      ? `${session.errorCount} erreur${session.errorCount > 1 ? 's' : ''}`
      : null,
    `${formatTokens(session.tokensIn)} in / ${formatTokens(session.tokensOut)} out`,
    `$${session.costUsd.toFixed(5)}`,
  ].filter(Boolean)

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1 rounded-full ring-1 ring-emerald-400/30 bg-emerald-500/10 backdrop-blur-md shadow-lg shadow-black/30"
      title={`Session — ${tooltipParts.join(' · ')}`}
    >
      <Coins className="w-3 h-3 text-emerald-300" />
      <span className="text-[10px] tabular-nums font-mono text-white/70 whitespace-nowrap">
        {session.requestCount}
      </span>
      <span className="text-[10px] tabular-nums font-mono text-white/55 whitespace-nowrap">
        {formatTokensShort(totalTokens)}t
      </span>
      <span className="text-[10px] tabular-nums font-mono text-emerald-300 whitespace-nowrap font-semibold">
        {formatCostEur(session.costUsd)}
      </span>
      {session.errorCount > 0 && (
        <span className="text-[10px] tabular-nums font-mono text-red-300 whitespace-nowrap" title={`${session.errorCount} erreur${session.errorCount > 1 ? 's' : ''}`}>
          !{session.errorCount}
        </span>
      )}
      <button
        type="button"
        onClick={reset}
        title="Réinitialiser le compteur de session"
        className="p-0.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
      >
        <RotateCcw className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}

const LAST_VISIBLE_MS = 4000

export function AiLiveIndicator() {
  const active = useAiActivityStore((s) => s.active)
  const last = useAiActivityStore((s) => s.last)
  const sessionRequestCount = useAiActivityStore((s) => s.session.requestCount)
  const [expanded, setExpanded] = useState(false)
  const [lastVisible, setLastVisible] = useState(false)

  // Affiche `last` quelques secondes après la fin, puis masque.
  useEffect(() => {
    if (!last?.endedAt) {
      setLastVisible(false)
      return
    }
    const remaining = LAST_VISIBLE_MS - (Date.now() - last.endedAt)
    if (remaining <= 0) {
      setLastVisible(false)
      return
    }
    setLastVisible(true)
    const id = setTimeout(() => setLastVisible(false), remaining)
    return () => clearTimeout(id)
  }, [last])

  const activeList = useMemo(
    () => Object.values(active).sort((a, b) => a.startedAt - b.startedAt),
    [active],
  )

  const hasActive = activeList.length > 0
  const showLast = !hasActive && lastVisible && last !== null
  const showLiveRow = hasActive || showLast
  if (!showLiveRow && sessionRequestCount < 2) return null

  const primary = hasActive ? activeList[activeList.length - 1] : showLast ? last : null
  const extraCount = hasActive ? activeList.length - 1 : 0

  return (
    <div className="fixed top-2 inset-x-0 z-[60] pointer-events-none flex flex-col items-center">
      <div className="flex flex-row items-center gap-1.5 pointer-events-auto justify-center">
        {primary && <ActivityRow record={primary} primary />}
        {extraCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 ring-1 ring-white/20 hover:bg-white/15 backdrop-blur-md transition-colors"
            title={`${extraCount} autre${extraCount > 1 ? 's' : ''} requête${extraCount > 1 ? 's' : ''} en cours`}
          >
            <span className="text-[10px] font-semibold text-white/80">+{extraCount}</span>
            <ChevronDown className={`w-3 h-3 text-white/60 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
        <SessionTotalsBadge />
      </div>
      {expanded && extraCount > 0 && (
        <div className="flex flex-col items-center gap-1 mt-1 pointer-events-auto">
          {activeList.slice(0, -1).map((rec) => (
            <ActivityRow key={rec.id} record={rec} />
          ))}
        </div>
      )}
    </div>
  )
}
