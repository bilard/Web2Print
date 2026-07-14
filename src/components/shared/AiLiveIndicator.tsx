import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Sparkles, Loader2, AlertTriangle, ChevronDown, Coins, RotateCcw } from 'lucide-react'
import { useAiActivityStore, type AiActivityRecord } from '@/stores/aiActivity.store'
import { getModel, type AiProvider } from '@/lib/aiModels'
import { CloseButton } from '@/components/shared/CloseButton'
import { router } from '@/app/router'

/** Pathname réactif hors arbre du router (l'indicateur est monté à côté du RouterProvider). */
function usePathname(): string {
  return useSyncExternalStore(
    (cb) => router.subscribe(cb),
    () => router.state.location.pathname,
  )
}

// Panneau complet (par LLM + connecteurs) chargé en lazy : monté seulement à l'ouverture.
const LiveLlmUsagePanel = lazy(() =>
  import('./LiveLlmUsagePanel').then((m) => ({ default: m.LiveLlmUsagePanel })),
)

const PROVIDER_STYLE: Record<string, { color: string; ring: string; bg: string; label: string }> = {
  claude:         { color: 'text-orange-300',  ring: 'ring-orange-400/40',  bg: 'bg-orange-500/15',  label: 'Claude' },
  gemini:         { color: 'text-sky-300',     ring: 'ring-sky-400/40',     bg: 'bg-sky-500/15',     label: 'Gemini' },
  'gemini-image': { color: 'text-amber-300',   ring: 'ring-amber-400/40',   bg: 'bg-amber-500/15',   label: 'Image IA' },
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

function SessionTotalsBadge({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const session = useAiActivityStore((s) => s.session)
  const reset = useAiActivityStore((s) => s.resetSession)
  // Le badge de cumul reste affiché en permanence dès la 1re requête : la pilule
  // d'activité (provider + temps) est éphémère (disparaît ~4 s après la fin), donc
  // ce badge est la seule trace persistante des tokens/coût consommés. Le léger
  // doublon avec la pilule active pendant un appel unique est volontaire.
  if (session.requestCount < 1) return null
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
      className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full ring-1 ring-emerald-400/30 bg-emerald-500/10 backdrop-blur-md shadow-lg shadow-black/30"
      title={`Session — ${tooltipParts.join(' · ')}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title="Voir le détail de la consommation (par LLM + connecteurs)"
        className="flex items-center gap-2 group"
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
        <ChevronDown className={`w-2.5 h-2.5 text-white/50 group-hover:text-white/80 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
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
  const [panelOpen, setPanelOpen] = useState(false)
  const [lastVisible, setLastVisible] = useState(false)
  // Position par route : sous le header (top-14) par défaut — mais dans le
  // Catalogue studio cette bande porte les actions d'étape (« Générer le plan »,
  // « Continuer → Aperçu ») que le chip masquait → REMONTÉ dans le header de la
  // page, dont le coin droit est libre (l'éditeur, lui, y a Exporter/avatar).
  const pathname = usePathname()
  const raised = pathname.startsWith('/catalog/')

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
  // Tant qu'au moins une requête IA a eu lieu dans la session, on garde l'overlay
  // monté pour conserver le badge de cumul (tokens/coût) visible en permanence.
  if (!showLiveRow && sessionRequestCount < 1) return null

  const primary = hasActive ? activeList[activeList.length - 1] : showLast ? last : null
  const extraCount = hasActive ? activeList.length - 1 : 0

  return (
    <div className={`fixed ${raised ? 'top-2.5' : 'top-14'} right-3 z-[60] pointer-events-none flex flex-col items-end`}>
      <div className="flex flex-row items-center gap-1.5 pointer-events-auto justify-end flex-wrap">
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
        <SessionTotalsBadge open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
      </div>
      {expanded && extraCount > 0 && (
        <div className="flex flex-col items-center gap-1 mt-1 pointer-events-auto">
          {activeList.slice(0, -1).map((rec) => (
            <ActivityRow key={rec.id} record={rec} />
          ))}
        </div>
      )}
      {panelOpen && (
        <>
          {/* Clic extérieur → ferme */}
          <div className="fixed inset-0 z-[59] pointer-events-auto" onClick={() => setPanelOpen(false)} />
          <div className="relative z-[61] mt-2 w-[min(94vw,860px)] pointer-events-auto">
            <div className="rounded-2xl border border-white/10 bg-[#0b0b0f]/95 backdrop-blur-md shadow-2xl shadow-black/60 flex flex-col max-h-[calc(100vh-5rem)]">
              {/* hauteur quasi-pleine fenêtre (le panneau démarre à ~4rem du haut) :
                  évite que la section Scraping/Bright Data soit coupée en bas. */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
                <span className="text-xs font-semibold text-white/80">Consommation — détail par LLM & connecteurs</span>
                <CloseButton onClick={() => setPanelOpen(false)} title="Fermer" />
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-3">
                <Suspense fallback={<div className="text-xs text-white/40 p-4">Chargement du détail…</div>}>
                  <LiveLlmUsagePanel />
                </Suspense>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
