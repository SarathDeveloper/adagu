import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useShopBranding } from '../settings/shopBrandingContext'
import { useAuth } from './authContext'

function AuthLoading() {
  return (
    <div className="auth-screen">
      <p className="muted">Loading…</p>
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { ready, needsSetup } = useShopBranding()
  const location = useLocation()

  if (loading) {
    return <AuthLoading />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (!user.mustChangePassword && location.pathname === '/change-password') {
    if (!ready) return <AuthLoading />
    return <Navigate to={needsSetup ? '/setup' : '/dashboard'} replace />
  }

  if (!user.mustChangePassword && location.pathname !== '/change-password') {
    if (!ready) return <AuthLoading />
    if (needsSetup && location.pathname !== '/setup') {
      return <Navigate to="/setup" replace />
    }
    if (!needsSetup && location.pathname === '/setup') {
      return <Navigate to="/dashboard" replace />
    }
  }

  if (location.pathname === '/login') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
