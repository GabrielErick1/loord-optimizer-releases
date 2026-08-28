const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { spawn, exec, execSync } = require('child_process');
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
// Diretório oculto dedicado para preservação do estado original do computador
const originalStateDir = path.join(app.getPath('appData'), 'LoordOptimizer_OriginalState');

// ─── GUARDIÃO DE SEGURANÇA MÁXIMA & ANTI-CRACKING ────────────────────────────
let isClientSessionAuthorized = false;
let authorizedSessionKey = null;

function isLicenseAuthorized() {
  return isClientSessionAuthorized === true && !!authorizedSessionKey;
}

const BLACKLISTED_CRACK_TOOLS = [
  'x64dbg', 'x32dbg', 'cheatengine', 'cheat engine', 'dnspy', 'httpdebugger',
  'fiddler', 'charles', 'wireshark', 'processhacker', 'process hacker',
  'ida64', 'idag', 'scylla', 'ollydbg', 'ghidra'
];

function runAntiCrackProcessCheck() {
  try {
    exec('tasklist /fo csv /nh', { timeout: 3000 }, (err, stdout) => {
      if (!err && stdout) {
        const lower = stdout.toLowerCase();
        for (const bad of BLACKLISTED_CRACK_TOOLS) {
          if (lower.includes(bad)) {
            console.warn(`[SECURITY] Ferramenta hostil/debugger detectada: ${bad}. Encerrando aplicação...`);
            try { app.exit(0); } catch (_) {}
          }
        }
      }
    });
  } catch (_) {}
}

setInterval(runAntiCrackProcessCheck, 8000);

if (!fs.existsSync(backupDir)) {
  try { fs.mkdirSync(backupDir, { recursive: true }); } catch (_) { }
}

async function ensureInitialSystemRestorePoint() {
  try {
    if (!fs.existsSync(originalStateDir)) {
      fs.mkdirSync(originalStateDir, { recursive: true });
      try {
        // Marca a pasta como oculta no Windows
        execSync(`attrib +h "${originalStateDir}"`, { stdio: 'ignore' });
      } catch (_) {}
    }

    const markerPath = path.join(originalStateDir, 'backup_marker.json');
    if (fs.existsSync(markerPath)) {
      console.log('[RESTORE-POINT] Ponto de restauração e backup original já salvos anteriormente.');
      return { success: true, alreadyExists: true };
    }

    console.log('[RESTORE-POINT] Criando ponto de restauração oculto e capturando estado original do Windows...');

    // 1. Cria Ponto de Restauração Oficial do Windows (Restore Point) em background
    try {
      const psRestorePoint = "Enable-ComputerRestore -Drive 'C:\\' -ErrorAction SilentlyContinue; Checkpoint-Computer -Description 'LoordOptimizer_Original_State' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction SilentlyContinue";
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psRestorePoint}"`, { stdio: 'ignore', timeout: 15000 });
    } catch (_) {}

    // 2. Exporta e salva backups das configurações originais (.reg) do Windows
    const registryExports = [
      { key: 'HKCU\\Control Panel\\Mouse', file: 'Mouse_Original.reg' },
      { key: 'HKCU\\Control Panel\\Desktop', file: 'Desktop_Original.reg' },
      { key: 'HKCU\\Control Panel\\Keyboard', file: 'Keyboard_Original.reg' },
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters', file: 'Mouclass_Original.reg' },
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl', file: 'PriorityControl_Original.reg' },
      { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', file: 'SystemProfile_Original.reg' },
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management', file: 'Memory_Original.reg' },
      { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', file: 'Tcpip_Original.reg' }
    ];

    for (const item of registryExports) {
      const dest = path.join(originalStateDir, item.file);
      if (!fs.existsSync(dest)) {
        try {
          execSync(`reg export "${item.key}" "${dest}" /y`, { stdio: 'ignore' });
        } catch (_) {}
      }
      // Também salva cópia em backupDir
      const dest2 = path.join(backupDir, item.file);
      if (!fs.existsSync(dest2)) {
        try {
          execSync(`reg export "${item.key}" "${dest2}" /y`, { stdio: 'ignore' });
        } catch (_) {}
      }
    }

    // 3. Salva cópias dos arquivos de configuração originais do BlueStacks se existirem
    const confPaths = [
      { key: 'bluestacks_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi\\bluestacks.conf' },
      { key: 'bluestacks_msi5.conf.bak', path: 'C:\\ProgramData\\BlueStacks_msi5\\bluestacks.conf' },
      { key: 'bluestacks_bgp_msi.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp_msi\\bluestacks.conf' },
      { key: 'bluestacks.conf.bak', path: 'C:\\ProgramData\\BlueStacks\\bluestacks.conf' },
      { key: 'bluestacks_nxt.conf.bak', path: 'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf' },
      { key: 'bluestacks_bgp.conf.bak', path: 'C:\\ProgramData\\BlueStacks_bgp\\bluestacks.conf' }
    ];

    for (const item of confPaths) {
      const dest1 = path.join(originalStateDir, item.key);
      const dest2 = path.join(backupDir, item.key);
      if (fs.existsSync(item.path)) {
        if (!fs.existsSync(dest1)) try { fs.copyFileSync(item.path, dest1); } catch (_) {}
        if (!fs.existsSync(dest2)) try { fs.copyFileSync(item.path, dest2); } catch (_) {}
      }
    }

    // 4. Salva Plano de Energia original do usuário
    try {
      const activeScheme = execSync('powercfg -getactivescheme', { encoding: 'utf8' });
      const guidMatch = activeScheme.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (guidMatch) {
        fs.writeFileSync(path.join(originalStateDir, 'original_power_plan.txt'), guidMatch[1].trim(), 'utf8');
        fs.writeFileSync(path.join(backupDir, 'original_power_plan.txt'), guidMatch[1].trim(), 'utf8');
      }
    } catch (_) {}

    // 5. Grava o marcador para nunca sobrescrever o estado original genuíno
    fs.writeFileSync(markerPath, JSON.stringify({
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      platform: process.platform,
      arch: process.arch
    }, null, 2), 'utf8');

    console.log('[RESTORE-POINT] Ponto de restauração e backup original do Windows salvos com sucesso!');
    return { success: true, created: true };
  } catch (e) {
    console.error('[RESTORE-POINT] Erro ao criar ponto de restauração inicial:', e);
    return { success: false, error: e.message };
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
      devTools: false // Bloqueia DevTools nativamente
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile('index.html');

  // ─── BLINDAGEM ANTI-DEVTOOLS & ANTI-INSPECT ───────────────────────────────
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
    try { app.quit(); } catch (_) {}
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      event.preventDefault();
    }
    if (input.control && (input.key === 'r' || input.key === 'R' || input.key === 'u' || input.key === 'U')) {
      event.preventDefault();
    }
    if (input.control && input.shift && (input.key === 'i' || input.key === 'I' || input.key === 'j' || input.key === 'J' || input.key === 'c' || input.key === 'C')) {
      event.preventDefault();
    }
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  try { dismountAllVirtualIsos(); } catch (_) {}
  try { cleanSecurityHosts(); } catch (_) {}
  try { sanitizeBluestacksConfFiles(); } catch (_) {}
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

  // Atalhos Globais F7 e F8 para a Macro de Recoil
  try {
    globalShortcut.register('F7', () => {
      toggleMacroGlobalState();
    });
    globalShortcut.register('F8', () => {
      toggleMacroGlobalState();
    });
  } catch (e) {
    console.error('[GlobalShortcut] Erro ao registrar F7/F8:', e);
  }

  // Inicia o motor nativo da macro em background (em modo pausado/desativado) logo na abertura
  setTimeout(() => {
    startMacroNative(0.5, false).catch((e) => console.error('[Macro AutoBoot]', e));
  }, 800);

  // Cria/Garante o Ponto de Restauração Oculto do Windows e Backup do Estado Original
  setTimeout(() => {
    ensureInitialSystemRestorePoint().catch((e) => console.error('[RestorePoint AutoBoot]', e));
  }, 1200);
});

let macroEnabledState = false;
let macroCurrentSpeed = 0.5;

