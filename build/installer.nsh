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
