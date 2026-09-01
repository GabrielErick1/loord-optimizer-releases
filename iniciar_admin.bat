@echo off
cd /d "%~dp0"
echo [LOORD OPTIMIZER] Iniciando com privilegios de Administrador...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'node_modules\electron\dist\electron.exe' -ArgumentList '.' -Verb RunAs -WorkingDirectory '%~dp0'"
