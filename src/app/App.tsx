import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { AiLiveIndicator } from '@/components/shared/AiLiveIndicator'
import { TopProgressBar } from '@/components/shared/TopProgressBar'
import { useThemeStore } from '@/stores/theme.store'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export default function App() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
          <TopProgressBar />
          <AiLiveIndicator />
          <Toaster theme={resolvedTheme} position="bottom-right" richColors />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
