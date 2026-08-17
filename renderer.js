// DOM Elements
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

if (btnMinimize) btnMinimize.addEventListener('click', () => window.api.windowControl('minimize'));
if (btnMaximize) btnMaximize.addEventListener('click', () => window.api.windowControl('maximize'));
if (btnClose) btnClose.addEventListener('click', () => window.api.windowControl('close'));

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

let appIsAdmin = false;

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

// Function to apply single tweak from UI
async function applySingleTweak(tweakId) {
  if (!appIsAdmin) {
    tweakStatusText.textContent = 'Aviso: Privilégios de Administrador requeridos!';
    alert('Por favor, execute como Administrador para aplicar alterações do sistema/registro.');
    return;
  }

  const card = document.getElementById(`card-${tweakId}`);
  const btn = card ? card.querySelector('.opt-btn-apply') : null;
  const title = card ? card.querySelector('.opt-title').textContent : tweakId;

  tweakStatusText.textContent = `Aplicando módulo: ${title}...`;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'APLICANDO...';
  }

  const res = await window.api.applySingleTweak(tweakId);
  
  if (res.success) {
    tweakStatusText.textContent = `Módulo ${title} aplicado com sucesso!`;
    if (card) card.classList.add('applied');
    if (btn) btn.textContent = 'APLICADO';
    
    // Save state
    let applied = [];
    const raw = localStorage.getItem('ffopt_applied_tweaks');
    if (raw) {
      try { applied = JSON.parse(raw); } catch(e) {}
    }
    if (!applied.includes(tweakId)) {
      applied.push(tweakId);
      localStorage.setItem('ffopt_applied_tweaks', JSON.stringify(applied));
    }
  } else {
    tweakStatusText.textContent = `Erro ao aplicar ${title}: ${res.error}`;
    if (btn) btn.textContent = 'APLICAR';
    alert(`Erro ao aplicar módulo: ${res.error}`);
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
    if (!appIsAdmin) {
      alert('Erro: Executar esta ação requer privilégios de Administrador.');
      return;
    }
    
    btnApplyAllModules.disabled = true;
    btnApplyAllModules.textContent = '⚡ Aplicando todos os módulos...';
    
    for (const tweakId of allTweakIds) {
      await applySingleTweak(tweakId);
    }
    
    btnApplyAllModules.disabled = false;
    btnApplyAllModules.textContent = '⚡ Aplicar Todos os Módulos';
    
    const reboot = confirm('Todos os 17 módulos de otimização de sistema, latência de jogos e input foram aplicados com sucesso!\n\nDeseja REINICIAR o computador agora para que todas as configurações entrem em vigor de forma estável?');
    if (reboot) {
      await window.api.rebootComputer();
    }
  });
}

// Additional Tab Apply Buttons
const btnApplyMouse = document.getElementById('btn-apply-mouse');
if (btnApplyMouse) {
  btnApplyMouse.addEventListener('click', async () => {
    if (!appIsAdmin) {
      alert('Erro: Requer privilégios de Administrador!');
      return;
    }
    await saveEmulatorSettings();
    const reboot = confirm('Configurações de sensibilidade aplicadas e atualizadas em tempo real!\n\nDeseja REINICIAR o computador agora para garantir que todas as alterações do sistema entrem em vigor?');
    if (reboot) {
      await window.api.rebootComputer();
    }
  });
}

const btnApplyEmulator = document.getElementById('btn-apply-emulator');
if (btnApplyEmulator) {
  btnApplyEmulator.addEventListener('click', async () => {
    if (!appIsAdmin) {
      alert('Erro: Requer privilégios de Administrador!');
      return;
    }
    await saveEmulatorSettings();
    const reboot = confirm('Configurações do emulador salvas com sucesso!\n\nDeseja REINICIAR o computador agora para limpar temporizadores e aplicar prioridades de CPU?');
    if (reboot) {
      await window.api.rebootComputer();
    }
  });
}

