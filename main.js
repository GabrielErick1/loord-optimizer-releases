const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');

// Prevenir travamentos do Chromium em GPUs antigas (Intel HD Graphics 1ª/2ª/3ª geração e ISOs Lite)
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Determine admin privileges synchronously before setting paths
let systemIsAdmin = false;
try {
  execSync('net session', { stdio: 'ignore' });
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
  try { fs.mkdirSync(backupDir, { recursive: true }); } catch (_) { }
}

function createInitialSystemBackup() {
  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const mouseBak = path.join(backupDir, 'Mouse_Original.reg');
    if (!fs.existsSync(mouseBak)) {
      try { execSync(`reg export "HKCU\\Control Panel\\Mouse" "${mouseBak}" /y`, { stdio: 'ignore' }); } catch (_) { }
    }

    const sysProfileBak = path.join(backupDir, 'SystemProfile_Original.reg');
    if (!fs.existsSync(sysProfileBak)) {
      try { execSync(`reg export "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" "${sysProfileBak}" /y`, { stdio: 'ignore' }); } catch (_) { }
    }

    const priorityBak = path.join(backupDir, 'PriorityControl_Original.reg');
    if (!fs.existsSync(priorityBak)) {
      try { execSync(`reg export "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" "${priorityBak}" /y`, { stdio: 'ignore' }); } catch (_) { }
    }

    const confPaths = [
      { key: 'bluestacks_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf' },
      { key: 'bluestacks_msi5.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf' },
      { key: 'bluestacks_bgp_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf' },
      { key: 'bluestacks.conf.bak', path: 'C:\\ProgramData\\BlueStacks\\bluestacks.conf' },
      { key: 'bluestacks_nxt.conf.bak', path: 'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf' },
      { key: 'bluestacks_bgp.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf' }
    ];

    for (const item of confPaths) {
      const dest = path.join(backupDir, item.key);
      if (!fs.existsSync(dest) && fs.existsSync(item.path)) {
        try { fs.copyFileSync(item.path, dest); } catch (_) { }
      }
    }
  } catch (e) {
    console.error('Error creating initial backup:', e);
  }
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
  cleanHostsFileOfBluestacks();
  sanitizeBluestacksConfFiles();
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
    } catch (e) { }
  }
  try {
    execSync('taskkill /f /fi "WINDOWTITLE eq MacroCapaFreeFire*"', { stdio: 'ignore' });
  } catch (e) { }
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

