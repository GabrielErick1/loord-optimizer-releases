/**
 * Loord Optimizer - Sistema Internacional de Idiomas (i18n)
 * Suporte completo para Português (pt), Inglês (en) e Espanhol (es)
 */

const i18n = {
  currentLang: 'pt',

  locales: {
    pt: {
      langName: 'Português',
      langFlag: '🇧🇷',
      
      // Sidebar
      navSemiPrecision: '🎯 Semi Precision Regis',
      navAdaptiveRegedit: '🧬 Regedit Adaptativa',
      navSenseCalculator: '🎯 Calculadora Sense',
      navMouseConfig: '🖱️ Regedits & Sense',
      navOptimizePc: '⚡ Otimizar PC',
      navNetworkLatency: '🌐 Rede & Latência',
      navEmulatorFps: '🎮 Emulador + FPS',
      navMyConfig: '💾 Minha Config & Atualizações',
      navLowEndPc: '⚡ PC Fraco (Ultra FPS)',
      sidebarVipActive: '💎 VERSÃO VIP',
      sidebarVipExpiring: '⏳ VIP ATIVO',
      sidebarLocked: '🔒 BLOQUEADO',
      sidebarNoLicense: '👤 Sem licença',
      sidebarLifetime: '✅ Vitalícia',

      // Login / Lock Screen
      lockScreenTitle: '🔒 ATIVAÇÃO DE ACESSO VIP',
      lockScreenSubtitle: 'Otimizador Exclusivo de Sensibilidade & Desempenho',
      hwidLabel: 'SEU HARDWARE ID (HWID):',
      btnCopyUuid: '📋 Copiar ID',
      vipKeyLabel: 'INSIRA SUA CHAVE VIP:',
      vipKeyPlaceholder: 'COLE SUA CHAVE AQUI (EX: ABCD-1234-EFGH-5678)...',
      btnActivateVip: '🔓 ATIVAR ACESSO VIP',
      lockScreenFooter: 'Não possui uma chave? Solicite ao administrador oficial do Loord Optimizer.',

      // Minha Config & Atualizações
      configTabTitle: 'Minha Config & Atualizações',
      configTabSubtitle: 'Gerencie suas configurações, restaure backups e mantenha seu app atualizado',
      vipLicenseCardTitle: '👑 LICENÇA & ACESSO VIP',
      vipLicenseCardDesc: 'Status de ativação da sua chave no computador',
      connectedKeyLabel: 'CHAVE CONECTADA:',
      btnLogoutKey: '🚪 Trocar Chave / Sair',
      systemUpdatesCardTitle: 'ATUALIZAÇÕES DO SISTEMA',
      systemUpdatesCardDesc: 'Verifique e receba novas versões e otimizações automaticamente',
      latestVersionMsg: 'Você está na versão mais recente!',
      btnCheckUpdates: '🔍 Verificar Agora',
      registryBackupCardTitle: 'BACKUP DO REGISTRO',
      registryBackupCardDesc: 'Se você encontrar qualquer instabilidade no mouse ou teclado, reverta todo o registro para o estado padrão original.',
      btnCreateBackup: 'Criar Backup Novo',
      btnRestoreBackup: 'Restaurar Backup',
      profileCardTitle: '💾 SALVAR & CARREGAR MEU PERFIL (BACKUP GERAL)',
      profileCardDesc: 'Exporte sua sensibilidade e configurações completas para um arquivo .json e restaure quando quiser.',
      btnSaveProfile: '💾 Salvar Meu Perfil (.json)',
      btnLoadProfile: '📂 Carregar Perfil Salvo',
      systemStatusTitle: 'STATUS DO SISTEMA',

      // Regedit Adaptativa
      adaptiveTitle: '⚡ OTIMIZADOR DE MOUSE E DESEMPENHO - BLUESTACKS',
      adaptiveBadge: 'REGEDIT ADAPTATIVA 🔥',
      adaptiveDesc: 'Ajustes reais e documentados do Windows: curva de resposta e velocidade 1:1 (HKCU\\Control Panel\\Mouse), plano de energia em Alto Desempenho e prioridade máxima de processo para instâncias do BlueStacks.',
      profileSelectLabel: '🎯 Escolha um perfil de sensibilidade de mouse e desempenho:',
      profileFastTitle: '[1] ⚡ RÁPIDA — Sem Aceleração & Resposta 1:1 (Sensibilidade Alta: 15)',
      profileFastBadge: 'FPS / MIRA RÁPIDA 🏆',
      profileFastDesc: 'Sem aceleração (MouseSpeed 0, Thresholds 0), resposta 1:1 com sensibilidade alta 15, plano de Alto Desempenho e prioridade Alta no BlueStacks.',
      profileLightTitle: '[2] ⚖️ LEVE — Sem Aceleração & Sensibilidade Neutra (Sensibilidade: 10)',
      profileLightBadge: 'EQUILIBRADO 🎯',
      profileLightDesc: 'Resposta 1:1 equilibrada sem aceleração com sensibilidade neutra padrão 10. Bom ponto de partida para qualquer DPI.',
      profileSmoothTitle: '[3] 🌊 SUAVE — Movimento Controlado & Menos Brusco (Sensibilidade: 8)',
      profileSmoothBadge: 'CONTROLE TOTAL 💎',
      profileSmoothDesc: 'Aceleração leve mantida com sensibilidade reduzida para 8. Movimento macio e menos brusco para travar a mira na cabeça.',
      profilePerfOnlyTitle: '[4] 🚀 SÓ DESEMPENHO — Plano de Energia & Prioridade (Sem mexer no mouse)',
      profilePerfOnlyBadge: 'DESEMPENHO PURO',
      profilePerfOnlyDesc: 'Ativa o plano de energia de Alto Desempenho no Windows e eleva a prioridade de processo do BlueStacks para Alta.',
      profileRestoreTitle: '[5] 🔄 RESTAURAR PADRÃO DO WINDOWS',
      profileRestoreBadge: 'RESET ↩️',
      profileRestoreDesc: 'Restaura a aceleração padrão do Windows e volta o plano de energia para o modo Equilibrado.',
      btnApplyAdaptive: '⚡ Aplicar Perfil Selecionado no Windows & BlueStacks',
      panOptimizerTitle: '🎯 OTIMIZADOR COMPETITIVO DE PAN & ENGINE (ANTI-PINAR & ULTRA FPS)',
      panSpeedLabel: '⚡ Speed do Pan (Anti-Pinar):',
      panTweaksLabel: '🎯 Tweak do Pan (Mira/Analógico):',

      // Semi Precision Regis
      semiPrecisionTitle: '🎯 SEMI PRECISION REGIS (PRECISÃO MÁXIMA & FULL CAPA 1:1)',
      semiPrecisionDesc: 'Calibração militar da curva de aceleração de hardware do mouse (SmoothMouseXCurve / SmoothMouseYCurve), eliminando qualquer pixel skip ou atraso na mira vertical.',
      semiPrecisionApplyBtn: '🚀 Injetar Precisão Semi Regis no Windows & BlueStacks',
      macroSpeedTitle: '⚡ VELOCIDADE DO MACRO AUTOMÁTICO:',
      btnStartMacro: '▶️ Iniciar Macro',
      btnStopMacro: '⏹️ Parar Macro',

      // Calculadora Sense
      calcTitle: '🎯 CALCULADORA DE SENSIBILIDADE PRO',
      calcSubtitle: 'Converta sensibilidades perfeitamente entre resoluções, DPIs de mouse e emuladores.',
      calcCurrentDpi: 'DPI Atual do Mouse:',
      calcNewDpi: 'Nova DPI do Mouse:',
      calcCurrentSensX: 'Sensibilidade X Atual:',
      calcCurrentSensY: 'Sensibilidade Y Atual:',
      btnCalculateSense: '⚡ Calcular Nova Sensibilidade',

      // Otimizar PC
      optimizePcTitle: '⚡ OTIMIZAÇÃO AVANÇADA DO WINDOWS & MEMÓRIA',
      optimizePcSubtitle: 'Libere memória RAM, priorize processos do emulador e remova latências do sistema operacional.',
      btnCleanRam: '🧹 Limpar Memória RAM Agora',
      btnOptimizeProcesses: '⚡ Otimizar Processos em Segundo Plano',
      btnMasterOptimization: '🚀 OTIMIZAR WINDOWS MASTER',

      // Rede & Latência
      networkTitle: '🌐 OTIMIZAÇÃO DE CONEXÃO & LATÊNCIA (PING)',
      networkSubtitle: 'Reduza o tempo de resposta da rede e acelere pacotes UDP para máxima estabilidade em partidas.',
      btnApplyDns: '⚡ Aplicar Melhor DNS Gamer (Cloudflare / Google)',
      btnFlushDns: '🧹 Limpar Cache DNS (Flush DNS)',
      btnOptimizeTcp: '🚀 Otimizar Parâmetros TCP/IP & Latência',

      // Emulador & PC Fraco
      emulatorTitle: '🎮 AJUSTES DE DESEMPENHO DO EMULADOR',
      emulatorSubtitle: 'Destrave taxa de quadros e configure a resolução esticada ideal para o seu monitor.',
      btnUnlockFps: '⚡ Destravar 240 FPS (Anti-Cap)',
      btnBypassEmulator: '🛡️ Ativar Otimização Anti-Stutter',
      lowEndPcTitle: '⚡ MODO PC FRACO (ULTRA FPS BOOST)',
      lowEndPcSubtitle: 'Configurações extremas para rodar liso em notebooks e computadores sem placa de vídeo dedicada.',
      btnApplyLowEnd: '🚀 Ativar Modo Ultra Leve (Máximo FPS)'
    },

    en: {
      langName: 'English',
      langFlag: '🇺🇸',
      
      // Sidebar
      navSemiPrecision: '🎯 Semi Precision Regis',
      navAdaptiveRegedit: '🧬 Adaptive Regedit',
      navSenseCalculator: '🎯 Sense Calculator',
      navMouseConfig: '🖱️ Regedits & Sense',
      navOptimizePc: '⚡ Optimize PC',
      navNetworkLatency: '🌐 Network & Latency',
      navEmulatorFps: '🎮 Emulator + FPS',
      navMyConfig: '💾 My Config & Updates',
      navLowEndPc: '⚡ Low-End PC (Ultra FPS)',
      sidebarVipActive: '💎 VIP VERSION',
      sidebarVipExpiring: '⏳ VIP ACTIVE',
      sidebarLocked: '🔒 LOCKED',
      sidebarNoLicense: '👤 No license',
      sidebarLifetime: '✅ Lifetime',

      // Login / Lock Screen
      lockScreenTitle: '🔒 VIP ACCESS ACTIVATION',
      lockScreenSubtitle: 'Exclusive Sensitivity & Performance Optimizer',
      hwidLabel: 'YOUR HARDWARE ID (HWID):',
      btnCopyUuid: '📋 Copy ID',
      vipKeyLabel: 'ENTER YOUR VIP KEY:',
      vipKeyPlaceholder: 'PASTE YOUR KEY HERE (EX: ABCD-1234-EFGH-5678)...',
      btnActivateVip: '🔓 ACTIVATE VIP ACCESS',
      lockScreenFooter: 'Don\'t have a key? Contact the official Loord Optimizer administrator.',

      // Minha Config & Atualizações
      configTabTitle: 'My Config & Updates',
      configTabSubtitle: 'Manage your settings, restore backups, and keep your app up to date',
      vipLicenseCardTitle: '👑 VIP LICENSE & ACCESS',
      vipLicenseCardDesc: 'Activation status of your license on this computer',
      connectedKeyLabel: 'CONNECTED KEY:',
      btnLogoutKey: '🚪 Change Key / Logout',
      systemUpdatesCardTitle: 'SYSTEM UPDATES',
      systemUpdatesCardDesc: 'Check for and receive new versions and optimizations automatically',
      latestVersionMsg: 'You are on the latest version!',
      btnCheckUpdates: '🔍 Check Now',
      registryBackupCardTitle: 'REGISTRY BACKUP',
      registryBackupCardDesc: 'If you experience any mouse or keyboard instability, revert the entire registry to the original default state.',
      btnCreateBackup: 'Create New Backup',
      btnRestoreBackup: 'Restore Backup',
      profileCardTitle: '💾 SAVE & LOAD MY PROFILE (FULL BACKUP)',
      profileCardDesc: 'Export your sensitivity and complete settings to a .json file and restore anytime.',
      btnSaveProfile: '💾 Save My Profile (.json)',
      btnLoadProfile: '📂 Load Saved Profile',
      systemStatusTitle: 'SYSTEM STATUS',

      // Regedit Adaptativa
      adaptiveTitle: '⚡ MOUSE & PERFORMANCE OPTIMIZER - BLUESTACKS',
      adaptiveBadge: 'ADAPTIVE REGEDIT 🔥',
      adaptiveDesc: 'Real documented Windows tweaks: 1:1 response curve and speed (HKCU\\Control Panel\\Mouse), High Performance power plan, and maximum process priority for BlueStacks instances.',
      profileSelectLabel: '🎯 Choose a mouse sensitivity and performance profile:',
      profileFastTitle: '[1] ⚡ FAST — No Acceleration & 1:1 Response (High Sensi: 15)',
      profileFastBadge: 'FPS / FAST AIM 🏆',
      profileFastDesc: 'Zero acceleration (MouseSpeed 0, Thresholds 0), 1:1 response with high sensitivity 15, High Performance plan, and High priority on BlueStacks.',
      profileLightTitle: '[2] ⚖️ BALANCED — No Acceleration & Neutral Sensitivity (Sensi: 10)',
      profileLightBadge: 'BALANCED 🎯',
      profileLightDesc: 'Balanced 1:1 response with no acceleration and neutral sensitivity 10. Great starting point for any mouse DPI.',
      profileSmoothTitle: '[3] 🌊 SMOOTH — Controlled Movement & Reduced Jitter (Sensi: 8)',
      profileSmoothBadge: 'TOTAL CONTROL 💎',
      profileSmoothDesc: 'Gentle acceleration maintained with reduced sensitivity 8. Smooth, consistent motion to lock your crosshair on heads.',
      profilePerfOnlyTitle: '[4] 🚀 PERFORMANCE ONLY — Power Plan & Priority (Unchanged mouse)',
      profilePerfOnlyBadge: 'PURE PERFORMANCE',
      profilePerfOnlyDesc: 'Activates High Performance power plan in Windows and raises BlueStacks process priority to High without altering mouse speed.',
      profileRestoreTitle: '[5] 🔄 RESTORE WINDOWS DEFAULTS',
      profileRestoreBadge: 'RESET ↩️',
      profileRestoreDesc: 'Restores default Windows mouse acceleration and switches power plan back to Balanced mode.',
      btnApplyAdaptive: '⚡ Apply Selected Profile to Windows & BlueStacks',
      panOptimizerTitle: '🎯 COMPETITIVE PAN & ENGINE OPTIMIZER (ANTI-PINAR & ULTRA FPS)',
      panSpeedLabel: '⚡ Pan Speed (Anti-Stutter):',
      panTweaksLabel: '🎯 Pan Tweak (Crosshair/Analog):',

      // Semi Precision Regis
      semiPrecisionTitle: '🎯 SEMI PRECISION REGIS (MAXIMUM 1:1 HEADSHOT PRECISION)',
      semiPrecisionDesc: 'Military-grade calibration of hardware mouse acceleration curve (SmoothMouseXCurve / SmoothMouseYCurve), eliminating pixel skipping and vertical crosshair delay.',
      semiPrecisionApplyBtn: '🚀 Inject Semi Regis Precision into Windows & BlueStacks',
      macroSpeedTitle: '⚡ AUTOMATIC MACRO SPEED:',
      btnStartMacro: '▶️ Start Macro',
      btnStopMacro: '⏹️ Stop Macro',

      // Calculadora Sense
      calcTitle: '🎯 PRO SENSITIVITY CALCULATOR',
      calcSubtitle: 'Convert sensitivities seamlessly between screen resolutions, mouse DPIs, and emulators.',
      calcCurrentDpi: 'Current Mouse DPI:',
      calcNewDpi: 'Target Mouse DPI:',
      calcCurrentSensX: 'Current X Sensitivity:',
      calcCurrentSensY: 'Current Y Sensitivity:',
      btnCalculateSense: '⚡ Calculate New Sensitivity',

      // Otimizar PC
      optimizePcTitle: '⚡ ADVANCED WINDOWS & MEMORY OPTIMIZATION',
      optimizePcSubtitle: 'Free up RAM memory, prioritize emulator processes, and eliminate OS input lag.',
      btnCleanRam: '🧹 Clean RAM Memory Now',
      btnOptimizeProcesses: '⚡ Optimize Background Processes',
      btnMasterOptimization: '🚀 OPTIMIZE WINDOWS MASTER',

      // Rede & Latência
      networkTitle: '🌐 NETWORK & LATENCY OPTIMIZATION (PING)',
      networkSubtitle: 'Minimize network roundtrip delay and accelerate UDP packets for maximum match stability.',
      btnApplyDns: '⚡ Apply Best Gaming DNS (Cloudflare / Google)',
      btnFlushDns: '🧹 Flush DNS Cache',
      btnOptimizeTcp: '🚀 Optimize TCP/IP Parameters & Latency',

      // Emulador & PC Fraco
      emulatorTitle: '🎮 EMULATOR PERFORMANCE SETTINGS',
      emulatorSubtitle: 'Unlock framerates and configure the ideal stretched resolution for your monitor.',
      btnUnlockFps: '⚡ Unlock 240 FPS (Anti-Cap)',
      btnBypassEmulator: '🛡️ Activate Anti-Stutter Optimization',
      lowEndPcTitle: '⚡ LOW-END PC MODE (ULTRA FPS BOOST)',
      lowEndPcSubtitle: 'Extreme configurations to run smoothly on laptops and PCs without dedicated graphics.',
      btnApplyLowEnd: '🚀 Activate Ultra-Light Mode (Maximum FPS)'
    },

    es: {
      langName: 'Español',
      langFlag: '🇪🇸',
      
      // Sidebar
      navSemiPrecision: '🎯 Semi Precision Regis',
      navAdaptiveRegedit: '🧬 Regedit Adaptativa',
      navSenseCalculator: '🎯 Calculadora Sense',
      navMouseConfig: '🖱️ Regedits & Sense',
      navOptimizePc: '⚡ Optimizar PC',
      navNetworkLatency: '🌐 Red & Latencia',
      navEmulatorFps: '🎮 Emulador + FPS',
      navMyConfig: '💾 Mi Config & Actualizaciones',
      navLowEndPc: '⚡ PC de Gama Baja (Ultra FPS)',
      sidebarVipActive: '💎 VERSIÓN VIP',
      sidebarVipExpiring: '⏳ VIP ACTIVO',
      sidebarLocked: '🔒 BLOQUEADO',
      sidebarNoLicense: '👤 Sin licencia',
      sidebarLifetime: '✅ Vitalicia',

      // Login / Lock Screen
      lockScreenTitle: '🔒 ACTIVACIÓN DE ACCESO VIP',
      lockScreenSubtitle: 'Optimizador Exclusivo de Sensibilidad y Rendimiento',
      hwidLabel: 'SU HARDWARE ID (HWID):',
      btnCopyUuid: '📋 Copiar ID',
      vipKeyLabel: 'INGRESE SU CLAVE VIP:',
      vipKeyPlaceholder: 'PEGUE SU CLAVE AQUÍ (EJ: ABCD-1234-EFGH-5678)...',
      btnActivateVip: '🔓 ACTIVAR ACCESO VIP',
      lockScreenFooter: '¿No tienes una clave? Solicítala al administrador oficial de Loord Optimizer.',

      // Minha Config & Atualizações
      configTabTitle: 'Mi Config & Actualizaciones',
      configTabSubtitle: 'Administre su configuración, restaure copias de seguridad y mantenga la app actualizada',
      vipLicenseCardTitle: '👑 LICENCIA Y ACCESO VIP',
      vipLicenseCardDesc: 'Estado de activación de su clave en este equipo',
      connectedKeyLabel: 'CLAVE CONECTADA:',
      btnLogoutKey: '🚪 Cambiar Clave / Salir',
      systemUpdatesCardTitle: 'ACTUALIZACIONES DEL SISTEMA',
      systemUpdatesCardDesc: 'Verifique y reciba nuevas versiones y optimizaciones automáticamente',
      latestVersionMsg: '¡Está en la versión más reciente!',
      btnCheckUpdates: '🔍 Verificar Ahora',
      registryBackupCardTitle: 'COPIA DE SEGURIDAD DEL REGISTRO',
      registryBackupCardDesc: 'Si experimenta alguna inestabilidad en el mouse o teclado, revierta todo el registro al estado predeterminado original.',
      btnCreateBackup: 'Crear Nueva Copia',
      btnRestoreBackup: 'Restaurar Copia',
      profileCardTitle: '💾 GUARDAR Y CARGAR MI PERFIL (COPIA COMPLETA)',
      profileCardDesc: 'Exporte su sensibilidad y configuración completa a un archivo .json y restáurela cuando desee.',
      btnSaveProfile: '💾 Guardar Mi Perfil (.json)',
      btnLoadProfile: '📂 Cargar Perfil Guardado',
      systemStatusTitle: 'ESTADO DEL SISTEMA',

      // Regedit Adaptativa
      adaptiveTitle: '⚡ OPTIMIZADOR DE MOUSE Y RENDIMIENTO - BLUESTACKS',
      adaptiveBadge: 'REGEDIT ADAPTATIVA 🔥',
      adaptiveDesc: 'Ajustes reales y documentados de Windows: curva de respuesta y velocidad 1:1 (HKCU\\Control Panel\\Mouse), plan de energía en Alto Rendimiento y máxima prioridad para BlueStacks.',
      profileSelectLabel: '🎯 Elija un perfil de sensibilidad de mouse y rendimiento:',
      profileFastTitle: '[1] ⚡ RÁPIDA — Sin Aceleración y Respuesta 1:1 (Sensibilidad Alta: 15)',
      profileFastBadge: 'FPS / MIRA RÁPIDA 🏆',
      profileFastDesc: 'Sin aceleración (MouseSpeed 0, Thresholds 0), respuesta 1:1 con sensibilidad alta 15, plan de Alto Rendimiento y prioridad Alta en BlueStacks.',
      profileLightTitle: '[2] ⚖️ EQUILIBRADA — Sin Aceleración y Sensibilidad Neutra (Sensi: 10)',
      profileLightBadge: 'EQUILIBRADA 🎯',
      profileLightDesc: 'Respuesta 1:1 equilibrada sin aceleración con sensibilidad neutra 10. Excelente punto de partida para cualquier DPI.',
      profileSmoothTitle: '[3] 🌊 SUAVE — Movimiento Controlado y Menos Brusco (Sensi: 8)',
      profileSmoothBadge: 'CONTROL TOTAL 💎',
      profileSmoothDesc: 'Aceleración suave mantenida con sensibilidad reducida a 8. Movimiento dócil para fijar la mira directamente a la cabeza.',
      profilePerfOnlyTitle: '[4] 🚀 SÓLO RENDIMIENTO — Plan de Energía y Prioridad (Sin alterar mouse)',
      profilePerfOnlyBadge: 'RENDIMIENTO PURO',
      profilePerfOnlyDesc: 'Activa el plan de energía de Alto Rendimiento en Windows y eleva la prioridad de BlueStacks a Alta.',
      profileRestoreTitle: '[5] 🔄 RESTAURAR PREDETERMINADO DE WINDOWS',
      profileRestoreBadge: 'RESET ↩️',
      profileRestoreDesc: 'Restaura la aceleración predeterminada de Windows y vuelve el plan de energía al modo Equilibrado.',
      btnApplyAdaptive: '⚡ Aplicar Perfil Seleccionado en Windows y BlueStacks',
      panOptimizerTitle: '🎯 OPTIMIZADOR COMPETITIVO DE PAN Y MOTOR (ANTI-PINAR Y ULTRA FPS)',
      panSpeedLabel: '⚡ Velocidad del Pan (Anti-Pinar):',
      panTweaksLabel: '🎯 Tweak del Pan (Mira/Analógico):',

      // Semi Precision Regis
      semiPrecisionTitle: '🎯 SEMI PRECISION REGIS (MÁXIMA PRECISIÓN Y FULL CAPA 1:1)',
      semiPrecisionDesc: 'Calibración militar de la curva de aceleración de hardware del mouse (SmoothMouseXCurve / SmoothMouseYCurve), eliminando pixel skipping y retardo vertical.',
      semiPrecisionApplyBtn: '🚀 Inyectar Precisión Semi Regis en Windows y BlueStacks',
      macroSpeedTitle: '⚡ VELOCIDAD DEL MACRO AUTOMÁTICO:',
      btnStartMacro: '▶️ Iniciar Macro',
      btnStopMacro: '⏹️ Detener Macro',

      // Calculadora Sense
      calcTitle: '🎯 CALCULADORA DE SENSIBILIDAD PRO',
      calcSubtitle: 'Convierta sensibilidades a la perfección entre resoluciones, DPIs de mouse y emuladores.',
      calcCurrentDpi: 'DPI Actual del Mouse:',
      calcNewDpi: 'Nuevo DPI del Mouse:',
      calcCurrentSensX: 'Sensibilidad X Actual:',
      calcCurrentSensY: 'Sensibilidad Y Actual:',
      btnCalculateSense: '⚡ Calcular Nueva Sensibilidad',

      // Otimizar PC
      optimizePcTitle: '⚡ OPTIMIZACIÓN AVANZADA DE WINDOWS Y MEMORIA',
      optimizePcSubtitle: 'Libere memoria RAM, priorice procesos del emulador y elimine latencias del sistema operativo.',
      btnCleanRam: '🧹 Limpiar Memoria RAM Ahora',
      btnOptimizeProcesses: '⚡ Optimizar Procesos en Segundo Plano',
      btnMasterOptimization: '🚀 OPTIMIZAR WINDOWS MASTER',

      // Rede & Latência
      networkTitle: '🌐 OPTIMIZACIÓN DE CONEXIÓN Y LATENCIA (PING)',
      networkSubtitle: 'Minimice el tiempo de respuesta de red y acelere paquetes UDP para máxima estabilidad en partidas.',
      btnApplyDns: '⚡ Aplicar Mejor DNS Gamer (Cloudflare / Google)',
      btnFlushDns: '🧹 Limpiar Caché DNS (Flush DNS)',
      btnOptimizeTcp: '🚀 Optimizar Parámetros TCP/IP y Latencia',

      // Emulador & PC Fraco
      emulatorTitle: '🎮 AJUSTES DE RENDIMIENTO DEL EMULADOR',
      emulatorSubtitle: 'Desbloquee tasa de cuadros y configure la resolución estirada ideal para su monitor.',
      btnUnlockFps: '⚡ Desbloquear 240 FPS (Anti-Cap)',
      btnBypassEmulator: '🛡️ Activar Optimización Anti-Stutter',
      lowEndPcTitle: '⚡ MODO PC DE GAMA BAJA (ULTRA FPS BOOST)',
      lowEndPcSubtitle: 'Configuraciones extremas para jugar fluido en portátiles y computadoras sin tarjeta gráfica dedicada.',
      btnApplyLowEnd: '🚀 Activar Modo Ultra Ligero (Máximo FPS)'
    }
  },

  t: function(key) {
    const lang = this.currentLang || 'pt';
    const dict = this.locales[lang] || this.locales.pt;
    return dict[key] || this.locales.pt[key] || key;
  },

  setLanguage: function(lang) {
    if (!this.locales[lang]) lang = 'pt';
    this.currentLang = lang;
    try {
      localStorage.setItem('loord_language', lang);
    } catch (_) {}

    const dict = this.locales[lang];

    // Atualiza indicador da engrenagem no sidebar
    const currentLangDisplay = document.getElementById('current-lang-display');
    if (currentLangDisplay) {
      currentLangDisplay.innerHTML = `${dict.langFlag} ${dict.langName}`;
    }

    // Atualiza estado ativo dos botões do menu dropdown
    const optionBtns = document.querySelectorAll('.lang-option-btn');
    optionBtns.forEach(btn => {
      const bLang = btn.getAttribute('data-lang');
      const checkEl = btn.querySelector('.check');
      if (bLang === lang) {
        btn.classList.add('active');
        if (checkEl) checkEl.textContent = '✓';
      } else {
        btn.classList.remove('active');
        if (checkEl) checkEl.textContent = '';
      }
    });

    // Atualiza todos os elementos com data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) {
        el.innerHTML = dict[key];
      }
    });

    // Atualiza placeholders com data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) {
        el.placeholder = dict[key];
      }
    });

    // Atualiza titles com data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (dict[key]) {
        el.title = dict[key];
      }
    });

    // Atualizações específicas de IDs conhecidos
    this.updateSpecificElements(dict);

    console.log(`[i18n] Idioma alterado para: ${lang} (${dict.langName})`);
  },

  updateSpecificElements: function(dict) {
    // Sidebar nav items
    const navItems = {
      'semi-precision-regis': dict.navSemiPrecision,
      'regedit-adaptativa': dict.navAdaptiveRegedit,
      'calculadora': dict.navSenseCalculator,
      'mouse-config': dict.navMouseConfig,
      'otimizar-pc': dict.navOptimizePc,
      'rede-latencia': dict.navNetworkLatency,
      'emulador': dict.navEmulatorFps,
      'pc-fraco': dict.navLowEndPc
    };

    for (const [tab, text] of Object.entries(navItems)) {
      const btn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
      if (btn) {
        const icon = btn.querySelector('.nav-icon');
        const iconHtml = icon ? icon.outerHTML : '';
        btn.innerHTML = `${iconHtml} ${text.replace(/^[^a-zA-Z0-9]+/, '')}`;
      }
    }

    // Minha config nav com badge
    const minhaConfigBtn = document.querySelector('.nav-item[data-tab="minha-config"]');
    if (minhaConfigBtn) {
      const badge = document.getElementById('nav-update-badge');
      const badgeHtml = badge ? badge.outerHTML : '';
      minhaConfigBtn.innerHTML = `<span style="display: flex; align-items: center;"><span class="nav-icon">💾</span> ${dict.navMyConfig.replace('💾 ', '')}</span>${badgeHtml}`;
    }

    // Tela de bloqueio
    const lockTitle = document.querySelector('#vip-key-screen h2');
    if (lockTitle) lockTitle.textContent = dict.lockScreenTitle;
    const lockDesc = document.querySelector('#vip-key-screen p');
    if (lockDesc) lockDesc.textContent = dict.lockScreenSubtitle;
    const btnActivate = document.getElementById('btn-activate-vip');
    if (btnActivate && !btnActivate.disabled) btnActivate.textContent = dict.btnActivateVip;

    // Botões de aplicação principais
    const btnApplyAdapt = document.getElementById('btn-apply-adaptive-profile');
    if (btnApplyAdapt) btnApplyAdapt.innerHTML = dict.btnApplyAdaptive;

    const btnLogout = document.getElementById('btn-logout-key');
    if (btnLogout) btnLogout.textContent = dict.btnLogoutKey;

    const btnCheckUpd = document.getElementById('btn-check-updates-manual');
    if (btnCheckUpd) btnCheckUpd.textContent = dict.btnCheckUpdates;

    const btnSaveProf = document.getElementById('btn-save-profile');
    if (btnSaveProf) btnSaveProf.textContent = dict.btnSaveProfile;

    const btnLoadProf = document.getElementById('btn-load-profile');
    if (btnLoadProf) btnLoadProf.textContent = dict.btnLoadProfile;

    const btnCleanRamEl = document.getElementById('btn-clean-ram');
    if (btnCleanRamEl) btnCleanRamEl.textContent = dict.btnCleanRam;

    const btnOptProcEl = document.getElementById('btn-optimize-processes');
    if (btnOptProcEl) btnOptProcEl.textContent = dict.btnOptimizeProcesses;

    const btnMasterOptEl = document.getElementById('btn-optimize-master');
    if (btnMasterOptEl) btnMasterOptEl.textContent = dict.btnMasterOptimization;
  },

  init: function() {
    let saved = 'pt';
    try {
      saved = localStorage.getItem('loord_language') || 'pt';
    } catch (_) {}
    this.setLanguage(saved);
  }
};

// Expor no escopo global
window.i18n = i18n;
window.t = function(key) {
  return i18n.t(key);
};
