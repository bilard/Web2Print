import { useMemo, useState } from 'react'
import { countryGroupStats, type AnalyticsEvent } from '@/features/analytics/metrics'
import { countryName, flagEmoji } from '@/features/analytics/pulseFormat'

const COLLAPSED = 6
const shortDate = (ts: number) =>
  new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Section « Pays » : villes regroupées par pays, pays triés par visites décroissantes. */
export function PulseCountries({ events }: { events: AnalyticsEvent[] }) {
  const groups = useMemo(() => countryGroupStats(events), [events])
  const [expanded, setExpanded] = useState(false)
  const maxCountry = groups[0]?.count ?? 1
  const shown = expanded ? groups : groups.slice(0, COLLAPSED)

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold">Pays</h2>
        <span className="text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>pays · villes · visites</span>
      </div>
      <div className="pulse-card px-4 py-1">
        {groups.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: 'var(--pulse-text-3)' }}>Aucune localisation.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--pulse-hair)]">
            {shown.map((g, i) => {
              const maxCity = g.cities[0]?.count ?? 1
              return (
                <li key={`${g.country}-${i}`} className="py-2.5">
                  {/* En-tête pays : drapeau · nom · total · barre relative aux autres pays */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-[18px] leading-none" aria-hidden>{flagEmoji(g.country)}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold" title={countryName(g.country) ?? undefined}>
                      {countryName(g.country) ?? '—'}
                    </span>
                    <div className="flex w-[64px] shrink-0 flex-col items-end">
                      <span className="pulse-tnum text-[14px] font-semibold">{g.count}</span>
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--pulse-text-3)' }}>{shortDate(g.lastTs)}</span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--pulse-surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, (g.count / maxCountry) * 100)}%`, background: 'var(--pulse-accent)' }} />
                  </div>
                  {/* Villes du pays, indentées sous le drapeau */}
                  <ul className="mt-2 space-y-1.5 pl-[28px]">
                    {g.cities.map((c, j) => (
                      <li key={`${c.city}-${j}`} className="flex items-center gap-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px]" style={{ color: 'var(--pulse-text-2)' }}>{c.city ?? 'Ville inconnue'}</p>
                          <div className="mt-1 h-0.5 overflow-hidden rounded-full" style={{ background: 'var(--pulse-surface-2)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.max(4, (c.count / maxCity) * 100)}%`, background: 'var(--pulse-accent-2)' }} />
                          </div>
                        </div>
                        <div className="flex w-[64px] shrink-0 flex-col items-end">
                          <span className="pulse-tnum text-[13px]" style={{ color: 'var(--pulse-text-2)' }}>{c.count}</span>
                          <span className="text-[11px] tabular-nums" style={{ color: 'var(--pulse-text-3)' }}>{shortDate(c.lastTs)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        )}
        {groups.length > COLLAPSED && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="pulse-tap w-full py-3 text-[13px] font-semibold"
            style={{ color: 'var(--pulse-accent-2)' }}
          >
            {expanded ? 'Réduire' : `Afficher les ${groups.length} pays`}
          </button>
        )}
      </div>
    </section>
  )
}
