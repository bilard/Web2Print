import { useState } from 'react'
import { Users, Shield, Building2 } from 'lucide-react'
import { UsersTab } from './UsersTab'
import { RolesTab } from './RolesTab'
import { useManagedScope } from '@/features/access/useManagedScope'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { t } from '@/lib/i18n'

/**
 * Écran « Équipe » — administration DÉLÉGUÉE à une société.
 *
 * Volontairement distinct de l'écran « Accès » (admin global) plutôt qu'une
 * version amputée de celui-ci : l'écran global porte le journal d'audit et la
 * fréquentation de TOUTE l'instance, deux vues qu'un administrateur
 * d'entreprise n'a pas à voir. Deux écrans séparés rendent l'oubli impossible.
 *
 * Le cloisonnement lui-même n'est pas ici : il est dans `firestore.rules`
 * (cf. `e2e/companies.spec.ts`). Cet écran ne fait que passer la portée.
 */
export function TeamAdminPage() {
  const { accountId, isGlobalAdmin } = useManagedScope()
  const [tab, setTab] = useState<'members' | 'roles'>('members')
  useModuleIntent('team', (action) => {
    if (action === 'tab:members') setTab('members')
    else if (action === 'tab:roles') setTab('roles')
  })

  // Un admin global qui ouvre cet écran n'a pas de société propre : on le renvoie
  // vers `default` plutôt que de lever le filtre (une requête non filtrée sur
  // `users` serait refusée en bloc et l'écran remonterait vide).
  const scope = accountId ?? 'default'

  return (
    <div className="h-full overflow-hidden bg-background p-6 flex flex-col">
      <div className="max-w-[1800px] w-full mx-auto flex flex-col gap-4 flex-1 min-h-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-white">{t('team.title')}</h1>
          <span className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Building2 className="w-3.5 h-3.5" />
            {scope}
          </span>
          {isGlobalAdmin && <span className="text-[11px] text-amber-300/80">{t('team.globalHint')}</span>}
        </div>
        <nav className="flex gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1 self-start">
          {([['members', t('team.tab.members'), Users], ['roles', t('team.tab.roles'), Shield]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium ${tab === id ? 'bg-white/[0.06] text-white' : 'text-white/45 hover:text-white/80'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {tab === 'members'
            ? <UsersTab scopeAccountId={scope} />
            : <RolesTab scopeAccountId={scope} />}
        </div>
      </div>
    </div>
  )
}
