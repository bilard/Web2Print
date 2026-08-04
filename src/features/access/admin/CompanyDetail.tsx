import { useState } from 'react'
import { ArrowLeft, Users, Shield, Building2, Trash2 } from 'lucide-react'
import { UsersTab } from './UsersTab'
import { RolesTab } from './RolesTab'
import { toast } from 'sonner'
import { deleteCompany } from '@/features/access/companiesApi'
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
export function CompanyDetail({ id, name, members, onBack }: { id: string; name: string; members: number; onBack: () => void }) {
  const [tab, setTab] = useState<'members' | 'roles'>('members')

  /** Supprimer une société encore peuplée laisserait ses membres rattachés à un
   *  fantôme : le bouton n'apparaît que lorsqu'elle est vide. */
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
        {members === 0 && (
          <button onClick={() => void remove()} title={t('co.delete')}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-white/10 text-white/40 hover:text-red-300 hover:border-red-500/40 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> {t('co.delete')}
          </button>
        )}
        <nav className="ml-auto flex gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1">
          {([['members', t('team.tab.members'), Users], ['roles', t('team.tab.roles'), Shield]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium ${tab === key ? 'bg-white/[0.06] text-white' : 'text-white/45 hover:text-white/80'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </nav>
      </div>
      {tab === 'members' ? <UsersTab scopeAccountId={id} /> : <RolesTab scopeAccountId={id} />}
    </div>
  )
}
