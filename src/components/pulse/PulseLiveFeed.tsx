import { useMemo, useState } from 'react'
import { ChevronDown, Monitor, Smartphone, Tablet, Users } from 'lucide-react'
import { pageLabel, type AnalyticsEvent } from '@/features/analytics/metrics'
import { countryName, flagEmoji, timeAgo } from '@/features/analytics/pulseFormat'
import { useUsersMap } from '@/features/analytics/useUsersMap'
import { t } from '@/lib/i18n'

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

interface CountrySub { code: string; label: string; events: AnalyticsEvent[]; lastTs: number }

/** Sous-groupe les événements par pays (pays triés par nombre de consultations). */
function groupByCountry(events: AnalyticsEvent[]): CountrySub[] {
  const map = new Map<string, AnalyticsEvent[]>()
  for (const e of events) {
    const code = e.country ?? '__none__'
    const arr = map.get(code)
    if (arr) arr.push(e); else map.set(code, [e])
  }
  return [...map.entries()]
    .map(([code, evs]): CountrySub => ({ code, label: (code === '__none__' ? null : countryName(code)) ?? 'Origine inconnue', events: evs, lastTs: evs[0]?.ts ?? 0 }))
    .sort((a, b) => b.events.length - a.events.length || b.lastTs - a.lastTs)
}

function GroupHeader({ g, now, collapsed, onToggle }: { g: Group; now: number; collapsed: boolean; onToggle: () => void }) {
  const initial = g.label.trim().charAt(0).toUpperCase() || '?'
  return (
    <button type="button" onClick={onToggle} className="pulse-tap flex w-full items-center gap-2.5 pb-1 pt-1 text-left">
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
      <ChevronDown size={15} className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} style={{ color: 'var(--pulse-text-3)' }} />
    </button>
  )
}

/** Bloc « Visiteurs anonymes » : consultations sous-groupées par pays. */
function AnonGroupBlock({ g, now, expanded }: { g: Group; now: number; expanded: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  const byCountry = groupByCountry(g.events)
  return (
    <div className="py-1.5">
      <GroupHeader g={g} now={now} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      {!collapsed && (
      <div className="space-y-2 pl-[34px]">
        {byCountry.map((c) => {
          const shown = expanded ? c.events : c.events.slice(0, PER_GROUP)
          const rest = c.events.length - shown.length
          return (
            <div key={c.code}>
              <div className="flex items-baseline gap-2 pb-0.5">
                <span className="text-[16px] leading-none" aria-hidden>{flagEmoji(c.code === '__none__' ? null : c.code)}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" style={{ color: 'var(--pulse-text-2)' }}>{c.label}</span>
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--pulse-text-3)' }}>{c.events.length}</span>
              </div>
              <ul className="divide-y divide-[color:var(--pulse-hair)] pl-[24px]">
                {shown.map((e, i) => (
                  <Row key={`${e.vid}-${e.ts}-${i}`} e={e} now={now} />
                ))}
              </ul>
              {rest > 0 && (
                <p className="py-1 pl-[24px] text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>
                  +{rest} autre{rest > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}

function GroupBlock({ g, now, expanded }: { g: Group; now: number; expanded: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  if (!g.isNamed) return <AnonGroupBlock g={g} now={now} expanded={expanded} />
  const shown = expanded ? g.events : g.events.slice(0, PER_GROUP)
  const rest = g.events.length - shown.length
  return (
    <div className="py-1.5">
      <GroupHeader g={g} now={now} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      {!collapsed && (
        <>
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
        </>
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
          <p className="py-6 text-center text-[13px]" style={{ color: 'var(--pulse-text-3)' }}>{t('pu.noVisit')}</p>
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
