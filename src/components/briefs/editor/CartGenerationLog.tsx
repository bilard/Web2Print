import { useEffect, useRef } from 'react'
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Database,
  Tags,
  Search,
  Sparkles,
  RotateCw,
  Save,
} from 'lucide-react'
import type { CartProgressEvent } from '@/features/briefs/ai/useGenerateCart'

interface Props {
  events: CartProgressEvent[]
  isRunning: boolean
}

type StepMeta = {
  label: string
  color: string // text color class
  bg: string // badge bg class
  icon: JSX.Element
}

const STEP_META: Record<CartProgressEvent['step'], StepMeta> = {
  taxonomy:   { label: 'TAXO',   color: 'text-sky-300',     bg: 'bg-sky-500/10 border-sky-500/20',         icon: <Database className="w-3 h-3" /> },
  keywords:   { label: 'KEYS',   color: 'text-violet-300',  bg: 'bg-violet-500/10 border-violet-500/20',   icon: <Tags className="w-3 h-3" /> },
  scraping:   { label: 'SCRAPE', color: 'text-cyan-300',    bg: 'bg-cyan-500/10 border-cyan-500/20',       icon: <Search className="w-3 h-3" /> },
  fallback:   { label: 'FBACK',  color: 'text-amber-300',   bg: 'bg-amber-500/10 border-amber-500/20',     icon: <AlertTriangle className="w-3 h-3" /> },
  'ai-select':{ label: 'AI',     color: 'text-indigo-300',  bg: 'bg-indigo-500/10 border-indigo-500/20',   icon: <Sparkles className="w-3 h-3" /> },
  'ai-retry': { label: 'RETRY',  color: 'text-fuchsia-300', bg: 'bg-fuchsia-500/10 border-fuchsia-500/20', icon: <RotateCw className="w-3 h-3" /> },
  save:       { label: 'SAVE',   color: 'text-teal-300',    bg: 'bg-teal-500/10 border-teal-500/20',       icon: <Save className="w-3 h-3" /> },
  done:       { label: 'DONE',   color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: <CheckCircle2 className="w-3 h-3" /> },
  error:      { label: 'ERR',    color: 'text-rose-300',    bg: 'bg-rose-500/10 border-rose-500/20',       icon: <AlertTriangle className="w-3 h-3" /> },
}

/**
 * Terminal-like log panel displayed pendant la génération du panier.
 * Affiche les étapes : taxonomy → keywords → scraping → ai-select → save → done.
 */
export function CartGenerationLog({ events, isRunning }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  return (
    <div className="border border-white/[0.08] rounded-lg bg-[#0b0b0b] overflow-hidden shadow-inner shadow-black/30">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-gradient-to-r from-[#111] to-[#0d0d0d] px-3 py-2">
        <Globe className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[11px] font-medium text-white/80 tracking-wide">
          Journal de génération
        </span>
        <span className="text-[10px] text-white/30 ml-1">
          {events.length} événement{events.length > 1 ? 's' : ''}
        </span>
        {isRunning ? (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-indigo-300">
            <Loader2 className="w-3 h-3 animate-spin" />
            en cours
          </span>
        ) : events.length > 0 ? (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400/80">
            <CheckCircle2 className="w-3 h-3" />
            terminé
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="p-2 font-mono text-[11px] max-h-[320px] overflow-y-auto leading-relaxed"
      >
        {events.length === 0 && (
          <p className="text-white/30 px-2 py-3 italic">En attente…</p>
        )}
        <ol className="flex flex-col">
          {events.map((e, i) => {
            const meta = STEP_META[e.step]
            const isLast = i === events.length - 1
            const isActive = isRunning && isLast && e.step !== 'done' && e.step !== 'error'
            return (
              <li
                key={i}
                className="group flex items-start gap-2 px-2 py-1 rounded-md hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-white/25 shrink-0 tabular-nums select-none w-6 text-right">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded border px-1.5 py-[1px] text-[9px] font-semibold tracking-wider ${meta.color} ${meta.bg}`}
                >
                  {meta.icon}
                  {meta.label}
                </span>
                <span className="text-white/80 break-words min-w-0 flex-1">
                  {e.message}
                </span>
                {isActive && (
                  <span className="shrink-0 mt-1 flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
