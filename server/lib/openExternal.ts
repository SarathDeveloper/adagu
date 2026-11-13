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

/**
 * PowerShell run after a receipt chat opens: wait for the chat to load, bring
 * WhatsApp to the front and press Ctrl+V so the PDF on the clipboard attaches.
 * It only pastes when the foreground window really is WhatsApp (a paste must
 * never land in another app) and it never presses Enter: staff check the
 * attachment and send it themselves. The script holds no user data; the file
 * is already on the clipboard.
 */
const WHATSAPP_AUTO_PASTE_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PawnDeskForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public static string Title() {
    var text = new StringBuilder(256);
    GetWindowText(GetForegroundWindow(), text, text.Capacity);
    return text.ToString();
  }
}
"@
$shell = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds 2500
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  [void]$shell.AppActivate('WhatsApp')
  Start-Sleep -Milliseconds 300
  # WhatsApp Desktop's window is titled exactly "WhatsApp" (a browser tab is not).
  if ([PawnDeskForeground]::Title() -eq 'WhatsApp') {
    Start-Sleep -Milliseconds 500
    $shell.SendKeys('^v')
    exit 0
  }
  Start-Sleep -Milliseconds 300
}
exit 1
`

/**
 * Attach the clipboard file in the WhatsApp chat that was just opened, by
 * pasting into WhatsApp Desktop once it is in front. Runs in the background so
 * the request returns at once. Windows only; returns whether it was started.
 */
export function autoPasteIntoWhatsApp(): boolean {
  if (launchesDisabled() || process.platform !== 'win32') return false
  try {
    const encoded = Buffer.from(WHATSAPP_AUTO_PASTE_SCRIPT, 'utf16le').toString('base64')
    spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { detached: true, stdio: 'ignore', windowsHide: true },
    ).unref()
    return true
  } catch {
    return false
  }
}
