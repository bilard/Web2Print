// src/features/analytics/admin/AnalyticsRecent.tsx
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { AnalyticsEvent } from '../metrics'
import { recentEvents, pageLabel, isInternalActivity } from '../metrics'

const PAGE_SIZE = 12
const AREA_FR: Record<string, string> = { promo: 'Site (promo)', docs: 'Documentation', app: 'Application', other: 'Autre' }
const DEVICE_FR: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' }
const SEL = 'bg-surface-2 text-white/80 rounded px-2 py-1 border border-white/10 text-xs'

export function AnalyticsRecent({ events }: { events: AnalyticsEvent[] }) {
  const [area, setArea] = useState('all')
  const [device, setDevice] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  // Tri par récence, hors navigation interne (tableau de bord / workflows).
  const sorted = useMemo(
    () => recentEvents(events, events.length).filter((e) => !isInternalActivity(e.path)),
    [events],
  )
  const areas = useMemo(() => [...new Set(sorted.map((e) => e.area))], [sorted])
  const devices = useMemo(() => [...new Set(sorted.map((e) => e.device))], [sorted])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sorted.filter(
      (e) =>
        (area === 'all' || e.area === area) &&
        (device === 'all' || e.device === device) &&
        (needle === '' || pageLabel(e.path).toLowerCase().includes(needle)),
    )
  }, [sorted, area, device, q])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1) // borne si la liste a rétréci
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-white/70 text-sm font-medium">
          Activité récente
          <span className="text-white/30 font-normal ml-2">{filtered.length.toLocaleString('fr-FR')} événements</span>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, current - 1))}
              disabled={current === 0}
              aria-label="Page précédente"
              className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-white/40 text-xs tabular-nums">{current + 1} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, current + 1))}
              disabled={current >= pageCount - 1}
              aria-label="Page suivante"
              className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0) }}
            placeholder="Rechercher une page…"
            className="bg-surface-2 text-white/80 rounded pl-7 pr-2 py-1 border border-white/10 text-xs w-44 placeholder:text-white/30"
          />
        </div>
        {areas.length > 1 && (
          <select value={area} onChange={(e) => { setArea(e.target.value); setPage(0) }} className={SEL}>
            <option value="all">Toutes catégories</option>
            {areas.map((a) => <option key={a} value={a}>{AREA_FR[a] ?? a}</option>)}
          </select>
        )}
        {devices.length > 1 && (
          <select value={device} onChange={(e) => { setDevice(e.target.value); setPage(0) }} className={SEL}>
            <option value="all">Tous appareils</option>
            {devices.map((d) => <option key={d} value={d}>{DEVICE_FR[d] ?? d}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-1">
        {slice.map((e, i) => (
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
        {slice.length === 0 && (
          <div className="text-white/30 text-xs py-2">Aucune activité pour ces filtres.</div>
        )}
      </div>
    </div>
  )
}
