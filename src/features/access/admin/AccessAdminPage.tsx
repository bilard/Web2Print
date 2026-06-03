// src/features/access/admin/AccessAdminPage.tsx
import { useState } from 'react'
import { Users, Shield } from 'lucide-react'
import { UsersTab } from './UsersTab'
import { RolesTab } from './RolesTab'

export function AccessAdminPage() {
  const [tab, setTab] = useState<'users' | 'roles'>('users')
  return (
    <div className="flex-1 overflow-y-auto bg-[#0f0f0f] p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <h1 className="text-xl font-bold text-white">Utilisateurs & rôles</h1>
        <nav className="flex gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1 self-start">
          {([['users', 'Utilisateurs', Users], ['roles', 'Rôles', Shield]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium ${tab === id ? 'bg-white/[0.06] text-white' : 'text-white/45 hover:text-white/80'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </nav>
        {tab === 'users' ? <UsersTab /> : <RolesTab />}
      </div>
    </div>
  )
}