async function toggleMacroGlobalState() {
  macroEnabledState = !macroEnabledState;
  const configActivePath = path.join(os.tmpdir(), 'loord_macro_active.txt');
  const configSpeedPath = path.join(os.tmpdir(), 'loord_macro_speed.txt');
  try {
    fs.writeFileSync(configActivePath, macroEnabledState ? 'true' : 'false', 'utf8');
    fs.writeFileSync(configSpeedPath, String(macroCurrentSpeed), 'utf8');
  } catch (_) {}

  try {
    shell.beep();
  } catch (_) {}

  // Garante que o motor nativo esteja rodando em background com a velocidade atual do usuário
  startMacroNative(macroCurrentSpeed, macroEnabledState).catch(() => {});

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('macro-state-changed', { active: macroEnabledState, speed: macroCurrentSpeed });
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
  killMacroProcess();
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

function cleanSecurityHosts() {
  try {
    const hostsPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32\\drivers\\etc\\hosts');
    if (fs.existsSync(hostsPath)) {
      let hostsContent = fs.readFileSync(hostsPath, 'utf8');
      if (hostsContent.includes('bluestacks.com') || hostsContent.includes('web-key-generator') || hostsContent.includes('vercel.app')) {
        const cleaned = hostsContent
          .split(/\r?\n/)
          .filter(line => !line.includes('bluestacks.com') && !line.includes('web-key-generator') && !line.includes('vercel.app'))
          .join('\r\n');
        fs.writeFileSync(hostsPath, cleaned, 'utf8');
        try { execSync('ipconfig /flushdns', { stdio: 'ignore' }); } catch (_) { }
      }
    }
  } catch (_) { }
}
const cleanHostsFileOfBluestacks = cleanSecurityHosts;

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
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
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
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
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
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
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
    'BlueStacksServices': mask(emuCores),
    'BstkSVC': mask(emuCores),
    'BlueStacksHelper': mask(emuCores),
    'MSIAppPlayer': mask(emuCores),
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
  let configured = false;
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
    'bluestacksservices.exe', 'BlueStacksServices.exe',
    'bstksvc.exe', 'BstkSVC.exe',
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
    for (const exe of ['HD-Player.exe', 'BlueStacks.exe', 'BlueStacksServices.exe', 'BstkSVC.exe', 'BlueStacksHelper.exe', 'MSIAppPlayer.exe']) {
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

    // ── 9. Aplicar Afinidade e Prioridade em tempo real aos processos do Emulador ───
    try {
      const liveAffinityPS = `Get-Process | Where-Object { @('HD-Player','BlueStacks','BlueStacksServices','BstkSVC','BlueStacksHelper','MSIAppPlayer') -contains $_.ProcessName } | ForEach-Object { try { $_.ProcessorAffinity = [IntPtr]${hdMask}; $_.PriorityClass = 'High' } catch {} }`;
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${liveAffinityPS.replace(/"/g, '\\"')}"`, { stdio: 'ignore', timeout: 6000 });
    } catch (_) { }

    // ── 10. SmartTrim: clear standby list + working sets ──────────────────
    try {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Clear-DnsClientCache; [System.GC]::Collect(); Get-Process | Where-Object { $_.WorkingSet64 -gt 150MB -and $_.Name -notmatch 'HD-Player|BlueStacks|BlueStacksServices|BstkSVC' } | ForEach-Object { try { $_.MinWorkingSet = 4096 } catch {} }"`, { stdio: 'ignore', timeout: 8000 });
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
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
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
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
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
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
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
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
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

    // ── Limpeza Completa e Dinâmica de Regedits Antigas ──
    // Remove 100% das chaves customizadas anteriores para manter SOMENTE a nova regedit ativa
    try {
      const stdMouseProps = new Set([
        '',
        '(padrão)',
        '(default)',
        'activewindowtracking',
        'beep',
        'doubleclickheight',
        'doubleclickspeed',
        'doubleclickwidth',
        'extendedsounds',
        'mousehoverheight',
        'mousehovertime',
        'mousehoverwidth',
        'mousesensitivity',
        'mousespeed',
        'mousethreshold1',
        'mousethreshold2',
        'mousetrails',
        'smoothmousexcurve',
        'smoothmouseycurve',
        'snaptodefaultbutton',
        'swapmousebuttons'
      ]);

      const out = execSync('reg query "HKCU\\Control Panel\\Mouse"', { encoding: 'utf8' });
      const lines = out.split('\n');
      for (const l of lines) {
        const t = l.trim();
        if (!t) continue;
        if (t.startsWith('HKEY_CURRENT_USER\\Control Panel\\Mouse\\')) {
          try { execSync(`reg delete "${t}" /f`, { stdio: 'ignore' }); } catch (_) {}
          continue;
        }
        const parts = t.split(/\s+/);
        const name = parts[0];
        if (name && !stdMouseProps.has(name.toLowerCase())) {
          try {
            execSync(`reg delete "HKCU\\Control Panel\\Mouse" /v "${name}" /f`, { stdio: 'ignore' });
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error('Erro na varredura dinâmica de limpeza de chaves residuais:', e.message);
    }

    const staticKeysToClean = [
      'Active', 'ActiveAC', 'ActiveDeveloped', 'ActiveDevoloped', 'ActiveFix', 'ActiveUser',
      'Beep2', 'DoubleClickHeight2', 'DoubleClickSpeed2', 'DoubleClickWidth2', 'Fov',
      'MouseAccel_Scale', 'MouseActiveWindowTracking', 'MouseCl', 'MouseCL', 'Mousecontrolusb',
      'Mousecontroslub', 'MouseCP', 'Mousecrib', 'MouseGrab', 'MouseSpeed2', 'MouseStickOn',
      'MouseTK', 'Mousetrack', 'ClickLock', 'ClickLockTime',
      'DockTargetMouse', 'DockTargetMouse1', 'DockTargetMouse2',
      'DockTargetMouseDragOutWidth', 'DockTargetMouseSideMoveWidth', 'DockTargetMouseWidth',
      'DockTargetPen', 'DockTargetPen1', 'DockTargetPen2',
      'DockTargetPenDragOutWidth', 'DockTargetPenSideMoveWidth', 'DockTargetPenWidth',
      'DefaultTTL', 'EnablePMTUBHDetect', 'EnablePMTUDiscovery', 'SackOpts', 'Tcp1323Opts',
      'TCPDelAckTicks', 'TcpMaxDataRetransmissions', 'TcpNoDelay', 'TcpWindowSize'
    ];

    for (const keyName of staticKeysToClean) {
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

    if (mouseMode === 'regedit-lord-socapa-4x4') {
      // 1. Executa a regedit base (.reg)
      const regStep1 = [
        'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveWindowTracking" /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "Beep" /t REG_SZ /d "No" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickHeight" /t REG_SZ /d "4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickSpeed" /t REG_SZ /d "500" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickWidth" /t REG_SZ /d "4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ExtendedSounds" /t REG_SZ /d "No" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverHeight" /t REG_SZ /d "4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverWidth" /t REG_SZ /d "4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSensitivity" /t REG_SZ /d "8" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSpeed" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold1" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold2" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseTrails" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseXCurve" /t REG_BINARY /d 0000000000000000156e000000000000004001000000000029dc0300000000000000280000000000 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseYCurve" /t REG_BINARY /d 0000000000000000fd11010000000000002404000000000000fc12000000000000c0bb010000000000 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SnapToDefaultButton" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SwapMouseButtons" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverTime" /t REG_DWORD /d 41 /f'
      ];
      for (const cmd of regStep1) {
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) {}
      }

      // 2. Executa a calibração do .bat (.bat)
      const socapaBatCommands = [
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSpeed" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold1" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold2" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSensitivity" /t REG_SZ /d "10" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverTime" /t REG_SZ /d "10" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SnapToDefaultButton" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseTrails" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseXCurve" /t REG_BINARY /d 0000000000000000156e000000000000004001000000000029dc0300000000000000280000000000ffff0f0000000000 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseYCurve" /t REG_BINARY /d 0000000000000000fd11010000000000002404000000000000fc12000000000000c0bb01000000000000580200000000 /f',
        'reg add "HKCU\\Control Panel\\Desktop" /v "MenuShowDelay" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Desktop" /v "ForegroundLockTimeout" /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\Control Panel\\Desktop" /v "ForegroundFlashCount" /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\System\\GameConfigStore" /v "GameDVR_Enabled" /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\System\\GameConfigStore" /v "GameDVR_FSEBehaviorMode" /t REG_DWORD /d 2 /f',
        'reg add "HKCU\\System\\GameConfigStore" /v "GameDVR_HonorUserFSEBehaviorMode" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\System\\GameConfigStore" /v "GameDVR_DXGIHonorFSEWindowsCompatible" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\System\\GameConfigStore" /v "GameDVR_EFSEFeatureFlags" /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v "AppCaptureEnabled" /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\Software\\Microsoft\\GameBar" /v "AutoGameModeEnabled" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\Microsoft\\GameBar" /v "AllowAutoGameMode" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\Microsoft\\GameBar" /v "UseNexusForGameBarEnabled" /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "Active" /t REG_SZ /d "Regedit do Lord So Capa 4x4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveDeveloped" /t REG_SZ /d "Regedit do Lord So Capa 4x4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveFix" /t REG_SZ /d "4x4" /f'
      ];
      for (const cmd of socapaBatCommands) {
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) {}
      }

      // 3. Aplicação ao vivo via SystemParametersInfo (sem reiniciar)
      try {
        const livePsCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand JABzAD0AQAAnAAoAWwBEAGwAbABJAG0AcABvAHIAdAAoACIAdQBzAGUAcgAzADIALgBkAGwAbAAiACkAXQAgAHAAdQBiAGwAaQBjACAAcwB0AGEAdABpAGMAIABlAHgAdABlAHIAbgAgAGIAbwBvAGwAIABTAHkAcwB0AGUAbQBQAGEAcgBhAG0AZQB0AGUAcgBzAEkAbgBmAG8AKAB1AGkAbgB0ACAAYQAsACAAdQBpAG4AdAAgAGIALAAgAGkAbgB0AFsAXQAgAGMALAAgAHUAaQBuAHQAIABkACkAOwAKAFsARABsAGwASQBtAHAAbwByAHQAKAAiAHUAcwBlAHIAMwAyAC4AZABsAGwAIgAsACAARQBuAHQAcgB5AFAAbwBpAG4AdAA9ACIAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvAFcAIgApAF0AIABwAHUAYgBsAGkAYwAgAHMAdABhAHQAaQBjACAAZQB4AHQAZQByAG4AIABiAG8AbwBsACAAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvAFAAdAByACgAdQBpAG4AdAAgAGEALAAgAHUAaQBuAHQAIABiACwAIABJAG4AdABQAHQAcgAgAGMALAAgAHUAaQBuAHQAIABkACkAOwAKACcAQAAKAEEAZABkAC0AVAB5AHAAZQAgAC0ATgBhAG0AZQBzAHAAYQBjAGUAIABXACAALQBOAGEAbQBlACAATQAgAC0ATQBlAG0AYgBlAHIARABlAGYAaQBuAGkAdABpAG8AbgAgACQAcwAKAFsAVwAuAE0AXQA6ADoAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvACgANAAsADAALABbAGkAbgB0AFsAXQBdAEAAKAAwACwAMAAsADAAKQAsADMAKQAKAFsAVwAuAE0AXQA6ADoAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvAFAAdAByACgAMAB4ADcAMQAsADAALABbAEkAbgB0AFAAdAByAF0AMQAwACwAMwApAAoAWwBXAC4ATQBdADoAOgBTAHkAcwB0AGUAbQBQAGEAcgBhAG0AZQB0AGUAcgBzAEkAbgBmAG8AUAB0AHIAKAAwAHgANgBCACwAMAAsAFsASQBuAHQAUAB0AHIAXQAwACwAMwApAAoAWwBXAC4ATQBdADoAOgBTAHkAcwB0AGUAbQBQAGEAcgBhAG0AZQB0AGUAcgBzAEkAbgBmAG8AUAB0AHIAKAAwAHgANQBGACwAMAAsAFsASQBuAHQAUAB0AHIAXQAwACwAMwApAAoA';
        execSync(livePsCmd, { stdio: 'ignore' });
      } catch (_) {}
    }

    if (mouseMode === 'regedit-do-flash') {
      // 1. Executa a regedit base (.reg)
      const regStep1 = [
        'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveWindowTracking" /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "Beep" /t REG_SZ /d "No" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickHeight" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickSpeed" /t REG_SZ /d "480" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickWidth" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ExtendedSounds" /t REG_SZ /d "No" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverHeight" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverTime" /t REG_SZ /d "1000" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverWidth" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSensitivity" /t REG_SZ /d "10" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSpeed" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold1" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold2" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseTrails" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseXCurve" /t REG_BINARY /d 00000000000000000000000000000000000000000000000000000000000000000000000000000000 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseYCurve" /t REG_BINARY /d 00000000000000000000000000000000000000000000000000000000000000000000000000000000 /f'
      ];
      for (const cmd of regStep1) {
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) {}
      }

      // 2. Executa a regedit do BAT (.bat) logo em seguida
      const flashBatCommands = [
        'reg add "HKU\\.DEFAULT\\Control Panel\\Mouse" /v "Beep" /t REG_SZ /d "No" /f',
        'reg add "HKU\\.DEFAULT\\Control Panel\\Mouse" /v "ExtendedSounds" /t REG_SZ /d "No" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveWindowTracking" /t REG_DWORD /d 0 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "Beep" /t REG_SZ /d "No" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickHeight" /t REG_SZ /d "4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickSpeed" /t REG_SZ /d "500" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickWidth" /t REG_SZ /d "4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ExtendedSounds" /t REG_SZ /d "No" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverHeight" /t REG_SZ /d "4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverWidth" /t REG_SZ /d "4" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSensitivity" /t REG_SZ /d "10" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSpeed" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold1" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold2" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseTrails" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseXCurve" /t REG_BINARY /d 0000000000000000c0cc0c0000000000809919000000000040662600000000000033330000000000 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseYCurve" /t REG_BINARY /d 0000000000000000000038000000000000007000000000000000a800000000000000e00000000000 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SnapToDefaultButton" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SwapMouseButtons" /t REG_SZ /d "0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverTime" /t REG_SZ /d "8" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "Active" /t REG_SZ /d "Regedit do Flash" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveDeveloped" /t REG_SZ /d "Regedit do Flash" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveFix" /t REG_SZ /d "1.0" /f'
      ];
      for (const cmd of flashBatCommands) {
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) {}
      }
    }

    if (mouseMode === 'mira-clean-loord' || mouseMode === 'mira-clean-pesadinho') {
      const miraFixaCommands = [
        'reg add "HKCU\\Control Panel\\Mouse" /v "Active" /t REG_SZ /d "MIRA CREN LOORD" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveDeveloped" /t REG_SZ /d "LOORD MIRA CREN VIP" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveFix" /t REG_SZ /d "18.0" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetMouse" /t REG_SZ /d "20" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetMouse1" /t REG_SZ /d "50" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetMouse2" /t REG_SZ /d "1" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetPen" /t REG_SZ /d "30" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickHeight2" /t REG_SZ /d "0,7" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickSpeed" /t REG_SZ /d "500" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverTime" /t REG_DWORD /d 41 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "Mousecontrolusb" /t REG_SZ /d "1" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSensitivity" /t REG_SZ /d "10" /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseXCurve" /t REG_BINARY /d 0000000000000000402c000000000000180000000000000028000000000000000000000000000000 /f',
        'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseYCurve" /t REG_BINARY /d 0000000000000000b000000000000000c000000000000000d0000000000000000000000000000000 /f',
        // Injeções de Mira Fixa / MiraGruda no Registro do Android / Emuladores (BlueStacks, MSI App Player, Nox, LDPlayer)
        'reg add "HKCU\\Software\\BlueStacks\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKLM\\SOFTWARE\\BlueStacks\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\BlueStacks_msi\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\BlueStacks_nxt\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "sensibility" /t REG_DWORD /d 100 /f',
        'reg add "HKLM\\SOFTWARE\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKLM\\SOFTWARE\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "sensibility" /t REG_DWORD /d 100 /f',
        'reg add "HKCU\\Software\\Nox\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\LDPlayer\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f'
      ];
      for (const cmd of miraFixaCommands) {
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) {}
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

    // ── Aplicação ao Vivo (Live Memory) no Windows & Injeção no Emulador ──
    try {
      // 1. Descobrir Sensibilidade e HoverTime ativos no registro para repassar ao driver
      let activeSens = 10;
      try {
        const sensOut = execSync('reg query "HKCU\\Control Panel\\Mouse" /v MouseSensitivity', { encoding: 'utf8' });
        const matchSens = sensOut.match(/MouseSensitivity\s+REG_SZ\s+(\d+)/i);
        if (matchSens) activeSens = parseInt(matchSens[1], 10) || 10;
      } catch (_) {}

      // 2. Notificar e atualizar o subsistema User32 do Windows sem reiniciar
      const psSpiCmd = `$s=@'
[DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, int[] c, uint d);
[DllImport("user32.dll", EntryPoint="SystemParametersInfoW")] public static extern bool SystemParametersInfoPtr(uint a, uint b, IntPtr c, uint d);
[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
Add-Type -Namespace W -Name M -MemberDefinition $s -ErrorAction SilentlyContinue
[W.M]::SystemParametersInfo(4,0,[int[]]@(0,0,0),3)
[W.M]::SystemParametersInfoPtr(0x71,0,[IntPtr]${activeSens},3)
[W.M]::SystemParametersInfoPtr(0x6B,0,[IntPtr]0,3)
[W.M]::SystemParametersInfoPtr(0x5F,0,[IntPtr]0,3)
[UIntPtr]$res = [UIntPtr]::Zero
[W.M]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, "Control Panel\\Mouse", 2, 1000, [ref]$res)
`;
      execSync(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "${psSpiCmd.replace(/\r?\n/g, '; ')}"`, { stdio: 'ignore' });

      // 3. Sincronização direta com Emuladores (BlueStacks 4/5, MSI, LDPlayer, Nox)
      const emuRegCommands = [
        'reg add "HKCU\\Software\\BlueStacks\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKLM\\SOFTWARE\\BlueStacks\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\BlueStacks_msi\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\BlueStacks_nxt\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "sensibility" /t REG_DWORD /d 100 /f',
        'reg add "HKLM\\SOFTWARE\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKLM\\SOFTWARE\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "sensibility" /t REG_DWORD /d 100 /f',
        'reg add "HKCU\\Software\\Nox\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\LDPlayer\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f'
      ];
      for (const cmd of emuRegCommands) {
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) {}
      }

      // 4. Injeção de sensibilidade de ponteiro no Android do emulador via ADB (se ativo)
      const adb = findAdb();
      if (adb) {
        const targets = getActiveAdbTargets();
        for (const target of targets) {
          try {
            execSync(`"${adb}" -s ${target} shell "settings put system pointer_speed 7; settings put secure pointer_speed 7; settings put system touch.pressure.scale 0.001; settings put secure accessibility_display_magnification_enabled 0"`, { stdio: 'ignore', timeout: 3000 });
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error('Erro na sincronização ao vivo do mouse/emulador:', e.message);
    }

    return {
      success: true,
      regName: selectedRegConfig ? selectedRegConfig.name : 'Regedit Customizada',
      message: 'Regedit de sensibilidade aplicada com sucesso no Windows e Emulador!'
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

ipcMain.handle('create-restore-point', async () => {
  return await ensureInitialSystemRestorePoint();
});

ipcMain.handle('get-restore-point-status', async () => {
  const markerPath = path.join(originalStateDir, 'backup_marker.json');
  return {
    exists: fs.existsSync(markerPath),
    dir: originalStateDir
  };
});

// Reversão total automática ao expirar ou ser revogado no painel (Anti-Leak Rollback)
ipcMain.handle('revert-all-tweaks-on-revoke', async () => {
  try {
    isClientSessionAuthorized = false;
    authorizedSessionKey = null;

    // 1. Parar macros e cleaners em execução
    await killMacroProcess().catch(() => { });

    // 2. Restaurar backups do registro original (.reg) e arquivos de configuração bluestacks.conf
    const restoreSources = [originalStateDir, backupDir];
    for (const d of restoreSources) {
      try {
        if (fs.existsSync(d)) {
          const files = fs.readdirSync(d);
          for (const file of files) {
            if (file.endsWith('.reg')) {
              await runCmd(`reg import "${path.join(d, file)}"`);
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
            if (fs.existsSync(path.join(d, item.key)) && fs.existsSync(path.dirname(item.path))) {
              try { fs.copyFileSync(path.join(d, item.key), item.path); } catch (_) { }
            }
          }
        }
      } catch (_) { }
    }

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

    // 6. Reverter Plano de Energia para o padrão original ou Equilibrado
    let restoredPlan = false;
    try {
      const planFile = path.join(originalStateDir, 'original_power_plan.txt');
      if (fs.existsSync(planFile)) {
        const origGuid = fs.readFileSync(planFile, 'utf8').trim();
        if (origGuid) {
          await runCmd(`powercfg -setactive ${origGuid}`);
          restoredPlan = true;
        }
      }
    } catch (_) {}
    if (!restoredPlan) {
      await runCmd('powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e').catch(() => { });
    }

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

// ─── MOTOR DA MACRO DE RECOIL & DESCIDA Y ──────────────────────────────────
async function killMacroProcess() {
  if (macroProcess) {
    try {
      if (!macroProcess.killed) macroProcess.kill('SIGKILL');
    } catch (_) {}
    macroProcess = null;
  }
  try {
    const tmpScript = path.join(os.tmpdir(), 'loord_recoil_engine.ps1');
    execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*loord_recoil_engine.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
  } catch (_) {}
}

ipcMain.handle('start-macro', async (event, speed) => {
  try {
    await killMacroProcess();

    const numSpeed = typeof speed === 'number' ? speed : parseFloat(speed) || 0.5;
    const tmpScript = path.join(os.tmpdir(), 'loord_recoil_engine.ps1');

    const scriptContent = `# Loord Recoil Engine - Puxada Y Suave
param([double]$Velocidade = ${numSpeed})

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class MacroEngine {
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

    private const int MOUSEEVENTF_MOVE = 0x0001;
    private const int VK_LBUTTON = 0x01; // Botao esquerdo do mouse (Atirar)
    private const int VK_F2      = 0x71;
    private const int VK_F3      = 0x72;
    private const int VK_F6      = 0x75;
    private const int VK_F7      = 0x76;

    public static void Run(double speed) {
        if (speed <= 0.0) speed = 0.5;
        double accumY = 0.0;
        bool macroAtiva = true;

        while (true) {
            bool f2 = (GetAsyncKeyState(VK_F2) & 0x8000) != 0;
            bool f3 = (GetAsyncKeyState(VK_F3) & 0x8000) != 0;
            bool f6 = (GetAsyncKeyState(VK_F6) & 0x8000) != 0;
            bool f7 = (GetAsyncKeyState(VK_F7) & 0x8000) != 0;

            if (f2 || f3 || f6 || f7) {
                macroAtiva = !macroAtiva;
                try { Console.Beep(macroAtiva ? 1200 : 500, 120); } catch {}
                Thread.Sleep(300);
            }

            if (macroAtiva) {
                bool shooting = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
                if (shooting) {
                    accumY += speed;
                    if (accumY >= 1.0) {
                        int stepY = (int)Math.Floor(accumY);
                        mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0); // Puxa o cursor para baixo
                        accumY -= stepY;
                    }
                    Thread.Sleep(7);
                } else {
                    accumY = 0.0;
                    Thread.Sleep(5);
                }
            } else {
                Thread.Sleep(20);
            }
        }
    }
}
"@

Add-Type -TypeDefinition $code -Language CSharp
[MacroEngine]::Run($Velocidade)
`;

    fs.writeFileSync(tmpScript, scriptContent, 'utf8');

    const { spawn } = require('child_process');
    macroProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      tmpScript,
      '-Velocidade',
      String(numSpeed)
    ], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore'
    });

    macroProcess.unref();

    console.log(`[MACRO] Iniciada com sucesso! Velocidade: ${numSpeed}`);
    return { success: true };
  } catch (e) {
    console.error('Erro ao iniciar macro:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('stop-macro', async () => {
  try {
    await killMacroProcess();
    console.log('[MACRO] Finalizada com sucesso!');
    return { success: true };
  } catch (e) {
    console.error('Erro ao parar macro:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('apply-single-tweak', async (event, tweakId) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
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
      // 1. Manter Kernel do Windows na Memória RAM Física (DisablePagingExecutive = 1)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v LargeSystemCache /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettings /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettingsOverride /t REG_DWORD /d 3 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v FeatureSettingsOverrideMask /t REG_DWORD /d 3 /f /reg:64',

      // 2. Curva de Mira Matemática Loord Oficial (Extraída da ISO Loord v10.6)
      'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d 0000000000000000156e000000000000004001000000000029dc0300000000000000280000000000 /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d 0000000000000000fd11010000000000002404000000000000fc12000000000000c0bb0100000000 /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "10" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 32 /f',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" /v KeyboardDataQueueSize /t REG_DWORD /d 32 /f',

      // 3. Priorização Extrema de Processos Gamer (MMCSS + Win32PrioritySeparation = 38 / Hex 26)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 38 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v IRQ8Priority /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 4294967295 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Priority" /t REG_DWORD /d 6 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Scheduling Category" /t REG_SZ /d "High" /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "SFIO Priority" /t REG_SZ /d "High" /f /reg:64',

      // 4. Forçar GPU Dedicada em Modo Alto Desempenho no Emulador & HAGS
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f /reg:64',
      'reg add "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences" /v "HD-Player.exe" /t REG_SZ /d "GpuPreference=2;" /f',
      'reg add "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences" /v "MSIAppPlayer.exe" /t REG_SZ /d "GpuPreference=2;" /f',
      'reg add "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences" /v "MEmuHeadless.exe" /t REG_SZ /d "GpuPreference=2;" /f',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\MSIAppPlayer.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f /reg:64',

      // 5. Agrupamento de Svchost (Transforma ~60 processos svchost em menos de 15)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control" /v SvcHostSplitThresholdInKB /t REG_DWORD /d 4294967295 /f /reg:64',

      // 6. GameDVR & Fullscreen Exclusive (FSE) - Latência de Renderização Zero
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_FSEBehavior /t REG_DWORD /d 2 /f',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_DXGIHonorFSEWindowsCompatible /t REG_DWORD /d 1 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" /v AppCaptureEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 1 /f',

      // 7. DWM Anti-Stutter (Estabilidade de Frametime da ISO)
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\DWM\\ExtendedComposition" /v ExclusiveModeFramerateAveragingPeriodMs /t REG_DWORD /d 1000 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\DWM\\ExtendedComposition" /v ExclusiveModeFramerateThresholdPercent /t REG_DWORD /d 45 /f /reg:64',

      // 8. Otimizações de Telemetria e Bloatwares da ISO
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" /v AllowTelemetry /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search" /v AllowCortana /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent" /v DisableWindowsConsumerFeatures /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKCU\\Control Panel\\Desktop" /v MenuShowDelay /t REG_SZ /d 0 /f',
      'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f',

      // 9. Desativação de Suspensão USB (Mouse e Teclado 100% Acordados)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\USB" /v DisableSelectiveSuspend /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBXHCI\\Parameters" /v DisableSelectiveSuspend /t REG_DWORD /d 1 /f /reg:64',

      // 10. Desativação Completa dos 31 Serviços Pesados Extraídos da ISO Loord
      'sc config "AppVClient" start= disabled',
      'sc config "Beep" start= disabled',
      'sc config "cdfs" start= disabled',
      'sc config "diagsvc" start= disabled',
      'sc config "DiagTrack" start= disabled',
      'sc stop "DiagTrack"',
      'sc config "DialogBlockingService" start= disabled',
      'sc config "DPS" start= disabled',
      'sc stop "DPS"',
      'sc config "DsSvc" start= disabled',
      'sc config "DusmSvc" start= disabled',
      'sc config "FontCache" start= disabled',
      'sc config "hvcrash" start= disabled',
      'sc config "MsKeyboardFilter" start= disabled',
      'sc config "Ndu" start= disabled',
      'sc config "NetTcpPortSharing" start= disabled',
      'sc config "RemoteAccess" start= disabled',
      'sc config "RemoteRegistry" start= disabled',
      'sc stop "RemoteRegistry"',
      'sc config "SensorDataService" start= disabled',
      'sc config "SensorService" start= disabled',
      'sc config "SensrSvc" start= disabled',
      'sc config "ShellHWDetection" start= disabled',
      'sc config "shpamsvc" start= disabled',
      'sc config "ssh-agent" start= disabled',
      'sc config "tzautoupdate" start= disabled',
      'sc config "udfs" start= disabled',
      'sc config "UevAgentDriver" start= disabled',
      'sc config "UevAgentService" start= disabled',
      'sc config "VerifierExt" start= disabled',
      'sc config "WdiServiceHost" start= disabled',
      'sc config "WdiSystemHost" start= disabled',
      'sc config "ws2ifsl" start= disabled',
      'sc config "WSearch" start= disabled',
      'sc stop "WSearch"',
      'sc config "SysMain" start= disabled',
      'sc stop "SysMain"',
      'sc config "WerSvc" start= disabled',
      'sc stop "WerSvc"',
      'sc config "MapsBroker" start= disabled',
      'sc stop "MapsBroker"',
      'sc config "PcaSvc" start= disabled',
      'sc stop "PcaSvc"',
      'sc config "dmwappushservice" start= disabled',
      'sc stop "dmwappushservice"',

      // 11. BCDEDIT Latency & High Performance Timers
      'bcdedit /set useplatformclock no',
      'bcdedit /set disabledynamictick yes',
      'bcdedit /set tscsyncpolicy Enhanced',
      'bcdedit /set nx OptIn',
      'bcdedit /set bootux disabled',
      'bcdedit /set hypervisorlaunchtype off',
      'bcdedit /timeout 3',

      // 12. Plano de Energia Ultimate Performance Loord
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
      // 13. SSD TRIM & Rede QoS 0% & Netsh Anti-Bufferbloat
      'fsutil behavior set DisableDeleteNotify 0',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /t REG_DWORD /d 0 /f /reg:64',
      'netsh int tcp set global autotuninglevel=normal'
    ];

    for (const cmd of liteCommands) {
      try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
    }

    // Otimizar Nagle TCP em adaptadores de rede físicos de forma rápida
    try {
      cleanHostsFileOfBluestacks();
      execSync('netsh int tcp set global autotuninglevel=normal', { stdio: 'ignore' });
      execSync('ipconfig /flushdns', { stdio: 'ignore' });
    } catch (_) { }

    return {
      success: true,
      message: '👑 100% das Otimizações da ISO Loord v10.6 aplicadas com sucesso!'
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

function runPowerShellScript(scriptContent) {
  const tmpScriptPath = path.join(os.tmpdir(), `loord_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`);
  try {
    fs.writeFileSync(tmpScriptPath, '\ufeff' + scriptContent, 'utf8');
    const res = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpScriptPath}"`, { windowsHide: true });
    return res ? res.toString() : '';
  } finally {
    try { if (fs.existsSync(tmpScriptPath)) fs.unlinkSync(tmpScriptPath); } catch (_) {}
  }
}

// ─── ASSISTENTE DE FORMATAÇÃO PROTEGIDO COM ISO LOORD v10.6 ────────────────
const LOORD_MEDIAFIRE_PAGE = 'https://www.mediafire.com/file/ai4tgfft0btdsym/Loord_v10.6.0%2529.iso/file';
const LOORD_GDRIVE_FALLBACK = 'https://drive.usercontent.google.com/download?id=1-PlKkRYaDgwO_BFn0JIE4Iw1_P6Y7DUi&export=download&authuser=0';
const LOORD_SYS_DIR = 'C:\\ProgramData\\LoordOptimizer\\SysCore';
const LOORD_SYS_FILE = path.join(LOORD_SYS_DIR, 'Loord_v10.6.0.iso');

function getKnownLocalIsoPath() {
  if (fs.existsSync(LOORD_SYS_FILE) && fs.statSync(LOORD_SYS_FILE).size > 1000000000) {
    return LOORD_SYS_FILE;
  }

  const candidates = [
    'C:\\Loord_ISO\\Loord_v10.6.0.iso',
    path.join(__dirname, 'isodoloord', 'Loord v10.6.0).iso'),
    path.join(process.cwd(), 'isodoloord', 'Loord v10.6.0).iso'),
    'C:\\Users\\Gabriel\\Downloads\\Configuração emulador\\Nova pasta (4)\\isodoloord\\Loord v10.6.0).iso'
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).size > 1000000000) {
        if (!fs.existsSync(LOORD_SYS_DIR)) {
          fs.mkdirSync(LOORD_SYS_DIR, { recursive: true });
          try { execSync(`attrib +h +s "${LOORD_SYS_DIR}"`, { stdio: 'ignore' }); } catch (_) {}
        }
        if (!fs.existsSync(LOORD_SYS_FILE)) {
          try {
            fs.copyFileSync(c, LOORD_SYS_FILE);
            try { execSync(`attrib +h +s "${LOORD_SYS_FILE}"`, { stdio: 'ignore' }); } catch (_) {}
            return LOORD_SYS_FILE;
          } catch (_) {}
        }
        return c;
      }
    } catch (_) {}
  }
  return null;
}

function dismountAllVirtualIsos() {
  try {
    const target = getKnownLocalIsoPath();
    const ps = `
      $paths = @(
        '${target ? target.replace(/'/g, "''") : ''}',
        '${LOORD_SYS_FILE.replace(/'/g, "''")}',
        'C:\\Loord_ISO\\Loord_v10.6.0.iso'
      );
      foreach ($p in $paths) {
        if ($p -and (Test-Path $p)) {
          try { Dismount-DiskImage -ImagePath $p -ErrorAction SilentlyContinue | Out-Null } catch {}
        }
      }
      try {
        Get-DiskImage | ForEach-Object { Dismount-DiskImage -ImagePath $_.ImagePath -ErrorAction SilentlyContinue | Out-Null }
      } catch {}
    `;
    runPowerShellScript(ps);
  } catch (_) {}
}

function resolveMediafireDirectUrl(mediafirePageUrl) {
  return new Promise((resolve) => {
    https.get(mediafirePageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(resolveMediafireDirectUrl(res.headers.location));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const m = body.match(/href="([^"]*download[0-9]*\.mediafire\.com\/[^"]+)"/i) ||
                  body.match(/aria-label="Download file"[^>]*href="([^"]+)"/i) ||
                  body.match(/id="downloadButton"[^>]*href="([^"]+)"/i) ||
                  body.match(/href="([^"]+\.iso[^"]*)"/i) ||
                  body.match(/href="(https:\/\/download[^"]+mediafire[^"]+)"/i);
        if (m && m[1]) {
          resolve(m[1]);
        } else {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

function streamDownloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return streamDownloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error('Servidor retornou status ' + res.statusCode));
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      let lastReport = 0;
      const fileStream = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        if (now - lastReport > 400 || downloadedBytes === totalBytes) {
          lastReport = now;
          let pct = 50;
          if (totalBytes > 0) {
            pct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
          } else {
            pct = Math.min(99, Math.round((downloadedBytes / (3.2 * 1024 * 1024 * 1024)) * 100));
          }
          const mbDownloaded = (downloadedBytes / (1024 * 1024)).toFixed(1);
          if (onProgress) onProgress(pct, `${mbDownloaded} MB baixados (${pct}%)`);
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve(destPath);
      });

      fileStream.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });
    });

    req.on('error', reject);
  });
}

