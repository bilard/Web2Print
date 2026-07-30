// Aperçu du test (1 image), compteurs de progression et journal du traitement.
import { useEffect, useRef } from 'react'
import type { ImageGenItem } from './useColumnImageGen'
import { t } from '@/lib/i18n'

export function ImageGenTestPreview({ src }: { src: string }) {
  return (
    <div className="border border-white/10 rounded p-2 flex items-center gap-3">
      <img src={src} alt={t('xl.imageGen.alt')} className="w-24 h-24 object-contain rounded bg-white/5" />
      <div className="text-white/60 text-[12px]">
        {t('imageGenProgress.previewNotSaved')}
      </div>
    </div>
  )
}

/** Une pastille de statut — masquée quand elle est à zéro (sauf les échecs, qui
 *  doivent se voir même à 0 pour confirmer que tout va bien). */
function Counter({ value, label, tone, always }: { value: number; label: string; tone: string; always?: boolean }) {
  if (value === 0 && !always) return null
  return (
    <span className={`flex items-baseline gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 ${tone}`}>
      <b className="text-lg font-bold tabular-nums leading-none">{value}</b>
      <span className="text-[12px] opacity-80">{label}</span>
    </span>
  )
}

/** Conso du lot : tokens consommés et coût réel, à côté de l'avancement. */
export function ImageGenUsage({ usage }: { usage: { tokensIn: number; tokensOut: number; costUsd: number; model: string } }) {
  const tokens = usage.tokensIn + usage.tokensOut
  if (tokens === 0 && usage.costUsd === 0) return null
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} k` : String(n))
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-white/50">
      <span>
        <b className="text-white/80 tabular-nums">{fmt(tokens)}</b> tokens
        <span className="text-white/35"> ({fmt(usage.tokensIn)} entrée · {fmt(usage.tokensOut)} image)</span>
      </span>
      <span>
        Coût <b className="text-amber-300 tabular-nums">{usage.costUsd < 0.01 ? '< 0,01' : usage.costUsd.toFixed(2)} $</b>
      </span>
      {usage.model && <span className="text-white/35">{usage.model}</span>}
    </div>
  )
}

/**
 * Avancement d'un lot de génération : le lot dure plusieurs minutes et c'est le
 * SEUL retour visible. On donne d'abord la question qu'on se pose vraiment —
 * « où en est-on ? » — avec un traité/total et une barre, puis le détail par
 * statut, les compteurs vides étant masqués pour ne pas noyer l'essentiel.
 */
export function ImageGenCounters({ items }: { items: ImageGenItem[] }) {
  const count = (s: ImageGenItem['status']) => items.filter((i) => i.status === s).length
  const pending = count('pending')
  const total = items.length
  const treated = total - pending
  const pct = total > 0 ? Math.round((treated / total) * 100) : 0

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-white">
          {pending > 0 ? 'Génération des visuels…' : 'Génération terminée'}
        </span>
        <span className="text-[13px] text-white/60 tabular-nums">
          <b className="text-white">{treated}</b> / {total} · {pct} %
        </span>
      </div>
      <div className="h-2 rounded-full bg-well overflow-hidden">
        <div className="h-full bg-indigo-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Counter value={count('done')} label="générés" tone="text-emerald-400" always />
        <Counter value={count('failed')} label="échecs" tone="text-red-400" always />
        <Counter value={count('skipped')} label="ignorés" tone="text-white/50" />
        <Counter value={count('aborted')} label="interrompus" tone="text-amber-400" />
        <Counter value={pending} label="en attente" tone="text-sky-400" />
      </div>
    </div>
  )
}

/** Journal du traitement (auto-scroll vers la dernière ligne). */
export function ImageGenLog({ lines }: { lines: string[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [lines.length])
  if (lines.length === 0) return null
  return (
    <div className="border border-white/10 rounded bg-well max-h-36 overflow-y-auto p-2 space-y-0.5 text-[11px] font-mono">
      {lines.map((l, i) => (
        <div
          key={i}
          className={l.startsWith('✗') ? 'text-red-400/90' : l.startsWith('✓') ? 'text-emerald-400/80' : 'text-white/50'}
        >
          {l}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
