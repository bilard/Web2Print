// src/features/analytics/admin/AnalyticsTopLists.tsx
import { topBy, topSources, type AnalyticsEvent } from '../metrics'

function List({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = rows[0]?.count ?? 1
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">{title}</div>
      <div className="space-y-2">
        {rows.length === 0 && <div className="text-white/35 text-xs">Aucune donnée</div>}
        {rows.map((r) => (
          <div key={r.label} className="relative">
            <div
              className="absolute inset-0 bg-indigo-500/15 rounded"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
            <div className="relative flex justify-between text-xs px-2 py-1">
              <span className="text-white/80 truncate">{r.label}</span>
              <span className="text-white/50">{r.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalyticsTopLists({ events }: { events: AnalyticsEvent[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <List title="Top pages" rows={topBy(events, 'path', 8)} />
      <List title="Sources de trafic" rows={topSources(events, 8)} />
      <List title="Pays" rows={topBy(events, 'country', 8)} />
    </div>
  )
}
