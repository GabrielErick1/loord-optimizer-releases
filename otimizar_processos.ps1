# FFOptimizer - Reducao Agressiva de Processos
# Objetivo: Deixar apenas processos ESSENCIAIS do Windows + Emulador
# Alvos de encerramento: navegadores, atualizadores, telemetria, apps de fundo

$before = (Get-Process).Count
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   FFOPTIMIZER - REDUCAO AGRESSIVA DE PROCESSOS         " -ForegroundColor Green
Write-Host "   Processos Antes: $before" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# =============================================================
# ETAPA 1: Matar todos os navegadores e apps pesados
# =============================================================
Write-Host "[1/5] Encerrando navegadores e apps pesados..." -ForegroundColor Cyan
$heavyApps = @(
    'chrome','msedge','firefox','opera','brave','opera_gx',
    'iexplore','360browser','vivaldi','chromium',
    'Spotify','SpotifyWebHelper',
    'Discord','DiscordPTB','DiscordCanary','DiscordSystemHelper','DiscordHelper',
    'slack','Teams','ms-teams','msteams',
    'zoom','ZoomOutlookPlugin','CptHost',
    'Skype','SkypeApp','SkypeBackgroundHost',
    'iTunesHelper','iTunes','AppleMobileDeviceService',
    'Steam','SteamService','steamwebhelper','GameOverlayUI','steam',
    'EpicGamesLauncher','EpicWebHelper',
    'RiotClientServices','RiotClientCrashHandler',
    'GalaxyClient','GalaxyClientService','GOGGalaxy',
    'battle.net','Agent','Blizzard Update Agent',
    'Origin','OriginWebHelperService','OriginClientService',
    'upc','UbisoftConnect',
    'Telegram','WhatsApp',
    'Code','devenv','rider','idea64'
)
$killed = 0
foreach ($p in $heavyApps) {
    if (Get-Process -Name $p -ErrorAction SilentlyContinue) {
        Stop-Process -Name $p -Force -ErrorAction SilentlyContinue
        $killed++
    }
}
Write-Host "  -> $killed tipos de apps encerrados." -ForegroundColor Green

# =============================================================
# ETAPA 2: Matar bloatware, atualizadores e telemetria de terceiros
# =============================================================
Write-Host ""
Write-Host "[2/5] Encerrando bloatware e atualizadores de segundo plano..." -ForegroundColor Cyan
$bloatware = @(
    'OneDrive','OneDriveSetup','OneDriveUpdater',
    'MicrosoftEdgeUpdate','edgeupdate','edgeupdatem',
    'GoogleUpdate','GoogleCrashHandler','GoogleCrashHandler64',
    'AdobeUpdateService','AdobeIPCBroker','AdobeCollabSync',
    'CCXProcess','CCLibrary','AdobeGCInvoker','AGSService',
    'NvTelemetryContainer','nvsphelper64',
    'RadeonSoftware','RadeoncnUser','CNext','AMDCrashDefender',
    'RazerCentralService','RzSDKService','RGSUpdater',
    'LGHUBUpdaterService','logi_crashpad_handler',
    'SteelSeriesEngine','SteelSeriesGG',
    'Cortana',
    'GameBarPresenceWriter','GameBar','GameBarFTServer',
    'XboxPcApp','XboxApp','XboxGameBarSpotify',
    'Widgets','WidgetService','widgetservice',
    'PhoneExperienceHost','YourPhone','YourPhoneServer',
    'AcrobatNotificationClient','EpicWebHelper'
)
$killed2 = 0
foreach ($p in $bloatware) {
    if (Get-Process -Name $p -ErrorAction SilentlyContinue) {
        Stop-Process -Name $p -Force -ErrorAction SilentlyContinue
        $killed2++
    }
}
Write-Host "  -> $killed2 tipos de bloatware encerrados com segurança." -ForegroundColor Green