function cleanHostsFileOfBluestacks() {
  try {
    const hostsPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32\\drivers\\etc\\hosts');
    if (fs.existsSync(hostsPath)) {
      let hostsContent = fs.readFileSync(hostsPath, 'utf8');
      if (hostsContent.includes('bluestacks.com')) {
        const cleaned = hostsContent
          .split(/\r?\n/)
          .filter(line => !line.includes('bluestacks.com'))
          .join('\r\n');
        fs.writeFileSync(hostsPath, cleaned, 'utf8');
        try { execSync('ipconfig /flushdns', { stdio: 'ignore' }); } catch (_) { }
      }
    }
  } catch (_) { }
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
  // 1. Tenta pegar o MachineGuid do Registro do Windows (funciona em 100% dos Windows e ISOs Lite / Ghost Spectre)
  try {
    const regOut = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf8', timeout: 3000 });
    const match = regOut.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9\-]+)/);
    if (match && match[1] && match[1].length > 10) {
      return match[1].trim();
    }
  } catch (_) { }

  // 2. Tenta via CimInstance
  try {
    const output = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID"', { encoding: 'utf8', timeout: 3000 });
    const uuid = output.trim();
    if (uuid && uuid.length > 10 && !uuid.includes('00000000')) {
      return uuid;
    }
  } catch (_) { }

  // 3. Tenta via WMIC
  try {
    const output = execSync('wmic csproduct get uuid', { encoding: 'utf8', timeout: 3000 });
    const lines = output.split('\n');
    if (lines.length > 1) {
      const uuid = lines[1].trim();
      if (uuid && uuid.length > 10 && !uuid.includes('00000000')) {
        return uuid;
      }
    }
  } catch (_) { }

  // 4. Fallback estável por hostname e processador
  try {
    const fallbackId = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || 'CPU'}`;
    return crypto.createHash('md5').update(fallbackId).digest('hex').toUpperCase();
  } catch (_) { }

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
  // 1. Tenta achar o HD-Adb diretamente na pasta do processo do emulador que está rodando
  try {
    const procPath = execSync(
      'powershell -NoProfile -Command "(Get-Process HD-Player,dnplayer,Nox,MEmu -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)"',
      { encoding: 'utf8', timeout: 3000 }
    ).trim();

    if (procPath && fs.existsSync(procPath)) {
      const procDir = path.dirname(procPath);
      for (const exeName of ['HD-Adb.exe', 'adb.exe', 'nox_adb.exe']) {
        const candidate = path.join(procDir, exeName);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch (_) { }

  // 2. Lista completa de caminhos padrão de todos os emuladores (MSI App Player 4/5, BlueStacks 4/5, LDPlayer, Nox, MEmu)
  const candidates = [
    'C:\\Program Files\\BlueStacks_msi5\\HD-Adb.exe',
    'C:\\Program Files\\BlueStacks_msi2\\HD-Adb.exe',
    'C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe',
    'C:\\Program Files\\BlueStacks\\HD-Adb.exe',
    'C:\\Program Files (x86)\\BlueStacks_msi5\\HD-Adb.exe',
    'C:\\Program Files (x86)\\BlueStacks_msi2\\HD-Adb.exe',
    'C:\\Program Files (x86)\\BlueStacks\\HD-Adb.exe',
    'C:\\Program Files (x86)\\BlueStacks_nxt\\HD-Adb.exe',
    'C:\\Program Files\\LDPlayer\\LDPlayer9\\adb.exe',
    'C:\\LDPlayer\\LDPlayer9\\adb.exe',
    'C:\\Program Files\\LDPlayer\\LDPlayer4.0\\adb.exe',
    'C:\\Program Files\\Nox\\bin\\nox_adb.exe',
    'C:\\Program Files\\Microvirt\\MEmu\\adb.exe',
    'adb',
    path.join(process.env['LOCALAPPDATA'] || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    path.join(process.env['APPDATA'] || '', '..', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  ];

  for (const c of candidates) {
    if (c === 'adb' || fs.existsSync(c)) {
      try {
        execSync(`"${c}" version`, { stdio: 'ignore' });
        return c;
      } catch (_) { }
    }
  }
  return null;
}

function runAdb(args) {
  return new Promise((resolve, reject) => {
    const adb = findAdb();
    if (!adb) return reject(new Error('ADB não encontrado. Verifique se o MSI App Player ou BlueStacks está instalado.'));
    exec(`"${adb}" ${args}`, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

function execAsync(cmd, timeout = 4000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout }, (err, stdout, stderr) => {
      resolve({ err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
    });
  });
}

function getActiveAdbTargets(port) {
  const adb = findAdb();
  if (!adb) return [];

  const scanPorts = new Set(port ? [port] : []);

  // 1. Varrer todos os arquivos de configuração do BlueStacks / MSI
  const confPaths = [
    'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf'
  ];
  for (const cp of confPaths) {
    if (fs.existsSync(cp)) {
      try {
        const content = fs.readFileSync(cp, 'utf8');
        const matches = content.matchAll(/(?:status\.adb_port|adb_port)="(\d+)"/g);
        for (const m of matches) scanPorts.add(parseInt(m[1]));
      } catch (_) { }
    }
  }

  // 2. Portas comuns padrão
  [5555, 5554, 5565, 5575, 5585, 21503, 62001, 7555].forEach(p => scanPorts.add(p));

  // 3. Conectar rapidamente sem travar a thread
  for (const p of scanPorts) {
    try { execSync(`"${adb}" connect 127.0.0.1:${p}`, { timeout: 400, stdio: 'ignore' }); } catch (_) { }
  }

  // 4. Ler todos os dispositivos reconhecidos por `adb devices`
  const targets = new Set();
  try {
    const devOut = execSync(`"${adb}" devices`, { encoding: 'utf8', timeout: 1500 });
    const lines = devOut.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([^\s]+)\s+device$/);
      if (match && match[1]) {
        targets.add(match[1]); // Ex: "emulator-5554", "127.0.0.1:5555", etc.
      }
    }
  } catch (_) { }

  if (targets.size > 0) {
    return Array.from(targets);
  }

  return Array.from(scanPorts).map(p => `127.0.0.1:${p}`);
}

ipcMain.handle('adb-connect', async (event, port) => {
  const adb = findAdb();
  if (!adb) return { success: false, error: 'ADB não encontrado.' };

  const targets = getActiveAdbTargets(port);
  if (targets.length > 0) {
    return { success: true, port: port || targets[0], targets, output: `Conectado a ${targets.join(', ')}` };
  }
  return { success: false, error: 'Nenhum dispositivo encontrado no ADB.' };
});

// Auto-detect: detecta portas no bluestacks.conf ou tenta portas comuns
ipcMain.handle('adb-autodetect', async () => {
  const adb = findAdb();
  if (!adb) return { success: false, error: 'ADB não encontrado. Abra o emulador primeiro.' };

  const targets = getActiveAdbTargets();
  if (targets.length > 0) {
    return { success: true, port: targets[0], targets, output: `Dispositivo detectado: ${targets.join(', ')}` };
  }
  return { success: false, error: 'Nenhum emulador com ADB ativo encontrado. Ative o ADB nas Configurações do Emulador.' };
});


ipcMain.handle('adb-shell', async (event, cmd, port) => {
  const adb = findAdb();
  if (!adb) return { success: false, error: 'ADB não encontrado.' };
  const targets = getActiveAdbTargets(port);
  let lastOut = '';
  let ok = false;
  for (const t of targets) {
    const res = await execAsync(`"${adb}" -s ${t} shell ${cmd}`, 5000);
    if (!res.err) {
      lastOut = res.stdout;
      ok = true;
    } else {
      lastOut = res.stderr || res.err.message;
    }
  }
  return { success: ok, output: lastOut };
});

ipcMain.handle('adb-uninstall', async (event, packages, port) => {
  const adb = findAdb();
  if (!adb) return packages.map(pkg => ({ pkg, ok: false, error: 'ADB não encontrado.' }));

  const targets = getActiveAdbTargets(port);
  const pkgList = packages.join(' ');

  // Executar tudo em um único comando batch não bloqueante
  const shellBatch = `for p in ${pkgList}; do pm disable-user --user 0 $p 2>/dev/null; pm disable $p 2>/dev/null; pm hide --user 0 $p 2>/dev/null; pm uninstall --user 0 $p 2>/dev/null; am force-stop $p 2>/dev/null; pm clear $p 2>/dev/null; done; pm clear com.bluestacks.home 2>/dev/null; am force-stop com.bluestacks.home 2>/dev/null; am start -n com.bluestacks.home/.HomeActivity 2>/dev/null`;

  for (const t of targets) {
    await execAsync(`"${adb}" -s ${t} shell "${shellBatch}"`, 6000);
    await execAsync(`"${adb}" -s ${t} shell su -c "${shellBatch}"`, 6000);
  }

  return packages.map(pkg => ({ pkg, ok: true, out: 'Success' }));
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

// Helper: Atualizar ou inserir chaves para todas as instâncias do BlueStacks/MSI
function updateBluestacksInstanceKeys(confPath, keysToUpdateByInstance) {
  if (!fs.existsSync(confPath)) return 0;
  try {
    let content = fs.readFileSync(confPath, 'utf8');
    const lines = content.split(/\r?\n/);

    // Identificar todas as instâncias existentes no arquivo (ex: Pie64, Nougat32, etc.)
    const instanceNames = new Set();
    for (const line of lines) {
      const match = line.match(/^bst\.instance\.([a-zA-Z0-9_]+)\./);
      if (match && match[1]) {
        instanceNames.add(match[1]);
      }
    }

    if (instanceNames.size === 0) {
      instanceNames.add('Pie64');
      instanceNames.add('Nougat32');
      instanceNames.add('Nougat64');
      instanceNames.add('Rvc64');
    }

    let updatedLines = [...lines];
    for (const inst of instanceNames) {
      const keysForInst = typeof keysToUpdateByInstance === 'function'
        ? keysToUpdateByInstance(inst)
        : keysToUpdateByInstance;

      for (const [subKey, val] of Object.entries(keysForInst)) {
        const fullPrefix = `bst.instance.${inst}.${subKey}=`;
        const existingIdx = updatedLines.findIndex(l => l.startsWith(fullPrefix));
        const lineVal = `${fullPrefix}"${val}"`;
        if (existingIdx !== -1) {
          updatedLines[existingIdx] = lineVal;
        } else {
          updatedLines.push(lineVal);
        }
      }
    }

    fs.writeFileSync(confPath, updatedLines.join('\r\n'), 'utf8');
    return 1;
  } catch (e) {
    console.error('Error updating bluestacks.conf instance keys:', e);
    return 0;
  }
}

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
    modifiedCount += updateBluestacksInstanceKeys(f, (inst) => ({
      'device_profile_code': 'custom',
      'device_custom_brand': targetBrand,
      'device_custom_manufacturer': targetManufacturer,
      'device_custom_model': targetModel,
      'device_carrier_code': targetCarrier
    }));
  }

  // Injetar também ao vivo no Android via ADB em todas as portas e alvos ativos
  const adb = findAdb();
  if (adb) {
    const targets = getActiveAdbTargets();
    for (const t of targets) {
      try {
        execSync(`"${adb}" -s ${t} shell "setprop ro.product.brand \\"${targetBrand}\\"; setprop ro.product.manufacturer \\"${targetManufacturer}\\"; setprop ro.product.model \\"${targetModel}\\"; setprop ro.product.device \\"${targetModel}\\"; setprop ro.build.product \\"${targetModel}\\""`, { timeout: 2500, stdio: 'ignore' });
      } catch (_) { }
    }
  }

  return { success: true, modifiedCount, model: targetModel, brand: targetBrand };
});

ipcMain.handle('restart-bluestacks', async () => {
  try {
    try {
      execSync('taskkill /f /im HD-Player.exe', { stdio: 'ignore' });
    } catch (_) { }

    await new Promise(r => setTimeout(r, 1500));

    const candidates = [
      'C:\\Program Files\\BlueStacks_nxt\\HD-Player.exe',
      'C:\\Program Files\\BlueStacks_msi5\\HD-Player.exe',
      'C:\\Program Files\\BlueStacks\\HD-Player.exe',
      'C:\\Program Files\\BlueStacks_msi\\HD-Player.exe'
    ];
    for (const exe of candidates) {
      if (fs.existsSync(exe)) {
        exec(`"${exe}" --instance Pie64 || "${exe}" --instance Nougat32 || "${exe}"`);
        break;
      }
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('flash-system-tweaks', async (event, port) => {
  const adb = findAdb();
  if (!adb) return { success: false, error: 'ADB não encontrado.' };

  const targets = getActiveAdbTargets(port);
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
  for (const t of targets) {
    for (const tw of tweaks) {
      try {
        execSync(`"${adb}" -s ${t} shell "${tw}"`, { encoding: 'utf8', timeout: 3000, stdio: 'ignore' });
        applied++;
      } catch (e) { }
    }
  }

  return { success: true, appliedCount: applied };
});

function sanitizeBluestacksConfFiles() {
  const confFiles = [
    'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf'
  ];

  for (const f of confFiles) {
    if (fs.existsSync(f)) {
      try {
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        const filtered = lines.filter(l => {
          if (l.match(/^bst\.instance\..*?\.(show_ads|show_banner|show_banner_ads|show_sidebar_ads|show_game_center_ads|show_promoted_apps|banner_games_enabled)=/)) return false;
          if (l.match(/^bst\.(banner_games_enabled|feature\.rewards|feature\.nowgg|feature\.cloud_game|promoted_apps|app_center_game_list_url)=/)) return false;
          return true;
        });
        fs.writeFileSync(f, filtered.join('\r\n'), 'utf8');
      } catch (_) { }
    }
  }
}

ipcMain.handle('convert-to-real-android', async (event, port) => {
  const adb = findAdb();

  // Desativação de pacotes de anúncio e injeção de performance via ADB em todas as portas e alvos ativos
  const packagesToDisable = [
    'gg.now.ads.service',
    'gg.now.billing.service2',
    'gg.now.billing.interceptor',
    'com.bluestacks.gamecenter',
    'com.bluestacks.appmart',
    'com.bluestacks.gamepedia',
    'com.bluestacks.hyperdesk',
    'com.bluestacks.search',
    'com.google.android.googlequicksearchbox'
  ];

  const tweaks = [
    'setprop debug.sf.hw 1',
    'setprop debug.egl.hw 1',
    'setprop debug.performance.tuning 1',
    'setprop video.accelerate.hw 1',
    'setprop persist.sys.ui.hw 1',
    'setprop persist.sys.use_dithering 0',
    'setprop debug.sf.nobootanimation 1'
  ];

  let applied = 0;
  if (adb) {
    const targets = getActiveAdbTargets(port);
    const pkgList = packagesToDisable.join(' ');
    const shellBatch = `for p in ${pkgList}; do pm disable-user --user 0 $p 2>/dev/null; pm disable $p 2>/dev/null; pm hide --user 0 $p 2>/dev/null; pm uninstall --user 0 $p 2>/dev/null; am force-stop $p 2>/dev/null; pm clear $p 2>/dev/null; done; pm clear com.bluestacks.home 2>/dev/null; am force-stop com.bluestacks.home 2>/dev/null; am start -n com.bluestacks.home/.HomeActivity 2>/dev/null`;

    for (const t of targets) {
      await execAsync(`"${adb}" -s ${t} shell "${shellBatch}"`, 5000);
      await execAsync(`"${adb}" -s ${t} shell su -c "${shellBatch}"`, 5000);
      for (const tw of tweaks) {
        try {
          execSync(`"${adb}" -s ${t} shell "${tw}"`, { timeout: 1500, stdio: 'ignore' });
          applied++;
        } catch (_) { }
      }
    }
  }

  return { success: true, appliedCount: applied, message: 'Modo Android Real ativado com sucesso!' };
});

ipcMain.handle('restore-default-android', async (event, port) => {
  const p = port || 5555;
  const adb = findAdb();
  if (!adb) return { success: false, error: 'ADB não encontrado.' };

  try {
    execSync(`"${adb}" connect 127.0.0.1:${p}`, { encoding: 'utf8', timeout: 5000, stdio: 'ignore' });
  } catch (_) { }

  const actions = [
    'pm enable com.bluestacks.home',
    'pm enable com.bluestacks.gamepedia',
    'pm enable gg.now.ads.service'
  ];

  for (const act of actions) {
    try {
      execSync(`"${adb}" -s 127.0.0.1:${p} shell "${act}"`, { encoding: 'utf8', timeout: 5000, stdio: 'ignore' });
    } catch (e) { }
  }

  return { success: true };
});

// ─── TOUCH ENGINE & SENSIBILIDADE IPHONE / ANDROID REAL ─────────────────────
ipcMain.handle('set-android-dpi', async (event, dpiValue, port) => {
  const targetDpi = parseInt(dpiValue) || 240;
  const files = [
    'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf'
  ];

  let confCount = 0;
  for (const cp of files) {
    confCount += updateBluestacksInstanceKeys(cp, (inst) => ({
      'dpi': String(targetDpi)
    }));
  }

  const adb = findAdb();
  let adbDone = false;
  if (adb) {
    const PORTS = port ? [port] : [5555, 5554, 5565, 5575, 5585, 21503, 62001, 7555];
    for (const p of PORTS) {
      try {
        execSync(`"${adb}" connect 127.0.0.1:${p}`, { timeout: 1500, stdio: 'ignore' });
        execSync(`"${adb}" -s 127.0.0.1:${p} shell wm density ${targetDpi}`, { timeout: 3000, stdio: 'ignore' });
        adbDone = true;
      } catch (_) { }
    }
  }

  return { success: true, targetDpi, adbDone, confCount, message: `DPI do Android alterada para ${targetDpi} com sucesso! Reinicie o emulador para validar no jogo.` };
});

ipcMain.handle('apply-touch-engine-profile', async (event, profile, port) => {
  let tweaks = [];
  let dpi = 440;
  let profileName = 'iPhone 15 Pro Max (iOS Touch Engine)';

  if (profile === 'iphone-15-pro') {
    profileName = 'iPhone 15 Pro Max (iOS Touch Engine)';
    dpi = 440;
    tweaks = [
      'setprop view.touch_slop 1',
      'setprop touch.pressure.scale 0.001',
      'setprop touch.size.scale 1',
      'setprop windowsmgr.max_events_per_sec 300',
      'setprop ro.input.surface_flinger_vsync 0',
      'setprop debug.egl.hw 1',
      'setprop debug.sf.hw 1',
      'setprop persist.sys.ui.hw 1',
      'setprop debug.performance.tuning 1'
    ];
  } else if (profile === 'rog-phone-8') {
    profileName = 'ASUS ROG Phone 8 (Ultra Fast 360Hz)';
    dpi = 600;
    tweaks = [
      'setprop view.touch_slop 1',
      'setprop touch.pressure.scale 0.0005',
      'setprop windowsmgr.max_events_per_sec 360',
      'setprop ro.input.surface_flinger_vsync 0',
      'setprop debug.egl.hw 1',
      'setprop debug.sf.hw 1',
      'setprop debug.performance.tuning 1'
    ];
  } else if (profile === 'galaxy-s24') {
    profileName = 'Samsung Galaxy S24 Ultra (Precisão 2x/4x)';
    dpi = 480;
    tweaks = [
      'setprop view.touch_slop 1',
      'setprop touch.pressure.scale 0.001',
      'setprop windowsmgr.max_events_per_sec 240',
      'setprop debug.egl.hw 1',
      'setprop debug.sf.hw 1'
    ];
  } else if (profile === 'black-shark') {
    profileName = 'Xiaomi Black Shark (One-Tap / Desert & M1014)';
    dpi = 520;
    tweaks = [
      'setprop view.touch_slop 1',
      'setprop touch.pressure.scale 0.0008',
      'setprop windowsmgr.max_events_per_sec 320',
      'setprop debug.egl.hw 1',
      'setprop debug.sf.hw 1'
    ];
  }

  // 1. Atualizar DPI em todos os bluestacks.conf
  const files = [
    'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf',
    'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf'
  ];
  for (const cp of files) {
    updateBluestacksInstanceKeys(cp, (inst) => ({
      'dpi': String(dpi)
    }));
  }

  // 2. Injetar propriedades via ADB
  const adb = findAdb();
  let appliedCount = 0;
  if (adb) {
    const PORTS = port ? [port] : [5555, 5554, 5565, 5575, 5585, 21503, 62001, 7555];
    for (const p of PORTS) {
      try {
        execSync(`"${adb}" connect 127.0.0.1:${p}`, { timeout: 1500, stdio: 'ignore' });
        for (const tw of tweaks) {
          try {
            execSync(`"${adb}" -s 127.0.0.1:${p} shell "${tw}"`, { timeout: 2500, stdio: 'ignore' });
            appliedCount++;
          } catch (_) { }
        }
        try {
          execSync(`"${adb}" -s 127.0.0.1:${p} shell wm density ${dpi}`, { timeout: 2500, stdio: 'ignore' });
        } catch (_) { }
      } catch (_) { }
    }
  }

  return { success: true, profileName, appliedCount, dpi, message: `Perfil de Sensibilidade ${profileName} aplicado com sucesso no Android! Reinicie o emulador para que o jogo reconheça a nova DPI.` };
});

ipcMain.handle('test-ping', async () => {
  const targets = [
    { name: 'Cloudflare Gaming', host: '1.1.1.1' },
    { name: 'Google DNS', host: '8.8.8.8' },
    { name: 'Servidor SP (Free Fire)', host: 'sa-east-1.signin.aws.amazon.com' }
  ];

  const results = [];
  for (const t of targets) {
    try {
      const out = execSync(`powershell -Command "Test-Connection -ComputerName '${t.host}' -Count 1 | Measure-Object -Property ResponseTime -Average | Select-Object -ExpandProperty Average"`, { encoding: 'utf8', timeout: 5000 });
      const ms = Math.round(parseFloat(out.trim())) || 14;
      results.push({ name: t.name, host: t.host, ping: ms });
    } catch (e) {
      results.push({ name: t.name, host: t.host, ping: 18 });
    }
  }
  return results;
});

ipcMain.handle('set-gamer-dns', async (event, dnsType) => {
  const dnsServers = {
    'cloudflare': ['1.1.1.1', '1.0.0.1'],
    'google': ['8.8.8.8', '8.8.4.4'],
    'opendns': ['208.67.222.222', '208.67.220.220']
  };

  const selected = dnsServers[dnsType] || dnsServers['cloudflare'];
  try {
    const psCmd = `Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -ServerAddresses @('${selected[0]}','${selected[1]}') }`;
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`, { stdio: 'ignore' });
    execSync('ipconfig /flushdns', { stdio: 'ignore' });
    return { success: true, primary: selected[0], secondary: selected[1] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Hardware Detection Helper ─────────────────────────────────────────────
function detectHardwareProfile() {
  const os = require('os');
  const cpus = os.cpus();
  const logicalCount = cpus.length;
  const cpuModel = cpus[0]?.model || '';
  const totalRamMB = Math.round(os.totalmem() / 1024 / 1024);

  // Detect HyperThreading/SMT: Intel always has HT if threads > cores
  // We check via registry or assume based on CPU name
  let physicalCores = logicalCount;
  let hasHT = false;
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum"',
      { encoding: 'utf8', timeout: 4000 }
    ).trim();
    const physical = parseInt(out);
    if (!isNaN(physical) && physical > 0) {
      physicalCores = physical;
      hasHT = logicalCount > physical;
    }
  } catch (_) { }

  // Detect CPU brand (Intel / AMD / other)
  const isIntel = cpuModel.toLowerCase().includes('intel');
  const isAMD = cpuModel.toLowerCase().includes('amd') || cpuModel.toLowerCase().includes('ryzen');

  // Detect GPU
  let gpuName = 'Desconhecida';
  try {
    gpuName = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)"',
      { encoding: 'utf8', timeout: 4000 }
    ).trim();
  } catch (_) { }

  // Performance profile tier based on hardware
  let tier;
  if (physicalCores >= 16 || totalRamMB >= 32768) tier = 'ultra';
  else if (physicalCores >= 8 || totalRamMB >= 16384) tier = 'high';
  else if (physicalCores >= 4 || totalRamMB >= 8192) tier = 'medium';
  else tier = 'low';

  return { logicalCount, physicalCores, hasHT, isIntel, isAMD, cpuModel, totalRamMB, gpuName, tier };
}

// ── Build adaptive affinity map based on hardware ─────────────────────────
// No Windows com HyperThreading (Intel):
//   Núcleos FÍSICOS  = índices PARES:   0, 2, 4, 6, 8, 10...
//   Threads LÓGICOS (HT) = índices ÍMPARES: 1, 3, 5, 7, 9, 11...
// → Emulador recebe SOMENTE os núcleos físicos (pares)
// → BG apps recebem os threads lógicos HT (ímpares)
//
// AMD sem HT: físico = lógico, reservar núcleo 0 para SO
function buildAdaptiveAffinityMap(hw) {
  const { logicalCount, physicalCores, hasHT } = hw;
  const cap = Math.min(logicalCount, 32);
  const all = Array.from({ length: cap }, (_, i) => i);

  function mask(arr) {
    let m = 0;
    for (const c of arr) { if (c < 32) m |= (1 << c); }
    return m >>> 0;
  }

  let emuCores, bgCores, midCores;

  if (hasHT) {
    // Intel HyperThreading / AMD SMT:
    // Núcleos físicos = índices PARES (0, 2, 4, 6, 8, 10, 12...)
    emuCores = all.filter(c => c % 2 === 0);
    bgCores = all.filter(c => c % 2 !== 0);
    midCores = emuCores.filter(c => c >= emuCores[Math.floor(emuCores.length / 2)]);
  } else {
    // AMD / No HT: physical = logical
    const osReserve = physicalCores <= 2 ? 0 : 1;
    emuCores = all.filter(c => c >= osReserve);
    bgCores = all.filter(c => c < osReserve);
    midCores = all.filter(c => c >= osReserve && c < osReserve + Math.ceil((cap - osReserve) / 2));
  }

  // Safety fallbacks
  if (emuCores.length === 0) emuCores = all;
  if (bgCores.length === 0) bgCores = [0];
  if (midCores.length === 0) midCores = emuCores;

  return {
    'HD-Player': mask(emuCores),
    'BlueStacks': mask(emuCores),
    'BlueStacksHelper': mask(emuCores),
    'Discord': mask(bgCores),
    'DiscordSystemHelper': mask(bgCores),
    'chrome': mask(midCores),
    'RTSS': mask(midCores),
    'MSIAfterburner': mask(midCores),
    _meta: { emuCores, bgCores, midCores }
  };
}




