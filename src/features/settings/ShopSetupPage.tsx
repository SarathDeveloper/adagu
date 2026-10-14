import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ShopSettings } from '@shared/types'
import { api } from '../../lib/api'
import { localImageSrc } from '../print/mapShopDisplay'
import { useAuth } from '../auth/authContext'
import { useShopBranding } from './shopBrandingContext'
import { GOLD_SAVINGS_VISIBLE } from '../goldSavings/visibility'

export function ShopSetupPage() {
  const { isAdmin, logout } = useAuth()
  const { refresh } = useShopBranding()
  const navigate = useNavigate()
  const [settings, setSettings] = useState<ShopSettings | null>(null)
  const [shopName, setShopName] = useState('')
  const [phone1, setPhone1] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [pincode, setPincode] = useState('')
  const [logoImagePath, setLogoImagePath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void api
      .getShopSettings()
      .then((current) => {
        if (!active) return
        setSettings(current)
        setShopName(current.shopName)
        setPhone1(current.phone1)
        setAddressLine1(current.addressLine1)
        setAddressLine2(current.addressLine2)
        setCity(current.city)
        setState(current.state)
        setPincode(current.pincode)
        setLogoImagePath(current.logoImagePath)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load shop settings')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function onPickLogo(file: File) {
    setError(null)
    setBusy(true)
    try {
      const { path } = await api.uploadShopImage(file)
      setLogoImagePath(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the logo')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!settings) return
    const name = shopName.trim()
    const phone = phone1.trim()
    const address = addressLine1.trim()
    const place = city.trim()
    if (!name || !phone || !address || !place) {
      setError('Shop name, phone, address, and city are required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.updateShopSettings({
        ...settings,
        shopName: name,
        phone1: phone,
        addressLine1: address,
        addressLine2: addressLine2.trim(),
        city: place,
        state: state.trim(),
        pincode: pincode.trim(),
        logoImagePath,
      })
      await refresh()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save shop details')
    } finally {
      setBusy(false)
    }
  }

  const logoSrc = logoImagePath ? localImageSrc(logoImagePath, '') : ''

  return (
    <div className="auth-screen">
      <form className="card padded auth-card auth-card--setup" onSubmit={(event) => void onSubmit(event)}>
        <div className="auth-brand">
          <h1>Set up your shop</h1>
          <p className="muted">
            {GOLD_SAVINGS_VISIBLE
              ? 'These details print on pledge receipts and gold savings documents. You can change them later in Settings.'
              : 'These details print on pledge receipts. You can change them later in Settings.'}
          </p>
        </div>
        {loading ? <p className="muted">Loading…</p> : null}
        {!loading && !isAdmin ? (
          <p className="error-banner">Ask an administrator to enter the shop details before continuing.</p>
        ) : null}
        {!loading && isAdmin && settings ? (
          <>
            <label>
              Shop name
              <input className="input" value={shopName} onChange={(event) => setShopName(event.target.value)} required />
            </label>
            <label>
              Phone
              <input className="input" value={phone1} onChange={(event) => setPhone1(event.target.value)} required />
            </label>
            <label>
              Address
              <input
                className="input"
                value={addressLine1}
                onChange={(event) => setAddressLine1(event.target.value)}
                required
              />
            </label>
            <label>
              Address line 2
              <input
                className="input"
                value={addressLine2}
                onChange={(event) => setAddressLine2(event.target.value)}
              />
            </label>
            <div className="setup-place">
              <label>
                City
                <input className="input" value={city} onChange={(event) => setCity(event.target.value)} required />
              </label>
              <label>
                State
                <input className="input" value={state} onChange={(event) => setState(event.target.value)} />
              </label>
              <label>
                Pincode
                <input className="input" value={pincode} onChange={(event) => setPincode(event.target.value)} />
              </label>
            </div>
            <div className="setup-logo">
              {logoSrc ? <img src={logoSrc} alt="" className="auth-logo" /> : null}
              <label className="btn secondary">
                {logoSrc ? 'Change logo' : 'Upload logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void onPickLogo(file)
                    event.target.value = ''
                  }}
                />
              </label>
              <p className="muted">Optional. PNG or JPG, up to 2MB.</p>
            </div>
          </>
        ) : null}
        {error ? <p className="error-banner">{error}</p> : null}
        {!loading && isAdmin ? (
          <button type="submit" className="btn" disabled={busy || !settings}>
            {busy ? 'Saving…' : 'Save and continue'}
          </button>
        ) : null}
        {!loading ? (
          <button type="button" className="btn secondary" onClick={() => void logout()}>
            Sign out
          </button>
        ) : null}
      </form>
    </div>
  )
}
