import { useMemo, useState } from 'react'
import { Monitor, Smartphone, Tablet, Users } from 'lucide-react'
import { pageLabel, type AnalyticsEvent } from '@/features/analytics/metrics'
import { countryName, flagEmoji, timeAgo } from '@/features/analytics/pulseFormat'
import { useUsersMap } from '@/features/analytics/useUsersMap'

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor }
const ANON = '__anon__'
const PER_GROUP = 5

function place(e: AnalyticsEvent): string {
  const parts = [e.city, countryName(e.country)].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Origine inconnue'
}

interface Group {
  key: string
  label: string
  isNamed: boolean
  events: AnalyticsEvent[]
  lastTs: number
}

/** Regroupe les consultations par utilisateur : un bloc par utilisateur nommé,
 *  un bloc « Visiteurs anonymes » pour le trafic sans compte. Tri : nommés d'abord,
 *  puis par activité la plus récente. */
function groupByUser(events: AnalyticsEvent[], users: Map<string, string>): Group[] {
  const map = new Map<string, AnalyticsEvent[]>()
  for (const e of events) {
    const key = e.uid ?? ANON
    const arr = map.get(key)
    if (arr) arr.push(e)
    else map.set(key, [e])
  }
  return [...map.entries()]
    .map(([key, evs]): Group => {
      const sorted = [...evs].sort((a, b) => b.ts - a.ts)
      const isNamed = key !== ANON
      return { key, label: isNamed ? users.get(key) ?? key : 'Visiteurs anonymes', isNamed, events: sorted, lastTs: sorted[0].ts }
    })
    .sort((a, b) => Number(b.isNamed) - Number(a.isNamed) || b.lastTs - a.lastTs)
}

function Row({ e, now }: { e: AnalyticsEvent; now: number }) {
  const Icon = DEVICE_ICON[e.device]
  return (
    <li className="pulse-in flex items-center gap-3 py-2">
      <span className="text-[16px] leading-none" aria-hidden>{flagEmoji(e.country)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{pageLabel(e.path)}</p>
        <p className="truncate text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>{place(e)}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--pulse-text-2)' }}>{timeAgo(e.ts, now)}</span>
        <Icon size={13} style={{ color: 'var(--pulse-text-3)' }} />
      </div>
    </li>
  )
}

function GroupBlock({ g, now, expanded }: { g: Group; now: number; expanded: boolean }) {
  const shown = expanded ? g.events : g.events.slice(0, PER_GROUP)
  const rest = g.events.length - shown.length
  const initial = g.label.trim().charAt(0).toUpperCase() || '?'
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2.5 pb-1 pt-1">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
          style={{
            background: g.isNamed ? 'var(--pulse-accent-soft)' : 'var(--pulse-surface-2)',
            color: g.isNamed ? 'var(--pulse-accent-2)' : 'var(--pulse-text-3)',
          }}
        >
          {g.isNamed ? initial : <Users size={13} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{g.label}</span>
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--pulse-text-3)' }}>
          {g.events.length} · {timeAgo(g.lastTs, now)}
        </span>
      </div>
      <ul className="divide-y divide-[color:var(--pulse-hair)] pl-[34px]">
        {shown.map((e, i) => (
          <Row key={`${e.vid}-${e.ts}-${i}`} e={e} now={now} />
        ))}
      </ul>
      {rest > 0 && (
        <p className="py-1.5 pl-[34px] text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>
          +{rest} autre{rest > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

/** Journal « qui se connecte » groupé par utilisateur. */
export function PulseLiveFeed({ events }: { events: AnalyticsEvent[] }) {
  const users = useUsersMap()
  const now = Date.now()
  const [expanded, setExpanded] = useState(false)
  const groups = useMemo(() => groupByUser(events, users), [events, users])
  const capped = groups.some((g) => g.events.length > PER_GROUP)

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold">Journal de consultation</h2>
        <span className="text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>{events.length} consultations</span>
      </div>
      <div className="pulse-card px-4 py-1">
        {events.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: 'var(--pulse-text-3)' }}>Aucune visite sur cette période.</p>
        ) : (
          <>
            <div className="divide-y divide-[color:var(--pulse-hair)]">
              {groups.map((g) => (
                <GroupBlock key={g.key} g={g} now={now} expanded={expanded} />
              ))}
            </div>
            {capped && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="pulse-tap w-full py-3 text-[13px] font-semibold"
                style={{ color: 'var(--pulse-accent-2)' }}
              >
                {expanded ? 'Réduire' : 'Afficher toutes les consultations'}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}