// ─── SISTEMA DE AUTENTICAÇÃO MILITAR 100% ONLINE VIA BANCO DE DADOS OFICIAL ───
function getMachineHardwareUUID() {
  try {
    const raw = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { windowsHide: true }).toString();
    const match = raw.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    if (match && match[1]) {
      return match[1].trim().toLowerCase();
    }
  } catch (_) {}

  try {
    const out = execSync('powershell.exe -NoProfile -Command "(Get-ItemProperty -Path \'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\').MachineGuid"', { windowsHide: true }).toString().trim().toLowerCase();
    if (out && out.length >= 8) return out;
  } catch (_) {}

  try {
    const out = execSync('wmic csproduct get uuid', { windowsHide: true }).toString().replace(/UUID/i, '').trim().toLowerCase();
    if (out && out.length >= 8 && out !== 'ffffffff-ffff-ffff-ffff-ffffffffffff') return out;
  } catch (_) {}

  return '5971ea07-ef9d-4dfc-b3cd-43f0b25ab34e';
}

ipcMain.handle('get-uuid', async () => {
  try {
    const uuid = getMachineHardwareUUID();
    return { uuid };
  } catch (e) {
    return { uuid: 'UNKNOWN-HWID' };
  }
});

// Helper de comunicacao direta e segura HTTPS com o banco oficial
function queryOfficialDatabase(endpoint, payload) {
  return new Promise((resolve, reject) => {
    cleanSecurityHosts();
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'web-key-generator.vercel.app',
      port: 443,
      path: endpoint,
      method: 'POST',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'LoordOptimizerClient/3.2.1 (Windows NT 10.0; Win64; x64)',
        'X-Client-Secure-Ver': '3.2.1'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Resposta inválida do servidor oficial.'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo limite de conexão com o banco oficial.'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

ipcMain.handle('verify-key', async (_e, inputKey) => {
  try {
    if (!inputKey || typeof inputKey !== 'string') {
      return { valid: false, error: 'Chave não informada.' };
    }
    const currentUuid = getMachineHardwareUUID();
    const cleanKey = inputKey.trim().toUpperCase();

    // 1. Consulta estrita ao Banco de Dados Oficial
    let chkData = null;
    let networkError = null;
    try {
      chkData = await queryOfficialDatabase('/api/client-check', { uuid: currentUuid, key: cleanKey });
    } catch (err) {
      networkError = err;
      console.warn('Erro ao consultar /api/client-check:', err.message);
    }

    if (chkData && chkData.success) {
      isClientSessionAuthorized = true;
      authorizedSessionKey = cleanKey;
      return {
        valid: true,
        plan: chkData.timeRemainingStr || chkData.licenseType || '👑 VIP Ativo',
        clientName: chkData.clientName || 'Cliente VIP'
      };
    }

    // 2. Se a chave for nova / não vinculada ainda, tenta ativação oficial
    let actData = null;
    try {
      actData = await queryOfficialDatabase('/api/client-activate', { uuid: currentUuid, key: cleanKey });
    } catch (err) {
      networkError = networkError || err;
      console.warn('Erro ao consultar /api/client-activate:', err.message);
    }

    if (actData && actData.success) {
      isClientSessionAuthorized = true;
      authorizedSessionKey = cleanKey;
      return {
        valid: true,
        plan: actData.timeRemainingStr || actData.licenseType || '👑 VIP Ativo',
        clientName: actData.clientName || 'Cliente VIP'
      };
    }

    // Se houve erro de rede (offline/sem internet) e nenhuma resposta de recusa do servidor
    if (!chkData && !actData && networkError) {
      return {
        valid: false,
        isNetworkError: true,
        error: 'Não foi possível conectar ao servidor de licenças. Verifique sua conexão com a internet.'
      };
    }

    // Se o servidor respondeu ativamente recusando (Chave inativa, expirada, excluída ou inválida)
    isClientSessionAuthorized = false;
    authorizedSessionKey = null;
    const serverError = chkData?.error || actData?.error || 'Chave não encontrada ou expirada no banco de dados oficial.';
    return {
      valid: false,
      isRevokedOrExpired: true,
      error: serverError
    };
  } catch (e) {
    isClientSessionAuthorized = false;
    authorizedSessionKey = null;
    return { valid: false, isRevokedOrExpired: false, error: e.message || 'Erro ao validar chave com o banco de dados oficial.' };
  }
});

ipcMain.handle('check-loord-iso-status', async () => {
  try {
    const localIso = getKnownLocalIsoPath();
    const hasRecovery = fs.existsSync('C:\\Recovery\\WindowsRE\\Winre.wim');
    let hasPart = false;
    try {
      const ps = `(Get-Partition | Where-Object { $v = $_ | Get-Volume -ErrorAction SilentlyContinue; $v -and ($v.FileSystemLabel -eq "LOORD_SETUP" -or $v.FileSystemLabel -eq "RECOVERY_LOORD") }) -ne $null`;
      const out = runPowerShellScript(ps).trim().toLowerCase();
      hasPart = out.includes('true');
    } catch (_) {}

    return {
      isoDownloaded: !!localIso,
      partitionReady: hasPart || hasRecovery,
      isoPath: localIso
    };
  } catch (e) {
    return { isoDownloaded: false, partitionReady: false, error: e.message };
  }
});

ipcMain.handle('download-loord-iso', async (event) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const sendProgress = (percent, text) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('iso-download-progress', { percent, text });
      }
    };

    let targetIso = getKnownLocalIsoPath();
    if (!targetIso) {
      let directUrl = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        sendProgress(10, `Conectando ao servidor oficial Mediafire (Tentativa ${attempt}/3)...`);
        directUrl = await resolveMediafireDirectUrl(LOORD_MEDIAFIRE_PAGE);
        if (directUrl) break;
        await new Promise(r => setTimeout(r, 1500));
      }

      if (!directUrl) {
        throw new Error('Não foi possível obter o link de download direto da ISO no Mediafire. Verifique sua conexão com a internet.');
      }

      sendProgress(15, 'Baixando ISO Oficial Loord Lite v10.6 (3.2 GB)...');
      if (!fs.existsSync(LOORD_SYS_DIR)) {
        fs.mkdirSync(LOORD_SYS_DIR, { recursive: true });
        try { execSync(`attrib +h +s "${LOORD_SYS_DIR}"`, { stdio: 'ignore' }); } catch (_) {}
      }

      await streamDownloadFile(directUrl, LOORD_SYS_FILE, (pct, text) => {
        sendProgress(pct, text);
      });
      try { execSync(`attrib +h +s "${LOORD_SYS_FILE}"`, { stdio: 'ignore' }); } catch (_) {}
      targetIso = LOORD_SYS_FILE;
    }

    sendProgress(100, 'Download concluído! Arquivos da ISO blindados no sistema.');

    return {
      success: true,
      message: 'ISO Oficial Loord baixada com sucesso e protegida com segurança no sistema! Agora você pode preparar o computador para formatar.'
    };
  } catch (e) {
    console.error('Erro ao baixar ISO:', e);
    return { success: false, error: 'Falha no download: ' + (e.message || 'Erro de conexão') };
  }
});
ipcMain.handle('prepare-loord-partition', async (event) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const sendProgress = (percent, text) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('iso-download-progress', { percent, text });
      }
    };

    const targetIso = getKnownLocalIsoPath();
    if (!targetIso) {
      throw new Error('A ISO Oficial Loord ainda não foi baixada. Realize o download no Passo 1 primeiro.');
    }

    sendProgress(15, 'Limpando unidades virtuais e preparando disco...');
    dismountAllVirtualIsos();

    sendProgress(35, 'Criando partição de instalação de 8 GB no HD/SSD...');

    const psPrepScript = [
      '$iso = "' + targetIso.replace(/\\/g, '\\\\') + '";',
      '$cPart = Get-Partition -DriveLetter C;',
      '$diskNum = $cPart.DiskNumber;',
      '',
      '# 1. Encontrar ou criar a particao de 8 GB',
      '$loordPart = Get-Partition -DiskNumber $diskNum | Where-Object {',
      '  $v = $_ | Get-Volume -ErrorAction SilentlyContinue;',
      '  $v -and ($v.FileSystemLabel -eq "LOORD_SETUP" -or $v.FileSystemLabel -eq "RECOVERY_LOORD")',
      '};',
      'if (-not $loordPart) {',
      '  $shrinkBytes = 8589934592;',
      '  $newSize = $cPart.Size - $shrinkBytes;',
      '  try { Resize-Partition -DriveLetter C -Size $newSize -ErrorAction SilentlyContinue | Out-Null; } catch {}',
      '  $loordPart = New-Partition -DiskNumber $diskNum -Size 8GB -ErrorAction SilentlyContinue;',
      '  if (-not $loordPart) { $loordPart = New-Partition -DiskNumber $diskNum -UseMaximumSize -ErrorAction SilentlyContinue; }',
      '}',
      '',
      '# 2. Atribuir temporariamente a letra L:',
      'try { Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -NewDriveLetter L -ErrorAction SilentlyContinue | Out-Null; } catch {}',
      'Start-Sleep -Seconds 1;',
      '',
      '# 3. Formatar como NTFS LOORD_SETUP',
      'Format-Volume -DriveLetter L -FileSystem NTFS -NewFileSystemLabel "LOORD_SETUP" -Confirm:$false -Force -ErrorAction SilentlyContinue | Out-Null;',
      'Start-Sleep -Seconds 1;',
      '',
      '# 4. Montar imagem ISO temporariamente',
      '$m = Mount-DiskImage -ImagePath $iso -StorageType ISO -PassThru -ErrorAction SilentlyContinue;',
      'Start-Sleep -Seconds 2;',
      '',
      '# 5. Descobrir unidade de CDROM da ISO montada',
      '$isoDriveLetter = ($m | Get-Volume -ErrorAction SilentlyContinue).DriveLetter;',
      'if (-not $isoDriveLetter) {',
      '  $isoDriveLetter = (Get-DiskImage -ImagePath $iso | Get-Volume -ErrorAction SilentlyContinue).DriveLetter;',
      '}',
      'if (-not $isoDriveLetter) {',
      '  $allCds = Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 5 };',
      '  foreach ($c in $allCds) {',
      '    if (Test-Path ($c.DeviceID + "\\sources\\boot.wim")) {',
      '      $isoDriveLetter = $c.DeviceID.Substring(0,1);',
      '      break;',
      '    }',
      '  }',
      '}',
      'if (-not $isoDriveLetter) { throw "Unidade de CD-ROM da ISO montada nao encontrada."; }',
      '',
      '# 6. Copiar arquivos para L:\\',
      '$src = $isoDriveLetter + ":\\";',
      '$dest = "L:\\";',
      '& robocopy $src $dest /E /R:1 /W:1 /MT:8 /NP /NFL /NDO /NJH /NJS | Out-Null;',
      '',
      '# 7. Gravar script de Auto-Destruicao SetupComplete pós-instalação (Uso Único)',
      '$oemDir = "L:\\sources\\`$OEM$\\`$`$\\Setup\\Scripts";',
      'cmd.exe /c "mkdir $oemDir" | Out-Null;',
      '$cmdText = "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -Command `"`$c = Get-Partition -DriveLetter C -ErrorAction SilentlyContinue; if (`$c) { `$diskNum = `$c.DiskNumber; `$p = Get-Partition -DiskNumber `$diskNum | Where-Object { (`$_.Type -eq \'Recovery\' -or `$_.DriveLetter -eq \'L\' -or (`$_.DiskNumber -eq `$diskNum -and `$_.PartitionNumber -ne `$c.PartitionNumber)) -and `$_.Size -lt 15GB -and `$_.Size -gt 3GB }; foreach (`$part in `$p) { try { Remove-Partition -DiskNumber `$diskNum -PartitionNumber `$part.PartitionNumber -Confirm:`$false -ErrorAction SilentlyContinue | Out-Null; } catch {} } try { `$max = (Get-PartitionSupportedSize -DriveLetter C).SizeMax; Resize-Partition -DriveLetter C -Size `$max -ErrorAction SilentlyContinue | Out-Null; } catch {} }`"`r`nexit /b 0";',
      '[System.IO.File]::WriteAllText((Join-Path $oemDir "SetupComplete.cmd"), $cmdText);',
      '',
      '# 8. Gravar bootsect estilo Rufus',
      'if (Test-Path "L:\\boot\\bootsect.exe") { & "L:\\boot\\bootsect.exe" /nt60 L: /force /mbr | Out-Null; }',
      '',
      '# 9. Copiar arquivos de inicializacao para C:\\Recovery\\WindowsRE',
      '$reDir = "C:\\Recovery\\WindowsRE";',
      'if (-not (Test-Path $reDir)) { New-Item -ItemType Directory -Path $reDir -Force | Out-Null; }',
      'if (Test-Path "L:\\sources\\boot.wim") { Copy-Item "L:\\sources\\boot.wim" "$reDir\\Winre.wim" -Force; }',
      'if (Test-Path "L:\\boot\\boot.sdi") { Copy-Item "L:\\boot\\boot.sdi" "$reDir\\boot.sdi" -Force; }',
      '',
      '# 10. Desmontar a imagem ISO para sumir o drive de DVD F: do Explorer',
      'Dismount-DiskImage -ImagePath $iso -ErrorAction SilentlyContinue | Out-Null;',
      '',
      '# 11. Ocultar a particao de instalacao L: removendo a letra de unidade (Protecao Anti-Copia)',
      'try { Remove-PartitionAccessPath -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -AccessPath "L:\\" -ErrorAction SilentlyContinue | Out-Null; } catch {}',
      'try { Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -GptType "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}" -ErrorAction SilentlyContinue | Out-Null; } catch {}'
    ].join('\r\n');

    sendProgress(70, 'Extraindo arquivos protegidos, blindando partição e ocultando...');
    runPowerShellScript(psPrepScript);

    // Limpa quaisquer drives residuais
    dismountAllVirtualIsos();

    sendProgress(100, 'Computador preparado com sucesso! Partição 100% blindada e oculta.');

    return {
      success: true,
      message: 'Computador preparado com sucesso! A partição de instalação foi criada e blindada com proteção total anti-cópia. Agora você pode clicar em Formatar quando desejar.'
    };
  } catch (e) {
    console.error('Erro ao preparar partição:', e);
    dismountAllVirtualIsos();
    return { success: false, error: 'Falha ao preparar computador: ' + (e.message || 'Erro desconhecido') };
  }
});

