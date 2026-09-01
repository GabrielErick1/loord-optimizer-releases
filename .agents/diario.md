# 📓 DIÁRIO DE DESENVOLVIMENTO — LOORD OPTIMIZER

Este documento registra cronologicamente todas as tarefas, correções, implementações e publicações realizadas no projeto. Toda nova sessão de trabalho deve adicionar seu registro aqui ao final da execução.

---

## 📅 [01/09/2026] — Release v3.7.4: Calibrador X/Y Capa, Auto-Elevação UAC & Detecção Real de Overclock/XMP
* **Versão Publicada:** `v3.7.4`
* **Arquivos Modificados:**
  * [main.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/main.js)
  * [preload.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/preload.js)
  * [renderer.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/renderer.js)
  * [index.html](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/index.html)
  * [package.json](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/package.json)
  * [iniciar_admin.bat](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/iniciar_admin.bat)
* **Resumo das Ações:**
  - **Auto-Elevação UAC e Tratamento de Caminhos com Espaços:**
    - Correção do erro ao abrir com caminhos contendo acentuação e espaços (`Configuração emulador\Nova pasta (4)`).
    - Injeção de verificação de Administrador nativa com auto-elevação e `-ArgumentList '.'`.
    - Criação de `iniciar_admin.bat` para execução rápida com 1 clique em modo elevado.
  - **Calibrador de Sensibilidade X/Y para Free Fire:**
    - Injeção direta nos arquivos de mapeamento `.cfg` das instâncias BlueStacks (`Sensitivity` e `SensitivityRatioY`), eliminando tremedeira com `Tweaks = 16458` e `ExclusiveDelay = 1`.
    - Presets competitivos no painel: Capa Agressivo, Equilibrado, Mira Travada e Padrão.
  - **Detecção 100% Real de Hardware no Overclock & Boost (Sem Dados Fictícios):**
    - Remoção de qualquer texto ou fallback estático (`'DDR4'`, `'🔴 AMD Ryzen'`).
    - Leitura física direta via WMI: contagem real de pentes (`2x 16GB`), PartNumber da memória (`KF560C30-16`), núcleos e threads físicos reais (`16 Núcleos, 32 Threads`), modelo e fabricante da placa-mãe.
    - **Identificação de EXPO / XMP Já Ativado:** Leitura da frequência real configurada (`6000 MHz`), exibindo badge verde `JÁ ATIVO 🔥` e prevenindo aplicação redundante.
    - **Proteção de Hardware Não Suportado:** Bloqueio automático de botões de Overclock/PBO para placas-mãe de entrada (chipsets A320, A520, A620, H-series) ou Laptops, protegendo o PC contra instabilidade térmica.

---

## 📅 [01/09/2026] — Criação da Documentação Oficial, Arquitetura em 3 Camadas e Diário de Bordo
* **Responsável:** Antigravity AI & Gabriel
* **Arquivos Criados/Modificados:**
  * [.agents/AGENTS.md](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/.agents/AGENTS.md) — Documento completo e detalhado (22 KB):
    - Arquitetura de 3 Camadas Isoladas (`main.js` -> `preload.js` -> `renderer.js`).
    - Sistema Web Remoto & Vercel API (`loord-auth.vercel.app`): HWID SHA-256, Heartbeat contínuo de 5 min, Gateway PIX integrado.
    - Segurança Militar Zero-Trust: IPC Interceptor, Whitelist de canais públicos, Anti-Debugging CLI, Bloqueio de DevTools e Ofuscação com Self-Defending.
    - Regras Críticas de Integridade do Emulador (`safeWriteBluestacksConf`, preservação compulsória de chaves de hypervisor e adblock não destrutivo).
    - Detalhamento de todos os módulos (Regis, 35 Otimizações PC, GPO de Energia, Métodos 1 e 2 de FPS, Overclock XMP/BIOS).
    - Design System Gamer e Workflow Oficial de Release.
  * [.agents/diario.md](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/.agents/diario.md) — Diário de alterações e histórico consolidado.
* **Resumo das Ações:**
  - Estruturação completa do repositório de conhecimento para que qualquer agente ou desenvolvedor conheça 100% da arquitetura do projeto.
  - Registro de todas as convenções mandatórias para manter o sistema protegido contra quebras de emulador e cracks.

---

## 📅 [31/08/2026] — Release v3.7.3: Segundo Card de Desbloqueio de FPS (Método Clássico)
* **Versão Publicada:** `v3.7.3`
* **Arquivos Modificados:**
  * [index.html](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/index.html)
  * [main.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/main.js)
  * [preload.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/preload.js)
  * [renderer.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/renderer.js)
  * [package.json](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/package.json)
* **Resumo das Ações:**
  - Criação do segundo card na aba **Emulador + FPS**: **`⚡ Desbloquear FPS Clássico (Método 2 - High FPS 0 & 999 FPS)`**.
  - O Método 2 reproduz o padrão do script antigo do usuário:
    - `bst.instance.*.enable_high_fps="0"`
    - `bst.instance.*.max_fps="999"`
    - `bst.mim.max_fps="<hz selecionado>"`
  - Mantido o Método 1 para PCs fracos e emuladores v5.9/5.12/5.21/5.22 (`enable_high_fps="1"`, `eco_mode_max_fps="10"`).
  - Ambos os métodos conectados ao motor blindado de escrita atômica (`safeWriteBluestacksConf`).
  - Compilação com ofuscação militar e publicação da release `v3.7.3` no GitHub.

