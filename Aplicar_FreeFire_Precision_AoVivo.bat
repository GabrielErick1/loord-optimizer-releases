@echo off
title FREE FIRE - PRECISION INSTANTANEO (sem reiniciar)
color 0A

echo ================================================
echo   FREE FIRE PRECISION - aplicacao NA HORA
echo   nao precisa reiniciar o PC
echo ================================================
echo.

echo [1/3] Gravando configuracoes de mira na sua conta...
reg add "HKCU\Control Panel\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f >nul
reg add "HKCU\Control Panel\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f >nul
reg add "HKCU\Control Panel\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f >nul
reg add "HKCU\Control Panel\Mouse" /v MouseSensitivity /t REG_SZ /d 10 /f >nul
reg add "HKCU\Control Panel\Mouse" /v MouseHoverTime /t REG_SZ /d 10 /f >nul
reg add "HKCU\Control Panel\Mouse" /v SnapToDefaultButton /t REG_SZ /d 0 /f >nul
reg add "HKCU\Control Panel\Mouse" /v MouseTrails /t REG_SZ /d 0 /f >nul
reg add "HKCU\Control Panel\Mouse" /v SmoothMouseXCurve /t REG_BINARY /d 0000000000000000156e000000000000004001000000000029dc0300000000000000280000000000ffff0f0000000000 /f >nul
reg add "HKCU\Control Panel\Mouse" /v SmoothMouseYCurve /t REG_BINARY /d 0000000000000000fd11010000000000002404000000000000fc12000000000000c0bb01000000000000580200000000 /f >nul
reg add "HKCU\Control Panel\Desktop" /v MenuShowDelay /t REG_SZ /d 0 /f >nul
reg add "HKCU\Control Panel\Desktop" /v ForegroundLockTimeout /t REG_DWORD /d 0 /f >nul
reg add "HKCU\Control Panel\Desktop" /v ForegroundFlashCount /t REG_DWORD /d 0 /f >nul

echo [2/3] Desligando Game DVR e ligando Game Mode...
reg add "HKCU\System\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f >nul
reg add "HKCU\System\GameConfigStore" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 2 /f >nul
reg add "HKCU\System\GameConfigStore" /v GameDVR_HonorUserFSEBehaviorMode /t REG_DWORD /d 1 /f >nul
reg add "HKCU\System\GameConfigStore" /v GameDVR_DXGIHonorFSEWindowsCompatible /t REG_DWORD /d 1 /f >nul
reg add "HKCU\System\GameConfigStore" /v GameDVR_EFSEFeatureFlags /t REG_DWORD /d 0 /f >nul
reg add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" /v AppCaptureEnabled /t REG_DWORD /d 0 /f >nul
reg add "HKCU\Software\Microsoft\GameBar" /v AutoGameModeEnabled /t REG_DWORD /d 1 /f >nul
reg add "HKCU\Software\Microsoft\GameBar" /v AllowAutoGameMode /t REG_DWORD /d 1 /f >nul
reg add "HKCU\Software\Microsoft\GameBar" /v UseNexusForGameBarEnabled /t REG_DWORD /d 0 /f >nul

echo [3/3] Aplicando ao vivo (sem precisar reiniciar)...
powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand JABzAD0AQAAnAAoAWwBEAGwAbABJAG0AcABvAHIAdAAoACIAdQBzAGUAcgAzADIALgBkAGwAbAAiACkAXQAgAHAAdQBiAGwAaQBjACAAcwB0AGEAdABpAGMAIABlAHgAdABlAHIAbgAgAGIAbwBvAGwAIABTAHkAcwB0AGUAbQBQAGEAcgBhAG0AZQB0AGUAcgBzAEkAbgBmAG8AKAB1AGkAbgB0ACAAYQAsACAAdQBpAG4AdAAgAGIALAAgAGkAbgB0AFsAXQAgAGMALAAgAHUAaQBuAHQAIABkACkAOwAKAFsARABsAGwASQBtAHAAbwByAHQAKAAiAHUAcwBlAHIAMwAyAC4AZABsAGwAIgAsACAARQBuAHQAcgB5AFAAbwBpAG4AdAA9ACIAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvAFcAIgApAF0AIABwAHUAYgBsAGkAYwAgAHMAdABhAHQAaQBjACAAZQB4AHQAZQByAG4AIABiAG8AbwBsACAAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvAFAAdAByACgAdQBpAG4AdAAgAGEALAAgAHUAaQBuAHQAIABiACwAIABJAG4AdABQAHQAcgAgAGMALAAgAHUAaQBuAHQAIABkACkAOwAKACcAQAAKAEEAZABkAC0AVAB5AHAAZQAgAC0ATgBhAG0AZQBzAHAAYQBjAGUAIABXACAALQBOAGEAbQBlACAATQAgAC0ATQBlAG0AYgBlAHIARABlAGYAaQBuAGkAdABpAG8AbgAgACQAcwAKAFsAVwAuAE0AXQA6ADoAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvACgANAAsADAALABbAGkAbgB0AFsAXQBdAEAAKAAwACwAMAAsADAAKQAsADMAKQAKAFsAVwAuAE0AXQA6ADoAUwB5AHMAdABlAG0AUABhAHIAYQBtAGUAdABlAHIAcwBJAG4AZgBvAFAAdAByACgAMAB4ADcAMQAsADAALABbAEkAbgB0AFAAdAByAF0AMQAwACwAMwApAAoAWwBXAC4ATQBdADoAOgBTAHkAcwB0AGUAbQBQAGEAcgBhAG0AZQB0AGUAcgBzAEkAbgBmAG8AUAB0AHIAKAAwAHgANgBCACwAMAAsAFsASQBuAHQAUAB0AHIAXQAwACwAMwApAAoAWwBXAC4ATQBdADoAOgBTAHkAcwB0AGUAbQBQAGEAcgBhAG0AZQB0AGUAcgBzAEkAbgBmAG8AUAB0AHIAKAAwAHgANQBGACwAMAAsAFsASQBuAHQAUAB0AHIAXQAwACwAMwApAAoA

echo.
echo ================================================
echo   PRONTO! Mira PRECISION aplicada AGORA.
echo.
echo   - Aceleracao OFF em tempo real
echo   - Sensibilidade 10 (meio termo) em tempo real
echo   - Nada puxa seu cursor mais
echo.
echo   So falta uma coisa: REABRA O FREE FIRE /
echo   o emulador para ele nascer com as novas
echo   configuracoes de jogo.
echo ================================================
pause
