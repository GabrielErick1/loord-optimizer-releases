!macro customInit
  ; 1. Força o encerramento imediato de qualquer processo antigo ou crackeado rodando
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "Loord Optimizer.exe" /T >nul 2>&1'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "elevate.exe" /T >nul 2>&1'
  
  ; 2. Limpa arquivos temporários antigos de atualizadores e caches soltos
  nsExec::Exec 'cmd.exe /c del /q /f "%TEMP%\LoordOptimizer_Update_Setup.exe" >nul 2>&1'
  nsExec::Exec 'cmd.exe /c del /q /f "%TEMP%\run_loord_update.cmd" >nul 2>&1'
  nsExec::Exec 'cmd.exe /c del /q /f "%TEMP%\loord_update_and_restart.bat" >nul 2>&1'
!macroend

!macro customInstall
  ; Mata qualquer processo residual antes da cópia dos arquivos
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "Loord Optimizer.exe" /T >nul 2>&1'
!macroend

!macro customInstallCompleted
  ; Garante que o atalho da Área de Trabalho aponte SEMPRE para a versão oficial protegida
  SetShellVarContext all
  CreateShortCut "$DESKTOP\Loord Optimizer.lnk" "$INSTDIR\Loord Optimizer.exe" "" "$INSTDIR\Loord Optimizer.exe" 0
  CreateDirectory "$SMPROGRAMS\Loord Optimizer"
  CreateShortCut "$SMPROGRAMS\Loord Optimizer\Loord Optimizer.lnk" "$INSTDIR\Loord Optimizer.exe" "" "$INSTDIR\Loord Optimizer.exe" 0

  ; Se a instalação for silenciosa (chamada pelo atualizador antigo), inicia a nova versão blindada imediatamente
  IfSilent 0 +2
    Exec '"$INSTDIR\Loord Optimizer.exe"'
!macroend

!macro customUnInstall
  ; 1. Mata processos do Loord Optimizer
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "Loord Optimizer.exe" /T >nul 2>&1'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "elevate.exe" /T >nul 2>&1'

  ; 2. Restaura backups originais do registro se existirem
  nsExec::Exec 'cmd.exe /c for /r "$LOCALAPPDATA\LoordOptimizer" %f in (*.reg) do reg import "%f" >nul 2>&1'
  nsExec::Exec 'cmd.exe /c for /r "$APPDATA\LoordOptimizer" %f in (*.reg) do reg import "%f" >nul 2>&1'

  ; 3. Restaura configurações padrão de Mouse do Windows
  nsExec::Exec 'reg add "HKCU\Control Panel\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f'
  nsExec::Exec 'reg add "HKCU\Control Panel\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f'
  nsExec::Exec 'reg add "HKCU\Control Panel\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f'
  nsExec::Exec 'reg add "HKCU\Control Panel\Mouse" /v MouseSensitivity /t REG_SZ /d "10" /f'
  nsExec::Exec 'reg add "HKCU\Control Panel\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d 0000000000000000156e000000000000004001000000000029dc0300000000000000280000000000 /f'
  nsExec::Exec 'reg add "HKCU\Control Panel\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d 0000000000000000fd11010000000000002404000000000000fc1200000000000000bd0400000000 /f'
  nsExec::Exec 'reg add "HKLM\SYSTEM\CurrentControlSet\Services\mouclass\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 100 /f'

  ; 4. Restaura Plano de Energia Equilibrado
  nsExec::Exec 'powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e'

  ; 5. Restaura DNS para DHCP e limpa cache
  nsExec::Exec 'powershell.exe -NoProfile -Command "Get-NetAdapter | Where-Object Status -eq Up | ForEach-Object { netsh interface ip set dns name=\\\"$($_.Name)\\\" source=dhcp; netsh interface ip set wins name=\\\"$($_.Name)\\\" source=dhcp }"'
  nsExec::Exec 'ipconfig /flushdns'

  ; 6. Reativa serviços padrão do Windows
  nsExec::Exec 'sc config SysMain start= auto'
  nsExec::Exec 'sc start SysMain'
  nsExec::Exec 'sc config WSearch start= auto'
  nsExec::Exec 'sc start WSearch'
!macroend
