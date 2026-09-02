# 🧭 LOORD OPTIMIZER — GUIA COMPLETO DO PROJETO & ARQUITETURA (AGENTS.MD)

> **Documento Oficial de Arquitetura, Padrões Técnicos, Estrutura do Sistema Web, Segurança Militar e Diretrizes de Engenharia.**  
> Qualquer agente de IA ou desenvolvedor que atuar neste repositório **DEVE** seguir estritamente todas as convenções, regras e padrões documentados aqui.

---

## 1. 📌 VISÃO GERAL DO PROJETO

* **Nome Oficial:** Loord Optimizer
* **Repositório GitHub:** `GabrielErick1/loord-optimizer-releases`
* **Público-Alvo:** Gamers de PC, jogadores de Free Fire competitivo e usuários de emuladores Android (BlueStacks 5, MSI App Player, BlueStacks X) que exigem latência ultrabaixa (input lag zero), FPS destravado e estável, sensibilidade adaptativa e Windows otimizado ao nível de kernel.
* **Stack Tecnológica:**
  * **Framework Desktop:** Electron (Node.js no Backend + Web Nativo no Renderer)
  * **Frontend:** HTML5 Semântico, Vanilla JavaScript (ES6+), Vanilla CSS Puro com tema Dark Gamer Neon (Glassmorphism, gradientes e micro-animações fluidas)
  * **Backend & OS Bridge:** Node.js (`child_process`, `fs`, `path`, `crypto`, `os`), Registry Nativo (`reg.exe`), PowerShell 5.1+, `powercfg.exe`, `bcdedit.exe`, WMI e ADB Android (`HD-Adb.exe`)
  * **Sistema Web & API Remota:** Vercel Serverless (`https://loord-auth.vercel.app`) para autenticação de chaves VIP, heartbeat anti-crack e gateway de pagamentos PIX integrado
  * **Build, Segurança & Deploy:** `electron-builder`, `scripts/obfuscate.js` (javascript-obfuscator com blindagem militar) e GitHub Releases via token `GH_TOKEN`.

---

## 2. 🗂️ ESTRUTURA DE ARQUIVOS DO REPOSITÓRIO

```text
Nova pasta (4)/
├── .agents/
│   ├── AGENTS.md                  # Este documento: arquitetura, regras e padrões do projeto
│   └── diario.md                  # Diário cronológico de desenvolvimento e histórico de releases
├── regis/                         # Chaves .reg e bancos criptografados de sensibilidade/recoil
│   ├── encrypted_reg_data.js      # Dados protegidos de registros de recoil e mira
│   ├── lock_fov_stick.reg         # Regedit de estabilização de FOV e mira
│   └── loord v0.reg               # Perfil de sensibilidade base
├── scripts/
│   └── obfuscate.js               # Pipeline de backup limpo, ofuscação militar e restauração
├── BlueStacks_nxt/                # Cópia local de integridade e configs do BlueStacks 5
│   └── bluestacks.conf            # Arquivo de configuração de referência íntegra (Hyper-V / v10.42+)
├── dist/                          # Artefatos compilados (.exe NSIS, .zip, .blockmap)
├── main.js                        # Processo Principal: Ciclo de vida, IPC Zero-Trust, Tweaks OS, GPO
├── preload.js                     # ContextBridge segura: ponte isolada entre main e renderer
├── renderer.js                    # Processo de Renderização: UI, Modais, Eventos, Logs e Chamadas API
├── index.html                     # Estrutura visual da aplicação, abas e modais do painel
├── style.css                      # Design System Gamer Neon: Cores, Scrollbars, Grids e Animações
└── package.json                   # Metadados, scripts de build, dependências e privilégios de Admin
```

---

## 3. 🏗️ ARQUITETURA DO PAINEL & FLUXO DE EXECUÇÃO

