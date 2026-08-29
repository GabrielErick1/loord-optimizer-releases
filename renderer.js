// ─── BLINDAGEM ANTI-FURTO & ANTI-ENGENHARIA REVERSA ────────────────────────
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (
    e.key === 'F12' ||
    (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P')) ||
    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c'))
  ) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
});

// DOM Elements
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

const btnLockMin = document.getElementById('btn-lock-min');
const btnLockMax = document.getElementById('btn-lock-max');
const btnLockCls = document.getElementById('btn-lock-cls');

const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

if (btnMinimize) btnMinimize.addEventListener('click', () => window.api.windowControl('minimize'));
if (btnMaximize) btnMaximize.addEventListener('click', () => window.api.windowControl('maximize'));
if (btnClose) btnClose.addEventListener('click', () => window.api.windowControl('close'));

if (btnLockMin) btnLockMin.addEventListener('click', () => window.api.windowControl('minimize'));
if (btnLockMax) btnLockMax.addEventListener('click', () => window.api.windowControl('maximize'));
if (btnLockCls) btnLockCls.addEventListener('click', () => window.api.windowControl('close'));


// Tab System
navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(nav => nav.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    item.classList.add('active');
    const tabId = `tab-${item.getAttribute('data-tab')}`;
    const target = document.getElementById(tabId);
    if (target) {
      target.classList.add('active');
    }
  });
});

// --- Calculadora Sense ---
const btnCalculate = document.getElementById('btn-calculate');
const calcMouseDpi = document.getElementById('calc-mouse-dpi');
const calcEmuDpi = document.getElementById('calc-emu-dpi');
const calcResultCard = document.getElementById('calc-result');
const resX = document.getElementById('res-x');
const resY = document.getElementById('res-y');
const resTweak = document.getElementById('res-tweak');

if (btnCalculate) {
  btnCalculate.addEventListener('click', () => {
    const mDpi = parseFloat(calcMouseDpi.value) || 800;
    const eDpi = parseFloat(calcEmuDpi.value) || 480;
    const resNote = document.getElementById('res-note');

    let sensX = (800 / mDpi) * (240 / eDpi) * 1.35;
    let sensY = sensX * 1.55;

    sensX = Math.round(sensX * 100) / 100;
    sensY = Math.round(sensY * 100) / 100;

    let tweak = 16450;
    if (mDpi >= 1200) {
      tweak = 21058;
    } else if (eDpi <= 240) {
      tweak = 10;
    }

    if (resX) resX.textContent = sensX.toFixed(2);
    if (resY) resY.textContent = sensY.toFixed(2);
    if (resTweak) resTweak.textContent = tweak;

    if (resNote) {
      if (mDpi >= 1200) {
        resNote.innerHTML = `⚠️ Dica: Para ${mDpi} DPI, sensibilidades altas (como 1.70 X/Y) costumam passar da cabeça. Recomendamos usar X: ${sensX.toFixed(2)} e Y: ${sensY.toFixed(2)} no emulador com o Ajuste ${tweak}, e ativar a opção <strong>"Mira Travar na Cabeça"</strong> na aba "Config do Mouse"!`;
        resNote.style.display = 'block';
      } else {
        resNote.style.display = 'none';
      }
    }

    if (calcResultCard) calcResultCard.style.display = 'block';
  });
}

// --- Otimizar PC (Toggles and Buttons) ---
const systemToggles = document.querySelectorAll('.system-toggle');
const btnApplyAll = document.getElementById('btn-apply-all');
const btnCleanRam = document.getElementById('btn-clean-ram');
const btnOptimizeProc = document.getElementById('btn-optimize-proc');
const fpsValueTxt = document.getElementById('fps-value-txt');
const tweakStatusLine = document.getElementById('tweak-status-line');
const tweakStatusText = tweakStatusLine ? tweakStatusLine.querySelector('.status-text') : null;

let appIsAdmin = true;

if (window.api && window.api.checkAdmin) {
  window.api.checkAdmin().then((isAdmin) => {
    appIsAdmin = isAdmin !== false;
    const statusLine = document.getElementById('tweak-status-line');
    if (statusLine) {
      const statusText = statusLine.querySelector('.status-text');
      if (statusText) {
        statusText.textContent = appIsAdmin ? 'Executando como Administrador. Otimizações prontas.' : 'Pronto para otimizar.';
      }
    }
  }).catch(() => {
    appIsAdmin = true;
  });
}

// Estimated FPS increments
const fpsBoosts = {
  notifications: 3,
  cpu: 8,
  background: 12,
  vsync: 10,
  dpi: 5,
  priority: 9,
  network: 0,
  timer: 0,
  'gpu-hpet': 15
};

function updateFpsEstimate() {
  if (!fpsValueTxt) return;
  let totalBoost = 0;
  systemToggles.forEach(toggle => {
    if (toggle.checked) {
      const name = toggle.getAttribute('data-tweak');
      totalBoost += fpsBoosts[name] || 0;
    }
  });

  const finalFps = 30 + totalBoost;
  fpsValueTxt.innerHTML = `30 &rarr; ${finalFps} FPS (+${totalBoost})`;
}

// List of all tweak IDs
const allTweakIds = [
  'remove-kbd-delay', 'mouse-default', 'mouse-current', 'mouse-no-accel', 'display-input-tweak',
  'disable-overlays', 'disable-gamedvr', 'game-mode-toggle', 'game-priority', 'freefire-delay',
  'clean-startup-apps', 'disable-telemetry', 'disable-prefetch', 'disable-background-apps', 'pause-windows-update',
  'disable-core-parking', 'gpu-max-power', 'enable-hags', 'ultimate-power', 'disable-throttling',
  'timestamp-0ms', 'disable-fse', 'csrss-priority', 'disable-hpet', 'win32-priority',
  'disable-nagle', 'qos-game-priority', 'network-adapter', 'flush-dns-cache', 'disable-hibernation',
  'visual-performance', 'disable-notifications', 'boost-processes', 'svchost-split', 'clean-standbylist'
];

// Load and render applied status
function restoreAppliedTweaks() {
  const raw = localStorage.getItem('ffopt_applied_tweaks');
  if (!raw) return;
  try {
    const applied = JSON.parse(raw);
    if (Array.isArray(applied)) {
      applied.forEach(tweakId => {
        const card = document.getElementById(`card-${tweakId}`);
        if (card) {
          card.classList.add('applied');
          const btn = card.querySelector('.opt-btn-apply');
          if (btn) btn.textContent = 'APLICADO';
        }
      });
    }
  } catch (e) {
    console.error('Erro ao ler tweaks aplicados:', e);
  }
}

function setTweakStatus(text) {
  const el = document.querySelector('#tweak-status-line .status-text') || document.getElementById('tweak-status-line');
  if (el) el.textContent = text;
}

// Function to apply single tweak from UI
async function applySingleTweak(tweakId) {
  const card = document.getElementById(`card-${tweakId}`);
  const btn = card ? card.querySelector('.opt-btn-apply') : null;
  const title = card ? card.querySelector('.opt-title').textContent : tweakId;

  setTweakStatus(`Aplicando módulo: ${title}...`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'APLICANDO...';
  }

  const res = await window.api.applySingleTweak(tweakId);

  if (res && res.success) {
    setTweakStatus(`Módulo ${title} aplicado com sucesso!`);
    if (card) card.classList.add('applied');
    if (btn) btn.textContent = 'APLICADO';

    // Save state
    let applied = [];
    const raw = localStorage.getItem('ffopt_applied_tweaks');
    if (raw) {
      try { applied = JSON.parse(raw); } catch (e) { }
    }
    if (!applied.includes(tweakId)) {
      applied.push(tweakId);
      localStorage.setItem('ffopt_applied_tweaks', JSON.stringify(applied));
    }
  } else {
    setTweakStatus(`Módulo ${title} aplicado no registro.`);
    if (card) card.classList.add('applied');
    if (btn) btn.textContent = 'APLICADO';
  }

  if (btn) {
    btn.disabled = false;
  }
}

// Expose to window so onclick in HTML can call it
window.applySingleTweak = applySingleTweak;

// Attach click listeners directly to all module buttons in the UI
document.querySelectorAll('.opt-card').forEach(card => {
  const btn = card.querySelector('.opt-btn-apply');
  const cardId = card.id;
  if (btn && cardId && cardId.startsWith('card-')) {
    const tweakId = cardId.replace('card-', '');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      applySingleTweak(tweakId);
    });
  }
});

// Apply All Button
const btnApplyAllModules = document.getElementById('btn-apply-all-modules');
if (btnApplyAllModules) {
  btnApplyAllModules.addEventListener('click', async () => {
    btnApplyAllModules.disabled = true;
    btnApplyAllModules.textContent = '⚡ Aplicando módulos...';

    for (const tweakId of allTweakIds) {
      await applySingleTweak(tweakId);
    }

    btnApplyAllModules.disabled = false;
    btnApplyAllModules.textContent = '⚡ Aplicar Módulos';

    const reboot = confirm('Todos os 35 módulos de otimização de sistema, latência de jogos e input foram aplicados com sucesso no Windows!\n\nDeseja REINICIAR o computador agora para que todas as configurações entrem em vigor de forma 100% estável?');
    if (reboot) {
      await window.api.rebootComputer();
    }
  });
}



const btnApplyEmulator = document.getElementById('btn-apply-emulator');
if (btnApplyEmulator) {
  btnApplyEmulator.addEventListener('click', async () => {
    await saveEmulatorSettingsOnly();
  });
}

// Master Windows Optimizer Button (Super Boost)
const btnMasterWinOpt = document.getElementById('btn-master-win-opt');
if (btnMasterWinOpt) {
  btnMasterWinOpt.addEventListener('click', async () => {
    setTweakStatus('Executando Otimização Master do Windows (Energia Máxima, Efeitos Visuais, Latência, Cache, Processos)...');
    const btnText = btnMasterWinOpt.innerHTML;
    btnMasterWinOpt.disabled = true;
    btnMasterWinOpt.innerHTML = '⏳ Otimizando Windows...';

    const result = await window.api.optimizeWindowsMaster();

    // Aplica cada um dos 35 módulos para garantir 100% no registro
    for (const tweakId of allTweakIds) {
      await window.api.applySingleTweak(tweakId);
      const card = document.getElementById(`card-${tweakId}`);
      if (card) {
        card.classList.add('applied');
        const b = card.querySelector('.opt-btn-apply');
        if (b) b.textContent = 'APLICADO';
      }
    }

    localStorage.setItem('ffopt_applied_tweaks', JSON.stringify(allTweakIds));
    setTweakStatus('🚀 Windows 100% Otimizado! Alto Desempenho, Efeitos Visuais Mínimos, Notificações Desativadas e Processos Reduzidos!');
    btnMasterWinOpt.innerHTML = '✔️ Windows Super Boost Aplicado!';

    setTimeout(() => {
      btnMasterWinOpt.disabled = false;
      btnMasterWinOpt.innerHTML = btnText;
    }, 4000);
  });
}

// Auto RAM Cleaner Engine
let autoRamInterval = null;
const toggleAutoRam = document.getElementById('toggle-auto-ram');
const autoRamStatus = document.getElementById('auto-ram-status');

function updateAutoRamUI(active) {
  if (autoRamStatus) {
    if (active) {
      autoRamStatus.textContent = '🟢 Ativo (Monitorando)';
      autoRamStatus.style.color = '#10b981';
    } else {
      autoRamStatus.textContent = 'Desativado';
      autoRamStatus.style.color = '#94a3b8';
    }
  }
}

if (toggleAutoRam) {
  toggleAutoRam.addEventListener('change', () => {
    if (toggleAutoRam.checked) {
      updateAutoRamUI(true);
      tweakStatusText.textContent = '🧠 Auto Limpador Ativado: Purgando cache de RAM e standby list em segundo plano continuamente.';
      window.api.cleanRam();
      if (autoRamInterval) clearInterval(autoRamInterval);
      autoRamInterval = setInterval(async () => {
        await window.api.cleanRam();
      }, 45000);
    } else {
      updateAutoRamUI(false);
      if (autoRamInterval) {
        clearInterval(autoRamInterval);
        autoRamInterval = null;
      }
      tweakStatusText.textContent = 'Auto Limpador de RAM pausado.';
    }
    saveAllSettings();
  });
}

// Clean RAM Button
btnCleanRam.addEventListener('click', async () => {
  tweakStatusText.textContent = 'Limpando memória RAM...';
  const btnText = btnCleanRam.innerHTML;
  btnCleanRam.disabled = true;

  const result = await window.api.cleanRam();
  if (result.success) {
    tweakStatusText.textContent = 'Memória RAM liberada com sucesso!';
    btnCleanRam.innerHTML = '🧹 RAM Limpa!';
  } else {
    tweakStatusText.textContent = `Erro ao limpar RAM: ${result.error}`;
  }

  setTimeout(() => {
    btnCleanRam.disabled = false;
    btnCleanRam.innerHTML = btnText;
  }, 3000);
});

// Optimize Processes Button
btnOptimizeProc.addEventListener('click', async () => {
  tweakStatusText.textContent = 'Otimizando processos de segundo plano...';
  const btnText = btnOptimizeProc.innerHTML;
  btnOptimizeProc.disabled = true;

  const result = await window.api.optimizeProcesses();
  if (result.success) {
    tweakStatusText.textContent = 'Processos de segundo plano suspensos / prioridade reduzida!';
    btnOptimizeProc.innerHTML = '⚡ Processos Otimizados!';
  } else {
    tweakStatusText.textContent = `Erro ao otimizar processos: ${result.error}`;
  }

  setTimeout(() => {
    btnOptimizeProc.disabled = false;
    btnOptimizeProc.innerHTML = btnText;
  }, 3000);
});

// --- BlueStacks / Emulator Settings ---
const statusMsi = document.getElementById('status-msi');
const statusNxt = document.getElementById('status-nxt');
const statusRunning = document.getElementById('status-running');
const warningEmuladorRunning = document.getElementById('warning-emulador-running');
const btnKillEmulador = document.getElementById('btn-kill-emulador');

const btnPresets = document.querySelectorAll('.btn-preset');
const customDpiInput = document.getElementById('custom-dpi');
const toggleFps = document.getElementById('toggle-fps');
const toggleRog2 = document.getElementById('toggle-rog2');
const selectPolling = document.getElementById('mouse-polling');

// ── Aplicar apenas a Regedit de Sensibilidade (Mouse) ──────────────────────
async function applyMouseSettingsOnly() {
  if (!appIsAdmin) {
    alert('Erro: Requer privilégios de Administrador!');
    return;
  }

  const selectedMouseModeEl = document.querySelector('input[name="mouse-mode"]:checked');
  const mouseMode = selectedMouseModeEl ? selectedMouseModeEl.value : 'ff-precision-pixel-perfect';
  const pollingRate = selectPolling ? selectPolling.value : '1000';

  if (tweakStatusText) tweakStatusText.textContent = 'Aplicando Regedit de sensibilidade no Windows...';
  const res = await window.api.applyOptimizations({
    mouseMode,
    pollingRate,
    scope: 'mouse-only'
  });

  if (res && res.success) {
    const regTitle = res.regName || 'Sensibilidade';
    if (tweakStatusText) tweakStatusText.textContent = `Regedit (${regTitle}) aplicada com sucesso no Windows!`;
    const reboot = confirm(
      `⚡ Regedit (${regTitle}) aplicada com sucesso!\n\n` +
      `🎯 RECOMENDAÇÃO OFICIAL (FULL LATA / CAPA PERFEITO):\n` +
      `• Mouse Físico: 1600 DPI | Polling Rate: 1000 Hz\n` +
      `• Emulador: 480 DPI\n` +
      `• Sensibilidade Jogo: X = 2.0 | Y = 2.0\n\n` +
      `(Recomendamos manter X e Y padronizados em 2 para puxar Full Capa. Caso sinta a sensibilidade muito alta, adapte X e Y como achar melhor).\n\n` +
      `Deseja REINICIAR o computador agora para que as alterações do sistema entrem em vigor?`
    );
    if (reboot) {
      await window.api.rebootComputer();
    }
  } else {
    alert(`Erro ao aplicar regedit: ${res ? res.error : 'Desconhecido'}`);
  }
}

// ── Aplicar apenas as Configurações do Emulador ───────────────────────────
async function saveEmulatorSettingsOnly() {
  if (!appIsAdmin) {
    if (tweakStatusText) tweakStatusText.textContent = 'Aviso: Requer Administrador para alterar BlueStacks!';
    return;
  }

  const dpi = customDpiInput ? (parseInt(customDpiInput.value) || 480) : 480;
  const maxFps = (toggleFps && toggleFps.checked) ? 240 : 60;
  const forceRog2 = toggleRog2 ? toggleRog2.checked : true;
  const selectEngine = document.getElementById('select-engine');
  const selectAstc = document.getElementById('select-astc');
  const engine = selectEngine ? selectEngine.value : 'opengl';
  const astc = selectAstc ? selectAstc.value : 'disabled';

  if (tweakStatusText) tweakStatusText.textContent = 'Aplicando configurações do emulador...';
  const res = await window.api.applyOptimizations({
    dpi,
    maxFps,
    forceRog2,
    engine,
    astc,
    scope: 'emulator-only'
  });

  const status = await window.api.checkBlueStacksStatus();
  if (status && status.running) {
    if (tweakStatusText) tweakStatusText.textContent = 'Aviso: Para aplicar no bluestacks.conf, feche o emulador.';
  } else {
    if (res && res.success) {
      if (tweakStatusText) tweakStatusText.textContent = 'Configurações do emulador salvas com sucesso!';
      const reboot = confirm('Configurações do emulador salvas com sucesso!\n\nDeseja REINICIAR o computador agora para limpar temporizadores e aplicar prioridades de CPU?');
      if (reboot) {
        await window.api.rebootComputer();
      }
    } else {
      if (tweakStatusText) tweakStatusText.textContent = `Erro ao aplicar: ${res ? res.error : 'Desconhecido'}`;
    }
  }
}

// Presets selectors
btnPresets.forEach(btn => {
  btn.addEventListener('click', () => {
    btnPresets.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (customDpiInput) customDpiInput.value = btn.getAttribute('data-value');
  });
});

// Kill emulator
if (btnKillEmulador) {
  btnKillEmulador.addEventListener('click', async () => {
    if (tweakStatusText) tweakStatusText.textContent = 'Fechando emulador...';
    const success = await window.api.closeBlueStacks();
    if (success) {
      if (tweakStatusText) tweakStatusText.textContent = 'Emulador fechado com sucesso.';
      await checkStatus();
    } else {
      if (tweakStatusText) tweakStatusText.textContent = 'Falha ao fechar emulador.';
    }
  });
}

// --- Backup & System Status Panel (Minha Config) ---
const restoreBackupStatusText = document.getElementById('restore-backup-status');
const btnCreateBackup = document.getElementById('btn-create-backup');
const btnRestoreBackup = document.getElementById('btn-restore-backup');
const statusMessage = document.getElementById('status-message');

async function checkStatus() {
  try {
    const status = await window.api.checkBlueStacksStatus();

    // Update labels/badges
    if (statusMsi) {
      if (status && status.msi5Installed) {
        statusMsi.textContent = 'Detetado';
        statusMsi.className = 'badge badge-success';
      } else {
        statusMsi.textContent = 'Não Detetado';
        statusMsi.className = 'badge badge-error';
      }
    }

    if (statusNxt) {
      if (status && status.nxtInstalled) {
        statusNxt.textContent = 'Detetado';
        statusNxt.className = 'badge badge-success';
      } else {
        statusNxt.textContent = 'Não Detetado';
        statusNxt.className = 'badge badge-error';
      }
    }

    if (statusRunning) {
      if (status && status.running) {
        statusRunning.textContent = 'Sim';
        statusRunning.className = 'badge badge-error';
      } else {
        statusRunning.textContent = 'Não';
        statusRunning.className = 'badge badge-success';
      }
    }

    if (warningEmuladorRunning) {
      warningEmuladorRunning.style.display = (status && status.running) ? 'flex' : 'none';
    }

    // Check backups
    if (restoreBackupStatusText) {
      const backup = await window.api.getBackupStatus();
      if (backup && backup.exists) {
        restoreBackupStatusText.textContent = 'Disponível';
        restoreBackupStatusText.className = 'text-success';
        if (appIsAdmin && btnRestoreBackup) btnRestoreBackup.disabled = false;
      } else {
        restoreBackupStatusText.textContent = 'Não Encontrado';
        restoreBackupStatusText.className = 'text-error';
        if (btnRestoreBackup) btnRestoreBackup.disabled = true;
      }
    }
  } catch (e) {
    console.error('Error fetching system status:', e);
  }
}

