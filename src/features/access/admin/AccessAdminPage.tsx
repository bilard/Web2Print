import { useState } from 'react'
import { Users, Shield, ScrollText, BarChart3 } from 'lucide-react'
import { UsersTab } from './UsersTab'
import { RolesTab } from './RolesTab'
import { AuditTab } from './AuditTab'
import { AnalyticsTab } from '@/features/analytics/admin/AnalyticsTab'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { t } from '@/lib/i18n'

export function AccessAdminPage() {
  const [tab, setTab] = useState<'users' | 'roles' | 'audit' | 'analytics'>('users')
  useModuleIntent('access', (action) => {
    if (action === 'tab:users') setTab('users')
    else if (action === 'tab:roles') setTab('roles')
    else if (action === 'tab:audit') setTab('audit')
    else if (action === 'tab:analytics') setTab('analytics')
  })
  return (
    <div className="h-full overflow-hidden bg-background p-6 flex flex-col">
      <div className="max-w-[1800px] w-full mx-auto flex flex-col gap-4 flex-1 min-h-0">
        <h1 className="text-xl font-bold text-white">{t('ac.usersRoles')}</h1>
        <nav className="flex gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1 self-start">
          {([['users', t('ac.tab.users'), Users], ['roles', t('ac.tab.roles'), Shield], ['audit', t('ac.tab.audit'), ScrollText], ['analytics', t('ac.tab.analytics'), BarChart3]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium ${tab === id ? 'bg-white/[0.06] text-white' : 'text-white/45 hover:text-white/80'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </nav>
        {/* Zone défilante : titre + onglets restent fixes au-dessus. Le bandeau
            d'édition d'un rôle s'épingle en haut de cette zone (cf. RolesTab). */}
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {tab === 'users' ? <UsersTab /> : tab === 'roles' ? <RolesTab /> : tab === 'audit' ? <AuditTab /> : <AnalyticsTab />}
        </div>
      </div>
    </div>
  )
}