O Loord Optimizer é construído sobre uma **Arquitetura de 3 Camadas Isoladas**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CAMADA 3: RENDERER (renderer.js)                     │
│   Interface HTML5/CSS, Abas, Cards, Modais, Logs ADB e Validações UI   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (window.api.*)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CAMADA 2: PRELOAD (preload.js)                       │
│    ContextBridge Segura, contextIsolation: true, nodeIntegration: false│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (ipcRenderer.invoke -> IPC)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               CAMADA 1: PROCESSO PRINCIPAL (main.js)                   │
│   Zero-Trust Interceptor, HWID, Registro, PowerShell, safeWrite, ADB   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (HTTPS Seguro)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│          SISTEMA WEB REMOTO: VERCEL API (loord-auth.vercel.app)        │
│    Validação de Chave VIP, Heartbeat Contínuo (5 min), Gateway PIX     │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Camada 1: Processo Principal (`main.js`)
* **Ciclo de Vida:**
  1. `app.whenReady()` é acionado.
  2. Desmonta imagens ISO residuais (`dismountAllVirtualIsos`).
  3. Limpa entradas de bloqueio de segurança em hosts (`cleanSecurityHosts`).
  4. Executa `checkAdminPrivileges()`: verifica via comando `fsutil dirty query %systemdrive%` se o app possui privilégios de Administrador.
  5. Cria a janela principal (`createWindow`) com `frame: false` (janela personalizada sem bordas do Windows), `resizable: true` e `webPreferences` isoladas.
* **Interceptação Zero-Trust de IPC:** Todos os manipuladores `ipcMain.handle` passam por uma barreira central de autorização. Canais restritos são bloqueados caso `isLicenseAuthorized()` seja falso.
* **Execuções de Sistema:** Invoca comandos nativos via `execSync` / `child_process.exec`:
  * `reg.exe` com o argumento obrigatório `/reg:64`.
  * `powercfg.exe` para esquemas de energia e desativação de limites de bateria.
  * `bcdedit.exe` para controle de dynamic tick, platform tick e temporizadores HPET.
  * WMI (`wmic.exe`) e PowerShell para identificação de hardware (CPU, RAM, Placa-mãe).
  * ADB (`HD-Adb.exe`) para injeção de parâmetros em emuladores Android.

### 3.2. Camada 2: Ponte Isolada (`preload.js`)
* Utiliza `contextBridge.exposeInMainWorld('api', { ... })`.
* Garante que **nenhuma** API interna do Node.js (`require`, `process`, `fs`, `child_process`) seja exposta ou acessível pelo DOM do navegador.
* Expõe apenas funções assíncronas estritamente tipadas e mapeadas para os canais IPC oficiais.

### 3.3. Camada 3: Processo de Renderização (`renderer.js` + `index.html` + `style.css`)
* **Navegação por Abas:** Mapeamento via atributo `data-tab` nos botões da barra lateral (`.nav-item`). Alterna a classe `.active` entre as seções `.tab-content`.
* **Barra de Título Gamer:** Região de arrasto controlada por `-webkit-app-region: drag`, exceto sobre os botões de controle (`.win-ctrl-btn` com `-webkit-app-region: no-drag`).
* **Terminal Integrado ADB:** Log visual em tempo real das operações de emulador (`logAdb(msg, cor)`).
* **Persistência de Estado no DOM:** Indicadores de estado visual (`.adb-applied-badge`, `.btn-active-tweak`) com IDs únicos para cada tweak aplicado.

---

## 4. 🌐 SISTEMA WEB & API REMOTA (VERCEL API)

O painel se comunica em tempo real com a infraestrutura em nuvem hospedada em:
**`https://loord-auth.vercel.app`**

### 4.1. Mecanismo de HWID (Hardware Identification Único)
* O identificador exclusivo da máquina (`get-uuid`) é gerado pela combinação criptografada de:
  1. UUID da Placa-Mãe (`wmic csproduct get uuid`)
  2. Serial do Processador (`wmic cpu get processorid`)
  3. MAC Address do adaptador de rede primário
* O resultado é submetido a um hash SHA-256 no formato `LOORD-HWID-XXXX-XXXX-XXXX`.
* Uma chave VIP fica vinculada **exclusivamente** a esse HWID no banco da Vercel, impedindo que a mesma chave seja compartilhada entre múltiplos computadores.

