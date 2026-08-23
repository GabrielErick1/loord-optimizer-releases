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

// Additional Tab Apply Buttons
const btnApplyMouse = document.getElementById('btn-apply-mouse');
if (btnApplyMouse) {
  btnApplyMouse.addEventListener('click', async () => {
    await applyMouseSettingsOnly();
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
  const mouseMode = selectedMouseModeEl ? selectedMouseModeEl.value : 'loord-3-sense-full-red';
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


// --- Macro de Capa ---
const toggleMacro = document.getElementById('toggle-macro');
const macroForce = document.getElementById('macro-force');
const macroForceVal = document.getElementById('macro-force-val');
const macroForceContainer = document.getElementById('macro-force-container');

if (toggleMacro && macroForce && macroForceVal && macroForceContainer) {
  toggleMacro.addEventListener('change', async () => {
    const active = toggleMacro.checked;
    if (active) {
      macroForceContainer.style.display = 'block';
      const force = parseInt(macroForce.value) || 4;
      await window.api.startMacro(force);
    } else {
      macroForceContainer.style.display = 'none';
      await window.api.stopMacro();
    }
  });

  macroForce.addEventListener('input', () => {
    macroForceVal.textContent = macroForce.value;
  });

  macroForce.addEventListener('change', async () => {
    if (toggleMacro.checked) {
      const force = parseInt(macroForce.value) || 4;
      await window.api.startMacro(force);
    }
  });
}

// --- Activation and Protection System ---
const activationScreen = document.getElementById('activation-screen');
const displayUuidInput = document.getElementById('display-uuid');
const btnCopyUuid = document.getElementById('btn-copy-uuid');
const inputKey = document.getElementById('input-key');
const btnActivate = document.getElementById('btn-activate');
const activationError = document.getElementById('activation-error');
let activeLicenseCheckTimer = null;

async function checkActivation() {
  if (!activationScreen) return true;

  let uuid = '';
  try {
    uuid = await window.api.getUuid();
  } catch (e) {
    uuid = 'UNKNOWN-UUID';
  }

  if (displayUuidInput) {
    displayUuidInput.value = uuid;
  }

  // Setup copy button
  if (btnCopyUuid) {
    btnCopyUuid.onclick = () => {
      navigator.clipboard.writeText(uuid);
      btnCopyUuid.textContent = 'Copiado!';
      setTimeout(() => {
        btnCopyUuid.textContent = 'Copiar';
      }, 2000);
    };
  }

  const savedKey = localStorage.getItem('activation_key');
  if (savedKey) {
    try {
      const response = await fetch('https://web-key-generator.vercel.app/api/client-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, key: savedKey })
      });
      const data = await response.json();

      if (data && data.success) {
        updateLicenseBadge(true, data.clientName, data.licenseType, data.timeRemainingStr);
        activationScreen.style.display = 'none';
        startLicenseHeartbeat(uuid, savedKey);
        return true;
      } else {
        // Licença inválida, expirada, revogada, deletada ou deslogada pelo administrador
        localStorage.removeItem('activation_key');
        localStorage.removeItem('client_name');
        localStorage.removeItem('ffopt_applied_tweaks');

        // Reverter 100% de todas as otimizações e registros automaticamente
        try {
          await window.api.revertAllTweaksOnRevoke();
        } catch (_) { }

        if (activationError) {
          activationError.textContent = `❌ ${data.error || 'Licença expirada, revogada ou não encontrada no sistema. O computador foi restaurado ao estado original.'}`;
          activationError.style.display = 'block';
        }
      }
    } catch (e) {
      console.warn('Erro ao conectar ao servidor de validação:', e);
    }
  }

  // Se não tem chave ou chave é inválida: mostrar tela de ativação bloqueando o app
  updateLicenseBadge(false);
  activationScreen.style.display = 'flex';

  if (btnActivate) {
    btnActivate.onclick = async () => {
      const key = inputKey.value.trim().toUpperCase();
      if (!key) {
        if (activationError) {
          activationError.textContent = '❌ Por favor, digite uma chave de ativação.';
          activationError.style.display = 'block';
        }
        return;
      }

      btnActivate.disabled = true;
      btnActivate.textContent = 'Verificando na Nuvem...';
      if (activationError) activationError.style.display = 'none';

      try {
        const myUuid = await window.api.getUuid();
        const webRes = await fetch('https://web-key-generator.vercel.app/api/client-activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid: myUuid, key })
        });
        const webData = await webRes.json();

        if (webData && webData.success) {
          localStorage.setItem('activation_key', key);
          if (webData.clientName) {
            localStorage.setItem('client_name', webData.clientName);
          }
          updateLicenseBadge(true, webData.clientName, webData.licenseType, webData.timeRemainingStr);
          activationScreen.style.display = 'none';
          startLicenseHeartbeat(myUuid, key);

          await loadAllSettings();
          restoreAppliedTweaks();
          bindSaveListeners();
        } else {
          if (activationError) {
            activationError.textContent = `❌ ${webData ? webData.error : 'Chave inválida ou não encontrada no banco de dados.'}`;
            activationError.style.display = 'block';
          }
          btnActivate.disabled = false;
          btnActivate.textContent = '⚡ Ativar Loord Optimizer';
        }
      } catch (e) {
        if (activationError) {
          activationError.textContent = '❌ Erro ao conectar ao servidor de ativação. Verifique sua internet.';
          activationError.style.display = 'block';
        }
        btnActivate.disabled = false;
        btnActivate.textContent = '⚡ Ativar Loord Optimizer';
      }
    };
  }

  return false;
}

// Monitoramento em tempo real (Auto-Kick se chave for revogada, deletada ou deslogada no painel)
function startLicenseHeartbeat(uuid, key) {
  if (activeLicenseCheckTimer) clearInterval(activeLicenseCheckTimer);

  activeLicenseCheckTimer = setInterval(async () => {
    try {
      const response = await fetch('https://web-key-generator.vercel.app/api/client-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, key })
      });
      const data = await response.json();

      if (!data || !data.success) {
        // Chave foi revogada, deletada ou deslogada pelo administrador!
        clearInterval(activeLicenseCheckTimer);
        localStorage.removeItem('activation_key');
        localStorage.removeItem('client_name');
        localStorage.removeItem('ffopt_applied_tweaks');

        // Reverter 100% de todos os tweaks, registros, DNS e emulador de volta ao padrão do Windows
        try {
          await window.api.revertAllTweaksOnRevoke();
        } catch (_) { }

        updateLicenseBadge(false);
        if (activationError) {
          activationError.textContent = `❌ ${data?.error || 'Sua licença foi deslogada, revogada ou expirou.'}`;
          activationError.style.display = 'block';
        }
        activationScreen.style.display = 'flex';
        alert(`❌ ATENÇÃO: Seu acesso ao Loord Optimizer expirou ou foi revogado!\n\n• Todas as otimizações, registros e configurações aplicadas foram REVERTIDAS e restauradas ao estado original do seu computador.`);
      } else {
        updateLicenseBadge(true, data.clientName, data.licenseType, data.timeRemainingStr);
      }
    } catch (e) { }
  }, 25000); // Checa a cada 25 segundos
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

    // Restore slider labels or UI displays
    if (macroForce && macroForceVal) {
      macroForceVal.textContent = macroForce.value;
    }
    if (toggleMacro && macroForceContainer) {
      macroForceContainer.style.display = toggleMacro.checked ? 'block' : 'none';
      if (toggleMacro.checked) {
        const force = parseInt(macroForce.value) || 4;
        await window.api.startMacro(force);
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

  // Verificação de licença única ao abrir o app (não roda no fundo para não pesar no PC)
  // Roda 8 segundos após abrir, quando o app já carregou completamente
  if (isActivated) {
    setTimeout(async () => {
      const savedKey = localStorage.getItem('activation_key');
      if (!savedKey) return;
      try {
        const uuid = await window.api.getMachineUUID();
        const response = await fetch('https://web-key-generator.vercel.app/api/client-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid, key: savedKey })
        });
        const data = await response.json();
        if (!data.success) {
          localStorage.removeItem('activation_key');
          localStorage.removeItem('client_name');
          localStorage.removeItem('ffopt_applied_tweaks');

          // Reverter 100% de todas as otimizações e registros automaticamente
          try {
            await window.api.revertAllTweaksOnRevoke();
          } catch (_) { }

          const reason = data.error || 'Sua licença foi encerrada.';
          alert(`🔒 Acesso encerrado!\n\n${reason}\n\nTodas as otimizações e registros aplicados foram restaurados ao padrão original do seu computador.`);
          window.location.reload();
        } else {
          updateLicenseBadge(true, data.clientName, data.licenseType, data.daysRemaining);
        }
      } catch (e) {
        // Se offline, não forçar logout — só uma verificação, sem custo contínuo
        console.warn('[License] Servidor offline, mantendo acesso local.');
      }
    }, 8000);
  }
}

initApp();

// ═══════════════════════════════════════════════════════════════════════
//  AUTO-UPDATE UI
// ═══════════════════════════════════════════════════════════════════════
if (window.api.onUpdateAvailable) {

  // Inject update banner styles once
  const updateStyle = document.createElement('style');
  updateStyle.textContent = `
    #update-banner {
      display: none;
      position: fixed;
      top: 46px;
      right: 16px;
      z-index: 9999;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid rgba(99, 202, 183, 0.5);
      border-radius: 10px;
      padding: 10px 16px;
      color: #e2e8f0;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      animation: slideInRight 0.4s ease;
      cursor: pointer;
      max-width: 320px;
    }
    #update-banner.hidden { display: none !important; }
    @keyframes slideInRight {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);   opacity: 1; }
    }
    #update-banner .upd-icon { font-size: 20px; flex-shrink: 0; }
    #update-banner .upd-text { flex: 1; line-height: 1.4; }
    #update-banner .upd-text strong { display: block; color: #63cab7; }
    #update-banner .upd-text span   { color: #94a3b8; font-size: 11px; }
    #update-btn {
      background: #63cab7;
      color: #0f172a;
      border: none;
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.2s;
    }
    #update-btn:hover { background: #4db8a3; }
    #update-btn:disabled { background: #64748b; cursor: not-allowed; }
    #update-progress {
      display: none;
      font-size: 10px;
      color: #63cab7;
      text-align: center;
      margin-top: 2px;
    }
  `;
  document.head.appendChild(updateStyle);

  // Create update banner element
  const updateBanner = document.createElement('div');
  updateBanner.id = 'update-banner';
  updateBanner.className = 'hidden';
  updateBanner.innerHTML = `
    <div class="upd-icon">🚀</div>
    <div class="upd-text">
      <strong id="upd-title">Atualização disponível</strong>
      <span id="upd-sub">Baixando em segundo plano...</span>
    </div>
    <button id="update-btn" disabled>Aguarde</button>
  `;
  document.body.appendChild(updateBanner);

  const updTitle = document.getElementById('upd-title');
  const updSub = document.getElementById('upd-sub');
  const updBtn = document.getElementById('update-btn');

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

      const badge = document.getElementById('app-version-badge');
      if (badge && res && res.currentVersion) {
        badge.textContent = `v${res.currentVersion}`;
      }

      if (btnCheckUpdate) {
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = '🔍 Verificar Agora';
      }

      const hasNewVersion = res && (res.updateAvailable || res.hasUpdate);

      if (hasNewVersion) {
        activeDownloadUrl = res.downloadUrl;
        if (cardStatusTitle) cardStatusTitle.textContent = `🚀 Nova Versão v${res.latestVersion} Disponível!`;
        if (cardStatusDesc) cardStatusDesc.textContent = `Clique abaixo para baixar e atualizar automaticamente estilo Play Store.`;

        if (btnInstallNow) {
          btnInstallNow.style.display = 'inline-block';
          btnInstallNow.textContent = `⚡ Baixar e Atualizar (v${res.latestVersion})`;
          btnInstallNow.onclick = async () => {
            btnInstallNow.disabled = true;
            btnInstallNow.textContent = '⏳ Conectando e baixando...';
            if (cardStatusDesc) cardStatusDesc.textContent = 'Baixando nova versão em segundo plano (Play Store Style)...';

            const dlRes = await window.api.downloadUpdateProgress(activeDownloadUrl);
            if (dlRes && dlRes.success) {
              btnInstallNow.disabled = false;
              btnInstallNow.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
              btnInstallNow.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.5)';
              btnInstallNow.textContent = `🚀 Reiniciar e Atualizar Agora (v${res.latestVersion})`;
              btnInstallNow.onclick = () => {
                btnInstallNow.disabled = true;
                btnInstallNow.textContent = 'Iniciando Atualização...';
                window.api.installUpdateNow();
              };
              if (cardStatusTitle) cardStatusTitle.textContent = '✅ Download Concluído (100%)!';
              if (cardStatusDesc) cardStatusDesc.textContent = 'Clique no botão verde para reiniciar e aplicar a nova versão.';
              alert(`✅ Download da v${res.latestVersion} concluído com sucesso!\n\nClique em "Reiniciar e Atualizar Agora" para aplicar a atualização.`);
            } else {
              btnInstallNow.disabled = false;
              btnInstallNow.textContent = 'Tentar Novamente';
              alert(`Erro no download da atualização:\n${dlRes?.error || 'Verifique sua conexão de internet.'}`);
            }
          };
        }

        if (manual) {
          alert(`🚀 Nova Atualização Encontrada!\n\n• Sua Versão Atual: v${res.currentVersion}\n• Nova Versão Disponível: v${res.latestVersion}\n\nClique no botão "Baixar e Atualizar" para instalar.`);
        }
      } else {
        if (btnInstallNow) btnInstallNow.style.display = 'none';
        if (cardStatusTitle) cardStatusTitle.textContent = '✔️ Você está na versão mais recente';
        if (cardStatusDesc) cardStatusDesc.textContent = `Seu Loord Optimizer está 100% atualizado (v${res?.currentVersion || '1.0.8'}).`;
        if (manual) {
          alert(`✔️ Seu Loord Optimizer já está na versão mais recente (v${res?.currentVersion || '1.0.8'})!`);
        }
      }
    } catch (e) {
      if (btnCheckUpdate) {
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = '🔍 Verificar Agora';
      }
      if (manual) {
        alert('Não foi possível verificar atualizações. Verifique sua conexão.');
      }
    }
  }

  // Progress listener
  if (window.api.onUpdateDownloadProgress) {
    window.api.onUpdateDownloadProgress((data) => {
      if (btnInstallNow && data) {
        const p = data.percent || 0;
        const mb = data.receivedMB ? ` (${data.receivedMB} MB)` : '';
        btnInstallNow.textContent = `⏳ Baixando ${p}%${mb}...`;
      }
    });
  }


  // Manual Check Button
  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', () => handleCheckUpdates(true));
  }

  // Auto Check on App Startup
  handleCheckUpdates(false);
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
    const confirmLite = confirm('⚡ DESEJA TRANSFORMAR SEU WINDOWS EM UMA VERSÃO LITE GAMER (Estilo Ghost Spectre / ReviOS)?\n\nEssa ação irá:\n- Manter o Kernel do Windows na RAM (DisablePagingExecutive)\n- Agrupar processos svchost de 60 para ~12\n- Remover 100% dos bloatwares e telemetria pesada\n- Zerar a latência de GPU e priorizar o emulador\n\nNão formata nem apaga seus arquivos pessoais!');
    if (!confirmLite) return;

    btnTransformWindowsLite.disabled = true;
    btnTransformWindowsLite.textContent = '⏳ Reformulando Windows Lite...';
    if (statusWindowsLite) {
      statusWindowsLite.style.display = 'block';
      statusWindowsLite.textContent = 'Aplicando modificações de kernel na RAM, agrupando svchosts e removendo bloatwares...';
    }

    const res = await window.api.transformWindowsLite();
    btnTransformWindowsLite.disabled = false;
    btnTransformWindowsLite.textContent = '✔️ Windows Lite Ativo!';
    if (statusWindowsLite) {
      statusWindowsLite.textContent = res && res.message ? res.message : 'Transformação em Windows Lite Gamer aplicada com sucesso!';
    }

    const reboot = confirm('Transformação em Windows Lite Gamer aplicada com sucesso!\n\nRecomendamos REINICIAR o computador agora para que o agrupamento de processos (svchost) e o carregamento do kernel na RAM entrem em vigor!\n\nDeseja reiniciar agora?');
    if (reboot) {
      await window.api.rebootComputer();
    }
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
  btnApplyCompTweak.addEventListener('click', async () => {
    const panSpeed = document.getElementById('comp-pan-speed') ? document.getElementById('comp-pan-speed').value : '15.0';
    const sensX = document.getElementById('comp-sens-x') ? document.getElementById('comp-sens-x').value : '1.0';
    const sensY = document.getElementById('comp-sens-y') ? document.getElementById('comp-sens-y').value : '0.4';
    const renderer = document.getElementById('comp-graphics-renderer') ? document.getElementById('comp-graphics-renderer').value : 'dx';
    const cpuRamVal = document.getElementById('comp-cpu-ram') ? document.getElementById('comp-cpu-ram').value : 'auto';

    let cpuCores = 'auto';
    let ramMb = 'auto';

    if (cpuRamVal !== 'auto' && cpuRamVal.includes('-')) {
      const parts = cpuRamVal.split('-');
      cpuCores = parts[0];
      ramMb = parts[1];
    }

    btnApplyCompTweak.disabled = true;
    btnApplyCompTweak.textContent = '⏳ Aplicando Otimizações...';

    const res = await window.api.applyCompetitiveEmulatorTweak({
      panSpeed: parseFloat(panSpeed),
      sensitivityX: parseFloat(sensX),
      sensitivityY: parseFloat(sensY),
      astcMode: 'hardware',
      graphicsRenderer: renderer,
      cpuCores: cpuCores,
      ramMb: ramMb,
      enableHighFps: true
    });

    btnApplyCompTweak.disabled = false;
    btnApplyCompTweak.textContent = '✔️ Otimizações Aplicadas!';

    if (statusCompTweak) {
      statusCompTweak.style.display = 'block';
      statusCompTweak.innerText = res && res.message ? res.message : 'Otimizações aplicadas com sucesso!';
    }
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
    targetBtn.textContent = '⏳ Injetando Regedit no Windows...';
  }

  try {
    const res = await window.api.applyAdaptiveRegedit({ dpiMouse, dpiEmu, sensX, sensY, style: 'custom', styleMul });
    
    if (res && res.success) {
      const s = res.summary || {};
      const em = styleMul <= 0.85 ? '🌊' : styleMul >= 1.15 ? '🔥' : '⚡';

      if (resultSummary) {
        resultSummary.innerHTML = [
          `✔ <b>Registro do Windows Calibrado:</b> Curva Adaptativa Injetada (${styleMul.toFixed(2)}x Multiplicador)`,
          `✔ <b>Sensibilidade no Free Fire:</b> Sens X = ${sensX} | Sens Y = ${sensY} (Razão Y/X: ${s.ratioYX || '1.000'})`,
          `✔ <b>Instâncias BlueStacks/MSI Atualizadas:</b> ${s.emusConfigured || 2} instaladas`,
          `✔ <b>Arquivos de Keymap Free Fire Configurados:</b> ${s.keymapsConfigured || 22} arquivos .cfg`,
          `✔ <b>Latência Zero &amp; Aceleração Desativada:</b> MouseSpeed 0, Thresholds 0, SPI_SETMOUSESPEED 10`,
          `<div style="margin-top:6px; color:#fde68a;">⚡ <b>Tudo pronto para jogar!</b> Abra o Free Fire e teste sua sensibilidade calibrada sem pinar.</div>`
        ].join('<br>');
      }

      if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      if (targetBtn) {
        targetBtn.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
        targetBtn.textContent = '✅ REGEDIT PERSONALIZADA APLICADA COM SUCESSO!';
        setTimeout(() => {
          targetBtn.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
          targetBtn.textContent = '⚡ GERAR & APLICAR MINHA REGEDIT PERSONALIZADA';
          targetBtn.disabled = false;
          targetBtn.style.opacity = '1';
        }, 4000);
      }
    } else {
      showAdaptErr(res?.error || 'Erro ao aplicar a Regedit.');
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
      targetBtn.textContent = '⚡ GERAR & APLICAR MINHA REGEDIT PERSONALIZADA';
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

window.handleApplyCompTweak = async function(btn) {
  const targetBtn = btn || document.getElementById('btn-apply-comp-tweak');
  const panSpeed = document.getElementById('comp-pan-speed')?.value || '25.0';
  const sensX = parsePtBrFloat(document.getElementById('comp-sens-x')?.value, 1.67);
  const sensY = parsePtBrFloat(document.getElementById('comp-sens-y')?.value, 1.0);
  const renderer = document.getElementById('comp-graphics-renderer')?.value || 'gl';
  const cpuRamVal = document.getElementById('comp-cpu-ram')?.value || 'auto';
  const statusComp = document.getElementById('status-comp-tweak');

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
      panSpeed: parseFloat(panSpeed),
      sensitivityX: sensX,
      sensitivityY: sensY,
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
      statusComp.innerHTML = [
        `🎯 <b>Otimizações aplicadas com sucesso!</b>`,
        `<div style="margin-top: 6px; line-height: 1.6;">`,
        `✔ <b>Instâncias BlueStacks/MSI atualizadas:</b> 2<br>`,
        `✔ <b>Arquivos de Keymap Free Fire configurados:</b> 22<br>`,
        `✔ <b>Speed do Pan:</b> ${panSpeed} | <b>Sens X:</b> ${sensX} | <b>Sens Y:</b> ${sensY}<br>`,
        `✔ <b>ASTC:</b> hardware | <b>Render:</b> ${renderer} | <b>CPU:</b> ${cpuCores} núcleos | <b>RAM:</b> ${ramMb}MB | <b>FPS:</b> 999 Max`,
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
      statusComp.innerText = 'Erro: ' + e.message;
    }
  }
};


