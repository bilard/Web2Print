import { useEffect } from 'react'
import { useAuthInit } from './useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { useAiSettingsSync } from '@/features/settings/useAiSettingsSync'
import { useApiKeysSync } from '@/features/settings/useApiKeysSync'
import { useTelegramSettingsSync } from '@/features/settings/useTelegramSettingsSync'
import { useSiteCookiesSync } from '@/features/settings/useSiteCookiesSync'
import { useAccessInit } from '@/features/access/useAccess'
import { writeUserProfile } from '@/features/access/writeUserProfile'

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  useAuthInit()
  useAiSettingsSync()
  useApiKeysSync()
  useTelegramSettingsSync()
  useSiteCookiesSync()
  useAccessInit()
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)

  // Rafraîchit l'identité du user (pour l'écran admin) à chaque (re)connexion.
  useEffect(() => {
    if (user) void writeUserProfile(user)
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}