### 4.2. Fluxo de Ativação de Chave VIP (`verify-key`)
1. O usuário digita a chave na tela de bloqueio (`#key-lock-screen`).
2. O `renderer.js` invoca `window.api.verifyKey(key)`.
3. O `main.js` dispara uma requisição HTTPS POST para `https://loord-auth.vercel.app/api/auth`:
   ```json
   {
     "key": "LOORD-XXXX-XXXX",
     "hwid": "LOORD-HWID-XXXX-XXXX",
     "version": "3.7.3",
     "timestamp": 1725178400000
   }
   ```
4. Se o servidor responder com `{ authorized: true, plan: "vip", expiresAt: "..." }`:
   * A flag interna `isLicenseAuthorized()` é definida como `true`.
   * Salva o cache de autenticação local criptografado em `userData`.
   * Desbloqueia a interface do painel, oculta a tela de bloqueio e exibe as abas completas.

### 4.3. Sistema de Heartbeat Ativo (Intervalo de 5 Minutos)
* A cada 5 minutos (300.000ms), o `main.js` consulta silenciosamente `/api/client-check`.
* **Ação em Caso de Revogação ou Expiração:**
  1. A autorização é revogada imediatamente (`isLicenseAuthorized() = false`).
  2. Executa a reversão preventiva de tweaks (`revert-all-tweaks-on-revoke`).
  3. O cache local é expurgado.
  4. Dispara evento IPC que reativa a tela de bloqueio `#key-lock-screen`, impossibilitando o uso do painel.

### 4.4. Gateway de Pagamento PIX Integrado & Planos ISO
* O painel possui integração direta para compra de licenças e acesso à ISO Loord Lite via PIX automatizado:
  * **Geração de Cobrança (`create-iso-pix-payment`):** Retorna o QR Code em Base64 e o código "Copia e Cola" do Banco Central.
  * **Polling de Confirmação (`check-iso-pix-payment`):** Consulta a cada 4 segundos o status do pagamento na Vercel.
  * **Liberação Instantânea:** Ao detectar compensação bancária (`PAID`), a chave VIP é ativada ou os arquivos da ISO são liberados para download/preparação de partição.

---

## 5. 🛡️ SEGURANÇA E SISTEMA ANTI-CRACK (ZERO-TRUST)

O Loord Optimizer emprega medidas ativas de nível militar para proteção de integridade:

### 5.1. Barreira IPC Zero-Trust no `main.js`
Apenas uma lista estrita de canais públicos pode responder sem chave VIP validada:
```javascript
const PUBLIC_IPC_CHANNELS = [
  'check-admin', 'get-uuid', 'verify-key', 'activate-iso-key',
  'get-iso-plans-public', 'create-iso-pix-payment', 'check-iso-pix-payment',
  'check-loord-iso-status', 'check-for-updates', 'download-update-progress',
  'install-update-now', 'revert-all-tweaks-on-revoke', 'reboot-computer',
  'reboot-to-bios', 'get-restore-point-status'
];
```
Qualquer invocação a canais de tweaks, registro, ADB, overclock ou arquivos de emulador fora dessa lista retorna imediatamente `{ success: false, error: 'Acesso bloqueado: Licença VIP requerida.' }`.

### 5.2. Bloqueio de Injeção de CLI e DevTools
* **Anti-Debugging:** Ao iniciar, o `main.js` inspeciona `process.argv`. Argumentos como `--remote-debugging-port`, `--inspect`, `--inspect-brk`, `--js-flags` ou `--disable-web-security` provocam encerramento forçado imediato (`app.exit(0)`).
* **Bloqueio de DevTools:** Em builds empacotados (`app.isPackaged`), qualquer tentativa de abrir DevTools é interceptada e fechada instantaneamente.
* **Bloqueio de Teclas de Atalho:** Teclas `F12`, `Ctrl+Shift+I`, `Ctrl+Shift+J` e `Ctrl+R` são bloqueadas no `before-input-event`.

