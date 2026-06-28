// src/features/analytics/admin/AnalyticsRecent.tsx
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { AnalyticsEvent } from '../metrics'
import { recentEvents, pageLabel, isInternalActivity, moduleGroupOf, MODULE_GROUP_ORDER } from '../metrics'

const DEVICE_FR: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' }
const SEL = 'bg-surface-2 text-white/80 rounded px-2 py-1 border border-white/10 text-xs'

export function AnalyticsRecent({ events }: { events: AnalyticsEvent[] }) {
  const [device, setDevice] = useState('all')
  const [q, setQ] = useState('')

  // Tri par récence, hors navigation interne (tableau de bord / workflows / accueil).
  const sorted = useMemo(
    () => recentEvents(events, events.length).filter((e) => !isInternalActivity(e.path)),
    [events],
  )
  const devices = useMemo(() => [...new Set(sorted.map((e) => e.device))], [sorted])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sorted.filter(
      (e) =>
        (device === 'all' || e.device === device) &&
        (needle === '' || pageLabel(e.path).toLowerCase().includes(needle)),
    )
  }, [sorted, device, q])

  // Regroupé par groupe de modules (même découpage que le corps de mail du rapport).
  const groups = useMemo(
    () =>
      MODULE_GROUP_ORDER.map((group) => ({
        group,
        items: filtered.filter((e) => moduleGroupOf(e.path) === group),
      })).filter((s) => s.items.length > 0),
    [filtered],
  )

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-white/70 text-sm font-medium">
          Activité récente
          <span className="text-white/30 font-normal ml-2">{filtered.length.toLocaleString('fr-FR')} événements</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une page…"
            className="bg-surface-2 text-white/80 rounded pl-7 pr-2 py-1 border border-white/10 text-xs w-44 placeholder:text-white/30"
          />
        </div>
        {devices.length > 1 && (
          <select value={device} onChange={(e) => setDevice(e.target.value)} className={SEL}>
            <option value="all">Tous appareils</option>
            {devices.map((d) => <option key={d} value={d}>{DEVICE_FR[d] ?? d}</option>)}
          </select>
        )}
      </div>

      <div className="max-h-[560px] overflow-auto -mx-1 px-1">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <div className="text-[10px] uppercase tracking-wider text-violet-300/90 font-medium mt-3 mb-1 first:mt-0">
              {group}
            </div>
            {items.map((e, i) => (
              <div
                key={`${e.vid}-${e.ts}-${i}`}
                className="flex justify-between text-xs text-white/70 py-1 border-b border-white/5"
              >
                <span className="truncate" title={e.path}>{pageLabel(e.path)}</span>
                <span className="text-white/40 shrink-0 ml-2">
                  {e.device} · {e.country ?? '—'} · {new Date(e.ts).toLocaleTimeString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-white/30 text-xs py-2">Aucune activité pour ces filtres.</div>
        )}
      </div>
    </div>
  )
}
