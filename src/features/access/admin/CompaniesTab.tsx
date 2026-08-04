import { useEffect, useMemo, useState } from 'react'
import { Building2, Plus, Users, Shield, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { listCompanies, saveCompany, backfillAccountIds, companyId, type Company } from '@/features/access/companiesApi'
import { listUsers, type ManagedUser } from '@/features/access/usersApi'
import { listRoles, setRoleCompanies, roleAccounts, type Role } from '@/features/access/rolesApi'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'
import { recordAudit } from '@/lib/auditLog'
import { CompanyDetail } from './CompanyDetail'
import { t } from '@/lib/i18n'

/**
 * Onglet « Sociétés » — vue d'ensemble de l'admin GLOBAL : qui appartient à
 * quelle entreprise, avec quels rôles.
 *
 * ⚠️ La liste des membres se lit ici SANS filtre (privilège de l'admin global) ;
 * un administrateur d'entreprise n'a pas cet écran, il a `TeamAdminPage`.
 */
export function CompaniesTab() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)

  const refresh = () => {
    void listCompanies().then(setCompanies)
    void listUsers().then(setUsers)
    void listRoles().then(setRoles)
  }
  useEffect(() => { refresh() }, [])

  /** Sociétés réellement en usage = déclarées + celles qu'un rattachement fait exister. */
  const rows = useMemo(() => {
    const declared = new Map(companies.map((c) => [c.id, c.name]))
    const ids = new Set<string>([DEFAULT_ACCOUNT_ID, ...declared.keys(), ...users.map((u) => u.accountId).filter(Boolean)])
    return [...ids].sort().map((id) => ({
      id,
      name: declared.get(id) ?? id,
      workspaceUid: companies.find((c) => c.id === id)?.workspaceUid ?? '',
      declared: declared.has(id),
      members: users.filter((u) => (u.accountId || DEFAULT_ACCOUNT_ID) === id).length,
      roles: roles.filter((r) => r.accountIds.includes(id)).length,
    }))
  }, [companies, users, roles])

  /** Profils sans `accountId` : invisibles pour tout administrateur d'entreprise. */
  const orphans = users.filter((u) => !u.accountId).length
  /**
   * Rôles créés AVANT les sociétés : `listRoles` leur prête `default` à la
   * lecture, mais le champ manque en base — donc la requête filtrée d'un
   * administrateur d'entreprise ne les voit pas. Tant qu'ils ne sont pas
   * rattachés, ils n'existent que dans la vue globale.
   */
  const [looseRoles, setLooseRoles] = useState<Role[]>([])
  useEffect(() => {
    void getDocs(collection(db, 'roles')).then((snap) =>
      setLooseRoles(snap.docs
        .filter((d) => !Array.isArray(d.data().accountIds) || d.data().accountIds.length === 0)
        .filter((d) => typeof d.data().accountId !== 'string' || d.data().accountId === '')
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Role, 'id'>), accountIds: roleAccounts(d.data()) }))),
    )
  }, [roles])

  const attachLooseRoles = async () => {
    await Promise.all(looseRoles.map((r) => setRoleCompanies(r.id, [DEFAULT_ACCOUNT_ID])))
    toast.success(t('co.rolesAttached', { n: looseRoles.length }))
    refresh()
  }

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    const id = await saveCompany({ name })
    recordAudit({ action: 'access.company.create', module: 'access', targetId: id, targetLabel: name })
    setNewName(''); refresh(); setSelected(id)
    toast.success(t('co.created', { name }))
  }

  const fixOrphans = async () => {
    setFixing(true)
    try {
      const n = await backfillAccountIds()
      toast.success(t('co.backfilled', { n }))
      refresh()
    } catch (e) {
      toast.error(t('co.backfillFailed'))
      console.warn('[CompaniesTab] backfill refusé:', e)
    } finally { setFixing(false) }
  }

  if (selected) {
    const row = rows.find((r) => r.id === selected)
    return <CompanyDetail id={selected} name={row?.name ?? selected} members={row?.members ?? 0} workspaceUid={row?.workspaceUid ?? ''} onBack={() => { setSelected(null); refresh() }} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
          placeholder={t('co.newPlaceholder')}
          className="flex-1 min-w-[220px] bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
        />
        <button onClick={() => void create()} disabled={!newName.trim()}
          className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-[#fff] text-sm px-3 py-2 rounded-lg">
          <Plus className="w-4 h-4" /> {t('co.create')}
        </button>
      </div>
      {newName.trim() && (
        <p className="text-[11px] text-white/35">{t('co.idPreview', { id: companyId(newName) })}</p>
      )}

      {orphans > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] px-3 py-2.5 flex items-center gap-3 flex-wrap">
          <p className="text-[11px] text-amber-100/90 flex-1">{t('co.orphans', { n: orphans })}</p>
          <button onClick={() => void fixOrphans()} disabled={fixing}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-400/40 text-amber-100 hover:bg-amber-500/15 disabled:opacity-40">
            <Wand2 className="w-3.5 h-3.5" /> {t('co.fixOrphans')}
          </button>
        </div>
      )}

      {looseRoles.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] px-3 py-2.5 flex items-center gap-3 flex-wrap">
          <p className="text-[11px] text-amber-100/90 flex-1">{t('co.looseRoles', { n: looseRoles.length })}</p>
          <button onClick={() => void attachLooseRoles()}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-400/40 text-amber-100 hover:bg-amber-500/15">
            <Wand2 className="w-3.5 h-3.5" /> {t('co.fixOrphans')}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
        {rows.map((r) => (
          <button key={r.id} onClick={() => setSelected(r.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-white/[0.05] last:border-0 hover:bg-white/[0.025] transition-colors">
            <span className="w-6 h-6 rounded-md bg-violet-500/15 text-violet-300 flex items-center justify-center shrink-0">
              <Building2 className="w-3.5 h-3.5" />
            </span>
            <span className="text-[13px] font-medium text-white/85">{r.name}</span>
            {!r.declared && <span className="text-[10px] text-white/30">{t('co.undeclared')}</span>}
            <span className="ml-auto flex items-center gap-3 text-[11px] text-white/40 tabular-nums">
              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{r.members}</span>
              <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{r.roles}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
