import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { HelpTrigger } from '@/features/help/HelpTrigger'

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
    </>
  )
}