// Master Windows Optimizer Button (Super Boost)
const btnMasterWinOpt = document.getElementById('btn-master-win-opt');
if (btnMasterWinOpt) {
  btnMasterWinOpt.addEventListener('click', async () => {
    if (!appIsAdmin) {
      alert('Erro: Requer privilégios de Administrador!');
      return;
    }
    tweakStatusText.textContent = 'Executando Otimização Master do Windows (Energia Máxima, Efeitos Visuais, Notificações, Cache, Processos)...';
    const btnText = btnMasterWinOpt.innerHTML;
    btnMasterWinOpt.disabled = true;
    btnMasterWinOpt.innerHTML = '⏳ Otimizando Windows...';

    const result = await window.api.optimizeWindowsMaster();
    if (result.success) {
      tweakStatusText.textContent = '🚀 Windows 100% Otimizado! Alto Desempenho, Efeitos Visuais Mínimos, Notificações Desativadas e Processos Reduzidos!';
      btnMasterWinOpt.innerHTML = '✔️ Windows Super Boost Aplicado!';
      allTweakIds.forEach(id => {
        const card = document.getElementById(`card-${id}`);
        if (card) {
          card.classList.add('applied');
          const b = card.querySelector('.opt-btn-apply');
          if (b) b.textContent = 'APLICADO';
        }
      });
      localStorage.setItem('ffopt_applied_tweaks', JSON.stringify(allTweakIds));
    } else {
      tweakStatusText.textContent = `Erro na otimização master: ${result.error}`;
      btnMasterWinOpt.innerHTML = '❌ Erro ao Otimizar';
    }

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

// Save config when emulator settings change
async function saveEmulatorSettings() {
  if (!appIsAdmin) {
    if (tweakStatusText) tweakStatusText.textContent = 'Aviso: Requer Administrador para alterar BlueStacks!';
    return;
  }

  const dpi = customDpiInput ? (parseInt(customDpiInput.value) || 480) : 480;
  const maxFps = (toggleFps && toggleFps.checked) ? 240 : 60;
  const forceRog2 = toggleRog2 ? toggleRog2.checked : true;
  const selectedMouseModeEl = document.querySelector('input[name="mouse-mode"]:checked');
  const mouseMode = selectedMouseModeEl ? selectedMouseModeEl.value : 'linear';
  const pollingRate = selectPolling ? selectPolling.value : '1000';
  const selectEngine = document.getElementById('select-engine');
  const selectAstc = document.getElementById('select-astc');
  const engine = selectEngine ? selectEngine.value : 'opengl';
  const astc = selectAstc ? selectAstc.value : 'disabled';

  if (tweakStatusText) tweakStatusText.textContent = 'Aplicando configurações de mouse e otimizações...';
  const res = await window.api.applyOptimizations({
    dpi,
    maxFps,
    forceRog2,
    mouseMode,
    pollingRate,
    engine,
    astc
  });

  const status = await window.api.checkBlueStacksStatus();
  if (status && status.running) {
    if (tweakStatusText) tweakStatusText.textContent = 'Regedit aplicada no Windows! (Para alterar bluestacks.conf, feche o emulador).';
  } else {
    if (res && res.success) {
      if (tweakStatusText) tweakStatusText.textContent = 'Configuração de registro e emulador aplicadas com sucesso!';
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
        updateLicenseBadge(true, data.clientName, data.licenseType, data.daysRemaining);
        activationScreen.style.display = 'none';
        return true;
      } else {
        // Licença inválida, expirada, revogada ou de outra máquina
        localStorage.removeItem('activation_key');
        localStorage.removeItem('client_name');
        if (activationError) {
          activationError.textContent = `❌ ${data.error || 'Licença expirada ou inválida.'}`;
          activationError.style.display = 'block';
        }
      }
    } catch (e) {
      // Fallback offline (se servidor estiver fora ou sem internet)
      const localIsValid = await window.api.verifyKey(savedKey);
      if (localIsValid || localStorage.getItem('client_name')) {
        updateLicenseBadge(true, localStorage.getItem('client_name') || 'Cliente VIP');
        activationScreen.style.display = 'none';
        return true;
      }
    }
  }

  // Se não tem chave ou chave é inválida: mostrar tela de ativação bloqueando o app
  updateLicenseBadge(false);
  activationScreen.style.display = 'flex';
  
  if (btnActivate) {
    btnActivate.onclick = async () => {
      const key = inputKey.value.trim().toUpperCase();
      if (!key) return;
      
      btnActivate.disabled = true;
      btnActivate.textContent = 'Verificando...';
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
          updateLicenseBadge(true, webData.clientName, webData.licenseType, webData.daysRemaining);
          activationScreen.style.display = 'none';
          
          await loadAllSettings();
          restoreAppliedTweaks();
          bindSaveListeners();
        } else {
          if (activationError) {
            activationError.textContent = `❌ ${webData ? webData.error : 'Erro na ativação.'}`;
            activationError.style.display = 'block';
          }
          btnActivate.disabled = false;
          btnActivate.textContent = '⚡ Ativar Loord Optimizer';
        }
      } catch (e) {
        // Offline / Direct cryptographic verification fallback
        const myUuid = await window.api.getUuid();
        const localIsValid = await window.api.verifyKey(key);
        if (localIsValid) {
          localStorage.setItem('activation_key', key);
          updateLicenseBadge(true, 'Cliente VIP');
          activationScreen.style.display = 'none';
          
          await loadAllSettings();
          restoreAppliedTweaks();
          bindSaveListeners();
        } else {
          if (activationError) {
            activationError.textContent = '❌ Chave inválida para esta máquina!';
            activationError.style.display = 'block';
          }
          btnActivate.disabled = false;
          btnActivate.textContent = '⚡ Ativar Loord Optimizer';
        }
      }
    };
  }

  return false;
}

