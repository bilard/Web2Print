import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { useAccessLoading, useIsPending, useIsBlocked } from '@/features/access/useAccess'
import { useVisibleModules } from './modules'
import { ResumeSetupButton } from '@/features/onboarding/ResumeSetupButton'
import { ModuleTree } from './ModuleTree'

/**
 * Menu de navigation global des modules, sous forme de drawer.
 *
 * Monté une seule fois dans `ProtectedRoute` → disponible sur l'éditeur et
 * toutes les routes autonomes (qui n'ont aucune navigation entre modules).
 * Masqué sur `/dashboard` : la sidebar du Dashboard rend déjà cette liste.
 *
 * Au clic, navigue vers `/dashboard` avec `state: { section }` ; `DashboardPage`
 * ouvre la section correspondante (cf. `features/navigation/modules.ts`).
 *
 * - `variant="fab"` (défaut) : rond flottant en bas-gauche.
 * - `variant="inline"` : bouton compact intégré dans une barre (barre de l'éditeur).
 */
export function ModuleNavDrawer({ variant = 'fab' }: { variant?: 'fab' | 'inline' }) {
  const isInline = variant === 'inline'
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Modules (menu)"
        aria-label="Ouvrir le menu des modules"
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          isInline
            ? 'w-7 h-7 rounded text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors'
            : 'fixed bottom-4 left-4 z-30 w-10 h-10 rounded-full bg-surface border border-white/10 hover:border-indigo-500/50 text-white/60 hover:text-indigo-400 flex items-center justify-center shadow-lg transition-colors'
        }
      >
        <Menu className={isInline ? 'w-4 h-4' : 'w-5 h-5'} />
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
            aria-label="Modules"
            className="fixed inset-y-0 left-0 z-50 w-64 bg-surface-2 border-r border-white/[0.06]
              flex flex-col shadow-2xl
              animate-in slide-in-from-left duration-200"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-[13px] font-medium text-white/70">Modules</span>
              <CloseButton onClick={() => setOpen(false)} title="Fermer le menu" />
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
              <ModuleTree
                modules={modules}
                onOpen={(section) => { setOpen(false); navigate('/dashboard', { state: { section } }) }}
                onOpenChild={(section, intent, routeTo) => {
                  setOpen(false)
                  if (routeTo) navigate(routeTo)
                  else navigate('/dashboard', { state: { section, intent } })
                }}
              />
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
