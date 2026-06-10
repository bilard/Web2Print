import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAccessLoading, useIsPending, useIsBlocked } from '@/features/access/useAccess'
import { useVisibleModules, type Section } from './modules'
import { ResumeSetupButton } from '@/features/onboarding/ResumeSetupButton'

/**
 * Menu de navigation global des modules, sous forme de drawer.
 *
 * Monté une seule fois dans `ProtectedRoute` → disponible sur l'éditeur et
 * toutes les routes autonomes (qui n'ont aucune navigation entre modules).
 * Masqué sur `/dashboard` : la sidebar du Dashboard rend déjà cette liste.
 *
 * Au clic, navigue vers `/dashboard` avec `state: { section }` ; `DashboardPage`
 * ouvre la section correspondante (cf. `features/navigation/modules.ts`).
 */
export function ModuleNavDrawer() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const modules = useVisibleModules()

  // Gating identique à DashboardPage : pas de menu pour un compte en attente,
  // bloqué, ou pendant l'hydratation des droits.
  const accessLoading = useAccessLoading()
  const pending = useIsPending()
  const blocked = useIsBlocked()

  // Échap ferme le drawer.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Redondant avec la sidebar du Dashboard → on n'affiche pas le menu là-bas.
  if (location.pathname === '/dashboard') return null
  if (accessLoading || pending || blocked) return null
  if (modules.length === 0) return null

  const go = (section: Section) => {
    setOpen(false)
    navigate('/dashboard', { state: { section } })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Modules (menu)"
        aria-label="Ouvrir le menu des modules"
        aria-haspopup="menu"
        aria-expanded={open}
        className="fixed bottom-4 left-4 z-30
          w-10 h-10 rounded-full
          bg-surface border border-white/10 hover:border-indigo-500/50
          text-white/60 hover:text-indigo-400
          flex items-center justify-center
          shadow-lg
          transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <nav
            role="menu"
            aria-label="Modules"
            className="fixed inset-y-0 left-0 z-50 w-64 bg-surface-2 border-r border-white/[0.06]
              flex flex-col shadow-2xl
              animate-in slide-in-from-left duration-200"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-[13px] font-medium text-white/70">Modules</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Fermer"
                aria-label="Fermer le menu"
                className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
              {modules.map(({ id, icon: Icon, label, accent }) => (
                <button
                  key={id}
                  role="menuitem"
                  onClick={() => go(id)}
                  className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px]
                    text-white/45 hover:text-white/80 hover:bg-white/[0.04]
                    transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                    focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2"
                >
                  <Icon className={`w-4 h-4 shrink-0 opacity-60 ${accent}`} />
                  <span className="flex-1 text-left">{label}</span>
                </button>
              ))}
              <div className="mt-2 pt-2 border-t border-white/[0.06]">
                <ResumeSetupButton variant="item" />
              </div>
            </div>
          </nav>
        </>
      )}
    </>
  )
}