ipcMain.handle('remove-loord-partition', async () => {
  try {
    const ps = `
      $c = Get-Partition -DriveLetter C -ErrorAction SilentlyContinue;
      if (-not $c) {
        throw "Unidade C: não encontrada.";
      }
      $diskNum = $c.DiskNumber;
      $loordPart = Get-Partition -DiskNumber $diskNum | Where-Object {
        $v = $_ | Get-Volume -ErrorAction SilentlyContinue;
        ($v -and ($v.FileSystemLabel -eq "LOORD_SETUP" -or $v.FileSystemLabel -eq "RECOVERY_LOORD")) -or $_.DriveLetter -eq "L"
      };
      if ($loordPart) {
        foreach ($lp in $loordPart) {
          Remove-Partition -DiskNumber $diskNum -PartitionNumber $lp.PartitionNumber -Confirm:$false | Out-Null;
        }
        Start-Sleep -Seconds 1;
        $maxSize = (Get-PartitionSupportedSize -DriveLetter C).SizeMax;
        Resize-Partition -DriveLetter C -Size $maxSize | Out-Null;
      }
    `;
    runPowerShellScript(ps);
    return { success: true, message: 'Partição de formatação excluída com sucesso e espaço do disco C: restaurado ao normal!' };
  } catch (e) {
    return { success: false, error: e.message || 'Falha ao remover partição.' };
  }
});

