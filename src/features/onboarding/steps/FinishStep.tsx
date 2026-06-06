// src/features/onboarding/steps/FinishStep.tsx
import { Compass, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useTourStore } from '@/features/tour/tour.store'

/** props.onLaunchTour : ferme le wizard ET démarre le tour Dashboard. */
export function FinishStep({ onLaunchTour }: { onLaunchTour: () => void }) {
  const user = useAuthStore((s) => s.user)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
        <div>
          <h3 className="text-base font-semibold text-white">Tout est prêt</h3>
          <p className="text-xs text-white/50">Votre espace est configuré. Bienvenue, {user?.displayName ?? user?.email ?? ''}.</p>
        </div>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-4 flex items-center gap-4">
        {user?.photoURL
          ? <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full ring-1 ring-white/10" />
          : <div className="w-12 h-12 rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-lg">{user?.displayName?.[0] ?? '?'}</div>}
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
          <p className="text-xs text-white/40 truncate">{user?.email}</p>
        </div>
      </div>
      <button
        onClick={onLaunchTour}
        className="flex items-center justify-center gap-2 text-sm font-medium text-indigo-200 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 rounded-lg px-4 py-2.5 transition-colors"
      >
        <Compass className="w-4 h-4" /> Lancer la visite guidée du tableau de bord
      </button>
    </div>
  )
}

/** Démarre le tour Dashboard (utilisé par FinishStep via le shell). */
export function startDashboardTour() {
  useTourStore.getState().startTour('dashboard')
}
