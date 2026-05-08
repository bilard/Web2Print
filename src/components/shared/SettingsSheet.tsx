import { X, LogOut } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { useSignOut } from '@/features/auth/useAuth'
import { useNavigate } from 'react-router-dom'
import { SettingsPanel } from './SettingsPanel'

export function SettingsSheet() {
  const { settingsOpen, setSettingsOpen } = useUIStore()
  const signOut = useSignOut()
  const navigate = useNavigate()

  if (!settingsOpen) return null

  const handleSignOut = async () => {
    setSettingsOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSettingsOpen(false)} />
      <div className="fixed left-14 top-0 bottom-0 z-50 w-80 bg-[#1a1a1a] border-r border-white/10 flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-baseline gap-2">
            <h2 className="font-semibold text-white text-sm">Paramètres</h2>
            <span className="text-[10px] font-mono text-white/30">v0.1.0</span>
          </div>
          <button onClick={() => setSettingsOpen(false)} className="text-white/30 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <SettingsPanel />
        </div>

        {/* Footer logout */}
        <div className="p-4 border-t border-white/10 shrink-0">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </button>
        </div>
      </div>
    </>
  )
}
