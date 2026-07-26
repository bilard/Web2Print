// Aperçu du test (1 image), compteurs de progression et journal du traitement.
import { useEffect, useRef } from 'react'
import type { ImageGenItem } from './useColumnImageGen'

export function ImageGenTestPreview({ src }: { src: string }) {
  return (
    <div className="border border-white/10 rounded p-2 flex items-center gap-3">
      <img src={src} alt="Aperçu du visuel généré" className="w-24 h-24 object-contain rounded bg-white/5" />
      <div className="text-white/60 text-[12px]">
        Aperçu (non enregistré). Ajustez la consigne si besoin, puis lancez la génération.
      </div>
    </div>
  )
}

export function ImageGenCounters({ items }: { items: ImageGenItem[] }) {
  const count = (s: ImageGenItem['status']) => items.filter((i) => i.status === s).length
  const aborted = count('aborted')
  return (
    <div className="flex gap-3 text-[12px]">
      <span className="text-emerald-400">{count('done')} générés</span>
      <span className="text-white/50">{count('skipped')} ignorés</span>
      <span className="text-red-400">{count('failed')} échecs</span>
      <span className="text-sky-400">{count('pending')} en cours</span>
      {aborted > 0 && <span className="text-amber-400">{aborted} interrompus</span>}
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