---

## 📅 [31/08/2026] — Release v3.7.2: Blindagem Definitiva do BlueStacks 5 & Método 1 de FPS
* **Versão Publicada:** `v3.7.2`
* **Arquivos Modificados:**
  * [main.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/main.js)
  * [preload.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/preload.js)
  * [renderer.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/renderer.js)
  * [index.html](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/index.html)
  * [package.json](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/package.json)
  * `C:\ProgramData\BlueStacks_nxt\bluestacks.conf`
* **Resumo das Ações:**
  - **Diagnóstico do erro *"Cannot start BlueStacks: Failed to read configuration file"*:**
    - Identificada incompatibilidade de hypervisor (`vbox` vs `hyperv`) e versão antiga injetada por restore.
    - Identificada concorrência de escrita com o serviço `BstkSVC.exe` do BlueStacks 5 ao usar `fs.writeFileSync`.
    - Identificada exclusão indevida de chaves estruturais de anúncios em `sanitizeBluestacksConfFiles()`.
  - **Criação da Gravação Atômica Blindada (`safeWriteBluestacksConf`):**
    - Gravação atômica via `.tmp` e substituição direta com `fs.renameSync`.
    - Preservação obrigatória de chaves de integridade (`bst.status.hypervisor`, `bst.launcher_version`, `bst.machine_id`, etc.).
  - Remoção da sanitização automática destrutiva ao abrir o painel (`app.whenReady()`).
  - Restauração do arquivo limpo 100% funcional em `C:\ProgramData\BlueStacks_nxt\bluestacks.conf`.
  - Atualização do Desbloqueio de FPS Método 1 com `max_fps="999"`, `enable_high_fps="1"`, `eco_mode_max_fps="10"` e `mim.max_fps="<hz>"`.
  - Build, ofuscação e upload da release `v3.7.2` no GitHub.

---

## 📅 [30/08/2026] — Release v3.7.1: Diretivas GPO de Energia, Botões Gamer e Termos de Overclock
* **Versão Publicada:** `v3.7.1`
* **Arquivos Modificados:**
  * [main.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/main.js)
  * [index.html](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/index.html)
  * [style.css](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/style.css)
  * [renderer.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/renderer.js)
  * [package.json](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/package.json)
* **Resumo das Ações:**
  - **Diretivas de Grupo (GPO / gpedit.msc) de Energia:**
    - Criada a opção `Desativar Limitação & Economia (GPO)` na aba "Otimizar PC".
    - Desativa Power Throttling (`PowerThrottlingOff = 1`) nas colmeias `SYSTEM` e `SOFTWARE\Policies`.
    - Zera limites de economia de bateria na tomada e na bateria (`ACSettingIndex = 0`, `DCSettingIndex = 0`, `ESBATTTHRESHOLD = 0`).
  - **Novos Botões de Janela Gamer no Padrão de Emulador:**
    - Substituição das 3 bolinhas estilo Mac por botões retangulares estilizados (`36px × 26px`) com símbolos em vetor SVG: `—` (Minimizar), `▢` (Maximizar), `✕` (Fechar).
    - Micro-animação de hover com elevação suave, brilho ciano neon e rotação suave de 90° no botão de fechar.
  - **XMP / EXPO com Reinicialização Direta na BIOS:**
    - Botão de 1 clique que dispara `shutdown.exe /r /fw /t 2`, levando o usuário direto para a BIOS sem precisar apertar teclas.
  - **Modal de Consentimento e Alertas Térmicos de Overclock:**
    - Bloqueio de acesso à aba Overclock até o usuário ler e assinar o termo de responsabilidade com checkbox obrigatório.
  - **Scrollbar Personalizada no Menu Lateral:**
    - Inserção de barra de rolagem fina (5px) em degradê azul/ciano com cantos arredondados na classe `.nav-menu`.

---

## 📅 [30/08/2026] — Release v3.7.0: Blindagem Militar Anti-Crack e Zero-Trust
* **Versão Publicada:** `v3.7.0`
* **Arquivos Modificados:**
  * [main.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/main.js)
  * [scripts/obfuscate.js](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/scripts/obfuscate.js)
  * [package.json](file:///c:/Users/Gabriel/Downloads/Configuração emulador/Nova pasta (4)/package.json)
* **Resumo das Ações:**
  - Implementação do Interceptor Zero-Trust no `ipcMain.handle`.
  - Bloqueio de injeção de parâmetros de linha de comando (`--remote-debugging`, `--inspect`, etc.).
  - Desativação do menu de contexto e atalhos DevTools em produção.
  - Heartbeat em segundo plano com timeout de 5 minutos para auto-bloqueio em caso de licença revogada.
  - Atualização do `scripts/obfuscate.js` com `selfDefending`, `controlFlowFlattening` e detecção anti-duplicação.
