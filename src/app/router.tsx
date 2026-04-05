import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const EditorPage = lazy(() => import('@/pages/EditorPage'))
const DataPage = lazy(() => import('@/pages/DataPage'))
const TaxonomiesPage = lazy(() => import('@/pages/TaxonomiesPage'))

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <DashboardPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/data',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <DataPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/taxonomies',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <TaxonomiesPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/editor/:id',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageLoader />}>
          <EditorPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
])
