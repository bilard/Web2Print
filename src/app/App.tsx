import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { AiLiveIndicator } from '@/components/shared/AiLiveIndicator'
import { TopProgressBar } from '@/components/shared/TopProgressBar'
import { LabelEditorOverlay } from '@/components/shared/LabelEditorOverlay'
import { useThemeStore } from '@/stores/theme.store'
import { useVersionCheck } from '@/features/app/useVersionCheck'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

/** Isolé pour que le changement de thème ne re-rende pas toute la racine. */
function ThemedToaster() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  return <Toaster theme={resolvedTheme} position="bottom-right" richColors />
}

export default function App() {
  useVersionCheck()
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
          <TopProgressBar />
          <AiLiveIndicator />
          <LabelEditorOverlay />
          <ThemedToaster />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
