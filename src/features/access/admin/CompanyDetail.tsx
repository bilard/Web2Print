import { useEffect, useState } from 'react'
import { ArrowLeft, Users, Shield, Building2, Trash2, Database } from 'lucide-react'
import { UsersTab } from './UsersTab'
import { RolesTab } from './RolesTab'
import { CompanyMemberPicker } from './CompanyMemberPicker'
import { useManagedScope } from '@/features/access/useManagedScope'
import { toast } from 'sonner'
import { deleteCompany, setWorkspaceUid } from '@/features/access/companiesApi'
import { listUsers, type ManagedUser } from '@/features/access/usersApi'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'
import { recordAudit } from '@/lib/auditLog'
import { t } from '@/lib/i18n'

/**
 * Détail d'UNE société vue par l'admin global : ses membres et ses rôles.
 *
 * Réutilise `UsersTab`/`RolesTab` avec la portée de la société — exactement ce
 * que voit son propre administrateur (`TeamAdminPage`). Une seule
 * implémentation des tableaux, donc aucune divergence possible entre la vue
 * globale et la vue déléguée.
 */
export function CompanyDetail({ id, name, members, workspaceUid, onBack }: { id: string; name: string; members: number; workspaceUid: string; onBack: () => void }) {
  const [tab, setTab] = useState<'members' | 'roles'>('members')
  const { isGlobalAdmin } = useManagedScope()
  // `UsersTab` tient sa propre liste : après un rattachement, la remonter est le
  // moyen le plus sûr de la relire (pas d'état partagé à synchroniser).
  const [listVersion, setListVersion] = useState(0)
  const isDefault = id === DEFAULT_ACCOUNT_ID
  // Membres proposables comme porteur des données communes.
  const [staff, setStaff] = useState<ManagedUser[]>([])
  const [carrier, setCarrier] = useState(workspaceUid)
  useEffect(() => { void listUsers(id).then(setStaff) }, [id, listVersion])

  const chooseCarrier = async (uid: string) => {
    await setWorkspaceUid(id, uid)
    setCarrier(uid)
    recordAudit({ action: 'access.company.workspace', module: 'access', targetId: id, targetLabel: name,
      meta: { before: workspaceUid || '—', after: uid || '—' } })
    toast.success(uid ? t('co.workspaceSet') : t('co.workspaceCleared'))
  }

  /** Supprimer une société encore peuplée laisserait ses membres rattachés à un
   *  fantôme : le bouton reste visible mais désactivé tant qu'elle en a. */
  const remove = async () => {
    try {
      await deleteCompany(id)
      recordAudit({ action: 'access.company.delete', module: 'access', targetId: id, targetLabel: name })
      toast.success(t('co.deleted', { name }))
      onBack()
    } catch (e) {
      toast.error(t('co.deleteFailed'))
      console.warn('[CompanyDetail] suppression refusée:', e)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white/55 hover:text-white/85 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('co.back')}
        </button>
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-white/85">
          <Building2 className="w-3.5 h-3.5 text-violet-300" /> {name}
        </span>
        <span className="text-[11px] text-white/30 font-mono">{id}</span>
        {/* ⚠️ Bouton TOUJOURS visible, désactivé quand il ne peut pas s'appliquer :
            masqué, il laissait croire que la suppression n'existait pas. L'infobulle
            dit ce qui manque (détacher les membres, ou société par défaut). */}
        {!isDefault && (
          <button onClick={() => void remove()} disabled={members > 0}
            title={members > 0 ? t('co.deleteBlocked', { n: members }) : t('co.delete')}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-white/10 text-white/40 enabled:hover:text-red-300 enabled:hover:border-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> {t('co.delete')}
          </button>
        )}
        {isDefault && <span className="text-[10px] text-white/25">{t('co.defaultNotDeletable')}</span>}
        <nav className="ml-auto flex gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1">
          {([['members', t('team.tab.members'), Users], ['roles', t('team.tab.roles'), Shield]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium ${tab === key ? 'bg-white/[0.06] text-white' : 'text-white/45 hover:text-white/80'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </nav>
      </div>
      {/* ESPACE DE TRAVAIL COMMUN : le compte dont les projets, produits, assets et
          workflows servent de référence à toute la société. Sans porteur désigné,
          chacun reste sur ses propres données — la bascule est réversible. */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5 flex items-center gap-2.5 flex-wrap">
        <Database className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
        <span className="text-[11px] text-white/60">{t('co.workspace')}</span>
        <select value={carrier} onChange={(e) => void chooseCarrier(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 hover:border-white/20 transition-colors">
          <option value="">{t('co.workspaceNone')}</option>
          {staff.map((u) => <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>)}
        </select>
        <span className="text-[10px] text-white/35">
          {carrier ? t('co.workspaceHint') : t('co.workspaceNoneHint')}
        </span>
      </div>

      {tab === 'members' ? (
        <div className="flex flex-col gap-3">
          {isGlobalAdmin && (
            <CompanyMemberPicker accountId={id} onAdded={() => setListVersion((v) => v + 1)} />
          )}
          <UsersTab key={listVersion} scopeAccountId={id} />
        </div>
      ) : <RolesTab scopeAccountId={id} />}
    </div>
  )
}
