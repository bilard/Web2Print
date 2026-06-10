import { Navigate } from 'react-router-dom'
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

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      {children}
      <HelpTrigger />
      <ModuleNavDrawer />
      <CommandPalette />
      <NotificationBell />
    </>
  )
}
