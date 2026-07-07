import { useMemo } from 'react'
import { Monitor, Smartphone, Tablet } from 'lucide-react'
import { pageLabel, recentEvents, type AnalyticsEvent } from '@/features/analytics/metrics'
import { flagEmoji, timeAgo } from '@/features/analytics/pulseFormat'
import { useUsersMap } from '@/features/analytics/useUsersMap'

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor }

function place(e: AnalyticsEvent): string {
  const parts = [e.city, e.country].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Origine inconnue'
}

function Row({ e, name, now }: { e: AnalyticsEvent; name?: string; now: number }) {
  const Icon = DEVICE_ICON[e.device]
  return (
    <li className="pulse-in flex items-center gap-3 py-2.5">
      <span className="text-[19px] leading-none" aria-hidden>{flagEmoji(e.country)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{pageLabel(e.path)}</p>
        <p className="truncate text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>
          {place(e)}
          {name ? ` · ${name}` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--pulse-text-2)' }}>{timeAgo(e.ts, now)}</span>
        <Icon size={13} style={{ color: 'var(--pulse-text-3)' }} />
      </div>
    </li>
  )
}

/** Journal « qui se connecte » : dernières visites, lieu, appareil, utilisateur nommé. */
export function PulseLiveFeed({ events }: { events: AnalyticsEvent[] }) {
  const users = useUsersMap()
  const now = Date.now()
  const recent = useMemo(() => recentEvents(events, 24), [events])

  return (
    <section>
      <h2 className="mb-2 px-1 text-[15px] font-semibold">Activité récente</h2>
      <div className="pulse-card px-4 py-1">
        {recent.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: 'var(--pulse-text-3)' }}>
            Aucune visite sur cette période.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--pulse-hair)]">
            {recent.map((e, i) => (
              <Row key={`${e.vid}-${e.ts}-${i}`} e={e} name={e.uid ? users.get(e.uid) : undefined} now={now} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