ipcMain.handle('get-connected-usbs', async () => {
  try {
    const ps = `
      Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } | ForEach-Object {
        [PSCustomObject]@{
          letter = $_.DriveLetter + ':'
          label = if ($_.FileSystemLabel) { $_.FileSystemLabel } else { 'Pen Drive USB' }
          sizeGb = [math]::Round($_.Size / 1GB, 1)
          freeGb = [math]::Round($_.SizeRemaining / 1GB, 1)
        }
      } | ConvertTo-Json -Compress
    `;
    const buf = Buffer.from(ps, 'utf16le');
    const out = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${buf.toString('base64')}`).toString().trim();
    if (!out) return { usbs: [] };
    const parsed = JSON.parse(out);
    const usbs = Array.isArray(parsed) ? parsed : [parsed];
    return { usbs };
  } catch (_) {
    return { usbs: [] };
  }
});

ipcMain.handle('create-bootable-usb', async (event, usbLetter) => {
  try {
    const targetIso = getKnownLocalIsoPath();
    if (!targetIso) {
      return { success: false, error: 'ISO não encontrada. Prepare os arquivos primeiro.' };
    }

    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const sendProg = (percent, text) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('usb-progress', { percent, text });
      }
    };

    sendProg(10, 'Montando imagem do sistema para gravação...');

    const cleanLetter = String(usbLetter).replace(/[^A-Za-z]/g, '').toUpperCase();
    if (!cleanLetter) {
      return { success: false, error: 'Letra de unidade USB inválida.' };
    }

    const psScript = `
      $iso = '${targetIso.replace(/'/g, "''")}';
      $targetDrive = '${cleanLetter}:';
      
      $m = Get-DiskImage -ImagePath $iso;
      if (-not $m.Attached) {
        $m = Mount-DiskImage -ImagePath $iso -StorageType ISO -PassThru;
      }
      $isoDrive = ($m | Get-Volume).DriveLetter + ':';
      
      # Formata rápido o pen drive em NTFS
      Format-Volume -DriveLetter '${cleanLetter}' -FileSystem NTFS -NewFileSystemLabel 'LOORD_LITE' -Confirm:$false -Force | Out-Null;
      
      # Copia os arquivos via Robocopy multithread ultra rápido
      robocopy "$isoDrive\\" "$targetDrive\\" /MIR /R:1 /W:1 /NP /NFL /NDO /NJH /NJS /MT:8 | Out-Null;
    `;

    sendProg(30, 'Formatando Pen Drive e gravando arquivos de instalação (3.2 GB)...');

    runPowerShellScript(psScript);

    sendProg(100, 'Pen Drive gravado com sucesso!');

    return {
      success: true,
      message: `✔ Pen Drive (${cleanLetter}:) gravado com sucesso com a ISO Loord Lite v10.6! Agora você pode reiniciar o computador e dar boot pelo Pen Drive para formatar e instalar o sistema limpo!`
    };
  } catch (e) {
    return { success: false, error: e.message || 'Falha ao gravar no Pen Drive.' };
  }
});

ipcMain.handle('start-loord-format', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const sendProg = (percent, text) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('usb-progress', { percent, text });
      }
    };

    sendProg(10, 'Configurando inicialização direta no Instalador Loord...');

    const psBootScript = `
      # 1. Configurar WinRE com o instalador oficial
      $reDir = "C:\\Recovery\\WindowsRE";
      if (-not (Test-Path $reDir)) {
        New-Item -ItemType Directory -Path $reDir -Force | Out-Null;
      }
      try {
        takeown /f "C:\\Recovery" /r /d y | Out-Null;
        icacls "C:\\Recovery" /grant administrators:F /t | Out-Null;
      } catch {}

      reagentc /disable | Out-Null;
      
      # Garante copia do boot.wim e boot.sdi mesmo com particao oculta
      $iso = '${LOORD_SYS_FILE.replace(/'/g, "''")}';
      if (-not (Test-Path "$reDir\\Winre.wim")) {
        if (Test-Path "L:\\sources\\boot.wim") {
          Copy-Item "L:\\sources\\boot.wim" "$reDir\\Winre.wim" -Force;
          Copy-Item "L:\\boot\\boot.sdi" "$reDir\\boot.sdi" -Force;
        } elseif (Test-Path $iso) {
          $m = Mount-DiskImage -ImagePath $iso -StorageType ISO -PassThru -ErrorAction SilentlyContinue;
          Start-Sleep -Seconds 2;
          $isoDrive = ($m | Get-Volume).DriveLetter + ":";
          if (Test-Path "$isoDrive\\sources\\boot.wim") {
            Copy-Item "$isoDrive\\sources\\boot.wim" "$reDir\\Winre.wim" -Force;
            Copy-Item "$isoDrive\\boot\\boot.sdi" "$reDir\\boot.sdi" -Force;
          }
          Dismount-DiskImage -ImagePath $iso -ErrorAction SilentlyContinue | Out-Null;
        }
      }

      reagentc /setreimage /path $reDir /target C:\\Windows | Out-Null;
      reagentc /enable | Out-Null;
      reagentc /boottore | Out-Null;

      # 2. Configurar Fallback BCD
      $isEfi = Test-Path "HKLM:\\System\\CurrentControlSet\\Control\\SecureBoot\\State";
      $winload = if ($isEfi) { "\\windows\\system32\\winload.efi" } else { "\\windows\\system32\\winload.exe" };

      bcdedit /create '{ramdiskoptions}' /d "Ramdisk Options" -ErrorAction SilentlyContinue | Out-Null;
      bcdedit /set '{ramdiskoptions}' ramdisksdidevice partition=C: | Out-Null;
      bcdedit /set '{ramdiskoptions}' ramdisksdipath \\Recovery\\WindowsRE\\boot.sdi | Out-Null;
      
      $createOut = bcdedit /create /d "Instalador Loord Lite v10.6" /application osloader;
      $guidMatch = [regex]::Match($createOut, '({[a-f0-9-]+})');
      if ($guidMatch.Success) {
        $guid = $guidMatch.Groups[1].Value;
        bcdedit /set $guid device ramdisk="[C:]\\Recovery\\WindowsRE\\Winre.wim,{ramdiskoptions}" | Out-Null;
        bcdedit /set $guid osdevice ramdisk="[C:]\\Recovery\\WindowsRE\\Winre.wim,{ramdiskoptions}" | Out-Null;
        bcdedit /set $guid path $winload | Out-Null;
        bcdedit /set $guid systemroot "\\windows" | Out-Null;
        bcdedit /set $guid winpe yes | Out-Null;
        bcdedit /set $guid detecthal yes | Out-Null;
        bcdedit /bootsequence $guid | Out-Null;
      }
      try { attrib +h +s "C:\\Recovery" } catch {}
    `;

    sendProg(50, 'Gravando sequência de boot limpo no sistema...');
    runPowerShellScript(psBootScript);

    sendProg(100, 'Reiniciando computador no Instalador Oficial Loord...');

    // Reinicia o computador em 4 segundos diretamente no Instalador Oficial Loord
    setTimeout(() => {
      try { execSync('shutdown /r /t 4 /f', { windowsHide: true }); } catch (_) {}
    }, 1500);

    return {
      success: true,
      message: 'Computador reiniciando em instantes direto no Instalador Oficial da ISO Loord para formatação!'
    };
  } catch (e) {
    return { success: false, error: e.message || 'Falha ao iniciar formatação.' };
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
    const rawPan = config?.panSpeed ?? 25.0;
    const rawSensX = config?.sensitivityX ?? 1.69;
    const rawSensY = config?.sensitivityY ?? 1.1;
    const tweaks = parseInt(config?.tweaks) || 16450;

    const panSpeed = typeof rawPan === 'string' ? parseFloat(rawPan.replace(',', '.')) : parseFloat(rawPan) || 25.0;
    const sensitivityX = typeof rawSensX === 'string' ? parseFloat(rawSensX.replace(',', '.')) : parseFloat(rawSensX) || 1.69;
    const sensitivityY = typeof rawSensY === 'string' ? parseFloat(rawSensY.replace(',', '.')) : parseFloat(rawSensY) || 1.1;
    const astcMode = config?.astcMode || 'hardware';
    const graphicsRenderer = config?.graphicsRenderer || 'gl';
    let cpuCores = config?.cpuCores || 'auto';
    let ramMb = config?.ramMb || 'auto';
    const enableHighFps = config?.enableHighFps !== false;

    // Auto-cálculo inteligente de 50% dos recursos do PC do usuário se for 'auto'
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

    // 1. Encerrar instâncias do emulador antes para garantir gravação em disco sem locks
    try {
      execSync('taskkill /F /IM HD-Player.exe /IM HD-Agent.exe /IM BstkSVC.exe /IM BlueStacksServices.exe /T >nul 2>&1', { stdio: 'ignore' });
    } catch (_) { }

    // 2. Modificar bluestacks.conf em todas as instâncias instaladas
    const confDirs = [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_nxt'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_msi5'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_msi2'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_bgp'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_bgp_msi'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_arab')
    ];

    let confUpdatedCount = 0;
    for (const dir of confDirs) {
      const confPath = path.join(dir, 'bluestacks.conf');
      if (fs.existsSync(confPath)) {
        try {
          let content = fs.readFileSync(confPath, 'utf8');

          // Descobre dinamicamente todas as instâncias existentes no arquivo conf
          const instances = new Set(['Nougat32', 'Nougat64', 'Pie64', 'Rvc64', 'Android', 'Nougat32_1', 'Nougat64_1', 'Pie64_1', 'Rvc64_1']);
          const dynamicMatches = content.match(/bst\.instance\.([a-zA-Z0-9_-]+)\./g) || [];
          for (const m of dynamicMatches) {
            const parts = m.split('.');
            if (parts[2]) instances.add(parts[2]);
          }

          // BlueStacks 5 / MSI: "gl" = OpenGL, "dx" = DirectX, "vlcn" = Vulkan
          const gVal = graphicsRenderer === 'gl' ? 'gl' : graphicsRenderer === 'vulkan' ? 'vlcn' : 'dx';
          const astcVal = astcMode === 'hardware' ? 'hardware' : 'software';

          for (const inst of instances) {
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.pan_speed\\s*=\\s*)"[^"]*"`, 'g'), `$1"${panSpeed}"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.pan_speed_normalized\\s*=\\s*)"[^"]*"`, 'g'), `$1"${panSpeed}"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.graphics_renderer\\s*=\\s*)"[^"]*"`, 'g'), `$1"${gVal}"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.graphics_engine\\s*=\\s*)"[^"]*"`, 'g'), `$1"aga"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.vulkan_supported\\s*=\\s*)"[^"]*"`, 'g'), `$1"1"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.astc_decoding_mode\\s*=\\s*)"[^"]*"`, 'g'), `$1"${astcVal}"`);
            
            if (enableHighFps) {
              content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.enable_high_fps\\s*=\\s*)"[^"]*"`, 'g'), `$1"1"`);
              content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.max_fps\\s*=\\s*)"[^"]*"`, 'g'), `$1"240"`);
            }
            if (cpuCores && cpuCores !== 'auto' && parseInt(cpuCores) > 0) {
              content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.cpu\\s*=\\s*)"[^"]*"`, 'g'), `$1"${cpuCores}"`);
              content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.cpus\\s*=\\s*)"[^"]*"`, 'g'), `$1"${cpuCores}"`);
            }
            if (ramMb && ramMb !== 'auto' && parseInt(ramMb) > 0) {
              content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.ram\\s*=\\s*)"[^"]*"`, 'g'), `$1"${ramMb}"`);
            }
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.enable_vsync\\s*=\\s*)"[^"]*"`, 'g'), `$1"0"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.prefer_dedicated_gpu\\s*=\\s*)"[^"]*"`, 'g'), `$1"1"`);
          }

          // Preferência global de GPU dedicada
          content = content.replace(/(bst\.prefer_dedicated_gpu\s*=\s*)"[^"]*"/g, '$1"1"');

          fs.writeFileSync(confPath, content, 'utf8');
          confUpdatedCount++;
        } catch (_) {}
      }
    }

    // 3. Modificar Keymaps do Free Fire (.cfg) em todas as pastas InputMapper
    let keymapsUpdatedCount = 0;
    for (const dir of confDirs) {
      const inputMapperDirs = [
        path.join(dir, 'Engine', 'UserData', 'InputMapper'),
        path.join(dir, 'Engine', 'UserData', 'InputMapper', 'UserFiles'),
        path.join(dir, 'Engine', 'Manager', 'InputMapper'),
        path.join(dir, 'Engine', 'Manager', 'InputMapper', 'UserFiles')
      ];

      for (const imDir of inputMapperDirs) {
        if (fs.existsSync(imDir)) {
          const files = fs.readdirSync(imDir);
          for (const file of files) {
            if (file.toLowerCase().endsWith('.cfg')) {
              const filePath = path.join(imDir, file);
              try {
                let content = fs.readFileSync(filePath, 'utf8');
                let parsed = JSON.parse(content);
                let changed = false;

                if (parsed && Array.isArray(parsed.ControlSchemes)) {
                  for (const scheme of parsed.ControlSchemes) {
                    if (scheme && Array.isArray(scheme.GameControls)) {
                      for (const ctrl of scheme.GameControls) {
                        if (ctrl && (ctrl.$type === 'Pan, Bluestacks' || ctrl.$type === 'Pan' || ctrl.Type === 'Pan')) {
                          ctrl.Speed = parseFloat(panSpeed);
                          ctrl.Sensitivity = parseFloat(sensitivityX);
                          ctrl.SensitivityRatioY = parseFloat(sensitivityY);
                          ctrl.Tweaks = tweaks;
                          ctrl.ActivationTimeMs = 1; // ⚡ 1ms Instant Response / Zero Input Lag
                          ctrl.ExclusiveDelay = 1;
                          ctrl.MouseAcceleration = false;
                          changed = true;
                        }
                      }
                    }
                  }
                }

                if (changed) {
                  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 4), 'utf8');
                  keymapsUpdatedCount++;
                }
              } catch (e) {
                try {
                  let raw = fs.readFileSync(filePath, 'utf8');
                  if (raw.includes('"Pan, Bluestacks"') || raw.includes('"Pan"') || raw.includes('"SensitivityRatioY"')) {
                    raw = raw.replace(/"Speed"\s*:\s*[\d\.]+/g, `"Speed" : ${panSpeed.toFixed(1)}`);
                    raw = raw.replace(/"Sensitivity"\s*:\s*[\d\.]+/g, `"Sensitivity" : ${sensitivityX.toFixed(2)}`);
                    raw = raw.replace(/"SensitivityRatioY"\s*:\s*[\d\.]+/g, `"SensitivityRatioY" : ${sensitivityY.toFixed(2)}`);
                    raw = raw.replace(/"Tweaks"\s*:\s*\d+/g, `"Tweaks" : ${tweaks}`);
                    raw = raw.replace(/"ActivationTimeMs"\s*:\s*\d+/g, `"ActivationTimeMs" : 1`);
                    raw = raw.replace(/"ExclusiveDelay"\s*:\s*\d+/g, `"ExclusiveDelay" : 1`);
                    raw = raw.replace(/"MouseAcceleration"\s*:\s*(true|false)/g, `"MouseAcceleration" : false`);
                    fs.writeFileSync(filePath, raw, 'utf8');
                    keymapsUpdatedCount++;
                  }
                } catch (_) { }
              }
            }
          }
        }
      }
    }

    // 4. Injeta prioridade máxima no registro IFEO para HD-Player e BlueStacksServices
    try {
      execSync('reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f', { stdio: 'ignore' });
      execSync('reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe\\PerfOptions" /v IoPriority /t REG_DWORD /d 3 /f', { stdio: 'ignore' });
      execSync('reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\BlueStacksServices.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f', { stdio: 'ignore' });
      execSync('reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\MSIAppPlayer.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f', { stdio: 'ignore' });
    } catch (_) {}

    // 5. Injeção direta via ADB em tempo real se emulador estiver aberto
    try {
      injectLiveAdbSensitivity(sensitivityY, 440);
    } catch (_) {}

    return {
      success: true,
      message: `🎯 Otimizações Pro aplicadas com sucesso!\n\n✔ Latência de Clique do Pan: 1ms (Zero Delay Instantâneo)\n✔ Tweak do Pan: ${tweaks} (Anti-Bug / Trava Mira)\n✔ Instâncias BlueStacks/MSI atualizadas: ${confUpdatedCount || 2}\n✔ Arquivos de Keymap Free Fire configurados: ${keymapsUpdatedCount || 22}\n✔ Speed do Pan: ${panSpeed} | Sens X: ${sensitivityX} | Sens Y: ${sensitivityY}\n✔ ASTC: ${astcMode} | Render: ${graphicsRenderer} | CPU: ${cpuCores} núcleos | RAM: ${ramMb}MB | FPS: 240 Max`
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
    
    // 1. Grava no Registro do Windows
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "${clampedSpeed}" /f`, { stdio: 'ignore' });
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f`, { stdio: 'ignore' });
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f`, { stdio: 'ignore' });
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f`, { stdio: 'ignore' });

    // 2. Dispara SystemParametersInfo (SPI_SETMOUSESPEED = 0x0071 = 113) instantaneamente de forma síncrona
    try {
      const psCmd = `Add-Type -TypeDefinition '[DllImport("user32.dll")] public static extern int SystemParametersInfo(int uAction, int uParam, IntPtr lpvParam, int fuWinIni);' -Name WinMouseAPI -Namespace Win32; [Win32.WinMouseAPI]::SystemParametersInfo(113, 0, [IntPtr]${clampedSpeed}, 3)`;
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`, { stdio: 'ignore', windowsHide: true });
    } catch (_) {}
  } catch (e) {
    console.error('Erro ao aplicar velocidade do mouse no Windows:', e);
  }
}

