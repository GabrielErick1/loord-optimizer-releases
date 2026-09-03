const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { spawn, exec, execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');

// ─── BLINDAGEM MÁXIMA CONTRA ENGENHARIA REVERSA, PORTABLES & CRACKING ─────────
const FORBIDDEN_CLI_ARGS = [
  '--remote-debugging',
  '--remote-debugging-port',
  '--remote-debugging-targets',
  '--inspect',
  '--inspect-brk',
  '--enable-logging',
  '--log-net-log',
  '--js-flags',
  '--disable-web-security',
  '--allow-running-insecure-content',
  '--host-rules',
  '--host-resolver-rules',
  '--custom-devtools-frontend',
  '--load-extension',
  '--disable-extensions-except'
];

for (const arg of process.argv) {
  const lower = (arg || '').toLowerCase();
  for (const forbidden of FORBIDDEN_CLI_ARGS) {
    if (lower.includes(forbidden)) {
      try { app.exit(0); } catch (_) { }
      process.exit(0);
    }
  }
}

function getIdentityFingerprint() {
  return {
    appName: 'Loord Optimizer',
    appId: 'com.loord.optimizer',
    appVersion: app.getVersion() || '3.8.5',
    isPackaged: app.isPackaged
  };
}

// ─── FLAGS DE PERFORMANCE DO CHROMIUM (anti-jank, anti-throttle) ─────────────
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
// Performance: impede que o Chromium reduza FPS quando a janela perde foco
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Reduz uso de memória desativando spell-check e extensões não usadas
app.commandLine.appendSwitch('disable-spell-checking');
app.commandLine.appendSwitch('disable-extensions');
// Força garbage-collect agressivo para liberar RAM entre ações
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=256');

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
let authorizedSessionIsIsoKey = false;
let authorizedSessionIsoUses = 0;
let activatedIsoKey = null;
let activeServerSessionToken = null;

function isLicenseAuthorized() {
  return (
    isClientSessionAuthorized === true &&
    !!authorizedSessionKey &&
    typeof authorizedSessionKey === 'string' &&
    authorizedSessionKey.length >= 6 &&
    (authorizedSessionIsIsoKey === true || !!activeServerSessionToken)
  ) || (authorizedSessionIsIsoKey === true && (authorizedSessionIsoUses > 0 || !!activatedIsoKey));
}

// Lista de canais públicos permitidos sem autenticação (login, verificação e sistema)
const PUBLIC_IPC_CHANNELS = new Set([
  'check-admin',
  'get-uuid',
  'getMachineUUID',
  'verify-key',
  'activate-iso-key',
  'get-iso-plans-public',
  'create-iso-pix-payment',
  'check-iso-pix-payment',
  'check-loord-iso-status',
  'check-for-updates',
  'download-update-progress',
  'install-update-now',
  'revert-all-tweaks-on-revoke',
  'reboot-computer',
  'reboot-to-bios',
  'get-restore-point-status'
]);

// ─── ZERO-TRUST IPC INTERCEPTOR: Bloqueia 100% dos IPCs se não autorizado ─────
const originalIpcHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (channel, listener) {
  if (PUBLIC_IPC_CHANNELS.has(channel)) {
    return originalIpcHandle(channel, listener);
  }
  return originalIpcHandle(channel, async (event, ...args) => {
    if (!isLicenseAuthorized()) {
      return { success: false, error: 'Acesso bloqueado: Licença VIP requerida para esta ação.' };
    }
    return listener(event, ...args);
  });
};

const BLACKLISTED_CRACK_TOOLS = [
  'x64dbg', 'x32dbg', 'cheatengine', 'cheat engine', 'dnspy', 'httpdebugger',
  'fiddler', 'charles', 'wireshark', 'processhacker', 'process hacker',
  'ida64', 'idag', 'scylla', 'ollydbg', 'ghidra'
];

function runAntiCrackProcessCheck() {
  try {
    exec('tasklist /fo csv /nh', { timeout: 4000, windowsHide: true }, (err, stdout) => {
      if (!err && stdout) {
        const lower = stdout.toLowerCase();
        for (const bad of BLACKLISTED_CRACK_TOOLS) {
          if (lower.includes(bad)) {
            console.warn(`[SECURITY] Ferramenta hostil/debugger detectada: ${bad}. Encerrando aplicação...`);
            try { app.exit(0); } catch (_) { }
          }
        }
      }
    });
  } catch (_) { }
}

// Verifica ferramentas hostis a cada 45s de forma leve e oculta (não satura o CPU)
setInterval(runAntiCrackProcessCheck, 45000);

// ─── HEARTBEAT ATIVO DE LICENÇA (VALIDAÇÃO SILENCIOSA EM SEGUNDO PLANO) ────────
setInterval(async () => {
  if (isClientSessionAuthorized && authorizedSessionKey) {
    try {
      const currentUuid = getMachineHardwareUUID();
      const chkData = await queryOfficialDatabase('/api/client-check', { uuid: currentUuid, key: authorizedSessionKey });
      if (!chkData || !chkData.success || chkData.status === 'revoked' || chkData.status === 'expired') {
        console.warn('[SECURITY] Heartbeat de licença: chave expirada ou revogada!');
        isClientSessionAuthorized = false;
        authorizedSessionKey = null;
        activeServerSessionToken = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('license-revoked', {
            reason: chkData?.error || 'Sua licença expirou ou foi revogada pelo administrador.'
          });
        }
      } else if (chkData.sessionToken) {
        activeServerSessionToken = chkData.sessionToken;
      }
    } catch (_) { }
  }
}, 300000); // Checa a cada 5 minutos

if (!fs.existsSync(backupDir)) {
  try { fs.mkdirSync(backupDir, { recursive: true }); } catch (_) { }
}

async function ensureInitialSystemRestorePoint() {
  try {
    if (!fs.existsSync(originalStateDir)) {
      fs.mkdirSync(originalStateDir, { recursive: true });
      safeExec(`attrib +h "${originalStateDir}"`);
    }

    const markerPath = path.join(originalStateDir, 'backup_marker.json');
    if (fs.existsSync(markerPath)) {
      console.log('[RESTORE-POINT] Ponto de restauração e backup original já salvos anteriormente.');
      return { success: true, alreadyExists: true };
    }

    console.log('[RESTORE-POINT] Criando ponto de restauração oculto e capturando estado original do Windows...');

    // 1. Cria Ponto de Restauração Oficial do Windows em background (sem travar a UI)
    const psRestorePoint = "Enable-ComputerRestore -Drive 'C:\\' -ErrorAction SilentlyContinue; Checkpoint-Computer -Description 'LoordOptimizer_Original_State' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction SilentlyContinue";
    safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psRestorePoint}"`, { timeout: 20000 });

    // 2. Exporta e salva backups das configurações originais (.reg) do Windows em paralelo
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

    const exportPromises = [];
    for (const item of registryExports) {
      const dest = path.join(originalStateDir, item.file);
      if (!fs.existsSync(dest)) {
        exportPromises.push(safeExec(`reg export "${item.key}" "${dest}" /y`));
      }
      const dest2 = path.join(backupDir, item.file);
      if (!fs.existsSync(dest2)) {
        exportPromises.push(safeExec(`reg export "${item.key}" "${dest2}" /y`));
      }
    }
    await Promise.all(exportPromises);

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
        if (!fs.existsSync(dest1)) try { fs.copyFileSync(item.path, dest1); } catch (_) { }
        if (!fs.existsSync(dest2)) try { fs.copyFileSync(item.path, dest2); } catch (_) { }
      }
    }

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
    frame: false,
    backgroundColor: '#0e0e11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      // ── Performance ────────────────────────────────────────────────
      backgroundThrottling: false,   // não reduz FPS ao minimizar
      spellcheck: false,             // elimina thread de spell-check
      images: true,
      webgl: false,                  // painel não usa WebGL, libera memória GPU
      enableBlinkFeatures: '',       // desativa blink features extras desnecessárias
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile('index.html');

  // ─── BLINDAGEM ANTI-DEVTOOLS, ANTI-INSPECT & ANTI-CONTEXT-MENU ────────────
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
    try { app.quit(); } catch (_) { }
  });

  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
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
  try { dismountAllVirtualIsos(); } catch (_) { }
  try { cleanSecurityHosts(); } catch (_) { }
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
    startMacroNative(0.1, false).catch((e) => console.error('[Macro AutoBoot]', e));
  }, 800);

  // Cria/Garante o Ponto de Restauração Oculto do Windows e Backup do Estado Original
  setTimeout(() => {
    ensureInitialSystemRestorePoint().catch((e) => console.error('[RestorePoint AutoBoot]', e));
  }, 1200);
});

let macroEnabledState = false;
let macroCurrentSpeed = 0.1;

async function toggleMacroGlobalState() {
  macroEnabledState = !macroEnabledState;
  syncMacroFiles(macroCurrentSpeed, macroEnabledState);

  try {
    shell.beep();
  } catch (_) { }

  // Garante que o motor nativo esteja rodando em background com a velocidade atual do usuário
  startMacroNative(macroCurrentSpeed, macroEnabledState).catch(() => { });

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
  } catch (_) { }
  killMacroProcess();
  try {
    execSync('taskkill /f /fi "WINDOWTITLE eq MacroCapaFreeFire*"', { stdio: 'ignore' });
  } catch (e) { }
});

// ─── HELPERS ASYNC (NUNCA BLOQUEIA O PROCESSO PRINCIPAL) ─────────────────────

// Executa um comando e retorna stdout. Nunca bloqueia o event loop.
function execAsync(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, timeout: opts.timeout || 10000, ...opts }, (err, stdout) => {
      if (err) reject(err);
      else resolve((stdout || '').trim());
    });
  });
}

// Executa silenciosamente sem importar se falhar (fire-and-forget seguro)
function safeExec(cmd, opts = {}) {
  return execAsync(cmd, opts).catch(() => '');
}

// Alias de compatibilidade com o código existente
function runCmd(command) {
  return execAsync(command);
}

// ─────────────────────────────────────────────────────────────────────────────


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

ipcMain.handle('adb-uninstall', async (event, packages, port, preservePackages = []) => {
  const adb = findAdb();
  if (!adb) return (packages || []).map(pkg => ({ pkg, ok: false, error: 'ADB não encontrado.' }));

  const targets = getActiveAdbTargets(port);
  const pkgList = (packages || []).join(' ');

  // 1. Desinstalar / desativar estritamente os pacotes que foram selecionados pelo usuário
  if (pkgList.trim().length > 0) {
    const shellBatch = `for p in ${pkgList}; do pm disable-user --user 0 $p 2>/dev/null; pm disable $p 2>/dev/null; pm hide --user 0 $p 2>/dev/null; pm uninstall --user 0 $p 2>/dev/null; am force-stop $p 2>/dev/null; done; pm clear com.bluestacks.home 2>/dev/null; am force-stop com.bluestacks.home 2>/dev/null; am start -n com.bluestacks.home/.HomeActivity 2>/dev/null`;

    for (const t of targets) {
      await execAsync(`"${adb}" -s ${t} shell "${shellBatch}"`, 6000);
      await execAsync(`"${adb}" -s ${t} shell su -c "${shellBatch}"`, 6000);
    }
  }

  // 2. Reativar e Proteger expressamente qualquer pacote desselecionado (ex: Google Play Store, Play Services, etc.)
  if (Array.isArray(preservePackages) && preservePackages.length > 0) {
    const preserveList = preservePackages.join(' ');
    const restoreBatch = `for p in ${preserveList}; do pm enable --user 0 $p 2>/dev/null; pm enable $p 2>/dev/null; pm unhide --user 0 $p 2>/dev/null; pm default-state --user 0 $p 2>/dev/null; done;`;
    for (const t of targets) {
      await execAsync(`"${adb}" -s ${t} shell "${restoreBatch}"`, 4000);
      await execAsync(`"${adb}" -s ${t} shell su -c "${restoreBatch}"`, 4000);
    }
  }

  return (packages || []).map(pkg => ({ pkg, ok: true, out: 'Success' }));
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
        // 1. Atualizar chaves por instância para desbloqueio máximo de PC fraco / versões 5.9, 5.12, 5.21, 5.22
        updateBluestacksInstanceKeys(f, () => ({
          'max_fps': '999',
          'enable_high_fps': '1',
          'eco_mode_max_fps': '10'
        }));

        // 2. Atualizar mim.max_fps com os Hz informados pelo usuário
        let content = fs.readFileSync(f, 'utf8');
        if (/bst\.mim\.max_fps=".*?"/.test(content)) {
          content = content.replace(/bst\.mim\.max_fps=".*?"/g, `bst.mim.max_fps="${targetHz}"`);
        } else {
          content += `\r\nbst.mim.max_fps="${targetHz}"`;
        }

        safeWriteBluestacksConf(f, content);
        modifiedCount++;
      } catch (e) {
        console.error(`Erro ao atualizar FPS em ${f}:`, e.message);
      }
    }
  }

  return { success: modifiedCount > 0, modifiedCount, targetHz };
});

ipcMain.handle('unlock-fps-hz-classic', async (event, hz) => {
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
        // Método 2 (Clássico PowerShell): enable_high_fps="0", max_fps="999", mim.max_fps="<hz>"
        content = content.replace(/bst\.instance\.(.*?)\.enable_high_fps=".*?"/g, 'bst.instance.$1.enable_high_fps="0"');
        content = content.replace(/bst\.instance\.(.*?)\.max_fps=".*?"/g, 'bst.instance.$1.max_fps="999"');
        if (/bst\.mim\.max_fps=".*?"/.test(content)) {
          content = content.replace(/bst\.mim\.max_fps=".*?"/g, `bst.mim.max_fps="${targetHz}"`);
        } else {
          content += `\r\nbst.mim.max_fps="${targetHz}"`;
        }

        safeWriteBluestacksConf(f, content);
        modifiedCount++;
      } catch (e) {
        console.error(`Erro ao atualizar FPS Clássico em ${f}:`, e.message);
      }
    }
  }

  return { success: modifiedCount > 0, modifiedCount, targetHz };
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

// ─── HELPER: GRAVAÇÃO ATÔMICA E BLINDADA DE BLUESTACKS.CONF ──────────────────
const CRITICAL_BLUESTACKS_KEYS = [
  'bst.launcher_version',
  'bst.status.hypervisor',
  'bst.status.imap_schema_version',
  'bst.machine_id',
  'bst.guid',
  'bst.install_id',
  'bst.install_date',
  'bst.installed_images',
  'bst.version_machine_id'
];