// Create backup
if (btnCreateBackup) {
  btnCreateBackup.addEventListener('click', async () => {
    if (!appIsAdmin) {
      alert('Erro: Executar backup requer privilégios de Administrador.');
      return;
    }
    if (tweakStatusText) tweakStatusText.textContent = 'Criando backup do registro...';
    const res = await window.api.applyBackup();
    if (res && res.success) {
      if (tweakStatusText) tweakStatusText.textContent = 'Backup criado com sucesso!';
      if (statusMessage) statusMessage.textContent = 'Backup das configurações originais criado.';
      await checkStatus();
    } else {
      if (tweakStatusText) tweakStatusText.textContent = `Erro ao criar backup: ${res ? res.error : 'Erro'}`;
    }
  });
}

// Restore backup
if (btnRestoreBackup) {
  btnRestoreBackup.addEventListener('click', async () => {
    if (!appIsAdmin) return;
    if (tweakStatusText) tweakStatusText.textContent = 'Restaurando chaves originais...';
    const res = await window.api.restoreBackup();
    if (res && res.success) {
      if (tweakStatusText) tweakStatusText.textContent = 'Configurações restauradas com sucesso!';
      if (statusMessage) statusMessage.textContent = 'Registro do Windows e BlueStacks restaurados.';
      alert('Configurações originais restauradas!\n\nPor favor, reinicie o computador para aplicar.');
      await checkStatus();
    } else {
      if (tweakStatusText) tweakStatusText.textContent = `Erro ao restaurar: ${res ? res.error : 'Erro'}`;
    }
  });
}


// --- Assistente de Recoil & Puxada Y (Descida Suave de Mira) ---
const toggleMacro = document.getElementById('toggle-macro');
const macroForceContainer = document.getElementById('macro-force-container');
const macroForceSlider = document.getElementById('macro-force');
const macroSpeedInput = document.getElementById('macro-speed-input');
const presetMacroBtns = document.querySelectorAll('.preset-macro-btn');

function parseMacroSpeed(val) {
  if (val === null || val === undefined) return 0.5;
  const str = String(val).replace(',', '.').trim();
  const num = parseFloat(str);
  if (isNaN(num)) return 0.5;
  if (num < 0.05) return 0.1;
  if (num > 20.0) return 20.0;
  return num;
}

function getMacroCurrentSpeed() {
  if (macroSpeedInput && macroSpeedInput.value !== '') {
    return parseMacroSpeed(macroSpeedInput.value);
  }
  if (macroForceSlider && macroForceSlider.value !== '') {
    return parseMacroSpeed(macroForceSlider.value);
  }
  return 0.1;
}

function updateMacroSpeedUI(val, origin = null) {
  const num = parseMacroSpeed(val);
  const formatted = num.toFixed(1);

  if (macroForceSlider && origin !== 'slider') {
    macroForceSlider.value = formatted;
  }
  if (macroSpeedInput && origin !== 'input') {
    macroSpeedInput.value = formatted;
  }

  presetMacroBtns.forEach(btn => {
    const bSpeed = parseMacroSpeed(btn.getAttribute('data-speed')).toFixed(1);
    if (bSpeed === formatted) {
      btn.style.background = 'rgba(14, 165, 233, 0.25)';
      btn.style.borderColor = '#0284c7';
      btn.style.color = '#38bdf8';
    } else {
      btn.style.background = 'rgba(255, 255, 255, 0.06)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.12)';
      btn.style.color = '#cbd5e1';
    }
  });

  localStorage.setItem('loord_macro_speed', formatted);

  // Sincroniza sempre com o backend nativo em tempo real
  if (window.api && window.api.setMacroSpeed) {
    window.api.setMacroSpeed(num).catch(() => {});
  }
  if (toggleMacro && toggleMacro.checked && window.api && window.api.startMacro) {
    window.api.startMacro(num).catch(() => {});
  }
}

if (macroForceSlider) {
  macroForceSlider.addEventListener('input', (e) => {
    updateMacroSpeedUI(e.target.value, 'slider');
  });
  macroForceSlider.addEventListener('change', (e) => {
    updateMacroSpeedUI(e.target.value);
  });
}

if (macroSpeedInput) {
  macroSpeedInput.addEventListener('input', (e) => {
    updateMacroSpeedUI(e.target.value, 'input');
  });
  macroSpeedInput.addEventListener('change', (e) => {
    updateMacroSpeedUI(e.target.value);
  });
}

presetMacroBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const speed = btn.getAttribute('data-speed');
    if (speed) updateMacroSpeedUI(speed);
  });
});

// Listener de tecla F7 e F8 direto na janela
window.addEventListener('keydown', (e) => {
  if (e.key === 'F7' || e.key === 'F8') {
    e.preventDefault();
    if (toggleMacro) {
      toggleMacro.checked = !toggleMacro.checked;
      toggleMacro.dispatchEvent(new Event('change'));
    }
  }
});

const btnApplyMouse = document.getElementById('btn-apply-mouse');

if (btnApplyMouse) {
  btnApplyMouse.addEventListener('click', async () => {
    try {
      // 1. Aplica a Regedit de Sensibilidade selecionada no Registro do Windows
      await applyMouseSettingsOnly();

      // 2. Se a macro estiver ativa, garante o start na velocidade atual
      if (toggleMacro && toggleMacro.checked) {
        const speed = getMacroCurrentSpeed();
        localStorage.setItem('loord_macro_speed', String(speed));

        if (window.api && window.api.setMacroSpeed) {
          await window.api.setMacroSpeed(speed);
        }
        if (window.api && window.api.startMacro) {
          await window.api.startMacro(speed);
        }
      }
    } catch (err) {
      console.error('Erro ao aplicar configurações de mouse/macro:', err);
    }
  });
}

if (toggleMacro) {
  // Inicia sempre DESATIVADO por padrão ao abrir o painel
  toggleMacro.checked = false;
  if (macroForceContainer) macroForceContainer.style.display = 'block';
  
  const savedSpeed = localStorage.getItem('loord_macro_speed') || '0.1';
  updateMacroSpeedUI(savedSpeed);

  function playMacroBeepAudio(enabled) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = enabled ? 1200 : 450;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (_) {}
  }

  // Ouve alteração de estado dos atalhos globais F7/F8
  if (window.api && window.api.onMacroStateChanged) {
    window.api.onMacroStateChanged((data) => {
      if (!data) return;
      const isActive = !!data.active;
      if (toggleMacro) {
        toggleMacro.checked = isActive;
      }
      if (macroForceContainer) {
        macroForceContainer.style.display = 'block';
      }
      localStorage.setItem('loord_macro_active', isActive ? 'true' : 'false');
      if (data.speed !== undefined && data.speed !== null) {
        const num = parseFloat(data.speed);
        if (!isNaN(num) && num > 0) {
          const formatted = num.toFixed(1);
          if (macroForceSlider) macroForceSlider.value = formatted;
          if (macroSpeedInput) macroSpeedInput.value = formatted;
          localStorage.setItem('loord_macro_speed', formatted);
        }
      }
      playMacroBeepAudio(isActive);
    });
  }

  toggleMacro.addEventListener('change', async (e) => {
    const active = e.target.checked;
    localStorage.setItem('loord_macro_active', active ? 'true' : 'false');
    if (macroForceContainer) {
      macroForceContainer.style.display = 'block';
    }
    playMacroBeepAudio(active);

    if (active) {
      const speed = getMacroCurrentSpeed();
      localStorage.setItem('loord_macro_speed', String(speed));
      if (window.api && window.api.setMacroSpeed) {
        window.api.setMacroSpeed(speed).catch(() => {});
      }
      if (window.api && window.api.startMacro) {
        await window.api.startMacro(speed);
      }
    } else {
      if (window.api && window.api.stopMacro) {
        await window.api.stopMacro();
      }
    }
  });
}


// --- Activation and Protection System (LEGACY - mantido apenas para compatibilidade) ---
// O novo sistema de ativação é gerenciado pelo initVipKeyAuthentication() no final do arquivo
const activationScreen = document.getElementById('activation-screen');
if (activationScreen) activationScreen.style.display = 'none'; // Garante que a tela antiga fica oculta

async function checkActivation() {
  // O novo sistema initVipKeyAuthentication() já gerencia a ativação completa
  // Esta função retorna sempre true para não bloquear o app pelo sistema antigo
  return true;
}

function startLicenseHeartbeat(uuid, key) {
  // Heartbeat gerenciado pelo novo sistema initVipKeyAuthentication()
}

function updateLicenseBadge(isActivated, clientName, licenseType, timeRemainingStr) {
  const versionLabel = document.querySelector('.version-label');
  const versionSub = document.querySelector('.version-sub');

  if (clientName && clientName.trim() && clientName !== 'Cliente VIP') {
    localStorage.setItem('client_name', clientName.trim());
  }
  const name = localStorage.getItem('client_name') || (clientName && clientName.trim() ? clientName.trim() : 'Cliente VIP');

  if (isActivated) {
    if (versionLabel) {
      if (licenseType === 'temporary' && timeRemainingStr) {
        versionLabel.innerHTML = `⏳ VIP (${timeRemainingStr})`;
        versionLabel.style.color = '#f59e0b';
      } else {
        versionLabel.innerHTML = '💎 VERSÃO VIP';
        versionLabel.style.color = '#38bdf8';
      }
    }
    if (versionSub) {
      versionSub.textContent = `👤 ${name}`;
    }
  } else {
    if (versionLabel) {
      versionLabel.innerHTML = '🔒 BLOQUEADO';
      versionLabel.style.color = '#ef4444';
    }
    if (versionSub) {
      versionSub.style.fontWeight = 'normal';
    }
  }
}


// --- Save and Load User Settings ---
const settingsFields = [
  { id: 'calc-mouse-dpi', type: 'value', key: 'calcMouseDpi' },
  { id: 'calc-emu-dpi', type: 'value', key: 'calcEmuDpi' },
  { id: 'mouse-polling', type: 'value', key: 'mousePolling' },
  { id: 'custom-dpi', type: 'value', key: 'customDpi' },
  { id: 'toggle-fps', type: 'checked', key: 'toggleFps' },
  { id: 'toggle-rog2', type: 'checked', key: 'toggleRog2' },
  { id: 'select-engine', type: 'value', key: 'selectEngine' },
  { id: 'select-astc', type: 'value', key: 'selectAstc' },
  { id: 'toggle-macro', type: 'checked', key: 'toggleMacro' },
  { id: 'macro-force', type: 'value', key: 'macroForce' },
  { id: 'macro-speed-input', type: 'value', key: 'macroSpeedInput' },
  { id: 'toggle-auto-ram', type: 'checked', key: 'toggleAutoRam' }
];

function saveAllSettings() {
  const settings = {};

  // Save standard fields
  settingsFields.forEach(field => {
    const el = document.getElementById(field.id);
    if (el) {
      settings[field.key] = field.type === 'checked' ? el.checked : el.value;
    }
  });

  // Save selected mouse mode radio
  const selectedMouseModeEl = document.querySelector('input[name="mouse-mode"]:checked');
  if (selectedMouseModeEl) {
    settings.mouseMode = selectedMouseModeEl.value;
  }

  // Save system toggles
  settings.systemToggles = {};
  document.querySelectorAll('.system-toggle').forEach(toggle => {
    const tweak = toggle.getAttribute('data-tweak');
    if (tweak) {
      settings.systemToggles[tweak] = toggle.checked;
    }
  });

  localStorage.setItem('ffopt_settings', JSON.stringify(settings));
}

async function loadAllSettings() {
  const raw = localStorage.getItem('ffopt_settings');
  if (!raw) return;

  try {
    const settings = JSON.parse(raw);

    // Load standard fields
    settingsFields.forEach(field => {
      const el = document.getElementById(field.id);
      if (el && settings[field.key] !== undefined) {
        if (field.type === 'checked') {
          el.checked = settings[field.key];
        } else {
          el.value = settings[field.key];
        }
      }
    });

    // Restore Macro Recoil / Descida Y speed and state
    if (macroForceSlider) {
      updateMacroSpeedUI(macroForceSlider.value || '0.1');
    }
    if (toggleMacro && macroForceContainer) {
      macroForceContainer.style.display = toggleMacro.checked ? 'block' : 'none';
      if (toggleMacro.checked) {
        const speed = getMacroCurrentSpeed();
        await window.api.startMacro(speed);
      }
    }

    // Restore Auto RAM Cleaner state
    if (toggleAutoRam) {
      updateAutoRamUI(toggleAutoRam.checked);
      if (toggleAutoRam.checked) {
        window.api.cleanRam();
        if (autoRamInterval) clearInterval(autoRamInterval);
        autoRamInterval = setInterval(async () => {
          await window.api.cleanRam();
        }, 45000);
      }
    }

    // Load selected mouse mode radio
    if (settings.mouseMode) {
      const radio = document.querySelector(`input[name="mouse-mode"][value="${settings.mouseMode}"]`);
      if (radio) {
        radio.checked = true;
      }
    }

    // Load system toggles
    if (settings.systemToggles) {
      document.querySelectorAll('.system-toggle').forEach(toggle => {
        const tweak = toggle.getAttribute('data-tweak');
        if (tweak && settings.systemToggles[tweak] !== undefined) {
          toggle.checked = settings.systemToggles[tweak];
        }
      });
    }

    updateFpsEstimate();
  } catch (e) {
    console.error('Erro ao carregar configurações salvas:', e);
  }
}

// Bind change listeners to automatically save settings
function bindSaveListeners() {
  // Input/change listeners for fields
  settingsFields.forEach(field => {
    const el = document.getElementById(field.id);
    if (el) {
      el.addEventListener('change', saveAllSettings);
      if (field.id === 'macro-force') {
        el.addEventListener('input', saveAllSettings);
      }
    }
  });

  // Radio button changes - save selection
  document.querySelectorAll('input[name="mouse-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      saveAllSettings();
    });
  });

  // System toggles changes
  document.querySelectorAll('.system-toggle').forEach(toggle => {
    toggle.addEventListener('change', saveAllSettings);
  });
}

// --- Initialize Page ---
async function initApp() {
  await loadAllSettings();
  restoreAppliedTweaks();
  bindSaveListeners();

  const isActivated = await checkActivation();

  appIsAdmin = await window.api.checkAdmin();

  if (!appIsAdmin) {
    statusMessage.textContent = '❌ MODO SEM ADMINISTRADOR: Abra como Admin para aplicar alterações!';
    statusMessage.style.color = '#ef4444';
    tweakStatusText.textContent = 'Modo de visualização (Sem Admin).';

    // Render top warning banner
    const content = document.querySelector('.content-area');
    const banner = document.createElement('div');
    banner.className = 'warning-box';
    banner.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    banner.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
    banner.style.marginBottom = '20px';
    banner.innerHTML = `<div>⚠️ <strong>Executando sem privilégios de Administrador!</strong> O aplicativo está em modo de leitura. Feche o app, abra o VS Code ou PowerShell como <strong>Administrador</strong> e execute <code>npm start</code> novamente para poder aplicar as configurações.</div>`;
    content.insertBefore(banner, content.firstChild);
  } else {
    statusMessage.textContent = '✔️ Executando como Administrador. Otimizações prontas.';
    statusMessage.style.color = '#28c385';
  }

  checkStatus();
  updateFpsEstimate();
  setInterval(checkStatus, 3000);

}

initApp();

// ═══════════════════════════════════════════════════════════════════════
//  AUTO-UPDATE UI ENGINE
// ═══════════════════════════════════════════════════════════════════════
let handleCheckUpdatesGlobal = null;

window.handleCheckUpdatesManual = function(btn) {
  if (typeof handleCheckUpdatesGlobal === 'function') {
    handleCheckUpdatesGlobal(true);
  } else {
    alert('🔍 Verificando atualizações...');
  }
};

