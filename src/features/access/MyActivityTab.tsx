// src/features/access/MyActivityTab.tsx
// Vue « Mon activité » : chaque utilisateur voit SES propres actions (QUOI/QUAND).
import { useMyAuditLog } from './useAuditLog'
import { AuditLogView } from './admin/AuditLogView'

export function MyActivityTab() {
  const { data, isLoading, refetch } = useMyAuditLog()
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-white">Mon activité</h3>
        <p className="text-xs text-white/45">Tes dernières actions, filtrables par type et par date.</p>
      </div>
      <AuditLogView entries={data ?? []} loading={isLoading} onRefresh={() => refetch()} />
    </div>
  )
}