### 5.3. Pipeline de Ofuscação Militar & V8 Bytecode (`scripts/obfuscate.js`)
Antes da compilação do instalador (`npm run publish` ou `npm run dist`), o pipeline:
1. Faz backup de segurança do código limpo em `.dev_source_backup/`.
2. Aplica `javascript-obfuscator` em `main.js`, `preload.js`, `renderer.js` e `regis/encrypted_reg_data.js` com:
   * `compact: true`
   * `controlFlowFlattening: true` (probabilidade 0.75)
   * `deadCodeInjection: true`
   * `selfDefending: true` (se qualquer byte for alterado ou o código for formatado/desminificado, o binário trava em loop infinito)
   * `splitStrings: true`
   * `stringArrayEncoding: ['base64']`
3. **Compilação em V8 Bytecode Binário (.jsc via Bytenode):**
   * Invoca `scripts/compile-bytecode.js` através do próprio motor Electron (`ELECTRON_RUN_AS_NODE=1`).
   * Gera `main.jsc` e `preload.jsc` em binário puro de máquina virtual V8.
   * **Nenhuma IA (ChatGPT, Claude, etc.) consegue ler, analisar ou descompilar bytecode V8**.
4. **Injeção de Loaders Seguros:**
   * Substitui `main.js` e `preload.js` por carregadores mínimos de 3 linhas que apenas executam o bytecode binário.
5. O `electron-builder` empacota os binários no arquivo `app.asar`.
6. O script restaura automaticamente o código-fonte limpo para o ambiente de desenvolvimento.

### 5.4. Proteção Anti-Portable, Anti-Tamper & Anti-Rebranding
* **Bloqueio de Runner Portable:** Bloqueia inicialização através de runners genéricos do Electron (`process.defaultApp === true`).
* **Bloqueio de Execução Descompactada:** Em produção (`app.isPackaged`), exige que a execução ocorra estritamente de dentro do contêiner `app.asar`.
* **Anti-Rebranding de Executável:** O executável em produção deve corresponder estritamente a `loord optimizer.exe`. Se for renomeado, encerra imediatamente via `app.exit(0)`.
* **Anti-Rebranding de Aplicação:** O nome no `package.json` deve ser estritamente `Loord Optimizer`.

---

## 6. ⚙️ REGRAS CRÍTICAS DE ENGENHARIA DO EMULADOR

### 6.1. Gravação Atômica Blindada (`safeWriteBluestacksConf`)
> [!CAUTION]
> **JAMAIS** utilize `fs.writeFileSync` diretamente em arquivos `bluestacks.conf`. O BlueStacks 5 possui o serviço nativo `BstkSVC.exe` que roda permanentemente em segundo plano. Escritas diretas truncam o arquivo para 0 bytes temporariamente e causam o erro fatal:
> *"Cannot start BlueStacks: Failed to read configuration file"*.

**Regras Obrigatórias de Escrita:**
1. Sempre utilizar a função central `safeWriteBluestacksConf(confPath, contentOrLines)` presente no [main.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/main.js).
2. **Preservação Forçada de Chaves Críticas:** O leitor C++ do BlueStacks exige certas chaves vinculadas à máquina do usuário. Estas chaves **JAMAIS** podem ser modificadas, excluídas ou substituídas por presets:
   * `bst.launcher_version` (ex: `10.42.71.1001`)
   * `bst.status.hypervisor` (ex: `hyperv` ou `vbox`, dependendo do Windows)
   * `bst.status.imap_schema_version`
   * `bst.machine_id`
   * `bst.guid`
   * `bst.install_id`
   * `bst.install_date`
   * `bst.installed_images`
   * `bst.version_machine_id`
3. **Mecanismo Atômico:** O arquivo é gravado primeiro em um arquivo temporário `.tmp_${Date.now()}` e renomeado de uma vez com `fs.renameSync` (com fallback para `copyFileSync` e remoção do temporário).
4. **Adblock Não-Destrutivo:** Para desativar anúncios e barras de jogos recomendados, **NUNCA** apague as linhas do arquivo. Sempre altere o valor para `"0"` (ex: `bst.enable_programmatic_ads="0"`, `bst.instance.*.show_ads="0"`).

