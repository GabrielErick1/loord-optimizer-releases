@echo off
chcp 65001 >nul
title Finalizar FFOptimizer
echo.
echo ========================================================
echo   FECHANDO INSTÂNCIAS ANTIGAS DO FFOptimizer...
echo ========================================================
echo.
taskkill /f /im FFOptimizer.exe
taskkill /f /im electron.exe
echo.
echo ========================================================
echo   Processos finalizados! Você pode fechar esta janela.
echo ========================================================
echo.
pause
