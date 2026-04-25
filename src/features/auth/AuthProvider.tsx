import { useAuthInit } from './useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { useAiSettingsSync } from '@/features/settings/useAiSettingsSync'

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  useAuthInit()
  useAiSettingsSync()
  const loading = useAuthStore((s) => s.loading)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}
