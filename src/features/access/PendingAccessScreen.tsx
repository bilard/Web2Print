import { ShieldAlert } from 'lucide-react'
import { useSignOut } from '@/features/auth/useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { t } from '@/lib/i18n'

export function PendingAccessScreen({ blocked = false }: { blocked?: boolean }) {
  const signOut = useSignOut()
  const email = useAuthStore((s) => s.user?.email)
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="bg-surface border border-white/10 rounded-2xl p-10 max-w-md text-center flex flex-col items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${blocked ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
          <ShieldAlert className={`w-6 h-6 ${blocked ? 'text-red-400' : 'text-amber-400'}`} />
        </div>
        <h1 className="text-xl font-bold text-white">
          {blocked ? 'Accès suspendu' : 'Accès en attente de validation'}
        </h1>
        <p className="text-sm text-white/50">
          Ton compte <span className="text-white/80">{email}</span>{' '}
          {blocked
            ? 'a été suspendu par un administrateur. Contacte-le pour rétablir ton accès.'
            : "est connecté mais n'a pas encore de rôle attribué. Un administrateur doit te donner accès."}
        </p>
        <button
          onClick={() => signOut()}
          className="mt-2 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          {t('pendingAccessScreen.signOut')}
        </button>
      </div>
    </div>
  )
}
