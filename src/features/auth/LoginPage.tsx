import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { AuthUser } from '@shared/types'
import { localImageSrc } from '../print/mapShopDisplay'
import { useShopBranding } from '../settings/shopBrandingContext'
import { useAuth } from './authContext'

function homePath(user: AuthUser, ready: boolean, needsSetup: boolean): string {
  if (user.mustChangePassword) return '/change-password'
  if (ready && needsSetup) return '/setup'
  return '/dashboard'
}

export function LoginPage() {
  const { login, user, loading } = useAuth()
  const { shopName, logoImagePath, ready, needsSetup } = useShopBranding()
  const navigate = useNavigate()
  const logoSrc = logoImagePath ? localImageSrc(logoImagePath, '') : ''
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) {
    return <Navigate to={homePath(user, ready, needsSetup)} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const next = await login({ username: username.trim(), password })
      navigate(homePath(next, ready, needsSetup), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="card padded auth-card" onSubmit={(event) => void onSubmit(event)}>
        <div className="auth-brand">
          {logoSrc ? <img src={logoSrc} alt="" className="auth-logo" /> : null}
          <h1>{shopName || 'AdaguTrackerPro'}</h1>
          <p className="muted">Sign in to continue</p>
        </div>
        <label>
          Username
          <input
            className="input"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error-banner">{error}</p> : null}
        <button type="submit" className="btn" disabled={busy || !username.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