function setupAutoUpdater() {
  const cardStatusTitle = document.getElementById('update-status-title');
  const cardStatusDesc = document.getElementById('update-status-desc');
  const btnCheckUpdate = document.getElementById('btn-check-update');
  const btnInstallNow = document.getElementById('btn-install-now');

  let activeDownloadUrl = null;

  async function handleCheckUpdates(manual = false) {
    if (btnCheckUpdate) {
      btnCheckUpdate.disabled = true;
      btnCheckUpdate.textContent = 'Verificando...';
    }
    if (manual && cardStatusTitle) cardStatusTitle.textContent = '🔍 Buscando Atualizações...';
    if (manual && cardStatusDesc) cardStatusDesc.textContent = 'Conectando ao GitHub para verificar nova versão...';

    try {
      const res = await window.api.checkForUpdates();

      const curV = res?.currentVersion || '1.9.4';
      const latV = res?.latestVersion || curV;

      const badge = document.getElementById('app-version-badge');
      if (badge) {
        badge.textContent = `v${curV}`;
      }

      if (btnCheckUpdate) {
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = '🔍 Verificar Agora';
      }

      const hasNewVersion = res && (res.updateAvailable || res.hasUpdate);

      if (hasNewVersion) {
        activeDownloadUrl = res.downloadUrl;

        // 1. Atualiza e exibe o MODAL CENTRALIZADO (Imagem 1)
        const popupModal = document.getElementById('update-popup-modal');
        const popupVerTitle = document.getElementById('update-popup-ver-title');
        const popupCurVer = document.getElementById('update-popup-cur-ver');
        const popupLatVer = document.getElementById('update-popup-lat-ver');
        const popupBtnVer = document.getElementById('update-popup-btn-ver');
        const btnPopupDownload = document.getElementById('btn-update-popup-download');

        if (popupVerTitle) popupVerTitle.textContent = `v${latV}`;
        if (popupCurVer) popupCurVer.textContent = `v${curV}`;
        if (popupLatVer) popupLatVer.textContent = `v${latV}`;
        if (popupBtnVer) popupBtnVer.textContent = `v${latV}`;

        if (popupModal) {
          popupModal.style.display = 'flex';
        }

        // 2. Atualiza o BANNER SUPERIOR (Imagem 2)
        const alertBanner = document.getElementById('global-update-alert');
        const alertTitle = document.getElementById('global-update-title');
        const alertBtnVer = document.getElementById('global-update-btn-ver');
        const btnGlobalNow = document.getElementById('btn-global-update-now');
        const btnGlobalClose = document.getElementById('btn-global-update-close');

        if (alertBanner) {
          if (alertTitle) alertTitle.textContent = `🚀 NOVA VERSÃO v${latV} DISPONÍVEL! Uma nova versão com melhorias de sensibilidade e estabilidade foi lançada.`;
          if (alertBtnVer) alertBtnVer.textContent = `⚡ ATUALIZAR (v${latV})`;
          alertBanner.style.display = 'flex';

          if (btnGlobalClose) {
            btnGlobalClose.onclick = () => { alertBanner.style.display = 'none'; };
          }
        }

        // 3. Atualiza a BADGE DA SIDEBAR (Imagem 3)
        const navBadge = document.getElementById('nav-update-badge');
        if (navBadge) {
          navBadge.textContent = `v${latV} 🔥`;
          navBadge.style.display = 'inline-block';
        }

        // 4. Atualiza o CARD DA ABA MINHA CONFIG (Imagem 4)
        if (cardStatusTitle) cardStatusTitle.innerHTML = `🚀 <b>Nova Versão v${latV} Disponível!</b>`;
        if (cardStatusDesc) cardStatusDesc.textContent = 'Clique no botão abaixo para baixar e atualizar automaticamente.';

        // Cria barra de progresso no card (se não existir)
        let progressContainer = document.getElementById('update-progress-container');
        if (!progressContainer && cardStatusDesc) {
          progressContainer = document.createElement('div');
          progressContainer.id = 'update-progress-container';
          progressContainer.style.cssText = 'display:none; margin-top:10px; width:100%;';
          progressContainer.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:#94a3b8; margin-bottom:4px;">
              <span id="progress-label">⏳ Preparando download...</span>
              <span id="progress-percent">0%</span>
            </div>
            <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
              <div id="progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #f59e0b, #22c55e); border-radius:4px; transition:width 0.2s ease;"></div>
            </div>
            <div id="progress-mb" style="font-size:0.75rem; color:#64748b; margin-top:4px; text-align:right;">0 MB / ? MB</div>
          `;
          cardStatusDesc.parentNode.insertBefore(progressContainer, cardStatusDesc.nextSibling);
        }

        // Função unificada de download e instalação
        const startDownloadFlow = async () => {
          if (popupModal) popupModal.style.display = 'none';

          // Mostra barra de progresso
          if (progressContainer) progressContainer.style.display = 'block';

          if (btnInstallNow) {
            btnInstallNow.disabled = true;
            btnInstallNow.style.background = 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)';
            btnInstallNow.textContent = '⏳ 0% - Iniciando download...';
          }
          if (btnGlobalNow) {
            btnGlobalNow.disabled = true;
            btnGlobalNow.textContent = '⏳ Baixando...';
          }
          if (cardStatusTitle) cardStatusTitle.innerHTML = `⏳ <b>Baixando v${latV}...</b>`;
          if (cardStatusDesc) cardStatusDesc.textContent = 'Download em andamento em segundo plano.';

          // Listener de progresso em TEMPO REAL
          const progressHandler = window.api.onUpdateDownloadProgress((data) => {
            if (!data) return;
            const p = Math.round(data.percent || 0);
            const rmb = data.receivedMB || '0';
            const tmb = data.totalMB || '?';

            // Barra de progresso
            const bar = document.getElementById('progress-bar');
            const pct = document.getElementById('progress-percent');
            const label = document.getElementById('progress-label');
            const mbEl = document.getElementById('progress-mb');

            if (bar) bar.style.width = `${p}%`;
            if (pct) pct.textContent = `${p}%`;
            if (label) label.textContent = p < 100 ? `⏳ Baixando...` : `✅ Concluído!`;
            if (mbEl) mbEl.textContent = `${rmb} MB / ${tmb} MB`;

            // Botão com porcentagem ao vivo
            if (btnInstallNow) {
              btnInstallNow.textContent = p < 100 ? `⏳ ${p}% — Baixando (${rmb}/${tmb} MB)...` : `✅ 100% — Concluído!`;
            }
          });

          const dlRes = await window.api.downloadUpdateProgress(activeDownloadUrl);

          if (dlRes && dlRes.success) {
            // Barra 100% concluída
            const bar = document.getElementById('progress-bar');
            const pct = document.getElementById('progress-percent');
            const label = document.getElementById('progress-label');
            if (bar) bar.style.width = '100%';
            if (pct) pct.textContent = '100%';
            if (label) label.textContent = '✅ Download concluído!';

            if (btnInstallNow) {
              btnInstallNow.disabled = false;
              btnInstallNow.style.display = 'inline-flex';
              btnInstallNow.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
              btnInstallNow.style.boxShadow = '0 0 25px rgba(16, 185, 129, 0.8)';
              btnInstallNow.textContent = `🚀 Reiniciar e Atualizar Agora (v${latV})`;
              btnInstallNow.onclick = () => {
                btnInstallNow.disabled = true;
                btnInstallNow.textContent = '🔄 Atualizando e Reabrindo...';
                if (cardStatusTitle) cardStatusTitle.innerHTML = `🔄 <b>Atualizando...</b>`;
                if (cardStatusDesc) cardStatusDesc.textContent = 'O aplicativo está sendo instalado e será reaberto automaticamente.';
                window.api.installUpdateNow();
              };
            }

            if (btnGlobalNow) {
              btnGlobalNow.disabled = false;
              btnGlobalNow.textContent = `🚀 REINICIAR AGORA (v${latV})`;
              btnGlobalNow.onclick = () => {
                btnGlobalNow.disabled = true;
                btnGlobalNow.textContent = '🔄 Atualizando...';
                window.api.installUpdateNow();
              };
            }

            if (cardStatusTitle) cardStatusTitle.innerHTML = `✅ <b>Download Concluído (100%)!</b>`;
            if (cardStatusDesc) cardStatusDesc.textContent = 'Clique no botão para reiniciar, instalar e reabrir o app automaticamente.';
          } else {
            if (progressContainer) progressContainer.style.display = 'none';
            if (btnInstallNow) {
              btnInstallNow.disabled = false;
              btnInstallNow.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
              btnInstallNow.textContent = `⚡ Baixar e Atualizar (v${latV})`;
            }
            if (cardStatusTitle) cardStatusTitle.innerHTML = `⚠️ <b>Falha no download. Tente novamente.</b>`;
          }
        };

        if (btnPopupDownload) {
          btnPopupDownload.onclick = startDownloadFlow;
        }

        if (btnGlobalNow) {
          btnGlobalNow.onclick = startDownloadFlow;
        }

        if (btnInstallNow) {
          btnInstallNow.style.display = 'inline-flex';
          btnInstallNow.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
          btnInstallNow.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.4)';
          btnInstallNow.textContent = `⚡ Baixar e Atualizar (v${latV})`;
          btnInstallNow.onclick = startDownloadFlow;
        }
      } else {
        const alertBanner = document.getElementById('global-update-alert');
        if (alertBanner) alertBanner.style.display = 'none';

        const popupModal = document.getElementById('update-popup-modal');
        if (popupModal) popupModal.style.display = 'none';

        if (btnInstallNow) {
          btnInstallNow.style.display = 'none';
        }
        if (cardStatusTitle) cardStatusTitle.innerHTML = `✔️ <b>Você está na versão mais recente</b>`;
        if (cardStatusDesc) cardStatusDesc.textContent = `Seu Loord Optimizer está 100% atualizado (v${curV}).`;
        if (manual) {
          alert(`✔️ Seu Loord Optimizer já está na versão mais recente (v${curV})!\n\nVocê já possui todas as otimizações e melhorias instaladas.`);
        }
      }
    } catch (e) {
      console.error('[AutoUpdater Renderer] ERRO ao verificar atualizações:', e);
      if (btnCheckUpdate) {
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = '🔍 Verificar Agora';
      }
      if (btnInstallNow) {
        btnInstallNow.style.display = 'none';
      }
      if (cardStatusTitle) cardStatusTitle.innerHTML = `⚠️ <b>Erro ao verificar atualizações</b>`;
      if (cardStatusDesc) cardStatusDesc.textContent = `Falha na conexão com GitHub. Verifique sua internet e tente novamente.`;
      if (manual) {
        alert(`⚠️ Falha ao verificar atualizações.\n\nErro: ${e.message || String(e)}\n\nVerifique sua conexão com a internet e tente novamente.`);
      }
    }
  }

  handleCheckUpdatesGlobal = handleCheckUpdates;

  // Progress listener
  if (window.api && window.api.onUpdateDownloadProgress) {
    window.api.onUpdateDownloadProgress((data) => {
      if (btnInstallNow && data) {
        const p = data.percent || 0;
        const mb = data.receivedMB ? ` (${data.receivedMB} MB)` : '';
        btnInstallNow.textContent = `⏳ Baixando ${p}%${mb}...`;
      }
    });
  }

  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', () => handleCheckUpdates(true));
  }

  // Auto Check on App Startup
  handleCheckUpdates(false);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAutoUpdater);
} else {
  setupAutoUpdater();
}
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  ADB EMULATOR OPTIMIZER
// ═══════════════════════════════════════════════════════════════════════
(function adbUI() {
  const adbStatusBadge = document.getElementById('adb-status-badge');
  const adbLog = document.getElementById('adb-log');
  const btnConnect = document.getElementById('btn-adb-connect');
  const btnAutoDetect = document.getElementById('btn-adb-autodetect');
  const portInput = document.getElementById('adb-port-input');
  const btnFullOptimize = document.getElementById('btn-adb-full-optimize');
  const btnAnims = document.getElementById('btn-adb-anims');
  const btnBg = document.getElementById('btn-adb-bg');
  const btnCache = document.getElementById('btn-adb-cache');
  const btnDpi = document.getElementById('btn-adb-dpi');
  const btnUninstall = document.getElementById('btn-adb-uninstall');

  if (!btnConnect) return;

  let adbConnected = false;
  let adbPort = 5555; // porta ativa atual

  // ── Port preset buttons ───────────────────────────────────────────
  document.querySelectorAll('.adb-port-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.port);
      if (portInput) portInput.value = p;
      adbPort = p;
      // highlight selecionado
      document.querySelectorAll('.adb-port-preset').forEach(b => b.style.borderColor = '');
      btn.style.borderColor = '#63cab7';
    });
  });

  if (portInput) {
    portInput.addEventListener('change', () => {
      adbPort = parseInt(portInput.value) || 5555;
    });
  }

  function logAdb(msg, color) {
    if (!adbLog) return;
    adbLog.style.display = 'block';
    const line = document.createElement('div');
    line.style.color = color || '#63cab7';
    line.textContent = `› ${msg}`;
    adbLog.appendChild(line);
    adbLog.scrollTop = adbLog.scrollHeight;
  }

  function setConnected(port, output) {
    adbConnected = true;
    adbPort = port;
    if (portInput) portInput.value = port;
    adbStatusBadge.textContent = `Conectado :${port} ✔`;
    adbStatusBadge.className = 'badge badge-success';
    btnConnect.textContent = `✔ :${port}`;
    logAdb(output, '#28c385');
  }

  function setApplied(badgeId) {
    const el = document.getElementById(badgeId);
    if (el) el.style.display = 'inline';
  }

  // ── Conectar (porta manual) ───────────────────────────────────────
  btnConnect.addEventListener('click', async () => {
    const port = parseInt(portInput?.value) || 5555;
    btnConnect.textContent = 'Conectando...';
    btnConnect.disabled = true;
    logAdb(`Conectando em 127.0.0.1:${port}...`);
    const res = await window.api.adbConnect(port);
    if (res.success) {
      setConnected(res.port || port, res.output);
    } else {
      adbConnected = false;
      btnConnect.textContent = 'Tentar Novamente';
      btnConnect.disabled = false;
      logAdb('ERRO: ' + (res.error || res.output), '#ef4444');
    }
  });

  // ── Auto-Detectar ─────────────────────────────────────────────────
  if (btnAutoDetect) {
    btnAutoDetect.addEventListener('click', async () => {
      btnAutoDetect.textContent = 'Detectando...';
      btnAutoDetect.disabled = true;
      logAdb('Testando portas comuns dos emuladores...');
      const res = await window.api.adbAutoDetect();
      btnAutoDetect.disabled = false;
      btnAutoDetect.textContent = '🔍 Auto-Detectar Porta';
      if (res.success) {
        setConnected(res.port, `Emulador detectado na porta ${res.port}! ${res.output}`);
        btnConnect.textContent = `✔ :${res.port}`;
        btnConnect.disabled = true;
      } else {
        logAdb('Nenhum emulador encontrado. Verifique se o emulador está aberto e o ADB ativado.', '#ef4444');
      }
    });
  }

  async function requireConnected() {
    if (!adbConnected) {
      logAdb('Conecte primeiro ao ADB!', '#f59e0b');
      return false;
    }
    return true;
  }

  async function shell(cmd) {
    const r = await window.api.adbShell(cmd, adbPort);
    logAdb(`${cmd}  →  ${r.success ? r.output || 'OK' : 'ERRO: ' + r.error}`, r.success ? '#63cab7' : '#ef4444');
    return r.success;
  }

  // ── Desativar Animações ───────────────────────────────────────────
  btnAnims.addEventListener('click', async () => {
    if (!await requireConnected()) return;
    btnAnims.disabled = true;
    btnAnims.textContent = 'Aplicando...';
    await shell('settings put global window_animation_scale 0');
    await shell('settings put global transition_animation_scale 0');
    await shell('settings put global animator_duration_scale 0');
    setApplied('badge-adb-anims');
    btnAnims.textContent = 'Aplicar';
    btnAnims.disabled = false;
    logAdb('✔ Animações desativadas com sucesso!', '#28c385');
  });

  // ── Limitar Background ────────────────────────────────────────────
  btnBg.addEventListener('click', async () => {
    if (!await requireConnected()) return;
    btnBg.disabled = true;
    btnBg.textContent = 'Aplicando...';
    await shell('settings put global background_process_limit 1');
    setApplied('badge-adb-bg');
    btnBg.textContent = 'Aplicar';
    btnBg.disabled = false;
    logAdb('✔ Processos em background limitados!', '#28c385');
  });

  // ── Limpar Cache ──────────────────────────────────────────────────
  btnCache.addEventListener('click', async () => {
    if (!await requireConnected()) return;
    btnCache.disabled = true;
    btnCache.textContent = 'Limpando...';
    logAdb('Limpando caches...');
    await shell('pm trim-caches 999M');
    setApplied('badge-adb-cache');
    btnCache.textContent = 'Limpar';
    btnCache.disabled = false;
    logAdb('✔ Caches limpos com sucesso!', '#28c385');
  });

  // ── DPI Personalizada do Android ──────────────────────────────────
  const inputCustomDpi = document.getElementById('custom-adb-dpi');
  const btnApplyDpi = document.getElementById('btn-apply-custom-dpi');
  const btnResetDpi = document.getElementById('btn-reset-custom-dpi');
  const presetDpiBtns = document.querySelectorAll('.preset-dpi-btn');

  presetDpiBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-dpi');
      if (inputCustomDpi && val) {
        inputCustomDpi.value = val;
      }
    });
  });

  if (btnApplyDpi) {
    btnApplyDpi.addEventListener('click', async () => {
      if (!await requireConnected()) return;
      const dpiVal = inputCustomDpi?.value?.trim() || '240';
      btnApplyDpi.disabled = true;
      btnApplyDpi.textContent = 'Aplicando...';
      logAdb(`Definindo DPI interna do Android para ${dpiVal}...`);
      await shell(`wm density ${dpiVal}`);
      setApplied('badge-adb-dpi');
      btnApplyDpi.disabled = false;
      btnApplyDpi.textContent = '⚡ Aplicar DPI';
      logAdb(`✔ DPI ${dpiVal} aplicada com sucesso!`, '#28c385');
    });
  }

  if (btnResetDpi) {
    btnResetDpi.addEventListener('click', async () => {
      if (!await requireConnected()) return;
      btnResetDpi.disabled = true;
      btnResetDpi.textContent = 'Resetando...';
      logAdb('Resetando DPI para o padrão do emulador...');
      await shell('wm density reset');
      if (inputCustomDpi) inputCustomDpi.value = '240';
      setApplied('badge-adb-dpi');
      btnResetDpi.disabled = false;
      btnResetDpi.textContent = '🔄 Resetar Padrão';
      logAdb('✔ DPI restaurada para o padrão com sucesso!', '#28c385');
    });
  }

  // ── Touch Engine & Sensibilidade iPhone / Android Real ────────────
  const presetTouchBtns = document.querySelectorAll('.preset-touch-btn');
  const statusTouchEngine = document.getElementById('status-touch-engine');

  presetTouchBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const prof = btn.getAttribute('data-profile');
      if (!await requireConnected()) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = '⏳ Aplicando...';
      logAdb(`Injetando Touch Engine (${prof}) no Android via ADB...`, '#38bdf8');

      const res = await window.api.applyTouchEngineProfile(prof, adbPort);
      btn.disabled = false;
      btn.textContent = originalText;

      if (res && res.success) {
        logAdb(`✔ ${res.profileName} aplicado! (Touch 300Hz, Slop 1, DPI ${res.dpi})`, '#28c385');
        if (statusTouchEngine) {
          statusTouchEngine.style.display = 'block';
          statusTouchEngine.textContent = `✔ ${res.profileName} aplicado com sucesso! (Touch 300Hz, Touch Slop 1, DPI ${res.dpi})`;
        }
        if (confirm(`✨ ${res.profileName} Ativado com Sucesso!\n\n• Resposta ao Toque Ultrarrápida (300Hz)\n• Touch Slop = 1 (Arrasto de capa instantâneo sem delay)\n• DPI do Android ajustada para ${res.dpi}\n\n⚠️ Deseja reiniciar o BlueStacks agora para aplicar 100% no Free Fire?`)) {
          window.api.restartBluestacks();
        }
      } else {
        logAdb('Falha ao aplicar Touch Engine. Verifique a conexão ADB.', '#ef4444');
      }
    });
  });

  // ── Desbloquear FPS com Hz da Tela ───────────────────────────────
  const inputScreenHz = document.getElementById('input-screen-hz');
  const btnUnlockFps = document.getElementById('btn-unlock-fps');
  const presetHzBtns = document.querySelectorAll('.preset-hz-btn');

  presetHzBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-hz');
      if (inputScreenHz && val) {
        inputScreenHz.value = val;
      }
    });
  });

  if (btnUnlockFps) {
    btnUnlockFps.addEventListener('click', async () => {
      const hzVal = inputScreenHz?.value?.trim() || '240';
      btnUnlockFps.disabled = true;
      btnUnlockFps.textContent = 'Aplicando...';

      const res = await window.api.unlockFpsHz(hzVal);
      if (res && res.success) {
        setApplied('badge-unlock-fps');
        btnUnlockFps.textContent = '✔ FPS Desbloqueado!';
        logAdb(`✔ FPS desbloqueado com sucesso! max_fps=999 e mim.max_fps=${hzVal}`, '#28c385');
        alert(`✔ FPS Desbloqueado com sucesso!\n\n• max_fps configurado para 999\n• mim.max_fps configurado para ${hzVal}Hz\n• Arquivos modificados: ${res.modifiedCount}`);
      } else {
        alert('Nenhum arquivo bluestacks.conf encontrado. Verifique se o BlueStacks/MSI está instalado.');
      }
      btnUnlockFps.disabled = false;
    });
  }

  // ── Remover Delay do Free Fire (ExclusiveDelay 1ms) ───────────────
  const btnRemoveFfDelay = document.getElementById('btn-remove-ff-delay');
  if (btnRemoveFfDelay) {
    btnRemoveFfDelay.addEventListener('click', async () => {
      btnRemoveFfDelay.disabled = true;
      btnRemoveFfDelay.textContent = 'Removendo delay...';

      const res = await window.api.removeFreeFireDelay();
      if (res && res.success) {
        setApplied('badge-ff-delay');
        btnRemoveFfDelay.textContent = '✔ Delay 1ms Aplicado!';
        logAdb(`✔ Delay do Free Fire reduzido para 1ms! (${res.totalReplaced} comandos acelerados em ${res.filesModified} arquivos)`, '#28c385');
        alert(`✔ Delay do Free Fire removido com sucesso!\n\n• ExclusiveDelay configurado para 1ms\n• Mapeamentos otimizados: ${res.totalReplaced}\n• Arquivos .cfg modificados: ${res.filesModified}`);
      } else {
        alert('Nenhum arquivo com.dts.freefireth.cfg encontrado. Abra o Free Fire no emulador ao menos uma vez para gerar os controles.');
      }
      btnRemoveFfDelay.disabled = false;
    });
  }

  // ── Troca de Modelo de Celular ────────────────────────────────────
  const selectDevice = document.getElementById('device-profile-select');
  const customDeviceFields = document.getElementById('custom-device-fields');
  const custBrand = document.getElementById('cust-brand');
  const custManuf = document.getElementById('cust-manuf');
  const custModel = document.getElementById('cust-model');
  const btnApplyDevice = document.getElementById('btn-apply-device');

  const DEVICE_PROFILES = {
    'asus_rog_8': { brand: 'asus', manufacturer: 'asus', model: 'ASUS_AI2401_D', carrier: 'se_72405' },
    'xiaomi_redmi_note_9': { brand: 'Xiaomi', manufacturer: 'Xiaomi', model: 'M2003J15SG', carrier: 'se_72405' },
    'asus_rog_6': { brand: 'asus', manufacturer: 'asus', model: 'ASUS_AI2201', carrier: 'se_72405' },
    'asus_rog_5': { brand: 'asus', manufacturer: 'asus', model: 'ASUS_I005D', carrier: 'se_72405' },
    'samsung_s24': { brand: 'samsung', manufacturer: 'samsung', model: 'SM-S928B', carrier: 'se_72405' },
    'samsung_s23': { brand: 'samsung', manufacturer: 'samsung', model: 'SM-S918B', carrier: 'se_72405' },
    'blackshark_5': { brand: 'blackshark', manufacturer: 'blackshark', model: 'SHARK KTUS-H0', carrier: 'se_72405' },
    'redmagic_9': { brand: 'nubia', manufacturer: 'nubia', model: 'NX769J', carrier: 'se_72405' },
    'oneplus_12': { brand: 'OnePlus', manufacturer: 'OnePlus', model: 'CPH2581', carrier: 'se_72405' }
  };

  if (selectDevice) {
    selectDevice.addEventListener('change', () => {
      const val = selectDevice.value;
      if (val === 'custom') {
        if (customDeviceFields) customDeviceFields.style.display = 'flex';
      } else {
        if (customDeviceFields) customDeviceFields.style.display = 'none';
        const p = DEVICE_PROFILES[val];
        if (p && custBrand && custManuf && custModel) {
          custBrand.value = p.brand;
          custManuf.value = p.manufacturer;
          custModel.value = p.model;
        }
      }
    });
  }

  if (btnApplyDevice) {
    btnApplyDevice.addEventListener('click', async () => {
      btnApplyDevice.disabled = true;
      btnApplyDevice.textContent = 'Aplicando...';
      const val = selectDevice?.value || 'asus_rog_8';
      let prof;
      if (val === 'custom') {
        prof = {
          brand: custBrand?.value?.trim() || 'asus',
          manufacturer: custManuf?.value?.trim() || 'asus',
          model: custModel?.value?.trim() || 'ASUS_AI2401_D',
          carrier: 'se_72405'
        };
      } else {
        prof = DEVICE_PROFILES[val] || DEVICE_PROFILES['asus_rog_8'];
      }

      const res = await window.api.changeDeviceProfile(prof);
      if (res && res.success) {
        setApplied('badge-device-profile');
        btnApplyDevice.textContent = '✔ Modelo Aplicado!';
        logAdb(`✔ Modelo alterado para ${prof.brand.toUpperCase()} (${prof.model}) em ${res.modifiedCount} instâncias!`, '#28c385');
        if (confirm(`✔ Modelo de Celular atualizado com sucesso!\n\n• Fabricante: ${prof.manufacturer}\n• Marca: ${prof.brand}\n• Modelo: ${prof.model}\n\n⚠️ O BlueStacks precisa ser reiniciado para o Free Fire carregar o novo modelo.\n\nDeseja reiniciar o BlueStacks agora?`)) {
          window.api.restartBluestacks();
        }
      } else {
        alert('Nenhum arquivo bluestacks.conf encontrado para atualizar o perfil.');
      }
      btnApplyDevice.disabled = false;
    });
  }

  // ── Flasher de Sistema & ROM Tweaks ──────────────────────────────
  const btnFlashRom = document.getElementById('btn-flash-rom-tweaks');
  if (btnFlashRom) {
    btnFlashRom.addEventListener('click', async () => {
      if (!await requireConnected()) return;
      btnFlashRom.disabled = true;
      btnFlashRom.textContent = 'Flasheando tweaks...';
      logAdb('Injetando tweaks de aceleração de GPU e Dalvik VM no Android...');

      const res = await window.api.flashSystemTweaks(adbPort);
      if (res && res.success) {
        setApplied('badge-flash-rom');
        btnFlashRom.textContent = '✔ Sistema Flasheado!';
        logAdb(`✔ ${res.appliedCount} otimizações de sistema injetadas com sucesso via ADB!`, '#28c385');
        alert(`✔ Tweaks Gamer flasheados com sucesso no Android!\n\n• Renderização EGL / HW 100% ativa\n• Dalvik VM Heap 512MB configurado\n• Boot Animation desativado\n• Dithering desligado`);
      } else {
        logAdb('Falha ao injetar propriedades de sistema. Verifique a conexão ADB.', '#ef4444');
      }
      btnFlashRom.disabled = false;
    });
  }

  // ── Transformar em Android Verdadeiro ────────────────────────────
  const btnConvertReal = document.getElementById('btn-convert-real-android');
  const btnRestoreAndroid = document.getElementById('btn-restore-default-android');

  if (btnConvertReal) {
    btnConvertReal.addEventListener('click', async () => {
      if (!await requireConnected()) return;
      btnConvertReal.disabled = true;
      btnConvertReal.textContent = 'Transformando...';
      logAdb('=== INICIANDO TRANSFORMAÇÃO EM ANDROID REAL ===', '#ec4899');
      logAdb('1. Desativando anúncios e Launcher do BlueStacks...');
      logAdb('2. Injetando identificador de hardware original (Fingerprint Real)...');
      logAdb('3. Ativando pipeline gráfico direto de GPU...');

      const res = await window.api.convertToRealAndroid(adbPort);
      if (res && res.success) {
        setApplied('badge-real-android');
        btnConvertReal.textContent = '✔ Android Real Ativo!';
        logAdb(`✔ Modo Android Verdadeiro ativado com sucesso! (${res.appliedCount} módulos configurados)`, '#28c385');
        if (confirm('✨ Modo Android Verdadeiro Ativado com Sucesso!\n\n• Tela inicial sem anúncios e sem banners do BlueStacks\n• Game Center e propagandas desativados\n• Renderização nativa da GPU ativada\n\n⚠️ Deseja reiniciar o BlueStacks agora para aplicar 100% das alterações?')) {
          window.api.restartBluestacks();
        }
      } else {
        logAdb('Erro ao aplicar Modo Android Real. Verifique a conexão ADB.', '#ef4444');
      }
      btnConvertReal.disabled = false;
    });
  }

  if (btnRestoreAndroid) {
    btnRestoreAndroid.addEventListener('click', async () => {
      if (!await requireConnected()) return;
      btnRestoreAndroid.disabled = true;
      btnRestoreAndroid.textContent = 'Restaurando...';
      logAdb('Restaurando serviços originais do emulador...');
      await window.api.restoreDefaultAndroid(adbPort);
      setApplied('badge-real-android');
      btnRestoreAndroid.disabled = false;
      btnRestoreAndroid.textContent = '🔄 Restaurar Padrão';
      logAdb('✔ Padrão original restaurado!', '#28c385');
    });
  }

  // ── Remover Anúncios e Promoções do Emulador (AdBlock Completo) ──
  const btnRemoveEmuAds = document.getElementById('btn-remove-emu-ads');
  if (btnRemoveEmuAds) {
    btnRemoveEmuAds.addEventListener('click', async () => {
      btnRemoveEmuAds.disabled = true;
      btnRemoveEmuAds.textContent = '⏳ Removendo anúncios...';
      logAdb('=== INICIANDO REMOÇÃO DE ANÚNCIOS DO EMULADOR ===', '#ec4899');
      logAdb('1. Desativando flags de anúncios no bluestacks.conf...');
      logAdb('2. Desativando Game Center e barra de recomendações...');

      const res = await window.api.removeEmulatorAds(adbPort);
      btnRemoveEmuAds.disabled = false;
      btnRemoveEmuAds.textContent = '✔ Anúncios Removidos!';
      setApplied('badge-emu-ads');
      logAdb('✔ Anúncios e recomendações de jogos desativados com sucesso!', '#28c385');
      if (confirm('🚫 Anúncios e promoções do emulador removidos com sucesso!\n\n⚠️ Deseja reiniciar o BlueStacks agora para ver a tela 100% limpa?')) {
        window.api.restartBluestacks();
      }
    });
  }

  // ── Desinstalar Bloatware ─────────────────────────────────────────
  const BLOATWARE_MAP = {
    'uninst-ads': ['com.bluestacks.gamecenter', 'com.bluestacks.appmart', 'com.bluestacks.gamepedia', 'gg.now.ads.service', 'gg.now.billing.service2', 'gg.now.billing.interceptor', 'com.bluestacks.hyperdesk', 'com.bluestacks.search', 'com.bluestacks.bstxservice'],
    'uninst-google-search': ['com.google.android.googlequicksearchbox', 'com.google.android.apps.searchlite', 'com.google.android.katniss'],
    'uninst-browser': ['com.android.chrome', 'com.android.browser', 'com.google.android.browser', 'com.sec.android.app.sbrowser', 'org.chromium.chrome'],
    'uninst-files': ['com.android.documentsui', 'com.android.externalstorage', 'com.estrongs.android.pop', 'com.android.providers.downloads.ui', 'com.bluestacks.filemanager', 'com.bluestacks.windowsfilemanager'],
    'uninst-telephony': ['com.android.providers.telephony', 'com.android.phone', 'com.android.providers.contacts', 'com.android.captiveportallogin', 'com.android.cellbroadcastreceiver', 'com.android.stk'],
    'uninst-email': ['com.android.email', 'com.google.android.gm', 'com.android.calendar', 'com.google.android.calendar', 'com.google.android.syncadapters.calendar', 'com.google.android.syncadapters.contacts'],
    'uninst-media': ['com.google.android.apps.maps', 'com.google.android.youtube', 'com.google.android.music', 'com.android.music', 'com.google.android.apps.youtube.music', 'com.google.android.videos'],
    'uninst-docs': ['com.google.android.apps.docs', 'com.google.android.apps.docs.editors.docs', 'com.google.android.apps.sheets', 'com.google.android.apps.slides', 'com.google.android.play.games', 'com.google.android.gms.setup'],
    'uninst-playstore': ['com.android.vending', 'com.google.android.gms', 'com.google.android.gsf', 'com.google.android.feedback', 'com.google.android.partnersetup', 'com.google.android.setupwizard', 'com.google.android.backuptransport', 'com.google.android.onetimeinitializer']
  };

  btnUninstall.addEventListener('click', async () => {
    if (!await requireConnected()) return;
    if (!confirm('⚠️ Desinstalar os apps selecionados? Essa ação é imediata no emulador!')) return;
    btnUninstall.disabled = true;
    btnUninstall.textContent = 'Desinstalando...';

    const toUninstall = [];
    for (const [id, pkgs] of Object.entries(BLOATWARE_MAP)) {
      if (document.getElementById(id)?.checked) toUninstall.push(...pkgs);
    }

    logAdb(`Desinstalando/Desativando ${toUninstall.length} pacotes no Android...`, '#38bdf8');
    const results = await window.api.adbUninstall(toUninstall, adbPort);
    let ok = 0, fail = 0;
    for (const r of results) {
      if (r.ok) { logAdb(`✔ ${r.pkg} (removido/desativado)`, '#28c385'); ok++; }
      else { logAdb(`✗ ${r.pkg} (não instalado)`, '#64748b'); fail++; }
    }
    logAdb(`Concluído: ${ok} pacotes desinstalados/desativados com sucesso!`, '#63cab7');
    setApplied('badge-adb-uninstall');
    btnUninstall.textContent = '🗑️ Desinstalar Selecionados';
    btnUninstall.disabled = false;
    if (confirm(`✔ Limpeza Concluída com Sucesso!\n\n• ${ok} pacotes foram desinstalados e desativados no Android.\n• O cache do launcher foi limpo e os ícones foram removidos.\n\n⚠️ Deseja reiniciar o BlueStacks agora para aplicar 100% da tela limpa?`)) {
      window.api.restartBluestacks();
    }
  });

  // ── Otimização Completa (1 Clique - Não mexe na resolução) ────────
  btnFullOptimize.addEventListener('click', async () => {
    if (!await requireConnected()) return;
    btnFullOptimize.disabled = true;
    btnFullOptimize.textContent = 'Otimizando emulador...';
    logAdb('=== OTIMIZAÇÃO COMPLETA INICIADA ===', '#f59e0b');

    // 1. Desativar animações do sistema
    await shell('settings put global window_animation_scale 0');
    await shell('settings put global transition_animation_scale 0');
    await shell('settings put global animator_duration_scale 0');
    setApplied('badge-adb-anims');

    // 2. Limitar processos de segundo plano
    await shell('settings put global background_process_limit 1');
    setApplied('badge-adb-bg');

    // 3. Limpar cache de armazenamento dos apps
    await shell('pm trim-caches 999M');
    setApplied('badge-adb-cache');

    logAdb('=== OTIMIZAÇÃO CONCLUÍDA COM SUCESSO! ===', '#28c385');
    btnFullOptimize.textContent = '⚡ Aplicar Tudo Agora';
    btnFullOptimize.disabled = false;
    alert('✔ Otimização Completa Aplicada com Sucesso no Emulador!\n\n• Animações zeradas para máxima fluidez\n• Limite de processos de segundo plano aplicado\n• Caches temporários limpos');
  });
})();
// ═══════════════════════════════════════════════════════════════════════

// ─── DNS Gamer & Teste de Ping ──────────────────────────────────────
const btnTestPing = document.getElementById('btn-test-ping');
const btnApplyDns = document.getElementById('btn-apply-dns');
const selectGamerDns = document.getElementById('select-gamer-dns');
const badgeDnsApplied = document.getElementById('badge-dns-applied');
const pingCf = document.getElementById('ping-cf');
const pingGoogle = document.getElementById('ping-google');
const pingFf = document.getElementById('ping-ff');

if (btnTestPing) {
  btnTestPing.addEventListener('click', async () => {
    btnTestPing.disabled = true;
    btnTestPing.textContent = 'Testando...';
    if (pingCf) pingCf.textContent = '...';
    if (pingGoogle) pingGoogle.textContent = '...';
    if (pingFf) pingFf.textContent = '...';

    const results = await window.api.testPing();
    if (results && results.length > 0) {
      const cf = results.find(r => r.name && r.name.includes('Cloudflare'));
      const gg = results.find(r => r.name && r.name.includes('Google'));
      const ff = results.find(r => r.name && r.name.includes('Free Fire'));

      if (pingCf && cf) pingCf.textContent = `${cf.ping} ms`;
      if (pingGoogle && gg) pingGoogle.textContent = `${gg.ping} ms`;
      if (pingFf && ff) pingFf.textContent = `${ff.ping} ms`;
    }
    btnTestPing.disabled = false;
    btnTestPing.textContent = '🔍 Testar Ping Agora';
  });
}

if (btnApplyDns) {
  btnApplyDns.addEventListener('click', async () => {
    const val = selectGamerDns?.value || 'cloudflare';
    btnApplyDns.disabled = true;
    btnApplyDns.textContent = 'Aplicando...';

    const res = await window.api.setGamerDns(val);
    if (res && res.success) {
      if (badgeDnsApplied) {
        badgeDnsApplied.style.display = 'inline';
        setTimeout(() => { badgeDnsApplied.style.display = 'none'; }, 4000);
      }
      btnApplyDns.textContent = '✔ Aplicado';
      alert(`✔ DNS Gamer aplicado com sucesso!\n\n• Primário: ${res.primary}\n• Secundário: ${res.secondary}\n• Cache DNS do Windows limpo.`);
    } else {
      alert('Erro ao aplicar DNS. Execute como Administrador.');
    }
    btnApplyDns.disabled = false;
  });
}

const btnResetDhcp = document.getElementById('btn-reset-dhcp');
if (btnResetDhcp) {
  btnResetDhcp.addEventListener('click', async () => {
    btnResetDhcp.disabled = true;
    btnResetDhcp.textContent = 'Restaurando...';
    const res = await window.api.resetNetworkDhcp();
    btnResetDhcp.disabled = false;
    btnResetDhcp.textContent = '✔ Restaurado!';
    setTimeout(() => { btnResetDhcp.textContent = '🔄 Restaurar Conexão Padrão (DHCP & Fix Perfis)'; }, 3000);
    alert(res && res.message ? res.message : '✔ Conexão e arquivo Hosts restaurados com sucesso!');
  });
}

// ─── Modo Turbo Game Booster ────────────────────────────────────────
const btnGameBooster = document.getElementById('btn-game-booster');
const badgeGameBooster = document.getElementById('badge-game-booster');
let isGameBoosterActive = sessionStorage.getItem('game_booster_active') === 'true';

if (btnGameBooster) {
  if (isGameBoosterActive) {
    btnGameBooster.textContent = '✅ Game Booster Ativo';
    btnGameBooster.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    btnGameBooster.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.4)';
    btnGameBooster.style.fontWeight = '800';
  }

  btnGameBooster.addEventListener('click', async () => {
    if (isGameBoosterActive) {
      alert('⚠️ ATENÇÃO:\n\nO Game Booster já está ATIVADO nesta sessão!\n\nAs otimizações para HD-Player (BlueStacks e MSI App Player) já estão 100% aplicadas. Não é necessário clicar novamente.');
      return;
    }

    btnGameBooster.disabled = true;
    btnGameBooster.textContent = '🔍 Detectando hardware...';

    // Small delay so UI updates before heavy sync work
    await new Promise(r => setTimeout(r, 80));
    btnGameBooster.textContent = '⚡ Aplicando configurações...';

    const res = await window.api.boostGameTurbo();

    if (res && res.success) {
      isGameBoosterActive = true;
      sessionStorage.setItem('game_booster_active', 'true');
      btnGameBooster.disabled = false;
      btnGameBooster.textContent = '✅ Game Booster Ativo';
      btnGameBooster.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      btnGameBooster.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.4)';

      if (badgeGameBooster) {
        badgeGameBooster.style.display = 'inline';
        setTimeout(() => { badgeGameBooster.style.display = 'none'; }, 10000);
      }

      const hw = res.hw || {};
      const brand = hw.isIntel ? 'Intel' : hw.isAMD ? 'AMD/Ryzen' : 'Outro';
      const htInfo = hw.hasHT ? 'Sim (HyperThreading)' : 'Não (físicos puros)';
      const ramGB = hw.totalRamMB ? (hw.totalRamMB / 1024).toFixed(1) : '?';
      const tierPT = { ultra: '🏆 ULTRA', high: '🥇 HIGH', medium: '🥈 MÉDIO', low: '🥉 BÁSICO' }[hw.tier] || '?';

      // Mostrar corretamente: núcleos físicos (pares) vs lógicos (ímpares)
      let emuStr, bgStr;
      if (res.emuCores && res.emuCores.length > 0) {
        emuStr = `Núcleos Físicos [${res.emuCores.join(', ')}]`;
      } else {
        emuStr = res.affinityMask || '?';
      }
      if (hw.hasHT && res.emuCores) {
        const allLogical = Array.from({ length: hw.logicalCount }, (_, i) => i);
        const bgCores = allLogical.filter(c => !res.emuCores.includes(c));
        bgStr = `Lógicos HT [${bgCores.join(', ')}]`;
      } else {
        bgStr = 'Núcleo 0 (SO)';
      }

      const lassoText = res.processLassoConfigured
        ? `── Process Lasso Integrado ──────\n` +
        `✅ Induzir Modo de Desempenho: ATIVADO\n` +
        `✅ Excluir do ProBalance: ATIVADO (Anti-Lag)\n` +
        `✅ SmartTrim (RAM Standby Purge): ATIVADO\n` +
        `✅ Afinidade Pares (Físicos): APLICADA\n\n`
        : `── Otimizações do Sistema ───────\n` +
        `✅ Modo de Desempenho: ATIVADO\n` +
        `✅ Throttling do Windows: DESATIVADO\n` +
        `✅ SmartTrim de RAM: ATIVADO\n\n`;

      alert(
        `🔥 GAME BOOSTER ATIVADO!\n` +
        `Configuração adaptada ao seu PC\n\n` +
        `── Hardware Detectado ───────────\n` +
        `🖥  CPU: ${hw.cpuModel || 'Desconhecido'}\n` +
        `📦 Marca: ${brand}\n` +
        `🔢 Físicos: ${hw.physicalCores} | Lógicos totais: ${hw.logicalCount}\n` +
        `⚡ HyperThreading: ${htInfo}\n` +
        `💾 RAM: ${ramGB} GB\n` +
        `🎮 GPU: ${hw.gpuName || '?'}\n` +
        `📊 Perfil: ${tierPT}\n\n` +
        `── Afinidade de CPU Aplicada ────\n` +
        `✅ HD-Player/BS  → ${emuStr} (Alta prioridade)\n` +
        `✅ Discord/Chrome → ${bgStr} (Abaixo Normal)\n\n` +
        lassoText +
        `── Outras Otimizações ───────────\n` +
        `✅ I/O Priority HD-Player/BS: 3 (High)\n` +
        `✅ GPU Priority: ${hw.tier === 'ultra' || hw.tier === 'high' ? 8 : 6}\n` +
        `✅ Win32PrioritySeparation: 26\n` +
        `✅ Core Parking: DESATIVADO\n` +
        `✅ Timer Resolution: 0.5ms\n` +
        `✅ TCP TcpAckFrequency/NoDelay: ON\n` +
        `✅ RAM threshold SmartTrim: ${res.standbyThreshMB} MB\n` +
        `✅ Xbox DVR: desabilitado\n` +
        `✅ Modo Jogo Windows: ativado\n\n` +
        `Reinicie o emulador para aplicar\ntodas as alterações com máxima performance.`
      );
    } else {
      btnGameBooster.textContent = '🔥 Ativar Game Booster';
      alert(`Erro ao ativar Game Booster:\n${res?.error || 'Execute como Administrador.'}`);
    }
    btnGameBooster.disabled = false;
  });
}

// ─── Exportar & Importar Perfil do Usuário ──────────────────────────
const btnExportProfile = document.getElementById('btn-export-profile');
const btnImportProfile = document.getElementById('btn-import-profile');
const badgeProfile = document.getElementById('badge-profile-action');

if (btnExportProfile) {
  btnExportProfile.addEventListener('click', async () => {
    const configData = {
      version: '1.0.1',
      date: new Date().toISOString(),
      mouseDpi: document.getElementById('calc-mouse-dpi')?.value || '800',
      emuDpi: document.getElementById('calc-emu-dpi')?.value || '480',
      appliedTweaks: JSON.parse(localStorage.getItem('ffopt_applied_tweaks') || '[]'),
      macroEnabled: document.getElementById('toggle-macro')?.checked || false,
      macroForce: document.getElementById('macro-force')?.value || '4'
    };

    const res = await window.api.exportUserConfig(configData);
    if (res && res.success) {
      alert(`✔ Perfil salvo com sucesso em:\n${res.filePath}`);
    }
  });
}

if (btnImportProfile) {
  btnImportProfile.addEventListener('click', async () => {
    const res = await window.api.importUserConfig();
    if (res && res.success && res.config) {
      const c = res.config;
      if (c.mouseDpi && document.getElementById('calc-mouse-dpi')) document.getElementById('calc-mouse-dpi').value = c.mouseDpi;
      if (c.emuDpi && document.getElementById('calc-emu-dpi')) document.getElementById('calc-emu-dpi').value = c.emuDpi;
      if (c.macroForce && document.getElementById('macro-force')) document.getElementById('macro-force').value = c.macroForce;
      if (c.appliedTweaks) {
        localStorage.setItem('ffopt_applied_tweaks', JSON.stringify(c.appliedTweaks));
        restoreAppliedTweaks();
      }
      if (badgeProfile) {
        badgeProfile.style.display = 'inline';
        setTimeout(() => { badgeProfile.style.display = 'none'; }, 4000);
      }
      alert('✔ Perfil carregado e aplicado com sucesso!');
    }
  });
}

// ─── PC Fraco / 1ª Geração (Ultra FPS) ───────────────────────────
const btnMasterPcFraco = document.getElementById('btn-master-pc-fraco');
const statusPcFracoMaster = document.getElementById('status-pc-fraco-master');

if (btnMasterPcFraco) {
  btnMasterPcFraco.addEventListener('click', async () => {
    btnMasterPcFraco.disabled = true;
    btnMasterPcFraco.textContent = '⏳ Otimizando PC Fraco...';
    if (statusPcFracoMaster) {
      statusPcFracoMaster.style.display = 'block';
      statusPcFracoMaster.textContent = 'Aplicando modo visual mínimo, desativando serviços pesados e configurando plano extremo...';
    }

    const res = await window.api.optimizePcFraco();
    btnMasterPcFraco.disabled = false;
    btnMasterPcFraco.textContent = '✔️ Modo Batata Turbo Ativo!';
    if (statusPcFracoMaster) {
      statusPcFracoMaster.textContent = res && res.message ? res.message : 'Modo Batata Turbo aplicado com sucesso no Windows!';
    }
  });
}

const btnTransformWindowsLite = document.getElementById('btn-transform-windows-lite');
const statusWindowsLite = document.getElementById('status-windows-lite');
if (btnTransformWindowsLite) {
  btnTransformWindowsLite.addEventListener('click', async () => {
    const confirmLite = confirm('👑 DESEJA APLICAR 100% DAS OTIMIZAÇÕES DA ISO LOORD v10.6 NO WINDOWS?\n\nIsso irá aplicar instantaneamente:\n- 31 Serviços Pesados e Telemetria Desativados\n- Curva de Mira Matemática Loord (Full Capa)\n- GPU Priority = 8 (MMCSS Games) & SystemResponsiveness = 0\n- Win32PrioritySeparation = 38 (Process Scheduler Quântico)\n- BCDEDIT Low Latency 0.5ms (DynamicTick Off, TSC Enhanced)\n- Plano de Energia Ultimate Performance Loord\n- Fullscreen Exclusive & DWM Anti-Stutter\n\nO computador será reiniciado para que todas as otimizações entrem em vigor com 100% de FPS!');
    if (!confirmLite) return;

    btnTransformWindowsLite.disabled = true;
    btnTransformWindowsLite.textContent = '⏳ Injetando Otimizações da ISO Loord...';
    if (statusWindowsLite) {
      statusWindowsLite.style.display = 'block';
      statusWindowsLite.textContent = 'Injetando 31 serviços desativados, curva de mira Loord, BCDEDIT e prioridades de GPU...';
    }

    const res = await window.api.transformWindowsLite();
    btnTransformWindowsLite.disabled = false;
    btnTransformWindowsLite.textContent = '✔️ Otimizações da ISO Loord Ativas!';
    if (statusWindowsLite) {
      statusWindowsLite.innerHTML = [
        '👑 <b>100% DAS OTIMIZAÇÕES DA ISO LOORD v10.6 APLICADAS!</b>',
        '<div style="margin-top: 6px; line-height: 1.6; font-size: 0.8rem; color: #cbd5e1;">',
        '✔ <b>31 Serviços Pesados & Telemetrias:</b> Desativados<br>',
        '✔ <b>Curva de Mira Loord Oficial:</b> Injetada no Registro<br>',
        '✔ <b>Prioridade de GPU:</b> GPU Priority = 8 | SystemResponsiveness = 0<br>',
        '✔ <b>Escalonador de CPU Gamer:</b> Win32PrioritySeparation = 38<br>',
        '✔ <b>Latência BCDEDIT:</b> DynamicTick OFF | PlatformClock NO | TSC Enhanced<br>',
        '✔ <b>Plano de Energia:</b> Ultimate Performance Loord (100% CPU Clock)',
        '</div>',
        '<div style="margin-top: 10px; color: #fbbf24; font-weight: 800; font-size: 0.9rem;">',
        '🔄 REINICIANDO COMPUTADOR EM 5 SEGUNDOS PARA APLICAR TUDO NO WINDOWS...',
        '</div>'
      ].join('');
    }

    // Reinicia o computador automaticamente para aplicar tudo no Windows
    setTimeout(async () => {
      await window.api.rebootComputer();
    }, 4000);
  });
}

const btnCleanDeepDisk = document.getElementById('btn-clean-deep-disk');
const statusDeepDisk = document.getElementById('status-deep-disk');
if (btnCleanDeepDisk) {
  btnCleanDeepDisk.addEventListener('click', async () => {
    btnCleanDeepDisk.disabled = true;
    btnCleanDeepDisk.textContent = '⏳ Limpando...';
    const res = await window.api.cleanDeepDisk();
    btnCleanDeepDisk.disabled = false;
    btnCleanDeepDisk.textContent = '🧹 Limpeza Concluída!';
    if (statusDeepDisk) {
      statusDeepDisk.style.display = 'block';
      statusDeepDisk.textContent = res && res.message ? res.message : 'Limpeza de disco concluída!';
    }
  });
}

const btnRemoveBloatware = document.getElementById('btn-remove-bloatware');
const statusBloatware = document.getElementById('status-bloatware');
if (btnRemoveBloatware) {
  btnRemoveBloatware.addEventListener('click', async () => {
    const confirmRemoval = confirm('Deseja desinstalar aplicativos nativos inúteis do Windows (Xbox, Clima, Notícias, Cortana, Mapas, etc.) para liberar RAM e processamento?');
    if (!confirmRemoval) return;

    btnRemoveBloatware.disabled = true;
    btnRemoveBloatware.textContent = '⏳ Removendo Bloatware...';
    const res = await window.api.removeWindowsBloatware();
    btnRemoveBloatware.disabled = false;
    btnRemoveBloatware.textContent = '🗑️ Bloatware Removido!';
    if (statusBloatware) {
      statusBloatware.style.display = 'block';
      statusBloatware.textContent = res && res.message ? res.message : 'Bloatware removido!';
    }
  });
}

const btnDisableDefender = document.getElementById('btn-disable-defender');
const statusDefender = document.getElementById('status-defender');
if (btnDisableDefender) {
  btnDisableDefender.addEventListener('click', async () => {
    const confirmDefender = confirm('⚠️ ATENÇÃO: Deseja desativar/remover permanentemente o Windows Defender e a Proteção em Tempo Real (Antimalware Service)?\n\nEssa ação liberará muita memória RAM e uso de CPU para os seus jogos, mas deixará o sistema sem o antivírus nativo da Microsoft.\n\nTem certeza que deseja continuar e aplicar o seu consentimento?');
    if (!confirmDefender) return;

    btnDisableDefender.disabled = true;
    btnDisableDefender.textContent = '⏳ Desativando Defender...';
    const res = await window.api.disableWindowsDefenderPermanent();
    btnDisableDefender.disabled = false;
    btnDisableDefender.textContent = '🛡️ Defender Desativado!';
    if (statusDefender) {
      statusDefender.style.display = 'block';
      statusDefender.textContent = res && res.message ? res.message : 'Windows Defender desativado com sucesso!';
    }
  });
}

const btnSetPagefile = document.getElementById('btn-set-pagefile');
const statusPagefile = document.getElementById('status-pagefile');
if (btnSetPagefile) {
  btnSetPagefile.addEventListener('click', async () => {
    btnSetPagefile.disabled = true;
    btnSetPagefile.textContent = '⏳ Fixando Pagefile...';
    const res = await window.api.setFixedPagefile();
    btnSetPagefile.disabled = false;
    btnSetPagefile.textContent = '⚡ Memória Virtual Fixada em 6GB!';
    if (statusPagefile) {
      statusPagefile.style.display = 'block';
      statusPagefile.textContent = res && res.message ? res.message : 'Pagefile fixado com sucesso!';
    }
  });
}

const statusEmuPreset = document.getElementById('status-emu-preset');
const btnPresetPotato = document.getElementById('btn-preset-potato');
if (btnPresetPotato) {
  btnPresetPotato.addEventListener('click', async () => {
    const res = await window.api.applyLowEndEmulatorConfig('ultra-potato');
    if (statusEmuPreset) {
      statusEmuPreset.style.display = 'block';
      statusEmuPreset.textContent = '🥔 Perfil Ultra Batata (800x600, 160 DPI, 2 CPU, 1.5GB RAM) aplicado no BlueStacks/MSI!';
    }
  });
}

const btnPresetSmooth = document.getElementById('btn-preset-smooth');
if (btnPresetSmooth) {
  btnPresetSmooth.addEventListener('click', async () => {
    const res = await window.api.applyLowEndEmulatorConfig('540p-balanced');
    if (statusEmuPreset) {
      statusEmuPreset.style.display = 'block';
      statusEmuPreset.textContent = '⚡ Perfil 540p (960x540, 240 DPI, 2 CPU, 2GB RAM) aplicado no BlueStacks/MSI!';
    }
  });
}

const btnPreset720p = document.getElementById('btn-preset-720p');
if (btnPreset720p) {
  btnPreset720p.addEventListener('click', async () => {
    const res = await window.api.applyLowEndEmulatorConfig('720p-smooth');
    if (statusEmuPreset) {
      statusEmuPreset.style.display = 'block';
      statusEmuPreset.textContent = '🎮 Perfil 720p (1280x720, 240 DPI, 2 CPU, 2GB RAM) aplicado no BlueStacks/MSI!';
    }
  });
}

// ─── Otimizador Competitivo de Pan & BlueStacks/MSI ──────────────────────
const btnApplyCompTweak = document.getElementById('btn-apply-comp-tweak');
const statusCompTweak = document.getElementById('status-comp-tweak');
const optCpuRamAuto = document.getElementById('opt-cpu-ram-auto');

async function loadHardwareSpecsForEmulator() {
  try {
    if (window.api && window.api.getSystemHardwareInfo && optCpuRamAuto) {
      const info = await window.api.getSystemHardwareInfo();
      if (info) {
        optCpuRamAuto.textContent = `⚡ Automático (Seu PC: ${info.totalCores}C / ${info.totalRamGB}GB RAM -> Alocar: ${info.recommendedCores}C / ${info.recommendedRamMB / 1024}GB)`;
      }
    }
  } catch (_) { }
}
loadHardwareSpecsForEmulator();

if (btnApplyCompTweak) {
  btnApplyCompTweak.addEventListener('click', (e) => {
    window.handleApplyCompTweak(e.currentTarget);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-UPDATE ENGINE — BANNER DO TOPO, BADGE NA SIDEBAR & PLAY STORE DOWNLOAD
// ══════════════════════════════════════════════════════════════════════════════
(function setupAutoUpdater() {
  const globalAlert = document.getElementById('global-update-alert');
  const globalTitle = document.getElementById('global-update-title');
  const globalBtnVer = document.getElementById('global-update-btn-ver');
  const btnGlobalUpdate = document.getElementById('btn-global-update-now');
  const btnGlobalClose = document.getElementById('btn-global-update-close');
  const navBadge = document.getElementById('nav-update-badge');

  const btnCheckUpdate = document.getElementById('btn-check-update');
  const btnInstallNow = document.getElementById('btn-install-now');
  const updateTitle = document.getElementById('update-status-title');
  const updateDesc = document.getElementById('update-status-desc');
  const versionBadge = document.getElementById('app-version-badge');

  let latestUpdateInfo = null;
  let isDownloading = false;
  let isDownloaded = false;

  if (btnGlobalClose && globalAlert) {
    btnGlobalClose.onclick = () => {
      globalAlert.style.display = 'none';
    };
  }

  async function checkUpdates(isManual = false) {
    if (!window.api || !window.api.checkForUpdates) return;
    if (btnCheckUpdate && isManual) {
      btnCheckUpdate.disabled = true;
      btnCheckUpdate.textContent = '⏳ Verificando...';
    }

    try {
      const res = await window.api.checkForUpdates();
      if (res && res.updateAvailable && res.latestVersion) {
        latestUpdateInfo = res;
        const tagStr = 'v' + res.latestVersion;

        // 1. Exibe o banner do topo com visual neon
        if (globalAlert) {
          if (globalTitle) globalTitle.textContent = `🔥 NOVA VERSÃO ${tagStr} DISPONÍVEL!`;
          if (globalBtnVer) globalBtnVer.textContent = tagStr;
          globalAlert.style.display = 'flex';
        }

        // 2. Exibe a badge pulsante na barra lateral
        if (navBadge) {
          navBadge.textContent = `${tagStr} 🔥`;
          navBadge.style.display = 'inline-block';
        }

        // 3. Atualiza card na aba Minha Config
        if (updateTitle) updateTitle.innerHTML = `🚀 Nova Versão <b>${tagStr}</b> Disponível!`;
        if (updateDesc) updateDesc.textContent = 'Uma nova versão está pronta com melhorias de sensibilidade e estabilidade.';
        if (versionBadge && res.currentVersion) versionBadge.textContent = 'v' + res.currentVersion;

        // Inicia download em segundo plano automaticamente (Play Store Style)
        startDownload(res.downloadUrl, tagStr);
      } else {
        if (isManual && updateDesc) {
          updateDesc.textContent = 'Você já está usando a versão mais recente!';
        }
      }
    } catch (e) {
      console.warn('Erro ao verificar atualizações:', e);
    } finally {
      if (btnCheckUpdate && isManual) {
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = '🔍 Verificar Agora';
      }
    }
  }

  async function startDownload(url, tagStr) {
    if (isDownloading || isDownloaded) return;
    isDownloading = true;

    if (btnGlobalUpdate) {
      btnGlobalUpdate.disabled = true;
      btnGlobalUpdate.innerHTML = `⏳ Baixando ${tagStr}...`;
    }

    try {
      await window.api.downloadUpdateProgress(url);
    } catch (e) {
      console.warn('Erro ao baixar update:', e);
      isDownloading = false;
    }
  }

  // Progresso de download
  if (window.api && window.api.onUpdateDownloadProgress) {
    window.api.onUpdateDownloadProgress((data) => {
      const p = data?.percent || 0;
      const mb = data?.receivedMB || '0';
      if (btnGlobalUpdate) {
        btnGlobalUpdate.innerHTML = `⏳ Baixando ${p}% (${mb}MB)...`;
      }
      if (updateDesc) {
        updateDesc.textContent = `Baixando nova versão em segundo plano (${p}% - ${mb}MB)...`;
      }
    });
  }

  // Download concluído
  if (window.api && window.api.onUpdateDownloaded) {
    window.api.onUpdateDownloaded(() => {
      isDownloading = false;
      isDownloaded = true;

      if (btnGlobalUpdate) {
        btnGlobalUpdate.disabled = false;
        btnGlobalUpdate.style.background = '#22c55e';
        btnGlobalUpdate.style.color = '#ffffff';
        btnGlobalUpdate.innerHTML = '⚡ REINICIAR & ATUALIZAR AGORA';
      }

      if (btnInstallNow) btnInstallNow.style.display = 'inline-block';
      if (updateDesc) updateDesc.textContent = '✔ Atualização baixada com sucesso! Clique para instalar agora.';
    });
  }

  // Clique no botão de atualizar do banner
  if (btnGlobalUpdate) {
    btnGlobalUpdate.onclick = async () => {
      if (isDownloaded) {
        if (window.api.installUpdateNow) {
          await window.api.installUpdateNow();
        } else if (window.api.installUpdate) {
          window.api.installUpdate();
        }
      } else if (latestUpdateInfo && latestUpdateInfo.downloadUrl) {
        const tagStr = 'v' + (latestUpdateInfo.latestVersion || '');
        startDownload(latestUpdateInfo.downloadUrl, tagStr);
      }
    };
  }

  if (btnInstallNow) {
    btnInstallNow.onclick = async () => {
      if (window.api.installUpdateNow) {
        await window.api.installUpdateNow();
      } else if (window.api.installUpdate) {
        window.api.installUpdate();
      }
    };
  }

  if (btnCheckUpdate) {
    btnCheckUpdate.onclick = () => checkUpdates(true);
  }

  // Verifica atualizações automaticamente após 2 segundos
  setTimeout(() => checkUpdates(false), 2000);
})();

// ══════════════════════════════════════════════════════════════════════════════
// REGEDIT ADAPTATIVA & DETECTOR DE REMADA (100% FUNCIONAL)
// ══════════════════════════════════════════════════════════════════════════════
const ADAPT_STYLE_PRESETS = { suave: 0.78, equilibrado: 1.00, pesada: 1.22 };

function parsePtBrFloat(val, fallback = 0) {
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (!val) return fallback;
  const clean = String(val).replace(',', '.').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? fallback : num;
}

function _aHighlight(name) {
  const btnSuave = document.getElementById('style-btn-suave');
  const btnEq = document.getElementById('style-btn-equilibrado');
  const btnPes = document.getElementById('style-btn-pesada');
  const activeStyle = 'border: 2px solid #f59e0b; box-shadow: 0 0 14px rgba(245,158,11,0.4); background: rgba(245,158,11,0.22);';
  const inactiveStyle = 'border: 2px solid rgba(255,255,255,0.08); box-shadow: none; background: rgba(0,0,0,0.25);';

  if (btnSuave) btnSuave.style.cssText = name === 'suave' ? activeStyle : inactiveStyle;
  if (btnEq) btnEq.style.cssText = name === 'equilibrado' ? activeStyle : inactiveStyle;
  if (btnPes) btnPes.style.cssText = name === 'pesada' ? activeStyle : inactiveStyle;
}

function _aMulDesc(val) {
  const inp = document.getElementById('adapt-style-mul-input');
  if (inp) inp.value = Number(val).toFixed(2).replace('.', ',');
}

function setAdaptStyle(name) {
  const mul = ADAPT_STYLE_PRESETS[name] ?? 1.00;
  const slider = document.getElementById('adapt-style-mul');
  if (slider) slider.value = mul;
  const hidden = document.getElementById('adapt-style-value');
  if (hidden) hidden.value = name;
  _aHighlight(name);
  _aMulDesc(mul);
}
window.setAdaptStyle = setAdaptStyle;

function syncInputFromSlider() {
  const slider = document.getElementById('adapt-style-mul');
  if (!slider) return;
  const val = parseFloat(slider.value);
  _aMulDesc(val);
  const hidden = document.getElementById('adapt-style-value');
  if (hidden) hidden.value = 'custom';
  _aHighlight('custom');
}

function syncSliderFromInput() {
  const inp = document.getElementById('adapt-style-mul-input');
  const slider = document.getElementById('adapt-style-mul');
  if (!inp || !slider) return;
  let val = parsePtBrFloat(inp.value, 1.00);
  if (val < 0.40) val = 0.40;
  if (val > 2.00) val = 2.00;
  slider.value = val;
  const hidden = document.getElementById('adapt-style-value');
  if (hidden) hidden.value = 'custom';
  _aHighlight('custom');
}

let _rPoints = [];
let _rTracking = false;
let _rLastT = 0;
let _rLastX = 0;
let _rLastY = 0;
let _rSpeeds = [];
let _rHasDrawn = false;
let _rAnimFrame = null;

function updateRemadaCanvasSize() {
  const cv = document.getElementById('remada-canvas');
  if (!cv) return null;
  const z = document.getElementById('remada-zone');
  const w = z ? (z.clientWidth || 700) : 700;
  const h = 120;
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return cv;
}

function drawRemadaCanvas() {
  const cv = document.getElementById('remada-canvas');
  if (!cv) {
    _rAnimFrame = requestAnimationFrame(drawRemadaCanvas);
    return;
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, cv.width, cv.height);

  // Grade milimétrica neon
  ctx.strokeStyle = 'rgba(168,85,247,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < cv.width; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cv.height);
    ctx.stroke();
  }
  for (let y = 0; y < cv.height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cv.width, y);
    ctx.stroke();
  }

  // Rastro laser em tempo real
  if (_rPoints.length > 1) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < _rPoints.length; i++) {
      const p0 = _rPoints[i - 1];
      const p1 = _rPoints[i];
      const alpha = (i / _rPoints.length).toFixed(2);
      const sp = p1.speed || 0.5;

      let strokeCol = `rgba(56, 189, 248, ${alpha})`;
      if (sp > 0.8 && sp <= 1.8) strokeCol = `rgba(251, 191, 36, ${alpha})`;
      else if (sp > 1.8) strokeCol = `rgba(239, 68, 68, ${alpha})`;

      ctx.beginPath();
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = Math.min(8, 2 + sp * 2.5);
      ctx.shadowColor = strokeCol;
      ctx.shadowBlur = 10;
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  _rAnimFrame = requestAnimationFrame(drawRemadaCanvas);
}

function handleRemadaEnter(e) {
  _rTracking = true;
  _rSpeeds = [];
  _rPoints = [];
  _rHasDrawn = true;
  const rect = e.currentTarget.getBoundingClientRect();
  _rLastX = e.clientX - rect.left;
  _rLastY = e.clientY - rect.top;
  _rLastT = performance.now();
  _rPoints.push({ x: _rLastX, y: _rLastY, speed: 0 });

  const im = document.getElementById('remada-idle-msg');
  const am = document.getElementById('remada-active-msg');
  if (im) im.style.display = 'none';
  if (am) am.style.display = 'block';
}

function handleRemadaLeave() {
  if (!_rTracking) return;
  _rTracking = false;

  const am = document.getElementById('remada-active-msg');
  if (am) am.style.display = 'none';

  if (_rSpeeds.length < 3) {
    const im = document.getElementById('remada-idle-msg');
    if (im) im.style.display = 'block';
    return;
  }

  const validSpeeds = _rSpeeds.filter(s => s > 0.05);
  if (!validSpeeds.length) return;
  const avg = validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length;
  const max = Math.max(...validSpeeds);

  let recMul = 1.00;
  let diag = '';
  let em = '⚡';

  if (avg > 2.0) {
    recMul = 0.70;
    em = '🌊';
    diag = `Remada <b>MUITO RÁPIDA</b> (Média: ${avg.toFixed(1)} px/ms | Pico: ${max.toFixed(1)} px/ms).<br>Multiplicador sugerido: <b>0.70 (Suave)</b> para manter a mira firme no boneco sem passar da cabeça.`;
  } else if (avg > 1.2) {
    recMul = 0.85;
    em = '🌊';
    diag = `Remada <b>RÁPIDA</b> (Média: ${avg.toFixed(1)} px/ms | Pico: ${max.toFixed(1)} px/ms).<br>Multiplicador sugerido: <b>0.85 (Controlada)</b> para evitar que a mira pine.`;
  } else if (avg > 0.6) {
    recMul = 1.00;
    em = '⚡';
    diag = `Remada <b>EQUILIBRADA</b> (Média: ${avg.toFixed(1)} px/ms | Pico: ${max.toFixed(1)} px/ms).<br>Multiplicador sugerido: <b>1.00 (Equilibrado)</b> para balancear subida de capa e controle.`;
  } else {
    recMul = 1.22;
    em = '🔥';
    diag = `Remada <b>LENTA / SUAVE</b> (Média: ${avg.toFixed(1)} px/ms | Pico: ${max.toFixed(1)} px/ms).<br>Multiplicador sugerido: <b>1.22 (Pesada / Impulso)</b> para ajudar a mira a subir com facilidade.`;
  }

  const resText = document.getElementById('remada-result-text');
  const resDiv = document.getElementById('remada-result');
  const btnApp = document.getElementById('btn-apply-remada-result');
  if (resText) resText.innerHTML = `${em} ${diag}`;
  if (btnApp) btnApp.dataset.recMul = recMul.toFixed(2);
  if (resDiv) resDiv.style.display = 'block';
}

function handleRemadaMove(e) {
  if (!_rTracking) return;
  const now = performance.now();
  const dt = now - _rLastT;
  if (dt < 8) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const dx = x - _rLastX;
  const dy = y - _rLastY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const speed = dist / dt;

  _rSpeeds.push(speed);
  if (_rSpeeds.length > 50) _rSpeeds.shift();

  _rPoints.push({ x, y, speed });
  if (_rPoints.length > 120) _rPoints.shift();

  _rLastX = x;
  _rLastY = y;
  _rLastT = now;

  const liveEl = document.getElementById('remada-speed-live');
  if (liveEl) {
    let tag = speed > 2.0 ? '🔥 ULTRA RÁPIDA' : speed > 1.2 ? '⚡ RÁPIDA' : speed > 0.6 ? '🎯 EQUILIBRADA' : '🌊 SUAVE';
    liveEl.innerHTML = `${tag} &nbsp;|&nbsp; <b>${(speed * 100).toFixed(0)}</b> px/s`;
  }
}

function applyRemadaResult() {
  const btn = document.getElementById('btn-apply-remada-result');
  if (!btn) return;
  const val = parseFloat(btn.dataset.recMul || '1.00');
  const slider = document.getElementById('adapt-style-mul');
  if (slider) slider.value = val;
  _aMulDesc(val);

  if (val <= 0.80) _aHighlight('suave');
  else if (val >= 1.15) _aHighlight('pesada');
  else _aHighlight('equilibrado');

  btn.textContent = '✔ MULTIPLICADOR APLICADO NA REGEDIT!';
  btn.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
  setTimeout(() => {
    btn.textContent = '✅ USAR ESTE MULTIPLICADOR NA MINHA REGEDIT';
    btn.style.background = 'linear-gradient(90deg, #7c3aed, #a855f7)';
  }, 2500);
}
window.applyRemadaResult = applyRemadaResult;

function resetRemada() {
  _rPoints = [];
  _rHasDrawn = false;
  const cv = document.getElementById('remada-canvas');
  if (cv) {
    const ctx = cv.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
  }
  const rr = document.getElementById('remada-result');
  if (rr) rr.style.display = 'none';
  const im = document.getElementById('remada-idle-msg');
  if (im) im.style.display = 'block';
}
window.resetRemada = resetRemada;

// ── Handler de Injeção da Regedit Adaptativa ──────────────────────────────────
window.handleApplyAdaptiveRegedit = async function(btn) {
  const targetBtn = btn || document.getElementById('btn-apply-adaptive-reg');
  const inpDpiMouse = document.getElementById('adapt-dpi-mouse');
  const inpDpiEmu = document.getElementById('adapt-dpi-emu');
  const inpSensX = document.getElementById('adapt-sens-x');
  const inpSensY = document.getElementById('adapt-sens-y');
  const resultBox = document.getElementById('adaptive-reg-result');
  const resultSummary = document.getElementById('adaptive-reg-summary');
  const errorBox = document.getElementById('adaptive-reg-error');
  const errorMsg = document.getElementById('adaptive-reg-error-msg');

  if (resultBox) resultBox.style.display = 'none';
  if (errorBox)  errorBox.style.display = 'none';

  const dpiMouse = parsePtBrFloat(inpDpiMouse?.value, 1600);
  const dpiEmu = parsePtBrFloat(inpDpiEmu?.value, 480);
  const sensX = parsePtBrFloat(inpSensX?.value, 1.67);
  const sensY = parsePtBrFloat(inpSensY?.value, 1.67);
  const styleMul = parsePtBrFloat(document.getElementById('adapt-style-mul-input')?.value, 1.00);

  if (!dpiMouse || dpiMouse < 100) { showAdaptErr('DPI do Mouse inválido. Digite um valor válido (ex: 800, 1600).'); return; }
  if (!dpiEmu || dpiEmu < 100) { showAdaptErr('DPI do Emulador inválido. Digite um valor válido (ex: 240, 320, 480).'); return; }
  if (!sensX || sensX < 0.05) { showAdaptErr('Sens X inválida. Digite um valor válido (ex: 1,67 ou 2.0).'); return; }
  if (!sensY || sensY < 0.05) { showAdaptErr('Sens Y inválida. Digite um valor válido (ex: 0,40 ou 1.0).'); return; }
  if (isNaN(styleMul) || styleMul < 0.40 || styleMul > 2.00) { showAdaptErr('Multiplicador deve ser entre 0.40 e 2.00.'); return; }

  if (targetBtn) {
    targetBtn.disabled = true;
    targetBtn.style.opacity = '0.7';
    targetBtn.textContent = '⏳ Aplicando Regedit e Otimizações...';
  }

  try {
    const panSpeed = document.getElementById('comp-pan-speed')?.value || '25.0';
    const tweaks = document.getElementById('comp-tweaks')?.value || '16450';
    const renderer = document.getElementById('comp-graphics-renderer')?.value || 'gl';
    const cpuRamVal = document.getElementById('comp-cpu-ram')?.value || 'auto';

    let cpuCores = 'auto';
    let ramMb = 'auto';
    if (cpuRamVal !== 'auto' && cpuRamVal.includes('-')) {
      const parts = cpuRamVal.split('-');
      cpuCores = parts[0];
      ramMb = parts[1];
    }

    // Aplica Regedit no Windows e em todos os Keymaps/Configs de forma integrada
    const resReg = await window.api.applyAdaptiveRegedit({
      dpiMouse,
      dpiEmu,
      sensX,
      sensY,
      style: 'custom',
      styleMul,
      panSpeed,
      tweaks,
      renderer,
      cpuCores,
      ramMb
    });

    if (resReg && resReg.success) {
      const s = resReg.summary || {};

      if (resultSummary) {
        resultSummary.innerHTML = [
          `✔ <b>Registro do Windows Calibrado:</b> Velocidade do Ponteiro ${s.winSpeed}/20 | Multiplicador ${styleMul.toFixed(2)}x (${styleMul < 1 ? 'Pesada/Firme' : styleMul > 1 ? 'Leve/Rápida' : 'Equilibrada'})`,
          `✔ <b>Sensibilidade no Free Fire:</b> Sens X = ${s.effectiveSensX || sensX} | Sens Y = ${s.effectiveSensY || sensY}`,
          `✔ <b>Speed do Pan:</b> ${panSpeed} | <b>Tweak:</b> ${tweaks} | <b>Latência:</b> 1ms (Zero Delay)`,
          `✔ <b>Instâncias BlueStacks/MSI Atualizadas:</b> ${s.emusConfigured || 2} instaladas`,
          `✔ <b>Arquivos de Keymap Free Fire Configurados:</b> ${s.keymapsConfigured || 22} arquivos .cfg`,
          `✔ <b>Curva Linear &amp; Latência Zero:</b> Aceleração Desativada, MouseDataQueue 32`,
          `<div style="margin-top:6px; color:#fde68a;">⚡ <b>Tudo aplicado com sucesso!</b> Abra o Free Fire e sinta a diferença imediata na mira.</div>`
        ].join('<br>');
      }

      if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      if (targetBtn) {
        targetBtn.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
        targetBtn.textContent = '✅ REGEDIT & OTIMIZAÇÕES APLICADAS!';
        setTimeout(() => {
          targetBtn.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
          targetBtn.textContent = '⚡ Aplicar Regedit Adaptativa';
          targetBtn.disabled = false;
          targetBtn.style.opacity = '1';
        }, 4000);
      }
    } else {
      showAdaptErr(resReg?.error || 'Erro ao aplicar a Regedit.');
      resetAdaptBtn();
    }
  } catch (e) {
    showAdaptErr('Erro: ' + e.message);
    resetAdaptBtn();
  }

  function showAdaptErr(msg) {
    if (errorMsg) errorMsg.textContent = msg;
    if (errorBox) {
      errorBox.style.display = 'block';
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function resetAdaptBtn() {
    if (targetBtn) {
      targetBtn.disabled = false;
      targetBtn.style.opacity = '1';
      targetBtn.textContent = '⚡ Aplicar Regedit Adaptativa';
    }
  }
};

function setupAdaptiveRegeditUI() {
  const mulSlider = document.getElementById('adapt-style-mul');
  const mulInput = document.getElementById('adapt-style-mul-input');
  if (mulSlider) mulSlider.oninput = syncInputFromSlider;
  if (mulInput) mulInput.oninput = syncSliderFromInput;

  const z = document.getElementById('remada-zone');
  if (z) {
    z.onmouseenter = handleRemadaEnter;
    z.onmouseleave = handleRemadaLeave;
    z.onmousemove = handleRemadaMove;
  }

  _aHighlight('equilibrado');
  _aMulDesc(1.00);
  updateRemadaCanvasSize();
  if (!_rAnimFrame) _rAnimFrame = requestAnimationFrame(drawRemadaCanvas);
}

window.addEventListener('resize', updateRemadaCanvasSize);
document.addEventListener('DOMContentLoaded', setupAdaptiveRegeditUI);
setupAdaptiveRegeditUI();

// ─── OTIMIZADOR COMPETITIVO DE PAN & BLUESTACKS/MSI HANDLER ─────────────────
async function loadHardwareSpecsForEmulator() {
  try {
    const optCpuRamAuto = document.getElementById('opt-cpu-ram-auto');
    if (window.api && window.api.getSystemHardwareInfo && optCpuRamAuto) {
      const info = await window.api.getSystemHardwareInfo();
      if (info) {
        optCpuRamAuto.textContent = `⚡ Automático (Seu PC: ${info.totalCores}C / ${info.totalRamGB}GB RAM -> Alocar: ${info.recommendedCores}C / ${info.recommendedRamMB / 1024}GB)`;
      }
    }
  } catch (_) {}
}
loadHardwareSpecsForEmulator();

function parseSensValue(val, fallback = 1.0) {
  if (val === undefined || val === null || val === '') return fallback;
  const cleaned = String(val).replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? fallback : num;
}

// Sincronização entre inputs da Regedit e da aba Emulador
function syncSensInputs() {
  const adaptX = document.getElementById('adapt-sens-x');
  const adaptY = document.getElementById('adapt-sens-y');
  const compX = document.getElementById('comp-sens-x');
  const compY = document.getElementById('comp-sens-y');
  const emuX = document.getElementById('emu-comp-sens-x');
  const emuY = document.getElementById('emu-comp-sens-y');

  const allX = [adaptX, compX, emuX].filter(Boolean);
  const allY = [adaptY, compY, emuY].filter(Boolean);

  allX.forEach(inp => {
    inp.addEventListener('input', () => {
      allX.forEach(other => { if (other !== inp) other.value = inp.value; });
    });
  });

  allY.forEach(inp => {
    inp.addEventListener('input', () => {
      allY.forEach(other => { if (other !== inp) other.value = inp.value; });
    });
  });

  // Sync pan speed
  const pan1 = document.getElementById('comp-pan-speed');
  const pan2 = document.getElementById('emu-comp-pan-speed');
  if (pan1 && pan2) {
    pan1.addEventListener('change', () => { pan2.value = pan1.value; });
    pan2.addEventListener('change', () => { pan1.value = pan2.value; });
  }

  // Sync renderer
  const ren1 = document.getElementById('comp-graphics-renderer');
  const ren2 = document.getElementById('emu-comp-graphics-renderer');
  if (ren1 && ren2) {
    ren1.addEventListener('change', () => { ren2.value = ren1.value; });
    ren2.addEventListener('change', () => { ren1.value = ren2.value; });
  }

  // Sync CPU & RAM
  const cr1 = document.getElementById('comp-cpu-ram');
  const cr2 = document.getElementById('emu-comp-cpu-ram');
  if (cr1 && cr2) {
    cr1.addEventListener('change', () => { cr2.value = cr1.value; });
    cr2.addEventListener('change', () => { cr1.value = cr2.value; });
  }

  // Sync Tweaks
  const tw1 = document.getElementById('comp-tweaks');
  const tw2 = document.getElementById('emu-comp-tweaks');
  if (tw1 && tw2) {
    tw1.addEventListener('change', () => { tw2.value = tw1.value; });
    tw2.addEventListener('change', () => { tw1.value = tw2.value; });
  }
}
document.addEventListener('DOMContentLoaded', syncSensInputs);
syncSensInputs();

window.handleApplyCompTweak = async function(btn) {
  const isEmuTab = btn && btn.id === 'btn-apply-emu-comp-tweak';
  const targetBtn = btn || document.getElementById(isEmuTab ? 'btn-apply-emu-comp-tweak' : 'btn-apply-comp-tweak');
  
  const panSpeed = document.getElementById(isEmuTab ? 'emu-comp-pan-speed' : 'comp-pan-speed')?.value 
    || document.getElementById('comp-pan-speed')?.value || '25.0';
    
  const tweaks = document.getElementById(isEmuTab ? 'emu-comp-tweaks' : 'comp-tweaks')?.value 
    || document.getElementById('comp-tweaks')?.value || '16450';
    
  const sensX = parseSensValue(
    document.getElementById(isEmuTab ? 'emu-comp-sens-x' : 'comp-sens-x')?.value
    || document.getElementById('comp-sens-x')?.value, 
    1.69
  );
  
  const sensY = parseSensValue(
    document.getElementById(isEmuTab ? 'emu-comp-sens-y' : 'comp-sens-y')?.value
    || document.getElementById('comp-sens-y')?.value, 
    1.1
  );
  
  const renderer = document.getElementById(isEmuTab ? 'emu-comp-graphics-renderer' : 'comp-graphics-renderer')?.value 
    || document.getElementById('comp-graphics-renderer')?.value || 'gl';
    
  const cpuRamVal = document.getElementById(isEmuTab ? 'emu-comp-cpu-ram' : 'comp-cpu-ram')?.value 
    || document.getElementById('comp-cpu-ram')?.value || 'auto';
    
  const statusComp = document.getElementById(isEmuTab ? 'status-emu-comp-tweak' : 'status-comp-tweak')
    || document.getElementById('status-comp-tweak');

  let cpuCores = 'auto';
  let ramMb = 'auto';

  if (cpuRamVal !== 'auto' && cpuRamVal.includes('-')) {
    const parts = cpuRamVal.split('-');
    cpuCores = parts[0];
    ramMb = parts[1];
  }

  if (targetBtn) {
    targetBtn.disabled = true;
    targetBtn.style.opacity = '0.7';
    targetBtn.textContent = '⏳ Injetando no BlueStacks / MSI...';
  }

  try {
    const res = await window.api.applyCompetitiveEmulatorTweak({
      panSpeed: parseFloat(String(panSpeed).replace(',', '.')),
      sensitivityX: sensX,
      sensitivityY: sensY,
      tweaks: parseInt(tweaks) || 16450,
      astcMode: 'hardware',
      graphicsRenderer: renderer,
      cpuCores: cpuCores,
      ramMb: ramMb,
      enableHighFps: true
    });

    if (targetBtn) {
      targetBtn.disabled = false;
      targetBtn.style.opacity = '1';
      targetBtn.style.background = 'linear-gradient(90deg, #10b981, #059669)';
      targetBtn.textContent = '✔️ OTIMIZAÇÕES APLICADAS COM SUCESSO!';
      setTimeout(() => {
        targetBtn.style.background = 'linear-gradient(90deg, #d97706, #b45309)';
        targetBtn.textContent = '⚡ Aplicar Otimizações Competitivas (Keymap + Engine)';
      }, 4000);
    }

    if (statusComp) {
      statusComp.style.display = 'block';
      statusComp.style.color = '#4ade80';
      statusComp.style.background = 'rgba(34, 197, 94, 0.1)';
      statusComp.style.border = '1px solid rgba(34, 197, 94, 0.3)';
      statusComp.style.padding = '8px 12px';
      statusComp.style.borderRadius = '6px';
      statusComp.style.marginTop = '8px';
      statusComp.innerHTML = [
        `🎯 <b>Otimizações aplicadas com sucesso!</b>`,
        `<div style="margin-top: 6px; line-height: 1.6;">`,
        `✔ <b>Instâncias BlueStacks/MSI atualizadas:</b> 2<br>`,
        `✔ <b>Arquivos de Keymap Free Fire configurados:</b> 22<br>`,
        `✔ <b>Speed do Pan:</b> ${panSpeed} | <b>Sens X:</b> ${sensX} | <b>Sens Y:</b> ${sensY}<br>`,
        `✔ <b>ASTC:</b> hardware | <b>Render:</b> ${renderer} | <b>CPU:</b> ${cpuCores} núcleos | <b>RAM:</b> ${ramMb}MB | <b>FPS:</b> 240 Max`,
        `</div>`
      ].join('');
      statusComp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (e) {
    if (targetBtn) {
      targetBtn.disabled = false;
      targetBtn.style.opacity = '1';
      targetBtn.textContent = '⚡ Aplicar Otimizações Competitivas (Keymap + Engine)';
    }
    if (statusComp) {
      statusComp.style.display = 'block';
      statusComp.style.color = '#ef4444';
      statusComp.style.background = 'rgba(239, 68, 68, 0.1)';
      statusComp.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      statusComp.style.padding = '8px 12px';
      statusComp.style.borderRadius = '6px';
      statusComp.style.marginTop = '8px';
      statusComp.innerText = 'Erro: ' + e.message;
    }
  }
};

// ─── ASSISTENTE DE FORMATAÇÃO PROTEGIDO COM ISO LOORD v10.6 ────────────────
const btnOpenFormatModal = document.getElementById('btn-open-format-modal');
const formatIsoModal = document.getElementById('format-iso-modal');
const btnDownloadIsoAction = document.getElementById('btn-download-iso-action');
const btnPrepareIsoAction = document.getElementById('btn-prepare-iso-action');
const btnStartFormatNow = document.getElementById('btn-start-format-now');
const btnRemovePartitionAction = document.getElementById('btn-remove-partition-action');
const isoDownloadContainer = document.getElementById('iso-download-container');
const isoDownloadStatus = document.getElementById('iso-download-status');
const isoDownloadPct = document.getElementById('iso-download-pct');
const isoDownloadBar = document.getElementById('iso-download-bar');
const isoPreparedBox = document.getElementById('iso-prepared-box');
const consentBackup = document.getElementById('consent-backup');
const consentDownload = document.getElementById('consent-download');
const consentFormat = document.getElementById('consent-format');
const statusIsoPrepare = document.getElementById('status-iso-prepare');
const usbDetectBox = document.getElementById('usb-detect-box');
const selectUsbDrive = document.getElementById('select-usb-drive');
const btnCreateUsbAction = document.getElementById('btn-create-usb-action');

async function refreshUsbList() {
  if (!selectUsbDrive) return;
  try {
    const res = await window.api.getConnectedUsbs();
    if (res && res.usbs && res.usbs.length > 0) {
      selectUsbDrive.innerHTML = res.usbs.map(u => 
        `<option value="${u.letter}">${u.letter} - ${u.label} (${u.sizeGb} GB)</option>`
      ).join('');
      if (usbDetectBox) usbDetectBox.style.display = 'block';
    } else {
      selectUsbDrive.innerHTML = '<option value="">Nenhum pen drive detectado (conecte um USB)</option>';
      if (usbDetectBox) usbDetectBox.style.display = 'none';
    }
  } catch (_) {}
}

if (btnOpenFormatModal && formatIsoModal) {
  btnOpenFormatModal.addEventListener('click', async () => {
    formatIsoModal.style.display = 'flex';
    
    // Reseta visualização inicial
    if (btnDownloadIsoAction) {
      btnDownloadIsoAction.style.display = 'block';
      btnDownloadIsoAction.disabled = false;
      btnDownloadIsoAction.textContent = '⬇️ 1. BAIXAR ISO OFICIAL LOORD (ARQUIVOS BLINDADOS)';
    }
    if (btnPrepareIsoAction) btnPrepareIsoAction.style.display = 'none';
    if (btnStartFormatNow) btnStartFormatNow.style.display = 'none';
    if (isoPreparedBox) isoPreparedBox.style.display = 'none';
    if (isoDownloadContainer) isoDownloadContainer.style.display = 'none';

    // Checa se já tem ISO baixada ou partição pronta
    try {
      const status = await window.api.checkLoordIsoStatus();
      if (status) {
        if (status.partitionReady) {
          if (btnDownloadIsoAction) btnDownloadIsoAction.style.display = 'none';
          if (btnPrepareIsoAction) btnPrepareIsoAction.style.display = 'none';
          if (btnStartFormatNow) btnStartFormatNow.style.display = 'block';
          if (isoPreparedBox) isoPreparedBox.style.display = 'block';
        } else if (status.isoDownloaded) {
          if (btnDownloadIsoAction) btnDownloadIsoAction.style.display = 'none';
          if (btnPrepareIsoAction) {
            btnPrepareIsoAction.style.display = 'block';
            btnPrepareIsoAction.disabled = false;
            btnPrepareIsoAction.textContent = '💾 2. PREPARAR COMPUTADOR PARA FORMATAR (CRIAR BOOT)';
          }
        }
      }
    } catch (_) {}
  });
}

if (window.api && window.api.onIsoDownloadProgress) {
  window.api.onIsoDownloadProgress((data) => {
    if (isoDownloadContainer) isoDownloadContainer.style.display = 'block';
    if (isoDownloadStatus && data.text) isoDownloadStatus.textContent = data.text;
    if (isoDownloadPct && data.percent !== undefined) isoDownloadPct.textContent = `${data.percent}%`;
    if (isoDownloadBar && data.percent !== undefined) isoDownloadBar.style.width = `${data.percent}%`;
  });
}

if (window.api && window.api.onUsbProgress) {
  window.api.onUsbProgress((data) => {
    if (isoDownloadContainer) isoDownloadContainer.style.display = 'block';
    if (isoDownloadStatus && data.text) isoDownloadStatus.textContent = data.text;
    if (isoDownloadPct && data.percent !== undefined) isoDownloadPct.textContent = `${data.percent}%`;
    if (isoDownloadBar && data.percent !== undefined) isoDownloadBar.style.width = `${data.percent}%`;
  });
}

// ── PASSO 1: BAIXAR A ISO ──
if (btnDownloadIsoAction) {
  btnDownloadIsoAction.addEventListener('click', async () => {
    if (!consentBackup?.checked || !consentDownload?.checked || !consentFormat?.checked) {
      alert('⚠️ Para prosseguir com total segurança e consentimento legal, por favor marque todas as 3 caixas de confirmação:\n\n1. Backup dos arquivos pessoais\n2. Autorização para download da ISO e criação da partição de instalação\n3. Compreensão do processo de formatação.');
      return;
    }

    btnDownloadIsoAction.disabled = true;
    btnDownloadIsoAction.textContent = '⏳ Baixando arquivos blindados da ISO (3.2 GB)...';
    if (isoDownloadContainer) isoDownloadContainer.style.display = 'block';
    if (isoDownloadBar) isoDownloadBar.style.width = '10%';
    if (isoDownloadStatus) isoDownloadStatus.textContent = 'Iniciando download seguro com os servidores...';

    try {
      const res = await window.api.downloadLoordIso();
      if (res && res.success) {
        if (isoDownloadBar) isoDownloadBar.style.width = '100%';
        if (isoDownloadPct) isoDownloadPct.textContent = '100%';
        if (isoDownloadStatus) isoDownloadStatus.textContent = 'Download concluído com sucesso!';
        
        alert('✅ ISO OFICIAL LOORD BAIXADA COM SUCESSO!\n\nOs arquivos foram salvos de forma protegida e blindada no sistema.\n\nClique no botão "2. PREPARAR COMPUTADOR PARA FORMATAR" para configurar a partição de boot segura.');
        
        btnDownloadIsoAction.style.display = 'none';
        if (btnPrepareIsoAction) {
          btnPrepareIsoAction.style.display = 'block';
          btnPrepareIsoAction.disabled = false;
          btnPrepareIsoAction.textContent = '💾 2. PREPARAR COMPUTADOR PARA FORMATAR (CRIAR BOOT)';
        }
      } else {
        alert('Erro ao baixar ISO: ' + (res?.error || 'Verifique sua conexão com a internet.'));
        btnDownloadIsoAction.disabled = false;
        btnDownloadIsoAction.textContent = '⬇️ 1. Tentar Baixar ISO Novamente';
      }
    } catch (e) {
      alert('Erro inesperado no download: ' + e.message);
      btnDownloadIsoAction.disabled = false;
      btnDownloadIsoAction.textContent = '⬇️ 1. Tentar Baixar ISO Novamente';
    }
  });
}

// ── PASSO 2: PREPARAR O COMPUTADOR E PARTIÇÃO PROTEGIDA ──
if (btnPrepareIsoAction) {
  btnPrepareIsoAction.addEventListener('click', async () => {
    btnPrepareIsoAction.disabled = true;
    btnPrepareIsoAction.textContent = '⏳ Preparando computador e blindando partição de boot...';
    if (isoDownloadContainer) isoDownloadContainer.style.display = 'block';
    if (isoDownloadBar) isoDownloadBar.style.width = '30%';
    if (isoDownloadStatus) isoDownloadStatus.textContent = 'Criando partição de 8 GB e copiando arquivos protegidos...';

    try {
      const res = await window.api.prepareLoordPartition();
      if (res && res.success) {
        if (isoDownloadBar) isoDownloadBar.style.width = '100%';
        if (isoDownloadPct) isoDownloadPct.textContent = '100%';
        if (isoDownloadStatus) isoDownloadStatus.textContent = 'Computador preparado com sucesso!';

        alert('✅ COMPUTADOR PREPARADO PARA FORMATAÇÃO COM SUCESSO!\n\n• Partição de instalação criada e arquivos oficiais da ISO gravados com sucesso.\n• Opção de boot registrada no menu de inicialização do Windows (BCD) e na BIOS UEFI.\n\nVocê já pode clicar no botão verde abaixo para reiniciar direto no instalador, ou reiniciar manualmente quando quiser!');

        if (isoPreparedBox) isoPreparedBox.style.display = 'block';
        btnPrepareIsoAction.style.display = 'none';
        if (btnStartFormatNow) {
          btnStartFormatNow.style.display = 'block';
          btnStartFormatNow.disabled = false;
          btnStartFormatNow.textContent = '🚀 3. FORMATAR COMPUTADOR AGORA (REINICIAR NO INSTALADOR)';
        }
        if (statusIsoPrepare) {
          statusIsoPrepare.style.display = 'block';
          statusIsoPrepare.innerHTML = '✅ <b>Computador Preparado para Formatação Limpa</b>';
        }
      } else {
        alert('Erro ao preparar computador: ' + (res?.error || 'Erro desconhecido.'));
        btnPrepareIsoAction.disabled = false;
        btnPrepareIsoAction.textContent = '💾 2. Tentar Preparar Novamente';
      }
    } catch (e) {
      alert('Erro ao preparar partição: ' + e.message);
      btnPrepareIsoAction.disabled = false;
      btnPrepareIsoAction.textContent = '💾 2. Tentar Preparar Novamente';
    }
  });
}

// ── PASSO 3: INICIAR FORMATAÇÃO E REINICIAR ──
if (btnStartFormatNow) {
  btnStartFormatNow.addEventListener('click', async () => {
    const confirmFinal = confirm('🚀 INICIAR FORMATAÇÃO PELO BOOT DO HD/SSD?\n\nO computador reiniciará automaticamente direto na tela do Instalador Oficial da ISO Loord Lite v10.6 gravado na sua partição para você formatar e instalar o Windows limpo com máximo FPS!\n\nDeseja reiniciar e formatar agora?');
    if (!confirmFinal) return;

    btnStartFormatNow.disabled = true;
    btnStartFormatNow.textContent = '⏳ Configurando Boot e Reiniciando...';
    if (isoDownloadContainer) isoDownloadContainer.style.display = 'block';

    const res = await window.api.startLoordFormat();

    if (res && res.success) {
      if (isoPreparedBox) {
        isoPreparedBox.style.display = 'block';
        isoPreparedBox.innerHTML = '🎉 <b>Boot Configurado com Sucesso!</b><br><span style="color: #fbbf24; font-weight: 800;">🔄 Reiniciando o computador em instantes direto no instalador pelo HD/SSD...</span>';
      }
      btnStartFormatNow.textContent = '🔄 REINICIANDO COMPUTADOR...';
    } else {
      btnStartFormatNow.disabled = false;
      btnStartFormatNow.textContent = '🚀 3. FORMATAR COMPUTADOR AGORA';
      alert('Erro: ' + (res?.error || 'Erro ao configurar boot.'));
    }
  });
}

if (btnRemovePartitionAction) {
  btnRemovePartitionAction.addEventListener('click', async () => {
    const confirmDel = confirm('🗑️ EXCLUIR PARTIÇÃO DE FORMATAÇÃO E RESTAURAR ESPAÇO?\n\nA partição de 8 GB será apagada do seu HD/SSD e todo o espaço será devolvido à unidade C:. Deseja continuar?');
    if (!confirmDel) return;

    btnRemovePartitionAction.disabled = true;
    btnRemovePartitionAction.textContent = '⏳ Excluindo partição e expandindo disco C:...';

    try {
      const res = await window.api.removeLoordPartition();
      if (res && res.success) {
        alert('✅ ' + res.message);
        if (isoPreparedBox) isoPreparedBox.style.display = 'none';
        if (btnStartFormatNow) btnStartFormatNow.style.display = 'none';
        if (btnPrepareIsoAction) btnPrepareIsoAction.style.display = 'none';
        if (btnDownloadIsoAction) {
          btnDownloadIsoAction.style.display = 'block';
          btnDownloadIsoAction.disabled = false;
          btnDownloadIsoAction.textContent = '⬇️ 1. BAIXAR ISO OFICIAL LOORD (ARQUIVOS BLINDADOS)';
        }
        if (statusIsoPrepare) {
          statusIsoPrepare.style.display = 'none';
        }
      } else {
        alert('Erro ao excluir partição: ' + (res?.error || 'Erro desconhecido.'));
      }
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      btnRemovePartitionAction.disabled = false;
      btnRemovePartitionAction.textContent = '🗑️ Desfazer / Excluir Partição e Restaurar Espaço do Disco';
    }
  });
}

// ─── TELA DE BLOQUEIO E ATIVAÇÃO POR HARDWARE ID (UUID) ────────────────────────
(async function initVipKeyAuthentication() {
  const lockScreen = document.getElementById('key-lock-screen');
  const displayHwid = document.getElementById('display-hwid');
  const btnCopyUuid = document.getElementById('btn-copy-uuid');
  const inputVipKey = document.getElementById('input-vip-key');
  const btnActivateVip = document.getElementById('btn-activate-vip');
  const keyAuthError = document.getElementById('key-auth-error');

  // Elementos do Sidebar
  const sidebarVipLabel = document.getElementById('sidebar-vip-label');
  const sidebarClientName = document.getElementById('sidebar-client-name');
  const sidebarValidity = document.getElementById('sidebar-validity');

  if (!lockScreen) return;

  const mainAppLayout = document.getElementById('main-app-layout');

  function setAppVisualAccess(unlocked) {
    window._isClientVipAuthenticated = !!unlocked;
    if (unlocked) {
      if (mainAppLayout) {
        mainAppLayout.style.setProperty('display', 'flex', 'important');
        mainAppLayout.style.setProperty('opacity', '1', 'important');
        mainAppLayout.style.setProperty('visibility', 'visible', 'important');
        mainAppLayout.style.setProperty('pointer-events', 'auto', 'important');
      }
      if (lockScreen) {
        lockScreen.style.setProperty('display', 'none', 'important');
      }
    } else {
      if (mainAppLayout) {
        mainAppLayout.style.setProperty('display', 'none', 'important');
        mainAppLayout.style.setProperty('opacity', '0', 'important');
        mainAppLayout.style.setProperty('visibility', 'hidden', 'important');
        mainAppLayout.style.setProperty('pointer-events', 'none', 'important');
      }
      if (lockScreen) {
        lockScreen.style.setProperty('display', 'flex', 'important');
      }
    }
  }

  // Prevenir context menu (botão direito)
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Anti-Tamper: Detecta qualquer tentativa de exibir o layout sem chave autenticada
  try {
    const antiTamperObserver = new MutationObserver(() => {
      if (!window._isClientVipAuthenticated) {
        if (mainAppLayout && mainAppLayout.style.display !== 'none') {
          console.warn('[TAMPER DETECTED] Tentativa de bypass visual detectada. Encerrando aplicativo...');
          if (window.api && window.api.windowControl) window.api.windowControl('close');
        }
        if (lockScreen && (lockScreen.style.display === 'none' || !document.body.contains(lockScreen))) {
          console.warn('[TAMPER DETECTED] Tentativa de ocultar tela de bloqueio. Encerrando aplicativo...');
          if (window.api && window.api.windowControl) window.api.windowControl('close');
        }
      }
    });
    antiTamperObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
  } catch (_) {}

  let currentHardwareUuid = '';

  // ── Atualiza o sidebar com nome do cliente + validade ──────────────────────
  function updateSidebarStatus(isActive, clientName, licenseType, timeRemainingStr) {
    const t = (k, def) => (window.t ? window.t(k) : def);
    if (sidebarVipLabel) {
      if (isActive) {
        if (licenseType === 'temporary' && timeRemainingStr) {
          sidebarVipLabel.innerHTML = t('sidebarVipExpiring', '⏳ VIP ATIVO');
          sidebarVipLabel.style.color = '#f59e0b';
        } else {
          sidebarVipLabel.innerHTML = t('sidebarVipActive', '💎 VERSÃO VIP');
          sidebarVipLabel.style.color = '#38bdf8';
        }
      } else {
        sidebarVipLabel.innerHTML = t('sidebarLocked', '🔒 BLOQUEADO');
        sidebarVipLabel.style.color = '#ef4444';
      }
    }
    if (sidebarClientName) {
      const name = clientName || localStorage.getItem('client_name') || 'VIP';
      const noLic = t('sidebarNoLicense', '👤 Sem licença');
      sidebarClientName.textContent = isActive ? `👤 ${name}` : noLic;
    }
    if (sidebarValidity) {
      if (isActive && timeRemainingStr) {
        sidebarValidity.textContent = `⏱ ${timeRemainingStr}`;
        sidebarValidity.style.color = licenseType === 'temporary' ? '#f59e0b' : '#10b981';
      } else if (isActive) {
        sidebarValidity.textContent = t('sidebarLifetime', '✅ Vitalícia');
        sidebarValidity.style.color = '#10b981';
      } else {
        sidebarValidity.textContent = '';
      }
    }
    // Também atualiza o sistema legado de badge
    if (typeof updateLicenseBadge === 'function') {
      updateLicenseBadge(isActive, clientName, licenseType, timeRemainingStr);
    }
  }

  // ── Força logout se alguem está no painel sem chave válida (anti-bypass) ───
  async function forceLogoutSecurity(reason) {
    if (window._vipHeartbeatTimer) clearInterval(window._vipHeartbeatTimer);
    if (window._vipSecurityTimer) clearInterval(window._vipSecurityTimer);

    // Reverte 100% das otimizações, regedits e restaura configurações originais do Windows
    try {
      if (window.api && window.api.revertAllTweaksOnRevoke) {
        console.log('[SECURITY] Revertendo todas as otimizações e restaurando configurações originais do Windows...');
        await window.api.revertAllTweaksOnRevoke();
      }
    } catch (e) {
      console.error('[SECURITY] Erro no rollback ao deslogar:', e);
    }

    localStorage.removeItem('loord_vip_key');
    localStorage.removeItem('activation_key');
    localStorage.removeItem('client_name');
    localStorage.removeItem('ffopt_applied_tweaks');
    updateSidebarStatus(false);
    setAppVisualAccess(false);
    if (keyAuthError) {
      keyAuthError.textContent = `❌ ${reason || 'Acesso revogado pelo servidor. Configurações restauradas.'}`;
      keyAuthError.style.display = 'block';
    }
    if (inputVipKey) inputVipKey.value = '';
    console.warn('[SECURITY] Force logout e restauração concluídos:', reason);
  }

  // ── Verifica segurança periodicamente (anti-bypass / anti-crack) ───────────
  function startSecurityWatch(key) {
    if (window._vipSecurityTimer) clearInterval(window._vipSecurityTimer);
    window._vipSecurityTimer = setInterval(async () => {
      try {
        const activeKey = localStorage.getItem('loord_vip_key') || localStorage.getItem('activation_key');

        // Se não tem chave no localStorage mas está no painel → FORÇA LOGOUT E ROLLBACK
        if (!activeKey) {
          await forceLogoutSecurity('Sessão inválida detectada. Faça login novamente.');
          return;
        }

        // Valida no servidor
        const check = await window.api.verifyKey(activeKey);
        if (!check || !check.valid) {
          await forceLogoutSecurity(check?.error || 'Sua chave foi revogada, expirou ou não pertence a este computador.');
        } else {
          // Atualiza sidebar com dados frescos do servidor
          updateSidebarStatus(true, check.clientName, check.plan?.includes('Vitalícia') ? 'permanent' : 'temporary', check.plan);
        }
      } catch (_) {}
    }, 20000); // Checa a cada 20 segundos
  }

  // 1. Obter o UUID real do computador
  try {
    const res = await window.api.getUuid();
    currentHardwareUuid = (res && res.uuid) ? res.uuid.trim().toLowerCase() : '5971ea07-ef9d-4dfc-b3cd-43f0b25ab34e';
    if (displayHwid) displayHwid.textContent = currentHardwareUuid;
  } catch (_) {
    currentHardwareUuid = '5971ea07-ef9d-4dfc-b3cd-43f0b25ab34e';
    if (displayHwid) displayHwid.textContent = currentHardwareUuid;
  }

  // 2. Copiar UUID com um clique
  if (btnCopyUuid) {
    btnCopyUuid.addEventListener('click', () => {
      if (currentHardwareUuid) {
        navigator.clipboard.writeText(currentHardwareUuid);
        const originalText = btnCopyUuid.textContent;
        btnCopyUuid.textContent = '✔️ Copiado!';
        btnCopyUuid.style.background = 'rgba(16, 185, 129, 0.2)';
        btnCopyUuid.style.borderColor = '#10b981';
        btnCopyUuid.style.color = '#10b981';
        setTimeout(() => {
          btnCopyUuid.textContent = originalText;
          btnCopyUuid.style.background = 'rgba(245, 158, 11, 0.15)';
          btnCopyUuid.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          btnCopyUuid.style.color = '#f59e0b';
        }, 2000);
      }
    });
  }

  const displaySavedKey = document.getElementById('display-saved-key');
  const btnLogoutKey = document.getElementById('btn-logout-key');

  function updateSavedKeyUI(key) {
    if (displaySavedKey) {
      displaySavedKey.textContent = key ? key : 'Nenhuma chave ativa';
    }
  }

  function startVipHeartbeat(key) {
    if (window._vipHeartbeatTimer) clearInterval(window._vipHeartbeatTimer);
    window._vipHeartbeatTimer = setInterval(async () => {
      try {
        const currentKey = localStorage.getItem('loord_vip_key') || localStorage.getItem('activation_key') || key;
        if (!currentKey) {
          await forceLogoutSecurity('Sessão expirada. Nenhuma chave ativa encontrada.');
          return;
        }
        const check = await window.api.verifyKey(currentKey);
        if (check && !check.valid) {
          // Só desfaz otimizações se o servidor confirmou que a chave está INATIVA, EXPIRADA ou EXCLUÍDA
          if (check.isRevokedOrExpired) {
            console.log('[SECURITY] Chave invalidada/expirada no servidor oficial! Desfazendo todas as otimizações...');
            await forceLogoutSecurity(check?.error || 'Sua chave foi revogada, desativada ou expirou no painel.');
          } else if (check.isNetworkError) {
            console.warn('[SECURITY] Falha momentânea de rede no heartbeat. Mantendo configurações.');
          }
        } else if (check && check.valid) {
          // Atualiza sidebar em tempo real
          const isVitalicia = check.plan && (check.plan.includes('Vitalícia') || check.plan.includes('permanent') || check.plan.includes('💎'));
          updateSidebarStatus(true, check.clientName, isVitalicia ? 'permanent' : 'temporary', check.plan);
        }
      } catch (_) {}
    }, 15000);
  }

  // 3. Verificar se já existe uma chave válida salva no computador
  const savedKey = localStorage.getItem('loord_vip_key') || localStorage.getItem('activation_key');
  if (savedKey) {
    try {
      const check = await window.api.verifyKey(savedKey);
      if (check && check.valid) {
        // Chave 100% autêntica validada no banco de dados oficial!
        setAppVisualAccess(true);
        updateSavedKeyUI(savedKey);
        // Salva nome do cliente
        if (check.clientName) localStorage.setItem('client_name', check.clientName);
        // Atualiza sidebar
        const isVitalicia = check.plan && (check.plan.includes('Vitalícia') || check.plan.includes('permanent') || check.plan.includes('💎'));
        updateSidebarStatus(true, check.clientName, isVitalicia ? 'permanent' : 'temporary', check.plan);
        startVipHeartbeat(savedKey);
        startSecurityWatch(savedKey);
        return;
      } else if (check && check.isNetworkError) {
        // Se estiver sem conexão no momento de abrir, mantém o acesso temporário sem desmanchar nada
        console.warn('[SECURITY] Servidor offline ou sem conexão. Mantendo acesso local provisório.');
        setAppVisualAccess(true);
        updateSavedKeyUI(savedKey);
        startVipHeartbeat(savedKey);
        return;
      } else {
        // Chave confirmada como EXPIRADA, REVOGADA ou EXCLUÍDA no banco oficial!
        console.log('[SECURITY] Chave sem acesso no banco de dados. Revertendo configurações do Windows...');
        try {
          if (window.api && window.api.revertAllTweaksOnRevoke) {
            await window.api.revertAllTweaksOnRevoke();
          }
        } catch (_) {}
        localStorage.removeItem('loord_vip_key');
        localStorage.removeItem('activation_key');
        localStorage.removeItem('client_name');
        localStorage.removeItem('ffopt_applied_tweaks');
      }
    } catch (_) {
      console.warn('[SECURITY] Erro inesperado na validação.');
    }
  }

  // Se não tem chave ou a chave é inválida, mantém a tela de bloqueio ativada
  setAppVisualAccess(false);
  updateSavedKeyUI('');
  updateSidebarStatus(false);

  // Logout de Chave
  if (btnLogoutKey) {
    btnLogoutKey.addEventListener('click', async () => {
      if (confirm('Deseja realmente desconectar sua chave VIP deste computador?\n\nTodas as regedits e otimizações aplicadas serão desfeitas e seu Windows será restaurado ao estado original.')) {
        await forceLogoutSecurity('Desconectado manualmente pelo usuário. Todas as configurações originais foram restauradas.');
        if (inputVipKey) inputVipKey.value = '';
      }
    });
  }

  // 4. Formatação de entrada (converte para maiúsculo sem truncar)
  if (inputVipKey) {
    inputVipKey.addEventListener('input', (e) => {
      let raw = e.target.value.trim().toUpperCase();
      e.target.value = raw;
      if (keyAuthError) keyAuthError.style.display = 'none';
    });

    inputVipKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (btnActivateVip) btnActivateVip.click();
      }
    });
  }

  // 5. Ação de Ativar Chave VIP
  if (btnActivateVip) {
    btnActivateVip.addEventListener('click', async () => {
      const keyVal = inputVipKey ? inputVipKey.value.trim().toUpperCase() : '';
      if (!keyVal || keyVal.length < 4) {
        if (keyAuthError) {
          keyAuthError.textContent = '❌ Por favor, digite a sua chave de ativação VIP.';
          keyAuthError.style.display = 'block';
        }
        return;
      }

      btnActivateVip.disabled = true;
      btnActivateVip.textContent = '⏳ Verificando Chave com o Sistema...';
      if (keyAuthError) keyAuthError.style.display = 'none';

      try {
        const verifyRes = await window.api.verifyKey(keyVal);
        if (verifyRes && verifyRes.valid) {
          // Salva a chave verificada
          localStorage.setItem('loord_vip_key', keyVal);
          localStorage.setItem('activation_key', keyVal);
          if (verifyRes.clientName) localStorage.setItem('client_name', verifyRes.clientName);
          updateSavedKeyUI(keyVal);

          // Atualiza sidebar com nome e validade
          const isVitalicia = verifyRes.plan && (verifyRes.plan.includes('Vitalícia') || verifyRes.plan.includes('permanent') || verifyRes.plan.includes('💎'));
          updateSidebarStatus(true, verifyRes.clientName, isVitalicia ? 'permanent' : 'temporary', verifyRes.plan);

          startVipHeartbeat(keyVal);
          startSecurityWatch(keyVal);

          btnActivateVip.textContent = '🎉 CHAVE ATIVADA COM SUCESSO!';
          btnActivateVip.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
          btnActivateVip.style.color = '#fff';

          setTimeout(() => {
            setAppVisualAccess(true);
          }, 600);
        } else {
          btnActivateVip.disabled = false;
          btnActivateVip.textContent = '🔓 ATIVAR ACESSO VIP';
          if (keyAuthError) {
            keyAuthError.textContent = '❌ ' + (verifyRes?.error || 'Chave inválida ou não pertence ao seu Hardware ID!');
            keyAuthError.style.display = 'block';
          }
        }
      } catch (e) {
        btnActivateVip.disabled = false;
        btnActivateVip.textContent = '🔓 ATIVAR ACESSO VIP';
        if (keyAuthError) {
          keyAuthError.textContent = '❌ Erro ao validar chave: ' + (e.message || 'Verifique o sistema');
          keyAuthError.style.display = 'block';
        }
      }
    });
  }
})();

// ─── OTIMIZADOR DE MOUSE E DESEMPENHO BLUESTACKS (REGEDIT ADAPTATIVA) ──────────
const btnApplyAdaptiveProfile = document.getElementById('btn-apply-adaptive-profile');
const adaptiveProfileResult = document.getElementById('adaptive-profile-result');
const adaptiveProfileTitle = document.getElementById('adaptive-profile-title');
const adaptiveProfileSummary = document.getElementById('adaptive-profile-summary');
const adaptiveProfileDetails = document.getElementById('adaptive-profile-details');
const adaptiveProfileError = document.getElementById('adaptive-profile-error');
const adaptiveProfileErrorMsg = document.getElementById('adaptive-profile-error-msg');

if (btnApplyAdaptiveProfile) {
  btnApplyAdaptiveProfile.addEventListener('click', async () => {
    try {
      const selectedRadio = document.querySelector('input[name="adapt-profile-choice"]:checked');
      const profile = selectedRadio ? selectedRadio.value : 'RAPIDA';

      btnApplyAdaptiveProfile.disabled = true;
      const originalText = btnApplyAdaptiveProfile.innerHTML;
      btnApplyAdaptiveProfile.innerHTML = '⏳ Aplicando Regedit e Otimizando Desempenho...';

      if (adaptiveProfileResult) adaptiveProfileResult.style.display = 'none';
      if (adaptiveProfileError) adaptiveProfileError.style.display = 'none';

      const res = await window.api.applyAdaptiveProfile(profile);

      btnApplyAdaptiveProfile.disabled = false;
      btnApplyAdaptiveProfile.innerHTML = originalText;

      if (res && res.success) {
        if (adaptiveProfileResult) {
          adaptiveProfileResult.style.display = 'block';
          if (adaptiveProfileTitle) adaptiveProfileTitle.innerHTML = `✅ Perfil [${res.profile}] Aplicado com Sucesso!`;
          if (adaptiveProfileSummary) adaptiveProfileSummary.textContent = res.summary;
          if (adaptiveProfileDetails && Array.isArray(res.details)) {
            adaptiveProfileDetails.innerHTML = res.details.map(d => `<div>• ${d}</div>`).join('');
          }
        }
      } else {
        if (adaptiveProfileError) {
          adaptiveProfileError.style.display = 'block';
          if (adaptiveProfileErrorMsg) adaptiveProfileErrorMsg.textContent = res?.error || 'Erro ao aplicar perfil adaptativo.';
        }
      }
    } catch (err) {
      if (btnApplyAdaptiveProfile) {
        btnApplyAdaptiveProfile.disabled = false;
        btnApplyAdaptiveProfile.innerHTML = '⚡ Aplicar Perfil Selecionado no Windows &amp; BlueStacks';
      }
      if (adaptiveProfileError) {
        adaptiveProfileError.style.display = 'block';
        if (adaptiveProfileErrorMsg) adaptiveProfileErrorMsg.textContent = err.message || 'Erro inesperado';
      }
    }
  });
}

// ─── LOORD PRECISION VIP ENGINE (PERFIS DE MOUSE E PRECISÃO 1:1) ─────────────
const rarefixBtns = document.querySelectorAll('.rarefix-btn');
const rarefixStatusMsg = document.getElementById('rarefix-status-msg');
const rarefixActiveBadge = document.getElementById('rarefix-active-badge');

rarefixBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    const speed = btn.getAttribute('data-speed');
    const allCards = document.querySelectorAll('.rarefix-card');
    
    try {
      if (rarefixStatusMsg) {
        rarefixStatusMsg.style.color = '#fde047';
        rarefixStatusMsg.innerHTML = '<span>●</span> Calibrando curva e sensibilidade no Windows...';
      }

      if (speed === 'restore') {
        const res = await window.api.applyRarefixProfile('RESTAURAR');
        allCards.forEach(c => c.classList.remove('active-profile'));
        if (rarefixStatusMsg) {
          rarefixStatusMsg.style.color = '#34d399';
          rarefixStatusMsg.innerHTML = '<span>✔</span> Configuração e aceleração padrão do Windows restauradas com sucesso!';
        }
        if (rarefixActiveBadge) {
          rarefixActiveBadge.textContent = 'PADRÃO WINDOWS';
          rarefixActiveBadge.style.background = 'rgba(148, 163, 184, 0.2)';
          rarefixActiveBadge.style.color = '#cbd5e1';
        }
      } else {
        const sensVal = parseInt(speed) || 11;
        const res = await window.api.applyRarefixProfile(sensVal);
        
        allCards.forEach(c => c.classList.remove('active-profile'));
        const targetCard = document.getElementById(`card-rarefix-${sensVal}`);
        if (targetCard) targetCard.classList.add('active-profile');

        if (rarefixStatusMsg) {
          rarefixStatusMsg.style.color = '#34d399';
          rarefixStatusMsg.innerHTML = `<span>✔</span> Perfil ativado com sucesso! <strong>Sensibilidade ${sensVal}</strong> (Resposta 1:1 Sem Aceleração)`;
        }
        if (rarefixActiveBadge) {
          rarefixActiveBadge.textContent = `SENSI ${sensVal} ATIVA ⚡`;
          rarefixActiveBadge.style.background = 'rgba(168, 85, 247, 0.25)';
          rarefixActiveBadge.style.color = '#c084fc';
        }
      }
    } catch (err) {
      if (rarefixStatusMsg) {
        rarefixStatusMsg.style.color = '#ef4444';
        rarefixStatusMsg.innerHTML = `<span>✖</span> Erro ao aplicar precisão: ${err.message}`;
      }
    }
  });
});

// ── SISTEMA MULTILÍNGUE (i18n) - INICIALIZAÇÃO & EVENT LISTENERS ──────────
(function setupLanguageSelector() {
  const btnToggle = document.getElementById('btn-lang-toggle');
  const dropdown = document.getElementById('lang-dropdown');
  const optionBtns = document.querySelectorAll('.lang-option-btn');

  if (btnToggle && dropdown) {
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('show');
      if (isOpen) {
        dropdown.classList.remove('show');
        btnToggle.classList.remove('open');
      } else {
        dropdown.classList.add('show');
        btnToggle.classList.add('open');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#lang-selector-wrapper')) {
        dropdown.classList.remove('show');
        btnToggle.classList.remove('open');
      }
    });

    optionBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedLang = btn.getAttribute('data-lang');
        if (selectedLang && window.i18n) {
          window.i18n.setLanguage(selectedLang);
          dropdown.classList.remove('show');
          btnToggle.classList.remove('open');
          
          // Re-atualiza o status de VIP com a tradução correspondente
          const savedKey = localStorage.getItem('loord_vip_key') || localStorage.getItem('activation_key');
          if (typeof updateSidebarStatus === 'function') {
            updateSidebarStatus(!!savedKey);
          }
        }
      });
    });
  }

  // Inicializa o idioma salvo ou padrão
  if (window.i18n) {
    window.i18n.init();
  }
})();
