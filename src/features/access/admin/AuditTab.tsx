// Onglet admin : journal d'audit complet (toutes les actions de tous les utilisateurs),
// filtrable QUI / QUOI / QUAND.
import { useAuditLogAll } from '../useAuditLog'
import { AuditLogView } from './AuditLogView'

export function AuditTab() {
  const { data, isLoading, refetch } = useAuditLogAll(true)
  return (
    <div className="pb-6">
      <p className="text-xs text-white/45 mb-3">
        Qui a fait quoi, quand. 500 dernières actions — filtre par utilisateur, action et date.
      </p>
      <AuditLogView
        entries={data ?? []}
        loading={isLoading}
        showWho
        onRefresh={() => refetch()}
      />
    </div>
  )
}
