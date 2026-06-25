// src/features/access/admin/AuditLogView.tsx
// Affichage filtrable du journal d'audit : QUI (utilisateur) / QUOI (action) / QUAND
// (plage de dates). Réutilisé par l'onglet admin (showWho) et la vue « Mon activité ».
import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { auditActionLabel, type AuditEntry } from '@/lib/auditLog'

interface Props {
  entries: AuditEntry[]
  loading?: boolean
  showWho?: boolean // afficher le filtre + la colonne « Qui » (vue admin)
  onRefresh?: () => void
}

const sel = 'bg-well border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50'

function fmt(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function AuditLogView({ entries, loading, showWho = false, onRefresh }: Props) {
  const [who, setWho] = useState('')
  const [what, setWhat] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const whoOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.userEmail).filter(Boolean))).sort(),
    [entries],
  )
  const whatOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  )

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null
    const toTs = to ? new Date(to + 'T23:59:59').getTime() : null
    return entries.filter((e) => {
      if (who && e.userEmail !== who) return false
      if (what && e.action !== what) return false
      const ts = e.createdAt?.getTime() ?? 0
      if (fromTs && ts < fromTs) return false
      if (toTs && ts > toTs) return false
      return true
    })
  }, [entries, who, what, from, to])

  const reset = () => { setWho(''); setWhat(''); setFrom(''); setTo('') }

  return (
    <div className="space-y-3">
      {/* Filtres QUI / QUOI / QUAND */}
      <div className="flex flex-wrap items-center gap-2">
        {showWho && (
          <select className={sel} value={who} onChange={(e) => setWho(e.target.value)} title="Qui">
            <option value="">Qui : tous</option>
            {whoOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select className={sel} value={what} onChange={(e) => setWhat(e.target.value)} title="Quoi">
          <option value="">Quoi : toutes les actions</option>
          {whatOptions.map((o) => <option key={o} value={o}>{auditActionLabel(o)}</option>)}
        </select>
        <label className="text-xs text-white/40">Du</label>
        <input type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="text-xs text-white/40">au</label>
        <input type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} />
        {(who || what || from || to) && (
          <button onClick={reset} className="text-xs text-white/50 hover:text-white px-2 py-1">Réinitialiser</button>
        )}
        <span className="text-xs text-white/40 ml-auto">{filtered.length} action(s)</span>
        {onRefresh && (
          <button onClick={onRefresh} className="flex items-center gap-1 text-xs text-white/50 hover:text-white px-1">
            <RefreshCw className="h-3 w-3" /> Rafraîchir
          </button>
        )}
      </div>

      {/* En-tête tableau */}
      <div className="flex items-center gap-3 px-3 text-[10px] uppercase tracking-wide text-white/35">
        <span className="w-28 shrink-0">Quand</span>
        {showWho && <span className="w-44 shrink-0">Qui</span>}
        <span className="w-40 shrink-0">Action</span>
        <span className="w-24 shrink-0">Module</span>
        <span className="flex-1 min-w-0">Cible</span>
      </div>

      {/* Lignes */}
      <div className="space-y-1">
        {loading && <p className="text-xs text-white/40 px-3">Chargement…</p>}
        {!loading && filtered.length === 0 && <p className="text-xs text-white/40 px-3">Aucune action.</p>}
        {filtered.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded bg-surface-2 px-3 py-2 text-xs">
            <span className="w-28 shrink-0 text-white/50 tabular-nums">{fmt(e.createdAt)}</span>
            {showWho && <span className="w-44 shrink-0 text-white truncate" title={e.userEmail}>{e.userName || e.userEmail || '—'}</span>}
            <span className="w-40 shrink-0 text-white">{auditActionLabel(e.action)}</span>
            <span className="w-24 shrink-0 text-white/45">{e.module}</span>
            <span className="flex-1 min-w-0 text-white/70 truncate" title={e.targetLabel ?? e.targetId ?? ''}>
              {e.targetLabel ?? e.targetId ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
