// src/features/access/PendingAccessScreen.tsx
import { ShieldAlert } from 'lucide-react'
import { useSignOut } from '@/features/auth/useAuth'
import { useAuthStore } from '@/stores/auth.store'

export function PendingAccessScreen() {
  const signOut = useSignOut()
  const email = useAuthStore((s) => s.user?.email)
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-6">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-10 max-w-md text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Accès en attente de validation</h1>
        <p className="text-sm text-white/50">
          Ton compte <span className="text-white/80">{email}</span> est connecté mais n'a pas
          encore de rôle attribué. Un administrateur doit te donner accès.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-2 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
