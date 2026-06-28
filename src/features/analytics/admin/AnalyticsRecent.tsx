// src/features/analytics/admin/AnalyticsRecent.tsx
import type { AnalyticsEvent } from '../metrics'
import { recentEvents, pageLabel } from '../metrics'

export function AnalyticsRecent({ events }: { events: AnalyticsEvent[] }) {
  const recent = recentEvents(events)
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">Activité récente</div>
      <div className="space-y-1 max-h-64 overflow-auto">
        {recent.map((e, i) => (
          <div
            key={`${e.vid}-${e.ts}-${i}`}
            className="flex justify-between text-xs text-white/70 py-1 border-b border-white/5"
          >
            <span className="truncate" title={e.path}>{pageLabel(e.path)}</span>
            <span className="text-white/40 shrink-0 ml-2">
              {e.device} · {e.country ?? '—'} · {new Date(e.ts).toLocaleTimeString('fr-FR')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
