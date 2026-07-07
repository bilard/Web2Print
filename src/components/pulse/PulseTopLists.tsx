import { useMemo, useState } from 'react'
import { PulseSegmented } from './PulseSegmented'
import { PulseDeviceSplit } from './PulseDeviceSplit'
import { pageLabel, topBy, topSourceCategories, type AnalyticsEvent } from '@/features/analytics/metrics'
import { flagEmoji } from '@/features/analytics/pulseFormat'

type Tab = 'pages' | 'sources' | 'countries'
const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'pages', label: 'Pages' },
  { value: 'sources', label: 'Sources' },
  { value: 'countries', label: 'Pays' },
]

const regionName = new Intl.DisplayNames(['fr'], { type: 'region' })
function countryLabel(iso: string): string {
  try {
    return (iso.length === 2 && regionName.of(iso.toUpperCase())) || iso
  } catch {
    return iso
  }
}

interface Row {
  label: string
  count: number
  prefix?: string
}

function BarRow({ row, max }: { row: Row; max: number }) {
  const pct = max > 0 ? Math.max(4, (row.count / max) * 100) : 0
  return (
    <li className="py-2">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[14px]">
          {row.prefix && <span aria-hidden>{row.prefix}</span>}
          <span className="truncate">{row.label}</span>
        </span>
        <span className="pulse-tnum text-[13px] font-semibold" style={{ color: 'var(--pulse-text-2)' }}>{row.count}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--pulse-surface-2)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--pulse-accent), var(--pulse-accent-2))' }}
        />
      </div>
    </li>
  )
}

/** Classements Pages / Sources / Pays + répartition par appareil. */
export function PulseTopLists({ events }: { events: AnalyticsEvent[] }) {
  const [tab, setTab] = useState<Tab>('pages')
  const rows = useMemo<Row[]>(() => {
    if (tab === 'pages') return topBy(events, 'path', 6).map((r) => ({ label: pageLabel(r.label), count: r.count }))
    if (tab === 'sources') return topSourceCategories(events, 6).map((r) => ({ label: r.label, count: r.count }))
    return topBy(events, 'country', 6).map((r) => ({ label: countryLabel(r.label), count: r.count, prefix: flagEmoji(r.label) }))
  }, [events, tab])
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0)

  return (
    <section>
      <h2 className="mb-2 px-1 text-[15px] font-semibold">Classements</h2>
      <div className="pulse-card px-4 py-4">
        <PulseSegmented options={TABS} value={tab} onChange={setTab} ariaLabel="Classement par" />
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: 'var(--pulse-text-3)' }}>Pas de données.</p>
        ) : (
          <ul className="mt-2">
            {rows.map((r, i) => (
              <BarRow key={`${tab}-${r.label}-${i}`} row={r} max={max} />
            ))}
          </ul>
        )}
      </div>
      <PulseDeviceSplit events={events} />
    </section>
  )
}
