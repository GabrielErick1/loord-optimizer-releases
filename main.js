const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Determine admin privileges synchronously before setting paths
let systemIsAdmin = false;
try {
  execSync('net session');
  systemIsAdmin = true;
} catch (e) {
  systemIsAdmin = false;
}

// Redirect UserData to separate folders for User vs Admin to avoid permission/lock clashes
const appName = app.name || 'loord-optimizer';
const customUserData = path.join(app.getPath('appData'), appName + (systemIsAdmin ? '_Admin' : '_User'));
app.setPath('userData', customUserData);

let mainWindow;
let macroProcess = null;
const backupDir = path.join(app.getPath('userData'), 'Backup_Sensibilidade');

// Ensure backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Check for Administrator privileges (async helper for renderer compatibility)
function checkAdminPrivileges(callback) {
  callback(systemIsAdmin);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 600,
    minWidth: 850,
    minHeight: 550,
    resizable: true,
    frame: false, // Frame-less custom UI
    backgroundColor: '#0e0e11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  checkAdminPrivileges((isAdmin) => {
    systemIsAdmin = isAdmin;
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // ─── Auto-Updater Setup ───────────────────────────────────────────
  // Só verifica atualizações se for build empacotado (não em dev)
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;          // baixa silenciosamente
    autoUpdater.autoInstallOnAppQuit = false; // usuário decide quando instalar

    // Notifica renderer que uma atualização foi encontrada
    autoUpdater.on('update-available', (info) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-available', {
          version: info.version,
          releaseNotes: info.releaseNotes || ''
        });
      }
    });

    // Atualização já baixada — pronta para instalar
    autoUpdater.on('update-downloaded', (info) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', {
          version: info.version
        });
      }
    });

    // Sem atualizações disponíveis
    autoUpdater.on('update-not-available', () => {
      if (mainWindow) {
        mainWindow.webContents.send('update-not-available');
      }
    });

    autoUpdater.on('error', (err) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-error', err.message);
      }
    });

    // Verificar atualização 5 segundos após abrir
    setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  }
  // ─────────────────────────────────────────────────────────────────
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (macroProcess) {
    try {
      macroProcess.kill('SIGTERM');
    } catch (e) {}
  }
  try {
    execSync('taskkill /f /fi "WINDOWTITLE eq MacroCapaFreeFire*"', { stdio: 'ignore' });
  } catch (e) {}
});

// Helper: execute command asynchronously
function runCmd(command) {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

// IPC Handlers
ipcMain.on('window-control', (event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
  if (action === 'close') app.quit();
});

ipcMain.handle('check-admin', async () => {
  return systemIsAdmin;
});

// Auto-updater: instalar atualização quando o usuário clicar no botão
ipcMain.on('install-update', () => {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.quitAndInstall(false, true);
});

// Auto-updater: verificar manualmente
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { checking: false, dev: true };
  const { autoUpdater } = require('electron-updater');
  autoUpdater.checkForUpdates();
  return { checking: true };
});

const crypto = require('crypto');

ipcMain.handle('get-uuid', async () => {
  return getMachineUuid();
});

ipcMain.handle('verify-key', async (event, key) => {
  try {
    const uuid = getMachineUuid();
    const expectedKey = generateKeyForUuid(uuid);
    return key.trim().toUpperCase() === expectedKey;
  } catch (e) {
    return false;
  }
});

function getMachineUuid() {
  try {
    const output = execSync('powershell -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"', { encoding: 'utf8' });
    const uuid = output.trim();
    if (uuid && uuid.length > 10) {
      return uuid;
    }
  } catch (e) {
    console.error('Error getting UUID via CimInstance:', e);
  }
  try {
    const output = execSync('wmic csproduct get uuid', { encoding: 'utf8' });
    const lines = output.split('\n');
    if (lines.length > 1) {
      const uuid = lines[1].trim();
      if (uuid && uuid.length > 10) {
        return uuid;
      }
    }
  } catch (e) {
    console.error('Error getting UUID via wmic:', e);
  }
  return 'UNKNOWN-UUID-FALLBACK';
}

function generateKeyForUuid(uuid) {
  const salt = 'FFOptimizerSecure2026';
  const hash = crypto.createHash('sha256').update(uuid.trim().toLowerCase() + salt).digest('hex');
  const part1 = hash.substring(0, 4);
  const part2 = hash.substring(4, 8);
  const part3 = hash.substring(8, 12);
  const part4 = hash.substring(12, 16);
  return `${part1}-${part2}-${part3}-${part4}`.toUpperCase();
}

