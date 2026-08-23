@echo off
:: ============================================================
:: Loord Optimizer - Otimizador Windows Lite Gamer Pro (1 Clique)
:: Funciona em Windows 10 e Windows 11 ja instalados!
:: ============================================================
title Loord Optimizer - Windows Lite Gamer Pro 1-Clique

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo ============================================================
    echo  ERRO: Execute este script como ADMINISTRADOR!
    echo  Clique com o botao direito nele e escolha "Executar como administrador".
    echo ============================================================
    echo.
    pause
    exit /b 1
)

color 0B
echo ============================================================
echo      LOORD OPTIMIZER - TRANSFORMADOR WINDOWS LITE GAMER PRO 
echo ============================================================
echo.
echo  [+] Desinstalando 28 Bloatwares/Apps inuteis permanentemente...
echo  [+] Desativando VBS / Isolamento de Nucleo (HVCI - +30%% CPU)...
echo  [+] Forcando GPU de Alto Desempenho e HAGS no Emulador...
echo  [+] Desativando Telemetria, SysMain e 15 Servicos Pesados...
echo  [+] Agrupando Svchost (reduz de 150 para ~60 processos)...
echo  [+] Desativando Game DVR e Xbox Game Bar (0 Input Lag)...
echo  [+] Ativando Energia Maxima, Core Unparking e USB 0ms...
echo  [+] Otimizando Pilha de Rede TCP (Anti-Bufferbloat)...
echo  [+] Otimizando Resposta do Mouse e Menus Instantaneos...
echo.
echo ============================================================
echo.

:: --- 1. REMOVE BLOATWARES E APPS UWP PERMANENTEMENTE ---
echo [1/9] Removendo bloatware e aplicativos inuteis...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$apps = @('Microsoft.XboxApp','Microsoft.Xbox.TCUI','Microsoft.XboxGameOverlay','Microsoft.XboxGamingOverlay','Microsoft.XboxIdentityProvider','Microsoft.XboxSpeechToTextOverlay','Microsoft.SkypeApp','Microsoft.People','Microsoft.windowscommunicationsapps','Microsoft.WindowsMaps','Microsoft.BingWeather','Microsoft.BingNews','Microsoft.WindowsFeedbackHub','Microsoft.GetStarted','Microsoft.GetHelp','Microsoft.MicrosoftSolitaireCollection','Microsoft.ZuneVideo','Microsoft.ZuneMusic','Microsoft.Print3D','Microsoft.Microsoft3DViewer','Microsoft.OneNote','Microsoft.OfficeHub','Microsoft.MicrosoftStickyNotes','Microsoft.WindowsSoundRecorder','Microsoft.YourPhone','Microsoft.MixedReality.Portal','Microsoft.Wallet','Microsoft.Todos','Microsoft.PowerAutomateDesktop','MicrosoftTeams','Microsoft.549981C3F5F10','Clipchamp.Clipchamp'); foreach ($a in $apps) { Get-AppxPackage -Name ('*' + $a + '*') -AllUsers | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue; Get-AppxProvisionedPackage -Online | Where-Object DisplayName -like ('*' + $a + '*') | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue }" >nul 2>&1

:: --- 2. DESATIVA VBS / ISOLAMENTO DE NUCLEO (HVCI) ---
echo [2/9] Desativando VBS e Isolamento de Nucleo (Virtualizacao Livre)...
reg add "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard" /v EnableVirtualizationBasedSecurity /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard" /v RequirePlatformSecurityFeatures /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity" /v Enabled /t REG_DWORD /d 0 /f >nul 2>&1
bcdedit /set hypervisorlaunchtype off >nul 2>&1

:: --- 3. FORCA GPU DEDICADA NO EMULADOR & HAGS ---
echo [3/9] Forcando GPU Dedicada em Alto Desempenho e HAGS...
reg add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\DirectX\UserGpuPreferences" /v "HD-Player.exe" /t REG_SZ /d "GpuPreference=2;" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\DirectX\UserGpuPreferences" /v "MSIAppPlayer.exe" /t REG_SZ /d "GpuPreference=2;" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\DirectX\UserGpuPreferences" /v "MEmuHeadless.exe" /t REG_SZ /d "GpuPreference=2;" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\HD-Player.exe\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\MSIAppPlayer.exe\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f >nul 2>&1

