// src/features/access/admin/RolesTab.tsx
import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, X } from 'lucide-react'
import { permissionsByModule, permissionParent, permissionChildren, permissionLabel } from '@/features/access/permissions'
import { listRoles, saveRole, deleteRole, type Role } from '@/features/access/rolesApi'

export function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([])
  const [editing, setEditing] = useState<{ id?: string; name: string; permissions: Set<string> } | null>(null)
  const byModule = permissionsByModule()

  const refresh = () => { void listRoles().then(setRoles) }
  useEffect(() => { refresh() }, [])

  const startNew = () => setEditing({ name: '', permissions: new Set() })
  const startEdit = (r: Role) => setEditing({ id: r.id, name: r.name, permissions: new Set(r.permissions) })

  const toggle = (key: string) => {
    if (!editing) return
    const next = new Set(editing.permissions)
    if (next.has(key)) {
      // Décocher : retire aussi en cascade les enfants qui en dépendent.
      next.delete(key)
      for (const child of permissionChildren(key)) next.delete(child)
    } else {
      // Cocher : ajoute le(s) parent(s) requis (ex. cocher « Importer PPTX » coche aussi
      // « Ouvrir l'écran Importer »).
      next.add(key)
      let p = permissionParent(key)
      while (p) { next.add(p); p = permissionParent(p) }
    }
    setEditing({ ...editing, permissions: next })
  }

  const save = async () => {
    if (!editing || !editing.name.trim()) return
    await saveRole({ id: editing.id, name: editing.name, permissions: [...editing.permissions] })
    setEditing(null); refresh()
  }

  const remove = async (id: string) => { await deleteRole(id); refresh() }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            autoFocus value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Nom du rôle (ex. Éditeur PIM)"
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
          />
          <button onClick={save} disabled={!editing.name.trim()} className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white text-sm px-3 py-2 rounded-lg">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
          <button onClick={() => setEditing(null)} className="p-2 text-white/40 hover:text-white/80"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-col gap-3">
          {Object.entries(byModule).map(([module, defs]) => (
            <div key={module} className="bg-white/[0.03] rounded-xl p-3">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">{module}</p>
              <div className="flex flex-wrap gap-1.5">
                {defs.map((d) => {
                  const on = editing.permissions.has(d.key)
                  const parent = permissionParent(d.key)
                  // Enfant verrouillé tant que son parent (accès au module) n'est pas coché.
                  const locked = parent ? !editing.permissions.has(parent) : false
                  return (
                    <button key={d.key} onClick={() => toggle(d.key)} disabled={locked}
                      title={locked ? `Nécessite d'abord : ${permissionLabel(parent!)}` : d.key}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                        locked
                          ? 'bg-white/[0.01] border-white/5 text-white/20 cursor-not-allowed'
                          : on
                            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200'
                            : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/70'
                      }`}>
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={startNew} className="self-start flex items-center gap-1.5 text-sm text-indigo-300 hover:text-indigo-200">
        <Plus className="w-4 h-4" /> Nouveau rôle
      </button>
      {roles.map((r) => (
        <div key={r.id} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2.5">
          <button onClick={() => startEdit(r)} className="flex flex-col items-start text-left min-w-0">
            <span className="text-sm text-white/90">{r.name}</span>
            <span className="text-[10px] text-white/30">{r.permissions.length} permission(s)</span>
          </button>
          <button onClick={() => remove(r.id)} className="p-1.5 text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      {roles.length === 0 && <p className="text-[11px] text-white/20 text-center py-3">Aucun rôle — clique « Nouveau rôle ».</p>}
    </div>
  )
}