// ─── ADB Helpers ──────────────────────────────────────────────────────────────
function findAdb() {
  // Tenta adb no PATH primeiro, depois caminhos comuns do BlueStacks/Android SDK
  const candidates = [
    'adb',
    'C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe',
    'C:\\Program Files (x86)\\BlueStacks\\HD-Adb.exe',
    'C:\\Program Files\\BlueStacks\\HD-Adb.exe',
    path.join(process.env['LOCALAPPDATA'] || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    path.join(process.env['APPDATA'] || '', '..', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  ];
  for (const c of candidates) {
    try {
      execSync(`"${c}" version`, { stdio: 'ignore' });
      return c;
    } catch (_) {}
  }
  return null;
}

function runAdb(args) {
  return new Promise((resolve, reject) => {
    const adb = findAdb();
    if (!adb) return reject(new Error('ADB não encontrado. Instale o Android SDK Platform Tools ou use o BlueStacks.'));
    exec(`"${adb}" ${args}`, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

ipcMain.handle('adb-connect', async (event, port) => {
  const p = port || 5555;
  try {
    const out = await runAdb(`connect 127.0.0.1:${p}`);
    const ok = out.includes('connected') || out.includes('already connected');
    return { success: ok, output: out, port: p };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Auto-detect: tenta portas comuns dos emuladores
ipcMain.handle('adb-autodetect', async () => {
  const PORTS = [5555, 5565, 5575, 5585, 5595, 21503, 62001, 5554, 5556, 7555];
  const adb = findAdb();
  if (!adb) return { success: false, error: 'ADB não encontrado.' };

  for (const p of PORTS) {
    try {
      const out = execSync(`"${adb}" connect 127.0.0.1:${p}`, { encoding: 'utf8', timeout: 3000 });
      if (out.includes('connected') || out.includes('already connected')) {
        return { success: true, port: p, output: out.trim() };
      }
    } catch (_) {}
  }
  return { success: false, error: 'Nenhum emulador encontrado nas portas padrão.' };
});

ipcMain.handle('adb-shell', async (event, cmd, port) => {
  const p = port || 5555;
  try {
    const out = await runAdb(`-s 127.0.0.1:${p} shell ${cmd}`);
    return { success: true, output: out };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('adb-uninstall', async (event, packages, port) => {
  const p = port || 5555;
  const results = [];
  for (const pkg of packages) {
    try {
      const out = await runAdb(`-s 127.0.0.1:${p} shell pm uninstall --user 0 ${pkg}`);
      const isSuccess = out.includes('Success');
      if (!isSuccess) {
        await runAdb(`-s 127.0.0.1:${p} shell pm disable-user --user 0 ${pkg}`).catch(() => {});
        await runAdb(`-s 127.0.0.1:${p} shell pm clear ${pkg}`).catch(() => {});
      }
      results.push({ pkg, ok: isSuccess, out: out.trim() });
    } catch (e) {
      try {
        await runAdb(`-s 127.0.0.1:${p} shell pm disable-user --user 0 ${pkg}`);
        results.push({ pkg, ok: true, out: 'Disabled' });
      } catch (err2) {
        results.push({ pkg, ok: false, error: e.message });
      }
    }
  }
  return results;
});

ipcMain.handle('unlock-fps-hz', async (event, hz) => {
  const targetHz = String(hz || 240);
  const files = [
    'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf'
  ];

  let modifiedCount = 0;
  for (const f of files) {
    if (fs.existsSync(f)) {
      try {
        let content = fs.readFileSync(f, 'utf8');
        content = content.replace(/bst\.instance\.(.*?)\.enable_high_fps=".*?"/g, 'bst.instance.$1.enable_high_fps="0"');
        content = content.replace(/bst\.instance\.(.*?)\.max_fps=".*?"/g, 'bst.instance.$1.max_fps="999"');
        if (/bst\.mim\.max_fps=".*?"/.test(content)) {
          content = content.replace(/bst\.mim\.max_fps=".*?"/g, `bst.mim.max_fps="${targetHz}"`);
        } else {
          content += `\r\nbst.mim.max_fps="${targetHz}"`;
        }
        fs.writeFileSync(f, content, 'utf8');
        modifiedCount++;
      } catch (e) {
        console.error(`Erro ao atualizar FPS em ${f}:`, e.message);
      }
    }
  }

  return { success: modifiedCount > 0, modifiedCount };
});

ipcMain.handle('remove-freefire-delay', async () => {
  const folders = [
    'C:\\ProgramData\\BlueStacks_msi5\\Engine\\UserData\\InputMapper',
    'C:\\ProgramData\\BlueStacks_msi5\\Engine\\UserData\\InputMapper\\UserFiles',
    'C:\\ProgramData\\BlueStacks_nxt\\Engine\\UserData\\InputMapper',
    'C:\\ProgramData\\BlueStacks_nxt\\Engine\\UserData\\InputMapper\\UserFiles',
    'C:\\ProgramData\\BlueStacks_msi\\Engine\\UserData\\InputMapper',
    'C:\\ProgramData\\BlueStacks_msi\\Engine\\UserData\\InputMapper\\UserFiles',
    'C:\\ProgramData\\BlueStacks\\Engine\\UserData\\InputMapper',
    'C:\\ProgramData\\BlueStacks\\Engine\\UserData\\InputMapper\\UserFiles'
  ];

  const cfgFiles = ['com.dts.freefireth.cfg', 'com.dts.freefiremax.cfg'];
  let totalReplaced = 0;
  let filesModified = 0;

  for (const folder of folders) {
    for (const cfg of cfgFiles) {
      const fullPath = path.join(folder, cfg);
      if (fs.existsSync(fullPath)) {
        try {
          let content = fs.readFileSync(fullPath, 'utf8');
          const matches = content.match(/"ExclusiveDelay"\s*:\s*\d+/g);
          if (matches && matches.length > 0) {
            content = content.replace(/"ExclusiveDelay"\s*:\s*\d+/g, '"ExclusiveDelay" : 1');
            fs.writeFileSync(fullPath, content, 'utf8');
            totalReplaced += matches.length;
            filesModified++;
          }
        } catch (e) {
          console.error(`Erro ao modificar ${fullPath}:`, e.message);
        }
      }
    }
  }

  return { success: filesModified > 0, filesModified, totalReplaced };
});

ipcMain.handle('change-device-profile', async (event, profile) => {
  const { brand, manufacturer, model, carrier } = profile || {};
  const targetBrand = brand || 'asus';
  const targetManufacturer = manufacturer || 'asus';
  const targetModel = model || 'ASUS_AI2401_D';
  const targetCarrier = carrier || 'se_72405';

  const files = [
    'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf'
  ];

  let modifiedCount = 0;
  for (const f of files) {
    if (fs.existsSync(f)) {
      try {
        let lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        let newLines = [];
        for (let line of lines) {
          if (line.includes('.device_profile_code=')) {
            const inst = line.match(/^bst\.instance\.(.*?)\.device_profile_code=/);
            if (inst) line = `bst.instance.${inst[1]}.device_profile_code="custom"`;
          } else if (line.includes('.device_custom_brand=')) {
            const inst = line.match(/^bst\.instance\.(.*?)\.device_custom_brand=/);
            if (inst) line = `bst.instance.${inst[1]}.device_custom_brand="${targetBrand}"`;
          } else if (line.includes('.device_custom_manufacturer=')) {
            const inst = line.match(/^bst\.instance\.(.*?)\.device_custom_manufacturer=/);
            if (inst) line = `bst.instance.${inst[1]}.device_custom_manufacturer="${targetManufacturer}"`;
          } else if (line.includes('.device_custom_model=')) {
            const inst = line.match(/^bst\.instance\.(.*?)\.device_custom_model=/);
            if (inst) line = `bst.instance.${inst[1]}.device_custom_model="${targetModel}"`;
          } else if (line.includes('.device_carrier_code=')) {
            const inst = line.match(/^bst\.instance\.(.*?)\.device_carrier_code=/);
            if (inst) line = `bst.instance.${inst[1]}.device_carrier_code="${targetCarrier}"`;
          }
          newLines.push(line);
        }
        fs.writeFileSync(f, newLines.join('\r\n'), 'utf8');
        modifiedCount++;
      } catch (e) {
        console.error(`Erro ao atualizar device profile em ${f}:`, e.message);
      }
    }
  }

  return { success: modifiedCount > 0, modifiedCount, model: targetModel, brand: targetBrand };
});

ipcMain.handle('flash-system-tweaks', async (event, port) => {
  const p = port || 5555;
  const adb = findAdb();
  if (!adb) return { success: false, error: 'ADB não encontrado.' };

  try {
    execSync(`"${adb}" connect 127.0.0.1:${p}`, { encoding: 'utf8', timeout: 5000, stdio: 'ignore' });
  } catch (_) {}

  const tweaks = [
    'setprop debug.sf.hw 1',
    'setprop debug.egl.hw 1',
    'setprop debug.performance.tuning 1',
    'setprop video.accelerate.hw 1',
    'setprop persist.sys.ui.hw 1',
    'setprop ro.config.low_ram false',
    'setprop persist.sys.use_dithering 0',
    'setprop debug.sf.nobootanimation 1'
  ];

  let applied = 0;
  for (const tw of tweaks) {
    try {
      execSync(`"${adb}" -s 127.0.0.1:${p} shell "${tw}"`, { encoding: 'utf8', timeout: 5000, stdio: 'ignore' });
      applied++;
    } catch (e) {}
  }

  return { success: true, appliedCount: applied };
});

ipcMain.handle('convert-to-real-android', async (event, port) => {
  const p = port || 5555;
  const adb = findAdb();
  if (!adb) return { success: false, error: 'ADB não encontrado.' };

  try {
    execSync(`"${adb}" connect 127.0.0.1:${p}`, { encoding: 'utf8', timeout: 5000, stdio: 'ignore' });
  } catch (_) {}

  const actions = [
    'pm disable-user --user 0 gg.now.ads.service',
    'pm disable-user --user 0 gg.now.billing.service2',
    'pm disable-user --user 0 gg.now.billing.interceptor',
    'pm disable-user --user 0 com.bluestacks.home',
    'pm disable-user --user 0 com.bluestacks.gamepedia',
    'pm enable com.android.launcher3',
    'setprop debug.sf.hw 1',
    'setprop debug.egl.hw 1',
    'setprop debug.performance.tuning 1',
    'setprop video.accelerate.hw 1',
    'setprop persist.sys.ui.hw 1',
    'setprop persist.sys.use_dithering 0',
    'setprop debug.sf.nobootanimation 1'
  ];

  let applied = 0;
  for (const act of actions) {
    try {
      execSync(`"${adb}" -s 127.0.0.1:${p} shell "${act}"`, { encoding: 'utf8', timeout: 5000, stdio: 'ignore' });
      applied++;
    } catch (e) {}
  }

  // Also clean ads from bluestacks.conf files
  const files = [
    'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks\\bluestacks.conf'
  ];
  for (const f of files) {
    if (fs.existsSync(f)) {
      try {
        let content = fs.readFileSync(f, 'utf8');
        content = content.replace(/bst\.banner_games_enabled=".*?"/g, 'bst.banner_games_enabled="0"');
        content = content.replace(/bst\.feature\.game_center=".*?"/g, 'bst.feature.game_center="0"');
        content = content.replace(/bst\.feature\.rewards=".*?"/g, 'bst.feature.rewards="0"');
        content = content.replace(/bst\.instance\.(.*?)\.show_ads=".*?"/g, 'bst.instance.$1.show_ads="0"');
        content = content.replace(/bst\.instance\.(.*?)\.show_banner=".*?"/g, 'bst.instance.$1.show_banner="0"');
        fs.writeFileSync(f, content, 'utf8');
      } catch (e) {}
    }
  }

  return { success: true, appliedCount: applied };
});

ipcMain.handle('restore-default-android', async (event, port) => {
  const p = port || 5555;
  const adb = findAdb();
  if (!adb) return { success: false, error: 'ADB não encontrado.' };

  try {
    execSync(`"${adb}" connect 127.0.0.1:${p}`, { encoding: 'utf8', timeout: 5000, stdio: 'ignore' });
  } catch (_) {}

  const actions = [
    'pm enable com.bluestacks.home',
    'pm enable com.bluestacks.gamepedia',
    'pm enable gg.now.ads.service'
  ];

  for (const act of actions) {
    try {
      execSync(`"${adb}" -s 127.0.0.1:${p} shell "${act}"`, { encoding: 'utf8', timeout: 5000, stdio: 'ignore' });
    } catch (e) {}
  }

  return { success: true };
});
// ──────────────────────────────────────────────────────────────────────────────


ipcMain.handle('check-bluestacks-status', async () => {
  const msiPaths = [
    'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf'
  ];
  const bsPaths = [
    'C:\\ProgramData\\BlueStacks\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf'
  ];

  const status = {
    msi5Installed: msiPaths.some(p => fs.existsSync(p)),
    nxtInstalled: bsPaths.some(p => fs.existsSync(p)),
    running: false,
  };

  try {
    const tasks = await runCmd('tasklist');
    if (tasks.toLowerCase().includes('hd-player.exe')) {
      status.running = true;
    }
  } catch (e) {
    console.error('Error checking processes:', e);
  }

  return status;
});

ipcMain.handle('apply-backup', async () => {
  try {
    await runCmd(`reg export "HKCU\\Control Panel\\Mouse" "${path.join(backupDir, 'Mouse_Original.reg')}" /y`);
    await runCmd(`reg export "HKCU\\Control Panel\\Accessibility" "${path.join(backupDir, 'Accessibility_Original.reg')}" /y`);
    await runCmd(`reg export "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" "${path.join(backupDir, 'PriorityControl_Original.reg')}" /y`);
    await runCmd(`reg export "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" "${path.join(backupDir, 'SystemProfile_Original.reg')}" /y`);
    await runCmd(`reg export "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" "${path.join(backupDir, 'Mouclass_Original.reg')}" /y`);
    await runCmd(`reg export "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" "${path.join(backupDir, 'Kbdclass_Original.reg')}" /y`);
    await runCmd(`reg export "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" "${path.join(backupDir, 'Kernel_Original.reg')}" /y`);
    await runCmd(`reg export "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe" "${path.join(backupDir, 'HDPlayer_Original.reg')}" /y`);

    const pathsToBackup = [
      { key: 'bluestacks_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf' },
      { key: 'bluestacks_msi5.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf' },
      { key: 'bluestacks_bgp_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf' },
      { key: 'bluestacks.conf.bak', path: 'C:\\ProgramData\\BlueStacks\\bluestacks.conf' },
      { key: 'bluestacks_nxt.conf.bak', path: 'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf' },
      { key: 'bluestacks_bgp.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf' }
    ];
    for (const item of pathsToBackup) {
      if (fs.existsSync(item.path)) {
        fs.copyFileSync(item.path, path.join(backupDir, item.key));
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-backup-status', async () => {
  const files = [
    'Mouse_Original.reg',
    'Accessibility_Original.reg',
    'PriorityControl_Original.reg',
    'SystemProfile_Original.reg',
    'Mouclass_Original.reg',
    'Kbdclass_Original.reg'
  ];
  const exists = files.every(file => fs.existsSync(path.join(backupDir, file)));
  return { exists };
});

ipcMain.handle('close-bluestacks', async () => {
  try {
    await runCmd('taskkill /f /im HD-Player.exe');
    return true;
  } catch (e) {
    return false;
  }
});

function getPhysicalScriptPath(scriptName) {
  const tempScriptPath = path.join(app.getPath('temp'), scriptName);
  const sourcePath = path.join(__dirname, scriptName);
  try {
    if (fs.existsSync(sourcePath)) {
      const content = fs.readFileSync(sourcePath);
      fs.writeFileSync(tempScriptPath, content);
      return tempScriptPath;
    }
  } catch (e) {
    console.error(`Erro ao extrair ${scriptName}:`, e);
  }
  return sourcePath;
}

// RAM Cleaner - runs silently inline (app already runs as Admin)
ipcMain.handle('clean-ram', async () => {
  try {
    const scriptPath = getPhysicalScriptPath('clean_ram.ps1');
    // Run hidden, no extra window, no double-process spawn
    execSync(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`, { stdio: 'ignore' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Optimize processes - runs silently inline (app already runs as Admin)
ipcMain.handle('optimize-processes', async () => {
  try {
    const scriptPath = getPhysicalScriptPath('otimizar_processos.ps1');
    // Run hidden, no extra window, no double-process spawn
    execSync(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`, { stdio: 'ignore' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('optimize-windows-master', async () => {
  if (!systemIsAdmin) {
    return { success: false, error: "Privilégios de Administrador requeridos." };
  }
  try {
    const directCommands = [
      'powercfg -h off',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f /reg:64',
      'powercfg -setactive SCHEME_MIN',
      'powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
      'powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61',
      'powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100',
      'powercfg -setactive SCHEME_CURRENT',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f /reg:64',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v UserPreferencesMask /t REG_BINARY /d 9012038010000000 /f',
      'reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v EnableAeroPeek /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v DragFullWindows /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" /v ToastEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_TOASTS_ENABLED /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer" /v DisableNotificationCenter /t REG_DWORD /d 1 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338389Enabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SoftLandingEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SystemPaneSuggestionsEnabled /t REG_DWORD /d 0 /f',
      'sc config "WSearch" start= demand',
      'sc config DiagTrack start= disabled',
      'sc stop DiagTrack',
      'sc config WerSvc start= disabled',
      'sc stop WerSvc',
      'sc config Spooler start= disabled',
      'sc stop Spooler',
      'sc config dmwappushservice start= disabled',
      'sc stop dmwappushservice',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 0 /f /reg:64',
      'ipconfig /flushdns'
    ];

    for (const cmd of directCommands) {
      try {
        execSync(cmd, { stdio: 'ignore' });
      } catch (e) {}
    }

    // Clean temp files safely without failing on locked files
    try {
      execSync('cmd.exe /c "del /q /f /s \"%TEMP%\\*\" & del /q /f /s \"C:\\Windows\\Temp\\*\" & del /q /f /s \"%LOCALAPPDATA%\\D3DSCache\\*\" & exit /b 0"', { stdio: 'ignore' });
    } catch (e) {}

    // Also run process reduction and RAM cleaner
    try {
      const procScript = getPhysicalScriptPath('otimizar_processos.ps1');
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${procScript}"`, { stdio: 'ignore' });
    } catch (e) {}

    try {
      const ramScript = getPhysicalScriptPath('clean_ram.ps1');
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ramScript}"`, { stdio: 'ignore' });
    } catch (e) {}

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});





// Modify bluestacks.conf helper
function updateConfFile(confPath, dpi, maxFps, forceRog2, engine, astc) {
  if (!fs.existsSync(confPath)) return false;

  let content = fs.readFileSync(confPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const newLines = [];

  const deviceBrand = forceRog2 ? 'asus' : null;
  const deviceModel = forceRog2 ? 'ASUS_I001DE' : null;
  const deviceManufacturer = forceRog2 ? 'asus' : null;

  for (let line of lines) {
    if (line.match(/^bst\.instance\.(.*?)\.dpi="(\d+)"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.dpi=/)[1];
      line = `bst.instance.${inst}.dpi="${dpi}"`;
    }
    else if (line.match(/^bst\.instance\.(.*?)\.enable_high_fps="(\d+)"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.enable_high_fps=/)[1];
      line = `bst.instance.${inst}.enable_high_fps="1"`;
    }
    else if (line.match(/^bst\.instance\.(.*?)\.max_fps="(\d+)"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.max_fps=/)[1];
      line = `bst.instance.${inst}.max_fps="${maxFps}"`;
    }
    else if (astc && line.match(/^bst\.instance\.(.*?)\.astc_decoding_mode=".*?"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.astc_decoding_mode=/)[1];
      line = `bst.instance.${inst}.astc_decoding_mode="${astc}"`;
    }
    else if (engine && line.match(/^bst\.instance\.(.*?)\.graphics_rendering_mode=".*?"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.graphics_rendering_mode=/)[1];
      line = `bst.instance.${inst}.graphics_rendering_mode="${engine}"`;
    }
    else if (line.match(/^bst\.instance\.(.*?)\.enable_vsync="(\d+)"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.enable_vsync=/)[1];
      line = `bst.instance.${inst}.enable_vsync="0"`;
    }
    else if (deviceBrand && line.match(/^bst\.instance\.(.*?)\.device_custom_brand=".*?"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.device_custom_brand=/)[1];
      line = `bst.instance.${inst}.device_custom_brand="${deviceBrand}"`;
    }
    else if (deviceModel && line.match(/^bst\.instance\.(.*?)\.device_custom_model=".*?"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.device_custom_model=/)[1];
      line = `bst.instance.${inst}.device_custom_model="${deviceModel}"`;
    }
    else if (deviceManufacturer && line.match(/^bst\.instance\.(.*?)\.device_custom_manufacturer=".*?"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.device_custom_manufacturer=/)[1];
      line = `bst.instance.${inst}.device_custom_manufacturer="${deviceManufacturer}"`;
    }
    else if (forceRog2 && line.match(/^bst\.instance\.(.*?)\.device_profile_code=".*?"/)) {
      const inst = line.match(/^bst\.instance\.(.*?)\.device_profile_code=/)[1];
      line = `bst.instance.${inst}.device_profile_code="custom"`;
    }
    newLines.push(line);
  }

  fs.writeFileSync(confPath, newLines.join('\r\n'), 'utf8');
  return true;
}

ipcMain.handle('apply-optimizations', async (event, config) => {
  if (!systemIsAdmin) {
    return { success: false, error: "Privilégios de Administrador requeridos." };
  }

  const { dpi, maxFps, forceRog2, mouseMode, pollingRate, engine, astc } = config;

  try {
    // Initial Backup
    const backupStatus = fs.readdirSync(backupDir).length > 0;
    const allPaths = [
      { key: 'bluestacks_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf' },
      { key: 'bluestacks_msi5.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf' },
      { key: 'bluestacks_bgp_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf' },
      { key: 'bluestacks.conf.bak', path: 'C:\\ProgramData\\BlueStacks\\bluestacks.conf' },
      { key: 'bluestacks_nxt.conf.bak', path: 'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf' },
      { key: 'bluestacks_bgp.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf' }
    ];

    if (!backupStatus) {
      await runCmd('powershell -Command "Enable-ComputerRestore -Drive C:\\; Checkpoint-Computer -Description OtimizacaoSensApp -RestorePointType MODIFY_SETTINGS"');
      await runCmd(`reg export "HKCU\\Control Panel\\Mouse" "${path.join(backupDir, 'Mouse_Original.reg')}" /y`);
      await runCmd(`reg export "HKCU\\Control Panel\\Accessibility" "${path.join(backupDir, 'Accessibility_Original.reg')}" /y`);
      await runCmd(`reg export "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" "${path.join(backupDir, 'PriorityControl_Original.reg')}" /y`);
      await runCmd(`reg export "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" "${path.join(backupDir, 'SystemProfile_Original.reg')}" /y`);
      await runCmd(`reg export "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" "${path.join(backupDir, 'Mouclass_Original.reg')}" /y`);
      await runCmd(`reg export "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" "${path.join(backupDir, 'Kbdclass_Original.reg')}" /y`);
      await runCmd(`reg export "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" "${path.join(backupDir, 'Kernel_Original.reg')}" /y`);
      await runCmd(`reg export "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe" "${path.join(backupDir, 'HDPlayer_Original.reg')}" /y`);
      
      for (const item of allPaths) {
        if (fs.existsSync(item.path)) {
          fs.copyFileSync(item.path, path.join(backupDir, item.key));
        }
      }
    }

    // Apply BlueStacks conf (Background)
    for (const item of allPaths) {
      if (fs.existsSync(item.path)) {
        updateConfFile(item.path, dpi, maxFps, forceRog2, engine, astc);
      }
    }

    // Import embedded registry definitions (works natively in dev, packaged ASAR, and installer setups)
    const embeddedRegData = require('./regis/embedded_reg_data.js');
    const selectedRegConfig = embeddedRegData[mouseMode];

    // Clean up previous/custom keys first so regedits never mix or overlap
    const keysToClean = [
      'Active', 'ActiveAC', 'ActiveDeveloped', 'ActiveDevoloped', 'ActiveFix', 'ActiveUser',
      'Beep2', 'DoubleClickSpeed2', 'DoubleClickWidth2', 'Fov', 'MouseCl', 'Mousecontroslub',
      'MouseCP', 'Mousecrib', 'MouseGrab', 'MouseSpeed2', 'MouseStickOn', 'MouseTK', 'Mousetrack',
      'DefaultTTL', 'EnablePMTUBHDetect', 'EnablePMTUDiscovery', 'SackOpts', 'Tcp1323Opts',
      'TCPDelAckTicks', 'TcpMaxDataRetransmissions', 'TcpNoDelay', 'TcpWindowSize'
    ];

    for (const keyName of keysToClean) {
      try {
        execSync(`reg delete "HKCU\\Control Panel\\Mouse" /v "${keyName}" /f`, { stdio: 'ignore' });
      } catch (e) {}
    }

    if (selectedRegConfig && Array.isArray(selectedRegConfig.keys)) {
      for (const item of selectedRegConfig.keys) {
        try {
          const cmd = `reg add "${item.path}" /v "${item.name}" /t ${item.type} /d "${item.value}" /f`;
          execSync(cmd, { stdio: 'ignore' });
        } catch (e) {
          console.error(`Erro ao aplicar regkey (${item.name}):`, e.message);
        }
      }
    }

    if (mouseMode === 'loord-3-sense-full-red') {
      try {
        await runCmd('bcdedit /set useplatformclock false').catch(() => {});
        await runCmd('bcdedit /set disabledynamictick yes').catch(() => {});
        await runCmd('bcdedit /deletevalue useplatformtick').catch(() => {});
        await runCmd('bcdedit /timeout 5').catch(() => {});
      } catch (e) {}
    }

    // Force MouseHoverTime to Hexadecimal 29 (REG_DWORD 41) for all regedits
    try {
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseHoverTime /t REG_DWORD /d 41 /f', { stdio: 'ignore' });
      execSync('reg add "HKU\\.DEFAULT\\Control Panel\\Mouse" /v MouseHoverTime /t REG_DWORD /d 41 /f', { stdio: 'ignore' });
    } catch (e) {}

    // Reload mouse curve and sensitivity in Windows RAM in real-time
    try {
      execSync(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Add-Type '[DllImport(\\"user32.dll\\")] public static extern bool SystemParametersInfo(int a,int b,IntPtr c,int d);' -Name U -Namespace W -PassThru | ForEach-Object { $null = $_::SystemParametersInfo(0x0004,0,[IntPtr]::Zero,0x0003); $null = $_::SystemParametersInfo(0x0071,10,[IntPtr]::Zero,0x0003) }"`, { stdio: 'ignore' });
    } catch (e) {}

    const currentRegInfo = selectedRegConfig ? { name: selectedRegConfig.name, fix: selectedRegConfig.fix } : { name: 'CUSTOM REGEDIT', fix: '1.0' };

    let mouseBatSection = `echo [*] Aplicando Registro de Sensibilidade (${currentRegInfo.name} - v${currentRegInfo.fix})...\necho [OK] Registro de Sensibilidade configurado nativamente.\necho.`;

    // Generate batch script content
    const tempDir = app.getPath('temp');
    const batPath = path.join(tempDir, 'apply_tweaks.bat');

    const batContent = `@echo off
chcp 65001 >nul
title FFOptimizer - Aplicando Otimizacoes
color 0C
echo ========================================================
echo           FFOPTIMIZER - APLICANDO OTIMIZACOES
echo ========================================================
echo.

echo [*] Configurando Prioridade de Processo (HD-Player.exe)...
reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f /reg:64 >nul 2>&1
reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v IoPriority /t REG_DWORD /d 3 /f /reg:64 >nul 2>&1
echo.

${mouseBatSection}

echo [*] Configurando Prioridade do Sistema (Win32PrioritySeparation)...
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 26 /f /reg:64 >nul 2>&1
reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 10 /f /reg:64 >nul 2>&1
echo.

echo [*] Desativando USB Selective Suspend (Latency USB)...
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\USB" /v DisableSelectiveSuspend /t REG_DWORD /d 1 /f /reg:64 >nul 2>&1
powercfg -setacvalueindex SCHEME_CURRENT SUB_USB USBSELECTIVE 0 >nul 2>&1
powercfg -setdcvalueindex SCHEME_CURRENT SUB_USB USBSELECTIVE 0 >nul 2>&1
powercfg -setactive SCHEME_CURRENT >nul 2>&1
echo.

echo [*] Configurando Filas de Input e Acessibilidade...
reg add "HKCU\\Control Panel\\Accessibility\\Keyboard Response" /v Flags /t REG_SZ /d 0 /f >nul 2>&1
reg add "HKCU\\Control Panel\\Accessibility\\ToggleKeys" /v Flags /t REG_SZ /d 0 /f >nul 2>&1
reg add "HKCU\\Control Panel\\Accessibility\\StickyKeys" /v Flags /t REG_SZ /d 0 /f >nul 2>&1
reg add "HKCU\\Control Panel\\Accessibility\\MouseKeys" /v Flags /t REG_SZ /d 0 /f >nul 2>&1
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d ${mouseQueueSize} /f /reg:64 >nul 2>&1
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseResolution /t REG_DWORD /d 1 /f /reg:64 >nul 2>&1
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseTicks /t REG_DWORD /d 1 /f /reg:64 >nul 2>&1
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" /v KeyboardDataQueueSize /t REG_DWORD /d 20 /f /reg:64 >nul 2>&1
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" /v KeyboardResolution /t REG_DWORD /d 1 /f /reg:64 >nul 2>&1
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" /v KeyboardTicks /t REG_DWORD /d 1 /f /reg:64 >nul 2>&1
echo.

echo [*] Otimizando Resposta de Input do DWM (SuperLowLatency)...
reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v SuperLowLatency /t REG_DWORD /d 1 /f >nul 2>&1
echo.

echo [*] Otimizando Temporizadores do Kernel (Timer de Alta Precisao)...
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f /reg:64 >nul 2>&1
bcdedit /set useplatformtick yes >nul 2>&1
bcdedit /set disabledynamictick yes >nul 2>&1
echo.

echo [*] Atualizando configuracoes de sensibilidade do mouse em tempo real...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$sig = '[DllImport(\"user32.dll\")] public static extern bool SystemParametersInfo(int uAction, int uParam, IntPtr lpvParam, int fuWinIni);'; $type = Add-Type -MemberDefinition $sig -Name Win32Utils -Namespace Win32 -PassThru; $type::SystemParametersInfo(0x0004, 0, [IntPtr]::Zero, 0x0003); $type::SystemParametersInfo(0x0071, 10, [IntPtr]::Zero, 0x0003); $type::SystemParametersInfo(0x0017, 0, [IntPtr]::Zero, 0x0003); $type::SystemParametersInfo(0x000B, 31, [IntPtr]::Zero, 0x0003)" >nul 2>&1
echo.

echo ========================================================
echo          OTIMIZACOES APLICADAS COM SUCESSO!
echo ========================================================
echo.
echo As configuracoes de sensibilidade foram aplicadas e atualizadas!
echo.
timeout /t 5
`;

    // Write with UTF-8 BOM so reg.exe accepts special chars
    fs.writeFileSync(batPath, '\uFEFF' + batContent, 'utf8');
    
    // Run silently - app already runs as Administrator, no need to spawn visible windows
    execSync(`cmd.exe /c "${batPath}"`, { stdio: 'ignore' });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('restore-backup', async () => {
  if (!systemIsAdmin) {
    return { success: false, error: "Privilégios de Administrador requeridos." };
  }
  try {
    const files = fs.readdirSync(backupDir);
    for (const file of files) {
      if (file.endsWith('.reg')) {
        await runCmd(`reg import "${path.join(backupDir, file)}"`);
      }
    }

    const pathsToRestore = [
      { key: 'bluestacks_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf' },
      { key: 'bluestacks_msi5.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf' },
      { key: 'bluestacks_bgp_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf' },
      { key: 'bluestacks.conf.bak', path: 'C:\\ProgramData\\BlueStacks\\bluestacks.conf' },
      { key: 'bluestacks_nxt.conf.bak', path: 'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf' },
      { key: 'bluestacks_bgp.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf' }
    ];

    for (const item of pathsToRestore) {
      if (fs.existsSync(path.join(backupDir, item.key)) && fs.existsSync(path.dirname(item.path))) {
        fs.copyFileSync(path.join(backupDir, item.key), item.path);
      }
    }

    await runCmd('bcdedit /deletevalue useplatformtick').catch(() => {});
    await runCmd('bcdedit /deletevalue disabledynamictick').catch(() => {});
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('reboot-computer', async () => {
  try {
    await runCmd('shutdown /r /t 5');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('start-macro', async (event, force) => {
  try {
    await killMacroProcess();

    const scriptPath = getPhysicalScriptPath('macro_capa.ps1');
    const command = `$Host.UI.RawUI.WindowTitle = 'MacroCapaFreeFire'; & '${scriptPath.replace(/'/g, "''")}' -Forca ${force}`;

    const { spawn } = require('child_process');
    macroProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-Command',
      command
    ]);

    macroProcess.on('error', (err) => {
      console.error('Falha ao iniciar processo da macro:', err);
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('stop-macro', async () => {
  try {
    await killMacroProcess();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('apply-single-tweak', async (event, tweakId) => {
  try {
    const commands = getCommandsForTweak(tweakId);
    // Run each registry command directly and silently (app is already Admin)
    for (const cmd of commands) {
      try {
        execSync(cmd, { stdio: 'ignore' });
      } catch (e) {
        console.warn(`Tweak cmd failed (non-fatal): ${cmd}`, e.message);
      }
    }

    // Reload mouse settings live in Windows memory without reboot
    if (tweakId.startsWith('mouse-') || tweakId === 'remove-kbd-delay') {
      try {
        execSync(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Add-Type '[DllImport(\"user32.dll\")] public static extern bool SystemParametersInfo(int a,int b,IntPtr c,int d);' -Name U -Namespace W -PassThru | ForEach-Object { $null = $_::SystemParametersInfo(0x0004,0,[IntPtr]::Zero,0x0003); $null = $_::SystemParametersInfo(0x0071,10,[IntPtr]::Zero,0x0003) }"`, { stdio: 'ignore' });
      } catch (e) {}
    }

    if (tweakId === 'freefire-delay') {
      try {
        execSync(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Get-Process HD-Player,dnplayer,LdBoxHeadless,Nox -ErrorAction SilentlyContinue | ForEach-Object { try{$_.PriorityClass='High'}catch{} }"`, { stdio: 'ignore' });
      } catch (e) {}
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

function getCommandsForTweak(tweakId) {
  switch (tweakId) {
    case 'remove-kbd-delay':
      return [
        'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardDelay /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardSpeed /t REG_SZ /d 31 /f',
        'reg add "HKCU\\Control Panel\\Accessibility\\Keyboard Response" /v Flags /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Accessibility\\Keyboard Response" /v DelayBeforeAcceptance /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Accessibility\\Keyboard Response" /v AutoRepeatDelay /t REG_SZ /d 200 /f',
        'reg add "HKCU\\Control Panel\\Accessibility\\Keyboard Response" /v AutoRepeatRate /t REG_SZ /d 15 /f'
      ];
    case 'mouse-default':
      return [
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 10 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseHoverTime /t REG_DWORD /d 41 /f',
        'reg add "HKU\\.DEFAULT\\Control Panel\\Mouse" /v MouseHoverTime /t REG_DWORD /d 41 /f'
      ];
    case 'mouse-current':
      return [
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseHoverTime /t REG_DWORD /d 41 /f',
        'reg add "HKU\\.DEFAULT\\Control Panel\\Mouse" /v MouseHoverTime /t REG_DWORD /d 41 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d 0000000000000000c0cc0c0000000000809919000000000040662600000000000033330000000000 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d 0000000000000000000038000000000000007000000000000000a800000000000000e00000000000 /f'
      ];
    case 'mouse-no-accel':
      return [
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v MouseHoverTime /t REG_DWORD /d 41 /f',
        'reg add "HKU\\.DEFAULT\\Control Panel\\Mouse" /v MouseHoverTime /t REG_DWORD /d 41 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d 0000000000000000c0cc0c0000000000809919000000000040662600000000000033330000000000 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d 0000000000000000000038000000000000007000000000000000a800000000000000e00000000000 /f'
      ];
    case 'display-input-tweak':
      return [
        'reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v SuperLowLatency /t REG_DWORD /d 1 /f'
      ];
    case 'game-priority':
      return [
        'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f /reg:64',
        'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Priority" /t REG_DWORD /d 6 /f /reg:64',
        'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Scheduling Category" /t REG_SZ /d "High" /f /reg:64',
        'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "SFIO Priority" /t REG_SZ /d "High" /f /reg:64'
      ];
    case 'freefire-delay':
      return [
        'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f /reg:64',
        'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v IoPriority /t REG_DWORD /d 3 /f /reg:64'
      ];
    case 'timestamp-0ms':
      return [
        'bcdedit /set useplatformtick yes',
        'bcdedit /set disabledynamictick yes',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f /reg:64'
      ];
    case 'disable-fse':
      return [
        'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 2 /f'
      ];
    case 'csrss-priority':
      return [
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 26 /f /reg:64',
        'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 10 /f /reg:64'
      ];
    case 'disable-hpet':
      return [
        'bcdedit /set useplatformclock no'
      ];
    case 'disable-throttling':
      return [
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f /reg:64'
      ];
    case 'win32-priority':
      return [
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 38 /f /reg:64'
      ];
    case 'disable-background-apps':
      return [
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserPresenceState /t REG_DWORD /d 2 /f',
        'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" /v LetAppsRunInBackground /t REG_DWORD /d 2 /f /reg:64'
      ];
    case 'svchost-split':
      return [
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control" /v SvcHostSplitThresholdInKB /t REG_DWORD /d 3800000 /f /reg:64'
      ];
    case 'disable-prefetch':
      return [
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters" /v EnablePrefetcher /t REG_DWORD /d 0 /f /reg:64',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters" /v EnableSuperfetch /t REG_DWORD /d 0 /f /reg:64',
        'sc config SysMain start= disabled',
        'net stop SysMain >nul 2>&1'
      ];
    case 'network-adapter':
      return [
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetAdapter | Foreach-Object { $key = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; if (Test-Path $key) { New-ItemProperty -Path $key -Name TcpAckFrequency -Value 1 -PropertyType DWord -Force | Out-Null; New-ItemProperty -Path $key -Name TCPNoDelay -Value 1 -PropertyType DWord -Force | Out-Null } }"',
        'reg add "HKLM\\SOFTWARE\\Microsoft\\MSMQ\\Parameters" /v TCPNoDelay /t REG_DWORD /d 1 /f /reg:64'
      ];
    case 'ultimate-power':
      return [
        'powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61',
        'powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61',
        'powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
        'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100',
        'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100',
        'powercfg -setactive SCHEME_CURRENT'
      ];
    case 'disable-notifications':
      return [
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" /v ToastEnabled /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer" /v DisableNotificationCenter /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_CRITICAL_TOASTS_ABOVE_LOCK /t REG_DWORD /d 0 /f'
      ];
    case 'visual-performance':
      return [
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f',
        'reg add "HKCU\\Control Panel\\Desktop" /v UserPreferencesMask /t REG_BINARY /d 9012038010000000 /f',
        'reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v EnableAeroPeek /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\Control Panel\\Desktop" /v DragFullWindows /t REG_SZ /d 0 /f',
        'reg add "HKCU\\Control Panel\\Desktop" /v FontSmoothing /t REG_SZ /d 2 /f'
      ];
    case 'boost-processes':
      return [
        'powershell -NoProfile -ExecutionPolicy Bypass -File "' + getPhysicalScriptPath('otimizar_processos.ps1') + '"'
      ];
    case 'disable-hibernation':
      return [
        'powercfg -h off',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f /reg:64'
      ];
    case 'enable-hags':
      return [
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f /reg:64'
      ];
    case 'flush-dns-cache':
      return [
        'ipconfig /flushdns',
        'netsh winsock reset',
        'del /q /f /s "%LOCALAPPDATA%\\D3DSCache\\*" >nul 2>&1',
        'del /q /f /s "%LOCALAPPDATA%\\NVIDIA\\DXCache\\*" >nul 2>&1',
        'del /q /f /s "%LOCALAPPDATA%\\AMD\\DxCache\\*" >nul 2>&1'
      ];
    case 'disable-telemetry':
      return [
        'sc config DiagTrack start= disabled',
        'sc stop DiagTrack',
        'sc config WerSvc start= disabled',
        'sc stop WerSvc',
        'sc config Spooler start= disabled',
        'sc stop Spooler',
        'sc config dmwappushservice start= disabled',
        'sc stop dmwappushservice',
        'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 0 /f /reg:64'
      ];
    case 'clean-standbylist':
      return [
        'powershell -NoProfile -ExecutionPolicy Bypass -File "' + getPhysicalScriptPath('clean_ram.ps1') + '"'
      ];
    case 'disable-overlays':
      return [
        'taskkill /f /im DiscordOverlayUI.exe >nul 2>&1',
        'taskkill /f /im GeForceExperience.exe >nul 2>&1',
        'taskkill /f /im GameBar.exe >nul 2>&1',
        'taskkill /f /im GameBarPresenceWriter.exe >nul 2>&1',
        'taskkill /f /im RazerSynapse.exe >nul 2>&1',
        'taskkill /f /im iCUE.exe >nul 2>&1',
        'taskkill /f /im OneDrive.exe >nul 2>&1'
      ];
    case 'disable-gamedvr':
      return [
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v AppCaptureEnabled /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f',
        'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f /reg:64',
        'reg add "HKCU\\Software\\Microsoft\\GameBar" /v UseNexusForGameBarEnabled /t REG_DWORD /d 0 /f'
      ];
    case 'game-mode-toggle':
      return [
        'reg add "HKCU\\Software\\Microsoft\\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\Microsoft\\GameBar" /v AllowAutoGameMode /t REG_DWORD /d 1 /f'
      ];
    case 'clean-startup-apps':
      return [
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize" /v StartupDelayInMSec /t REG_DWORD /d 0 /f'
      ];
    case 'pause-windows-update':
      return [
        'sc config wuauserv start= demand',
        'sc stop wuauserv >nul 2>&1',
        'sc config bits start= demand',
        'sc stop bits >nul 2>&1',
        'sc config dosvc start= demand',
        'sc stop dosvc >nul 2>&1'
      ];
    case 'disable-core-parking':
      return [
        'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100',
        'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMAXCORES 100',
        'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPHEADROOM 0',
        'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100',
        'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100',
        'powercfg -setactive SCHEME_CURRENT'
      ];
    case 'gpu-max-power':
      return [
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerEnable /t REG_DWORD /d 1 /f /reg:64',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerLevel /t REG_DWORD /d 1 /f /reg:64',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerLevelAC /t REG_DWORD /d 1 /f /reg:64',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PerfLevelSrc /t REG_DWORD /d 8738 /f /reg:64'
      ];
    case 'disable-nagle':
      return [
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetAdapter | Foreach-Object { $key = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $_.InterfaceGuid; if (Test-Path $key) { Set-ItemProperty -Path $key -Name TcpAckFrequency -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $key -Name TCPNoDelay -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $key -Name TcpDelAckTicks -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue } }"'
      ];
    case 'qos-game-priority':
      return [
        'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /t REG_DWORD /d 0 /f /reg:64',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\QoS" /v "Do not use NLA" /t REG_SZ /d 1 /f /reg:64'
      ];
    default:
      return [];
  }
}

async function killMacroProcess() {
  if (macroProcess) {
    try {
      macroProcess.kill('SIGTERM');
    } catch (e) {
      console.error('Erro ao encerrar macroProcess via Node:', e);
    }
    macroProcess = null;
  }
  
  try {
    execSync('taskkill /f /fi "WINDOWTITLE eq MacroCapaFreeFire*"', { stdio: 'ignore' });
  } catch (e) {
    // Silencia se não encontrar o processo
  }
}