### 6.2. Padrões de Comandos Shell no Windows
* **PowerShell 5.1:** O Windows nativo não aceita o operador `&&`. Comandos encadeados devem obrigatoriamente usar ponto e vírgula (`;`).
* **Colmeia de 64 Bits:** Sempre incluir o modificador `/reg:64` em comandos `reg add` para garantir que o registro seja gravado na colmeia nativa e não redirecionado para `SysWOW64`.
* **Elevação de Privilégios:** O instalador e o executável exigem execução como Administrador (`"requestedExecutionLevel": "requireAdministrator"` no `package.json`).

---

## 7. 🎮 MÓDULOS E FUNCIONALIDADES DO PAINEL

### 7.1. Semi Precision Regis & Regedit Adaptativa
* Injeção de curvas de aceleração suave (`SmoothMouseXCurve`, `SmoothMouseYCurve`).
* Estabilizadores de mira, otimização de `MouseHoverTime` (0ms) e sensibilidade customizada para travar mira e evitar que o recoil passe da cabeça no Free Fire.

### 7.2. Otimizar PC (35 Módulos em Grade Responsiva)
Organizados em grade de 5 colunas responsivas (`.opt-grid`):
* **Desempenho & Input:** Keyboard Delay Reducer, Mouse Precision (Current/Default), Remover Aceleração Total, Display Input Lag Tweak.
* **Jogos & Alto Impacto:** Desativar Overlays & Bloatware, Desativar Xbox Game Bar & DVR, Modo Jogo do Windows, Prioridade de Jogos, Delay 1ms Free Fire, **Desativar Limitação & Economia (GPO)**.
* **Serviços & Inicialização:** Otimizar Boot, Desativar Telemetria & Rastreio, Desativar SysMain/Prefetch, Desativar Background Apps, Pausar Windows Update em Jogo.
* **Hardware & CPU/GPU:** Desativar Core Parking CPU, GPU Maximum Performance, HAGS (Hardware Accelerated GPU Scheduling), Plano Desempenho Máximo, Desativar Power Throttling & GPO.
* **Sistema & Latência:** TimeStamp Interval 0ms, Disable FSE, Prioridade CSRSS em Tempo Real, Desativar HPET via BCD, Win32 Priority Separation (28 hex / 40 dec).
* **Rede & Latência:** Desativar Nagle Algorithm (TcpAckFrequency/TCPNoDelay = 1), QoS Game Priority, Otimizar Adaptador de Rede, Flush DNS Cache, Desativar Hibernação (`powercfg -h off`).
* **Visual & Memória:** Efeitos Visuais Máxima Performance, Desativar Notificações, Boost de Processos, SvcHost Split Threshold, Limpeza Automática de StandbyList.

### 7.3. Emulador + FPS (Métodos 1 e 2)
* **Método 1 (PC Fraco & Versões 5.9 / 5.12 / 5.21 / 5.22):**
  * `bst.instance.*.max_fps="999"`
  * `bst.instance.*.enable_high_fps="1"`
  * `bst.instance.*.eco_mode_max_fps="10"`
  * `bst.mim.max_fps="<hz informados pelo usuário>"`
* **Método 2 (Padrão Clássico / Script PowerShell):**
  * `bst.instance.*.enable_high_fps="0"`
  * `bst.instance.*.max_fps="999"`
  * `bst.mim.max_fps="<hz informados pelo usuário>"`
* **Remover Delay do Free Fire (ExclusiveDelay 1ms):**
  * Substitui `"ExclusiveDelay" : 200` por `"ExclusiveDelay" : 1` em todos os arquivos de mapeamento `.cfg` das pastas `InputMapper` de todos os emuladores instalados.
* **Device Profiles (240Hz):** Injeta perfis de celular topo de linha (ASUS ROG Phone 8 Pro, Redmi Note 14 Pro, etc.) no `bluestacks.conf` e ao vivo no Android via `setprop ro.product.model`.
* **Flasher de Tweaks Gamer (ADB):** Injeta aceleração direta de GPU (`setprop debug.egl.hw 1`), Dalvik VM 512MB e desativa animações de boot.

