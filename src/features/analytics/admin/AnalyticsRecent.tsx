// src/features/analytics/admin/AnalyticsRecent.tsx
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { AnalyticsEvent } from '../metrics'
import { recentEvents, pageLabel, isInternalActivity } from '../metrics'
import { useUsersMap } from '../useUsersMap'

const PAGE_SIZE = 15
const DEVICE_FR: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' }

/** Journal de consultation : qui a vu quelle page et quand (1 ligne = 1 vue de page). */
export function AnalyticsRecent({ events }: { events: AnalyticsEvent[] }) {
  const usersMap = useUsersMap()
  const [device, setDevice] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  const who = (e: AnalyticsEvent): string =>
    e.uid ? (usersMap.get(e.uid) ?? e.uid) : `Visiteur ${e.vid.slice(-4) || '—'}`
  const when = (ts: number): string =>
    new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-white/70 text-sm font-medium">
          Journal de consultation
          <span className="text-white/35 font-normal ml-2">qui · quand · quelle page — {filtered.length.toLocaleString('fr-FR')} consultations</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0) }}
              placeholder="Rechercher une page…"
              className="bg-surface-2 text-white/80 rounded pl-7 pr-2 py-1 border border-white/10 text-xs w-44 placeholder:text-white/30"
            />
          </div>
          {devices.length > 1 && (
            <select value={device} onChange={(e) => { setDevice(e.target.value); setPage(0) }} className="bg-surface-2 text-white/80 rounded px-2 py-1 border border-white/10 text-xs">
              <option value="all">Tous appareils</option>
              {devices.map((d) => <option key={d} value={d}>{DEVICE_FR[d] ?? d}</option>)}
            </select>
          )}
          {pageCount > 1 && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0} aria-label="Page précédente" className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white/40 text-xs tabular-nums">{current + 1} / {pageCount}</span>
              <button type="button" onClick={() => setPage(Math.min(pageCount - 1, current + 1))} disabled={current >= pageCount - 1} aria-label="Page suivante" className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-white/40 text-left">
              <th className="font-medium py-2 px-2 border-b border-white/10">Utilisateur</th>
              <th className="font-medium py-2 px-2 border-b border-white/10">Page</th>
              <th className="font-medium py-2 px-2 border-b border-white/10">Appareil</th>
              <th className="font-medium py-2 px-2 border-b border-white/10">Pays</th>
              <th className="font-medium py-2 px-2 border-b border-white/10 text-right whitespace-nowrap">Date &amp; heure</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((e, i) => (
              <tr key={`${e.vid}-${e.ts}-${i}`} className="hover:bg-white/[0.03]">
                <td className={`py-1.5 px-2 border-b border-white/5 truncate max-w-[200px] ${e.uid ? 'text-white/85' : 'text-white/40 italic'}`} title={e.uid ?? e.vid}>{who(e)}</td>
                <td className="py-1.5 px-2 border-b border-white/5 text-white/70 truncate max-w-[220px]" title={e.path}>{pageLabel(e.path)}</td>
                <td className="py-1.5 px-2 border-b border-white/5 text-white/55">{DEVICE_FR[e.device] ?? e.device}</td>
                <td className="py-1.5 px-2 border-b border-white/5 text-white/55">{e.country ?? '—'}</td>
                <td className="py-1.5 px-2 border-b border-white/5 text-white/55 text-right whitespace-nowrap tabular-nums">{when(e.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-white/30 text-xs py-3">Aucune consultation pour ces filtres.</div>
        )}
      </div>
    </div>
  )
}