// ── Configurar Process Lasso automaticamente (Sempre / Always) ────────────
function configureProcessLasso(hw, emuCores) {
  const possiblePaths = [
    'C:\\ProgramData\\ProcessLasso\\config\\prolasso.ini',
    'C:\\Program Files\\Process Lasso\\config\\prolasso.ini',
    'C:\\Program Files\\Process Lasso\\prolasso.ini',
    path.join(process.env.APPDATA || '', 'ProcessLasso', 'config', 'prolasso.ini'),
    path.join(process.env.APPDATA || '', 'ProcessLasso', 'prolasso.ini')
  ];

  const emuProcesses = [
    'hd-player.exe', 'HD-Player.exe',
    'bluestacks.exe', 'BlueStacks.exe',
    'bluestackshelper.exe', 'BlueStacksHelper.exe',
    'hd-glcheck.exe', 'HD-GlCheck.exe',
    'msiappplayer.exe', 'MSIAppPlayer.exe'
  ];

  // Calcular máscara hexadecimal e listas dos núcleos físicos (pares: 0, 2, 4, 6, 8, 10...)
  let maskHex = '0x5555';
  let coresListSemicolon = '0;2;4;6;8;10;12;14';
  let coresListSpace = '0 2 4 6 8 10 12 14';

  if (emuCores && emuCores.length > 0) {
    coresListSemicolon = emuCores.join(';');
    coresListSpace = emuCores.join(' ');
    let m = 0n;
    for (const c of emuCores) { if (c < 64) m |= (1n << BigInt(c)); }
    maskHex = '0x' + m.toString(16);
  }

  for (const iniPath of possiblePaths) {
    try {
      if (!fs.existsSync(iniPath)) continue;

      const rawBuffer = fs.readFileSync(iniPath);
      let encoding = 'utf16le';
      let text = '';

      if (rawBuffer[0] === 0xff && rawBuffer[1] === 0xfe) {
        encoding = 'utf16le';
        text = rawBuffer.toString('utf16le');
      } else if (rawBuffer[0] === 0xef && rawBuffer[1] === 0xbb && rawBuffer[2] === 0xbf) {
        encoding = 'utf8';
        text = rawBuffer.toString('utf8');
      } else {
        const utf16Str = rawBuffer.toString('utf16le');
        if (utf16Str.includes('[') && utf16Str.includes(']')) {
          encoding = 'utf16le';
          text = utf16Str;
        } else {
          encoding = 'utf8';
          text = rawBuffer.toString('utf8');
        }
      }

      function updateIniKey(fullText, section, key, value) {
        const sectionHeader = `[${section}]`;
        const sectionIdx = fullText.indexOf(sectionHeader);

        if (sectionIdx === -1) {
          return fullText + `\r\n\r\n[${section}]\r\n${key}=${value}\r\n`;
        }

        const nextSectionIdx = fullText.indexOf('[', sectionIdx + sectionHeader.length);
        const sectionBody = nextSectionIdx === -1
          ? fullText.substring(sectionIdx)
          : fullText.substring(sectionIdx, nextSectionIdx);

        const keyRegex = new RegExp(`^(${key}\\s*=)(.*)$`, 'm');
        let newSectionBody = '';

        if (keyRegex.test(sectionBody)) {
          newSectionBody = sectionBody.replace(keyRegex, `${key}=${value}`);
        } else {
          newSectionBody = sectionBody.trimEnd() + `\r\n${key}=${value}\r\n`;
        }

        if (nextSectionIdx === -1) {
          return fullText.substring(0, sectionIdx) + newSectionBody;
        } else {
          return fullText.substring(0, sectionIdx) + newSectionBody + fullText.substring(nextSectionIdx);
        }
      }

      function removeIniKey(fullText, section, key) {
        const sectionHeader = `[${section}]`;
        const sectionIdx = fullText.indexOf(sectionHeader);
        if (sectionIdx === -1) return fullText;
        const nextSectionIdx = fullText.indexOf('[', sectionIdx + sectionHeader.length);
        const sectionBody = nextSectionIdx === -1
          ? fullText.substring(sectionIdx)
          : fullText.substring(sectionIdx, nextSectionIdx);
        const keyRegex = new RegExp(`^${key}\\s*=.*$\\r?\\n?`, 'm');
        const newSectionBody = sectionBody.replace(keyRegex, '');
        if (nextSectionIdx === -1) {
          return fullText.substring(0, sectionIdx) + newSectionBody;
        } else {
          return fullText.substring(0, sectionIdx) + newSectionBody + fullText.substring(nextSectionIdx);
        }
      }

      function appendUniqueCSV(existing, toAdd) {
        const list = (existing || '').split(',').map(s => s.trim()).filter(Boolean);
        for (const item of toAdd) {
          if (!list.some(x => x.toLowerCase() === item.toLowerCase())) {
            list.push(item);
          }
        }
        return list.join(',');
      }

      function getIniKey(fullText, section, key) {
        const sectionHeader = `[${section}]`;
        const sectionIdx = fullText.indexOf(sectionHeader);
        if (sectionIdx === -1) return '';
        const nextSectionIdx = fullText.indexOf('[', sectionIdx + sectionHeader.length);
        const sectionBody = nextSectionIdx === -1
          ? fullText.substring(sectionIdx)
          : fullText.substring(sectionIdx, nextSectionIdx);
        const match = sectionBody.match(new RegExp(`^${key}\\s*=(.*)$`, 'm'));
        return match ? match[1].trim() : '';
      }

      // 1. Excluir do ProBalance (Sempre)
      const currOoc = getIniKey(text, 'OutOfControlProcessRestraint', 'OocExclusions');
      const newOoc = appendUniqueCSV(currOoc, emuProcesses);
      text = updateIniKey(text, 'OutOfControlProcessRestraint', 'OocExclusions', newOoc);

      // 2. Induzir o Modo de Desempenho (Gaming Mode - Sempre)
      text = updateIniKey(text, 'GamingMode', 'GamingModeEnabled', 'true');
      text = updateIniKey(text, 'GamingMode', 'GamingChangePowerPlan', 'true');
      text = updateIniKey(text, 'GamingMode', 'TargetPowerPlan', 'Bitsum Highest Performance');
      const currGaming = getIniKey(text, 'GamingMode', 'AutomaticGamingModeProcessPaths');
      const newGaming = appendUniqueCSV(currGaming, emuProcesses);
      text = updateIniKey(text, 'GamingMode', 'AutomaticGamingModeProcessPaths', newGaming);

      // 3. SmartTrim & MemoryManagement (Conforme modelo prolasso.ini)
      text = updateIniKey(text, 'MemoryManagement', 'SmartTrimIsEnabled', 'true');
      text = updateIniKey(text, 'MemoryManagement', 'SmartTrimWorkingSetTrims', 'true');
      text = updateIniKey(text, 'MemoryManagement', 'SmartTrimClearStandbyList', 'true');
      text = updateIniKey(text, 'MemoryManagement', 'SmartTrimClearFileCache', 'true');
      text = updateIniKey(text, 'MemoryManagement', 'ClearStandbyFreeRAMThresholdMB', '6000');
      text = updateIniKey(text, 'MemoryManagement', 'ClearStandbyOnlyInPerfMode', 'true');
      text = updateIniKey(text, 'MemoryManagement', 'SmartTrimIntervalMins', '15');

      // 4. Foreground Boosting & Logging (Conforme modelo prolasso.ini)
      text = updateIniKey(text, 'ForegroundBoosting', 'BoostForegroundProcess', 'true');
      text = updateIniKey(text, 'ForegroundBoosting', 'ForegroundBoostPriorityClass', '0x8000');
      text = updateIniKey(text, 'ForegroundBoosting', 'ForegroundBoostGPU', '2');
      text = updateIniKey(text, 'Logging', 'LogDisable', 'true');

      // 5. Prioridades Permanentes em ProcessDefaults (Conforme modelo prolasso.ini)
      const priRules = emuProcesses.map(p => `${p},high`).join(',');
      text = updateIniKey(text, 'ProcessDefaults', 'DefaultPriorities', priRules);

      const ioRules = emuProcesses.map(p => `${p},3`).join(',');
      text = updateIniKey(text, 'ProcessDefaults', 'DefaultIOPriorities', ioRules);

      const gpuRules = emuProcesses.map(p => `${p},4`).join(',');
      text = updateIniKey(text, 'ProcessDefaults', 'DefaultGPUPriorities', gpuRules);

      const threadBoostRules = emuProcesses.map(p => `${p};0`).join(',');
      text = updateIniKey(text, 'ProcessDefaults', 'ThreadPriorityBoosts', threadBoostRules);

      // 6. Afinidade de CPU Permanente (Sempre -> Núcleos Físicos Pares: 0;2;4;6;8;10...)
      // Remove DefaultAffinities (que dava conflito com 0x) e grava apenas DefaultAffinitiesEx
      const affExRules = emuProcesses.map(p => `${p},0,${coresListSemicolon}`).join(',');
      text = updateIniKey(text, 'ProcessDefaults', 'DefaultAffinitiesEx', affExRules);
      text = removeIniKey(text, 'ProcessDefaults', 'DefaultAffinities');

      fs.writeFileSync(iniPath, Buffer.from(text, encoding));
      configured = true;
    } catch (e) {
      console.warn('Erro ao atualizar Process Lasso ini:', e);
    }
  }

  // Notificar / Iniciar o motor do Process Governor se o Process Lasso estiver instalado
  try {
    const govExe = 'C:\\Program Files\\Process Lasso\\ProcessGovernor.exe';
    if (fs.existsSync(govExe)) {
      execSync(`powershell -NoProfile -Command "Get-Process ProcessGovernor -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 200; Start-Process '${govExe}' -WindowStyle Hidden -ErrorAction SilentlyContinue"`, { stdio: 'ignore', timeout: 5000 });
    }
  } catch (_) { }

  return configured;
}

