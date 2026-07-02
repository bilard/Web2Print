// src/features/analytics/admin/AnalyticsTopLists.tsx
import { topBy, topSourceCategories, pageLabel, type AnalyticsEvent } from '../metrics'

interface Row {
  label: string
  count: number
  /** Valeur brute (ex. chemin) affichée en infobulle. */
  raw?: string
}

interface ListProps {
  title: string
  rows: Row[]
  /** Rend les lignes cliquables (toggle) — clic pays → carte du monde. */
  onSelect?: (value: string | null) => void
  selected?: string | null
}

function List({ title, rows, onSelect, selected }: ListProps) {
  const max = rows[0]?.count ?? 1
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">{title}</div>
      <div className="space-y-2">
        {rows.length === 0 && <div className="text-white/35 text-xs">Aucune donnée</div>}
        {rows.map((r) => {
          const value = r.raw ?? r.label
          const active = selected != null && selected === value
          const inner = (
            <>
              <div
                className={`absolute inset-0 rounded ${active ? 'bg-indigo-500/30' : 'bg-indigo-500/15'}`}
                style={{ width: `${(r.count / max) * 100}%` }}
              />
              <div className="relative flex justify-between text-xs px-2 py-1">
                <span className="text-white/80 truncate" title={value}>{r.label}</span>
                <span className="text-white/50">{r.count}</span>
              </div>
            </>
          )
          return onSelect ? (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(active ? null : value)}
              title="Voir sur la carte"
              className={`relative block w-full text-left rounded transition-colors hover:bg-white/5 ${active ? 'ring-1 ring-indigo-400/60' : ''}`}
            >
              {inner}
            </button>
          ) : (
            <div key={value} className="relative">{inner}</div>
          )
        })}
      </div>
    </div>
  )
}

interface TopListsProps {
  events: AnalyticsEvent[]
  selectedCountry?: string | null
  onSelectCountry?: (country: string | null) => void
}

export function AnalyticsTopLists({ events, selectedCountry, onSelectCountry }: TopListsProps) {
  const pages: Row[] = topBy(events, 'path', 8).map((r) => ({
    label: pageLabel(r.label),
    count: r.count,
    raw: r.label,
  }))
  // Fragment (pas de grille) : les panneaux s'insèrent dans le masonry d'AnalyticsTab.
  return (
    <>
      <List title="Pages consultées" rows={pages} />
      <List title="Sources de trafic" rows={topSourceCategories(events, 8)} />
      <List title="Pays" rows={topBy(events, 'country', 8)} onSelect={onSelectCountry} selected={selectedCountry} />
    </>
  )
}