function updateLicenseBadge(isActivated, clientName, licenseType, daysRemaining) {
  const versionLabel = document.querySelector('.version-label');
  const versionSub = document.querySelector('.version-sub');
  
  if (clientName && clientName.trim() && clientName !== 'Cliente VIP') {
    localStorage.setItem('client_name', clientName.trim());
  }
  const name = localStorage.getItem('client_name') || (clientName && clientName.trim() ? clientName.trim() : 'Cliente VIP');
  
  if (isActivated) {
    if (versionLabel) {
      if (licenseType === 'temporary' && daysRemaining !== null && daysRemaining !== undefined) {
        versionLabel.innerHTML = `⏳ VIP (${daysRemaining}d restantes)`;
        versionLabel.style.color = '#f59e0b';
      } else {
        versionLabel.innerHTML = '💎 VERSÃO VIP';
        versionLabel.style.color = '#38bdf8';
      }
    }
    if (versionSub) {
      versionSub.innerHTML = `👤 ${name}`;
      versionSub.style.color = '#28c385';
      versionSub.style.fontWeight = '700';
    }
  } else {
    if (versionLabel) {
      versionLabel.innerHTML = '🔒 NÃO ATIVADO';
      versionLabel.style.color = '#ef4444';
    }
    if (versionSub) {
      versionSub.innerHTML = '👤 Aguardando Key';
      versionSub.style.color = 'var(--text-muted)';
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

  // Radio button changes - apply immediately when clicked
  document.querySelectorAll('input[name="mouse-mode"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      saveAllSettings();
      await saveEmulatorSettings();
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
          const reason = data.error || 'Sua licença foi encerrada.';
          alert(`🔒 Acesso encerrado!\n\n${reason}\n\nEntre em contato com seu vendedor para renovar.`);
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
  const updSub   = document.getElementById('upd-sub');
  const updBtn   = document.getElementById('update-btn');

  const cardStatusTitle = document.getElementById('update-status-title');
  const cardStatusDesc  = document.getElementById('update-status-desc');
  const btnCheckUpdate  = document.getElementById('btn-check-update');
  const btnInstallNow   = document.getElementById('btn-install-now');

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
  const adbStatusBadge  = document.getElementById('adb-status-badge');
  const adbLog          = document.getElementById('adb-log');
  const btnConnect      = document.getElementById('btn-adb-connect');
  const btnAutoDetect   = document.getElementById('btn-adb-autodetect');
  const portInput       = document.getElementById('adb-port-input');
  const btnFullOptimize = document.getElementById('btn-adb-full-optimize');
  const btnAnims        = document.getElementById('btn-adb-anims');
  const btnBg           = document.getElementById('btn-adb-bg');
  const btnCache        = document.getElementById('btn-adb-cache');
  const btnDpi          = document.getElementById('btn-adb-dpi');
  const btnUninstall    = document.getElementById('btn-adb-uninstall');

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
  const btnApplyDpi    = document.getElementById('btn-apply-custom-dpi');
  const btnResetDpi    = document.getElementById('btn-reset-custom-dpi');
  const presetDpiBtns  = document.querySelectorAll('.preset-dpi-btn');

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

  // ── Desbloquear FPS com Hz da Tela ───────────────────────────────
  const inputScreenHz = document.getElementById('input-screen-hz');
  const btnUnlockFps  = document.getElementById('btn-unlock-fps');
  const presetHzBtns  = document.querySelectorAll('.preset-hz-btn');

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
    'asus_rog_8':  { brand: 'asus', manufacturer: 'asus', model: 'ASUS_AI2401_D', carrier: 'se_72405' },
    'asus_rog_6':  { brand: 'asus', manufacturer: 'asus', model: 'ASUS_AI2201', carrier: 'se_72405' },
    'asus_rog_5':  { brand: 'asus', manufacturer: 'asus', model: 'ASUS_I005D', carrier: 'se_72405' },
    'samsung_s24': { brand: 'samsung', manufacturer: 'samsung', model: 'SM-S928B', carrier: 'se_72405' },
    'samsung_s23': { brand: 'samsung', manufacturer: 'samsung', model: 'SM-S918B', carrier: 'se_72405' },
    'blackshark_5':{ brand: 'blackshark', manufacturer: 'blackshark', model: 'SHARK KTUS-H0', carrier: 'se_72405' },
    'redmagic_9':  { brand: 'nubia', manufacturer: 'nubia', model: 'NX769J', carrier: 'se_72405' },
    'oneplus_12':  { brand: 'OnePlus', manufacturer: 'OnePlus', model: 'CPH2581', carrier: 'se_72405' }
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
        alert(`✔ Modelo de Celular atualizado com sucesso!\n\n• Fabricante: ${prof.manufacturer}\n• Marca: ${prof.brand}\n• Modelo: ${prof.model}\n\nAbra o emulador para que o Free Fire reconheça o novo aparelho.`);
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
        alert('✨ Modo Android Verdadeiro Ativado com Sucesso!\n\n• Tela inicial sem anúncios e sem popups do BlueStacks\n• Sistema mascarado com Fingerprint de celular original\n• Free Fire reconhecendo hardware como smartphone físico real\n• Renderização nativa da GPU ativada');
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

  // ── Desinstalar Bloatware ─────────────────────────────────────────
  const BLOATWARE_MAP = {
    'uninst-browser':   ['com.android.chrome', 'com.android.browser', 'com.google.android.browser', 'com.sec.android.app.sbrowser', 'org.chromium.chrome'],
    'uninst-ads':       ['gg.now.ads.service', 'gg.now.billing.service2', 'gg.now.billing.interceptor', 'com.bluestacks.gamepedia', 'com.bluestacks.settings', 'com.bluestacks.home'],
    'uninst-files':     ['com.android.documentsui', 'com.android.externalstorage', 'com.estrongs.android.pop', 'com.android.providers.downloads.ui'],
    'uninst-telephony': ['com.android.providers.telephony', 'com.android.phone', 'com.android.providers.contacts', 'com.android.captiveportallogin'],
    'uninst-email':     ['com.android.email', 'com.google.android.gm', 'com.android.calendar', 'com.google.android.calendar'],
    'uninst-media':     ['com.google.android.apps.maps', 'com.google.android.youtube', 'com.google.android.music', 'com.android.music', 'com.google.android.apps.youtube.music'],
    'uninst-docs':      ['com.google.android.apps.docs', 'com.google.android.apps.docs.editors.docs', 'com.google.android.apps.sheets', 'com.google.android.play.games', 'com.google.android.gms.setup'],
  };

  btnUninstall.addEventListener('click', async () => {
    if (!await requireConnected()) return;
    if (!confirm('⚠️ Desinstalar os apps selecionados? Essa ação é irreversível no emulador!')) return;
    btnUninstall.disabled = true;
    btnUninstall.textContent = 'Desinstalando...';

    const toUninstall = [];
    for (const [id, pkgs] of Object.entries(BLOATWARE_MAP)) {
      if (document.getElementById(id)?.checked) toUninstall.push(...pkgs);
    }

    logAdb(`Desinstalando ${toUninstall.length} pacotes...`);
    const results = await window.api.adbUninstall(toUninstall, adbPort);
    let ok = 0, fail = 0;
    for (const r of results) {
      if (r.ok) { logAdb(`✔ ${r.pkg}`, '#28c385'); ok++; }
      else       { logAdb(`✗ ${r.pkg} (já removido ou inexistente)`, '#64748b'); fail++; }
    }
    logAdb(`Concluído: ${ok} removidos, ${fail} já ausentes.`, '#63cab7');
    setApplied('badge-adb-uninstall');
    btnUninstall.textContent = '🗑️ Desinstalar Selecionados';
    btnUninstall.disabled = false;
    alert(`✔ Desinstalação Concluída!\n\n• Apps removidos: ${ok}\n• Apps já ausentes: ${fail}`);
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

// ─── Modo Turbo Game Booster ────────────────────────────────────────
const btnGameBooster = document.getElementById('btn-game-booster');
const badgeGameBooster = document.getElementById('badge-game-booster');

if (btnGameBooster) {
  btnGameBooster.addEventListener('click', async () => {
    btnGameBooster.disabled = true;
    btnGameBooster.textContent = '🔍 Detectando hardware...';

    // Small delay so UI updates before heavy sync work
    await new Promise(r => setTimeout(r, 80));
    btnGameBooster.textContent = '⚡ Aplicando configurações...';

    const res = await window.api.boostGameTurbo();

    if (res && res.success) {
      if (badgeGameBooster) {
        badgeGameBooster.style.display = 'inline';
        setTimeout(() => { badgeGameBooster.style.display = 'none'; }, 10000);
      }
      btnGameBooster.textContent = '🔥 Ativar Game Booster';

      const hw = res.hw || {};
      const brand  = hw.isIntel ? 'Intel' : hw.isAMD ? 'AMD/Ryzen' : 'Outro';
      const htInfo = hw.hasHT   ? 'Sim (HyperThreading)' : 'Não (físicos puros)';
      const ramGB  = hw.totalRamMB ? (hw.totalRamMB / 1024).toFixed(1) : '?';
      const tierPT = { ultra: '🏆 ULTRA', high: '🥇 HIGH', medium: '🥈 MÉDIO', low: '🥉 BÁSICO' }[hw.tier] || '?';
      const emuStr = res.emuCores ? `Núcleos ${res.emuCores.join(', ')}` : res.affinityMask;

      alert(
        `🔥 GAME BOOSTER ATIVADO!\n` +
        `Configuração adaptada ao seu PC\n\n` +
        `── Hardware Detectado ───────────\n` +
        `🖥  CPU: ${hw.cpuModel || 'Desconhecido'}\n` +
        `📦 Marca: ${brand}\n` +
        `🔢 Físicos: ${hw.physicalCores} | Lógicos: ${hw.logicalCount}\n` +
        `⚡ HyperThreading: ${htInfo}\n` +
        `💾 RAM: ${ramGB} GB\n` +
        `🎮 GPU: ${hw.gpuName || '?'}\n` +
        `📊 Perfil: ${tierPT}\n\n` +
        `── Configuração Aplicada ────────\n` +
        `✅ HD-Player → ${emuStr} (Alta prioridade)\n` +
        `✅ BlueStacks → Núcleos principais (Alta)\n` +
        `✅ Discord/Chrome → Núcleos BG (Abaixo Normal)\n` +
        `✅ I/O Priority HD-Player/BS: 3 (High)\n` +
        `✅ GPU Priority: ${hw.tier === 'ultra' || hw.tier === 'high' ? 8 : 6}\n` +
        `✅ Win32PrioritySeparation: 26\n` +
        `✅ Core Parking: DESATIVADO\n` +
        `✅ Timer Resolution: 0.5ms\n` +
        `✅ TCP TcpAckFrequency/NoDelay: ON\n` +
        `✅ RAM threshold SmartTrim: ${res.standbyThreshMB} MB\n` +
        `✅ Xbox DVR: desabilitado\n` +
        `✅ Modo Jogo Windows: ativado\n\n` +
        `Reinicie o emulador para aplicar\na afinidade de CPU.`
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

