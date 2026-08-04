import { useEffect, useMemo, useState } from 'react'
import { Search, Ban, RotateCcw, CheckCircle2, Plus, Minus, Clock, ShieldCheck, Trash2, AlertTriangle } from 'lucide-react'
import { PERMISSIONS, permissionsByModule, permissionLabel } from '@/features/access/permissions'
import { moduleMeta, orderedModuleEntries } from '@/features/access/moduleMeta'
import { ModuleCard } from './ModuleCard'
import { AccountAssignment } from './AccountAssignment'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'
import { listUsers, updateUserAccess, deleteUser, type ManagedUser } from '@/features/access/usersApi'
import { recordAudit } from '@/lib/auditLog'
import { listRoles, type Role } from '@/features/access/rolesApi'
import { computeEffectivePermissions } from '@/features/access/computePermissions'
import { isOwnerEmail } from '@/features/auth/useAuth'
import { useManagedScope } from '@/features/access/useManagedScope'
import { intlLocale, t } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale.store'

const DAY = 86_400_000
const MODULE_OF: Record<string, string> = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.module]))

function formatLastSeen(ts: number): string {
  if (!ts) return t('ac.neverSeen')
  const diff = Date.now() - ts
  if (diff < 60_000) return t('ac.justNow')
  if (diff < 3_600_000) return t('ac.minsAgo', { n: Math.floor(diff / 60_000) })
  if (diff < DAY) return t('ac.hoursAgo', { n: Math.floor(diff / 3_600_000) })
  if (diff < 7 * DAY) return t('ac.daysAgo', { n: Math.floor(diff / DAY) })
  // ⚠️ La date figée en 'fr-FR' affichait 30/07/2026 dans une UI anglaise.
  return new Date(ts).toLocaleDateString(intlLocale(useLocaleStore.getState().locale))
}

/**
 * ⚠️ `scopeAccountId` n'est pas un simple filtre d'affichage : sans lui, un
 * administrateur d'entreprise interrogerait toute la collection `users` et
 * Firestore refuserait la requête EN BLOC (liste vide, aucune erreur). Il borne
 * aussi ce que l'écran propose — le rattachement à une société et la suppression
 * d'un profil restent des actes d'administration globale.
 */
