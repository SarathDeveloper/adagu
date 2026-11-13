import { spawn, spawnSync } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { isSafeWhatsAppUrl, toWhatsAppDesktopUrl } from '@shared/adagu/reminders'
import { HttpError } from './http'

/** Tests (and headless runs) set this so nothing is launched or copied. */
function launchesDisabled(): boolean {
  return process.env.PAWNDESK_NO_OPEN === '1'
}

/**
 * Open a WhatsApp chat in the installed WhatsApp Desktop app.
 *
 * The caller passes the shop's own `https://wa.me/<number>?text=<message>`
 * link. It is validated, converted to the `whatsapp://send` form the Desktop
 * app registers, and handed to the operating system's URL handler. On Windows
 * that is `rundll32 url.dll,FileProtocolHandler`, which receives the URL as a
 * plain argument: no `cmd.exe` is involved, so the `&` in the URL is never
 * read as a command separator. Tauri capabilities stay untouched, so the
 * desktop shell itself still cannot open external URLs.
 */
export function openExternalUrl(url: string): void {
  if (!isSafeWhatsAppUrl(url)) {
    throw new HttpError(400, 'Only WhatsApp links can be opened')
  }
  const desktopUrl = toWhatsAppDesktopUrl(url)
  if (!desktopUrl) {
    throw new HttpError(400, 'Only WhatsApp links can be opened')
  }
  if (launchesDisabled()) return

  const options = { detached: true, stdio: 'ignore' as const, windowsHide: true }
  if (process.platform === 'win32') {
    spawn('rundll32.exe', ['url.dll,FileProtocolHandler', desktopUrl], options).unref()
    return
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open'
  spawn(opener, [desktopUrl], options).unref()
}

/**
 * Put a file on the system clipboard as a file (not its text), so pasting into
 * a WhatsApp chat attaches it. The path is passed through an environment
 * variable or argv, never spliced into a script. Returns false when the
 * platform has no way to do it or the copy failed.
 */
export function copyFileToClipboard(filePath: string): boolean {
  if (!isAbsolute(filePath)) return false
  if (launchesDisabled()) return true
  try {
    if (process.platform === 'win32') {
      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          'Set-Clipboard -LiteralPath $env:PAWNDESK_CLIPBOARD_FILE',
        ],
        {
          env: { ...process.env, PAWNDESK_CLIPBOARD_FILE: filePath },
          windowsHide: true,
          timeout: 10_000,
          stdio: 'ignore',
        },
      )
      return result.status === 0
    }
    if (process.platform === 'darwin') {
      const result = spawnSync(
        'osascript',
        [
          '-e',
          'on run argv',
          '-e',
          'set the clipboard to (POSIX file (item 1 of argv))',
          '-e',
          'end run',
          filePath,
        ],
        { timeout: 10_000, stdio: 'ignore' },
      )
      return result.status === 0
    }
    return false
  } catch {
    return false
  }
}
