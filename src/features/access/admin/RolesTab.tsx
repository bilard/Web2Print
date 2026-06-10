// src/features/access/admin/RolesTab.tsx
import { useEffect, useState, lazy, Suspense } from 'react'
import { Plus, Trash2, Save, X, Lock, Check, Eye, LayoutGrid, ListTree, Network, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { permissionsByModule, permissionParent, permissionChildren, permissionLabel } from '@/features/access/permissions'
import { listRoles, saveRole, deleteRole, type Role } from '@/features/access/rolesApi'
import { moduleMeta, orderedModuleEntries } from '@/features/access/moduleMeta'
import { ModuleCard } from './ModuleCard'
import { PermissionTree } from './PermissionTree'
// Lazy : embarque React Flow (lourd) uniquement quand on ouvre le mode carte mentale.
const PermissionMindMap = lazy(() => import('./PermissionMindMap').then((m) => ({ default: m.PermissionMindMap })))

type ViewMode = 'cards' | 'tree' | 'mindmap'

export function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([])
  const [editing, setEditing] = useState<{ id?: string; name: string; permissions: Set<string> } | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('mindmap')
  const [openSet, setOpenSet] = useState<Set<string>>(new Set())
  const byModule = permissionsByModule()
  const entries = orderedModuleEntries(byModule)

  const refresh = () => { void listRoles().then(setRoles) }
  useEffect(() => { refresh() }, [])

  /** Modules à ouvrir par défaut = ceux qui ont au moins une permission sélectionnée. */
  const defaultOpen = (perms: Set<string>) => {
    const open = new Set<string>()
    for (const [module, defs] of entries) if (defs.some((d) => perms.has(d.key))) open.add(module)
    return open
  }
  const startNew = () => { setEditing({ name: '', permissions: new Set() }); setOpenSet(new Set()) }
  const startEdit = (r: Role) => {
    const perms = new Set(r.permissions)
    setEditing({ id: r.id, name: r.name, permissions: perms }); setOpenSet(defaultOpen(perms))
  }
  const toggleModule = (module: string) => setOpenSet((prev) => {
    const next = new Set(prev); next.has(module) ? next.delete(module) : next.add(module); return next
  })
  const expandAll = () => setOpenSet(new Set(entries.map(([module]) => module)))
  const collapseAll = () => setOpenSet(new Set())

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
          <button onClick={save} disabled={!editing.name.trim()} className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-[#fff] text-sm px-3 py-2 rounded-lg">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
          <button onClick={() => setEditing(null)} className="p-2 text-white/40 hover:text-white/80"><X className="w-4 h-4" /></button>
        </div>
        {/* Barre d'outils : compteur + mode d'affichage + tout déplier/replier */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[11px] text-white/35 mr-auto">
            <span className="text-white/70 font-medium">{editing.permissions.size}</span> permission(s) · active d'abord l'accès au module.
          </p>
          <div className="flex gap-0.5 bg-white/[0.03] border border-white/10 rounded-lg p-0.5">
            <button onClick={() => setViewMode('cards')} title="Mode cartes"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
            <button onClick={() => setViewMode('tree')} title="Mode arbre"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'tree' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}><ListTree className="w-3.5 h-3.5" /></button>
            <button onClick={() => setViewMode('mindmap')} title="Carte mentale"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'mindmap' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}><Network className="w-3.5 h-3.5" /></button>
          </div>
          {viewMode !== 'mindmap' && (<>
            <button onClick={expandAll} title="Tout déplier" className="p-1.5 rounded-md text-white/40 hover:text-white/75 border border-white/10 transition-colors"><ChevronsUpDown className="w-3.5 h-3.5" /></button>
            <button onClick={collapseAll} title="Tout replier" className="p-1.5 rounded-md text-white/40 hover:text-white/75 border border-white/10 transition-colors"><ChevronsDownUp className="w-3.5 h-3.5" /></button>
          </>)}
        </div>

        {viewMode === 'mindmap' ? (
          <Suspense fallback={<div className="h-[380px] rounded-xl border border-white/[0.06] bg-well flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <PermissionMindMap roleName={editing.name} entries={entries} permissions={editing.permissions} onToggle={toggle} />
          </Suspense>
        ) : viewMode === 'tree' ? (
          <PermissionTree
            entries={entries}
            isSelected={(k) => editing.permissions.has(k)}
            onToggle={toggle}
            openSet={openSet}
            onToggleModule={toggleModule}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {entries.map(([module, defs]) => {
              const m = moduleMeta(module)
              const viewDef = defs.find((d) => permissionParent(d.key) === null)
              const childDefs = defs.filter((d) => permissionParent(d.key) !== null)
              const selectedCount = defs.filter((d) => editing.permissions.has(d.key)).length
              const viewOn = viewDef ? editing.permissions.has(viewDef.key) : true
              return (
                <ModuleCard key={module} module={module} selected={selectedCount} total={defs.length}
                  open={openSet.has(module)} onToggleOpen={() => toggleModule(module)}>
                  <div className="flex flex-col gap-2">
                    {viewDef && (
                      <button onClick={() => toggle(viewDef.key)} title={viewDef.key}
                        className={`inline-flex items-center gap-2 self-start text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                          viewOn ? m.chipOn : 'bg-white/[0.02] border-white/10 text-white/45 hover:text-white/75'
                        }`}>
                        {viewOn ? <Check className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 opacity-60" />}
                        {viewDef.label}
                      </button>
                    )}
                    {childDefs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {childDefs.map((d) => {
                          const on = editing.permissions.has(d.key)
                          const locked = !viewOn
                          return (
                            <button key={d.key} onClick={() => toggle(d.key)} disabled={locked}
                              title={locked ? `Nécessite : ${permissionLabel(viewDef!.key)}` : d.key}
                              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ${
                                locked ? 'border-white/[0.06] text-white/20 cursor-not-allowed'
                                  : on ? m.chipOn
                                  : 'bg-white/[0.02] border-white/10 text-white/45 hover:text-white/75'
                              }`}>
                              {locked && <Lock className="w-2.5 h-2.5" />}
                              {on && !locked && <Check className="w-3 h-3" />}
                              {d.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </ModuleCard>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={startNew} className="self-start flex items-center gap-1.5 text-sm text-indigo-300 hover:text-indigo-200">
        <Plus className="w-4 h-4" /> Nouveau rôle
      </button>
      {roles.map((r) => (
        <div key={r.id} onClick={() => startEdit(r)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(r) } }}
          className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.06] rounded-xl px-3 py-2.5 cursor-pointer transition-colors">
          <div className="flex flex-col items-start text-left min-w-0">
            <span className="text-sm text-white/90">{r.name}</span>
            <span className="text-[10px] text-white/30">{r.permissions.length} permission(s)</span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); remove(r.id) }} className="p-1.5 text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      {roles.length === 0 && <p className="text-[11px] text-white/20 text-center py-3">Aucun rôle — clique « Nouveau rôle ».</p>}
    </div>
  )
}
