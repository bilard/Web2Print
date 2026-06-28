// src/features/analytics/admin/AnalyticsTopLists.tsx
import { topBy, topSources, pageLabel, type AnalyticsEvent } from '../metrics'

interface Row {
  label: string
  count: number
  /** Valeur brute (ex. chemin) affichée en infobulle. */
  raw?: string
}

function List({ title, rows }: { title: string; rows: Row[] }) {
  const max = rows[0]?.count ?? 1
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">{title}</div>
      <div className="space-y-2">
        {rows.length === 0 && <div className="text-white/35 text-xs">Aucune donnée</div>}
        {rows.map((r) => (
          <div key={r.raw ?? r.label} className="relative">
            <div
              className="absolute inset-0 bg-indigo-500/15 rounded"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
            <div className="relative flex justify-between text-xs px-2 py-1">
              <span className="text-white/80 truncate" title={r.raw ?? r.label}>{r.label}</span>
              <span className="text-white/50">{r.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalyticsTopLists({ events }: { events: AnalyticsEvent[] }) {
  const pages: Row[] = topBy(events, 'path', 8).map((r) => ({
    label: pageLabel(r.label),
    count: r.count,
    raw: r.label,
  }))
  // Fragment (pas de grille) : les panneaux s'insèrent dans le masonry d'AnalyticsTab.
  return (
    <>
      <List title="Pages consultées" rows={pages} />
      <List title="Sources de trafic" rows={topSources(events, 8)} />
      <List title="Pays" rows={topBy(events, 'country', 8)} />
    </>
  )
}
