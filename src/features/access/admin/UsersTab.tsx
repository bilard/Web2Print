// src/features/access/admin/UsersTab.tsx
import { useEffect, useMemo, useState } from 'react'
import { Search, Ban, RotateCcw, CheckCircle2 } from 'lucide-react'
import { permissionsByModule, permissionLabel } from '@/features/access/permissions'
import { listUsers, updateUserAccess, type ManagedUser } from '@/features/access/usersApi'
import { listRoles, type Role } from '@/features/access/rolesApi'
import { computeEffectivePermissions } from '@/features/access/computePermissions'
import { isOwnerEmail } from '@/features/auth/useAuth'

const DAY = 86_400_000

function formatLastSeen(ts: number): string {
  if (!ts) return 'jamais vu'
  const diff = Date.now() - ts
  if (diff < 60_000) return "à l'instant"
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`
  if (diff < DAY) return `il y a ${Math.floor(diff / 3_600_000)} h`
  if (diff < 7 * DAY) return `il y a ${Math.floor(diff / DAY)} j`
  return new Date(ts).toLocaleDateString('fr-FR')
}

export function UsersTab() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const byModule = permissionsByModule()

  const refresh = () => { void listUsers().then(setUsers) }
  useEffect(() => { refresh(); void listRoles().then(setRoles) }, [])

  const setRole = async (u: ManagedUser, roleId: string) => {
    await updateUserAccess(u.uid, { accessRoleId: roleId || null }); refresh()
  }
  const toggleBlocked = async (u: ManagedUser) => {
    await updateUserAccess(u.uid, { accessBlocked: !u.accessBlocked }); refresh()
  }
  const resetOverrides = async (u: ManagedUser) => {
    await updateUserAccess(u.uid, { accessGrants: [], accessRevokes: [] }); refresh()
  }
  const toggleOverride = async (u: ManagedUser, key: string, kind: 'grant' | 'revoke') => {
    const field = kind === 'grant' ? 'accessGrants' : 'accessRevokes'
    const cur = new Set(u[field])
    cur.has(key) ? cur.delete(key) : cur.add(key)
    await updateUserAccess(u.uid, { [field]: [...cur] }); refresh()
  }

  const effectivePerms = (u: ManagedUser): string[] => {
    if (u.accessBlocked) return []
    const role = roles.find((r) => r.id === u.accessRoleId)
    return [...computeEffectivePermissions({
      isOwner: false,
      rolePermissions: u.accessRoleId && role ? role.permissions : null,
      grants: u.accessGrants,
      revokes: u.accessRevokes,
    })]
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? users.filter((u) => u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q))
      : users
    // Bloqués puis « en attente » en tête (action prioritaire), sinon par dernière vue.
    const rank = (u: ManagedUser) =>
      u.accessBlocked ? 0 : (!u.accessRoleId && !isOwnerEmail(u.email)) ? 1 : 2
    return [...list].sort((a, b) => rank(a) - rank(b) || b.lastSeenAt - a.lastSeenAt)
  }, [users, query])

  const pendingCount = users.filter((u) => !u.accessRoleId && !u.accessBlocked && !isOwnerEmail(u.email)).length
  const blockedCount = users.filter((u) => u.accessBlocked).length

  return (
    <div className="flex flex-col gap-2">
      {/* Recherche + récap */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px] bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-white/30" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (email ou nom)…"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 outline-none" />
        </div>
        <span className="text-[11px] text-white/40">{users.length} utilisateur(s)</span>
        {pendingCount > 0 && <span className="text-[11px] text-amber-400/80">{pendingCount} en attente</span>}
        {blockedCount > 0 && <span className="text-[11px] text-red-400/80">{blockedCount} bloqué(s)</span>}
      </div>

      {filtered.map((u) => {
        const owner = isOwnerEmail(u.email)
        const eff = effectivePerms(u)
        return (
          <div key={u.uid} className={`rounded-xl px-3 py-2.5 ${u.accessBlocked ? 'bg-red-500/[0.04] border border-red-500/15' : 'bg-white/[0.03]'}`}>
            <div className="flex items-center gap-3">
              {u.photoURL ? <img src={u.photoURL} alt="" className="w-7 h-7 rounded-full" /> : <div className="w-7 h-7 rounded-full bg-white/10" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-white/90 truncate">{u.displayName || u.email}</p>
                  {owner && <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300">admin</span>}
                  {u.accessBlocked && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-300">bloqué</span>}
                  {!u.accessBlocked && !u.accessRoleId && !owner && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300">en attente</span>}
                </div>
                <p className="text-[10px] text-white/30 truncate">{u.email} · vu {formatLastSeen(u.lastSeenAt)}</p>
              </div>
              {!owner && (
                <select value={u.accessRoleId ?? ''} onChange={(e) => setRole(u, e.target.value)} disabled={u.accessBlocked}
                  className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 disabled:opacity-40">
                  <option value="">— en attente —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <button onClick={() => setExpanded(expanded === u.uid ? null : u.uid)} className="text-[11px] text-white/40 hover:text-white/70 px-1">détails</button>
            </div>

            {expanded === u.uid && owner && (
              <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-white/30">
                Compte propriétaire — accès total, non modifiable.
              </div>
            )}

            {expanded === u.uid && !owner && (
              <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-3">
                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleBlocked(u)}
                    className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border ${u.accessBlocked ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'border-red-500/40 text-red-300 hover:bg-red-500/10'}`}>
                    {u.accessBlocked ? <><CheckCircle2 className="w-3 h-3" /> Réactiver</> : <><Ban className="w-3 h-3" /> Bloquer</>}
                  </button>
                  {(u.accessGrants.length > 0 || u.accessRevokes.length > 0) && (
                    <button onClick={() => resetOverrides(u)} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-white/10 text-white/50 hover:text-white/80">
                      <RotateCcw className="w-3 h-3" /> Réinitialiser les surcharges
                    </button>
                  )}
                </div>

                {/* Permissions effectives */}
                <div>
                  <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider mb-1">Permissions effectives ({eff.length})</p>
                  {eff.length === 0
                    ? <p className="text-[10px] text-white/30">{u.accessBlocked ? 'Compte bloqué — aucun accès.' : 'Aucune permission (compte en attente).'}</p>
                    : <div className="flex flex-wrap gap-1">{eff.map((k) => <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/60">{permissionLabel(k)}</span>)}</div>}
                </div>

                {/* Surcharges */}
                <div>
                  <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider mb-1">Surcharges (+ ajouter / − retirer)</p>
                  {Object.entries(byModule).map(([module, defs]) => (
                    <div key={module} className="mb-1">
                      <p className="text-[9px] text-white/20 mb-0.5">{module}</p>
                      <div className="flex flex-wrap gap-1">
                        {defs.map((d) => {
                          const granted = u.accessGrants.includes(d.key)
                          const revoked = u.accessRevokes.includes(d.key)
                          return (
                            <span key={d.key} className="inline-flex items-center gap-0.5">
                              <button onClick={() => toggleOverride(u, d.key, 'grant')} title={`+ ${d.key}`}
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${granted ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'border-white/10 text-white/40'}`}>+ {permissionLabel(d.key)}</button>
                              <button onClick={() => toggleOverride(u, d.key, 'revoke')} title={`− ${d.key}`}
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${revoked ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'border-white/10 text-white/40'}`}>−</button>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
      {filtered.length === 0 && <p className="text-[11px] text-white/20 text-center py-3">Aucun utilisateur{query ? ' pour cette recherche' : ''}.</p>}
    </div>
  )
}