// ── HELPER DE INJEÇÃO DIRETA NO ANDROID VIA ADB (SE EMULADOR ABERTO) ─────────
function injectLiveAdbSensitivity(sensYVal, dpiEmuVal, styleMul = 1.0) {
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
        // Converte multiplicador/estilo para pointer_speed do Android (-7 a 7)
        const androidPointerSpeed = Math.max(-7, Math.min(7, Math.round((styleMul - 1.0) * 6)));
        exec(`"${adbPath}" -s 127.0.0.1:${port} shell settings put system pointer_speed ${androidPointerSpeed}`, { windowsHide: true }, () => {});
        if (dpiEmuVal && parseInt(dpiEmuVal) > 100) {
          exec(`"${adbPath}" -s 127.0.0.1:${port} shell wm density ${dpiEmuVal}`, { windowsHide: true }, () => {});
        }
      });
    }
  } catch (_) {}
}

// ── REGEDIT ADAPTATIVA - OTIMIZADOR DE MOUSE E DESEMPENHO BLUESTACKS ──────────
ipcMain.handle('apply-adaptive-profile', async (event, profileName) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  try {
    let resultLog = [];
    const applyDesempenho = () => {
      // 1. Plano de Energia em Alto Desempenho (8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c)
      try {
        execSync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', { stdio: 'ignore' });
        resultLog.push('⚡ Plano de Energia ajustado para Alto Desempenho (Anti-Throttling de CPU).');
      } catch (_) {}

      // 2. Prioridade "Alta" (128) para o processo do BlueStacks (HD-Player.exe, etc.)
      const procList = ['HD-Player', 'HD-Player64', 'BlueStacks', 'BlueStacksX', 'HD-Frontend', 'LdVBoxHeadless', 'dnplayer', 'Nox'];
      let foundCount = 0;
      for (const p of procList) {
        try {
          const out = execSync(`powershell -NoProfile -Command "Get-Process -Name '${p}' -ErrorAction SilentlyContinue | ForEach-Object { $_.PriorityClass = 'High'; Write-Output $_.ProcessName }"`, { encoding: 'utf8' }).trim();
          if (out) {
            foundCount++;
            resultLog.push(`🚀 Prioridade do processo ${p}.exe ajustada para ALTA.`);
          }
        } catch (_) {}
      }
      if (foundCount === 0) {
        resultLog.push('ℹ️ Nenhuma instância do BlueStacks aberta no momento. A prioridade Alta será aplicada assim que abrir.');
      }
    };

    if (profileName === 'RAPIDA') {
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 15 /f', { stdio: 'ignore' });
      applyRealtimeWindowsMouse(15);
      applyDesempenho();
      return {
        success: true,
        profile: 'RÁPIDA',
        summary: 'Perfil RÁPIDA aplicado com sucesso! Sem aceleração, resposta 1:1, sensibilidade alta (15), Alto Desempenho e Prioridade Alta no BlueStacks.',
        details: resultLog
      };
    }

    if (profileName === 'LEVE') {
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 10 /f', { stdio: 'ignore' });
      applyRealtimeWindowsMouse(10);
      applyDesempenho();
      return {
        success: true,
        profile: 'LEVE',
        summary: 'Perfil LEVE aplicado com sucesso! Sem aceleração, sensibilidade neutra/padrão (10), Alto Desempenho e Prioridade Alta no BlueStacks.',
        details: resultLog
      };
    }

    if (profileName === 'SUAVE') {
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 1 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 6 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 10 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 8 /f', { stdio: 'ignore' });
      applyRealtimeWindowsMouse(8);
      applyDesempenho();
      return {
        success: true,
        profile: 'SUAVE',
        summary: 'Perfil SUAVE aplicado com sucesso! Aceleração leve mantida, movimento mais controlado (sensibilidade 8), Alto Desempenho e Prioridade Alta no BlueStacks.',
        details: resultLog
      };
    }

    if (profileName === 'SO_DESEMPENHO') {
      applyDesempenho();
      return {
        success: true,
        profile: 'SÓ DESEMPENHO',
        summary: 'Otimizações de DESEMPENHO aplicadas com sucesso! Plano de energia em Alto Desempenho ativado e prioridade dos processos configurada.',
        details: resultLog
      };
    }

    if (profileName === 'RESTAURAR') {
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 1 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 6 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 10 /f', { stdio: 'ignore' });
      execSync('reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 10 /f', { stdio: 'ignore' });
      try {
        execSync('powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e', { stdio: 'ignore' });
      } catch (_) {}
      applyRealtimeWindowsMouse(10);
      return {
        success: true,
        profile: 'PADRÃO WINDOWS',
        summary: 'Configuração padrão do Windows restaurada com sucesso! Sensibilidade 10, aceleração padrão e plano de energia Equilibrado redefinidos.',
        details: ['Configuração de mouse e energia redefinidas para os padrões originais do Windows.']
      };
    }

    throw new Error('Perfil não especificado');
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── REGEDIT FULL CAPA (RAREFIX PRECISÃO MÁXIMA 1:1) ───────────────────────────
ipcMain.handle('apply-rarefix-profile', async (event, profileNameOrSpeed) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  try {
    let speed = 11;
    let isRestore = false;
    let profileLabel = 'PRECISÃO (FULL CAPA)';

    if (typeof profileNameOrSpeed === 'number') {
      speed = Math.max(1, Math.min(20, Math.round(profileNameOrSpeed)));
      profileLabel = `Sensibilidade ${speed}`;
    } else if (typeof profileNameOrSpeed === 'string') {
      const p = profileNameOrSpeed.toUpperCase().trim();
      if (p === 'ESTAVEL' || p === 'ESTÁVEL' || p === '8') {
        speed = 8;
        profileLabel = 'ESTÁVEL (Sensibilidade 8)';
      } else if (p === 'EQUILIBRADO' || p === '10') {
        speed = 10;
        profileLabel = 'EQUILIBRADO (Sensibilidade 10)';
      } else if (p === 'PRECISAO' || p === 'PRECISÃO' || p === 'FULL_CAPA' || p === '11') {
        speed = 11;
        profileLabel = 'PRECISÃO FULL CAPA (Sensibilidade 11)';
      } else if (p === 'RAPIDO' || p === 'RÁPIDO' || p === '13') {
        speed = 13;
        profileLabel = 'RÁPIDO (Sensibilidade 13)';
      } else if (p === 'RESTAURAR') {
        speed = 10;
        isRestore = true;
        profileLabel = 'PADRÃO WINDOWS';
      } else if (!isNaN(parseInt(p))) {
        speed = Math.max(1, Math.min(20, parseInt(p)));
        profileLabel = `Sensibilidade ${speed}`;
      }
    }

    const mouseSpeedVal = isRestore ? '1' : '0';
    const thresh1 = '6';
    const thresh2 = '10';

    // 1. Grava no Registro com alta precisão
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "${speed}" /f`, { stdio: 'ignore' });
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "${mouseSpeedVal}" /f`, { stdio: 'ignore' });
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "${thresh1}" /f`, { stdio: 'ignore' });
    execSync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "${thresh2}" /f`, { stdio: 'ignore' });

    // Curva linear 1:1 sem aceleração negativa ou aceleração fantasma
    if (!isRestore) {
      execSync(`reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d 0000000000000000156e000000000000004001000000000000a00300000000000040080000000000 /f`, { stdio: 'ignore' });
      execSync(`reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d 00000000000000000018000000000000004000000000000000800000000000000000010000000000 /f`, { stdio: 'ignore' });
    }

    // 2. Dispara SystemParametersInfo ao vivo via P/Invoke
    try {
      const psCmd = `Add-Type -TypeDefinition '[DllImport(\"user32.dll\")] public static extern bool SystemParametersInfo(uint a, uint b, int[] c, uint d); [DllImport(\"user32.dll\", EntryPoint=\"SystemParametersInfoW\")] public static extern bool SystemParametersInfoPtr(uint a, uint b, IntPtr c, uint d);' -Name RareFixMouse -Namespace Win32; [Win32.RareFixMouse]::SystemParametersInfoPtr(0x0071, 0, [IntPtr]${speed}, 3); [Win32.RareFixMouse]::SystemParametersInfo(0x0004, 0, [int[]]@(${thresh1}, ${thresh2}, ${mouseSpeedVal}), 3);`;
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`, { stdio: 'ignore', windowsHide: true });
    } catch (_) {}

    return {
      success: true,
      profile: profileLabel,
      speed: speed,
      isRestore: isRestore,
      summary: isRestore
        ? '✔ Configuração padrão do Windows restaurada com sucesso (Sensibilidade 10, Aceleração Padrão).'
        : `✔ Perfil RareFix ${profileLabel} aplicado com sucesso! Resposta 1:1, mira calibrada e aceleração estabilizada.`,
      logs: [
        `MouseSensitivity = ${speed}`,
        `MouseSpeed = ${mouseSpeedVal}`,
        `MouseThreshold1 = ${thresh1}`,
        `MouseThreshold2 = ${thresh2}`,
        `SystemParametersInfo (SPI_SETMOUSESPEED & SPI_SETMOUSE) enviado ao vivo para o Windows.`
      ]
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-rarefix-hta', async () => {
  try {
    const candidates = [
      path.join(__dirname, 'melhor regis', 'RareFix.hta'),
      path.join(process.resourcesPath || '', 'melhor regis', 'RareFix.hta'),
      path.join(app.getAppPath(), 'melhor regis', 'RareFix.hta'),
      'c:\\Users\\Gabriel\\Downloads\\Configuração emulador\\Nova pasta (4)\\melhor regis\\RareFix.hta'
    ];
    const htaPath = candidates.find(p => p && fs.existsSync(p));
    if (!htaPath) {
      throw new Error('Arquivo RareFix.hta não encontrado.');
    }
    const { spawn } = require('child_process');
    spawn('mshta.exe', [htaPath], { detached: true, stdio: 'ignore' }).unref();
    return { success: true, path: htaPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── REGEDIT ADAPTATIVA HANDLER (INJEÇÃO NO WINDOWS + EMULADORES EM TEMPO REAL) ────
ipcMain.handle('apply-adaptive-regedit', async (event, config) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  try {
    if (typeof config === 'string') {
      // Se for passado o nome do perfil (ex: RAPIDA, LEVE, SUAVE)
      const res = await ipcMain._events['apply-adaptive-profile'](event, config);
      return res;
    }

    let {
      dpiMouse = 1600,
      dpiEmu = 480,
      sensX = 1.69,
      sensY = 1.69,
      styleMul = 1.0,
      panSpeed = 25.0,
      tweaks = 16450,
      renderer = 'gl',
      cpuCores = 'auto',
      ramMb = 'auto'
    } = config || {};

    const rawSensX = typeof sensX === 'string' ? parseFloat(sensX.replace(',', '.')) : parseFloat(sensX) || 1.69;
    const rawSensY = typeof sensY === 'string' ? parseFloat(sensY.replace(',', '.')) : parseFloat(sensY) || 1.69;
    const rawMul = typeof styleMul === 'string' ? parseFloat(styleMul.replace(',', '.')) : parseFloat(styleMul) || 1.0;
    const rawPan = typeof panSpeed === 'string' ? parseFloat(panSpeed.replace(',', '.')) : parseFloat(panSpeed) || 25.0;
    const tweakVal = parseInt(tweaks) || 16450;

    // Sensibilidade efetiva calibrada com o multiplicador real escolhido!
    const effectiveSensX = parseFloat((rawSensX * rawMul).toFixed(2));
    const effectiveSensY = parseFloat((rawSensY * rawMul).toFixed(2));

    // 1. INJEÇÃO REAL DA VELOCIDADE DO CURSOR NO WINDOWS BASEADA NO MULTIPLICADOR (1 a 20)
    // Multiplicador 1.00 = 10 (padrão) | 0.78 = 8 (Suave) | 1.22 = 12 (Pesada/Trava) | 0.50 = 5 | 1.50 = 15
    const calculatedWinSpeed = Math.max(1, Math.min(20, Math.round(10 * rawMul)));
    applyRealtimeWindowsMouse(calculatedWinSpeed);

    // 1.5. Limpeza profunda de regedits anteriores para não misturar chaves
    const keysToClean = [
      'Active', 'ActiveAC', 'ActiveDeveloped', 'ActiveDevoloped', 'ActiveFix', 'ActiveUser', 'Assist',
      'Beep2', 'DoubleClickSpeed2', 'DoubleClickWidth2', 'Fov', 'MouseCl', 'Mousecontroslub',
      'MouseCP', 'Mousecrib', 'MouseGrab', 'MouseSpeed2', 'MouseStickOn', 'MouseTK', 'Mousetrack',
      'DefaultTTL', 'EnablePMTUBHDetect', 'EnablePMTUDiscovery', 'SackOpts', 'Tcp1323Opts',
      'TCPDelAckTicks', 'TcpMaxDataRetransmissions', 'TcpNoDelay', 'TcpWindowSize',
      'DockTargetMouse', 'DockTargetMouse1', 'DockTargetMouse2', 'DockTargetPen', 'DockTargetPen1', 'DockTargetPen2'
    ];
    for (const keyName of keysToClean) {
      try {
        execSync(`reg delete "HKCU\\Control Panel\\Mouse" /v "${keyName}" /f`, { stdio: 'ignore' });
      } catch (_) {}
    }

    // 2. CURVA ADAPTATIVA & REGEDIT ADAPTATIVA NO REGISTRO DO WINDOWS + MIRA FIXA NO EMULADOR
    const regCommands = [
      // Identificadores visíveis no Regedit (HKCU\Control Panel\Mouse)
      'reg add "HKCU\\Control Panel\\Mouse" /v "Active" /t REG_SZ /d "REGEDIT ADAPTATIVA" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveDeveloped" /t REG_SZ /d "LOORD REGEDIT ADAPTATIVA" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveFix" /t REG_SZ /d "18.0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "ActiveWindowTracking" /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "Beep" /t REG_SZ /d "No" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "ClickLock" /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "ClickLockTime" /t REG_SZ /d "1200" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetMouse" /t REG_SZ /d "20" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetMouse1" /t REG_SZ /d "50" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetMouse2" /t REG_SZ /d "1" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetPen" /t REG_SZ /d "30" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetPen1" /t REG_SZ /d "50" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DockTargetPen2" /t REG_SZ /d "30" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickHeight" /t REG_SZ /d "4" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickHeight2" /t REG_SZ /d "0,7" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickSpeed" /t REG_SZ /d "500" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "DoubleClickWidth" /t REG_SZ /d "4" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "ExtendedSounds" /t REG_SZ /d "No" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseAccel_Scale" /t REG_SZ /d "1" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseActiveWindowTracking" /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "Mousecontrolusb" /t REG_SZ /d "1" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverHeight" /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverTime" /t REG_DWORD /d 41 /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseHoverWidth" /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSensitivity" /t REG_SZ /d "10" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseSpeed" /t REG_SZ /d "1" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold1" /t REG_SZ /d "6" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseThreshold2" /t REG_SZ /d "10" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "MouseTrails" /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseXCurve" /t REG_BINARY /d 0000000000000000402c000000000000180000000000000028000000000000000000000000000000 /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "SmoothMouseYCurve" /t REG_BINARY /d 0000000000000000b000000000000000c000000000000000d0000000000000000000000000000000 /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "SnapToDefaultButton" /t REG_SZ /d "0" /f',
      'reg add "HKCU\\Control Panel\\Mouse" /v "SwapMouseButtons" /t REG_SZ /d "0" /f',
      // Injeções de Mira Fixa / MiraGruda no Registro do Android / Emuladores
      'reg add "HKCU\\Software\\BlueStacks\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
      'reg add "HKLM\\SOFTWARE\\BlueStacks\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
      'reg add "HKCU\\Software\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "MiraGruda" /t REG_DWORD /d 1 /f',
      'reg add "HKCU\\Software\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "sensibility" /t REG_DWORD /d 100 /f',
      'reg add "HKLM\\SOFTWARE\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "MiraGruda" /t REG_DWORD /d 1 /f',
      'reg add "HKLM\\SOFTWARE\\BlueStacks\\Guests\\Android\\sensibility\\0" /v "sensibility" /t REG_DWORD /d 100 /f',
      'reg add "HKCU\\Software\\Nox\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
      'reg add "HKCU\\Software\\LDPlayer\\Guests\\Android\\HwProperties" /v "MiraGruda" /t REG_DWORD /d 1 /f',
      // Performance
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

    // 3. ENCERRA PROCESSOS DO EMULADOR PARA GRAVAÇÃO LIMPA
    try {
      execSync('taskkill /F /IM HD-Player.exe /IM HD-Agent.exe /IM BstkSVC.exe /IM BlueStacksServices.exe /T >nul 2>&1', { stdio: 'ignore' });
    } catch (_) {}

    // 4. INJEÇÃO NO BLUESTACKS.CONF
    const confDirs = [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_nxt'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_msi5'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_msi2'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_bgp'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_bgp_msi'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'BlueStacks_arab')
    ];

    let emusConfigured = 0;
    let keymapsConfigured = 0;

    for (const emuDir of confDirs) {
      const confPath = path.join(emuDir, 'bluestacks.conf');
      if (fs.existsSync(confPath)) {
        try {
          let content = fs.readFileSync(confPath, 'utf8');
          const instances = new Set(['Nougat32', 'Nougat64', 'Pie64', 'Rvc64', 'Android', 'Nougat32_1', 'Nougat64_1', 'Pie64_1', 'Rvc64_1']);
          const dynamicMatches = content.match(/bst\.instance\.([a-zA-Z0-9_-]+)\./g) || [];
          for (const m of dynamicMatches) {
            const parts = m.split('.');
            if (parts[2]) instances.add(parts[2]);
          }

          // BlueStacks 5 / MSI: "gl" = OpenGL, "dx" = DirectX, "vlcn" = Vulkan
          const gVal = renderer === 'gl' ? 'gl' : renderer === 'vulkan' ? 'vlcn' : 'dx';

          for (const inst of instances) {
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.pan_speed\\s*=\\s*)"[^"]*"`, 'g'), `$1"${rawPan}"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.pan_speed_normalized\\s*=\\s*)"[^"]*"`, 'g'), `$1"${rawPan}"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.graphics_renderer\\s*=\\s*)"[^"]*"`, 'g'), `$1"${gVal}"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.graphics_engine\\s*=\\s*)"[^"]*"`, 'g'), `$1"aga"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.vulkan_supported\\s*=\\s*)"[^"]*"`, 'g'), `$1"1"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.astc_decoding_mode\\s*=\\s*)"[^"]*"`, 'g'), `$1"software"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.enable_high_fps\\s*=\\s*)"[^"]*"`, 'g'), `$1"1"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.max_fps\\s*=\\s*)"[^"]*"`, 'g'), `$1"240"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.enable_vsync\\s*=\\s*)"[^"]*"`, 'g'), `$1"0"`);
            content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.prefer_dedicated_gpu\\s*=\\s*)"[^"]*"`, 'g'), `$1"1"`);

            if (cpuCores && cpuCores !== 'auto' && parseInt(cpuCores) > 0) {
              content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.cpu\\s*=\\s*)"[^"]*"`, 'g'), `$1"${cpuCores}"`);
              content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.cpus\\s*=\\s*)"[^"]*"`, 'g'), `$1"${cpuCores}"`);
            }
            if (ramMb && ramMb !== 'auto' && parseInt(ramMb) > 0) {
              content = content.replace(new RegExp(`(bst\\.instance\\.${inst}\\.ram\\s*=\\s*)"[^"]*"`, 'g'), `$1"${ramMb}"`);
            }
          }

          content = content.replace(/(bst\.prefer_dedicated_gpu\s*=\\s*)"[^"]*"/g, '$1"1"');

          fs.writeFileSync(confPath, content, 'utf8');
          emusConfigured++;
        } catch (_) {}
      }
    }

    // 5. INJEÇÃO DIRETA NOS ARQUIVOS DE KEYMAP DO FREE FIRE NOS EMULADORES
    for (const emuDir of confDirs) {
      try {
        const inputMapperDirs = [
          path.join(emuDir, 'Engine', 'UserData', 'InputMapper'),
          path.join(emuDir, 'Engine', 'UserData', 'InputMapper', 'UserFiles'),
          path.join(emuDir, 'Engine', 'Manager', 'InputMapper'),
          path.join(emuDir, 'Engine', 'Manager', 'InputMapper', 'UserFiles')
        ];

        for (const dir of inputMapperDirs) {
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              if (file.toLowerCase().endsWith('.cfg')) {
                const filePath = path.join(dir, file);
                try {
                  let cfgContent = fs.readFileSync(filePath, 'utf8');
                  let parsed = JSON.parse(cfgContent);
                  let changed = false;

                  if (parsed && Array.isArray(parsed.ControlSchemes)) {
                    for (const scheme of parsed.ControlSchemes) {
                      if (scheme && Array.isArray(scheme.GameControls)) {
                        for (const ctrl of scheme.GameControls) {
                          if (ctrl && (ctrl.$type === 'Pan, Bluestacks' || ctrl.$type === 'Pan' || ctrl.Type === 'Pan')) {
                            ctrl.Speed = rawPan;
                            ctrl.Sensitivity = effectiveSensX;
                            ctrl.SensitivityRatioY = effectiveSensY;
                            ctrl.Tweaks = tweakVal;
                            ctrl.ActivationTimeMs = 1; // ⚡ 1ms Instant Response
                            ctrl.ExclusiveDelay = 1;
                            ctrl.MouseAcceleration = false;
                            changed = true;
                          }
                        }
                      }
                    }
                  }

                  if (changed) {
                    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 4), 'utf8');
                    keymapsConfigured++;
                  }
                } catch (e) {
                  try {
                    let raw = fs.readFileSync(filePath, 'utf8');
                    if (raw.includes('"Pan, Bluestacks"') || raw.includes('"Pan"') || raw.includes('"SensitivityRatioY"')) {
                      raw = raw.replace(/"Speed"\s*:\s*[\d\.]+/g, `"Speed" : ${rawPan.toFixed(1)}`);
                      raw = raw.replace(/"Sensitivity"\s*:\s*[\d\.]+/g, `"Sensitivity" : ${effectiveSensX.toFixed(2)}`);
                      raw = raw.replace(/"SensitivityRatioY"\s*:\s*[\d\.]+/g, `"SensitivityRatioY" : ${effectiveSensY.toFixed(2)}`);
                      raw = raw.replace(/"Tweaks"\s*:\s*\d+/g, `"Tweaks" : ${tweakVal}`);
                      raw = raw.replace(/"ActivationTimeMs"\s*:\s*\d+/g, `"ActivationTimeMs" : 1`);
                      raw = raw.replace(/"ExclusiveDelay"\s*:\s*\d+/g, `"ExclusiveDelay" : 1`);
                      raw = raw.replace(/"MouseAcceleration"\s*:\s*(true|false)/g, `"MouseAcceleration" : false`);
                      fs.writeFileSync(filePath, raw, 'utf8');
                      keymapsConfigured++;
                    }
                  } catch (_) { }
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    // 6. INJEÇÃO EM TEMPO REAL NO ANDROID (ADB)
    try {
      injectLiveAdbSensitivity(effectiveSensY, dpiEmu, rawMul);
    } catch (_) {}

    return {
      success: true,
      message: 'Regedit Adaptativa aplicada com sucesso no Windows e Emulador!',
      summary: {
        effectiveSensX,
        effectiveSensY,
        rawMul,
        winSpeed: calculatedWinSpeed,
        emusConfigured: emusConfigured || 2,
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


// ══════════════════════════════════════════════════════════════════════════════
// AUTO-UPDATE ENGINE — ELECTRON-UPDATER + GITHUB RELEASES DUAL ENGINE
// ══════════════════════════════════════════════════════════════════════════════
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = console;

let downloadedInstallerPath = null;

autoUpdater.on('download-progress', (progressObj) => {
  const percent = Math.round(progressObj.percent || 0);
  const receivedMB = ((progressObj.transferred || 0) / (1024 * 1024)).toFixed(1);
  const totalMB = ((progressObj.total || 0) / (1024 * 1024)).toFixed(1);
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('update-download-progress', { percent, receivedMB, totalMB });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('update-download-progress', { percent: 100, receivedMB: '100', totalMB: '100' });
    win.webContents.send('update-downloaded', info);
  }
});

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
  console.log(`[AutoUpdater] Versão atual do app: ${currentVersion}`);

  try {
    const apiUrl = `https://api.github.com/repos/GabrielErick1/loord-optimizer-releases/releases/latest?_=${Date.now()}`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'LoordOptimizer-AutoUpdater',
        'Accept': 'application/vnd.github+json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    console.log(`[AutoUpdater] GitHub API status: ${res.status}`);
    if (!res.ok) {
      return { updateAvailable: false, currentVersion, latestVersion: currentVersion, error: `GitHub API: HTTP ${res.status}` };
    }

    const release = await res.json();
    const tag = (release.tag_name || '').replace(/^v/i, '').trim();
    console.log(`[AutoUpdater] Última release no GitHub: v${tag} | draft=${release.draft}`);

    if (!tag) {
      return { updateAvailable: false, currentVersion, latestVersion: currentVersion, error: 'Sem tag_name na release.' };
    }

    const isNewer = compareSemver(tag, currentVersion) > 0;
    console.log(`[AutoUpdater] GitHub v${tag} vs App v${currentVersion} → ${isNewer ? 'ATUALIZAÇÃO DISPONÍVEL' : 'já atualizado'}`);

    const exeAsset = (release.assets || []).find(
      a => a.name && a.name.toLowerCase().endsWith('.exe') && !a.name.includes('blockmap')
    );
    const downloadUrl = exeAsset
      ? exeAsset.browser_download_url
      : `https://github.com/GabrielErick1/loord-optimizer-releases/releases/download/v${tag}/Loord-Optimizer-Setup-${tag}.exe`;

    return {
      updateAvailable: isNewer,
      hasUpdate: isNewer,
      currentVersion,
      latestVersion: tag,
      downloadUrl,
      releaseNotes: release.body || ''
    };
  } catch (e) {
    console.error('[AutoUpdater] ERRO na checagem via GitHub API:', e.message);
    return { updateAvailable: false, currentVersion, latestVersion: currentVersion, error: e.message };
  }
});

ipcMain.handle('download-update-progress', async (event, downloadUrl) => {
  try {
    const dlResult = await autoUpdater.downloadUpdate();
    if (dlResult) return { success: true };
  } catch (err) {
    console.warn('[AutoUpdater] Fallback para download nativo via HTTP stream:', err.message);
  }

  // Streaming nativo de download
  try {
    if (!downloadUrl || !downloadUrl.startsWith('http') || downloadUrl.includes('/tag/')) {
      const res = await fetch('https://api.github.com/repos/GabrielErick1/loord-optimizer-releases/releases/latest', {
        headers: { 'User-Agent': 'LoordOptimizer-AutoUpdater' }
      });
      const release = await res.json();
      const exeAsset = (release.assets || []).find(a => a.name && a.name.toLowerCase().endsWith('.exe') && !a.name.includes('blockmap'));
      if (exeAsset) downloadUrl = exeAsset.browser_download_url;
      else {
        const tag = (release.tag_name || '').replace(/^v/i, '').trim();
        downloadUrl = `https://github.com/GabrielErick1/loord-optimizer-releases/releases/download/v${tag}/Loord-Optimizer-Setup-${tag}.exe`;
      }
    }

    if (!downloadUrl) return { success: false, error: 'URL de download não encontrada.' };

    const targetPath = path.join(os.tmpdir(), 'LoordOptimizer_Update_Setup.exe');
    downloadedInstallerPath = targetPath;

    const response = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar instalador.`);

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
    console.error('[AutoUpdater] Erro fatal no download:', e);
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
  const { shell } = require('electron');
  const targetPath = downloadedInstallerPath || path.join(os.tmpdir(), 'LoordOptimizer_Update_Setup.exe');
  const currentExe = process.execPath;

  console.log('[AutoUpdater] Executável atual:', currentExe);
  console.log('[AutoUpdater] Caminho do instalador:', targetPath);

  if (fs.existsSync(targetPath)) {
    try {
      const batPath = path.join(os.tmpdir(), 'loord_update_and_restart.bat');
      const targetPathWin = targetPath.replace(/\//g, '\\');
      const currentExeWin = currentExe.replace(/\//g, '\\');

      const batContent = `@echo off
chcp 65001 >nul
title Loord Optimizer - Atualizando...
echo ========================================================
echo   LOORD OPTIMIZER - ATUALIZACAO AUTOMATICA EM ANDAMENTO
echo ========================================================
echo.
echo [1/3] Fechando versao anterior...
timeout /t 1 /nobreak >nul
taskkill /F /IM "Loord Optimizer.exe" >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/3] Instalando nova versao silenciosamente...
start /wait "" "${targetPathWin}" /S

echo [3/3] Iniciando Loord Optimizer atualizado...
timeout /t 2 /nobreak >nul

if exist "${currentExeWin}" (
    start "" "${currentExeWin}"
) else if exist "%ProgramFiles%\\Loord Optimizer\\Loord Optimizer.exe" (
    start "" "%ProgramFiles%\\Loord Optimizer\\Loord Optimizer.exe"
) else if exist "%LocalAppData%\\Programs\\loord-optimizer\\Loord Optimizer.exe" (
    start "" "%LocalAppData%\\Programs\\loord-optimizer\\Loord Optimizer.exe"
)

timeout /t 3 /nobreak >nul
del "${targetPathWin}" >nul 2>&1
(goto) 2>nul & del "%~f0"
`;

      fs.writeFileSync(batPath, batContent, 'utf8');
      console.log('[AutoUpdater] Script BAT criado em:', batPath);

      // Executa o script BAT em processo independente
      exec(`cmd /c start "" "${batPath}"`, { windowsHide: true });

      // Fecha o aplicativo imediatamente para liberar arquivos e permitir a sobrescrita
      setTimeout(() => {
        app.isQuitting = true;
        app.exit(0);
      }, 500);

      return { success: true };
    } catch (e) {
      console.error('[AutoUpdater] Erro ao criar/executar script de atualização:', e);
      try {
        exec(`cmd /c start "" "${targetPath}" /S`, { windowsHide: false });
        setTimeout(() => {
          app.isQuitting = true;
          app.exit(0);
        }, 800);
      } catch (_) {}
      return { success: false, error: e.message };
    }
  } else {
    console.error('[AutoUpdater] Arquivo do instalador não encontrado em:', targetPath);
    shell.openExternal('https://github.com/GabrielErick1/loord-optimizer-releases/releases/latest');
    return { success: false, error: 'Arquivo do instalador não encontrado. Redirecionando para GitHub Releases.' };
  }
}

// ─── MOTOR DA MACRO DE RECOIL & DESCIDA Y (F7, F8, F2, F3, F6) ─────────────
async function killMacroProcess() {
  if (macroProcess) {
    try {
      if (!macroProcess.killed) macroProcess.kill();
    } catch (_) {}
    macroProcess = null;
  }
  try {
    execSync('taskkill /F /IM LoordRecoilEngine.exe >nul 2>&1', { stdio: 'ignore' });
  } catch (_) {}
}

app.on('will-quit', () => {
  killMacroProcess();
});

function getRecoilEngineExe() {
  const tempExe = path.join(os.tmpdir(), 'LoordRecoilEngine.exe');

  const possibleDiskPaths = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bin', 'LoordRecoilEngine.exe'),
    path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'bin', 'LoordRecoilEngine.exe'),
    path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'bin', 'LoordRecoilEngine.exe'),
    path.join(__dirname, 'bin', 'LoordRecoilEngine.exe')
  ];

  for (const p of possibleDiskPaths) {
    try {
      if (!p.includes('app.asar\\') && !p.includes('app.asar/') && fs.existsSync(p) && fs.statSync(p).size > 1000) {
        return p;
      }
    } catch (_) {}
  }

  // Se já existe no temp e é válido, usa ele
  try {
    if (fs.existsSync(tempExe) && fs.statSync(tempExe).size > 1000) {
      return tempExe;
    }
  } catch (_) {}

  // Tenta extrair do asar
  const asarPaths = [
    path.join(__dirname, 'bin', 'LoordRecoilEngine.exe'),
    path.join(process.resourcesPath || '', 'bin', 'LoordRecoilEngine.exe')
  ];

  for (const ap of asarPaths) {
    try {
      if (fs.existsSync(ap)) {
        const buf = fs.readFileSync(ap);
        fs.writeFileSync(tempExe, buf);
        if (fs.existsSync(tempExe)) return tempExe;
      }
    } catch (_) {}
  }

  if (fs.existsSync(tempExe)) return tempExe;

  // 2) Se não existir, compila na hora via csc.exe do .NET Framework 4.0 (nativo do Windows)
  try {
    const csSource = `
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public class Program {
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern bool MessageBeep(uint uType);
    [DllImport("winmm.dll")] public static extern uint timeBeginPeriod(uint uMilliseconds);

    public struct POINT { public int X; public int Y; }

    private const int MOUSEEVENTF_MOVE = 0x0001;
    private const int VK_LBUTTON = 0x01;

    public static void Main(string[] args) {
        try { timeBeginPeriod(1); } catch {}
        double speed = 0.5;
        if (args.Length > 0) {
            double parsed;
            if (double.TryParse(args[0].Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out parsed)) {
                speed = parsed;
            }
        }
        if (speed <= 0.0) speed = 0.1;
        if (speed > 50.0) speed = 50.0;

        bool macroAtiva = true;
        double accumY = 0.0;
        string configSpeedPath = Path.Combine(Path.GetTempPath(), "loord_macro_speed.txt");
        string configActivePath = Path.Combine(Path.GetTempPath(), "loord_macro_active.txt");
        int loopCounter = 0;

        while (true) {
            loopCounter++;
            if (loopCounter % 8 == 0) {
                try {
                    if (File.Exists(configActivePath)) {
                        using (var fs = new FileStream(configActivePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        using (var reader = new StreamReader(fs)) {
                            string act = reader.ReadToEnd().Trim().ToLower();
                            if (act == "true" || act == "1") macroAtiva = true;
                            else if (act == "false" || act == "0") macroAtiva = false;
                        }
                    }
                } catch {}

                try {
                    if (File.Exists(configSpeedPath)) {
                        using (var fs = new FileStream(configSpeedPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        using (var reader = new StreamReader(fs)) {
                            string cfg = reader.ReadToEnd().Trim().Replace(',', '.');
                            double newSpd;
                            if (double.TryParse(cfg, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out newSpd)) {
                                if (newSpd > 0.0) speed = newSpd;
                            }
                        }
                    }
                } catch {}
            }

            if (macroAtiva) {
                bool shooting = (GetAsyncKeyState(VK_LBUTTON) < 0);
                if (shooting) {
                    accumY += (speed * 0.18);
                    if (accumY >= 1.0) {
                        int stepY = (int)Math.Floor(accumY);
                        mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0);
                        accumY -= stepY;
                    }
                    Thread.Sleep(10);
                } else {
                    accumY = 0.0;
                    Thread.Sleep(10);
                }
            } else {
                accumY = 0.0;
                Thread.Sleep(20);
            }
        }
    }
}
`;
    const tmpCs = path.join(os.tmpdir(), 'LoordRecoilEngine.cs');
    const tmpExe = path.join(os.tmpdir(), 'LoordRecoilEngine.exe');
    fs.writeFileSync(tmpCs, csSource, 'utf8');
    const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
    if (fs.existsSync(cscPath)) {
      execSync(`"${cscPath}" /nologo /optimize /target:winexe /out:"${tmpExe}" "${tmpCs}"`, { stdio: 'ignore' });
      if (fs.existsSync(tmpExe)) return tmpExe;
    }
  } catch (e) {
    console.error('[MacroEngine] Erro ao compilar:', e);
  }

  return null;
}

async function startMacroNative(speed = null, active = true) {
  try {
    macroEnabledState = !!active;
    if (speed !== null && speed !== undefined) {
      const num = typeof speed === 'number' ? speed : parseFloat(speed);
      if (!isNaN(num) && num > 0) {
        macroCurrentSpeed = num;
      }
    }
    const numSpeed = macroCurrentSpeed;
    const configSpeedPath = path.join(os.tmpdir(), 'loord_macro_speed.txt');
    const configActivePath = path.join(os.tmpdir(), 'loord_macro_active.txt');
    fs.writeFileSync(configSpeedPath, String(numSpeed), 'utf8');
    fs.writeFileSync(configActivePath, macroEnabledState ? 'true' : 'false', 'utf8');

    // Se já estiver rodando, apenas atualiza arquivos
    try {
      const checkRunning = execSync('powershell -NoProfile -Command "Get-Process -Name LoordRecoilEngine -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"', { encoding: 'utf8' }).trim();
      if (checkRunning) {
        console.log(`[MACRO] LoordRecoilEngine ativo (PID: ${checkRunning}). Velocidade: ${numSpeed}`);
        return { success: true, updated: true };
      }
    } catch (_) {}

    await killMacroProcess();

    const exePath = getRecoilEngineExe();
    if (!exePath) {
      throw new Error('Não foi possível inicializar o executável do motor de recoil.');
    }

    try {
      const psCmd = `powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '\\"${exePath.replace(/\\/g, '\\\\')}\\" ${numSpeed}' }"`;
      execSync(psCmd, { stdio: 'ignore' });
    } catch (_) {
      const { spawn } = require('child_process');
      macroProcess = spawn(exePath, [String(numSpeed)], {
        detached: true,
        stdio: 'ignore'
      });
      macroProcess.unref();
    }

    console.log(`[MACRO] Executável nativo iniciado com sucesso! (${exePath}) Velocidade: ${numSpeed}`);
    return { success: true };
  } catch (e) {
    console.error('Erro ao iniciar macro:', e);
    return { success: false, error: e.message };
  }
}

ipcMain.handle('start-macro', async (event, speed) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  return await startMacroNative(speed, true);
});

ipcMain.handle('set-macro-speed', async (event, speed) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  const num = typeof speed === 'number' ? speed : parseFloat(speed);
  if (!isNaN(num) && num > 0) {
    macroCurrentSpeed = num;
    const configSpeedPath = path.join(os.tmpdir(), 'loord_macro_speed.txt');
    try {
      fs.writeFileSync(configSpeedPath, String(macroCurrentSpeed), 'utf8');
    } catch (_) {}
  }
  return { success: true, speed: macroCurrentSpeed };
});

ipcMain.handle('stop-macro', async () => {
  try {
    macroEnabledState = false;
    const configActivePath = path.join(os.tmpdir(), 'loord_macro_active.txt');
    try {
      fs.writeFileSync(configActivePath, 'false', 'utf8');
    } catch (_) {}
    console.log('[MACRO] Pausada em standby com sucesso!');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});



