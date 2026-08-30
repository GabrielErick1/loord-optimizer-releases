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
  getUuid: () => ipcRenderer.invoke('get-uuid'),
  getMachineUUID: () => ipcRenderer.invoke('get-uuid'),
  verifyKey: (key) => ipcRenderer.invoke('verify-key', key),
  revertAllTweaksOnRevoke: () => ipcRenderer.invoke('revert-all-tweaks-on-revoke'),
  createRestorePoint: () => ipcRenderer.invoke('create-restore-point'),
  getRestorePointStatus: () => ipcRenderer.invoke('get-restore-point-status'),


  // ─── Auto-Update ─────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdateProgress: (url) => ipcRenderer.invoke('download-update-progress', url),
  installUpdate: () => ipcRenderer.send('install-update'),
  installUpdateNow: () => ipcRenderer.invoke('install-update-now'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, info) => cb(info)),
  onUpdateDownloadProgress: (cb) => ipcRenderer.on('update-download-progress', (_e, data) => cb(data)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_e, info) => cb(info)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update-not-available', () => cb()),
  onUpdateError: (cb) => ipcRenderer.on('update-error', (_e, msg) => cb(msg)),
  // ─────────────────────────────────────────────────────────────────

  // ─── ADB ─────────────────────────────────────────────────────────
  adbConnect: (port) => ipcRenderer.invoke('adb-connect', port),
  adbAutoDetect: () => ipcRenderer.invoke('adb-autodetect'),
  adbShell: (cmd, port) => ipcRenderer.invoke('adb-shell', cmd, port),
  adbUninstall: (packages, port) => ipcRenderer.invoke('adb-uninstall', packages, port),
  removeEmulatorAds: (port) => ipcRenderer.invoke('remove-emulator-ads', port),
  // ─── Touch Engine & Sensibilidade iPhone / Android Real ──────────
  applyTouchEngineProfile: (profile, port) => ipcRenderer.invoke('apply-touch-engine-profile', profile, port),
  setAndroidDpi: (dpiValue, port) => ipcRenderer.invoke('set-android-dpi', dpiValue, port),
  // ─── FPS & Delay Fix ───────────────────────────────────────────
  unlockFpsHz: (hz) => ipcRenderer.invoke('unlock-fps-hz', hz),
  removeFreeFireDelay: () => ipcRenderer.invoke('remove-freefire-delay'),
  // ─── Device Profiles & ROM Flasher ──────────────────────────────
  changeDeviceProfile: (profile) => ipcRenderer.invoke('change-device-profile', profile),
  flashSystemTweaks: (port) => ipcRenderer.invoke('flash-system-tweaks', port),
  // ─── Real Android Transformation ────────────────────────────────
  convertToRealAndroid: (port) => ipcRenderer.invoke('convert-to-real-android', port),
  restoreDefaultAndroid: (port) => ipcRenderer.invoke('restore-default-android', port),
  restartBluestacks: () => ipcRenderer.invoke('restart-bluestacks'),
  // ─── Network & DNS Gamer ─────────────────────────────────────────
  testPing: () => ipcRenderer.invoke('test-ping'),
  setGamerDns: (dnsType) => ipcRenderer.invoke('set-gamer-dns', dnsType),
  resetNetworkDhcp: () => ipcRenderer.invoke('reset-network-dhcp'),
  // ─── Macro de Controle de Recoil & Puxada Y ─────────────────────
  startMacro: (speed, active) => ipcRenderer.invoke('start-macro', speed, active),
  prepareMacro: (speed) => ipcRenderer.invoke('prepare-macro', speed),
  setMacroSpeed: (speed) => ipcRenderer.invoke('set-macro-speed', speed),
  stopMacro: () => ipcRenderer.invoke('stop-macro'),
  // ─── Game Booster Turbo ──────────────────────────────────────────
  boostGameTurbo: () => ipcRenderer.invoke('boost-game-turbo'),
  // ─── PC Fraco / 1ª Geração (Ultra FPS) ───────────────────────────
  optimizePcFraco: () => ipcRenderer.invoke('optimize-pc-fraco'),
  cleanDeepDisk: () => ipcRenderer.invoke('clean-deep-disk'),
  removeWindowsBloatware: () => ipcRenderer.invoke('remove-windows-bloatware'),
  applyLowEndEmulatorConfig: (preset) => ipcRenderer.invoke('apply-low-end-emulator-config', preset),
  setFixedPagefile: () => ipcRenderer.invoke('set-fixed-pagefile'),
  transformWindowsLite: () => ipcRenderer.invoke('transform-windows-lite'),
  disableWindowsDefenderPermanent: () => ipcRenderer.invoke('disable-windows-defender-permanent'),
  getSystemHardwareInfo: () => ipcRenderer.invoke('get-system-hardware-info'),
  applyCompetitiveEmulatorTweak: (config) => ipcRenderer.invoke('apply-competitive-emulator-tweak', config),
  applyAdaptiveRegedit: (config) => ipcRenderer.invoke('apply-adaptive-regedit', config),
  applyAdaptiveProfile: (profileName) => ipcRenderer.invoke('apply-adaptive-profile', profileName),
  // ─── Regedit Full Capa (RareFix) ──────────────────────────────────
  applyRarefixProfile: (profile) => ipcRenderer.invoke('apply-rarefix-profile', profile),
  openRarefixHta: () => ipcRenderer.invoke('open-rarefix-hta'),
  // ─── ISO Loord Format & Setup ─────────────────────────────────────
  checkLoordIsoStatus: () => ipcRenderer.invoke('check-loord-iso-status'),
  getIsoPlansPublic: () => ipcRenderer.invoke('get-iso-plans-public'),
  createIsoPixPayment: (planId, clientName) => ipcRenderer.invoke('create-iso-pix-payment', planId, clientName),
  checkIsoPixPayment: (paymentId) => ipcRenderer.invoke('check-iso-pix-payment', paymentId),
  activateIsoKey: (key) => ipcRenderer.invoke('activate-iso-key', key),
  downloadLoordIso: () => ipcRenderer.invoke('download-loord-iso'),
  prepareLoordPartition: () => ipcRenderer.invoke('prepare-loord-partition'),
  startLoordFormat: () => ipcRenderer.invoke('start-loord-format'),
  removeLoordPartition: () => ipcRenderer.invoke('remove-loord-partition'),
  getConnectedUsbs: () => ipcRenderer.invoke('get-connected-usbs'),
  createBootableUsb: (letter) => ipcRenderer.invoke('create-bootable-usb', letter),
  onIsoDownloadProgress: (callback) => {
    ipcRenderer.removeAllListeners('iso-download-progress');
    ipcRenderer.on('iso-download-progress', (event, data) => callback(data));
  },
  onUsbProgress: (callback) => {
    ipcRenderer.removeAllListeners('usb-progress');
    ipcRenderer.on('usb-progress', (event, data) => callback(data));
  },
  onMacroStateChanged: (callback) => {
    ipcRenderer.removeAllListeners('macro-state-changed');
    ipcRenderer.on('macro-state-changed', (event, data) => callback(data));
  },
  // ─── Loord IA Gamer (Grok AI) ────────────────────────────────────
  askIaGrok: (question) => ipcRenderer.invoke('ask-ia-gamer', question),
  // ─────────────────────────────────────────────────────────────────
});