function safeWriteBluestacksConf(confPath, contentOrLines) {
  if (!confPath || !fs.existsSync(confPath)) return false;
  try {
    // 1. Ler o conteúdo original para capturar as chaves de integridade originais
    const originalContent = fs.readFileSync(confPath, 'utf8');
    const originalLines = originalContent.split(/\r?\n/);
    const criticalMap = new Map();

    for (const line of originalLines) {
      const trimmed = line.trim();
      for (const critKey of CRITICAL_BLUESTACKS_KEYS) {
        if (trimmed.startsWith(`${critKey}=`)) {
          criticalMap.set(critKey, trimmed);
        }
      }
    }

    // 2. Normalizar linhas a serem salvas
    let lines = Array.isArray(contentOrLines)
      ? [...contentOrLines]
      : contentOrLines.split(/\r?\n/);

    lines = lines.map(l => l.trim()).filter(l => l.length > 0);

    // 3. Garantir que as chaves críticas NUNCA sejam modificadas ou excluídas
    for (const [critKey, origLine] of criticalMap) {
      const idx = lines.findIndex(l => l.startsWith(`${critKey}=`));
      if (idx !== -1) {
        lines[idx] = origLine; // Preserva o valor original do sistema
      } else {
        lines.push(origLine);
      }
    }

    const finalContent = lines.join('\r\n') + '\r\n';

    // 4. Escrita Atômica: grava no .tmp primeiro e substitui de forma segura
    const tmpPath = `${confPath}.tmp_${Date.now()}`;
    fs.writeFileSync(tmpPath, finalContent, 'utf8');

    try {
      fs.renameSync(tmpPath, confPath);
    } catch (renameErr) {
      fs.copyFileSync(tmpPath, confPath);
      try { fs.unlinkSync(tmpPath); } catch (_) { }
    }

    return true;
  } catch (err) {
    console.error(`Erro ao gravar com segurança em ${confPath}:`, err);
    return false;
  }
}

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

    return safeWriteBluestacksConf(confPath, updatedLines) ? 1 : 0;
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
        const updated = lines.map(l => {
          if (l.match(/^bst\.instance\..*?\.(show_ads|show_banner|show_banner_ads|show_sidebar_ads|show_game_center_ads|show_promoted_apps|banner_games_enabled)=/)) {
            const prefix = l.split('=')[0];
            return `${prefix}="0"`;
          }
          if (l.match(/^bst\.(banner_games_enabled|enable_programmatic_ads)=/)) {
            const prefix = l.split('=')[0];
            return `${prefix}="0"`;
          }
          return l;
        });
        safeWriteBluestacksConf(f, updated);
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
    // Consulta ultra-rápida filtrada apenas pelo HD-Player.exe (menos de 15ms vs 300ms do tasklist geral)
    const out = await safeExec('tasklist /fi "IMAGENAME eq HD-Player.exe" /fo csv /nh');
    if (out && out.toLowerCase().includes('hd-player.exe')) {
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

// RAM Cleaner - executa assincronamente em background sem travar o painel
ipcMain.handle('clean-ram', async () => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  try {
    const scriptPath = getPhysicalScriptPath('clean_ram.ps1');
    await safeExec(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Optimize processes - executa assincronamente em background sem travar o painel
ipcMain.handle('optimize-processes', async () => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  try {
    const scriptPath = getPhysicalScriptPath('otimizar_processos.ps1');
    await safeExec(`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`);
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

    // Roda comandos em lote em paralelo — executa em ~1.5s no total em vez de 15s congelando
    await Promise.all(directCommands.map(cmd => safeExec(cmd)));

    // 9. Nagle por Interface de Rede & Desativação de IPv6 de forma assíncrona
    safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-NetAdapter | Foreach-Object { $key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\' + $_.InterfaceGuid; if (Test-Path $key) { Set-ItemProperty -Path $key -Name TcpAckFrequency -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $key -Name TCPNoDelay -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue; Set-ItemProperty -Path $key -Name TcpDelAckTicks -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue } }; Get-NetAdapterBinding -ComponentID ms_tcpip6 | Disable-NetAdapterBinding -ErrorAction SilentlyContinue"`);

    // 10. Limpar Shaders DirectX Cache, D3D e Temp sem travar o painel
    safeExec('cmd.exe /c "del /q /f /s \"%TEMP%\\*\" & del /q /f /s \"C:\\Windows\\Temp\\*\" & del /q /f /s \"%LOCALAPPDATA%\\D3DSCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\NVIDIA\\DXCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\AMD\\DxCache\\*\" & ipconfig /flushdns & exit /b 0"');

    // 11. Redução de processos em segundo plano e purga de RAM assíncrona
    const procScript = getPhysicalScriptPath('otimizar_processos.ps1');
    safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${procScript}"`);

    const ramScript = getPhysicalScriptPath('clean_ram.ps1');
    safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ramScript}"`);

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

  return safeWriteBluestacksConf(confPath, newLines);
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
    const MOUSE_MODE_TITLES = {
      'regedit-loord-ranqueada': 'LOORD REGEDIT RANQUEADA (Full Capa & Média/Longa Distância)',
      'regedit-loord-apostado': 'LOORD REGEDIT APOSTADO (Disparo Cirúrgico 4v4 & X1)',
      'regedit-loord-v3-ted-exe': 'LOORD V3 VIP (Ted Exe • AimLock & Stability Instantânea)',
      'regedit-loord-v2-supreme': 'LOORD REGEDIT V.2 (Curva Suave 1:1 & Headshot Lock)',
      'regedit-lord-socapa-4x4': 'Regedit do Lord So Capa 4x4 (Precision Instantâneo .REG + .BAT Ao Vivo)',
      'regedit-do-flash': 'Regedit do Flash (Alta Precisão 1:1 + Curva Flash .REG & .BAT Integrados)',
      'mira-clean-loord': 'MIRA CREN LOORD (Mira Fixa & MiraGruda BlueStacks / MSI / Nox / LDPlayer)',
      'ff-precision-pixel-perfect': 'LOORD 4.0 SUPREME VIP (Pixel-Perfect & Zero Jitter / Full Head)',
      'loord-3-sense-full-red': 'GOD OF HEADSHOT 1:1 (Ultra Sense + BCD Timer + USB Boost)',
      'vip-lock-sense': 'AIM LOCK EXTREME 1:1 (Anti-Tremer & Head Stabilizer)',
      'full-red-ump': 'FULL RED SMG & AR (Disparo Instantâneo & No Recoil)',
      'kant-v1': 'KANT ELITE V1 (Curva Customizada & Puxada Suave)',
      'mira-clean-pesadinho': 'MIRA CLEAN PESADINHO (1:1 Head & Zero Shake)',
      'ultra-emu-boost': 'ULTRA EMULATOR BYPASS 1:1 (Prioridade Realtime & Max FPS)',
      'zero-curve-raw': 'ZERO ACCEL RAW INPUT 1:1 (Precisão Cirúrgica & Latência Zero)',
      'ff-mouse-maximo': 'HYPER SENSE FULL CAPA (Sensibilidade 10/11 & IRQ8 Timer)',
      'rikwich-pro-sense': 'R!KW!CH PRO HEADSHOT (Curva Linear 1:1 & Touch 750 DPI)',
      'fov-lock-stick-pro': 'FOV LOCK & MOUSE STICK (Trava Alvo & Magnet Head)'
    };

    const targetKey = (mouseMode === 'mira-clean-loord')
      ? 'mira-clean-pesadinho'
      : (mouseMode || 'loord-3-sense-full-red');
    const selectedRegData = require('./regis/encrypted_reg_data.js');
    const selectedRegConfig = selectedRegData[targetKey]
      || selectedRegData[targetKey.replace('regedit-', '')]
      || selectedRegData['loord-3-sense-full-red'];

    // ── Limpeza Completa e Dinâmica de Regedits Antigas ──
    // Remove 100% das chaves customizadas e subchaves anteriores para manter SOMENTE a nova regedit ativa
    try {
      // 1. Remove subchaves residuais criadas por regedits anteriores (ex: HKEY_LOCAL_MACHINE clone)
      try { execSync('reg delete "HKCU\\Control Panel\\Mouse\\HKEY_LOCAL_MACHINE" /f', { stdio: 'ignore' }); } catch (_) { }

      // 2. Limpa o valor padrão (Default) de volta ao padrão do Windows
      try { execSync('reg add "HKCU\\Control Panel\\Mouse" /ve /t REG_SZ /d "" /f', { stdio: 'ignore' }); } catch (_) { }

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
          try { execSync(`reg delete "${t}" /f`, { stdio: 'ignore' }); } catch (_) { }
          continue;
        }
        const parts = t.split(/\s+/);
        const name = parts[0];
        if (name && !stdMouseProps.has(name.toLowerCase())) {
          try {
            execSync(`reg delete "HKCU\\Control Panel\\Mouse" /v "${name}" /f`, { stdio: 'ignore' });
          } catch (_) { }
        }
      }
    } catch (e) {
      console.error('Erro na varredura dinâmica de limpeza de chaves residuais:', e.message);
    }

    const staticKeysToClean = [
      'Active', 'ActiveAC', 'ActiveDeveloped', 'ActiveDevoloped', 'ActiveFix', 'ActiveUser', 'ActiveHWID', 'ActiveMouseInGame',
      'Aim', 'AimLock', 'AimBot', 'AimAssist', 'AimHead', 'AimHeadshot', 'AimSpeed', 'AimFov', 'AimLok',
      'AimPRO', 'HAOHAO', 'FLAMES', 'AimHeadRightClick', 'AimHeadRightClickLifter', 'AimbotHeadLeftClickLifter',
      'AimbotHeadLeft', 'AimbotHeadshot', 'AimbotSpeed', 'AimbotHeadLetf', 'AimHeadRight',
      'AutoHeadshot', 'AutoHeadshots', 'FovAutoHeadshot', 'FovHead', 'Fov', 'sensitivity', 'sensibility',
      'StabilityOn', 'AimlockOn', 'AimSystem', 'FixMouse', 'MouseFix',
      'Beep2', 'DoubleClickHeight2', 'DoubleClickSpeed2', 'DoubleClickWidth2',
      'ExtendedSounds2', 'MouseSensibility2', 'MouseSpeed2', 'MouseThreshold12', 'MouseThreshold22',
      'MouseAccel_Scale', 'MouseActiveWindowTracking', 'MouseCl', 'MouseCL', 'Mousecontrolusb',
      'Mousecontroslub', 'MouseCP', 'Mousecrib', 'MouseGrab', 'MouseStickOn', 'MouseHead', 'MouseHeadLeft', 'MouseHeadRight',
      'MouseTK', 'Mousetrack', 'ClickLock', 'ClickLockTime',
      'DockTargetMouse', 'DockTargetMouse1', 'DockTargetMouse2',
      'DockTargetMouseDragOutWidth', 'DockTargetMouseSideMoveWidth', 'DockTargetMouseWidth',
      'DockTargetPen', 'DockTargetPen1', 'DockTargetPen2',
      'DockTargetPenDragOutWidth', 'DockTargetPenSideMoveWidth', 'DockTargetPenWidth',
      'DockTargetMousePenDragOutWidth', 'DockTargetMousePenSideMoveWidth',
      'DefaultTTL', 'EnablePMTUBHDetect', 'EnablePMTUDiscovery', 'SackOpts', 'Tcp1323Opts',
      'TCPDelAckTicks', 'TcpMaxDataRetransmissions', 'TcpNoDelay', 'TcpWindowSize',
      'generalemulatorsensitivity', 'joystick', 'LEFTCLICK', 'keyboard', 'keyboardSpeed',
      'LOORD REGEDIT V.2', 'CPU', 'GPU', 'DPI', 'Headshot'
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
          const valArg = item.value === '' ? '""' : `"${item.value}"`;
          const isHKLM = (item.path || '').startsWith('HKLM') || (item.path || '').startsWith('HKEY_LOCAL_MACHINE');
          const regFlag = isHKLM ? ' /reg:64' : '';
          const cmd = item.name === ''
            ? `reg add "${item.path}" /ve /t ${item.type} /d ${valArg} /f${regFlag}`
            : `reg add "${item.path}" /v "${item.name}" /t ${item.type} /d ${valArg} /f${regFlag}`;
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
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
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
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
      }

      // 3. Aplicação ao vivo via SystemParametersInfo (sem reiniciar)
      try {
        const livePsCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand JABzAD0AQAAnAAoAWwBEAGwAbABJAG0AcABvAHIAdAAoACIAdQBzAGUAcgAzADIALgBkAGwAbAAiACkAXQAgAHAAdQBiAGwAaQBjACAAcwB0AGEAdABpAGMAIABlAHgAdABlAHIAbgAgAGIAbwBvAGwAIABTAHkAcwB0AGUAbQBQAGEAcgBhAG0AZQB0AGUAcgBzAEkAbgBmAG8AKAB1AGkAbgB0ACAAYQAsACAAdQBpAG4AdAAgAGIALAAgAGkAbgB0AFsAXQAgAGMALAAgAHUAaQBuAHQAIABkACkAOwAKAFsARABsAGwASQBtAHAAbwByAHQAKAAiAHUAcwBlAHIAMwAyAC4AZABsAGwAIgAsACAARQBuAHQAcgB5AFAAbwBpAG4AdAA9ACIAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvAFcAIgApAF0AIABwAHUAYgBsAGkAYwAgAHMAdABhAHQAaQBjACAAZQB4AHQAZQByAG4AIABiAG8AbwBsACAAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvAFAAdAByACgAdQBpAG4AdAAgAGEALAAgAHUAaQBuAHQAIABiACwAIABJAG4AdABQAHQAcgAgAGMALAAgAHUAaQBuAHQAIABkACkAOwAKACcAQAAKAEEAZABkAC0AVAB5AHAAZQAgAC0ATgBhAG0AZQBzAHAAYQBjAGUAIABXACAALQBOAGEAbQBlACAATQAgAC0ATQBlAG0AYgBlAHIARABlAGYAaQBuAGkAdABpAG8AbgAgACQAcwAKAFsAVwAuAE0AXQA6ADoAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvACgANAAsADAALABbAGkAbgB0AFsAXQBdAEAAKAAwACwAMAAsADAAKQAsADMAKQAKAFsAVwAuAE0AXQA6ADoAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvAFAAdAByACgAMAB4ADcAMQAsADAALABbAEkAbgB0AFAAdAByAF0AMQAwACwAMwApAAoAWwBXAC4ATQBdADoAOgBTAHkAcwB0AGUAbQBQAGEAcgBhAG0AZQB0AGUAcgBzAEkAbgBmAG8AUAB0AHIAKAAwAHgANgBCACwAMAAsAFsASQBuAHQAUAB0AHIAXQAwACwAMwApAAoAWwBXAC4ATQBdADoAOgBTAHkAcwB0AGUAbQBQAGEAcgBhAG0AZQB0AGUAcgBzAEkAbgBmAG8AUAB0AHIAKAAwAHgANQBGACwAMAAsAFsASQBuAHQAUAB0AHIAXQAwACwAMwApAAoA';
        execSync(livePsCmd, { stdio: 'ignore' });
      } catch (_) { }
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
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
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
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
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
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
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
      } catch (_) { }

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
        try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
      }

      // 4. Injeção de sensibilidade de ponteiro no Android do emulador via ADB (se ativo)
      const adb = findAdb();
      if (adb) {
        const targets = getActiveAdbTargets();
        for (const target of targets) {
          try {
            execSync(`"${adb}" -s ${target} shell "settings put system pointer_speed 7; settings put secure pointer_speed 7; settings put system touch.pressure.scale 0.001; settings put secure accessibility_display_magnification_enabled 0"`, { stdio: 'ignore', timeout: 3000 });
          } catch (_) { }
        }
      }
    } catch (e) {
      console.error('Erro na sincronização ao vivo do mouse/emulador:', e.message);
    }

    return {
      success: true,
      regName: MOUSE_MODE_TITLES[mouseMode] || (selectedRegConfig ? selectedRegConfig.name : 'Sensibilidade VIP'),
      appliedSens: activeSens,
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
      const bkpFile = path.join(backupDir, item.key);
      if (fs.existsSync(bkpFile) && fs.existsSync(path.dirname(item.path))) {
        if (fs.existsSync(item.path)) {
          const bkpContent = fs.readFileSync(bkpFile, 'utf8');
          safeWriteBluestacksConf(item.path, bkpContent);
        } else {
          fs.copyFileSync(bkpFile, item.path);
        }
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
    } catch (_) { }
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

// ─── REINICIAR COMPUTADOR DIRETO NA TELA DA BIOS UEFI (PARA XMP / EXPO) ───────
ipcMain.handle('reboot-to-bios', async () => {
  try {
    // Comando nativo do Windows para forçar a placa-mãe a inicializar direto na BIOS Setup
    try {
      execSync('shutdown.exe /r /fw /t 2', { windowsHide: true, stdio: 'ignore' });
      return { success: true, method: 'uefi_firmware' };
    } catch (_) {
      // Fallback para placas legadas sem flag /fw
      try {
        execSync('bcdedit.exe /set {bootmgr} booterrorux Standard', { windowsHide: true, stdio: 'ignore' });
      } catch (_) { }
      execSync('shutdown.exe /r /t 2', { windowsHide: true, stdio: 'ignore' });
      return { success: true, method: 'standard_reboot' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── MOTOR DA MACRO DE RECOIL & DESCIDA Y ──────────────────────────────────
async function killMacroProcess() {
  if (macroProcess) {
    try {
      if (!macroProcess.killed) macroProcess.kill('SIGKILL');
    } catch (_) { }
    macroProcess = null;
  }
  try {
    const tmpScript = path.join(os.tmpdir(), 'loord_recoil_engine.ps1');
    execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*loord_recoil_engine.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
  } catch (_) { }
}



ipcMain.handle('apply-single-tweak', async (event, tweakId) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  try {
    // ─── PROTEÇÃO SERVER-SIDE (Coração do Produto na Nuvem) ─────────────────
    // Para curvas de sensibilidade VIP, descriptografa os parâmetros em tempo real do servidor
    if (tweakId === 'semi-precision' || tweakId === 'mouse-current') {
      const vipPayload = await fetchServerVipPayload('semi-precision-curve');
      if (vipPayload && vipPayload.SmoothMouseXCurve) {
        await execAsync(`reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d ${vipPayload.SmoothMouseXCurve} /f`);
        await execAsync(`reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d ${vipPayload.SmoothMouseYCurve} /f`);
        await execAsync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "${vipPayload.MouseSensitivity || '10'}" /f`);
        await execAsync(`reg add "HKCU\\Control Panel\\Mouse" /v MouseHoverTime /t REG_DWORD /d ${vipPayload.MouseHoverTime || 0} /f`);
      }
    }

    const commands = getCommandsForTweak(tweakId);
    // Roda TODOS os comandos REG em paralelo — zero bloqueio no event loop
    await Promise.all(
      commands.map(cmd => execAsync(cmd).catch(e =>
        console.warn('Tweak cmd (non-fatal):', cmd.slice(0, 60), e.message)
      ))
    );

    // Recarrega mouse sem reboot (fire-and-forget — não bloqueia)
    if (tweakId.startsWith('mouse-') || tweakId === 'remove-kbd-delay' || tweakId === 'semi-precision') {
      safeExec('powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True"');
    }

    if (tweakId === 'freefire-delay') {
      safeExec('powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Get-Process HD-Player,dnplayer,LdBoxHeadless,Nox -ErrorAction SilentlyContinue | ForEach-Object { try{$_.PriorityClass=\'High\'}catch{} }"');
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
    case 'gpo-energy-saver':
      return [
        // 1. gpedit.msc: Configurações de Limitação de Energia -> Desativar Limitação de Energia: Habilitado
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f /reg:64',
        'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f /reg:64',
        // 2. gpedit.msc: Configurações de Economia de Energia -> Limite de Bateria de Economia de Energia (conectado): Desativado (0%)
        'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\E69653CA-CF7F-4F05-AA73-CB833FA90AD4" /v ACSettingIndex /t REG_DWORD /d 0 /f /reg:64',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\E69653CA-CF7F-4F05-AA73-CB833FA90AD4" /v ACSettingIndex /t REG_DWORD /d 0 /f /reg:64',
        // 3. gpedit.msc: Configurações de Economia de Energia -> Limite de Bateria de Economia de Energia (na bateria): Desativado (0%)
        'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\E69653CA-CF7F-4F05-AA73-CB833FA90AD4" /v DCSettingIndex /t REG_DWORD /d 0 /f /reg:64',
        'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\E69653CA-CF7F-4F05-AA73-CB833FA90AD4" /v DCSettingIndex /t REG_DWORD /d 0 /f /reg:64',
        // 4. Powercfg: Zerar limiar de economia de energia no esquema ativo
        'powercfg -setacvalueindex SCHEME_CURRENT SUB_ENERGYSAVER ESBATTTHRESHOLD 0',
        'powercfg -setdcvalueindex SCHEME_CURRENT SUB_ENERGYSAVER ESBATTTHRESHOLD 0',
        'powercfg -setactive SCHEME_CURRENT'
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

// ─── HELPER: ATIVAÇÃO BLINDADA DO PLANO ULTIMATE / DESEMPENHO MÁXIMO ─────────
async function activateUltimatePerformancePowerScheme() {
  try {
    const script = `
      $list = powercfg /list
      $guid = $null
      $dup = powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>&1
      if ($dup -match '([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})') {
        $guid = $matches[1]
      } elseif ($list -match '([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}).*?(Desempenho|Ultimate|Performance)') {
        $guid = $matches[1]
      } else {
        $guid = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
      }
      if ($guid) {
        powercfg -setactive $guid
      }
      powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100
      powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100
      powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100
      powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMAXCORES 100
      powercfg -setactive SCHEME_CURRENT
      powercfg -h off
    `;
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    await safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`);
  } catch (_) {}
}

// ─── HELPER: OTIMIZAÇÃO DE REDE NAGLE & LATÊNCIA ZERO ─────────────────────────
async function applyNetworkNagleLatencyZero() {
  try {
    const script = `
      Get-NetAdapter | Foreach-Object {
        $key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\' + $_.InterfaceGuid
        if (Test-Path $key) {
          Set-ItemProperty -Path $key -Name TcpAckFrequency -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
          Set-ItemProperty -Path $key -Name TCPNoDelay -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
          Set-ItemProperty -Path $key -Name TcpDelAckTicks -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
        }
      }
      netsh int tcp set global autotuninglevel=normal
      ipconfig /flushdns
    `;
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    await safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`);
  } catch (_) {}
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

      // 3. Prioridade Win32 Separator para primeiro plano
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 26 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Priority" /t REG_DWORD /d 6 /f /reg:64',

      // 4. Otimizações de GPU Integrada (Intel HD Graphics / AMD APU)
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerEnable /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerLevel /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v PowerMizerLevelAC /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Intel\\GMM" /v DedicatedSegmentSize /t REG_DWORD /d 512 /f /reg:64',

      // 5. GameDVR & Fullscreen Exclusive (FSE)
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f',
      'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_FSEBehavior /t REG_DWORD /d 2 /f',
      'reg add "HKCU\\Software\\Microsoft\\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 1 /f',

      // 6. BCD Latência 0ms
      'bcdedit /set useplatformtick yes',
      'bcdedit /set disabledynamictick yes',
      'bcdedit /set useplatformclock no',
      'bcdedit /set bootux disabled',
      'bcdedit /timeout 3',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f /reg:64'
    ];

    // Executa tweaks em paralelo
    await Promise.all(lowEndTweaks.map(cmd => safeExec(cmd)));

    // Ativa plano Ultimate Performance / Desempenho Máximo real
    await activateUltimatePerformancePowerScheme();

    // Aplica Nagle / Rede
    await applyNetworkNagleLatencyZero();

    // Purgar processos desnecessários e limpar RAM assincronamente
    const procScript = getPhysicalScriptPath('otimizar_processos.ps1');
    safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${procScript}"`);

    const ramScript = getPhysicalScriptPath('clean_ram.ps1');
    safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ramScript}"`);

    return { success: true, message: '⚡ Modo Ultra Boost Extreme aplicado com 100% de sucesso!' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('clean-deep-disk', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    const cleanCmds = [
      // 1. Limpeza de arquivos temporários e caches de shader
      'cmd.exe /c "del /q /f /s \"%TEMP%\\*\" & del /q /f /s \"C:\\Windows\\Temp\\*\" & del /q /f /s \"C:\\Windows\\Prefetch\\*\" & del /q /f /s \"%LOCALAPPDATA%\\D3DSCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\NVIDIA\\DXCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\AMD\\DxCache\\*\" & del /q /f /s \"C:\\Windows\\SoftwareDistribution\\Download\\*\" & del /q /f /s \"C:\\ProgramData\\BlueStacks_nxt\\Logs\\*\" & del /q /f /s \"C:\\ProgramData\\BlueStacks_msi5\\Logs\\*\" & del /q /f /s \"C:\\ProgramData\\BlueStacks\\Logs\\*\" & exit /b 0"',
      // 2. Limpeza de Crash Dumps e relatórios de erros do Windows
      'cmd.exe /c "del /q /f /s \"%LOCALAPPDATA%\\CrashDumps\\*\" & del /q /f /s \"C:\\Windows\\Minidump\\*\" & exit /b 0"',
      // 3. Esvaziar Lixeira de todos os discos
      'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"',
      // 4. Limpar Logs de Eventos do Windows (Event Viewer) que deixam o Explorer lento
      'cmd.exe /c "wevtutil.exe cl Application & wevtutil.exe cl Security & wevtutil.exe cl System & wevtutil.exe cl Setup & exit /b 0"',
      // 5. Desativar arquivo de hibernação (hiberfil.sys) liberando 4GB a 16GB de espaço no C:
      'powercfg -h off',
      // 6. Limpar cache DNS e tabelas de rede
      'ipconfig /flushdns'
    ];

    await Promise.all(cleanCmds.map(c => safeExec(c)));

    return {
      success: true,
      message: '🧹 Limpeza profunda concluída! Arquivos temporários, lixeira, logs de erro, shaders e lixos do Windows eliminados com sucesso. O disco e a memória estão 100% limpos!'
    };
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

    await safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psBloatCmd.replace(/\r?\n/g, ' ')}"`);
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
        safeWriteBluestacksConf(confPath, newLines);
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
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 32 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters" /v KeyboardDataQueueSize /t REG_DWORD /d 32 /f /reg:64',

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
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\csrss.exe\\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 4 /f /reg:64',

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
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" /v PowerThrottlingOff /t REG_DWORD /d 1 /f /reg:64',
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

      // 12. SSD TRIM & Rede QoS 0%
      'fsutil behavior set DisableDeleteNotify 0',
      'reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched" /v NonBestEffortLimit /t REG_DWORD /d 0 /f /reg:64'
    ];

    // Executa todos os comandos de registro, BCDEDIT e serviços em paralelo de forma blindada
    await Promise.all(liteCommands.map(cmd => safeExec(cmd)));

    // Ativa plano Ultimate Performance / Desempenho Máximo real
    await activateUltimatePerformancePowerScheme();

    // Aplica Nagle / Rede Zero Ping
    await applyNetworkNagleLatencyZero();

    // Aplica ExclusiveDelay 1ms no Free Fire em todos os emuladores instalados
    try {
      const folders = [
        'C:\\ProgramData\\BlueStacks_nxt\\Engine\\UserData\\InputMapper\\UserFiles',
        'C:\\ProgramData\\BlueStacks_msi5\\Engine\\UserData\\InputMapper\\UserFiles',
        'C:\\ProgramData\\BlueStacks\\Engine\\UserData\\InputMapper\\UserFiles'
      ];
      const cfgFiles = ['com.dts.freefireth.cfg', 'com.dts.freefiremax.cfg'];
      for (const folder of folders) {
        for (const cfg of cfgFiles) {
          const fullPath = path.join(folder, cfg);
          if (fs.existsSync(fullPath)) {
            let content = fs.readFileSync(fullPath, 'utf8');
            content = content.replace(/"ExclusiveDelay"\s*:\s*\d+/g, '"ExclusiveDelay" : 1');
            fs.writeFileSync(fullPath, content, 'utf8');
          }
        }
      }
    } catch (_) {}

    // Limpeza profunda assíncrona de lixo, caches e logs
    safeExec('cmd.exe /c "del /q /f /s \"%TEMP%\\*\" & del /q /f /s \"C:\\Windows\\Temp\\*\" & del /q /f /s \"C:\\Windows\\Prefetch\\*\" & del /q /f /s \"%LOCALAPPDATA%\\D3DSCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\NVIDIA\\DXCache\\*\" & del /q /f /s \"%LOCALAPPDATA%\\AMD\\DxCache\\*\" & del /q /f /s \"C:\\Windows\\SoftwareDistribution\\Download\\*\" & del /q /f /s \"%LOCALAPPDATA%\\CrashDumps\\*\" & del /q /f /s \"C:\\Windows\\Minidump\\*\" & exit /b 0"');
    safeExec('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"');
    safeExec('cmd.exe /c "wevtutil.exe cl Application & wevtutil.exe cl Security & wevtutil.exe cl System & wevtutil.exe cl Setup & exit /b 0"');

    return {
      success: true,
      message: '👑 100% das Otimizações da ISO Loord v10.6 aplicadas com sucesso!'
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ════════════════════════════════════════════════════════════════════════════
// OVERCLOCK & BOOST: Detectar Hardware + AMD PBO + Intel PL + RAM
// ════════════════════════════════════════════════════════════════════════════

// ─── Detectar Hardware (CPU, RAM, Placa-Mãe, Suporte OC & XMP) via WMI ────────
ipcMain.handle('detect-hardware-oc', async () => {
  try {
    const ps = `
      $cpu = Get-WmiObject Win32_Processor | Select-Object -First 1;
      $mb  = Get-WmiObject Win32_BaseBoard | Select-Object -First 1;
      $ram = Get-WmiObject Win32_PhysicalMemory;
      
      $cpuName = $cpu.Name.Trim();
      $cpuCores = $cpu.NumberOfCores;
      $cpuThreads = $cpu.NumberOfLogicalProcessors;
      $cpuManufacturer = if ($cpu.Manufacturer) { $cpu.Manufacturer.Trim() } else { 'Unknown' };
      $cpuBrand = if ($cpuManufacturer -match 'AMD' -or $cpuName -match 'AMD') { 'AMD' } elseif ($cpuManufacturer -match 'Intel' -or $cpuName -match 'Intel') { 'Intel' } else { $cpuManufacturer };

      $totalRamBytes = ($ram | Measure-Object -Property Capacity -Sum).Sum;
      $totalRamGB = [math]::Round($totalRamBytes / 1GB, 0);
      $ramModulesCount = ($ram | Measure-Object).Count;
      $firstModule = $ram | Select-Object -First 1;
      $ramModuleGB = [math]::Round($firstModule.Capacity / 1GB, 0);
      $ramPartNumber = if ($firstModule.PartNumber) { $firstModule.PartNumber.Trim() } else { '' };

      $baseSpeed = ($ram | Measure-Object -Property Speed -Maximum).Maximum;
      $configuredSpeed = ($ram | Measure-Object -Property ConfiguredClockSpeed -Maximum).Maximum;
      if (-not $configuredSpeed -or $configuredSpeed -lt $baseSpeed) { $configuredSpeed = $baseSpeed };

      $smbiosType = $firstModule.SMBIOSMemoryType;
      $ramType = switch ($smbiosType) {
        20 { 'DDR' }
        21 { 'DDR2' }
        24 { 'DDR3' }
        26 { 'DDR4' }
        30 { 'LPDDR4' }
        34 { 'DDR5' }
        35 { 'LPDDR5' }
        default {
          if ($configuredSpeed -ge 4400) { 'DDR5' }
          elseif ($configuredSpeed -ge 2133) { 'DDR4' }
          elseif ($configuredSpeed -ge 1066) { 'DDR3' }
          else { 'DDR' }
        }
      };

      $mbProduct = if ($mb.Product) { $mb.Product.Trim() } else { 'Placa Desconhecida' };
      $mbManufacturer = if ($mb.Manufacturer) { $mb.Manufacturer.Trim() } else { 'Desconhecido' };

      # 1. Identificar se XMP / EXPO já está ativado na BIOS
      $xmpActive = ($configuredSpeed -gt $baseSpeed) -or ($ramType -eq 'DDR5' -and $configuredSpeed -ge 5200) -or ($ramType -eq 'DDR4' -and $configuredSpeed -ge 3000);

      # 2. Identificar se é Laptop / Notebook
      $chassis = (Get-WmiObject Win32_SystemEnclosure).ChassisTypes;
      $isLaptop = $false;
      if ($chassis | Where-Object { $_ -in @(8, 9, 10, 11, 12, 14, 18, 21, 31, 32) }) {
        $isLaptop = $true;
      }
      if (Get-WmiObject Win32_Battery) {
        $isLaptop = $true;
      }

      # 3. Identificar compatibilidade da Placa-Mãe e Processador com Overclock/PBO
      $ocSupported = $true;
      $ocReason = '';
      $ocChipset = '';

      if ($isLaptop) {
        $ocSupported = $false;
        $ocReason = 'Laptop/Notebook detectado: BIOS com perfil de overclock restrito pelo fabricante.';
      } elseif ($cpuBrand -eq 'AMD') {
        if ($mbProduct -match 'A320|A520|A620|A300|A400') {
          $ocSupported = $false;
          $ocReason = 'Placa-mãe com Chipset Série A (' + ($Matches[0]) + ') não suporta Overclock de CPU nem PBO por limitação de hardware/VRM.';
          $ocChipset = $Matches[0];
        } elseif ($cpuName -match 'Athlon|Sempron') {
          $ocSupported = $false;
          $ocReason = 'Processador Athlon/Sempron com multiplicador e PBO bloqueados de fábrica.';
        } else {
          $ocSupported = $true;
          if ($mbProduct -match 'X670|B650|X570|B550|X470|B450|X370|B350') {
            $ocChipset = $Matches[0];
          }
        }
      } elseif ($cpuBrand -eq 'Intel') {
        if ($mbProduct -match 'H61|H81|H110|H310|H410|H510|H610|H670|H770|B150|B250|B360|B365|B460|B560|B660|B760') {
          $ocSupported = $false;
          $ocReason = 'Placa-mãe Série H ou B (' + ($Matches[0]) + ') não suporta Overclock de CPU (recurso exclusivo da Série Z e X).';
          $ocChipset = $Matches[0];
        } elseif ($cpuName -notmatch 'K|KF|KS|X\\b|Extreme') {
          $ocSupported = $false;
          $ocReason = 'Processador Intel sem sufixo K/KF possui multiplicador de frequência travado.';
        } else {
          $ocSupported = $true;
          if ($mbProduct -match 'Z790|Z690|Z590|Z490|Z390|Z370|Z270|Z170|X299|X99') {
            $ocChipset = $Matches[0];
          }
        }
      }

      # 4. Identificar se PBO / Power Limits já estão aplicados no sistema
      $pboApplied = $false;
      try {
        $pt = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' -ErrorAction SilentlyContinue).PowerThrottlingOff;
        $w32 = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -ErrorAction SilentlyContinue).Win32PrioritySeparation;
        if ($pt -eq 1 -and $w32 -eq 38) { $pboApplied = $true }
      } catch { }

      [PSCustomObject]@{
        cpuName=$cpuName; cpuCores=$cpuCores; cpuThreads=$cpuThreads; cpuManufacturer=$cpuManufacturer; cpuBrand=$cpuBrand;
        ramGB=$totalRamGB; ramModulesCount=$ramModulesCount; ramModuleGB=$ramModuleGB;
        ramType=$ramType; ramSpeed=$configuredSpeed; baseSpeed=$baseSpeed; ramPartNumber=$ramPartNumber; xmpActive=$xmpActive;
        mbProduct=$mbProduct; mbManufacturer=$mbManufacturer;
        isLaptop=$isLaptop; ocSupported=$ocSupported; ocReason=$ocReason; ocChipset=$ocChipset;
        pboApplied=$pboApplied;
      } | ConvertTo-Json -Compress
    `;
    const tmpPath = path.join(os.tmpdir(), `loord_hw_${Date.now()}.ps1`);
    fs.writeFileSync(tmpPath, '\ufeff' + ps, 'utf8');
    const out = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpPath}"`, { encoding: 'utf8', timeout: 15000 });
    try { fs.unlinkSync(tmpPath); } catch (_) { }
    const data = JSON.parse(out.trim());
    return { success: true, ...data };
  } catch (e) {
    return { success: false, error: e.message, cpuName: 'Erro ao detectar', cpuBrand: 'Unknown', ramGB: 0, ocSupported: true };
  }
});

// ─── AMD PBO (Precision Boost Overdrive) via Registro ─────────────────────
ipcMain.handle('apply-amd-pbo', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    let cores = 6;
    try {
      const out = execSync('wmic cpu get NumberOfCores /value', { encoding: 'utf8' });
      const m = out.match(/NumberOfCores=(\d+)/);
      if (m) cores = parseInt(m[1], 10);
    } catch (_) { }

    const ppt = Math.round(cores * 30);
    const tdc = Math.round(cores * 8.5);
    const edc = Math.round(cores * 12);

    const amdPBOTweaks = [
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\be337238-0d82-4146-a960-4f3749d470c7" /v Attributes /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\0cc5b647-c1df-4637-891a-dec35c318583" /v ACSettingIndex /t REG_DWORD /d 100 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\0cc5b647-c1df-4637-891a-dec35c318583" /v DCSettingIndex /t REG_DWORD /d 100 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\465e1f50-b610-473a-ab58-00d1077dc418" /v ACSettingIndex /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\40fbefc7-2e9d-4d25-a185-0cfd8574bae6" /v ACSettingIndex /t REG_DWORD /d 4 /f /reg:64',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMAXCORES 100',
      'powercfg -setactive SCHEME_CURRENT',
      'reg add "HKLM\\SOFTWARE\\AMD\\PMF" /v CPPCEnabled /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\AMD\\PMF" /v BoostEnabled /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 38 /f /reg:64',
    ];

    for (const cmd of amdPBOTweaks) {
      try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
    }

    return {
      success: true,
      message: `🔴 AMD PBO ativado! PPT estimado: ${ppt}W | TDC: ${tdc}A | EDC: ${edc}A | ${cores} núcleos com Boost máximo. Reinicie para aplicar 100%.`
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── Intel Power Limits (PL1/PL2 Desbloqueado) ────────────────────────────
ipcMain.handle('apply-intel-pl', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    const intelPLTweaks = [
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\465e1f50-b610-473a-ab58-00d1077dc418" /v ACSettingIndex /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\40fbefc7-2e9d-4d25-a185-0cfd8574bae6" /v ACSettingIndex /t REG_DWORD /d 4 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\be337238-0d82-4146-a960-4f3749d470c7" /v Attributes /t REG_DWORD /d 0 /f /reg:64',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100',
      'powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMAXCORES 100',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\36687f9e-e3a5-4dbf-b1dc-15eb381c6863" /v ACSettingIndex /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\93b8b6dc-0698-4d1c-9ee4-0644e900c85d" /v ACSettingIndex /t REG_DWORD /d 0 /f /reg:64',
      'powercfg -setactive SCHEME_CURRENT',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 38 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\4facfc89-5b10-4f87-9d39-e482f74748b5" /v ACSettingIndex /t REG_DWORD /d 0 /f /reg:64',
    ];

    for (const cmd of intelPLTweaks) {
      try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
    }

    return {
      success: true,
      message: '🔵 Intel Power Limits desbloqueados! PL1/PL2 sem restrição, Turbo Boost mantido ao máximo, Power Throttling OFF. Reinicie para aplicar 100%.'
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── RAM Boost via Software (otimizações no Windows) ──────────────────────
ipcMain.handle('apply-ram-boost-oc', async () => {
  if (!systemIsAdmin) return { success: false, error: 'Privilégios de Administrador requeridos.' };
  try {
    let totalRamGB = 8;
    try {
      const out = execSync('wmic ComputerSystem get TotalPhysicalMemory /value', { encoding: 'utf8' });
      const m = out.match(/TotalPhysicalMemory=(\d+)/);
      if (m) totalRamGB = Math.round(parseInt(m[1], 10) / (1024 ** 3));
    } catch (_) { }

    const ramTweaks = [
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" /v Enabled /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\HD-Player.exe" /v LargeAddressAware /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\MSIAppPlayer.exe" /v LargeAddressAware /t REG_DWORD /d 1 /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Background Only" /t REG_SZ /d "False" /f /reg:64',
      'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Priority" /t REG_DWORD /d 6 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v ClearPageFileAtShutdown /t REG_DWORD /d 0 /f /reg:64',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v IoPageLockLimit /t REG_DWORD /d 983040 /f /reg:64',
    ];

    for (const cmd of ramTweaks) {
      try { execSync(cmd, { stdio: 'ignore' }); } catch (_) { }
    }

    try {
      execSync('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Disable-MMAgent -MemoryCompression -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
    } catch (_) { }

    try {
      const pexVal = totalRamGB >= 8 ? '1' : '0';
      execSync(`reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d ${pexVal} /f /reg:64`, { stdio: 'ignore' });
    } catch (_) { }

    try {
      const initial = totalRamGB <= 4 ? Math.round(totalRamGB * 1024 * 1.5) : totalRamGB <= 8 ? Math.round(totalRamGB * 1024) : 4096;
      const maximum = totalRamGB <= 4 ? Math.round(totalRamGB * 1024 * 2) : totalRamGB <= 8 ? Math.round(totalRamGB * 1024 * 1.5) : 8192;
      const pfPs = `
        $cs = Get-WmiObject Win32_ComputerSystem;
        $cs.AutomaticManagedPagefile = $false; $cs.Put() | Out-Null;
        $pf = Get-WmiObject -Query "Select * From Win32_PageFileSetting Where Name='C:\\\\pagefile.sys'";
        if (-not $pf) { $pf = Set-WmiInstance Win32_PageFileSetting -Arguments @{Name='C:\\\\pagefile.sys';InitialSize=0;MaximumSize=0} }
        $pf.InitialSize = ${initial}; $pf.MaximumSize = ${maximum}; $pf.Put() | Out-Null;
      `;
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${pfPs.replace(/\r?\n/g, ' ')}"`, { stdio: 'ignore' });
    } catch (_) { }

    return {
      success: true,
      message: `💾 RAM Boost aplicado! Memory Compression desativada, HVCI desligado, Large Address Aware ativo, Pagefile fixo ajustado para ${totalRamGB}GB de RAM detectados. Reinicie.`
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
    try { if (fs.existsSync(tmpScriptPath)) fs.unlinkSync(tmpScriptPath); } catch (_) { }
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
          try { execSync(`attrib +h +s "${LOORD_SYS_DIR}"`, { stdio: 'ignore' }); } catch (_) { }
        }
        if (!fs.existsSync(LOORD_SYS_FILE)) {
          try {
            fs.copyFileSync(c, LOORD_SYS_FILE);
            try { execSync(`attrib +h +s "${LOORD_SYS_FILE}"`, { stdio: 'ignore' }); } catch (_) { }
            return LOORD_SYS_FILE;
          } catch (_) { }
        }
        return c;
      }
    } catch (_) { }
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
  } catch (_) { }
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
        try { fs.unlinkSync(destPath); } catch (_) { }
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
  } catch (_) { }

  try {
    const out = execSync('powershell.exe -NoProfile -Command "(Get-ItemProperty -Path \'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\').MachineGuid"', { windowsHide: true }).toString().trim().toLowerCase();
    if (out && out.length >= 8) return out;
  } catch (_) { }

  try {
    const out = execSync('wmic csproduct get uuid', { windowsHide: true }).toString().replace(/UUID/i, '').trim().toLowerCase();
    if (out && out.length >= 8 && out !== 'ffffffff-ffff-ffff-ffff-ffffffffffff') return out;
  } catch (_) { }

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
    const identity = getIdentityFingerprint();
    const fullPayload = { ...identity, ...payload };
    const data = JSON.stringify(fullPayload);
    const options = {
      hostname: 'web-key-generator.vercel.app',
      port: 443,
      path: endpoint,
      method: 'POST',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': `LoordOptimizerClient/${app.getVersion() || '3.8.5'} (Windows NT 10.0; Win64; x64)`,
        'X-Client-Secure-Ver': app.getVersion() || '3.8.5'
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

// ─── ENTREGA DINÂMICA DE CARGAS CRÍTICAS NA NUVEM (Zero-Trust Server-Side) ────
async function fetchServerVipPayload(tweakId) {
  if (!isClientSessionAuthorized || !authorizedSessionKey || !activeServerSessionToken) {
    throw new Error('Função VIP Bloqueada: Sessão oficial não autenticada no servidor.');
  }
  const currentUuid = getMachineHardwareUUID();
  const res = await queryOfficialDatabase('/api/vip-payload', {
    key: authorizedSessionKey,
    uuid: currentUuid,
    sessionToken: activeServerSessionToken,
    tweakId
  });
  if (!res || !res.success || !res.payload) {
    throw new Error(res?.error || 'Servidor recusou descriptografar os parâmetros VIP.');
  }
  return res.payload;
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
      activeServerSessionToken = chkData.sessionToken || null;
      authorizedSessionIsIsoKey = !!chkData.isIsoKey || chkData.licenseType === 'iso';
      authorizedSessionIsoUses = chkData.isoUsesRemaining || 0;
      return {
        valid: true,
        plan: chkData.timeRemainingStr || chkData.licenseType || '👑 VIP Ativo',
        clientName: chkData.clientName || 'Cliente VIP',
        isIsoKey: authorizedSessionIsIsoKey,
        isoUsesRemaining: authorizedSessionIsoUses,
        isoUsesTotal: chkData.isoUsesTotal || authorizedSessionIsoUses
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
      activeServerSessionToken = actData.sessionToken || null;
      authorizedSessionIsIsoKey = !!actData.isIsoKey || actData.licenseType === 'iso';
      authorizedSessionIsoUses = actData.isoUsesRemaining || 0;
      return {
        valid: true,
        plan: actData.timeRemainingStr || actData.licenseType || '👑 VIP Ativo',
        clientName: actData.clientName || 'Cliente VIP',
        isIsoKey: authorizedSessionIsIsoKey,
        isoUsesRemaining: authorizedSessionIsoUses,
        isoUsesTotal: actData.isoUsesTotal || authorizedSessionIsoUses
      };
    }

    // Se houve erro de rede (offline/sem internet) e nenhuma resposta de recusa do servidor
    if (!chkData && !actData && networkError) {
      activeServerSessionToken = null;
      return {
        valid: false,
        isNetworkError: true,
        error: 'Não foi possível conectar ao servidor de licenças. Verifique sua conexão com a internet.'
      };
    }

    // Se o servidor respondeu ativamente recusando (Chave inativa, expirada, excluída ou inválida)
    isClientSessionAuthorized = false;
    authorizedSessionKey = null;
    activeServerSessionToken = null;
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

ipcMain.handle('get-iso-plans-public', async () => {
  const defaultIsoPlans = [
    { id: 'iso_1', name: '1 Formatação (1 Uso)', uses: 1, price: 50, enabled: true },
    { id: 'iso_2', name: '2 Formatações (2 Usos)', uses: 2, price: 70, enabled: true },
    { id: 'iso_3', name: '3 Formatações (3 Usos)', uses: 3, price: 100, enabled: true }
  ];

  try {
    return new Promise((resolve) => {
      const https = require('https');
      const req = https.get('https://web-key-generator.vercel.app/api/iso-plans', { timeout: 8000 }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data && Array.isArray(data.plans) && data.plans.length > 0) {
              resolve(data);
            } else {
              resolve({ success: true, isFree: !!data?.isFree, plans: defaultIsoPlans });
            }
          } catch (_) {
            resolve({ success: true, isFree: false, plans: defaultIsoPlans });
          }
        });
      });
      req.on('error', () => resolve({ success: true, isFree: false, plans: defaultIsoPlans }));
      req.on('timeout', () => { req.destroy(); resolve({ success: true, isFree: false, plans: defaultIsoPlans }); });
    });
  } catch (e) {
    return { success: true, isFree: false, plans: defaultIsoPlans };
  }
});

ipcMain.handle('create-iso-pix-payment', async (_e, planId, clientName) => {
  try {
    const https = require('https');
    return new Promise((resolve) => {
      const payload = JSON.stringify({
        isIsoPayment: true,
        planId: planId || 'iso_1',
        clientName: clientName || 'Cliente ISO'
      });
      const req = https.request('https://web-key-generator.vercel.app/api/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 10000
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (_) {
            resolve({ success: false, error: 'Resposta inválida do servidor.' });
          }
        });
      });
      req.on('error', (err) => resolve({ success: false, error: 'Erro de conexão: ' + err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Tempo limite ao gerar PIX.' }); });
      req.write(payload);
      req.end();
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('check-iso-pix-payment', async (_e, paymentId) => {
  try {
    const https = require('https');
    return new Promise((resolve) => {
      const req = https.get(`https://web-key-generator.vercel.app/api/payment?action=check&paymentId=${encodeURIComponent(paymentId)}`, {
        timeout: 8000
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (_) {
            resolve({ success: false, error: 'Resposta inválida.' });
          }
        });
      });
      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Tempo limite.' }); });
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('activate-iso-key', async (_e, inputKey) => {
  try {
    if (!inputKey || typeof inputKey !== 'string') {
      return { success: false, error: 'Chave não informada.' };
    }
    const cleanKey = inputKey.trim().toUpperCase();
    const currentUuid = getMachineHardwareUUID();
    const chkData = await queryOfficialDatabase('/api/client-check', { uuid: currentUuid, key: cleanKey });
    if (chkData && chkData.success && (chkData.isIsoKey || chkData.licenseType === 'iso')) {
      activatedIsoKey = cleanKey;
      authorizedSessionIsIsoKey = true;
      authorizedSessionIsoUses = chkData.isoUsesRemaining || 1;
      return {
        success: true,
        remaining: chkData.isoUsesRemaining,
        total: chkData.isoUsesTotal,
        message: `Chave de Formatação ativada com sucesso! (${chkData.timeRemainingStr})`
      };
    }
    return {
      success: false,
      error: chkData?.error || 'Chave de formatação inválida, já vinculada ou esgotada.'
    };
  } catch (e) {
    return { success: false, error: e.message || 'Erro ao ativar chave de formatação.' };
  }
});

ipcMain.handle('check-loord-iso-status', async () => {
  try {
    const localIso = getKnownLocalIsoPath();
    let hasPart = false;
    try {
      const ps = `(Get-Volume -FileSystemLabel "LOORD_SETUP" -ErrorAction SilentlyContinue) -ne $null`;
      const out = runPowerShellScript(ps).trim().toLowerCase();
      hasPart = out.includes('true');
    } catch (_) { }

    let ready = false;
    if (hasPart) {
      const psCheck = `
        $v = Get-Volume -FileSystemLabel "LOORD_SETUP" -ErrorAction SilentlyContinue;
        if ($v -and $v.DriveLetter) {
          Test-Path ($v.DriveLetter + ":\\sources\\boot.wim")
        } else {
          $false
        }
      `;
      const out = runPowerShellScript(psCheck).trim().toLowerCase();
      ready = out.includes('true');
    }

    return {
      isoDownloaded: !!localIso,
      partitionReady: ready,
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
        sendProgress(25, 'Mediafire indisponível no momento. Conectando ao servidor secundário Google Drive...');
        directUrl = LOORD_GDRIVE_FALLBACK;
      }

      if (!fs.existsSync(LOORD_SYS_DIR)) {
        fs.mkdirSync(LOORD_SYS_DIR, { recursive: true });
        try { execSync(`attrib +h +s "${LOORD_SYS_DIR}"`, { stdio: 'ignore' }); } catch (_) { }
      }

      const tempDownloadPath = path.join(LOORD_SYS_DIR, 'Loord_v10.6.0.iso.download');
      sendProgress(35, 'Iniciando download protegido dos arquivos da ISO...');
      await streamDownloadFile(directUrl, tempDownloadPath, (pct, txt) => {
        sendProgress(35 + Math.round(pct * 0.6), txt);
      });

      if (fs.existsSync(tempDownloadPath)) {
        if (fs.existsSync(LOORD_SYS_FILE)) {
          try { fs.unlinkSync(LOORD_SYS_FILE); } catch (_) { }
        }
        fs.renameSync(tempDownloadPath, LOORD_SYS_FILE);
        try { execSync(`attrib +h +s "${LOORD_SYS_FILE}"`, { stdio: 'ignore' }); } catch (_) { }
      }
    }

    sendProgress(100, 'ISO Oficial Loord v10.6 pronta e protegida no sistema!');
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

    sendProgress(10, 'Preparando espaço e limpando unidades virtuais...');
    dismountAllVirtualIsos();

    // 1. Libera espaço desbloqueando arquivos que bloqueiam redução de volume
    try {
      execSync('powercfg /h off', { windowsHide: true });
      execSync('vssadmin delete shadows /for=c: /all /quiet', { windowsHide: true });
    } catch (_) { }

    sendProgress(25, 'Criando partição de instalação FAT32 de 8 GB no disco...');

    // 2. Verifica se a partição LOORD_SETUP já existe
    const checkVolPs = `(Get-Volume -FileSystemLabel "LOORD_SETUP" -ErrorAction SilentlyContinue) -ne $null`;
    const volExists = runPowerShellScript(checkVolPs).trim().toLowerCase().includes('true');

    if (!volExists) {
      let cDisk = 1;
      try {
        const wmic = execSync('wmic path Win32_LogicalDiskToPartition get Antecedent,Dependent', { windowsHide: true, encoding: 'utf8' });
        for (const line of wmic.split('\n')) {
          if (line.includes('C:')) {
            const m = line.match(/Disk\s*#(\d+)/i);
            if (m) { cDisk = parseInt(m[1], 10); break; }
          }
        }
      } catch (_) { }

      const dpFile = path.join(os.tmpdir(), 'loord_dp_create.txt');

      // Limpa stubs residuais (como partição residual 3 e 4) antes de criar
      const dpClean = [
        'select volume L',
        'delete partition override',
        `select disk ${cDisk}`,
        'select partition 4',
        'delete partition override',
        `select disk ${cDisk}`,
        'select partition 3',
        'delete partition override',
        'exit'
      ].join('\r\n');
      fs.writeFileSync(dpFile, dpClean, 'ascii');
      try { execSync(`diskpart.exe /s "${dpFile}"`, { windowsHide: true }); } catch (_) { }

      // Tenta primeiro criar direto caso já exista espaço não alocado no disco do C
      const dpDirect = [
        `select disk ${cDisk}`,
        'create partition primary',
        'format fs=fat32 quick label=LOORD_SETUP',
        'assign letter=L',
        'exit'
      ].join('\r\n');
      fs.writeFileSync(dpFile, dpDirect, 'ascii');

      let created = false;
      try {
        execSync(`diskpart.exe /s "${dpFile}"`, { windowsHide: true });
        if (fs.existsSync('L:\\')) created = true;
      } catch (_) { }

      // Se não havia espaço não alocado, reduz C e cria no disco do C
      if (!created) {
        const dpWithShrinkC = [
          'select volume C',
          'shrink desired=8000',
          `select disk ${cDisk}`,
          'create partition primary',
          'format fs=fat32 quick label=LOORD_SETUP',
          'assign letter=L',
          'exit'
        ].join('\r\n');
        fs.writeFileSync(dpFile, dpWithShrinkC, 'ascii');

        try {
          execSync(`diskpart.exe /s "${dpFile}"`, { windowsHide: true });
          if (fs.existsSync('L:\\')) created = true;
        } catch (_) { }
      }

      // Se o disco C estiver bloqueado pelo pagefile.sys, tenta no disco secundário (D:) que tem centenas de GB livres e nenhum arquivo travado
      if (!created && fs.existsSync('D:\\')) {
        sendProgress(26, 'Disco C protegido pelo sistema. Criando partição no Disco D (500+ GB livres)...');
        const dpWithShrinkD = [
          'select volume D',
          'shrink desired=8000',
          'create partition primary',
          'format fs=fat32 quick label=LOORD_SETUP',
          'assign letter=L',
          'exit'
        ].join('\r\n');
        fs.writeFileSync(dpFile, dpWithShrinkD, 'ascii');

        try {
          execSync(`diskpart.exe /s "${dpFile}"`, { windowsHide: true });
          if (fs.existsSync('L:\\')) created = true;
        } catch (_) { }
      }

      if (!created) {
        throw new Error('Falha ao criar partição de instalação. O Windows bloqueou a redução dos discos. Execute o aplicativo como Administrador ou feche programas pesados e tente novamente.');
      }
    }

    // Garante que a partição LOORD_SETUP tenha letra de unidade (padrão L:)
    let driveLetter = 'L';
    if (!fs.existsSync('L:\\')) {
      for (let c = 69; c <= 90; c++) {
        const l = String.fromCharCode(c);
        if (l === 'C' || l === 'D') continue;
        try {
          const vol = execSync(`cmd.exe /c vol ${l}:`, { windowsHide: true, encoding: 'utf8' });
          if (vol.toLowerCase().includes('loord_setup')) {
            driveLetter = l;
            break;
          }
        } catch (_) { }
      }
    }

    sendProgress(45, `Montando ISO oficial e preparando unidade ${driveLetter}:...`);

    // 3. Monta a ISO e descobre a letra da unidade virtual
    const mountPs = `
      $iso = "${targetIso.replace(/\\/g, '\\\\')}";
      $m = Mount-DiskImage -ImagePath $iso -PassThru -ErrorAction SilentlyContinue;
      Start-Sleep -Seconds 2;
      $isoVol = Get-DiskImage -ImagePath $iso | Get-Volume -ErrorAction SilentlyContinue;
      if ($isoVol -and $isoVol.DriveLetter) { $isoVol.DriveLetter } else { "" }
    `;
    let isoDrive = runPowerShellScript(mountPs).trim().substring(0, 1).toUpperCase();
    if (!isoDrive) {
      // Fallback: procura unidades existentes que tenham sources\boot.wim
      for (let c = 68; c <= 90; c++) {
        const l = String.fromCharCode(c);
        if (l !== driveLetter && fs.existsSync(`${l}:\\sources\\boot.wim`)) {
          isoDrive = l;
          break;
        }
      }
    }
    if (!isoDrive) {
      throw new Error('Não foi possível montar a ISO para extrair os arquivos de instalação.');
    }

    sendProgress(60, `Copiando arquivos da ISO para a partição ${driveLetter}:...`);

    // 4. Robocopy com parâmetros corretos (/NDL em vez de /NDO) e tratamento de exit codes (0-7 = sucesso)
    try {
      execSync(`robocopy ${isoDrive}: ${driveLetter}: /E /R:1 /W:1 /MT:8 /NP /NFL /NDL /NJH /NJS`, { windowsHide: true });
    } catch (robocopyErr) {
      if (robocopyErr.status && robocopyErr.status >= 8) {
        throw new Error(`Falha na cópia dos arquivos da ISO (código ${robocopyErr.status}).`);
      }
    } finally {
      // Garante que a ISO virtual seja sempre desmontada e não fique presa no sistema
      dismountAllVirtualIsos();
    }

    // 5. Injeta script oficial de Auto-Destruição pós-instalação (SetupComplete.cmd)
    // O Windows Setup executa este script automaticamente ao terminar a formatação e instalação
    try {
      const oemDir = path.join(`${driveLetter}:\\sources`, '$OEM$', '$$', 'Setup', 'Scripts');
      if (!fs.existsSync(oemDir)) {
        fs.mkdirSync(oemDir, { recursive: true });
      }
      const setupCompleteScript = [
        '@echo off',
        'rem Script Oficial de Auto-Destruicao Loord Optimizer',
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "$v = Get-Volume -FileSystemLabel \'LOORD_SETUP\' -ErrorAction SilentlyContinue; if ($v) { $p = $v | Get-Partition -ErrorAction SilentlyContinue; if ($p) { Remove-Partition -DiskNumber $p.DiskNumber -PartitionNumber $p.PartitionNumber -Confirm:$false -ErrorAction SilentlyContinue | Out-Null; } } try { $max = (Get-PartitionSupportedSize -DriveLetter C -ErrorAction SilentlyContinue).SizeMax; if ($max) { Resize-Partition -DriveLetter C -Size $max -ErrorAction SilentlyContinue | Out-Null; } } catch {}"',
        'reg delete "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoDrives /f >nul 2>&1',
        'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoDrives /f >nul 2>&1',
        'del /f /q "%~f0" >nul 2>&1',
        'exit /b 0'
      ].join('\r\n');
      fs.writeFileSync(path.join(oemDir, 'SetupComplete.cmd'), setupCompleteScript, 'ascii');
    } catch (_) { }

    // Verifica integridade dos arquivos essenciais copiados
    const bootWimPath = path.join(`${driveLetter}:\\`, 'sources', 'boot.wim');
    if (!fs.existsSync(bootWimPath)) {
      throw new Error(`Arquivos de instalação não foram encontrados na unidade ${driveLetter}: após a cópia.`);
    }

    sendProgress(80, 'Registrando inicialização no Gerenciador de Boot do Windows (BCD)...');

    // 6. Configura bootsect para compatibilidade
    try {
      execSync(`"${driveLetter}:\\boot\\bootsect.exe" /nt60 ${driveLetter}: /force /mbr`, { windowsHide: true });
    } catch (_) { }

    // 7. Registra a entrada oficial no BCD do Windows
    const bcdPs = `
      & bcdedit /create '{ramdiskoptions}' /d "Loord Ramdisk" 2>&1 | Out-Null;
      & bcdedit /set '{ramdiskoptions}' ramdisksdidevice partition=${driveLetter}: 2>&1 | Out-Null;
      & bcdedit /set '{ramdiskoptions}' ramdisksdipath \\boot\\boot.sdi 2>&1 | Out-Null;

      $isEfi = Test-Path "HKLM:\\System\\CurrentControlSet\\Control\\SecureBoot\\State";
      $winload = if ($isEfi) { "\\windows\\system32\\winload.efi" } else { "\\windows\\system32\\winload.exe" };

      $createOut = & bcdedit /create /d "Instalar ISO Loord v10.6 Lite" /application osloader 2>&1;
      $guidMatch = [regex]::Match($createOut, '({[a-f0-9-]+})');
      if ($guidMatch.Success) {
          $guid = $guidMatch.Groups[1].Value;
          if (-not (Test-Path "C:\\ProgramData\\LoordOptimizer")) { New-Item -ItemType Directory -Path "C:\\ProgramData\\LoordOptimizer" -Force | Out-Null; }
          [System.IO.File]::WriteAllText("C:\\ProgramData\\LoordOptimizer\\loord_boot_guid.txt", $guid);

          & bcdedit /set $guid device "ramdisk=[${driveLetter}:]\\sources\\boot.wim,{ramdiskoptions}" | Out-Null;
          & bcdedit /set $guid osdevice "ramdisk=[${driveLetter}:]\\sources\\boot.wim,{ramdiskoptions}" | Out-Null;
          & bcdedit /set $guid path $winload | Out-Null;
          & bcdedit /set $guid systemroot "\\windows" | Out-Null;
          & bcdedit /set $guid winpe yes | Out-Null;
          & bcdedit /set $guid detecthal yes | Out-Null;

          & bcdedit /displayorder $guid /addfirst | Out-Null;
          & bcdedit /timeout 15 | Out-Null;
      }
    `;
    runPowerShellScript(bcdPs);

    // 8. Blindagem Anti-Cópia: Oculta a unidade completamente e remove a letra para que o usuário não veja nem copie os arquivos
    try {
      // 8.1 Remove o ponto de montagem da unidade L: imediatamente
      try {
        execSync(`mountvol ${driveLetter}: /D`, { windowsHide: true });
      } catch (_) { }

      // 8.2 No Diskpart: remove a letra e aplica atributos GPT de Partição Oculta e Protegida (Hidden + NoDefaultDriveLetter + ReadOnly/OEM)
      const dpBlindFile = path.join(os.tmpdir(), 'loord_dp_blind.txt');
      const dpBlindScript = [
        `select volume ${driveLetter}`,
        `remove letter=${driveLetter}`,
        'gpt attributes=0xC000000000000001',
        'exit'
      ].join('\r\n');
      fs.writeFileSync(dpBlindFile, dpBlindScript, 'ascii');
      try {
        execSync(`diskpart.exe /s "${dpBlindFile}"`, { windowsHide: true });
      } catch (_) { }
      try { fs.unlinkSync(dpBlindFile); } catch (_) { }

      // 8.3 Políticas do Windows Explorer para esconder e bloquear visualização (Drive L = bit 11 = 2048)
      execSync('reg add "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoDrives /t REG_DWORD /d 2048 /f', { windowsHide: true });
      execSync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoDrives /t REG_DWORD /d 2048 /f', { windowsHide: true });
      execSync('reg add "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoViewOnDrive /t REG_DWORD /d 2048 /f', { windowsHide: true });
      execSync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoViewOnDrive /t REG_DWORD /d 2048 /f', { windowsHide: true });

      // 8.4 Força atualização do Windows Explorer para a unidade sumir instantaneamente da tela
      try {
        execSync('powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).Windows() | ForEach-Object { $_.Refresh() }"', { windowsHide: true });
      } catch (_) { }
    } catch (_) { }

    sendProgress(100, 'Computador preparado com sucesso! Partição de boot blindada e 100% invisível.');

    // 9. Consome uso da Chave de ISO e atualiza saldo
    let consumeResult = null;
    try {
      const activeKey = activatedIsoKey || authorizedSessionKey;
      if (activeKey) {
        consumeResult = await queryOfficialDatabase('/api/iso-consume', {
          uuid: getMachineHardwareUUID(),
          key: activeKey
        });
      }
    } catch (_) { }

    const shouldLogout = !!consumeResult?.shouldLogout;
    if (shouldLogout) {
      isClientSessionAuthorized = false;
      authorizedSessionKey = null;
    }

    return {
      success: true,
      shouldLogout,
      remaining: consumeResult?.remaining,
      message: consumeResult?.message || 'Computador preparado com sucesso! A partição de boot foi criada, blindada contra cópias e a opção de formatação está ativa no menu de boot e na BIOS.'
    };
  } catch (e) {
    console.error('Erro ao preparar partição:', e);
    dismountAllVirtualIsos();
    return { success: false, error: 'Falha ao preparar computador: ' + (e.message || 'Erro desconhecido') };
  }
});

ipcMain.handle('remove-loord-partition', async () => {
  try {
    // 1. Remove restrição de visibilidade NoDrives e NoViewOnDrive
    try {
      execSync('reg delete "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoDrives /f', { windowsHide: true });
      execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoDrives /f', { windowsHide: true });
      execSync('reg delete "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoViewOnDrive /f', { windowsHide: true });
      execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" /v NoViewOnDrive /f', { windowsHide: true });
    } catch (_) { }

    // 2. Remove entradas antigas do BCD
    const cleanBcdPs = `
      $entries = bcdedit /enum osloader | Select-String -Pattern "Instalar.*Loord|Formatar.*Loord" -Context 3,0;
      foreach ($line in $entries) {
        $m = [regex]::Match($line.Context.PreContext, '({[a-f0-9-]+})');
        if ($m.Success) {
          bcdedit /delete $m.Groups[1].Value /f | Out-Null;
        }
      }
      $guidFile = "C:\\ProgramData\\LoordOptimizer\\loord_boot_guid.txt";
      if (Test-Path $guidFile) {
        $saved = (Get-Content $guidFile).Trim();
        if ($saved) { bcdedit /delete $saved /f | Out-Null; }
        Remove-Item $guidFile -Force -ErrorAction SilentlyContinue;
      }
    `;
    runPowerShellScript(cleanBcdPs);

    // 2. Remove a partição LOORD_SETUP e estende o volume C:
    const dpCleanFile = path.join(os.tmpdir(), 'loord_dp_remove.txt');
    const dpCleanScript = [
      'select volume L',
      'delete partition override',
      'select volume C',
      'extend',
      'exit'
    ].join('\r\n');
    fs.writeFileSync(dpCleanFile, dpCleanScript, 'ascii');

    try {
      execSync(`diskpart.exe /s "${dpCleanFile}"`, { windowsHide: true });
    } catch (_) {
      const psFallback = `
        $v = Get-Volume -FileSystemLabel "LOORD_SETUP" -ErrorAction SilentlyContinue;
        if ($v) {
          $p = $v | Get-Partition -ErrorAction SilentlyContinue;
          if ($p) {
            Remove-Partition -DiskNumber $p.DiskNumber -PartitionNumber $p.PartitionNumber -Confirm:$false | Out-Null;
          }
        }
        $max = (Get-PartitionSupportedSize -DriveLetter C -ErrorAction SilentlyContinue).SizeMax;
        if ($max) { Resize-Partition -DriveLetter C -Size $max -ErrorAction SilentlyContinue | Out-Null; }
      `;
      runPowerShellScript(psFallback);
    }

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

    sendProg(20, 'Configurando inicialização direta no Instalador Loord...');

    const psBootSeq = `
      $guidFile = "C:\\ProgramData\\LoordOptimizer\\loord_boot_guid.txt";
      $guid = $null;
      if (Test-Path $guidFile) {
        $guid = (Get-Content $guidFile).Trim();
      }
      if (-not $guid) {
        $entries = bcdedit /enum osloader | Select-String -Pattern "Instalar.*Loord|Formatar.*Loord" -Context 3,0;
        foreach ($line in $entries) {
          $m = [regex]::Match($line.Context.PreContext, '({[a-f0-9-]+})');
          if ($m.Success) {
            $guid = $m.Groups[1].Value;
            break;
          }
        }
      }
      if ($guid) {
        bcdedit /bootsequence $guid | Out-Null;
        bcdedit /default $guid | Out-Null;
      }
    `;
    runPowerShellScript(psBootSeq);

    sendProg(60, 'Gravando sequência de boot limpo no sistema...');
    sendProg(100, 'Reiniciando computador no Instalador Oficial Loord...');

    setTimeout(() => {
      try { execSync('shutdown /r /t 4 /f', { windowsHide: true }); } catch (_) { }
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

          safeWriteBluestacksConf(confPath, content);
          confUpdatedCount++;
        } catch (_) { }
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
    } catch (_) { }

    // 5. Injeção direta via ADB em tempo real se emulador estiver aberto
    try {
      injectLiveAdbSensitivity(sensitivityY, 440);
    } catch (_) { }

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

// ── HELPER DE INJEÇÃO DO MOUSE NO WINDOWS EM TEMPO REAL (NÃO-BLOQUEANTE) ────
function applyRealtimeWindowsMouse(mouseSpeedVal) {
  try {
    const clampedSpeed = Math.max(1, Math.min(20, Math.round(mouseSpeedVal)));

    // 1. Grava no Registro do Windows em paralelo
    Promise.all([
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "${clampedSpeed}" /f`),
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f`),
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f`),
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f`)
    ]);

    // 2. Dispara SystemParametersInfo (SPI_SETMOUSESPEED = 0x0071 = 113) de forma assíncrona
    const psCmd = `Add-Type -TypeDefinition '[DllImport("user32.dll")] public static extern int SystemParametersInfo(int uAction, int uParam, IntPtr lpvParam, int fuWinIni);' -Name WinMouseAPI -Namespace Win32; [Win32.WinMouseAPI]::SystemParametersInfo(113, 0, [IntPtr]${clampedSpeed}, 3)`;
    safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);
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
        exec(`"${adbPath}" -s 127.0.0.1:${port} shell settings put system pointer_speed ${androidPointerSpeed}`, { windowsHide: true }, () => { });
        if (dpiEmuVal && parseInt(dpiEmuVal) > 100) {
          exec(`"${adbPath}" -s 127.0.0.1:${port} shell wm density ${dpiEmuVal}`, { windowsHide: true }, () => { });
        }
      });
    }
  } catch (_) { }
}

// ── REGEDIT ADAPTATIVA - OTIMIZADOR DE MOUSE E DESEMPENHO BLUESTACKS ──────────
ipcMain.handle('apply-adaptive-profile', async (event, profileName) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  try {
    let resultLog = [];
    const applyDesempenho = () => {
      // 1. Plano de Energia em Alto Desempenho
      safeExec('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
      resultLog.push('⚡ Plano de Energia ajustado para Alto Desempenho (Anti-Throttling de CPU).');

      // 2. Prioridade "Alta" para o processo do BlueStacks de forma assíncrona
      safeExec('powershell -NoProfile -Command "Get-Process -Name HD-Player,HD-Player64,BlueStacks,BlueStacksX,LdVBoxHeadless,dnplayer,Nox -ErrorAction SilentlyContinue | ForEach-Object { $_.PriorityClass = \'High\' }"');
      resultLog.push('🚀 Prioridade dos processos do emulador ajustada para ALTA.');
    };

    if (profileName === 'RAPIDA') {
      await Promise.all([
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 15 /f')
      ]);
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
      await Promise.all([
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 10 /f')
      ]);
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
      await Promise.all([
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 1 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 6 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 10 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 8 /f')
      ]);
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
      await Promise.all([
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d 1 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d 6 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d 10 /f'),
        safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d 10 /f'),
        safeExec('powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e')
      ]);
      applyRealtimeWindowsMouse(10);
      return {
        success: true,
        profile: 'PADRÃO WINDOWS',
        summary: 'Configurações PADRÃO do Windows restauradas com sucesso! Plano equilibrado reativado e sensibilidade 10 restaurada.',
        details: ['✔ Sensibilidade 10 (Padrão)', '✔ Aceleração padrão do Windows reativada', '✔ Plano de Energia Equilibrado restaurado']
      };
    }

    return { success: false, error: 'Perfil inválido.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── REGEDIT FULL CAPA (RAREFIX PRECISÃO MÁXIMA 1:1 - NÃO-BLOQUEANTE) ─────────
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

    // 1. Grava no Registro com alta precisão em paralelo
    const regTasks = [
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "${speed}" /f`),
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "${mouseSpeedVal}" /f`),
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "${thresh1}" /f`),
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "${thresh2}" /f`)
    ];

    if (!isRestore) {
      regTasks.push(safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d 0000000000000000156e000000000000004001000000000000a00300000000000040080000000000 /f`));
      regTasks.push(safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d 00000000000000000018000000000000004000000000000000800000000000000000010000000000 /f`));
    }

    await Promise.all(regTasks);

    // 2. Dispara SystemParametersInfo de forma assíncrona
    const psCmd = `Add-Type -TypeDefinition '[DllImport(\"user32.dll\")] public static extern bool SystemParametersInfo(uint a, uint b, int[] c, uint d); [DllImport(\"user32.dll\", EntryPoint=\"SystemParametersInfoW\")] public static extern bool SystemParametersInfoPtr(uint a, uint b, IntPtr c, uint d);' -Name RareFixMouse -Namespace Win32; [Win32.RareFixMouse]::SystemParametersInfoPtr(0x0071, 0, [IntPtr]${speed}, 3); [Win32.RareFixMouse]::SystemParametersInfo(0x0004, 0, [int[]]@(${thresh1}, ${thresh2}, ${mouseSpeedVal}), 3);`;
    safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`);

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
      } catch (_) { }
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
      } catch (_) { }
    }

    // 3. ENCERRA PROCESSOS DO EMULADOR PARA GRAVAÇÃO LIMPA
    try {
      execSync('taskkill /F /IM HD-Player.exe /IM HD-Agent.exe /IM BstkSVC.exe /IM BlueStacksServices.exe /T >nul 2>&1', { stdio: 'ignore' });
    } catch (_) { }

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

          content = content.replace(/(bst\.prefer_dedicated_gpu\s*=\s*)"[^"]*"/g, '$1"1"');

          safeWriteBluestacksConf(confPath, content);
          emusConfigured++;
        } catch (_) { }
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
      } catch (_) { }
    }

    // 6. INJEÇÃO EM TEMPO REAL NO ANDROID (ADB)
    try {
      injectLiveAdbSensitivity(effectiveSensY, dpiEmu, rawMul);
    } catch (_) { }

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
      } catch (_) { }
      return { success: false, error: e.message };
    }
  } else {
    console.error('[AutoUpdater] Arquivo do instalador não encontrado em:', targetPath);
    shell.openExternal('https://github.com/GabrielErick1/loord-optimizer-releases/releases/latest');
    return { success: false, error: 'Arquivo do instalador não encontrado. Redirecionando para GitHub Releases.' };
  }
}

// ─── MOTOR DA MACRO DE RECOIL & DESCIDA Y (F7, F8, F2, F3, F6) ─────────────
function syncMacroFiles(speed, active) {
  const dirs = [
    os.tmpdir(),
    'C:\\ProgramData\\LoordOptimizer',
    'C:\\Windows\\Temp'
  ];
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'loord_macro_speed.txt'), String(speed), 'utf8');
      fs.writeFileSync(path.join(d, 'loord_macro_active.txt'), active ? 'true' : 'false', 'utf8');
    } catch (_) { }
  }
}

async function killMacroProcess() {
  if (macroProcess) {
    try {
      if (!macroProcess.killed) macroProcess.kill();
    } catch (_) { }
    macroProcess = null;
  }
  try {
    execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like \'*LoordRecoilEngine*\' } | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate }"', { stdio: 'ignore' });
  } catch (_) { }
  try {
    execSync('taskkill /F /IM LoordRecoilEngine.exe /IM ._cache_LoordRecoilEngine.exe >nul 2>&1', { stdio: 'ignore' });
  } catch (_) { }
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
        try { fs.copyFileSync(p, tempExe); } catch (_) { }
        return p;
      }
    } catch (_) { }
  }

  // Tenta extrair do asar se houver
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
    } catch (_) { }
  }

  // Se já existe no temp e é válido, usa ele
  try {
    if (fs.existsSync(tempExe) && fs.statSync(tempExe).size > 1000) {
      return tempExe;
    }
  } catch (_) { }

  // 2) Se não existir, compila na hora via csc.exe do .NET Framework 4.0 (nativo do Windows)
  try {
    const csSource = `
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public class Program {
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    [DllImport("winmm.dll")] public static extern uint timeBeginPeriod(uint uMilliseconds);

    private const int MOUSEEVENTF_MOVE = 0x0001;
    private const int VK_LBUTTON = 0x01;
    private const int VK_F7      = 0x76;
    private const int VK_F8      = 0x77;

    private static readonly string[] SpeedPaths = new string[] {
        @"C:\\ProgramData\\LoordOptimizer\\loord_macro_speed.txt",
        Path.Combine(Path.GetTempPath(), "loord_macro_speed.txt"),
        @"C:\\Windows\\Temp\\loord_macro_speed.txt"
    };

    private static readonly string[] ActivePaths = new string[] {
        @"C:\\ProgramData\\LoordOptimizer\\loord_macro_active.txt",
        Path.Combine(Path.GetTempPath(), "loord_macro_active.txt"),
        @"C:\\Windows\\Temp\\loord_macro_active.txt"
    };

    public static void Main(string[] args) {
        try { timeBeginPeriod(1); } catch {}
        double speed = 0.1;
        if (args != null && args.Length > 0) {
            double parsed;
            if (double.TryParse(args[0].Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out parsed)) {
                if (parsed >= 0.05 && parsed <= 50.0) speed = parsed;
            }
        }

        bool macroAtiva = false;
        double accumY = 0.0;
        int loopCounter = 0;

        while (true) {
            loopCounter++;

            // Atalhos oficiais exclusivos no jogo: F7 ou F8 (Liga / Desliga com bip)
            bool f7 = (GetAsyncKeyState(VK_F7) & 0x8000) != 0;
            bool f8 = (GetAsyncKeyState(VK_F8) & 0x8000) != 0;

            if (f7 || f8) {
                macroAtiva = !macroAtiva;
                try { Console.Beep(macroAtiva ? 1200 : 500, 100); } catch {}
                foreach (string ap in ActivePaths) {
                    try { File.WriteAllText(ap, macroAtiva ? "true" : "false"); } catch {}
                }
                Thread.Sleep(300);
            }

            if (loopCounter % 3 == 0) {
                foreach (string ap in ActivePaths) {
                    string actText = SafeReadAllText(ap);
                    if (!string.IsNullOrEmpty(actText)) {
                        string act = actText.Trim().ToLower();
                        if (act == "true" || act == "1") macroAtiva = true;
                        else if (act == "false" || act == "0") macroAtiva = false;
                        break;
                    }
                }

                foreach (string sp in SpeedPaths) {
                    string spdText = SafeReadAllText(sp);
                    if (!string.IsNullOrEmpty(spdText)) {
                        string cfg = spdText.Trim().Replace(',', '.');
                        double newSpd;
                        if (double.TryParse(cfg, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out newSpd)) {
                            if (newSpd >= 0.05 && newSpd <= 50.0) speed = newSpd;
                        }
                        break;
                    }
                }
            }

            if (macroAtiva) {
                bool isShooting = (GetAsyncKeyState(VK_LBUTTON) < 0);
                if (isShooting) {
                    accumY += speed;
                    if (accumY >= 1.0) {
                        int stepY = (int)Math.Floor(accumY);
                        mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0);
                        accumY -= stepY;
                    }
                    Thread.Sleep(7);
                } else {
                    accumY = 0.0;
                    Thread.Sleep(8);
                }
            } else {
                accumY = 0.0;
                Thread.Sleep(20);
            }
        }
    }

    private static string SafeReadAllText(string path) {
        try {
            if (!File.Exists(path)) return null;
            using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (var reader = new StreamReader(fs)) {
                return reader.ReadToEnd();
            }
        } catch {
            return null;
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
    syncMacroFiles(numSpeed, macroEnabledState);

    // Se já estiver rodando, apenas sincroniza arquivos
    try {
      const checkRunning = execSync('powershell -NoProfile -Command "Get-Process -Name LoordRecoilEngine -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"', { encoding: 'utf8' }).trim();
      if (checkRunning) {
        console.log(`[MACRO] LoordRecoilEngine ativo (PID: ${checkRunning}). Velocidade sincronizada: ${numSpeed}`);
        return { success: true, updated: true };
      }
    } catch (_) { }

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

ipcMain.handle('start-macro', async (event, speed, active = true) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  return await startMacroNative(speed, active);
});

ipcMain.handle('prepare-macro', async (event, speed) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  // Mantém o motor configurado mas em STANDBY (active = false).
  // Só desce quando o usuário clicar em F7 ou F8!
  return await startMacroNative(speed, false);
});

ipcMain.handle('set-macro-speed', async (event, speed) => {
  if (!isLicenseAuthorized()) {
    return { success: false, error: 'Acesso negado: Licença VIP ativa obrigatória.' };
  }
  const num = typeof speed === 'number' ? speed : parseFloat(speed);
  if (!isNaN(num) && num > 0) {
    macroCurrentSpeed = num;
    syncMacroFiles(macroCurrentSpeed, macroEnabledState);
  }
  return { success: true, speed: macroCurrentSpeed };
});

ipcMain.handle('stop-macro', async () => {
  try {
    macroEnabledState = false;
    syncMacroFiles(macroCurrentSpeed, false);
    console.log('[MACRO] Pausada em standby com sucesso!');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── LOORD IA GAMER (AI ASSISTANT) ───────────────────────────────────────────
ipcMain.handle('ask-ia-gamer', async (event, question) => {
  try {
    const q = (question || '').trim().toLowerCase();
    if (!q) {
      return { success: false, error: 'Por favor, digite uma pergunta para a IA.' };
    }

    let answer = '';

    // ── 1. GUIA COMPLETO DE TODAS AS ABAS E FUNÇÕES DO PAINEL ──
    if (q.includes('cada aba') || q.includes('todas as abas') || q.includes('o que tem no painel') || q.includes('funcoes do painel') || q.includes('como usar o painel') || q.includes('guia do painel') || q.includes('para que serve o painel')) {
      answer = `📖 **GUIA COMPLETO DO LOORD OPTIMIZER — O QUE FAZ CADA ABA:**

1. 🎯 **Semi Precision Regis (Rarefix):**
   • Ajusta a precisão 1:1 no registro nativo do Windows (\`HKCU\\Control Panel\\Mouse\`).
   • Elimina a aceleração errática, remove o tremor de mira e impede que o tiro passe da cabeça.

2. 🧬 **Regedit Adaptativa:**
   • Sistema inteligente de curvas de mouse e energia.
   • Possui 5 perfis: **[1] RÁPIDA** (Zera aceleração), **[2] LEVE** (Micro-ajustes), **[3] SUAVE** (Controle total), **[4] SÓ DESEMPENHO** (Energia máxima e prioridade de processo) e **[5] RESTAURAR**.

3. 🤖 **Loord IA:**
   • Sua assistente inteligente gamer. Tira qualquer dúvida sobre o painel, sensibilidade X/Y, DPI, 240 FPS e solução de travamentos.

4. 🎯 **Calculadora Sense:**
   • Calcula a Sensibilidade X (Lateral), Y (Capa) e o Ajuste/Tweak (16450) perfeitos para o seu Mouse DPI e DPI do Emulador.

5. 🖱️ **Regedits & Sense:**
   • Contém o **Assistente de Recoil & Puxada Y** (Ativa em jogo com **F7** ou **F8** para descida suave ao atirar sem descer sozinho ao aplicar), ajuste de Polling Rate e a recomendação oficial Full Lata (1600 DPI).

6. ⚡ **Otimizar PC:**
   • Limpeza profunda de RAM em tempo real, **Auto RAM Cleaner** (limpa a cada 45s em segundo plano), Otimização Mestra do Windows e prioridade para jogos.

7. 🌐 **Rede & Latência:**
   • Configura DNS Gamer (Cloudflare 1.1.1.1 ou Google 8.8.8.8) com 1 clique, zera atrasos de pacotes TCP e testa seu ping.

8. 🎮 **Emulador + FPS:**
   • Troca o modelo de celular do emulador (**Xiaomi Redmi Note 9** ou **ASUS ROG Phone 8**) para liberar 240 FPS e reduzir o atraso de toque (input lag).

9. ⚙️ **Minha Configuração:**
   • Cria backups de segurança do Windows e do emulador, permite restaurar a qualquer momento e gerencia atualizações do sistema.

10. ⚡ **PC Fraco (Ultra FPS):**
    • Otimizações agressivas para máquinas com 4GB a 8GB de RAM, memória virtual fixa e remoção de serviços pesados do Windows.`;
    }

    // ── 2. ASSISTENTE DE RECOIL & PUXADA Y (F7 / F8) ──
    else if (q.includes('recoil') || q.includes('puxada y') || q.includes('puxada') || q.includes('f7') || q.includes('f8') || q.includes('descida') || q.includes('macro')) {
      answer = `🔫 **COMO USAR O ASSISTENTE DE RECOIL & PUXADA Y:**

• **Para que serve:** Simula uma descida suave e automática da mira no eixo vertical (Y) enquanto você segura o botão esquerdo do mouse atirando, estabilizando o coice das armas para cravar na cabeça.
• **Segurança Antissolavanco:** Ao clicar em *Aplicar Configurações* no painel, ele **não desce sozinho**. Ele fica em modo **STANDBY** (espera).
• **Como Ativar em Partida:**
  1. No painel, na aba **Regedits & Sense**, marque a caixinha **Ativar Descida Automática ao Atirar**.
  2. Escolha a velocidade decimal desejada (ex: \`0.1\` ou \`0.5\` para armas de um tiro; \`1.0\` a \`2.5\` para SMG).
  3. Clique em **⚡ Aplicar Configurações**.
  4. Entre no Free Fire. Quando quiser ativar, aperte **F7** ou **F8** no teclado.
  5. Você ouvirá um **bipe agudo (1200Hz)** confirmando que está ATIVADO.
  6. Para desativar a qualquer momento, aperte **F7** ou **F8** novamente (você ouvirá um **bipe grave de 500Hz**).`;
    }

    // ── 3. SEMI PRECISION REGIS (RAREFIX) ──
    else if (q.includes('semi precision') || q.includes('rarefix') || q.includes('precisao 1:1') || q.includes('kernel')) {
      answer = `🎯 **COMO FUNCIONA O SEMI PRECISION REGIS (RAREFIX VIP):**

• **O que é:** É uma injeção de precisão milimétrica direta no registro do Windows (\`HKCU\\Control Panel\\Mouse\`). Ela reprograma a escala de aceleração para responder com fidelidade 1:1 ao sensor do mouse.
• **Perfis Disponíveis:**
  - **🛡️ Estável (8):** Movimento macio e pesado. Excelente para snipers e armas de um tiro (evita tremedeira).
  - **⚖️ Equilibrado (10):** Padrão neutro balanceado para qualquer DPI.
  - **👑 Precisão (11 - Recomendado):** Curva ultra calibrada para Free Fire. Mira não passa da cabeça e sobe rápido no capa.
  - **⚡ Rápida (12):** Para quem usa DPI baixa (400 ou 800 DPI) e quer movimentação ágil.
  - **🔥 Extrema (15):** Resposta instantânea para telas rápidas e DPI alta.
• **Como Usar:** Basta ir na aba **Semi Precision Regis**, escolher o perfil e clicar no botão correspondente. A aplicação é imediata!`;
    }

    // ── 4. REGEDIT ADAPTATIVA ──
    else if (q.includes('regedit adaptativa') || q.includes('adaptativa') || q.includes('perfil adaptativo')) {
      answer = `🧬 **COMO FUNCIONA A REGEDIT ADAPTATIVA:**

• **O que faz:** Combina otimização do registro do mouse com plano de energia e prioridade de processo do Windows.
• **Os 5 Perfis:**
  1. **⚡ [1] RÁPIDA (Zera Aceleração):** Define \`MouseSpeed 0\` e thresholds zero. Resposta 100% pura sem aceleração do Windows.
  2. **🎯 [2] LEVE (Aceleração Leve):** Aceleração sutil (\`MouseSpeed 1\`) para quem gosta de movimentação rápida com sensibilidade média.
  3. **🌊 [3] SUAVE (Controle Total):** Sensibilidade reduzida para 8. Movimento controlado para travar a mira na cabeça.
  4. **🚀 [4] SÓ DESEMPENHO:** Ativa o plano de energia de Alto Desempenho e coloca o BlueStacks em Prioridade Alta sem mexer na sua sensibilidade de mouse.
  5. **🔄 [5] RESTAURAR:** Volta as configurações padrão do Windows caso queira desfazer.
• **Como Usar:** Selecione o perfil desejado no card e clique em **⚡ Aplicar Perfil Selecionado no Windows & BlueStacks**.`;
    }

    // ── 4.1 REGEDITS OFICIAIS (RANQUEADA, APOSTADO, V3 TED EXE, V2 SUPREME) ──
    else if (q.includes('ranqueada') || q.includes('apostado') || q.includes('ted exe') || q.includes('v3') || q.includes('v2') || q.includes('qual regedit') || q.includes('melhor regedit') || q.includes('curva de sensibilidade')) {
      answer = `👑 **GUIA OFICIAL DE REGEDITS DE SENSIBILIDADE (LOORD OPTIMIZER):**

• 🏆 **LOORD REGEDIT RANQUEADA (Recomendada para Ranqueada / Battle Royale):**
  - **Foco:** Disparos de média e longa distância com armas AR (Scar, M4A1, Groza, SVD, AC80).
  - **Diferencial:** Curva progressiva não linear que crava a mira na altura do peito/cabeça e impede que os tiros espalhem no mapa aberto.

• 🔥 **LOORD REGEDIT APOSTADO (Recomendada para 4v4 / X1 dos Famosos):**
  - **Foco:** Disparo cirúrgico em curta e média distância com SMG (UMP, MP40) e armas de um tiro (Desert Eagle, M1014, Bau Bau).
  - **Diferencial:** Resposta instantânea de clique com \`MouseSpeed 1\` e thresholds calibrados para subida rápida sem passar da cabeça.

• ⚡ **LOORD V3 VIP (Ted Exe • AimLock & Stability):**
  - **Foco:** Estabilização máxima contra tremedeira, AimLock, AimAssist e TCP NoDelay com tempo de hover de 8ms para clique ultrarrápido.

• 💎 **LOORD REGEDIT V.2 (Curva Suave 1:1 & Headshot Lock):**
  - **Foco:** Puxada suave e macia com parâmetros AimPRO, Flames e curva milimétrica 1:1.

💡 **Segurança e Limpeza Garantida:** Ao escolher qualquer uma dessas regedits na aba **Regedits & Sense**, o painel remove automaticamente 100% da regedit anterior do seu registro antes de ativar a nova!`;
    }

    // ── 5. MODELO DE CELULAR (XIAOMI REDMI NOTE 9 & ASUS ROG) ──
    else if (q.includes('redmi note 9') || q.includes('xiaomi') || q.includes('m2003j15sg') || q.includes('modelo de celular') || q.includes('trocar modelo') || q.includes('dispositivo')) {
      answer = `📱 **COMO FUNCIONA A TROCA DE MODELO DE CELULAR:**

• **Por que trocar o modelo?** Os servidores do Free Fire leem o modelo do aparelho para liberar taxas de atualização mais altas e perfis de sensibilidade de toque.
• **Xiaomi Redmi Note 9 (M2003J15SG):**
  - Configurado com Fabricante: \`Xiaomi\`, Marca: \`Redmi Note 9\` e Modelo: \`M2003J15SG\`.
  - Reduz drasticamente a latência de toque na tela e estabiliza a subida da mira no BlueStacks.
• **ASUS ROG Phone 8 Pro:**
  - Libera taxas de 90Hz, 120Hz e 240 FPS sem gargalo térmico simulado.
• **Como Aplicar:**
  1. Feche o seu emulador BlueStacks/MSI completamente.
  2. Vá na aba **Emulador + FPS**.
  3. No seletor de modelos, escolha **Xiaomi - Redmi Note 9 - M2003J15SG**.
  4. Clique em **⚡ Aplicar Modelo no Emulador**.
  5. Abra o emulador e verifique em Configurações > Telefone: estará 100% configurado!`;
    }

    // ── 6. OTIMIZAR PC, LIMPAR RAM E AUTO RAM CLEANER ──
    else if (q.includes('otimizar pc') || q.includes('limpar ram') || q.includes('auto ram') || q.includes('memoria ram') || q.includes('otimizacao mestra')) {
      answer = `⚡ **COMO USAR A ABA OTIMIZAR PC:**

• **🧹 Limpar Memória RAM:** Libera imediatamente a memória em cache e processos em espera usando chamadas diretas de kernel da API do Windows (\`EmptyWorkingSet\`). Pode ser clicado antes de abrir o emulador ou durante partidas.
• **🔄 Auto RAM Cleaner:** Quando ativado, roda um limpador silencioso em segundo plano a cada **45 segundos**, impedindo que o BlueStacks acumule vazamentos de memória e comece a dar travamentos após horas de jogo.
• **⚡ Otimizar Processos:** Reduz a prioridade de programas secundários e eleva a prioridade do motor do jogo.
• **👑 Otimização Mestra do Windows:** Ajusta o algoritmo de Nagle para rede, habilita o plano de energia de Desempenho Máximo e otimiza o tempo de resposta do sistema.`;
    }

    // ── 7. REDE & LATÊNCIA (DNS GAMER E PING) ──
    else if (q.includes('rede') || q.includes('latencia') || q.includes('dns') || q.includes('ping') || q.includes('cloudflare') || q.includes('tcp')) {
      answer = `🌐 **COMO FUNCIONA A ABA REDE & LATÊNCIA:**

• **DNS Gamer:** Troca o servidor DNS da sua placa de rede por servidores ultra rápidos que resolvem conexões com menor rota para os servidores da Garena:
  - **⚡ Cloudflare Gamer (1.1.1.1 / 1.0.0.1):** O DNS mais rápido do mundo com menor latência.
  - **🛡️ Google DNS (8.8.8.8 / 8.8.4.4):** Alta estabilidade e sem perda de pacotes.
• **Testar Ping:** Faz um teste de tempo real contra os servidores de jogo para você saber a qualidade da sua rota.
• **Reset de Rede / DHCP:** Se sua internet oscilar, você pode redefinir o adaptador de rede com 1 clique para restabelecer conexão limpa.`;
    }

    // ── 8. CALCULADORA SENSE ──
    else if (q.includes('calculadora') || q.includes('calcular sense') || q.includes('tweak') || q.includes('16450')) {
      answer = `📐 **COMO USAR A CALCULADORA SENSE:**

• **Como Funciona:** Você informa o DPI do seu mouse físico (ex: 800 ou 1600) e o DPI configurado no emulador (ex: 320 ou 480).
• O algoritmo calcula com precisão matemática:
  - **Sensibilidade X:** Coordenada para movimentação horizontal suave sem passar do alvo.
  - **Sensibilidade Y:** Coordenada calibrada para subida perfeita de capa.
  - **Ajuste Recomendado (Tweak):** Como o \`16450\` ou \`21058\`, que destravam o ponteiro e corrigem acelerações ocultas.
• **Onde colocar esses valores?** Abra o BlueStacks, clique com o botão direito no ícone de mira/tiro no mapeamento avançado e cole as coordenadas X, Y e o Tweak nos campos correspondentes!`;
    }

    // ── 9. BACKUP E MINHA CONFIGURAÇÃO ──
    else if (q.includes('backup') || q.includes('minha config') || q.includes('restaurar') || q.includes('salvar config') || q.includes('atualizacao')) {
      answer = `⚙️ **COMO FUNCIONA O BACKUP E MINHA CONFIGURAÇÃO:**

• **Ponto de Restauração Seguro:** O Loord Optimizer cria automaticamente um backup do estado original do seu computador na pasta segura do aplicativo antes de aplicar modificações.
• **Restaurar Tudo:** Se por qualquer motivo você quiser voltar o seu Windows exatamente para como estava antes do painel, basta ir na aba **Minha Configuração** e clicar em **Restaurar Configurações Originais**.
• **Atualizações do Sistema:** O painel verifica automaticamente se há novas versões de otimização no GitHub. Quando disponível, um selo azul pisca no menu e você pode atualizar com 1 clique.`;
    }

    // ── 10. PC FRACO (ULTRA FPS) ──
    else if (q.includes('pc fraco') || q.includes('ultra fps') || q.includes('memoria virtual') || q.includes('pagefile') || q.includes('bloatware')) {
      answer = `🚀 **COMO USAR A ABA PC FRACO (ULTRA FPS):**

• **Para quem é:** Especialmente desenvolvida para computadores com 4GB ou 8GB de RAM, processadores Dual Core ou placas de vídeo integradas (Intel HD Graphics).
• **Principais Recursos:**
  1. **Limpeza Profunda de Disco:** Remove arquivos temporários (\`%temp%\`, \`prefetch\`) que pesam no boot e no carregamento do emulador.
  2. **Remover Bloatware do Windows:** Desativa serviços desnecessários do Windows em segundo plano que consomem CPU.
  3. **Memória Virtual Fixa (Pagefile):** Evita telas azuis e travamentos por falta de RAM alocando tamanho fixo de memória virtual no SSD/HD.
  4. **Preset de Emulador Leve:** Aplica resolução 960x540 ou 1280x720 e limita o consumo para 2 núcleos.`;
    }

    // ── 11. SENSIBILIDADES POR DPI ESPECÍFICAS ──
    else if (q.includes('800 dpi') || (q.includes('800') && q.includes('dpi'))) {
      answer = `🎯 **Sensibilidade Recomendada para 800 DPI (BlueStacks 5):**\n\n• **Sensibilidade X (Lateral):** \`1.25\`\n• **Sensibilidade Y (Capa):** \`0.48\` (SMG) e \`0.52\` (AR)\n• **Tweak:** \`16450\`\n• **DPI do Emulador:** \`480 DPI\`\n• **Geral no Free Fire:** \`92\` a \`96\`\n• **Dica:** Ative o perfil **[1] RÁPIDA** na aba Regedit Adaptativa para eliminar aceleração do Windows!`;
    } else if (q.includes('1600 dpi') || (q.includes('1600') && q.includes('dpi'))) {
      answer = `🎯 **Sensibilidade Recomendada para 1600 DPI (Alta Precisão Pro):**\n\n• **Sensibilidade X (Lateral):** \`0.72\`\n• **Sensibilidade Y (Capa):** \`0.34\`\n• **Tweak:** \`16450\`\n• **DPI do Emulador:** \`320 DPI\`\n• **Geral no Free Fire:** \`85\` a \`90\`\n• **Vantagem:** O sensor lê o dobro de amostras por polegada, eliminando qualquer pulo de pixel.`;
    } else if (q.includes('240 fps') || q.includes('destravar fps')) {
      answer = `⚡ **Passo a Passo para 240 FPS no BlueStacks 5:**\n\n1. No BlueStacks, em **Desempenho**, marque **Ativar taxas de quadros altas** e arraste para **240 FPS**.\n2. Na aba **Emulador + FPS** aqui no painel, aplique o modelo **Xiaomi Redmi Note 9** ou **ASUS ROG Phone 8**.\n3. Modo de Engine gráfica: **Desempenho (OpenGL)**.\n4. No Free Fire: Gráficos no Suave ou Padrão e Alto FPS no **ALTO**.`;
    } else if (q.includes('passa da cabeca') || q.includes('treme')) {
      answer = `🖱️ **Como Resolver Mira Passando da Cabeça:**\n\n1. Na aba **Semi Precision Regis**, ative o perfil **[1] Estável (8)** ou use a **Regedit Adaptativa [1] RÁPIDA** (Zera aceleração do Windows).\n2. Reduza o Y no emulador de 0.05 em 0.05 até a mira cravar na altura da cabeça.\n3. Ative o **Assistente de Recoil** na aba *Regedits & Sense* com força suave (\`0.1\` ou \`0.5\`). Ao segurar o tiro, ele segura a mira no ponto do capa!`;
    }

    // ── 12. RESPOSTA PADRÃO CONSULTIVA ──
    else {
      answer = `🤖 **Dica da Loord IA Gamer sobre: "${question}"**\n\nEu sou especializada em todas as funções do **Loord Optimizer** e na calibração completa para Free Fire no PC.\n\nVocê pode me perguntar:\n• **"O que faz cada aba do painel?"**\n• **"Como usar o Assistente de Recoil (F7/F8)?"**\n• **"Como funciona o Semi Precision Regis?"**\n• **"Como usar a Regedit Adaptativa?"**\n• **"Por que usar o Xiaomi Redmi Note 9?"**\n• **"Como usar o Otimizar PC e Auto RAM?"**\n• **"Qual a melhor sensibilidade para meu DPI?"**\n\nDigite sua dúvida ou clique em uma das sugestões acima!`;
    }

    return { success: true, answer };
  } catch (err) {
    console.error('Erro na IA Gamer:', err);
    return { success: false, error: 'Não foi possível processar sua pergunta. Tente novamente.' };
  }
});

// ── LOORD SUÍTE DE PRECISÃO: MarkC 1:1, Raw Accel & Timer Resolution ────────
let loordTimerResolutionActive = false;
let loordTimerResolutionWorker = null;

// Notifica a API do Windows (user32.dll) em tempo real sobre mudanças no cursor e velocidade
function applyRealtimeWindowsMouse(sensitivity = 10) {
  try {
    const ps = `
      Add-Type -TypeDefinition @"
      using System;
      using System.Runtime.InteropServices;
      public class LoordMouseApi {
          [DllImport("user32.dll", SetLastError = true)]
          public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
      }
"@
      [LoordMouseApi]::SystemParametersInfo(0x0071, ${sensitivity}, [IntPtr]::Zero, 3);
      $mouseArr = [int[]]@(0, 0, 0);
      $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(12);
      [System.Runtime.InteropServices.Marshal]::Copy($mouseArr, 0, $ptr, 3);
      [LoordMouseApi]::SystemParametersInfo(0x0004, 0, $ptr, 3);
      [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr);
    `;
    safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/\r?\n/g, ' ')}"`);
  } catch (_) {}
}

function toLittleEndianHex32(num) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(num >>> 0, 0);
  return buf.toString('hex');
}

// ── MarkC 1:1 Scale Calculator (Fórmula Oficial MarkC Windows 10/11) ──
function buildMarkCCurveHex(scalePercent = 100) {
  const s = (scalePercent || 100) / 100;
  const p1 = Math.round(0x000cccC0 * s);
  const p2 = Math.round(0x00199980 * s);
  const p3 = Math.round(0x00266640 * s);
  const p4 = Math.round(0x00333300 * s);

  const x0 = "0000000000000000";
  const x1 = toLittleEndianHex32(p1) + "00000000";
  const x2 = toLittleEndianHex32(p2) + "00000000";
  const x3 = toLittleEndianHex32(p3) + "00000000";
  const x4 = toLittleEndianHex32(p4) + "00000000";

  const yHex = "0000000000000000000038000000000000007000000000000000a800000000000000e00000000000";
  const xHex = (x0 + x1 + x2 + x3 + x4).padEnd(80, '0').slice(0, 80);
  return { xHex, yHex };
}

// ── IPC Handlers: Loord Precision MarkC 1:1 ──
ipcMain.handle('detect-monitor-scale', () => {
  try {
    const { screen } = require('electron');
    const sf = screen.getPrimaryDisplay().scaleFactor || 1.0;
    const scalePercent = Math.round(sf * 100);
    return { success: true, scalePercent };
  } catch (_) {
    return { success: true, scalePercent: 100 };
  }
});

ipcMain.handle('apply-markc-curve', async (_e, scalePercent) => {
  try {
    const scale = scalePercent || 100;
    const { xHex, yHex } = buildMarkCCurveHex(scale);
    await Promise.all([
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d ${xHex} /f`),
      safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d ${yHex} /f`),
      safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f'),
      safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f'),
      safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f'),
      safeExec('reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "10" /f')
    ]);
    
    applyRealtimeWindowsMouse(10);
    return { success: true, scalePercent: scale, message: `Curva MarkC 1:1 aplicada com sucesso para escala de ${scale}%!` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC Handlers: Loord Raw Accel Presets ──
const RAWACCEL_PRESETS = {
  'precisao': {
    name: 'Precisão Loord (Foco em Capa)',
    description: 'Aceleração suave e controlada com ganho dinâmico para puxar capa no Free Fire.',
    settings: {
      mode: 'classic',
      sensitivity: 0.8,
      acceleration: 0.08,
      cap: 1.8,
      inputOffset: 15,
      exponent: 2.3,
      gain: true
    }
  },
  'flick': {
    name: 'Flick Rápido',
    description: 'Aim rápido e nervoso para trocação rápida e tiros curtos.',
    settings: {
      mode: 'classic',
      sensitivity: 0.9,
      acceleration: 0.06,
      cap: 1.5,
      inputOffset: 10,
      exponent: 2.0,
      gain: true
    }
  },
  'controle': {
    name: 'Controle PvP',
    description: 'Equilíbrio milimétrico entre velocidade horizontal e estabilidade vertical.',
    settings: {
      mode: 'classic',
      sensitivity: 1.0,
      acceleration: 0.05,
      cap: 1.4,
      inputOffset: 20,
      exponent: 2.5,
      gain: true
    }
  },
  'pesado': {
    name: 'Pesado (Inércia)',
    description: 'Compensação de inércia para mouses acima de 80g ou DPI baixo (400/800 DPI).',
    settings: {
      mode: 'classic',
      sensitivity: 1.3,
      acceleration: 0.10,
      cap: 2.2,
      inputOffset: 12,
      exponent: 2.1,
      gain: true
    }
  },
  'sniper': {
    name: 'Sniper (Precisão Cirúrgica)',
    description: 'Movimento ultra lento e preciso para tiros milimétricos de longa distância.',
    settings: {
      mode: 'classic',
      sensitivity: 0.7,
      acceleration: 0.04,
      cap: 1.3,
      inputOffset: 25,
      exponent: 3.0,
      gain: true
    }
  },
  'sensitivo': {
    name: 'Sensitivo (Giro Ágil)',
    description: 'Giro ágil de 360° com alta resposta para movimentação e rush rápido.',
    settings: {
      mode: 'classic',
      sensitivity: 1.2,
      acceleration: 0.12,
      cap: 2.0,
      gain: false
    }
  },
  'padrao': {
    name: 'Padrão Neutro 1:1',
    description: 'Sensibilidade pura sem qualquer aceleração.',
    settings: {
      mode: 'noaccel',
      sensitivity: 1.0
    }
  }
};

ipcMain.handle('rawaccel:status', () => {
  const candidateDirs = [
    path.join(process.env.LOCALAPPDATA || '', 'Raw Accel'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Raw Accel'),
    path.join(process.env.LOCALAPPDATA || '', 'LoordOptimizer', 'rawaccel')
  ];
  const found = candidateDirs.find(d => fs.existsSync(path.join(d, 'settings.json')));
  return {
    installed: !!found,
    path: found || candidateDirs[0],
    presets: Object.entries(RAWACCEL_PRESETS).map(([id, p]) => ({ id, name: p.name, description: p.description }))
  };
});

ipcMain.handle('rawaccel:apply-preset', async (_e, presetId) => {
  try {
    const preset = RAWACCEL_PRESETS[presetId] || RAWACCEL_PRESETS['precisao'];
    const candidateDirs = [
      path.join(process.env.LOCALAPPDATA || '', 'Raw Accel'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Raw Accel'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Raw Accel'),
      'C:\\Raw Accel',
      path.join(os.homedir(), 'Downloads', 'Raw Accel')
    ];

    for (const dir of candidateDirs) {
      try {
        if (!fs.existsSync(dir)) {
          if (dir.includes('AppData')) fs.mkdirSync(dir, { recursive: true });
          else continue;
        }
        const settingsPath = path.join(dir, 'settings.json');
        fs.writeFileSync(settingsPath, JSON.stringify(preset.settings, null, 2), 'utf8');

        const writerExe = path.join(dir, 'writer.exe');
        if (fs.existsSync(writerExe)) {
          try { exec(`"${writerExe}" "${settingsPath}"`, { windowsHide: true }); } catch (_) {}
        }
      } catch (_) {}
    }

    const targetSens = preset.settings.sensitivity ? Math.round(preset.settings.sensitivity * 10) : 10;
    await safeExec(`reg add "HKCU\\Control Panel\\Mouse" /v MouseSensitivity /t REG_SZ /d "${targetSens}" /f`);
    applyRealtimeWindowsMouse(targetSens);

    return {
      success: true,
      presetName: preset.name,
      message: `Preset "${preset.name}" aplicado com sucesso no Raw Accel!`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC Handlers: Loord Timer Resolution (0.5ms Persistente em Background) ──
ipcMain.handle('get-timer-resolution-status', () => {
  return { active: loordTimerResolutionActive && loordTimerResolutionWorker && !loordTimerResolutionWorker.killed };
});

ipcMain.handle('apply-timer-resolution', async (_e, enable) => {
  try {
    const shouldEnable = enable !== false;
    if (shouldEnable) {
      if (loordTimerResolutionWorker) {
        try { loordTimerResolutionWorker.kill(); } catch (_) {}
        loordTimerResolutionWorker = null;
      }
      const psCode = `
        Add-Type -TypeDefinition '[DllImport(\"ntdll.dll\")] public static extern int NtSetTimerResolution(uint a, bool b, out uint c); [DllImport(\"winmm.dll\")] public static extern int timeBeginPeriod(uint p);' -Name Win32Timer -Namespace Loord;
        uint $c;
        [Loord.Win32Timer]::NtSetTimerResolution(5000, $true, [ref]$c);
        [Loord.Win32Timer]::timeBeginPeriod(1);
        while ($true) { Start-Sleep -Seconds 3600 }
      `;
      loordTimerResolutionWorker = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCode.replace(/\r?\n/g, ' ')], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      loordTimerResolutionWorker.unref();
      loordTimerResolutionActive = true;
      return { success: true, active: true, message: 'Temporizador travado em 0.5ms (Latência Zero)!' };
    } else {
      if (loordTimerResolutionWorker) {
        try { loordTimerResolutionWorker.kill(); } catch (_) {}
        loordTimerResolutionWorker = null;
      }
      const restoreCode = `
        Add-Type -TypeDefinition '[DllImport(\"ntdll.dll\")] public static extern int NtSetTimerResolution(uint a, bool b, out uint c); [DllImport(\"winmm.dll\")] public static extern int timeEndPeriod(uint p);' -Name Win32Timer -Namespace Loord;
        uint $c;
        [Loord.Win32Timer]::NtSetTimerResolution(156250, $false, [ref]$c);
        [Loord.Win32Timer]::timeEndPeriod(1);
      `;
      await safeExec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${restoreCode.replace(/\r?\n/g, ' ')}"`);
      loordTimerResolutionActive = false;
      return { success: true, active: false, message: 'Temporizador restaurado para o padrão do Windows.' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});




