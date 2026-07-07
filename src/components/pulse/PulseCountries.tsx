import { useMemo, useState } from 'react'
import { countryCityStats, type AnalyticsEvent } from '@/features/analytics/metrics'
import { countryName, flagEmoji } from '@/features/analytics/pulseFormat'

const COLLAPSED = 12
const shortDate = (ts: number) =>
  new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Section « Pays » : toutes les villes · visites · dernière visite (parité desktop, sans troncature). */
export function PulseCountries({ events }: { events: AnalyticsEvent[] }) {
  const rows = useMemo(() => countryCityStats(events, 300), [events])
  const [expanded, setExpanded] = useState(false)
  const max = rows[0]?.count ?? 1
  const shown = expanded ? rows : rows.slice(0, COLLAPSED)

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold">Pays</h2>
        <span className="text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>pays · ville · visites</span>
      </div>
      <div className="pulse-card px-4 py-1">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: 'var(--pulse-text-3)' }}>Aucune localisation.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--pulse-hair)]">
            {shown.map((r, i) => (
              <li key={`${r.country}-${r.city}-${i}`} className="flex items-center gap-2.5 py-2.5">
                <span className="text-[18px] leading-none" aria-hidden>{flagEmoji(r.country)}</span>
                {/* Colonne Pays (en premier) */}
                <span
                  className="w-[92px] shrink-0 truncate text-[14px] font-semibold"
                  title={countryName(r.country) ?? undefined}
                >
                  {countryName(r.country) ?? '—'}
                </span>
                {/* Colonne Ville (+ barre de volume) */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]" style={{ color: 'var(--pulse-text-2)' }}>{r.city ?? 'Ville inconnue'}</p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'var(--pulse-surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, (r.count / max) * 100)}%`, background: 'var(--pulse-accent)' }} />
                  </div>
                </div>
                {/* Colonne Visites + dernière visite */}
                <div className="flex w-[64px] shrink-0 flex-col items-end">
                  <span className="pulse-tnum text-[14px] font-semibold">{r.count}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: 'var(--pulse-text-3)' }}>{shortDate(r.lastTs)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {rows.length > COLLAPSED && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="pulse-tap w-full py-3 text-[13px] font-semibold"
            style={{ color: 'var(--pulse-accent-2)' }}
          >
            {expanded ? 'Réduire' : `Afficher les ${rows.length} villes`}
          </button>
        )}
      </div>
    </section>
  )
}