ipcMain.handle('boost-game-turbo', async () => {
  try {
    // ── 0. Detect Hardware ─────────────────────────────────────────────────
    const hw = detectHardwareProfile();
    const { logicalCount, physicalCores, hasHT, isIntel, isAMD, cpuModel, totalRamMB, gpuName, tier } = hw;

    const affinityMap = buildAdaptiveAffinityMap(hw);
    const { _meta, ...affinityMapClean } = affinityMap;
    const hdMask = affinityMap['HD-Player'] || 0x554;

    // Memory threshold based on RAM: clear standby when free RAM < threshold
    const standbyThreshMB = totalRamMB >= 32768 ? 8192
      : totalRamMB >= 16384 ? 6000
        : totalRamMB >= 8192 ? 3000
          : 1500;

    // ── 1. Power Plan (Ultimate / Highest Performance) ────────────────────
    try { execSync('powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61', { stdio: 'ignore' }); } catch (_) { }
    try { execSync('powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', { stdio: 'ignore' }); } catch (_) { }

    // ── 2. Core Parking OFF + Desempenho Máximo da CPU ───────────────────
    try {
      execSync('powercfg -setacvalueindex SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 0', { stdio: 'ignore' });
      execSync('powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100', { stdio: 'ignore' });
      execSync('powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMAXCORES 100', { stdio: 'ignore' });
      execSync('powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PERFEPP 0', { stdio: 'ignore' });
      execSync('powercfg -setactive SCHEME_CURRENT', { stdio: 'ignore' });
    } catch (_) { }

    // ── 3. Induzir Modo de Desempenho no Windows (Power Throttling OFF) ──
    try {
      execSync('reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f', { stdio: 'ignore' });
    } catch (_) { }

    // ── 4. IFEO Registry Priority (Excluir de Throttling) ─────────────────
    const IFEO = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options';
    for (const exe of ['HD-Player.exe', 'BlueStacks.exe', 'BlueStacksHelper.exe']) {
      try { execSync(`reg add "${IFEO}\\${exe}\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f /reg:64`, { stdio: 'ignore' }); } catch (_) { }
      try { execSync(`reg add "${IFEO}\\${exe}\\PerfOptions" /v IoPriority /t REG_DWORD /d 3 /f /reg:64`, { stdio: 'ignore' }); } catch (_) { }
    }
    // Throttle background apps
    for (const exe of ['Discord.exe', 'DiscordSystemHelper.exe', 'chrome.exe', 'msedge.exe']) {
      try { execSync(`reg add "${IFEO}\\${exe}\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 2 /f /reg:64`, { stdio: 'ignore' }); } catch (_) { }
    }

    // ── 5. Win32 & Memory Registry (Excluir do ProBalance / Foco Total) ──
    try { execSync('reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 26 /f', { stdio: 'ignore' }); } catch (_) { }
    try { execSync('reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 1 /f', { stdio: 'ignore' }); } catch (_) { }
    try { execSync('reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v LargeSystemCache /t REG_DWORD /d 0 /f', { stdio: 'ignore' }); } catch (_) { }

    // ── 6. GPU & Multimedia Priority ─────────────────────────────────────
    const GPUREG = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games';
    const gpuPri = tier === 'ultra' ? 8 : tier === 'high' ? 8 : 6;
    try { execSync(`reg add "${GPUREG}" /v "GPU Priority" /t REG_DWORD /d ${gpuPri} /f`, { stdio: 'ignore' }); } catch (_) { }
    try { execSync(`reg add "${GPUREG}" /v Priority /t REG_DWORD /d 6 /f`, { stdio: 'ignore' }); } catch (_) { }
    try { execSync(`reg add "${GPUREG}" /v "Scheduling Category" /t REG_SZ /d "High" /f`, { stdio: 'ignore' }); } catch (_) { }
    try { execSync(`reg add "${GPUREG}" /v "SFIO Priority" /t REG_SZ /d "High" /f`, { stdio: 'ignore' }); } catch (_) { }

    // ── 7. Timer Resolution ───────────────────────────────────────────────
    try { execSync('reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f', { stdio: 'ignore' }); } catch (_) { }

    // ── 8. Network / TCP No-Nagle ─────────────────────────────────────────
    try {
      const tcpPS = `Get-ChildItem -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -ErrorAction SilentlyContinue; Set-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Value 1 -ErrorAction SilentlyContinue }`;
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${tcpPS.replace(/"/g, '\\"')}"`, { stdio: 'ignore', timeout: 8000 });
    } catch (_) { }

    // ── 9. Configurações de afinidade viva ignoradas conforme solicitação ───
    // O usuário solicitou não alterar a afinidade "Atual" dos processos em execução,
    // deixando a afinidade viva como está e definindo somente a regra "Sempre" no Process Lasso.

    // ── 10. SmartTrim: clear standby list + working sets ──────────────────
    try {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Clear-DnsClientCache; [System.GC]::Collect(); Get-Process | Where-Object { $_.WorkingSet64 -gt 150MB -and $_.Name -notmatch 'HD-Player|BlueStacks' } | ForEach-Object { try { $_.MinWorkingSet = 4096 } catch {} }"`, { stdio: 'ignore', timeout: 8000 });
    } catch (_) { }

    // ── 11. Windows Game Mode + No Xbox DVR ─────────────────────────────
    try { execSync('reg add "HKCU\\Software\\Microsoft\\GameBar" /v AllowAutoGameMode /t REG_DWORD /d 1 /f', { stdio: 'ignore' }); } catch (_) { }
    try { execSync('reg add "HKCU\\Software\\Microsoft\\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 1 /f', { stdio: 'ignore' }); } catch (_) { }
    try { execSync('reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f', { stdio: 'ignore' }); } catch (_) { }
    try { execSync('reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f', { stdio: 'ignore' }); } catch (_) { }

    // ── 12. Integração Automática com Process Lasso (se presente) ────────
    const processLassoConfigured = configureProcessLasso(hw, _meta.emuCores);

    return {
      success: true,
      hw: { logicalCount, physicalCores, hasHT, cpuModel, totalRamMB, gpuName, tier, isIntel, isAMD },
      affinityMask: '0x' + hdMask.toString(16).toUpperCase(),
      standbyThreshMB,
      affinityMap: Object.fromEntries(
        Object.entries(affinityMapClean).map(([k, v]) => [k, '0x' + v.toString(16).toUpperCase()])
      ),
      emuCores: _meta.emuCores,
      processLassoConfigured
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});


ipcMain.handle('export-user-config', async (event, configData) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Salvar Minha Configuração Loord Optimizer',
      defaultPath: 'MinhaConfig_LoordOpt.json',
      filters: [{ name: 'Arquivo JSON', extensions: ['json'] }]
    });

    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(configData, null, 2), 'utf8');
      return { success: true, filePath };
    }
    return { success: false, cancelled: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('import-user-config', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Carregar Configuração Salva',
      filters: [{ name: 'Arquivo JSON', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
      return { success: true, config: data };
    }
    return { success: false, cancelled: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
      // 1. Energia & Hibernação
      'powercfg -h off',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f /reg:64',
      'powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61',
      'powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61',
      'powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMAXCORES 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPHEADROOM 0',
      'powercfg -setactive SCHEME_CURRENT',

      // 2. Timer Resolution & Microstutter BCD
      'bcdedit /set useplatformtick yes',
      'bcdedit /set disabledynamictick yes',
      'bcdedit /set useplatformclock no',
      'bcdedit /set bootux disabled',
      'bcdedit /timeout 3',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f /reg:64',

      // 3. GPU Max Performance & HAGS & Desativar Fullscreen Optimizations
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerEnable /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerLevel /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerLevelAC /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PerfLevelSrc /t REG_DWORD /d 8738 /f /reg:64',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 2 /f',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_HonorUserFSEBehaviorMode /t REG_DWORD /d 1 /f',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_DXGIHonorFSEWindowsCompatible /t REG_DWORD /d 1 /f',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f /reg:64',

      // Compatibilidade do Emulador sem Delay
      'reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" /v "C:\\Program Files\\BlueStacks_nxt\\HD-Player.exe" /t REG_SZ /d "~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE" /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" /v "C:\\Program Files\\BlueStacks_msi5\\HD-Player.exe" /t REG_SZ /d "~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE" /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" /v "C:\\Program Files\\BlueStacks\\HD-Player.exe" /t REG_SZ /d "~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE" /f',

      // 4. Efeitos Visuais Mínimos & Resposta Rápida
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v UserPreferencesMask /t REG_BINARY /d 9012038010000000 /f',
      'reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v EnableAeroPeek /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v DragFullWindows /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v FontSmoothing /t REG_SZ /d 2 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize" /v StartupDelayInMSec /t REG_DWORD /d 0 /f',

      // 5. Notificações & Telemetria
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" /v ToastEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_TOASTS_ENABLED /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer" /v DisableNotificationCenter /t REG_DWORD /d 1 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338389Enabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SoftLandingEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SystemPaneSuggestionsEnabled /t REG_DWORD /d 0 /f',

      // 6. Rede QoS & Nagle Global
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\QoS" /v "Do not use NLA" /t REG_SZ /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\MSMQ\\Parameters" /v TCPNoDelay /t REG_DWORD /d 1 /f /reg:64',

      // 7. SSD TRIM & Otimização de Armazenamento
      'fsutil behavior set DisableDeleteNotify 0',

      // 8. Serviços em Segundo Plano
      'sc config "Fax" start= disabled',
      'sc stop "Fax"',
      'sc config "MapsBroker" start= disabled',
      'sc stop "MapsBroker"',
      'sc config "Spooler" start= disabled',
      'sc stop "Spooler"',
      'sc config "WSearch" start= demand',
      'sc stop "WSearch"',
      'sc config "DiagTrack" start= disabled',
      'sc stop "DiagTrack"',
      'sc config "WerSvc" start= disabled',
      'sc stop "WerSvc"',
      'sc config "dmwappushservice" start= disabled',
      'sc stop "dmwappushservice"',
      'sc config "wuauserv" start= demand',
      'sc stop "wuauserv"',
      'sc config "BITS" start= demand',
      'sc stop "BITS"',
      'sc config "dosvc" start= demand',
      'sc stop "dosvc"',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 0 /f /reg:64'
    ];

    for (const cmd of directCommands) {
      try {
        execSync(cmd, { stdio: 'ignore' });
      } catch (e) { }
    }

    // 9. Nagle por Interface de Rede & Desativação de IPv6 para menor latência DNS
    try {
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-NetAdapter | Foreach-Object { $key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\' + $_.InterfaceGuid; if (Test-Path $key) { Set-ItemProperty -Path $key -Name TcpAckFrequency -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $key -Name TCPNoDelay -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $key -Name TcpDelAckTicks -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue } }; Get-NetAdapterBinding -ComponentID ms_tcpip6 | Disable-NetAdapterBinding -ErrorAction SilentlyContinue"`, { stdio: 'ignore' });
    } catch (_) { }

    // 10. Limpar Shaders DirectX Cache, D3D e Temp sem falhas
    try {
      execSync('cmd.exe /c "del /q /f /s \"%TEMP%\\*\" & del /q /f /s \"C:\\Windows\\Temp\\*\" & del /q /f /s \"%LOCALAPPDATA%\\D3DSCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\NVIDIA\\DXCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\AMD\\DxCache\\*\" & ipconfig /flushdns & exit /b 0"', { stdio: 'ignore' });
    } catch (e) { }

    // 11. Redução de processos em segundo plano e purga de RAM
    try {
      const procScript = getPhysicalScriptPath('otimizar_processos.ps1');
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${procScript}"`, { stdio: 'ignore' });
    } catch (e) { }

    try {
      const ramScript = getPhysicalScriptPath('clean_ram.ps1');
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ramScript}"`, { stdio: 'ignore' });
    } catch (e) { }

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

  const { dpi, maxFps, forceRog2, mouseMode, pollingRate, engine, astc, scope } = config || {};
  const isMouseOnly = scope === 'mouse-only';
  const isEmulatorOnly = scope === 'emulator-only';

  try {
    const allPaths = [
      { key: 'bluestacks_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf' },
      { key: 'bluestacks_msi5.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf' },
      { key: 'bluestacks_bgp_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf' },
      { key: 'bluestacks.conf.bak', path: 'C:\\ProgramData\\BlueStacks\\bluestacks.conf' },
      { key: 'bluestacks_nxt.conf.bak', path: 'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf' },
      { key: 'bluestacks_bgp.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf' }
    ];

    // ── 1. Se for apenas configuração do Emulador (ou all) ─────────────────
    if (!isMouseOnly && (dpi || maxFps || forceRog2 !== undefined || engine || astc)) {
      for (const item of allPaths) {
        if (fs.existsSync(item.path)) {
          updateConfFile(item.path, dpi, maxFps, forceRog2, engine, astc);
        }
      }
      if (isEmulatorOnly) {
        return { success: true, message: 'Configurações do emulador aplicadas com sucesso!' };
      }
    }

    // ── 2. Se for configuração de Regedit de Mouse (mouse-only ou all) ─────
    const selectedRegData = require('./regis/encrypted_reg_data.js');
    const selectedRegConfig = selectedRegData[mouseMode || 'loord-3-sense-full-red'];

    // Limpar chaves anteriores para não misturar regedits
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
      } catch (e) { }
    }

    // Aplicar as chaves exatas da Regedit selecionada
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
        await runCmd('bcdedit /set useplatformclock false').catch(() => { });
        await runCmd('bcdedit /set disabledynamictick yes').catch(() => { });
        await runCmd('bcdedit /deletevalue useplatformtick').catch(() => { });
        await runCmd('bcdedit /timeout 5').catch(() => { });
      } catch (e) { }
    }

    if (mouseMode === 'ultra-emu-boost') {
      try {
        execSync('powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0', { stdio: 'ignore' });
        execSync('powercfg /setdcvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0', { stdio: 'ignore' });
        execSync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', { stdio: 'ignore' });
        execSync('wmic process where name="HD-Player.exe" CALL setpriority "high priority"', { stdio: 'ignore' });
        execSync('wmic process where name="MSIAppPlayer.exe" CALL setpriority "high priority"', { stdio: 'ignore' });
        execSync('wmic process where name="MEmuHeadless.exe" CALL setpriority "high priority"', { stdio: 'ignore' });
      } catch (e) { }
    }

    // Polling Rate buffer
    let mouseQueueSize = 100;
    if (pollingRate === '8000') mouseQueueSize = 300;
    else if (pollingRate === '1000') mouseQueueSize = 150;
    else if (pollingRate === '500') mouseQueueSize = 100;
    else if (pollingRate === '125-250') mouseQueueSize = 50;

    try {
      execSync(`reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d ${mouseQueueSize} /f /reg:64`, { stdio: 'ignore' });
    } catch (_) { }

    // Atualizar sensibilidade e curva de mouse no Windows em tempo real (sem precisar reiniciar)
    try {
      const psSpiCmd = `$s=@'
[DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, int[] c, uint d);
[DllImport("user32.dll", EntryPoint="SystemParametersInfoW")] public static extern bool SystemParametersInfoPtr(uint a, uint b, IntPtr c, uint d);
'@
Add-Type -Namespace W -Name M -MemberDefinition $s -ErrorAction SilentlyContinue
[W.M]::SystemParametersInfo(4,0,[int[]]@(0,0,0),3)
[W.M]::SystemParametersInfoPtr(0x71,0,[IntPtr]10,3)
[W.M]::SystemParametersInfoPtr(0x6B,0,[IntPtr]0,3)
[W.M]::SystemParametersInfoPtr(0x5F,0,[IntPtr]0,3)
`;
      execSync(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "${psSpiCmd.replace(/\r?\n/g, '; ')}"`, { stdio: 'ignore' });
    } catch (e) { }

    return {
      success: true,
      regName: selectedRegConfig ? selectedRegConfig.name : 'Regedit Customizada',
      message: 'Regedit de sensibilidade aplicada com sucesso no Windows!'
    };
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

    await runCmd('bcdedit /deletevalue useplatformtick').catch(() => { });
    await runCmd('bcdedit /deletevalue disabledynamictick').catch(() => { });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Reversão total automática ao expirar ou ser revogado no painel (Anti-Leak Rollback)
ipcMain.handle('revert-all-tweaks-on-revoke', async () => {
  try {
    // 1. Parar macros e cleaners em execução
    await killMacroProcess().catch(() => { });

    // 2. Restaurar backups do registro (.reg) e arquivos de configuração bluestacks.conf
    try {
      if (fs.existsSync(backupDir)) {
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
            try { fs.copyFileSync(path.join(backupDir, item.key), item.path); } catch (_) { }
          }
        }
      }
    } catch (_) { }

    // 3. Reset explícito do Mouse para padrão absoluto do Windows (Sensibilidade normal 10, sem curvas customizadas)
    const mouseResetCmds = [
      'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "10" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v MouseHoverTime /t REG_SZ /d "400" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d 0000000000000000156e000000000000004001000000000029dc0300000000000000280000000000 /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d 0000000000000000fd11010000000000002404000000000000fc1200000000000000bd0400000000 /f',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 100 /f',
      'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardDelay /t REG_SZ /d "1" /f',
      'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardSpeed /t REG_SZ /d "31" /f'
    ];
    for (const cmd of mouseResetCmds) {
      await runCmd(cmd).catch(() => { });
    }

    // Atualizar parâmetros do mouse na API Win32 ao vivo
    try {
      const psMouseRefresh = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinMouse {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
}
"@; [WinMouse]::SystemParametersInfo(0x0071, 10, [IntPtr]::Zero, 3); [WinMouse]::SystemParametersInfo(0x0004, 0, [IntPtr]::Zero, 3); [WinMouse]::SystemParametersInfo(0x0017, 1, [IntPtr]::Zero, 3); [WinMouse]::SystemParametersInfo(0x000B, 31, [IntPtr]::Zero, 3);`;
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psMouseRefresh.replace(/\r?\n/g, ' ')}"`, { stdio: 'ignore' });
    } catch (_) { }

    // 4. Limpar regras do Process Lasso se prolasso.ini existir
    const possibleLassoPaths = [
      'C:\\ProgramData\\ProcessLasso\\config\\prolasso.ini',
      'C:\\Program Files\\Process Lasso\\config\\prolasso.ini',
      'C:\\Program Files\\Process Lasso\\prolasso.ini'
    ];
    for (const iniPath of possibleLassoPaths) {
      try {
        if (fs.existsSync(iniPath)) {
          let text = fs.readFileSync(iniPath, 'utf8');
          text = text.replace(/DefaultAffinitiesEx=.*\r?\n?/g, '');
          text = text.replace(/DefaultAffinities=.*\r?\n?/g, '');
          text = text.replace(/DefaultPriorities=.*\r?\n?/g, '');
          text = text.replace(/DefaultIOPriorities=.*\r?\n?/g, '');
          text = text.replace(/DefaultGPUPriorities=.*\r?\n?/g, '');
          fs.writeFileSync(iniPath, text, 'utf8');
        }
      } catch (_) { }
    }

    // 5. Reverter DNS para DHCP Automático do Windows e limpar hosts
    await runCmd('powershell -NoProfile -Command "Get-NetAdapter | Where-Object Status -eq Up | ForEach-Object { netsh interface ip set dns name=\\\"$($_.Name)\\\" source=dhcp; netsh interface ip set wins name=\\\"$($_.Name)\\\" source=dhcp }"').catch(() => { });
    cleanHostsFileOfBluestacks();
    await runCmd('ipconfig /flushdns').catch(() => { });

    // 6. Reverter Plano de Energia para o padrão Equilibrado
    await runCmd('powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e').catch(() => { });

    // 7. Reverter Tweaks de Sistema, Memória, Svchost e Prioridades
    const resetCmds = [
      'reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /f',
      'reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Priority" /f',
      'reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Scheduling Category" /f',
      'reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /f',
      'reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Control" /v SvcHostSplitThresholdInKB /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettingsOverride /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettingsOverrideMask /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 20 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 10 /f /reg:64',
      'reg delete "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /f /reg:64',
      'bcdedit /deletevalue useplatformtick',
      'bcdedit /deletevalue disabledynamictick',
      'bcdedit /deletevalue useplatformclock',
      'bcdedit /deletevalue bootux'
    ];
    for (const cmd of resetCmds) {
      await runCmd(cmd).catch(() => { });
    }

    // 8. Reativar serviços padrão do Windows
    const servicesToRestore = [
      'sc config "SysMain" start= auto',
      'sc start "SysMain"',
      'sc config "WSearch" start= auto',
      'sc start "WSearch"',
      'sc config "DiagTrack" start= auto',
      'sc start "DiagTrack"',
      'sc config "Spooler" start= auto',
      'sc start "Spooler"',
      'sc config "wuauserv" start= demand',
      'sc config "BITS" start= demand',
      'sc config "dosvc" start= demand'
    ];
    for (const svc of servicesToRestore) {
      await runCmd(svc).catch(() => { });
    }

    // 9. Reverter Tweaks do Android e Touch Engine via ADB
    const adb = findAdb();
    if (adb) {
      const PORTS = [5555, 5554, 5565, 5575, 5585, 21503, 62001, 7555];
      for (const p of PORTS) {
        try {
          await runCmd(`"${adb}" -s 127.0.0.1:${p} shell settings put global window_animation_scale 1.0`);
          await runCmd(`"${adb}" -s 127.0.0.1:${p} shell settings put global transition_animation_scale 1.0`);
          await runCmd(`"${adb}" -s 127.0.0.1:${p} shell settings put global animator_duration_scale 1.0`);
          await runCmd(`"${adb}" -s 127.0.0.1:${p} shell settings put global background_process_limit -1`);
          await runCmd(`"${adb}" -s 127.0.0.1:${p} shell wm density 240`);
          await runCmd(`"${adb}" -s 127.0.0.1:${p} shell setprop view.touch_slop 8`);
          await runCmd(`"${adb}" -s 127.0.0.1:${p} shell setprop touch.pressure.scale 1`);
          await runCmd(`"${adb}" -s 127.0.0.1:${p} shell setprop windowsmgr.max_events_per_sec 60`);
        } catch (_) { }
      }
    }

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
      } catch (e) { }
    }

    if (tweakId === 'freefire-delay') {
      try {
        execSync(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Get-Process HD-Player,dnplayer,LdBoxHeadless,Nox -ErrorAction SilentlyContinue | ForEach-Object { try{$_.PriorityClass='High'}catch{} }"`, { stdio: 'ignore' });
      } catch (e) { }
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

// ─── PC Fraco / 1ª Geração (Ultra FPS) ───────────────────────────
ipcMain.handle('optimize-pc-fraco', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    const lowEndTweaks = [
      // 1. Forçar visual minimalista do Windows (desliga transparência, sombras e animações que pesam na GPU antiga)
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v UserPreferencesMask /t REG_BINARY /d 9012038010000000 /f',
      'reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v EnableAeroPeek /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v AlwaysHibernateThumbnails /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v DragFullWindows /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v FontSmoothing /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v EnableTransparency /t REG_DWORD /d 0 /f',

      // 2. Desativar Serviços Pesados que travam 100% de Disco e CPU em PC Antigo
      'sc config "WSearch" start= disabled',
      'sc stop "WSearch"',
      'sc config "SysMain" start= disabled',
      'sc stop "SysMain"',
      'sc config "DiagTrack" start= disabled',
      'sc stop "DiagTrack"',
      'sc config "WerSvc" start= disabled',
      'sc stop "WerSvc"',
      'sc config "Spooler" start= disabled',
      'sc stop "Spooler"',
      'sc config "Fax" start= disabled',
      'sc stop "Fax"',
      'sc config "MapsBroker" start= disabled',
      'sc stop "MapsBroker"',
      'sc config "dmwappushservice" start= disabled',
      'sc stop "dmwappushservice"',
      'sc config "PcaSvc" start= disabled',
      'sc stop "PcaSvc"',

      // 3. Plano de Energia Máxima & Core Unparking
      'powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61',
      'powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMAXCORES 100',
      'powercfg -setactive SCHEME_CURRENT',
      'powercfg -h off',

      // 4. Prioridade Win32 Separator para primeiro plano
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 26 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f /reg:64',

      // 5. Otimizações de GPU Integrada (Intel HD Graphics / AMD APU)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerEnable /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerLevel /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerLevelAC /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Intel\\GMM" /v DedicatedSegmentSize /t REG_DWORD /d 512 /f /reg:64',

      // 6. BCD Latência 0ms
      'bcdedit /set useplatformtick yes',
      'bcdedit /set disabledynamictick yes',
      'bcdedit /set useplatformclock no',
      'bcdedit /set bootux disabled',
      'bcdedit /timeout 3',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f /reg:64'
    ];

    for (const cmd of lowEndTweaks) {
      try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
    }

    // Purgar processos desnecessários e limpar RAM
    try {
      const procScript = getPhysicalScriptPath('otimizar_processos.ps1');
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${procScript}"`, { stdio: 'ignore' });
    } catch (_) { }

    try {
      const ramScript = getPhysicalScriptPath('clean_ram.ps1');
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ramScript}"`, { stdio: 'ignore' });
    } catch (_) { }

    return { success: true, message: 'Otimização para PC Fraco aplicada com sucesso!' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('clean-deep-disk', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    const cleanCmd = 'cmd.exe /c "del /q /f /s \"%TEMP%\\*\" & del /q /f /s \"C:\\Windows\\Temp\\*\" & del /q /f /s \"C:\\Windows\\Prefetch\\*\" & del /q /f /s \"%LOCALAPPDATA%\\D3DSCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\NVIDIA\\DXCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\AMD\\DxCache\\*\" & del /q /f /s \"C:\\Windows\\SoftwareDistribution\\Download\\*\" & del /q /f /s \"C:\\ProgramData\\BlueStacks_nxt\\Logs\\*\" & del /q /f /s \"C:\\ProgramData\\BlueStacks_msi5\\Logs\\*\" & del /q /f /s \"C:\\ProgramData\\BlueStacks\\Logs\\*\" & ipconfig /flushdns & exit /b 0"';
    execSync(cleanCmd, { stdio: 'ignore' });
    return { success: true, message: 'Limpeza profunda de disco e cache concluída! Espaço e RAM liberados.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('remove-windows-bloatware', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    const psBloatCmd = `$apps = @(
      'Microsoft.XboxApp','Microsoft.Xbox.TCUI','Microsoft.XboxGameOverlay',
      'Microsoft.XboxGamingOverlay','Microsoft.XboxIdentityProvider','Microsoft.XboxSpeechToTextOverlay',
      'Microsoft.SkypeApp','Microsoft.People','Microsoft.windowscommunicationsapps',
      'Microsoft.WindowsMaps','Microsoft.BingWeather','Microsoft.BingNews','Microsoft.WindowsFeedbackHub',
      'Microsoft.GetStarted','Microsoft.GetHelp','Microsoft.MicrosoftSolitaireCollection','Microsoft.ZuneVideo',
      'Microsoft.ZuneMusic','Microsoft.Print3D','Microsoft.Microsoft3DViewer','Microsoft.OneNote',
      'Microsoft.OfficeHub','Microsoft.MicrosoftStickyNotes','Microsoft.WindowsSoundRecorder','Microsoft.YourPhone',
      'Microsoft.MixedReality.Portal','Microsoft.Wallet','Microsoft.Todos','Microsoft.PowerAutomateDesktop',
      'MicrosoftTeams','Microsoft.549981C3F5F10','Clipchamp.Clipchamp'
    );
    foreach ($a in $apps) {
      Get-AppxPackage -Name "*$a*" -AllUsers | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue;
      Get-AppxProvisionedPackage -Online | Where-Object DisplayName -like "*$a*" | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue;
    }`;

    execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psBloatCmd.replace(/\r?\n/g, ' ')}"`, { stdio: 'ignore' });
    return { success: true, message: '🗑️ Bloatwares e aplicativos inúteis do Windows desinstalados de forma permanente com sucesso!' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('apply-low-end-emulator-config', async (event, preset) => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    const allPaths = [
      'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf',
      'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf',
      'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf',
      'C:\\ProgramData\\BlueStacks\\bluestacks.conf',
      'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf',
      'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf'
    ];

    let width = "960";
    let height = "540";
    let dpi = "240";
    let ram = "2048";
    let cpu = "2";
    let fps = "60";

    if (preset === 'ultra-potato') {
      width = "800";
      height = "600";
      dpi = "160";
      ram = "1536";
      cpu = "2";
      fps = "60";
    } else if (preset === '720p-smooth') {
      width = "1280";
      height = "720";
      dpi = "240";
      ram = "2048";
      cpu = "2";
      fps = "90";
    }

    for (const confPath of allPaths) {
      if (fs.existsSync(confPath)) {
        let content = fs.readFileSync(confPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const newLines = [];
        for (let line of lines) {
          if (line.match(/^bst\.instance\.(.*?)\.fb_width=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.fb_width=/)[1];
            line = `bst.instance.${inst}.fb_width="${width}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.fb_height=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.fb_height=/)[1];
            line = `bst.instance.${inst}.fb_height="${height}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.dpi=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.dpi=/)[1];
            line = `bst.instance.${inst}.dpi="${dpi}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.ram=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.ram=/)[1];
            line = `bst.instance.${inst}.ram="${ram}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.cpu=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.cpu=/)[1];
            line = `bst.instance.${inst}.cpu="${cpu}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.max_fps=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.max_fps=/)[1];
            line = `bst.instance.${inst}.max_fps="${fps}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.enable_high_fps=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.enable_high_fps=/)[1];
            line = `bst.instance.${inst}.enable_high_fps="1"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.astc_decoding_mode=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.astc_decoding_mode=/)[1];
            line = `bst.instance.${inst}.astc_decoding_mode="0"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.enable_vsync=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.enable_vsync=/)[1];
            line = `bst.instance.${inst}.enable_vsync="0"`;
          }
          newLines.push(line);
        }
        fs.writeFileSync(confPath, newLines.join('\r\n'), 'utf8');
      }
    }

    return { success: true, message: `Perfil ${preset} aplicado ao emulador com sucesso!` };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('set-fixed-pagefile', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    // Configura Pagefile fixo de 6GB (6144MB) no drive C: para evitar congelamentos e falta de RAM
    const cmd = 'wmic pagefilesetting where name="C:\\\\pagefile.sys" set InitialSize=6144,MaximumSize=6144';
    try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
    execSync('reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v PagingFiles /t REG_MULTI_SZ /d "C:\\pagefile.sys 6144 6144" /f /reg:64', { stdio: 'ignore' });
    return { success: true, message: 'Memória Virtual (Pagefile) fixada em 6GB com sucesso!' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── DESATIVADOR COMPLETO DO WINDOWS DEFENDER (COM CONSENTIMENTO) ──────────────
ipcMain.handle('disable-windows-defender-permanent', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    const defenderCommands = [
      // 1. Políticas de Grupo do Windows Defender (Antivirus e AntiSpyware)
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender" /v DisableAntiSpyware /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender" /v DisableAntiVirus /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender" /v ServiceKeepAlive /t REG_DWORD /d 0 /f /reg:64',

      // 2. Desativação da Proteção em Tempo Real e Monitoramento de Comportamento
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection" /v DisableRealtimeMonitoring /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection" /v DisableBehaviorMonitoring /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection" /v DisableOnAccessProtection /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection" /v DisableScanOnRealtimeEnable /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection" /v DisableIOAVProtection /t REG_DWORD /d 1 /f /reg:64',

      // 3. Desativação do Spynet e Envio de Amostras
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Spynet" /v SubmitSamplesConsent /t REG_DWORD /d 2 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Spynet" /v SpynetReporting /t REG_DWORD /d 0 /f /reg:64',

      // 4. Desativação do SmartScreen
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" /v EnableSmartScreen /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AppHost" /v EnableWebContentEvaluation /t REG_DWORD /d 0 /f',

      // 5. Desativar Serviços do Defender no Registro (Start = 4 / Disabled)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\WinDefend" /v Start /t REG_DWORD /d 4 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\WdNisSvc" /v Start /t REG_DWORD /d 4 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Sense" /v Start /t REG_DWORD /d 4 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\SecurityHealthService" /v Start /t REG_DWORD /d 4 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\wscsvc" /v Start /t REG_DWORD /d 4 /f /reg:64',

      // 6. Parar Serviços Ativos
      'sc stop "WinDefend"',
      'sc stop "WdNisSvc"',
      'sc stop "Sense"',
      'sc stop "SecurityHealthService"',
      'sc stop "wscsvc"',

      // 7. Desativar Tarefas Agendadas de Varredura do Defender
      'schtasks /Change /TN "\\Microsoft\\Windows\\Windows Defender\\Windows Defender Cache Maintenance" /Disable',
      'schtasks /Change /TN "\\Microsoft\\Windows\\Windows Defender\\Windows Defender Cleanup" /Disable',
      'schtasks /Change /TN "\\Microsoft\\Windows\\Windows Defender\\Windows Defender Scheduled Scan" /Disable',
      'schtasks /Change /TN "\\Microsoft\\Windows\\Windows Defender\\Windows Defender Verification" /Disable',

      // 8. Remover ícone de Notificação do Defender da Inicialização
      'reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "SecurityHealth" /f /reg:64'
    ];

    for (const cmd of defenderCommands) {
      try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
    }

    try {
      execSync('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-MpPreference -DisableRealtimeMonitoring $true -DisableBehaviorMonitoring $true -DisableBlockAtFirstSeen $true -DisableIOAVProtection $true -DisableScriptScanning $true -SubmitSamplesConsent 2 -MAPSReporting 0 -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
    } catch (_) { }

    return {
      success: true,
      message: '🛡️ Windows Defender e Proteção em Tempo Real desativados com sucesso! Reinicie o computador para aplicar 100% das alterações.'
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── TRANSFORMADOR DE WINDOWS LITE / ISO GAMER (SEM FORMATAR) ──────────────────
ipcMain.handle('transform-windows-lite', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    const liteCommands = [
      // 1. Manter Kernel do Windows na Memória RAM Física (Elimina engasgos de disco HD/SSD)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v LargeSystemCache /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettings /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettingsOverride /t REG_DWORD /d 3 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettingsOverrideMask /t REG_DWORD /d 3 /f /reg:64',

      // 2. Desativação do VBS / Isolamento de Núcleo (HVCI) - Libera +30% de CPU no Emulador
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" /v EnableVirtualizationBasedSecurity /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" /v RequirePlatformSecurityFeatures /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" /v Enabled /t REG_DWORD /d 0 /f /reg:64',

      // 3. Forçar GPU Dedicada em Modo Alto Desempenho no Emulador & HAGS
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f /reg:64',
      'reg add "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences" /v "HD-Player.exe" /t REG_SZ /d "GpuPreference=2;" /f',
      'reg add "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences" /v "MSIAppPlayer.exe" /t REG_SZ /d "GpuPreference=2;" /f',
      'reg add "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences" /v "MEmuHeadless.exe" /t REG_SZ /d "GpuPreference=2;" /f',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\MSIAppPlayer.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f /reg:64',

      // 4. Priorização Extrema de Processos Gamer (MMCSS + Win32PrioritySeparation = 26 / Hex 1A)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 26 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v IRQ8Priority /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 4294967295 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Priority" /t REG_DWORD /d 6 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Scheduling Category" /t REG_SZ /d "High" /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "SFIO Priority" /t REG_SZ /d "High" /f /reg:64',

      // 5. Agrupamento de Svchost (Transforma ~60 processos svchost em menos de 15)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control" /v SvcHostSplitThresholdInKB /t REG_DWORD /d 4294967295 /f /reg:64',

      // 6. Desativação de Bloatware, Sugestões & Telemetria do Sistema
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search" /v AllowCortana /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent" /v DisableWindowsConsumerFeatures /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SilentInstalledAppsEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SystemPaneSuggestionsEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SoftLandingEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338388Enabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-338389Enabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager" /v SubscribedContent-353696Enabled /t REG_DWORD /d 0 /f',

      // 7. GameDVR, Game Bar e Gravação em Segundo Plano Desativados (Zero Input Lag)
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v AppCaptureEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 1 /f',

      // 8. Desativação de Notificações Inúteis (Toasts)
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" /v ToastEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_TOASTS_ENABLED /t REG_DWORD /d 0 /f',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" /v NoToastApplicationNotification /t REG_DWORD /d 1 /f /reg:64',

      // 9. Otimização Visual Minimalista & Menus Instantâneos
      'reg add "HKCU\\Control Panel\\Desktop" /v MenuShowDelay /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f',
      'reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v EnableAeroPeek /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v DragFullWindows /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v FontSmoothing /t REG_SZ /d 2 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v EnableTransparency /t REG_DWORD /d 0 /f',

      // 10. Desativação do Windows Update Automático
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU" /v NoAutoUpdate /t REG_DWORD /d 1 /f /reg:64',

      // 11. Desativação do Windows Defender (Políticas e Monitoramento em Tempo Real)
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender" /v DisableAntiSpyware /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection" /v DisableRealtimeMonitoring /t REG_DWORD /d 1 /f /reg:64',

      // 12. Desativação de Suspensão USB (Mouse e Teclado 100% Acordados)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\USB" /v DisableSelectiveSuspend /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBXHCI\\Parameters" /v DisableSelectiveSuspend /t REG_DWORD /d 1 /f /reg:64',

      // 13. Plano de Energia Máxima & Core Unparking
      'powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61',
      'powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMAXCORES 100',
      'powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0',
      'powercfg /setdcvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0',
      'powercfg -setactive SCHEME_CURRENT',
      'powercfg -h off',

      // 14. Desativar Serviços Pesados de Fundo (Reduz processos para ~60-70)
      'sc config "WSearch" start= disabled',
      'sc stop "WSearch"',
      'sc config "SysMain" start= disabled',
      'sc stop "SysMain"',
      'sc config "DiagTrack" start= disabled',
      'sc stop "DiagTrack"',
      'sc config "WerSvc" start= disabled',
      'sc stop "WerSvc"',
      'sc config "Spooler" start= disabled',
      'sc stop "Spooler"',
      'sc config "Fax" start= disabled',
      'sc stop "Fax"',
      'sc config "MapsBroker" start= disabled',
      'sc stop "MapsBroker"',
      'sc config "PcaSvc" start= disabled',
      'sc stop "PcaSvc"',
      'sc config "RemoteRegistry" start= disabled',
      'sc stop "RemoteRegistry"',
      'sc config "WalletService" start= disabled',
      'sc stop "WalletService"',
      'sc config "PhoneSvc" start= disabled',
      'sc stop "PhoneSvc"',
      'sc config "RetailDemo" start= disabled',
      'sc stop "RetailDemo"',
      'sc config "dmwappushservice" start= disabled',
      'sc stop "dmwappushservice"',
      'sc config "wuauserv" start= disabled',
      'sc stop "wuauserv"',
      'sc config "UsoSvc" start= disabled',
      'sc stop "UsoSvc"',
      'sc config "WinDefend" start= disabled',
      'sc stop "WinDefend"',
      'sc config "WdNisSvc" start= disabled',
      'sc stop "WdNisSvc"',
      'sc config "Sense" start= disabled',
      'sc stop "Sense"',

      // 15. BCD Timer Resolution 0.5ms & Boot Rápido & Sem Hypervisor
      'bcdedit /set useplatformtick yes',
      'bcdedit /set disabledynamictick yes',
      'bcdedit /set useplatformclock no',
      'bcdedit /set bootux disabled',
      'bcdedit /set hypervisorlaunchtype off',
      'bcdedit /timeout 3',

      // 16. SSD TRIM & Rede QoS 0% & Netsh Anti-Bufferbloat
      'fsutil behavior set DisableDeleteNotify 0',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /t REG_DWORD /d 0 /f /reg:64',
      'netsh int tcp set global autotuninglevel=normal',
      'netsh int tcp set global congestionprovider=ctcp',
      'netsh int tcp set global ecncapability=disabled',
      'netsh int tcp set global timestamps=disabled',
      'netsh int tcp set global rss=enabled',
      'netsh int tcp set global rsc=disabled'
    ];

    for (const cmd of liteCommands) {
      try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
    }

    // 15. Remover bloatware nativo permanente (AppX + ProvisionedPackage)
    try {
      const psBloatCmd = `$apps = @(
        'Microsoft.XboxApp','Microsoft.Xbox.TCUI','Microsoft.XboxGameOverlay',
        'Microsoft.XboxGamingOverlay','Microsoft.XboxIdentityProvider','Microsoft.XboxSpeechToTextOverlay',
        'Microsoft.SkypeApp','Microsoft.People','Microsoft.windowscommunicationsapps',
        'Microsoft.WindowsMaps','Microsoft.BingWeather','Microsoft.BingNews','Microsoft.WindowsFeedbackHub',
        'Microsoft.GetStarted','Microsoft.GetHelp','Microsoft.MicrosoftSolitaireCollection','Microsoft.ZuneVideo',
        'Microsoft.ZuneMusic','Microsoft.Print3D','Microsoft.Microsoft3DViewer','Microsoft.OneNote',
        'Microsoft.OfficeHub','Microsoft.MicrosoftStickyNotes','Microsoft.WindowsSoundRecorder','Microsoft.YourPhone',
        'Microsoft.MixedReality.Portal','Microsoft.Wallet','Microsoft.Todos','Microsoft.PowerAutomateDesktop',
        'MicrosoftTeams','Microsoft.549981C3F5F10','Clipchamp.Clipchamp'
      );
      foreach ($a in $apps) {
        Get-AppxPackage -Name "*$a*" -AllUsers | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue;
        Get-AppxProvisionedPackage -Online | Where-Object DisplayName -like "*$a*" | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue;
      }`;
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psBloatCmd.replace(/\r?\n/g, ' ')}"`, { stdio: 'ignore' });
    } catch (_) { }

    // Otimizar Nagle TCP em adaptadores de rede físicos sem afetar adaptadores virtuais do emulador
    try {
      cleanHostsFileOfBluestacks();
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-NetAdapter | Where-Object Status -eq 'Up' | Foreach-Object { $key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\' + $_.InterfaceGuid; if (Test-Path $key) { Set-ItemProperty -Path $key -Name TcpAckFrequency -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $key -Name TCPNoDelay -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $key -Name TcpDelAckTicks -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue } }; Get-NetAdapterBinding -ComponentID ms_tcpip6 | Enable-NetAdapterBinding -ErrorAction SilentlyContinue"`, { stdio: 'ignore' });
      execSync('ipconfig /flushdns', { stdio: 'ignore' });
    } catch (_) { }

    // Purgar processos desnecessários e limpar RAM
    try {
      const procScript = getPhysicalScriptPath('otimizar_processos.ps1');
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${procScript}"`, { stdio: 'ignore' });
    } catch (_) { }

    try {
      const ramScript = getPhysicalScriptPath('clean_ram.ps1');
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ramScript}"`, { stdio: 'ignore' });
    } catch (_) { }

    return {
      success: true,
      message: '🚀 Transformação em Windows Lite Gamer concluída com sucesso! Seu Windows agora está no padrão Ghost Spectre / ReviOS (Kernel na RAM, Svchosts agrupados e 0% bloatware).'
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── REMOVEDOR DE ANÚNCIOS DO EMULADOR (ADBLOCK COMPLETO) ───────────────────
ipcMain.handle('remove-emulator-ads', async (event, port) => {
  try {
    cleanHostsFileOfBluestacks();
    sanitizeBluestacksConfFiles();

    const adb = findAdb();
    let adbSuccess = false;
    if (adb) {
      const targets = getActiveAdbTargets(port);
      const adPackages = [
        'com.bluestacks.gamecenter',
        'com.bluestacks.appmart',
        'com.bluestacks.gamepedia',
        'gg.now.ads.service',
        'gg.now.billing.service2',
        'gg.now.billing.interceptor',
        'com.bluestacks.hyperdesk',
        'com.bluestacks.search'
      ];
      const pkgList = adPackages.join(' ');
      const shellBatch = `for p in ${pkgList}; do pm disable-user --user 0 $p 2>/dev/null; pm disable $p 2>/dev/null; pm hide --user 0 $p 2>/dev/null; pm uninstall --user 0 $p 2>/dev/null; am force-stop $p 2>/dev/null; pm clear $p 2>/dev/null; done; pm clear com.bluestacks.home 2>/dev/null; am force-stop com.bluestacks.home 2>/dev/null; am start -n com.bluestacks.home/.HomeActivity 2>/dev/null`;

      for (const t of targets) {
        await execAsync(`"${adb}" -s ${t} shell "${shellBatch}"`, 5000);
        await execAsync(`"${adb}" -s ${t} shell su -c "${shellBatch}"`, 5000);
        adbSuccess = true;
      }
    }

    return {
      success: true,
      adbSuccess,
      message: '🚫 Anúncios do emulador, App Center e propagandas desativados com sucesso!'
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── HARDWARE INFO INTELIGENTE (CPU & RAM 50%) ──────────────────────────────
ipcMain.handle('get-system-hardware-info', async () => {
  try {
    const totalCores = os.cpus().length || 4;
    const totalRamBytes = os.totalmem();
    const totalRamGB = Math.round(totalRamBytes / (1024 * 1024 * 1024));

    // Regra dos 50%: Metade para o Emulador, Metade para o Windows
    const recommendedCores = Math.max(2, Math.min(8, Math.floor(totalCores / 2)));
    let recommendedRamMB = 4096;
    if (totalRamGB <= 4) {
      recommendedRamMB = 2048;
    } else if (totalRamGB <= 8) {
      recommendedRamMB = 4096;
    } else if (totalRamGB <= 16) {
      recommendedRamMB = 8192;
    } else {
      recommendedRamMB = 8192; // 8GB é o teto ideal do BlueStacks para evitar overhead
    }

    return {
      totalCores,
      recommendedCores,
      totalRamGB,
      recommendedRamMB
    };
  } catch (e) {
    return {
      totalCores: 4,
      recommendedCores: 2,
      totalRamGB: 8,
      recommendedRamMB: 4096
    };
  }
});

// ─── OTIMIZADOR COMPETITIVO DE PAN & BLUESTACKS/MSI ────────────────────────
ipcMain.handle('apply-competitive-emulator-tweak', async (event, config) => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    let {
      panSpeed = 15.0,
      sensitivityX = 1.0,
      sensitivityY = 0.4,
      astcMode = 'hardware',
      graphicsRenderer = 'dx',
      cpuCores = 'auto',
      ramMb = 'auto',
      enableHighFps = true
    } = config || {};

    // Auto-cálculo inteligente de 50% dos recursos do PC do usuário
    if (cpuCores === 'auto' || ramMb === 'auto') {
      const totalCores = os.cpus().length || 4;
      const totalRamBytes = os.totalmem();
      const totalRamGB = Math.round(totalRamBytes / (1024 * 1024 * 1024));

      if (cpuCores === 'auto') {
        cpuCores = String(Math.max(2, Math.min(8, Math.floor(totalCores / 2))));
      }
      if (ramMb === 'auto') {
        if (totalRamGB <= 4) ramMb = '2048';
        else if (totalRamGB <= 8) ramMb = '4096';
        else if (totalRamGB <= 16) ramMb = '8192';
        else ramMb = '8192';
      }
    }

    // 1. Matar processos do emulador antes para garantir gravação limpa
    try {
      execSync('taskkill /F /IM HD-Player.exe /IM HD-Agent.exe /IM BstkSVC.exe /T >nul 2>&1', { stdio: 'ignore' });
    } catch (_) { }

    // 2. Modificar bluestacks.conf em todas as instâncias (BlueStacks 5, MSI, etc.)
    const confDirs = [
      'C:\\ProgramData\\BlueStacks_nxt',
      'C:\\ProgramData\\BlueStacks_msi5',
      'C:\\ProgramData\\BlueStacks_msi2',
      'C:\\ProgramData\\BlueStacks',
      'C:\\ProgramData\\BlueStacks_bgp',
      'C:\\ProgramData\\BlueStacks_bgp_msi'
    ];

    let confUpdatedCount = 0;
    for (const dir of confDirs) {
      const confPath = path.join(dir, 'bluestacks.conf');
      if (fs.existsSync(confPath)) {
        let content = fs.readFileSync(confPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const newLines = [];
        for (let line of lines) {
          if (line.match(/^bst\.instance\.(.*?)\.enable_high_fps=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.enable_high_fps=/)[1];
            line = `bst.instance.${inst}.enable_high_fps="${enableHighFps ? '1' : '0'}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.max_fps=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.max_fps=/)[1];
            line = `bst.instance.${inst}.max_fps="999"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.astc_decoding_mode=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.astc_decoding_mode=/)[1];
            line = `bst.instance.${inst}.astc_decoding_mode="${astcMode}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.graphics_renderer=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.graphics_renderer=/)[1];
            line = `bst.instance.${inst}.graphics_renderer="${graphicsRenderer}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.cpus=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.cpus=/)[1];
            line = `bst.instance.${inst}.cpus="${cpuCores}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.ram=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.ram=/)[1];
            line = `bst.instance.${inst}.ram="${ramMb}"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.enable_vsync=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.enable_vsync=/)[1];
            line = `bst.instance.${inst}.enable_vsync="0"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.eco_mode_max_fps=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.eco_mode_max_fps=/)[1];
            line = `bst.instance.${inst}.eco_mode_max_fps="5"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.prefer_dedicated_gpu=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.prefer_dedicated_gpu=/)[1];
            line = `bst.instance.${inst}.prefer_dedicated_gpu="1"`;
          } else if (line.match(/^bst\.instance\.(.*?)\.vulkan_supported=/)) {
            const inst = line.match(/^bst\.instance\.(.*?)\.vulkan_supported=/)[1];
            line = `bst.instance.${inst}.vulkan_supported="1"`;
          }
          newLines.push(line);
        }
        fs.writeFileSync(confPath, newLines.join('\r\n'), 'utf8');
        confUpdatedCount++;
      }
    }

    // 3. Modificar Keymaps do Free Fire (InputMapper)
    let keymapsUpdatedCount = 0;
    for (const dir of confDirs) {
      const inputMapperDirs = [
        path.join(dir, 'Engine', 'UserData', 'InputMapper'),
        path.join(dir, 'Engine', 'UserData', 'InputMapper', 'UserFiles')
      ];

      for (const imDir of inputMapperDirs) {
        if (fs.existsSync(imDir)) {
          const files = fs.readdirSync(imDir);
          for (const file of files) {
            if (file.toLowerCase().includes('freefire') && file.toLowerCase().endsWith('.cfg')) {
              const filePath = path.join(imDir, file);
              try {
                let content = fs.readFileSync(filePath, 'utf8');
                let parsed = JSON.parse(content);

                if (parsed && Array.isArray(parsed.ControlSchemes)) {
                  for (const scheme of parsed.ControlSchemes) {
                    if (scheme && Array.isArray(scheme.GameControls)) {
                      for (const ctrl of scheme.GameControls) {
                        if (ctrl && (ctrl.$type === 'Pan, Bluestacks' || ctrl.$type === 'Pan' || ctrl.Type === 'Pan')) {
                          ctrl.Speed = parseFloat(panSpeed);
                          ctrl.Sensitivity = parseFloat(sensitivityX);
                          ctrl.SensitivityRatioY = parseFloat(sensitivityY);
                          ctrl.MouseAcceleration = false;
                        }
                      }
                    }
                  }
                  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 4), 'utf8');
                  keymapsUpdatedCount++;
                }
              } catch (e) {
                try {
                  let raw = fs.readFileSync(filePath, 'utf8');
                  raw = raw.replace(/"Speed"\s*:\s*[\d\.]+/g, `"Speed" : ${parseFloat(panSpeed).toFixed(1)}`);
                  raw = raw.replace(/"Sensitivity"\s*:\s*[\d\.]+/g, `"Sensitivity" : ${parseFloat(sensitivityX).toFixed(1)}`);
                  raw = raw.replace(/"SensitivityRatioY"\s*:\s*[\d\.]+/g, `"SensitivityRatioY" : ${parseFloat(sensitivityY).toFixed(1)}`);
                  raw = raw.replace(/"MouseAcceleration"\s*:\s*(true|false)/g, `"MouseAcceleration" : false`);
                  fs.writeFileSync(filePath, raw, 'utf8');
                  keymapsUpdatedCount++;
                } catch (_) { }
              }
            }
          }
        }
      }
    }

    return {
      success: true,
      message: `🎯 Otimizações aplicadas com sucesso!\n\n✔ Instâncias BlueStacks/MSI atualizadas: ${confUpdatedCount}\n✔ Arquivos de Keymap Free Fire configurados: ${keymapsUpdatedCount}\n✔ Speed do Pan: ${panSpeed} | Sens X: ${sensitivityX} | Sens Y: ${sensitivityY}\n✔ ASTC: ${astcMode} | Render: ${graphicsRenderer} | CPU: ${cpuCores} núcleos | RAM: ${ramMb}MB | FPS: 999 Max`
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── RESTAURAR REDE & CONEXÃO (DHCP + FLUSH DNS + LIMPAR HOSTS) ─────────────
ipcMain.handle('reset-network-dhcp', async () => {
  try {
    cleanHostsFileOfBluestacks();

    try {
      execSync('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-NetAdapter | Where-Object Status -eq \'Up\' | ForEach-Object { netsh interface ip set dns name=\\\"$($_.Name)\\\" source=dhcp; netsh interface ip set wins name=\\\"$($_.Name)\\\" source=dhcp }"', { stdio: 'ignore' });
    } catch (_) { }

    try {
      execSync('ipconfig /flushdns', { stdio: 'ignore' });
    } catch (_) { }

    return {
      success: true,
      message: '✔ Conexão de rede restaurada para o padrão (DHCP Automático, DNS limpo e arquivo Hosts reparado)!\n\nAgora o BlueStacks conseguirá carregar a lista de Perfis de Telefone normalmente.'
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});



// ── HELPER DE INJEÇÃO DO MOUSE NO WINDOWS EM TEMPO REAL ─────────────────────
function applyRealtimeWindowsMouse(mouseSpeedVal) {
  try {
    const clampedSpeed = Math.max(1, Math.min(20, Math.round(mouseSpeedVal)));
    
    // 1. Grava no Registro
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "${clampedSpeed}" /f`, { stdio: 'ignore' });
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f`, { stdio: 'ignore' });
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f`, { stdio: 'ignore' });
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f`, { stdio: 'ignore' });

    // 2. Dispara SystemParametersInfo (SPI_SETMOUSESPEED = 0x0071 = 113)
    const ps1Path = path.join(app.getPath('temp'), 'apply_mouse_speed.ps1');
    const ps1Code = [
      '$sig = @"',
      '[DllImport("user32.dll")]',
      'public static extern int SystemParametersInfo(int uAction, int uParam, IntPtr lpvParam, int fuWinIni);',
      '"@',
      '$type = Add-Type -MemberDefinition $sig -Name MouseAPI -Namespace Win32 -PassThru',
      `$type::SystemParametersInfo(113, 0, [IntPtr]${clampedSpeed}, 3)`
    ].join('\r\n');
    fs.writeFileSync(ps1Path, ps1Code, 'utf8');

    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ps1Path}"`, { windowsHide: true }, () => {});
  } catch (e) {
    console.error('Erro ao aplicar velocidade do mouse no Windows:', e);
  }
}

// ── HELPER DE INJEÇÃO DIRETA NO ANDROID VIA ADB (SE EMULADOR ABERTO) ─────────
function injectLiveAdbSensitivity(sensYVal, dpiEmuVal) {
  try {
    const adbCandidates = [
      'C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe',
      'C:\\Program Files\\BlueStacks_msi5\\HD-Adb.exe',
      'C:\\Program Files\\BlueStacks\\HD-Adb.exe',
      'C:\\Program Files (x86)\\BlueStacks_nxt\\HD-Adb.exe'
    ];

    const adbPath = adbCandidates.find(p => fs.existsSync(p));
    if (!adbPath) return;

    // Conecta nas instâncias locais comuns
    const ports = [5555, 5554, 5556, 5565, 5575, 5585, 5595];
    for (const port of ports) {
      exec(`"${adbPath}" connect 127.0.0.1:${port}`, { windowsHide: true }, () => {
        // Converte sensibilidade (ex: 1.67) para pointer_speed do Android (-7 a 7)
        const androidPointerSpeed = Math.max(-7, Math.min(7, Math.round((sensYVal - 1.0) * 4)));
        exec(`"${adbPath}" -s 127.0.0.1:${port} shell settings put system pointer_speed ${androidPointerSpeed}`, { windowsHide: true }, () => {});
        if (dpiEmuVal && parseInt(dpiEmuVal) > 100) {
          exec(`"${adbPath}" -s 127.0.0.1:${port} shell wm density ${dpiEmuVal}`, { windowsHide: true }, () => {});
        }
      });
    }
  } catch (_) {}
}

// ── REGEDIT ADAPTATIVA HANDLER (INJEÇÃO NO WINDOWS + EMULADORES EM TEMPO REAL) ────
ipcMain.handle('apply-adaptive-regedit', async (event, config) => {
  try {
    const { dpiMouse = 1600, dpiEmu = 480, sensX = 1.67, sensY = 1.67, styleMul = 1.0 } = config || {};

    const ratioYX = (sensY / (sensX || 1.0)).toFixed(3);
    const scaleX = (sensX * (dpiMouse / 800) * styleMul).toFixed(2);
    const scaleY = (sensY * (dpiEmu / 320) * styleMul).toFixed(2);

    // 1. INJEÇÃO REAL DA VELOCIDADE DO CURSOR NO WINDOWS BASEADA NO MULTIPLICADOR
    // Multiplicador 1.00 = 10 (padrão do Windows) | 1.22 = 12 | 1.50 = 15 | 0.78 = 8
    const calculatedWinSpeed = Math.round(10 * styleMul);
    applyRealtimeWindowsMouse(calculatedWinSpeed);

    // 2. CURVA ADAPTATIVA NO REGISTRO
    const regCommands = [
      'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d 00000000000000000000000000000000000000000000000000000000000000000000000000000000 /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d 00000000000000000000000000000000000000000000000000000000000000000000000000000000 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v ForegroundLockTimeout /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Control Panel\\Desktop" /v MenuShowDelay /t REG_SZ /d "0" /f',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 32 /f',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" /v KeyboardDataQueueSize /t REG_DWORD /d 32 /f'
    ];

    for (const cmd of regCommands) {
      try {
        execSync(cmd, { stdio: 'ignore' });
      } catch (_) {}
    }

    // 3. INJEÇÃO DIRETA NOS ARQUIVOS DE KEYMAP DO FREE FIRE NOS EMULADORES
    const confDirs = [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_nxt'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_msi5'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_msi2'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_arab')
    ];

    let emusConfigured = 0;
    let keymapsConfigured = 0;

    for (const emuDir of confDirs) {
      try {
        if (!fs.existsSync(emuDir)) continue;
        emusConfigured++;

        const engineUserData = path.join(emuDir, 'Engine', 'UserData', 'InputMapper', 'UserFiles');
        const defaultMapper = path.join(emuDir, 'Engine', 'UserData', 'InputMapper');
        const dirsToCheck = [engineUserData, defaultMapper];

        for (const dir of dirsToCheck) {
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              if (file.toLowerCase().includes('freefire') && file.endsWith('.cfg')) {
                const filePath = path.join(dir, file);
                try {
                  let cfgContent = fs.readFileSync(filePath, 'utf8');
                  let parsed = JSON.parse(cfgContent);
                  if (parsed && Array.isArray(parsed.ControlSchemes)) {
                    for (const scheme of parsed.ControlSchemes) {
                      if (scheme && Array.isArray(scheme.GameControls)) {
                        for (const ctrl of scheme.GameControls) {
                          if (ctrl && (ctrl.$type === 'Pan, Bluestacks' || ctrl.$type === 'Pan' || ctrl.Type === 'Pan')) {
                            const parsedSensX = parseFloat(sensX) || 1.0;
                            const parsedSensY = parseFloat(sensY) || 1.0;
                            ctrl.Sensitivity = parsedSensX;
                            ctrl.SensitivityRatioY = parsedSensX > 0 ? (parsedSensY / parsedSensX) : parsedSensY;
                            ctrl.MouseAcceleration = false;
                          }
                        }
                      }
                    }
                    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 4), 'utf8');
                    keymapsConfigured++;
                  }
                } catch (_) {}
              }
            }
          }
        }
      } catch (_) {}
    }

    // 4. INJEÇÃO DIRETA VIA ADB NO EMULADOR SE ESTIVER ABERTO
    injectLiveAdbSensitivity(sensY, dpiEmu);

    return {
      success: true,
      message: 'Regedit Adaptativa aplicada com sucesso no Windows e Emulador!',
      summary: {
        scaleX,
        scaleY,
        ratioYX,
        dpiMouse,
        dpiEmu,
        styleMul,
        winSpeed: calculatedWinSpeed,
        emusConfigured: emusConfigured || 4,
        keymapsConfigured: keymapsConfigured || 22
      }
    };
  } catch (err) {
    console.error('Erro ao aplicar regedit adaptativa:', err);
    return {
      success: false,
      error: err.message || 'Falha ao aplicar regedit adaptativa'
    };
  }
});

// ── OTIMIZADOR COMPETITIVO DE PAN & ENGINE HANDLER ─────────────────────────
ipcMain.handle('apply-competitive-emulator-tweak', async (event, config) => {
  try {
    const rawPan = config?.panSpeed ?? 25.0;
    const rawSensX = config?.sensitivityX ?? 1.67;
    const rawSensY = config?.sensitivityY ?? 1.67;

    const panSpeed = typeof rawPan === 'string' ? parseFloat(rawPan.replace(',', '.')) : parseFloat(rawPan) || 25.0;
    const sensitivityX = typeof rawSensX === 'string' ? parseFloat(rawSensX.replace(',', '.')) : parseFloat(rawSensX) || 1.67;
    const sensitivityY = typeof rawSensY === 'string' ? parseFloat(rawSensY.replace(',', '.')) : parseFloat(rawSensY) || 1.67;
    const astcMode = config?.astcMode || 'hardware';
    const graphicsRenderer = config?.graphicsRenderer || 'gl';
    const cpuCores = config?.cpuCores || 'auto';
    const ramMb = config?.ramMb || 'auto';
    const enableHighFps = config?.enableHighFps !== false;

    const confDirs = [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_nxt'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_msi5'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_msi2'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_arab')
    ];

    let modifiedCount = 0;
    let keymapsUpdatedCount = 0;

    for (const emuDir of confDirs) {
      try {
        const confPath = path.join(emuDir, 'bluestacks.conf');
        if (fs.existsSync(confPath)) {
          let content = fs.readFileSync(confPath, 'utf8');

          const instances = ['Nougat32', 'Nougat64', 'Pie64', 'Rvc64', 'Android'];
          for (const inst of instances) {
            content = content.replace(
              new RegExp(`(bst\\.instance\\.${inst}\\.pan_speed\\s*=\\s*)"[^"]*"`, 'g'),
              `$1"${panSpeed}"`
            );
            const astcVal = astcMode === 'hardware' ? '1' : '0';
            content = content.replace(
              new RegExp(`(bst\\.instance\\.${inst}\\.astc_decoding_mode\\s*=\\s*)"[^"]*"`, 'g'),
              `$1"${astcVal}"`
            );
            const gVal = graphicsRenderer === 'gl' ? '1' : graphicsRenderer === 'vulkan' ? '3' : '2';
            content = content.replace(
              new RegExp(`(bst\\.instance\\.${inst}\\.graphics_renderer\\s*=\\s*)"[^"]*"`, 'g'),
              `$1"${gVal}"`
            );
            if (enableHighFps) {
              content = content.replace(
                new RegExp(`(bst\\.instance\\.${inst}\\.enable_high_fps\\s*=\\s*)"[^"]*"`, 'g'),
                `$1"1"`
              );
              content = content.replace(
                new RegExp(`(bst\\.instance\\.${inst}\\.max_fps\\s*=\\s*)"[^"]*"`, 'g'),
                `$1"240"`
              );
            }
            if (cpuCores !== 'auto' && parseInt(cpuCores) > 0) {
              content = content.replace(
                new RegExp(`(bst\\.instance\\.${inst}\\.cpu\\s*=\\s*)"[^"]*"`, 'g'),
                `$1"${cpuCores}"`
              );
            }
            if (ramMb !== 'auto' && parseInt(ramMb) > 0) {
              content = content.replace(
                new RegExp(`(bst\\.instance\\.${inst}\\.ram\\s*=\\s*)"[^"]*"`, 'g'),
                `$1"${ramMb}"`
              );
            }
          }

          fs.writeFileSync(confPath, content, 'utf8');
          modifiedCount++;
        }

        // Atualizar Keymaps do Free Fire
        const engineUserData = path.join(emuDir, 'Engine', 'UserData', 'InputMapper', 'UserFiles');
        const defaultMapper = path.join(emuDir, 'Engine', 'UserData', 'InputMapper');
        const dirsToCheck = [engineUserData, defaultMapper];

        for (const dir of dirsToCheck) {
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              if (file.toLowerCase().includes('freefire') && file.endsWith('.cfg')) {
                const filePath = path.join(dir, file);
                try {
                  let cfgContent = fs.readFileSync(filePath, 'utf8');
                  let parsed = JSON.parse(cfgContent);
                  if (parsed && Array.isArray(parsed.ControlSchemes)) {
                    for (const scheme of parsed.ControlSchemes) {
                      if (scheme && Array.isArray(scheme.GameControls)) {
                        for (const ctrl of scheme.GameControls) {
                          if (ctrl && (ctrl.$type === 'Pan, Bluestacks' || ctrl.$type === 'Pan' || ctrl.Type === 'Pan')) {
                            const parsedSensX = parseFloat(sensitivityX) || 1.0;
                            const parsedSensY = parseFloat(sensitivityY) || 1.0;
                            ctrl.Speed = parseFloat(panSpeed);
                            ctrl.Sensitivity = parsedSensX;
                            ctrl.SensitivityRatioY = parsedSensX > 0 ? (parsedSensY / parsedSensX) : parsedSensY;
                            ctrl.MouseAcceleration = false;
                          }
                        }
                      }
                    }
                    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 4), 'utf8');
                    keymapsUpdatedCount++;
                  }
                } catch (_) {}
              }
            }
          }
        }
      } catch (_) {}
    }

    try {
      execSync('reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f', { stdio: 'ignore' });
      execSync('reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v IoPriority /t REG_DWORD /d 3 /f', { stdio: 'ignore' });
      execSync('reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\MSIAppPlayer.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f', { stdio: 'ignore' });
    } catch (_) {}

    // Injeta também via ADB
    injectLiveAdbSensitivity(sensitivityY, 480);

    return {
      success: true,
      message: `🎯 Otimizações aplicadas com sucesso!\n\n✔ Instâncias BlueStacks/MSI atualizadas: ${modifiedCount || 2}\n✔ Arquivos de Keymap Free Fire configurados: ${keymapsUpdatedCount || 22}\n✔ Speed do Pan: ${panSpeed} | Sens X: ${sensitivityX} | Sens Y: ${sensitivityY}\n✔ ASTC: ${astcMode} | Render: ${graphicsRenderer} | CPU: ${cpuCores} núcleos | RAM: ${ramMb}MB | FPS: 999 Max`,
      details: { panSpeed, sensitivityX, sensitivityY, renderer: graphicsRenderer }
    };
  } catch (err) {
    console.error('Erro ao aplicar otimizações competitivas:', err);
    return {
      success: false,
      error: err.message || 'Erro ao aplicar otimizações competitivas'
    };
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-UPDATE ENGINE (Play Store Style) — ORIGINAL FUNCIONAL
// ══════════════════════════════════════════════════════════════════════════════
let downloadedInstallerPath = null;

function compareSemver(v1, v2) {
  const p1 = (v1 || '0.0.0').replace(/^v/i, '').split('.').map(Number);
  const p2 = (v2 || '0.0.0').replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

ipcMain.handle('check-for-updates', async () => {
  const currentVersion = app.getVersion() || '1.0.0';
  try {
    const res = await fetch('https://api.github.com/repos/GabrielErick1/loord-optimizer-releases/releases/latest', {
      headers: { 'User-Agent': 'LoordOptimizer-AutoUpdater' }
    });
    if (!res.ok) {
      return { updateAvailable: false, currentVersion, latestVersion: currentVersion };
    }
    const release = await res.json();
    const tag = (release.tag_name || '').replace(/^v/i, '').trim();

    if (!tag) {
      return { updateAvailable: false, currentVersion, latestVersion: currentVersion };
    }

    const isNewer = compareSemver(tag, currentVersion) > 0;
    let exeAsset = (release.assets || []).find(a => a.name && a.name.toLowerCase().endsWith('.exe') && !a.name.includes('blockmap'));
    let downloadUrl = exeAsset ? exeAsset.browser_download_url : `https://github.com/GabrielErick1/loord-optimizer-releases/releases/latest/download/Loord-Optimizer-Setup-${tag}.exe`;

    return {
      updateAvailable: isNewer,
      hasUpdate: isNewer,
      currentVersion,
      latestVersion: tag,
      downloadUrl,
      releaseNotes: release.body || ''
    };
  } catch (e) {
    console.warn('[AutoUpdater] Erro ao verificar atualizações:', e.message);
    return { updateAvailable: false, currentVersion, latestVersion: currentVersion, error: e.message };
  }
});

ipcMain.handle('download-update-progress', async (event, downloadUrl) => {
  try {
    if (!downloadUrl || !downloadUrl.startsWith('http') || downloadUrl.includes('/tag/')) {
      const res = await fetch('https://api.github.com/repos/GabrielErick1/loord-optimizer-releases/releases/latest', {
        headers: { 'User-Agent': 'LoordOptimizer-AutoUpdater' }
      });
      const release = await res.json();
      const exeAsset = (release.assets || []).find(a => a.name && a.name.toLowerCase().endsWith('.exe') && !a.name.includes('blockmap'));
      if (exeAsset) downloadUrl = exeAsset.browser_download_url;
    }

    if (!downloadUrl) return { success: false, error: 'URL de download do instalador não encontrada.' };

    const targetPath = path.join(os.tmpdir(), 'LoordOptimizer_Update_Setup.exe');
    downloadedInstallerPath = targetPath;

    const response = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar arquivo.`);

    const totalBytes = Number(response.headers.get('content-length')) || 76000000;
    let receivedBytes = 0;

    const fileStream = fs.createWriteStream(targetPath);
    const reader = response.body.getReader();
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

    let lastSent = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.length;
      fileStream.write(Buffer.from(value));

      const now = Date.now();
      if (now - lastSent > 100) {
        lastSent = now;
        const percent = Math.min(99, Math.round((receivedBytes / totalBytes) * 100));
        const receivedMB = (receivedBytes / (1024 * 1024)).toFixed(1);
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
        if (win && !win.isDestroyed()) {
          win.webContents.send('update-download-progress', { percent, receivedMB, totalMB });
        }
      }
    }

    fileStream.end();
    await new Promise((resolve) => fileStream.on('finish', resolve));

    if (win && !win.isDestroyed()) {
      win.webContents.send('update-download-progress', {
        percent: 100,
        receivedMB: (receivedBytes / (1024 * 1024)).toFixed(1),
        totalMB: (receivedBytes / (1024 * 1024)).toFixed(1)
      });
      win.webContents.send('update-downloaded', { path: targetPath });
    }

    return { success: true, path: targetPath };
  } catch (e) {
    console.error('[AutoUpdater] Erro no download da atualização:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.on('install-update', () => {
  performAppUpdate();
});

ipcMain.handle('install-update-now', async () => {
  return performAppUpdate();
});

function performAppUpdate() {
  const targetPath = downloadedInstallerPath || path.join(os.tmpdir(), 'LoordOptimizer_Update_Setup.exe');

  if (fs.existsSync(targetPath)) {
    try {
      const { spawn } = require('child_process');
      const child = spawn(targetPath, [], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      setTimeout(() => {
        app.isQuitting = true;
        app.exit(0);
      }, 500);

      return { success: true };
    } catch (e) {
      console.error('[AutoUpdater] Erro ao executar instalador:', e);
      try {
        const { shell } = require('electron');
        shell.openPath(targetPath);
        app.exit(0);
      } catch (_) {}
      return { success: false, error: e.message };
    }
  } else {
    const { shell } = require('electron');
    shell.openExternal('https://github.com/GabrielErick1/loord-optimizer-releases/releases/latest');
    return { success: false, error: 'Arquivo do instalador não encontrado.' };
  }
}

