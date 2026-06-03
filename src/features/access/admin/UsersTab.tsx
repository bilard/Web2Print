// src/features/access/admin/UsersTab.tsx
import { useEffect, useState } from 'react'
import { permissionsByModule, permissionLabel } from '@/features/access/permissions'
import { listUsers, updateUserAccess, type ManagedUser } from '@/features/access/usersApi'
import { listRoles, type Role } from '@/features/access/rolesApi'

export function UsersTab() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const byModule = permissionsByModule()

  const refresh = () => { void listUsers().then(setUsers) }
  useEffect(() => { refresh(); void listRoles().then(setRoles) }, [])

  const setRole = async (u: ManagedUser, roleId: string) => {
    await updateUserAccess(u.uid, { accessRoleId: roleId || null })
    refresh()
  }

  const toggleOverride = async (u: ManagedUser, key: string, kind: 'grant' | 'revoke') => {
    const field = kind === 'grant' ? 'accessGrants' : 'accessRevokes'
    const cur = new Set(u[field])
    cur.has(key) ? cur.delete(key) : cur.add(key)
    await updateUserAccess(u.uid, { [field]: [...cur] })
    refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      {users.map((u) => (
        <div key={u.uid} className="bg-white/[0.03] rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-3">
            {u.photoURL
              ? <img src={u.photoURL} alt="" className="w-7 h-7 rounded-full" />
              : <div className="w-7 h-7 rounded-full bg-white/10" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/90 truncate">{u.displayName || u.email}</p>
              <p className="text-[10px] text-white/30 truncate">{u.email}</p>
            </div>
            <select
              value={u.accessRoleId ?? ''}
              onChange={(e) => setRole(u, e.target.value)}
              className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80"
            >
              <option value="">— en attente —</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button onClick={() => setExpanded(expanded === u.uid ? null : u.uid)} className="text-[11px] text-white/40 hover:text-white/70 px-1">
              surcharges
            </button>
          </div>

          {expanded === u.uid && (
            <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-2">
              {Object.entries(byModule).map(([module, defs]) => (
                <div key={module}>
                  <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider mb-1">{module}</p>
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
          )}
        </div>
      ))}
      {users.length === 0 && <p className="text-[11px] text-white/20 text-center py-3">Aucun utilisateur.</p>}
    </div>
  )
}
