import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { useAuth } from '../auth/authContext'
import { ConfirmDialog } from '../../components/ConfirmDialog'

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/**
 * Offers a newer published version in the desktop app. Only admins see it:
 * installing restarts the app, which should not surprise someone at the counter
 * in the middle of a pledge.
 */
export function UpdateBanner() {
  const { isAdmin } = useAuth()
  const desktop = window.desktopAPI
  const supported = Boolean(desktop?.checkForUpdate)
  const [update, setUpdate] = useState<DesktopUpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin || !supported) return
    let cancelled = false
    const check = async () => {
      try {
        const found = await desktop!.checkForUpdate!()
        if (!cancelled) setUpdate(found)
      } catch {
        // Offline or GitHub unreachable: try again on the next interval.
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isAdmin, supported, desktop])

  async function install() {
    setConfirming(false)
    setInstalling(true)
    setError(null)
    try {
      // On success the app closes and the new version starts.
      await desktop!.installUpdate!()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setInstalling(false)
    }
  }

  if (!isAdmin || !supported || !update || dismissed) return null

  return (
    <>
      <div className="backup-banner update-banner" role="status">
        <Download size={18} strokeWidth={1.75} aria-hidden />
        <span className="backup-banner-text">
          {installing
            ? `Downloading PawnDesk ${update.version}… the app will restart when it is ready.`
            : error
              ? `Update failed: ${error}`
              : `PawnDesk ${update.version} is available (you have ${update.currentVersion}).`}
        </span>
        {!installing && (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            {error ? 'Try again' : 'Install and restart'}
          </button>
        )}
        {!installing && (
          <button
            type="button"
            className="backup-banner-dismiss"
            aria-label="Hide until next launch"
            onClick={() => setDismissed(true)}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Install PawnDesk ${update.version}`}
          message={`PawnDesk will close, install the update and start again. Make sure nobody is in the middle of a pledge or payment. Your data stays in place, and a safety backup is taken before the database is updated.${update.notes ? `\n\nWhat's new:\n${update.notes}` : ''}`}
          confirmLabel="Install and restart"
          onConfirm={() => void install()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
