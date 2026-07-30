import type { AnalyticsEvent } from '../metrics'
import { useUsersMap } from '../useUsersMap'
import { t } from '@/lib/i18n'

/** Utilisateurs connectés (uid renseigné) classés par nombre de pages vues. */
export function AnalyticsUsers({ events }: { events: AnalyticsEvent[] }) {
  const usersMap = useUsersMap()
  const counts = new Map<string, number>()
  for (const e of events) {
    if (!e.uid) continue
    counts.set(e.uid, (counts.get(e.uid) ?? 0) + 1)
  }
  const rows = [...counts.entries()]
    .map(([uid, count]) => ({ uid, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">{t('an.connectedUsers')}</div>
      {rows.length === 0 ? (
        <div className="text-white/35 text-xs">{t('an.noConnectedUser')}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.uid} className="flex justify-between text-xs px-2 py-1">
              <span className="text-white/80 truncate" title={r.uid}>
                {usersMap.get(r.uid) ?? r.uid}
              </span>
              <span className="text-white/50 shrink-0 ml-2">{r.count} vues</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