# =============================================================
# ETAPA 3: Parar servicos nao essenciais
# =============================================================
Write-Host ""
Write-Host "[3/5] Parando servicos nao essenciais..." -ForegroundColor Cyan
$services = @(
    'SysMain',          # SuperFetch - consome RAM
    'DiagTrack',        # Telemetria Windows
    'WSearch',          # Indexador de busca
    'Fax',              # Fax do Windows
    'wuauserv',         # Windows Update (pausado em jogo)
    'BITS',             # Background Intelligent Transfer
    'dosvc',            # Otimizacao de entrega
    'dmwappushservice', # Push de dados Microsoft
    'MapsBroker',       # Mapas offline
    'PcaSvc',           # Assistente de compatibilidade
    'PhoneSvc',         # Servico de telefone
    'RemoteRegistry',   # Registro remoto
    'SensorService',    # Sensores
    'Spooler',          # Impressora
    'TabletInputService',# Tablet
    'TrkWks',           # Link de rastreamento
    'WalletService',    # Carteira
    'XblAuthManager',   # Xbox auth
    'XblGameSave',      # Xbox save
    'XboxNetApiSvc',    # Xbox rede
    'XboxGipSvc',       # Xbox controller
    'WerSvc',           # Relatorio de erros
    'RetailDemo',       # Modo loja
    'icssvc',           # Hotspot
    'DownloadedMapsManager', # Mapas
    'shpamsvc',         # Gerenciador de pacotes
    'WbioSrvc',         # Biometria
    'WMPNetworkSvc',    # Media Player rede
    'lfsvc',            # Localizacao geografica
    'bthserv',          # Bluetooth (descomente se nao usar BT)
    'SharedAccess',     # Compartilhamento de internet
    'wisvc'             # Windows Insider
)
foreach ($svc in $services) {
    Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
}
Write-Host "  -> Servicos de telemetria, Xbox, BITS, impressora e outros pausados." -ForegroundColor Green

# =============================================================
# ETAPA 4: Agrupar svchost (reduz de 60 para ~12 pos-reboot)
# =============================================================
Write-Host ""
Write-Host "[4/5] Configurando agrupamento de svchost (efeito apos reiniciar)..." -ForegroundColor Cyan
try {
    Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control' `
        -Name 'SvcHostSplitThresholdInKB' -Value 4294967295 -Type DWord -Force -ErrorAction SilentlyContinue
    Write-Host "  -> SvcHostSplitThresholdInKB ativado (os 60 svchost viram ~12 ao reiniciar)." -ForegroundColor Green
} catch {}

# =============================================================
# ETAPA 5: Elevar emuladores / jogo para prioridade ALTA
# =============================================================
Write-Host ""
Write-Host "[5/5] Elevando prioridade do emulador para ALTA..." -ForegroundColor Cyan
$gameApps = @('HD-Player','dnplayer','LdBoxHeadless','Nox','NoxVMHandle','MEmu','BlueStacks','BlueStacksServices','BstkSVC','BlueStacksHelper','MSIAppPlayer','HD-Frontend','HD-Agent')
$boosted = 0
Get-Process | Where-Object { $gameApps -contains $_.ProcessName } | ForEach-Object {
    try { $_.PriorityClass = 'High'; $boosted++ } catch {}
}
Write-Host "  -> $boosted processos do emulador com prioridade ALTA." -ForegroundColor Green

# Resultado final
Start-Sleep -Milliseconds 500
$after = (Get-Process).Count
$diff  = $before - $after

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host " REDUCAO CONCLUIDA!" -ForegroundColor Green
Write-Host " Antes: $before  Agora: $after  Reduzidos: $diff processos" -ForegroundColor Yellow
if ($after -le 120) {
    Write-Host " META ATINGIDA: menos de 120 processos!" -ForegroundColor Cyan
} else {
    Write-Host " Reinicie o PC para aplicar o agrupamento svchost (~60 viram ~12)" -ForegroundColor Cyan
}
Write-Host "========================================================" -ForegroundColor Green
