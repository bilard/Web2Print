// src/features/analytics/admin/AnalyticsFilters.tsx
import { topBy, topSources, pageLabel, type AnalyticsEvent, type EventFilter } from '../metrics'

const DEVICE_FR: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' }

interface Opt {
  value: string
  label: string
}

function Field({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Opt[]
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-white/45">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-2 text-white/80 rounded px-2 py-1 border border-white/10 max-w-[180px]"
      >
        <option value="all">Tous</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Barre de filtres d'affichage : appareil, pays, page/section (façon Google Analytics). */
export function AnalyticsFilters({
  events,
  filter,
  onChange,
}: {
  events: AnalyticsEvent[]
  filter: EventFilter
  onChange: (f: EventFilter) => void
}) {
  const devices: Opt[] = topBy(events, 'device', 99).map((r) => ({
    value: r.label,
    label: DEVICE_FR[r.label] ?? r.label,
  }))
  const countries: Opt[] = topBy(events, 'country', 99).map((r) => ({ value: r.label, label: r.label }))
  const pages: Opt[] = topBy(events, 'path', 99).map((r) => ({ value: r.label, label: pageLabel(r.label) }))
  const sources: Opt[] = topSources(events, 99).map((r) => ({ value: r.label, label: r.label }))

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Field label="Appareil" value={filter.device} options={devices} onChange={(v) => onChange({ ...filter, device: v })} />
      <Field label="Pays" value={filter.country} options={countries} onChange={(v) => onChange({ ...filter, country: v })} />
      <Field label="Page" value={filter.page} options={pages} onChange={(v) => onChange({ ...filter, page: v })} />
      <Field label="Source" value={filter.source} options={sources} onChange={(v) => onChange({ ...filter, source: v })} />
    </div>
  )
}