### 7.4. Overclock & Boost
* **Identificação Automática de Hardware:** Lê via WMI modelo de CPU (Intel ou AMD), contagem de núcleos, frequência e pentes de RAM.
* **AMD PBO:** Otimização conservadora de limites térmicos PPT/TDC/EDC e Curve Optimizer.
* **Intel Power Limits:** Liberação de restrições PL1/PL2 para sustentar frequências máximas de Boost.
* **Ativação de XMP / EXPO com Reinicialização Direta na BIOS:**
  * Botão de 1 clique que executa `shutdown.exe /r /fw /t 2`.
  * Direciona o computador direto para o setup da placa-mãe (BIOS/UEFI) sem necessidade de pressionar teclas no boot.
* **Termo de Responsabilidade Mandatório:** A aba de Overclock exige leitura do modal de alertas térmicos e marcação de checkbox de consentimento antes de liberar os controles.

---

## 8. 🎨 DESIGN SYSTEM & PADRÕES DE INTERFACE (UI/UX)

1. **Botões de Controle de Janela Gamer (`.win-ctrl-btn`):**
   * Padrão retangular moderno de emulador (`36px × 26px`, cantos arredondados de `6px`).
   * Ícones em vetor SVG limpos:
     * **Minimizar:** Traço horizontal (`—`).
     * **Maximizar / Restaurar:** Quadrado vazado (`▢`).
     * **Fechar:** Cruz (`✕`) com micro-animação de rotação suave de 90° e iluminação vermelha suave no hover.
2. **Scrollbar Gamer Personalizada (`.nav-menu`):**
   * Largura de 5px, cantos arredondados, fundo translúcido e indicador em degradê azul/ciano (`#1d4ed8` ➔ `#38bdf8`).
3. **Paleta de Cores Oficial:**
   * **Fundo Principal:** `#0a0a0f` / `#0d1117`
   * **Superfícies de Cards:** `rgba(17, 24, 39, 0.7)` com bordas sutis `rgba(59, 130, 246, 0.15)`
   * **Destaque Primário (Ciano/Azul):** `#38bdf8` / `#0ea5e9` / `#1d4ed8`
   * **Confirmação e Sucesso (Verde Neon):** `#10b981` / `#22c55e`
   * **Alerta e Atenção (Âmbar/Dourado):** `#f59e0b` / `#fbbf24`
   * **Perigo e Cancelamento (Vermelho Neon):** `#ef4444` / `#dc2626`

---

## 9. 🚀 WORKFLOW DE PUBLICAÇÃO E RELEASE

Ao preparar e lançar qualquer nova versão, **SEMPRE** execute o pipeline completo:

1. **Validação de Sintaxe em Todos os Arquivos JS:**
   ```powershell
   node -c main.js; node -c preload.js; node -c renderer.js
   ```
2. **Atualização e Sincronização de Versão:**
   * Atualizar `version` no [package.json](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/package.json).
   * Atualizar os badges de versão `nav-update-badge` e `app-version-badge` no [index.html](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/index.html).
3. **Commit & Push no Repositório Oficial:**
   ```powershell
   git add index.html main.js package.json preload.js renderer.js style.css .agents/diario.md .agents/AGENTS.md
   git commit -m "feat(vX.Y.Z): descrição técnica das alterações"
   git push origin clean-main
   ```
4. **Build, Ofuscação Militar e Publicação no GitHub:**
   ```powershell
   $env:GH_TOKEN = "$env:GH_TOKEN"; npm run publish
   ```
   *O pipeline executa o backup limpo, ofuscação com `selfDefending` e restaura o código fonte após o upload dos artefatos (`.exe`, `.zip`, `.blockmap`) para as releases do GitHub.*
5. **Atualização Mandatória do Diário:**
   * Registrar imediatamente no [.agents/diario.md](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/.agents/diario.md) a data, versão, arquivos alterados e resumo detalhado da entrega.
