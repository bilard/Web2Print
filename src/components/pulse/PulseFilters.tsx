import { useMemo } from 'react'
import { X } from 'lucide-react'
import { pageLabel, topBy, topSourceCategories, NO_FILTER, type AnalyticsEvent, type EventFilter } from '@/features/analytics/metrics'
import { useUsersMap } from '@/features/analytics/useUsersMap'
import { t } from '@/lib/i18n'

const DEVICE_FR: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' }
const ZONE_OPTS = [
  { value: 'site', label: 'Site web' },
  { value: 'app', label: 'Application' },
]

interface Opt {
  value: string
  label: string
}

/** Pill = <select> natif (picker iOS). L'option « tout » porte le nom du champ ;
 *  la pill se colore quand un filtre est actif. */
function Pill({ field, value, opts, onChange }: { field: string; value: string; opts: Opt[]; onChange: (v: string) => void }) {
  const active = value !== 'all'
  return (
    <div
      className="pulse-tap relative inline-flex shrink-0 items-center rounded-full pl-3.5 pr-7 py-1.5 text-[13px] font-semibold"
      style={{
        background: active ? 'var(--pulse-accent)' : 'var(--pulse-surface-2)',
        color: active ? '#fff' : 'var(--pulse-text-2)',
      }}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={field}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="all">{field}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="pointer-events-none max-w-[130px] truncate">
        {active ? opts.find((o) => o.value === value)?.label ?? value : field}
      </span>
      <svg className="pointer-events-none absolute right-2.5 h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

interface PulseFiltersProps {
  events: AnalyticsEvent[]
  filter: EventFilter
  onChange: (f: EventFilter) => void
}

/** Barre de filtres horizontale (zone, utilisateur, page, appareil, pays, source). */
export function PulseFilters({ events, filter, onChange }: PulseFiltersProps) {
  const usersMap = useUsersMap()
  const { devices, countries, pages, sources, users } = useMemo(() => {
    const userCounts = new Map<string, number>()
    for (const e of events) if (e.uid) userCounts.set(e.uid, (userCounts.get(e.uid) ?? 0) + 1)
    return {
      devices: topBy(events, 'device', 99).map((r) => ({ value: r.label, label: DEVICE_FR[r.label] ?? r.label })),
      countries: topBy(events, 'country', 99).map((r) => ({ value: r.label, label: r.label })),
      pages: topBy(events, 'path', 99).map((r) => ({ value: r.label, label: pageLabel(r.label) })),
      sources: topSourceCategories(events, 99).map((r) => ({ value: r.label, label: r.label })),
      users: [...userCounts.entries()].sort((a, b) => b[1] - a[1]).map(([uid]) => ({ value: uid, label: usersMap.get(uid) ?? uid })),
    }
  }, [events, usersMap])

  const dirty = JSON.stringify(filter) !== JSON.stringify(NO_FILTER)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dirty && (
        <button
          onClick={() => onChange(NO_FILTER)}
          className="pulse-tap flex shrink-0 items-center gap-1 rounded-full py-1.5 pl-2.5 pr-3 text-[13px] font-semibold"
          style={{ background: 'var(--pulse-surface-2)', color: 'var(--pulse-text)' }}
          aria-label={t('pu.resetFilters')}
        >
          <X size={14} /> Réinitialiser
        </button>
      )}
      {users.length > 0 && <Pill field="Utilisateur" value={filter.user} opts={users} onChange={(v) => onChange({ ...filter, user: v })} />}
      <Pill field="Page" value={filter.page} opts={pages} onChange={(v) => onChange({ ...filter, page: v })} />
      <Pill field="Appareil" value={filter.device} opts={devices} onChange={(v) => onChange({ ...filter, device: v })} />
      <Pill field="Pays" value={filter.country} opts={countries} onChange={(v) => onChange({ ...filter, country: v })} />
      <Pill field="Zone" value={filter.zone} opts={ZONE_OPTS} onChange={(v) => onChange({ ...filter, zone: v })} />
      <Pill field="Source" value={filter.source} opts={sources} onChange={(v) => onChange({ ...filter, source: v })} />
    </div>
  )
}
