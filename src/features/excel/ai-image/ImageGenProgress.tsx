// src/features/excel/ai-image/ImageGenProgress.tsx
// Aperçu du test (1 image) + compteurs de progression de la génération de visuels.
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
  const failed = items.filter((i) => i.status === 'failed')
  return (
    <div className="space-y-1">
      <div className="flex gap-3 text-[12px]">
        <span className="text-emerald-400">{count('done')} générés</span>
        <span className="text-white/50">{count('skipped')} ignorés</span>
        <span className="text-red-400">{count('failed')} échecs</span>
        <span className="text-amber-400">{count('aborted')} interrompus</span>
      </div>
      {failed.length > 0 && (
        <div className="text-[11px] text-red-400/80 max-h-16 overflow-y-auto">
          {failed[0].error}
        </div>
      )}
    </div>
  )
}
