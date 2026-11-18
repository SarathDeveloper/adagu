(function () {
  function invoke(cmd, args) {
    return new Promise(function (resolve, reject) {
      function attempt() {
        var internals = window.__TAURI_INTERNALS__;
        var core = window.__TAURI__ && window.__TAURI__.core;
        if (internals && typeof internals.invoke === 'function') {
          internals.invoke(cmd, args).then(resolve, reject);
          return;
        }
        if (core && typeof core.invoke === 'function') {
          core.invoke(cmd, args).then(resolve, reject);
          return;
        }
        setTimeout(attempt, 20);
      }
      attempt();
    });
  }

  // With backup encryption on, exports are `.pdenc` files rather than a plain
  // .db or .zip, so the save dialog has to offer the right extension.
  async function exportsEncrypted() {
    try {
      var response = await fetch('/api/backup/status', { credentials: 'same-origin' });
      if (!response.ok) return false;
      var status = await response.json();
      return Boolean(status && status.encrypted);
    } catch (_error) {
      return false;
    }
  }

  var platform = navigator.platform || navigator.userAgent || 'unknown';
  var isMac = /Mac/i.test(platform);

  window.desktopAPI = {
    platform: platform,
    isMac: isMac,
    getAppVersion: function () {
      return invoke('get_app_version');
    },
    checkForUpdate: function () {
      return invoke('check_for_update');
    },
    installUpdate: function () {
      return invoke('install_update');
    },
    exportDatabase: async function () {
      var encrypted = await exportsEncrypted();
      var suggested =
        'pawndesk-backup-' + new Date().toISOString().slice(0, 10) + (encrypted ? '.db.pdenc' : '.db');
      var path = await invoke('choose_backup_path', {
        defaultFilename: suggested,
        filterName: encrypted ? 'Encrypted PawnDesk backup' : 'SQLite database',
        extension: encrypted ? 'pdenc' : 'db',
      });
      if (!path) {
        return { canceled: true };
      }
      var response = await fetch('/api/backup/export', { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error('Export failed');
      }
      var bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
      await invoke('write_backup_file', { path: path, bytes: bytes });
      return { canceled: false, filePath: path };
    },
    exportFullBackup: async function () {
      var encryptedFull = await exportsEncrypted();
      var suggested =
        'pawndesk-full-' + new Date().toISOString().slice(0, 10) + (encryptedFull ? '.zip.pdenc' : '.zip');
      var path = await invoke('choose_backup_path', {
        defaultFilename: suggested,
        filterName: encryptedFull ? 'Encrypted PawnDesk backup' : 'Zip archive',
        extension: encryptedFull ? 'pdenc' : 'zip',
      });
      if (!path) {
        return { canceled: true };
      }
      var response = await fetch('/api/backup/export-full', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path }),
      });
      if (!response.ok) {
        var message = 'Full backup failed';
        try {
          var payload = await response.json();
          if (payload && payload.error) message = payload.error;
        } catch (_error) {
          // Keep the generic message when the server sent no JSON.
        }
        throw new Error(message);
      }
      var written = path;
      try {
        var result = await response.json();
        if (result && result.path) written = result.path;
      } catch (_error) {
        // Older API: the file is where the dialog put it.
      }
      return { canceled: false, filePath: written };
    },
    exportExcel: async function () {
      var suggested = 'pawndesk-tables-' + new Date().toISOString().slice(0, 10) + '.xlsx';
      var path = await invoke('choose_backup_path', {
        defaultFilename: suggested,
        filterName: 'Excel workbook',
        extension: 'xlsx',
      });
      if (!path) {
        return { canceled: true };
      }
      var response = await fetch('/api/backup/export-excel', { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error('Excel export failed');
      }
      var bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
      await invoke('write_backup_file', { path: path, bytes: bytes });
      return { canceled: false, filePath: path };
    },
    chooseBackupFolder: function () {
      return invoke('choose_backup_folder');
    },
    savePdf: async function (bytes, defaultFilename) {
      var path = await invoke('choose_backup_path', {
        defaultFilename: defaultFilename,
        filterName: 'PDF document',
        extension: 'pdf',
      });
      if (!path) {
        return { canceled: true };
      }
      await invoke('write_backup_file', { path: path, bytes: Array.from(bytes) });
      return { canceled: false, filePath: path };
    },
    openPrintWindow: function (path) {
      return invoke('open_print_window', { path: path });
    },
    printWebview: function () {
      return invoke('print_webview');
    },
  };

  // In a dedicated print window on macOS, render through the native webview
  // print panel. WKWebView does not reliably print an embedded iframe, so
  // PrintPreviewModal opens this window instead.
  if (window.__PD_DESKTOP_PRINT__ && isMac) {
    window.print = function () {
      window.desktopAPI.printWebview();
    };
  }
})();
