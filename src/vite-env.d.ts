/// <reference types="vite/client" />

type DesktopExportResult = {
  canceled: boolean
  filePath?: string
}

type DesktopUpdateInfo = {
  version: string
  currentVersion: string
  notes?: string | null
  date?: string | null
}

type DesktopAPI = {
  /** Missing in older desktop builds. Resolves null when up to date or updates are off. */
  checkForUpdate?: () => Promise<DesktopUpdateInfo | null>
  installUpdate?: () => Promise<void>
  exportDatabase: () => Promise<DesktopExportResult>
  exportFullBackup: () => Promise<DesktopExportResult>
  exportExcel: () => Promise<DesktopExportResult>
  savePdf: (bytes: Uint8Array, defaultFilename: string) => Promise<DesktopExportResult>
  chooseBackupFolder: () => Promise<string | null>
  getAppVersion: () => Promise<string>
  platform: string
  isMac: boolean
  openPrintWindow: (path: string) => Promise<void>
  printWebview: () => Promise<void>
}

interface Window {
  desktopAPI?: DesktopAPI
  __PD_DESKTOP_PRINT__?: boolean
}