export function UsersTab({ scopeAccountId }: { scopeAccountId?: string } = {}) {
  // ⚠️ Deux notions distinctes : `scopeAccountId` borne ce qu'on LIT (la requête
  // Firestore), `isGlobalAdmin` ce qu'on a le DROIT de faire. L'admin global qui
  // consulte une société garde donc le rattachement et la suppression, alors
  // qu'un administrateur d'entreprise ne les a jamais — les confondre retirerait
  // à l'admin global des actions qu'il possède.
  const { isGlobalAdmin } = useManagedScope()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const byModule = permissionsByModule()

  const refresh = () => { void listUsers(scopeAccountId).then(setUsers) }
  // Relire quand la PORTÉE change (passage d'une société à l'autre dans l'écran
  // Sociétés) : `refresh` est recréé à chaque rendu et ne peut pas être dépendance.
  useEffect(() => { refresh(); void listRoles(scopeAccountId).then(setRoles) }, [scopeAccountId])

  // Comptes déjà employés — proposés en autocomplétion pour éviter qu'un même
  // client finisse avec deux identifiants et donc deux vocabulaires.
  const knownAccounts = useMemo(
    () => [...new Set([DEFAULT_ACCOUNT_ID, ...users.map((u) => u.accountId).filter(Boolean)])].sort(),
    [users],
  )

  const removeUser = async (u: ManagedUser) => {
    await deleteUser(u.uid)
    recordAudit({ action: 'access.user.delete', module: 'access', targetId: u.uid, targetLabel: u.email })
    setConfirmDelete(null)
    setExpanded(null)
    refresh()
  }

  /**
   * ⚠️ Les valeurs françaises qui suivent (`aucun rôle`, `bloqué`, `accordé`…)
   * ne passent PAS par le catalogue, et c'est volontaire : elles ne s'affichent
   * pas, elles sont ÉCRITES dans `meta.before/after` du journal d'audit, donc
   * persistées. Les traduire à l'écriture les figerait dans la langue de qui a
   * agi — un même événement serait consigné « blocked » ou « bloqué » selon
   * l'auteur, et le journal deviendrait illisible à la relecture.
   *
   * Les traduire correctement suppose de stocker une CLÉ et de traduire à
   * l'affichage (`AuditLogView`), avec un repli sur les entrées déjà en base
   * qui, elles, portent du texte libre. C'est un chantier du journal, pas de
   * cet écran — les libellés affichés ici, eux, sont bien traduits.
   */
  const roleName = (roleId: string | null) =>
    roleId ? (roles.find((r) => r.id === roleId)?.name ?? roleId) : 'aucun rôle'

  const setRole = async (u: ManagedUser, roleId: string) => {
    const before = roleName(u.accessRoleId)
    const after = roleName(roleId || null)
    await updateUserAccess(u.uid, { accessRoleId: roleId || null })
    recordAudit({ action: roleId ? 'access.role.assign' : 'access.role.remove', module: 'access', targetId: u.uid, targetLabel: u.email, meta: { before, after } })
    refresh()
  }
  const toggleBlocked = async (u: ManagedUser) => {
    const blocked = !u.accessBlocked
    await updateUserAccess(u.uid, { accessBlocked: blocked })
    recordAudit({ action: blocked ? 'access.block' : 'access.unblock', module: 'access', targetId: u.uid, targetLabel: u.email, meta: { before: u.accessBlocked ? 'bloqué' : 'actif', after: blocked ? 'bloqué' : 'actif' } })
    refresh()
  }
  const resetOverrides = async (u: ManagedUser) => {
    await updateUserAccess(u.uid, { accessGrants: [], accessRevokes: [] }); refresh()
  }
  const toggleOverride = async (u: ManagedUser, key: string, kind: 'grant' | 'revoke') => {
    const field = kind === 'grant' ? 'accessGrants' : 'accessRevokes'
    const other = kind === 'grant' ? 'accessRevokes' : 'accessGrants'
    const cur = new Set(u[field])
    const otherSet = new Set(u[other])
    const adding = !cur.has(key)
    if (cur.has(key)) cur.delete(key)
    else { cur.add(key); otherSet.delete(key) } // grant et revoke mutuellement exclusifs
    await updateUserAccess(u.uid, { [field]: [...cur], [other]: [...otherSet] })
    if (adding) recordAudit({ action: kind === 'grant' ? 'access.grant' : 'access.revoke', module: 'access', targetId: u.uid, targetLabel: u.email, meta: { permission: key, before: 'hérité du rôle', after: kind === 'grant' ? 'accordé' : 'révoqué' } })
    refresh()
  }

  const roleOf = (u: ManagedUser) => roles.find((r) => r.id === u.accessRoleId)

  /**
   * Rôles proposables pour CE membre : ceux de SA société, jamais ceux d'une autre.
   *
   * ⚠️ En vue globale la liste contient les rôles de TOUTES les sociétés. Sans ce
   * filtre, un administrateur global pouvait attribuer à un membre d'Auchan un
   * rôle appartenant à un autre client — et les règles l'auraient accepté :
   * `hasPermission()` résout `roles/{accessRoleId}` sans regarder sa société.
   * `assignedRoleInMyCompany()` ferme ce chemin pour les administrateurs
   * d'entreprise ; ce filtre le ferme pour l'écran global.
   */
  const rolesFor = (u: ManagedUser) => {
    const account = u.accountId || DEFAULT_ACCOUNT_ID
    const mine = roles.filter((r) => (r.accountId || DEFAULT_ACCOUNT_ID) === account)
    // Un rôle attribué AVANT ce filtre peut appartenir à une autre société : le
    // retirer de la liste afficherait un sélecteur vide alors que le membre en
    // porte bien un. On le garde, signalé, pour qu'il soit vu et corrigé.
    const current = roles.find((r) => r.id === u.accessRoleId)
    return current && !mine.includes(current)
      ? [{ ...current, name: `⚠ ${current.name} (${current.accountId})` }, ...mine]
      : mine
  }
  const rolePermsOf = (u: ManagedUser) => new Set(roleOf(u)?.permissions ?? [])
  const effectivePerms = (u: ManagedUser): string[] => {
    if (u.accessBlocked) return []
    const role = roleOf(u)
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
    const rank = (u: ManagedUser) =>
      u.accessBlocked ? 0 : (!u.accessRoleId && !isOwnerEmail(u.email)) ? 1 : 2
    return [...list].sort((a, b) => rank(a) - rank(b) || b.lastSeenAt - a.lastSeenAt)
  }, [users, query])

  const pendingCount = users.filter((u) => !u.accessRoleId && !u.accessBlocked && !isOwnerEmail(u.email)).length
  const blockedCount = users.filter((u) => u.accessBlocked).length

  return (
    <div className="flex flex-col gap-2.5">
      {/* Recherche + récap */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px] bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 focus-within:border-indigo-500/50 transition-colors">
          <Search className="w-3.5 h-3.5 text-white/30" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('ac.searchPlaceholder')}
            className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 outline-none" />
        </div>
        <span className="text-[11px] px-2 py-1 rounded-md bg-white/[0.04] text-white/50">{t('ac.userCount', { count: users.length })}</span>
        {pendingCount > 0 && <span className="text-[11px] px-2 py-1 rounded-md bg-amber-500/15 text-amber-300">{t('ac.pendingCount', { count: pendingCount })}</span>}
        {blockedCount > 0 && <span className="text-[11px] px-2 py-1 rounded-md bg-red-500/15 text-red-300">{t('ac.blockedCount', { count: blockedCount })}</span>}
      </div>

      {filtered.map((u) => {
        const owner = isOwnerEmail(u.email)
        const eff = effectivePerms(u)
        const rolePerms = rolePermsOf(u)
        const isExpanded = expanded === u.uid
        return (
          <div key={u.uid} className={`rounded-xl border transition-colors ${u.accessBlocked ? 'bg-red-500/[0.04] border-red-500/20' : isExpanded ? 'bg-white/[0.035] border-white/10' : 'bg-white/[0.025] border-white/[0.06]'}`}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              {u.photoURL
                ? <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full ring-1 ring-white/10" />
                : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/30 flex items-center justify-center text-xs font-semibold text-white/80">{(u.displayName || u.email || '?').charAt(0).toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm text-white/90 truncate">{u.displayName || u.email}</p>
                  {owner && <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300"><ShieldCheck className="w-2.5 h-2.5" /> admin</span>}
                  {u.accessBlocked && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{t('ac.blocked')}</span>}
                  {!u.accessBlocked && !u.accessRoleId && !owner && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">{t('ac.pending')}</span>}
                  {!owner && u.accessRoleId && !u.accessBlocked && roleOf(u) && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200">{roleOf(u)!.name}</span>}
                </div>
                <p className="text-[10px] text-white/30 truncate flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {u.email} · {t('ac.seenPrefix')} {formatLastSeen(u.lastSeenAt)}</p>
              </div>
              {!owner && (
                <select value={u.accessRoleId ?? ''} onChange={(e) => setRole(u, e.target.value)} disabled={u.accessBlocked}
                  className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 disabled:opacity-40 hover:border-white/20 transition-colors">
                  <option value="">{t('ac.noRoleOption')}</option>
                  {rolesFor(u).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <button onClick={() => setExpanded(isExpanded ? null : u.uid)}
                className={`text-[11px] px-2 py-1 rounded-md transition-colors ${isExpanded ? 'bg-white/10 text-white/80' : 'text-white/40 hover:text-white/70'}`}>
                {t('ac.details')}
              </button>
            </div>

            {isExpanded && owner && (
              <div className="px-3 pb-3 pt-2 border-t border-white/5 flex flex-col gap-3">
                <p className="text-[11px] text-white/35">{t('usersTab.ownerAccountFull')}</p>
                {/* ⚠️ Seul réglage ouvert sur l'owner, et il est nécessaire : le
                    rattachement ne donne aucun droit (l'owner les a déjà), il
                    choisit le compte dont l'interface s'affiche. Sans lui,
                    l'administrateur resterait bloqué sur « default » et ne
                    pourrait pas régler le vocabulaire d'un client. */}
                {isGlobalAdmin && <AccountAssignment user={u} knownAccounts={knownAccounts} onSaved={refresh} />}
              </div>
            )}

            {isExpanded && !owner && (
              <div className="px-3 pb-3 pt-2 border-t border-white/5 flex flex-col gap-3">
                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleBlocked(u)}
                    className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${u.accessBlocked ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10' : 'border-red-500/40 text-red-300 hover:bg-red-500/10'}`}>
                    {u.accessBlocked ? <><CheckCircle2 className="w-3.5 h-3.5" /> {t('ac.reactivate')}</> : <><Ban className="w-3.5 h-3.5" /> {t('ac.block')}</>}
                  </button>
                  {/* Supprimer un profil efface son rattachement et son rôle :
                      acte d'administration GLOBALE, hors du périmètre d'une société. */}
                  {isGlobalAdmin && (
                  <button onClick={() => setConfirmDelete(confirmDelete === u.uid ? null : u.uid)}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-red-300 hover:border-red-500/40 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> {t('ac.delete')}
                  </button>
                  )}
                  {(u.accessGrants.length > 0 || u.accessRevokes.length > 0) && (
                    <button onClick={() => resetOverrides(u)} className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" /> {t('ac.resetOverrides')}
                    </button>
                  )}
                </div>

                {/* Confirmation de suppression (2 temps) */}
                {confirmDelete === u.uid && (
                  <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2.5">
                    <p className="text-[11px] text-red-200/90 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {t('ac.deleteWarn')}
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeUser(u)}
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-[#fff] transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> {t('ac.confirmDelete')}
                      </button>
                      <button onClick={() => setConfirmDelete(null)}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white/80 transition-colors">
                        {t('ac.cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Compte de rattachement (vocabulaire d'interface partagé).
                    ⚠️ Réservé à l'admin global : `firestore.rules` exclut `accountId`
                    des champs délégués, un administrateur d'entreprise ne peut pas
                    aspirer le compte d'un tiers. */}
                {isGlobalAdmin && <AccountAssignment user={u} knownAccounts={knownAccounts} onSaved={refresh} />}

                {/* Permissions effectives */}
                <div>
                  <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-1.5">{t('ac.canDo', { count: eff.length })}</p>
                  {eff.length === 0
                    ? <p className="text-[11px] text-white/30">{u.accessBlocked ? t('ac.blockedNoAccess') : t('ac.noPermission')}</p>
                    : <div className="flex flex-wrap gap-1">
                        {eff.map((k) => {
                          const mm = moduleMeta(MODULE_OF[k] ?? '')
                          return <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/5 ${mm.text}`}>{permissionLabel(k)}</span>
                        })}
                      </div>}
                </div>

                {/* Surcharges */}
                <div>
                  <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                    {t('ac.adjust')}
                    <span className="inline-flex items-center gap-1 text-[9px] font-normal normal-case tracking-normal text-white/30">
                      <Plus className="w-2.5 h-2.5 text-emerald-400" />{t('ac.grantShort')}
                      <Minus className="w-2.5 h-2.5 text-red-400 ml-1" />{t('ac.revokeShort')}
                    </span>
                  </p>
                  <div className="flex flex-col gap-2">
                    {orderedModuleEntries(byModule).map(([module, defs]) => {
                      const sel = defs.filter((d) => u.accessGrants.includes(d.key) || u.accessRevokes.includes(d.key)).length
                      return (
                        <ModuleCard key={module} module={module} selected={sel} total={defs.length}>
                          <div className="flex flex-wrap gap-1.5">
                            {defs.map((d) => {
                              const granted = u.accessGrants.includes(d.key)
                              const revoked = u.accessRevokes.includes(d.key)
                              const inRole = rolePerms.has(d.key)
                              return (
                                <span key={d.key} className={`inline-flex items-stretch rounded-lg border overflow-hidden text-[10px] ${granted ? 'border-emerald-500/40' : revoked ? 'border-red-500/40' : 'border-white/10'}`}>
                                  <span className={`flex items-center px-2 py-1 ${revoked ? 'text-white/30 line-through' : inRole ? 'text-white/75' : 'text-white/40'}`} title={t(inRole ? 'ac.inRole' : 'ac.notInRole')}>
                                    {inRole && <span className="w-1 h-1 rounded-full bg-white/45 mr-1" />}{t(d.labelKey)}
                                  </span>
                                  <button onClick={() => toggleOverride(u, d.key, 'grant')} title={t('ac.grantExtra')}
                                    className={`px-1.5 flex items-center border-l transition-colors ${granted ? 'bg-emerald-500/25 border-emerald-500/40 text-emerald-200' : 'border-white/10 text-white/25 hover:bg-emerald-500/10 hover:text-emerald-300'}`}>
                                    <Plus className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => toggleOverride(u, d.key, 'revoke')} title={t('ac.revokeEvenIfRole')}
                                    className={`px-1.5 flex items-center border-l transition-colors ${revoked ? 'bg-red-500/25 border-red-500/40 text-red-200' : 'border-white/10 text-white/25 hover:bg-red-500/10 hover:text-red-300'}`}>
                                    <Minus className="w-3 h-3" />
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        </ModuleCard>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {filtered.length === 0 && <p className="text-[11px] text-white/20 text-center py-3">{query ? t('ac.noUsersForSearch') : t('ac.noUsers')}</p>}
    </div>
  )
}
