import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { HelpTrigger } from '@/features/help/HelpTrigger'
import { ModuleNavDrawer } from '@/features/navigation/ModuleNavDrawer'
import { CommandPalette } from '@/features/navigation/CommandPalette'
import { NotificationBell } from '@/features/navigation/NotificationBell'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Sur l'éditeur, le menu modules et la cloche sont intégrés dans la barre du bas
  // (EditorFooter, variante inline) → on n'affiche pas les FAB flottants ici.
  const isEditor = location.pathname.startsWith('/editor')

  return (
    <>
      {children}
      <HelpTrigger />
      {!isEditor && <ModuleNavDrawer />}
      <CommandPalette />
      {!isEditor && <NotificationBell />}
    </>
  )
}
