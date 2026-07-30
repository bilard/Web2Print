import { topBy, topSourceCategories, pageLabel, type AnalyticsEvent } from '../metrics'
import { AnalyticsCountriesTable } from './AnalyticsCountriesTable'
import { t } from '@/lib/i18n'

interface Row {
  label: string
  count: number
  /** Valeur brute (ex. chemin) affichée en infobulle. */
  raw?: string
}

interface ListProps {
  title: string
  rows: Row[]
}

function List({ title, rows }: ListProps) {
  const max = rows[0]?.count ?? 1
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">{title}</div>
      <div className="space-y-2">
        {rows.length === 0 && <div className="text-white/35 text-xs">{t('an.noData')}</div>}
        {rows.map((r) => {
          const value = r.raw ?? r.label
          return (
            <div key={value} className="relative">
              <div
                className="absolute inset-0 rounded bg-indigo-500/15"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
              <div className="relative flex justify-between text-xs px-2 py-1">
                <span className="text-white/80 truncate" title={value}>{r.label}</span>
                <span className="text-white/50">{r.count}</span>
              </div>
            </div>
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
      <List title={t('an.pagesViewed')} rows={pages} />
      <List title="Sources de trafic" rows={topSourceCategories(events, 8)} />
      {/* Panneau le plus dense (villes groupées) → 2 colonnes sur grand écran. */}
      <AnalyticsCountriesTable events={events} onSelect={onSelectCountry} selected={selectedCountry} className="xl:col-span-2" />
    </>
  )
}
