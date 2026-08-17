@echo off
chcp 65001 >nul
title Executar Otimizador de Sensibilidade
echo.
echo ========================================================
echo   ABRINDO OTIMIZADOR DE SENSIBILIDADE NO POWERSHELL...
echo ========================================================
echo.
:: Executa o script do PowerShell bypassando a política de execução e solicitando admin
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0otimizar_sensibilidade.ps1\"'"
exit
