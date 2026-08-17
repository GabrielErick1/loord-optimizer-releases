const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  windowControl: (action) => ipcRenderer.send('window-control', action),
  checkAdmin: () => ipcRenderer.invoke('check-admin'),
  checkBlueStacksStatus: () => ipcRenderer.invoke('check-bluestacks-status'),
  closeBlueStacks: () => ipcRenderer.invoke('close-bluestacks'),
  applyBackup: () => ipcRenderer.invoke('apply-backup'),
  getBackupStatus: () => ipcRenderer.invoke('get-backup-status'),
  restoreBackup: () => ipcRenderer.invoke('restore-backup'),
  applyOptimizations: (config) => ipcRenderer.invoke('apply-optimizations', config),
  cleanRam: () => ipcRenderer.invoke('clean-ram'),
  optimizeProcesses: () => ipcRenderer.invoke('optimize-processes'),
  optimizeWindowsMaster: () => ipcRenderer.invoke('optimize-windows-master'),
  applySingleTweak: (data) => ipcRenderer.invoke('apply-single-tweak', data),
  rebootComputer: () => ipcRenderer.invoke('reboot-computer'),
  startMacro: (force) => ipcRenderer.invoke('start-macro', force),
  stopMacro: () => ipcRenderer.invoke('stop-macro'),
  getUuid: () => ipcRenderer.invoke('get-uuid'),
  getMachineUUID: () => ipcRenderer.invoke('get-uuid'),
  verifyKey: (key) => ipcRenderer.invoke('verify-key', key),

  // ─── Auto-Update ─────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_e, info) => cb(info)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update-not-available', () => cb()),
  onUpdateError: (cb) => ipcRenderer.on('update-error', (_e, msg) => cb(msg)),
  // ─────────────────────────────────────────────────────────────────

  // ─── ADB ─────────────────────────────────────────────────────────
  adbConnect: (port) => ipcRenderer.invoke('adb-connect', port),
  adbAutoDetect: () => ipcRenderer.invoke('adb-autodetect'),
  adbShell: (cmd, port) => ipcRenderer.invoke('adb-shell', cmd, port),
  adbUninstall: (packages, port) => ipcRenderer.invoke('adb-uninstall', packages, port),
  // ─── FPS & Delay Fix ─────────────────────────────────────────────
  unlockFpsHz: (hz) => ipcRenderer.invoke('unlock-fps-hz', hz),
  removeFreeFireDelay: () => ipcRenderer.invoke('remove-freefire-delay'),
  // ─── Device Profiles & ROM Flasher ──────────────────────────────
  changeDeviceProfile: (profile) => ipcRenderer.invoke('change-device-profile', profile),
  flashSystemTweaks: (port) => ipcRenderer.invoke('flash-system-tweaks', port),
  // ─── Real Android Transformation ────────────────────────────────
  convertToRealAndroid: (port) => ipcRenderer.invoke('convert-to-real-android', port),
  restoreDefaultAndroid: (port) => ipcRenderer.invoke('restore-default-android', port),
  // ─── Network & DNS Gamer ─────────────────────────────────────────
  testPing: () => ipcRenderer.invoke('test-ping'),
  setGamerDns: (dnsType) => ipcRenderer.invoke('set-gamer-dns', dnsType),
  // ─── Game Booster Turbo ──────────────────────────────────────────
  boostGameTurbo: () => ipcRenderer.invoke('boost-game-turbo'),
  // ─── Backup & Restore Configs ────────────────────────────────────
  exportUserConfig: (config) => ipcRenderer.invoke('export-user-config', config),
  importUserConfig: () => ipcRenderer.invoke('import-user-config'),
  // ─────────────────────────────────────────────────────────────────
});

