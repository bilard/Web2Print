// src/features/priceWatch/dashboard/WatchSelector.tsx
// Sélecteur du suivi actif. Défaut = le plus récemment mis à jour (les données réelles
// vivent sous le watchId du workflow, ex. « veille-moto », pas un id codé en dur).
import type { WatchSummary } from '../useCatalogReport'
import { when } from './format'

export function WatchSelector({ watches, value, onChange }: {
  watches: WatchSummary[]
  value: string
  onChange: (id: string) => void
}) {
  if (watches.length <= 1) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/40">Suivi</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-well text-white/80 text-sm rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-white/25">
        {watches.map((w) => (
          <option key={w.watchId} value={w.watchId}>
            {w.label || w.watchId}{w.lastReportAt ? ` — ${when(w.lastReportAt)}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
