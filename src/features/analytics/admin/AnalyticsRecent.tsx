// src/features/analytics/admin/AnalyticsRecent.tsx
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AnalyticsEvent } from '../metrics'
import { recentEvents, pageLabel } from '../metrics'

const PAGE_SIZE = 12

export function AnalyticsRecent({ events }: { events: AnalyticsEvent[] }) {
  const sorted = useMemo(() => recentEvents(events, events.length), [events])
  const [page, setPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1) // borne si les events ont rétréci
  const slice = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-white/70 text-sm font-medium">
          Activité récente
          <span className="text-white/30 font-normal ml-2">{sorted.length.toLocaleString('fr-FR')} événements</span>
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
          <div className="text-white/30 text-xs py-2">Aucune activité sur la période.</div>
        )}
      </div>
    </div>
  )
}