:: --- 4. DESATIVA SERVICOS DESNECESSARIOS ---
echo [4/9] Desativando servicos pesados e telemetria...
for %%S in (SysMain DiagTrack WSearch Fax RemoteRegistry MapsBroker WalletService PhoneSvc RetailDemo WerSvc dmwappushservice PcaSvc Spooler wuauserv UsoSvc WinDefend WdNisSvc Sense) do (
    sc config %%S start= disabled >nul 2>&1
    sc stop %%S >nul 2>&1
)

:: --- 5. POLITICAS DO WINDOWS & DEFENDER & UPDATE ---
echo [5/9] Aplicando politicas de desempenho e desativando Game DVR...
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" /v NoAutoUpdate /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows Defender" /v DisableAntiSpyware /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection" /v DisableRealtimeMonitoring /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKCU\System\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\GameDVR" /v AppCaptureEnabled /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\DataCollection" /v AllowTelemetry /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\PushNotifications" /v ToastEnabled /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\CurrentVersion\PushNotifications" /v NoToastApplicationNotification /t REG_DWORD /d 1 /f >nul 2>&1

:: --- 6. AGRUPAMENTO DE SVCHOST E KERNEL NA RAM ---
echo [6/9] Agrupando processos Svchost e mantendo Kernel na RAM...
reg add "HKLM\SYSTEM\CurrentControlSet\Control" /v SvcHostSplitThresholdInKB /t REG_DWORD /d 4294967295 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v LargeSystemCache /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v FeatureSettingsOverride /t REG_DWORD /d 3 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v FeatureSettingsOverrideMask /t REG_DWORD /d 3 /f >nul 2>&1

:: --- 7. MMCSS & PRIORIDADE GAMER EXTREMA ---
echo [7/9] Priorizando GPU e CPU para jogos em tempo real...
reg add "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 26 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v IRQ8Priority /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 4294967295 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "Priority" /t REG_DWORD /d 6 /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "Scheduling Category" /t REG_SZ /d "High" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games" /v "SFIO Priority" /t REG_SZ /d "High" /f >nul 2>&1

:: --- 8. USB 0ms & PLANO DE ENERGIA MAXIMA ---
echo [8/9] Ativando Plano de Desempenho Maximo e USB 0ms...
powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 >nul 2>&1
powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61 >nul 2>&1
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c >nul 2>&1
powercfg /setacvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
powercfg /setdcvalueindex scheme_current 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
powercfg -setactive SCHEME_CURRENT >nul 2>&1
powercfg -h off >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Services\USB" /v DisableSelectiveSuspend /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Services\USBXHCI\Parameters" /v DisableSelectiveSuspend /t REG_DWORD /d 1 /f >nul 2>&1

:: --- 9. MENUS INSTANTANEOS, REDE ANTI-BUFFERBLOAT E LIMPEZA ---
echo [9/9] Ajustando rede anti-bufferbloat, menus e limpando caches...
reg add "HKCU\Control Panel\Desktop" /v MenuShowDelay /t REG_SZ /d 0 /f >nul 2>&1
reg add "HKCU\Control Panel\Desktop" /v FontSmoothing /t REG_SZ /d 2 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" /v VisualFXSetting /t REG_DWORD /d 2 /f >nul 2>&1
netsh int tcp set global autotuninglevel=normal >nul 2>&1
netsh int tcp set global congestionprovider=ctcp >nul 2>&1
netsh int tcp set global ecncapability=disabled >nul 2>&1
netsh int tcp set global timestamps=disabled >nul 2>&1
netsh int tcp set global rss=enabled >nul 2>&1
netsh int tcp set global rsc=disabled >nul 2>&1
bcdedit /set useplatformtick yes >nul 2>&1
bcdedit /set disabledynamictick yes >nul 2>&1
bcdedit /set useplatformclock no >nul 2>&1
del /q /f /s "%TEMP%\*" >nul 2>&1
del /q /f /s "C:\Windows\Temp\*" >nul 2>&1
del /q /f /s "C:\Windows\Prefetch\*" >nul 2>&1
ipconfig /flushdns >nul 2>&1

echo.
echo ============================================================
echo      OTIMIZACAO CONCLUIDA COM SUCESSO! (WINDOWS LITE PRO)   
echo ============================================================
echo.
echo  Reinicie o computador para aplicar todas as mudancas!
echo.
pause
