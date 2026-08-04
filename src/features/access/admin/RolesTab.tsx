import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, ChevronsDownUp, ChevronsUpDown, Building2 } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { permissionsByModule, permissionParent, permissionChildren, DEMO_PERMISSION, DEMO_LIMITS, type UsageCounters } from '@/features/access/permissions'
import { listRoles, saveRole, deleteRole, setRoleCompanies, type Role } from '@/features/access/rolesApi'
import { listCompanies } from '@/features/access/companiesApi'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'
import { useManagedScope } from '@/features/access/useManagedScope'
import { recordAudit } from '@/lib/auditLog'
import { orderedModuleEntries } from '@/features/access/moduleMeta'
import { PermissionTree } from './PermissionTree'
import { t } from '@/lib/i18n'

/**
 * ⚠️ `scopeAccountId` = la société propriétaire des rôles édités. Un rôle créé
 * ici lui appartient définitivement : `firestore.rules` refuse de le déplacer
 * (ce serait la sortie de secours du cloisonnement).
 */
/** Deux listes de sociétés désignent-elles le même ensemble ? */
function sameAccounts(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
}

export function RolesTab({ scopeAccountId }: { scopeAccountId?: string } = {}) {
  const [roles, setRoles] = useState<Role[]>([])
  const [editing, setEditing] = useState<{ id?: string; name: string; permissions: Set<string>; limits: UsageCounters; accountIds: string[] } | null>(null)
  const [openSet, setOpenSet] = useState<Set<string>>(new Set())
  const { isGlobalAdmin } = useManagedScope()
  // Sociétés proposables. En vue scopée la question ne se pose pas : le rôle
  // appartient à la société affichée et `firestore.rules` refuse de le déplacer.
  const [companyIds, setCompanyIds] = useState<string[]>([DEFAULT_ACCOUNT_ID])
  useEffect(() => {
    if (!isGlobalAdmin) return
    void listCompanies().then((cs) =>
      setCompanyIds([...new Set([DEFAULT_ACCOUNT_ID, ...cs.map((c) => c.id)])].sort()))
  }, [isGlobalAdmin])
  const byModule = permissionsByModule()
  const entries = orderedModuleEntries(byModule)

  const refresh = () => { void listRoles(scopeAccountId).then(setRoles) }
  // Relire quand la portée change (société sélectionnée).
  useEffect(() => { refresh() }, [scopeAccountId])

  /** Modules à ouvrir par défaut = ceux qui ont au moins une permission sélectionnée. */
  const defaultOpen = (perms: Set<string>) => {
    const open = new Set<string>()
    for (const [module, defs] of entries) if (defs.some((d) => perms.has(d.key))) open.add(module)
    return open
  }
  const startNew = () => { setEditing({ name: '', permissions: new Set(), limits: { ...DEMO_LIMITS }, accountIds: [scopeAccountId ?? DEFAULT_ACCOUNT_ID] }); setOpenSet(new Set()) }
  const startEdit = (r: Role) => {
    const perms = new Set(r.permissions)
    setEditing({ id: r.id, name: r.name, permissions: perms, limits: { ...DEMO_LIMITS, ...(r.limits ?? {}) }, accountIds: r.accountIds }); setOpenSet(defaultOpen(perms))
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
    const prev = roles.find((r) => r.id === editing.id)
    const beforeCount = prev?.permissions.length ?? 0
    const afterCount = [...editing.permissions].length
    await saveRole({ id: editing.id, name: editing.name, permissions: [...editing.permissions], limits: editing.limits, accountIds: editing.accountIds })
    // `saveRole` n'écrit les sociétés qu'à la CRÉATION (les changer est refusé aux
    // administrateurs d'entreprise) : sur un rôle existant, cela passe par l'appel
    // dédié, réservé à l'admin global.
    if (editing.id && prev && !sameAccounts(prev.accountIds, editing.accountIds)) {
      await setRoleCompanies(editing.id, editing.accountIds)
    }
    const renamed = prev && prev.name !== editing.name ? { nom: `${prev.name} → ${editing.name}` } : {}
    recordAudit({ action: 'access.role.save', module: 'access', targetId: editing.id, targetLabel: editing.name, meta: { before: `${beforeCount} perms`, after: `${afterCount} perms`, ...renamed } })
    setEditing(null); refresh()
  }

  const remove = async (id: string) => {
    const r = roles.find((x) => x.id === id)
    await deleteRole(id)
    recordAudit({ action: 'access.role.delete', module: 'access', targetId: id, targetLabel: r?.name ?? id })
    refresh()
  }

  if (editing) {
    // Société d'origine si l'utilisateur vient d'en changer : ses porteurs actuels
    // se retrouveraient avec un rôle hors de leur société (affiché ⚠ côté membres).
    const before = roles.find((r) => r.id === editing.id)?.accountIds ?? []
    // Sociétés RETIRÉES : leurs membres qui portent ce rôle se retrouveraient avec
    // un rôle hors de leur société (affiché ⚠ côté membres).
    const dropped = editing.id ? before.filter((a) => !editing.accountIds.includes(a)) : []
    return (
      <div className="flex flex-col gap-3">
        {/* Bandeau épinglé : reste visible pendant le défilement de la liste. */}
        <div className="sticky top-0 z-10 -mx-1 px-1 pt-0.5 pb-2.5 bg-background flex flex-col gap-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <input
            autoFocus value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder={t('ac.rolePlaceholder')}
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
          />
          {/* Société propriétaire. Un rôle n'est proposé qu'aux membres de SA société :
              sans ce choix, tout rôle créé ici atterrissait dans « default » et
              restait invisible ailleurs. Réservé à l'admin global — déplacer un rôle
              est refusé par `firestore.rules` à un administrateur d'entreprise. */}

          <button onClick={save} disabled={!editing.name.trim()} className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-[#fff] text-sm px-3 py-2 rounded-lg">
            <Save className="w-4 h-4" /> {t('ac.save')}
          </button>
          <CloseButton onClick={() => setEditing(null)} />
        </div>
        {/* Sociétés où ce rôle est proposable — un même « ACHAT » peut servir à
            plusieurs clients. Badges activables plutôt qu'une liste déroulante :
            l'appartenance multiple doit se lire d'un coup d'œil. */}
        {isGlobalAdmin && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Building2 className="w-3.5 h-3.5 text-violet-300 shrink-0" />
            {companyIds.map((id) => {
              const on = editing.accountIds.includes(id)
              return (
                <button key={id} type="button"
                  onClick={() => setEditing({ ...editing, accountIds: on
                    ? editing.accountIds.filter((a) => a !== id)
                    : [...editing.accountIds, id] })}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${on
                    ? 'bg-violet-500/20 border-violet-500/50 text-violet-100'
                    : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'}`}>
                  {id}
                </button>
              )
            })}
            {editing.accountIds.length === 0 && (
              <span className="text-[10px] text-amber-300/80">{t('ac.roleNoCompany')}</span>
            )}
          </div>
        )}
        {dropped.length > 0 && (
          <p className="text-[11px] text-amber-200/90 rounded-lg border border-amber-400/30 bg-amber-500/[0.07] px-2.5 py-1.5">
            {t('ac.roleDropWarn', { from: dropped.join(', ') })}
          </p>
        )}
        {/* Barre d'outils : compteur + mode d'affichage + tout déplier/replier */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[11px] text-white/35 mr-auto">
            <span className="text-white/70 font-medium">{editing.permissions.size}</span> {t('ac.permCountHint')}
          </p>
          <button onClick={expandAll} title={t('ac.expandAll')} className="p-1.5 rounded-md text-white/40 hover:text-white/75 border border-white/10 transition-colors"><ChevronsUpDown className="w-3.5 h-3.5" /></button>
          <button onClick={collapseAll} title="Tout replier" className="p-1.5 rounded-md text-white/40 hover:text-white/75 border border-white/10 transition-colors"><ChevronsDownUp className="w-3.5 h-3.5" /></button>
        </div>
        {/* Quotas du compte démo : épinglés dans l'en-tête → visibles quel que soit le
            défilement (la case « Compte démo » est le dernier module, tout en bas). */}
        {editing.permissions.has(DEMO_PERMISSION) && (
          <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/[0.07] px-3 py-2.5 flex flex-col gap-2">
            <p className="text-[11px] font-medium text-white/75">{t('ac.demoQuotas')}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {([
                { key: 'pimRows' as const, label: 'Lignes PIM' },
                { key: 'damAssets' as const, label: 'Assets DAM' },
              ]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-[12px] text-white/70">
                  {label}
                  <input
                    type="number" min={0} value={editing.limits[key]}
                    onChange={(e) => setEditing({ ...editing, limits: { ...editing.limits, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })}
                    className="w-24 bg-well border border-white/15 rounded-md px-2 py-1 text-sm text-white tabular-nums"
                  />
                </label>
              ))}
            </div>
            <p className="text-[10px] text-white/40">{t('ac.demoQuotas.note')}</p>
          </div>
        )}
        </div>

        <PermissionTree
          entries={entries}
          isSelected={(k) => editing.permissions.has(k)}
          onToggle={toggle}
          openSet={openSet}
          onToggleModule={toggleModule}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button onClick={startNew} className="self-start flex items-center gap-1.5 text-sm text-indigo-300 hover:text-indigo-200">
        <Plus className="w-4 h-4" /> {t('ac.newRole')}
      </button>
      {roles.map((r) => (
        <div key={r.id} onClick={() => startEdit(r)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(r) } }}
          className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.06] rounded-xl px-3 py-2.5 cursor-pointer transition-colors">
          <div className="flex flex-col items-start text-left min-w-0">
            <span className="text-sm text-white/90">{r.name}</span>
            <span className="text-[10px] text-white/30 flex items-center gap-1.5">
              {t('ac.permCount', { n: r.permissions.length })}
              {isGlobalAdmin && <span className="flex items-center gap-1 text-violet-300/70"><Building2 className="w-2.5 h-2.5" />{r.accountIds.join(' · ')}</span>}
            </span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); remove(r.id) }} className="p-1.5 text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      {roles.length === 0 && <p className="text-[11px] text-white/20 text-center py-3">{t('ac.noRole')}</p>}
    </div>
  )
}
