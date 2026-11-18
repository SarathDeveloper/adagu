import { useEffect, useState } from 'react'
import { Copy, KeyRound, Lock, Printer } from 'lucide-react'
import type { BackupEncryptionStatus } from '@shared/types'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatDisplayDateTime } from '../../lib/format'

const MIN_LENGTH = 8

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/** Opens a bare page with only the key on it, so the shop can print it and file it away. */
function printRecoveryKey(key: string): boolean {
  const win = window.open('', '_blank', 'width=640,height=480')
  if (!win) return false
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>PawnDesk backup recovery key</title>
<style>body{font-family:system-ui,sans-serif;padding:40px;color:#111}h1{font-size:20px}
.key{font:600 22px/1.6 ui-monospace,Consolas,monospace;letter-spacing:.05em;border:2px solid #111;padding:16px;margin:24px 0;word-break:break-all}
p{font-size:14px;line-height:1.5}</style></head><body>
<h1>PawnDesk backup recovery key</h1>
<p>Created ${escapeHtml(new Date().toLocaleString())}</p>
<div class="key">${escapeHtml(key)}</div>
<p>This key opens every encrypted PawnDesk backup if the backup password is forgotten.
Keep it somewhere safe and away from the backup drive. Anyone holding it, together with a backup, can read customer records.</p>
</body></html>`)
  win.document.close()
  win.focus()
  win.print()
  return true
}

export function BackupEncryptionCard({ onChanged }: { onChanged: () => void }) {
  const { showToast } = useToast()
  const [status, setStatus] = useState<BackupEncryptionStatus | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [current, setCurrent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [keySaved, setKeySaved] = useState(false)
  const [changing, setChanging] = useState(false)

  useEffect(() => {
    api
      .getBackupEncryption()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load backup encryption'))
  }, [])

  function validateNew(): string | null {
    if (password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters`
    if (password !== confirm) return 'The two passwords do not match'
    return null
  }

  function resetFields() {
    setPassword('')
    setConfirm('')
    setCurrent('')
  }

  async function turnOn() {
    const problem = validateNew()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      const result = await api.enableBackupEncryption(password)
      resetFields()
      setError(null)
      setKeySaved(false)
      setRecoveryKey(result.recoveryKey)
      setStatus(await api.getBackupEncryption())
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn on encryption')
    } finally {
      setBusy(false)
    }
  }

  async function changePassword() {
    const problem = validateNew()
    if (problem) {
      setError(problem)
      return
    }
    if (!current.trim()) {
      setError(useRecovery ? 'Enter the recovery key' : 'Enter the current backup password')
      return
    }
    setBusy(true)
    try {
      setStatus(
        await api.changeBackupPassword(
          useRecovery ? { recoveryKey: current, newPassword: password } : { currentPassword: current, newPassword: password },
        ),
      )
      resetFields()
      setChanging(false)
      setError(null)
      showToast('Backup password changed', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password')
    } finally {
      setBusy(false)
    }
  }

  async function copyKey() {
    if (!recoveryKey) return
    try {
      await navigator.clipboard.writeText(recoveryKey)
      showToast('Recovery key copied', 'success')
    } catch {
      showToast('Copy failed. Write the key down instead.', 'error')
    }
  }

  const newPasswordFields = (
    <div className="backup-schedule-grid">
      <label>
        {status?.enabled ? 'New backup password' : 'Backup password'}
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={busy}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        Confirm password
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          disabled={busy}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </label>
    </div>
  )

  return (
    <div className="card padded backup-encryption" data-entry="">
      <div className="settings-card-head">
        <div>
          <h2 className="settings-section-title">
            <Lock size={16} strokeWidth={1.75} aria-hidden /> Backup encryption
          </h2>
          <p className="muted settings-card-subtitle">
            Backups that leave this computer hold customer Aadhaar and PAN details. With encryption on,
            the off-machine copy (database, Excel workbook and customer photos), Export Copy and Full
            Backup are locked with a backup password. Backups kept inside this computer&apos;s app data
            folder stay as they are. Export Excel stays readable so it can be opened in Excel.
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!status ? null : !status.enabled ? (
        <>
          <p className="muted">
            Encryption is <strong>off</strong>. Anyone who finds the USB drive or shared folder can read
            the backups.
          </p>
          {newPasswordFields}
          <button type="button" className="btn settings-save-btn" data-entry-save="" disabled={busy} onClick={() => void turnOn()}>
            <KeyRound size={16} strokeWidth={1.75} aria-hidden />
            Turn on encryption
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Encryption is <strong>on</strong>
            {status.createdAt ? ` since ${formatDisplayDateTime(status.createdAt)}` : ''}. Restoring an
            encrypted backup on another computer asks for the backup password or the recovery key.
          </p>
          {changing ? (
            <>
              <label className="backup-offsite-path-label">
                {useRecovery ? 'Recovery key' : 'Current backup password'}
                <input
                  className="input"
                  type={useRecovery ? 'text' : 'password'}
                  autoComplete="off"
                  value={current}
                  disabled={busy}
                  onChange={(event) => setCurrent(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => {
                  setUseRecovery((value) => !value)
                  setCurrent('')
                }}
              >
                {useRecovery ? 'Use the current password instead' : 'Forgot it? Use the recovery key'}
              </button>
              {newPasswordFields}
              <div className="backup-offsite-actions">
                <button type="button" className="btn settings-save-btn" data-entry-save="" disabled={busy} onClick={() => void changePassword()}>
                  Change password
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => {
                    setChanging(false)
                    resetFields()
                    setError(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn secondary" onClick={() => setChanging(true)}>
              Change backup password
            </button>
          )}
        </>
      )}

      {recoveryKey && (
        <Modal
          title="Save your recovery key"
          dismissible={false}
          onClose={() => setRecoveryKey(null)}
          footer={
            <button type="button" className="btn" disabled={!keySaved} onClick={() => setRecoveryKey(null)}>
              Done
            </button>
          }
        >
          <p>
            If the backup password is forgotten, this key is the <strong>only</strong> other way to open an
            encrypted backup. It is shown once and is not stored on this computer.
          </p>
          <p className="backup-recovery-key" data-testid="recovery-key">
            {recoveryKey}
          </p>
          <div className="backup-offsite-actions">
            <button type="button" className="btn secondary" onClick={() => {
                if (!printRecoveryKey(recoveryKey)) {
                  showToast('Printing is not available here. Copy the key or write it down.', 'error')
                }
              }}>
              <Printer size={16} strokeWidth={1.75} aria-hidden />
              Print
            </button>
            <button type="button" className="btn secondary" onClick={() => void copyKey()}>
              <Copy size={16} strokeWidth={1.75} aria-hidden />
              Copy
            </button>
          </div>
          <label className="backup-recovery-confirm">
            <input type="checkbox" checked={keySaved} onChange={(event) => setKeySaved(event.target.checked)} />
            I have printed or written down the recovery key and stored it safely
          </label>
        </Modal>
      )}
    </div>
  )
}
