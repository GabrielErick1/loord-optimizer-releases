# Otimizador de Sensibilidade, Latência e Emulador (Versão Gamer Avançada)
# Customizado para BlueStacks MSI5 e BlueStacks NXT (Free Fire)

$backupDir = "$PSScriptRoot\Backup_Sensibilidade"
$msiConf = "$PSScriptRoot\BlueStacks_msi5\bluestacks.conf"
$nxtConf = "$PSScriptRoot\BlueStacks_nxt\bluestacks.conf"

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "Este script precisa ser executado como Administrador para modificar registros do sistema." -ForegroundColor Red
    Write-Host "Reiniciando com privilégios de Administrador..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

function Show-Header {
    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "      OTIMIZADOR DE SENSIBILIDADE & EMULADOR FREE FIRE   " -ForegroundColor Green
    Write-Host "       (Foco em: Subir Capa, Não Pinar, Sem Pular Pixel) " -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Create-Backup {
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    
    Write-Host "[*] Criando backups das chaves originais do registro..." -ForegroundColor Yellow
    reg export "HKCU\Control Panel\Mouse" "$backupDir\Mouse_Original.reg" /y | Out-Null
    reg export "HKCU\Control Panel\Accessibility" "$backupDir\Accessibility_Original.reg" /y | Out-Null
    reg export "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" "$backupDir\PriorityControl_Original.reg" /y | Out-Null
    reg export "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile" "$backupDir\SystemProfile_Original.reg" /y | Out-Null
    reg export "HKLM\SYSTEM\CurrentControlSet\Services\mouclass\Parameters" "$backupDir\Mouclass_Original.reg" /y | Out-Null
    reg export "HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters" "$backupDir\Kbdclass_Original.reg" /y | Out-Null
    reg export "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\kernel" "$backupDir\Kernel_Original.reg" /y 2>$null
    reg export "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\HD-Player.exe" "$backupDir\HDPlayer_Original.reg" /y 2>$null

    # Backup dos arquivos de config do BlueStacks
    if (Test-Path $msiConf) {
        Copy-Item $msiConf "$backupDir\bluestacks_msi5.conf.bak" -Force
        Write-Host "  -> Backup de bluestacks.conf (MSI5) salvo." -ForegroundColor Green
    }
    if (Test-Path $nxtConf) {
        Copy-Item $nxtConf "$backupDir\bluestacks_nxt.conf.bak" -Force
        Write-Host "  -> Backup de bluestacks.conf (NXT) salvo." -ForegroundColor Green
    }
    
    Write-Host "[+] Backups salvos com sucesso na pasta: $backupDir" -ForegroundColor Green
}

function Restore-Backup {
    Show-Header
    if (-not (Test-Path $backupDir)) {
        Write-Host "[-] Nenhum backup encontrado na pasta!" -ForegroundColor Red
        return
    }
    
    Write-Host "[*] Restaurando registros originais do Windows..." -ForegroundColor Yellow
    Get-ChildItem -Path $backupDir -Filter "*.reg" | ForEach-Object {
        Write-Host " -> Restaurando: $_.Name" -ForegroundColor Cyan
        Start-Process reg -ArgumentList "import `"$($_.FullName)`"" -Wait -WindowStyle Hidden
    }
    
    # Reverter bcdedit
    bcdedit /deletevalue useplatformtick 2>$null | Out-Null
    
    # Restaurar arquivos de config do BlueStacks
    if (Test-Path "$backupDir\bluestacks_msi5.conf.bak") {
        Copy-Item "$backupDir\bluestacks_msi5.conf.bak" $msiConf -Force
        Write-Host "  -> Configuração original do MSI5 restaurada." -ForegroundColor Green
    }
    if (Test-Path "$backupDir\bluestacks_nxt.conf.bak") {
        Copy-Item "$backupDir\bluestacks_nxt.conf.bak" $nxtConf -Force
        Write-Host "  -> Configuração original do NXT restaurada." -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "[+] Configurações restauradas com sucesso! Reinicie o PC." -ForegroundColor Green
}

function Update-BlueStacks-Conf {
    param(
        [string]$confPath,
        [int]$newDpi,
        [int]$maxFps,
        [string]$deviceBrand,
        [string]$deviceModel,
        [string]$deviceManufacturer
    )
    if (-not (Test-Path $confPath)) { return $false }
    
    $lines = Get-Content $confPath
    $newLines = @()
    
    foreach ($line in $lines) {
        # Substitui o DPI
        if ($line -match '^bst\.instance\.(?<inst>.*?)\.dpi="(?<dpi>\d+)"') {
            $inst = $Matches['inst']
            $line = "bst.instance.$inst.dpi=`"$newDpi`""
        }
        # Ativa FPS Alto
        elseif ($line -match '^bst\.instance\.(?<inst>.*?)\.enable_high_fps="(?<val>\d+)"') {
            $inst = $Matches['inst']
            $line = "bst.instance.$inst.enable_high_fps=`"1`""
        }
        # Define limite de FPS
        elseif ($line -match '^bst\.instance\.(?<inst>.*?)\.max_fps="(?<val>\d+)"') {
            $inst = $Matches['inst']
            $line = "bst.instance.$inst.max_fps=`"$maxFps`""
        }
        # Substitui perfil do dispositivo (se solicitado)
        elseif ($deviceBrand -and ($line -match '^bst\.instance\.(?<inst>.*?)\.device_custom_brand=".*?"')) {
            $inst = $Matches['inst']
            $line = "bst.instance.$inst.device_custom_brand=`"$deviceBrand`""
        }
        elseif ($deviceModel -and ($line -match '^bst\.instance\.(?<inst>.*?)\.device_custom_model=".*?"')) {
            $inst = $Matches['inst']
            $line = "bst.instance.$inst.device_custom_model=`"$deviceModel`""
        }
        elseif ($deviceManufacturer -and ($line -match '^bst\.instance\.(?<inst>.*?)\.device_custom_manufacturer=".*?"')) {
            $inst = $Matches['inst']
            $line = "bst.instance.$inst.device_custom_manufacturer=`"$deviceManufacturer`""
        }
        $newLines += $line
    }
    
    $newLines | Out-File $confPath -Encoding utf8 -Force
    return $true
}

function Show-Guia-Sensibilidade {
    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "    SEBREDOS DA PUXADA PERFEITA (NÃO PINAR / NÃO PULAR)  " -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Para que sua mira 'grude na cabeça' e não 'pule pixel', você deve seguir" -ForegroundColor Yellow
    Write-Host "a Regra de Ouro da Sensibilidade no Emulador:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Aumente o DPI Físico do seu mouse (no software Logitech/Razer/Redragon):" -ForegroundColor Cyan
    Write-Host "   -> Use entre 800 DPI, 1200 DPI ou 1600 DPI." -ForegroundColor White
    Write-Host "   -> Mouses com DPI físico muito baixo (ex: 400 DPI) fazem a mira pular pixels" -ForegroundColor White
    Write-Host "      na tela quando você puxa rápido." -ForegroundColor White
    Write-Host ""
    Write-Host "2. Reduza a sensibilidade interna (X e Y) no emulador:" -ForegroundColor Cyan
    Write-Host "   -> Configure a sensibilidade interna entre 0.1 e 0.5." -ForegroundColor White
    Write-Host "   -> Quanto menor a sensibilidade no BlueStacks, mais suave será a puxada" -ForegroundColor White
    Write-Host "      e menor a chance da mira 'tremer' ou 'passar da cabeça'." -ForegroundColor White
    Write-Host ""
    Write-Host "3. Ative a 'Entrada Nativa' (Raw Input) no BlueStacks:" -ForegroundColor Cyan
    Write-Host "   -> Vá em Configurações do BlueStacks -> Preferências." -ForegroundColor White
    Write-Host "   -> Marque a opção 'Entrada nativa do mouse'." -ForegroundColor White
    Write-Host "   -> Isso faz o emulador ler o movimento direto do sensor do seu mouse," -ForegroundColor White
    Write-Host "      ignorando qualquer tipo de aceleração bugada do Windows." -ForegroundColor White
    Write-Host ""
    Write-Host "4. O segredo do 'Ajuste' (Tweak) nas teclas do emulador:" -ForegroundColor Cyan
    Write-Host "   -> No mapeamento de teclas do Free Fire, clique com o botão direito no botão" -ForegroundColor White
    Write-Host "      de mirar (F1 / Suspender)." -ForegroundColor White
    Write-Host "   -> Altere o valor de 'Ajuste' (Tweak) para um destes valores populares:" -ForegroundColor White
    Write-Host "      * 16450 (Mais padrão e estável para mira Y)" -ForegroundColor Green
    Write-Host "      * 21058 (Evita que a mira grude no peito do adversário)" -ForegroundColor Green
    Write-Host "      * 10    (Sensibilidade super fluida e rápida)" -ForegroundColor Green
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Read-Host "Pressione Enter para voltar ao menu..." | Out-Null
}

function Apply-All-Optimizations {
    # Verificar se o BlueStacks está aberto
    $playerRunning = Get-Process "HD-Player" -ErrorAction SilentlyContinue
    if ($playerRunning) {
        Write-Host "========================================================" -ForegroundColor Red
        Write-Host "ATENÇÃO: O BlueStacks está aberto!" -ForegroundColor Yellow
        Write-Host "Você PRECISA fechar o emulador antes de aplicar as otimizações." -ForegroundColor Yellow
        Write-Host "Caso contrário, as alterações de DPI/FPS serão apagadas." -ForegroundColor Yellow
        Write-Host "========================================================" -ForegroundColor Red
        $confirm = Read-Host "Deseja que eu feche o emulador automaticamente agora? (S/N)"
        if ($confirm -eq "S" -or $confirm -eq "s") {
            Stop-Process -Name "HD-Player" -Force -ErrorAction SilentlyContinue
            Write-Host "[+] Emulador fechado." -ForegroundColor Green
            Start-Sleep -Seconds 1
        } else {
            Write-Host "[-] Cancelado pelo usuário. Feche o emulador e tente novamente." -ForegroundColor Red
            return
        }
    }

    Show-Header
    
    # 1. Perguntar sobre DPI do Emulador
    Write-Host "Escolha o DPI otimizado para o emulador (Evita pular pixel):" -ForegroundColor Cyan
    Write-Host "1) 440 DPI (Excelente para mira estável X e Y)"
    Write-Host "2) 480 DPI (Muito popular, mira não passa da cabeça)"
    Write-Host "3) 800 DPI (Sensibilidade rápida e movimentos limpos)"
    Write-Host "4) 1000 DPI (Sensibilidade extrema para movimentação rápida)"
    Write-Host "5) Manter atual / Digitar valor personalizado"
    $dpiChoice = Read-Host "Opção (1-5)"
    
    $finalDpi = 480
    if ($dpiChoice -eq "1") { $finalDpi = 440 }
    elseif ($dpiChoice -eq "2") { $finalDpi = 480 }
    elseif ($dpiChoice -eq "3") { $finalDpi = 800 }
    elseif ($dpiChoice -eq "4") { $finalDpi = 1000 }
    elseif ($dpiChoice -eq "5") {
        $customDpiStr = Read-Host "Digite o valor de DPI desejado (ex: 467, 1010)"
        if ($customDpiStr -as [int]) {
            $finalDpi = [int]$customDpiStr
        } else {
            Write-Host "DPI inválido, usando padrão de 480 DPI." -ForegroundColor Yellow
            $finalDpi = 480
        }
    }

    # 2. Perguntar sobre Perfil do Dispositivo (ASUS ROG 2 desbloqueia 90 FPS)
    Write-Host ""
    Write-Host "Deseja otimizar o perfil de celular para ASUS ROG 2? (Recomendado para rodar o Free Fire a 90 FPS estável)" -ForegroundColor Cyan
    Write-Host "1) Sim (Mudar para ASUS ROG 2)"
    Write-Host "2) Não (Manter o dispositivo atual)"
    $deviceChoice = Read-Host "Opção (1-2)"
    
    $devBrand = ""
    $devModel = ""
    $devMan = ""
    if ($deviceChoice -eq "1") {
        $devBrand = "asus"
        $devModel = "ASUS_I001DE"
        $devMan = "asus"
    }

    # 3. Escolher o Modo de Sensibilidade do Registro do Windows (Mouse Fix)
    Write-Host ""
    Write-Host "Escolha a curva de precisão do mouse do registro do Windows:" -ForegroundColor Cyan
    Write-Host "1) Mira Perfeita Linear 1:1 (MarkC Mouse Fix - Desativa 100% aceleração, melhor para corrigir a puxada Y)"
    Write-Host "2) Curva Customizada Loord (Suave aceleração, acelera ao puxar rápido)"
    Write-Host "3) Mira Travar na Cabeça (Anti-Passar - Especial 1600 DPI)"
    Write-Host "4) Lord Regis Sense (Aplica todos os arquivos .reg e .bat da pasta lord-sense)"
    $mouseChoice = Read-Host "Opção (1-4)"

    # 4. Perguntar Polling Rate do Mouse para evitar stutters
    Write-Host ""
    Write-Host "Qual é a taxa de atualização (Polling Rate) do seu mouse físico?" -ForegroundColor Cyan
    Write-Host "1) 125Hz ou 250Hz (Configura fila pequena = 20)"
    Write-Host "2) 500Hz (Configura fila média = 40)"
    Write-Host "3) 1000Hz ou superior (Logitech G, Razer, etc.) (Configura fila padrão estável = 100 - Evita travamento da mira)"
    $pollingChoice = Read-Host "Opção (1-3)"
    
    $queueSize = 100
    if ($pollingChoice -eq "1") { $queueSize = 20 }
    elseif ($pollingChoice -eq "2") { $queueSize = 40 }
    elseif ($pollingChoice -eq "3") { $queueSize = 100 }

    Show-Header
    Write-Host "[1/7] Criando Ponto de Restauração e fazendo Backup..." -ForegroundColor Cyan
    try {
        Enable-ComputerRestore -Drive "C:\" -ErrorAction SilentlyContinue
        Checkpoint-Computer -Description "OtimizacaoGamerSens" -RestorePointType "MODIFY_SETTINGS" -ErrorAction SilentlyContinue
    } catch {}
    Create-Backup
    Write-Host ""

    # Aplicar configs no BlueStacks Conf
    Write-Host "[2/7] Aplicando DPI ($finalDpi) e ativando FPS Alto no BlueStacks..." -ForegroundColor Cyan
    $msiOk = Update-BlueStacks-Conf -confPath $msiConf -newDpi $finalDpi -maxFps 240 -deviceBrand $devBrand -deviceModel $devModel -deviceManufacturer $devMan
    $nxtOk = Update-BlueStacks-Conf -confPath $nxtConf -newDpi $finalDpi -maxFps 240 -deviceBrand $devBrand -deviceModel $devModel -deviceManufacturer $devMan
    
    if ($msiOk) { Write-Host "  -> BlueStacks MSI5 atualizado com sucesso." -ForegroundColor Green }
    if ($nxtOk) { Write-Host "  -> BlueStacks NXT atualizado com sucesso." -ForegroundColor Green }
    if (-not $msiOk -and -not $nxtOk) { Write-Host "  -> Nenhum arquivo bluestacks.conf encontrado para modificar." -ForegroundColor Yellow }

    # Otimização do Registro do Emulador (Alta Prioridade de CPU para o HD-Player.exe)
    Write-Host ""
    Write-Host "[3/7] Otimizando prioridade de processamento do Emulador (Evita quedas de FPS)..." -ForegroundColor Cyan
    $regPath = "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\HD-Player.exe\PerfOptions"
    if (-not (Test-Path "Registry::$regPath")) {
        New-Item -Path "Registry::$regPath" -Force | Out-Null
    }
    reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\HD-Player.exe\PerfOptions" /v CpuPriorityClass /t REG_DWORD /d 3 /f | Out-Null
    reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\HD-Player.exe\PerfOptions" /v IoPriority /t REG_DWORD /d 3 /f | Out-Null
    Write-Host "  -> Processo HD-Player.exe configurado com alta prioridade de CPU e E/S." -ForegroundColor Green

    # Otimização da sensibilidade do registro
    Write-Host ""
    Write-Host "[4/7] Aplicando curva de sensibilidade do mouse selecionada..." -ForegroundColor Cyan
    if ($mouseChoice -eq "1") {
        # Raw Input / Sem aceleração (MarkC Mouse Fix 1:1)
        reg add "HKCU\Control Panel\Mouse" /v MouseSensitivity /t REG_SZ /d "10" /f | Out-Null
        reg add "HKCU\Control Panel\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f | Out-Null
        reg add "HKCU\Control Panel\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f | Out-Null
        reg add "HKCU\Control Panel\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f | Out-Null
        # Curva MarkC 1-para-1 Linear
        $flatX = "00,00,00,00,00,00,00,00,c0,cc,0c,00,00,00,00,00,80,99,19,00,00,00,00,00,40,66,26,00,00,00,00,00,00,33,33,00,00,00,00,00"
        $flatY = "00,00,00,00,00,00,00,00,00,00,38,00,00,00,00,00,00,00,70,00,00,00,00,00,00,00,a8,00,00,00,00,00,00,00,e0,00,00,00,00,00"
        $regContent = "Windows Registry Editor Version 5.00`r`n`r`n[HKEY_CURRENT_USER\Control Panel\Mouse]`r`n`"SmoothMouseXCurve`"=hex:$flatX`r`n`"SmoothMouseYCurve`"=hex:$flatY"
        $tmpPath = [IO.Path]::Combine($env:TEMP, "mouse_temp.reg")
        [IO.File]::WriteAllText($tmpPath, $regContent, [Text.Encoding]::Unicode)
        Start-Process reg -ArgumentList "import `"$tmpPath`"" -Wait -WindowStyle Hidden
        Remove-Item -Path $tmpPath -ErrorAction SilentlyContinue
        Write-Host "  -> Aceleração do Windows DESATIVADA para consistência total da mira (Linear 1:1)." -ForegroundColor Green
    } elseif ($mouseChoice -eq "2") {
        # Curva de aceleração suave Loord
        reg add "HKCU\Control Panel\Mouse" /v MouseSensitivity /t REG_SZ /d "10" /f | Out-Null
        reg add "HKCU\Control Panel\Mouse" /v MouseSpeed /t REG_SZ /d "1" /f | Out-Null
        reg add "HKCU\Control Panel\Mouse" /v MouseThreshold1 /t REG_SZ /d "6" /f | Out-Null
        reg add "HKCU\Control Panel\Mouse" /v MouseThreshold2 /t REG_SZ /d "10" /f | Out-Null
        $curveX = "00,00,00,00,00,00,00,00,40,2c,00,00,00,00,00,00,00,18,01,00,00,00,00,00,00,40,05,00,00,00,00,00,00,00,3c,00,00,00,00,00"
        $curveY = "00,00,00,00,00,00,00,00,00,b0,00,00,00,00,00,00,00,c0,08,00,00,00,00,00,00,40,0c,00,00,00,00,00,00,00,28,00,00,00,00,00"
        $regContent = "Windows Registry Editor Version 5.00`r`n`r`n[HKEY_CURRENT_USER\Control Panel\Mouse]`r`n`"SmoothMouseXCurve`"=hex:$curveX`r`n`"SmoothMouseYCurve`"=hex:$curveY"
        $tmpPath = [IO.Path]::Combine($env:TEMP, "mouse_temp.reg")
        [IO.File]::WriteAllText($tmpPath, $regContent, [Text.Encoding]::Unicode)
        Start-Process reg -ArgumentList "import `"$tmpPath`"" -Wait -WindowStyle Hidden
        Remove-Item -Path $tmpPath -ErrorAction SilentlyContinue
        Write-Host "  -> Curva de aceleração gamer Loord aplicada com sucesso." -ForegroundColor Green
    } elseif ($mouseChoice -eq "3") {
        # Mira Travar na Cabeça (Anti-Passar - Especial 1600 DPI)
        reg add "HKCU\Control Panel\Mouse" /v MouseSensitivity /t REG_SZ /d "8" /f | Out-Null
        reg add "HKCU\Control Panel\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f | Out-Null
        reg add "HKCU\Control Panel\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f | Out-Null
        reg add "HKCU\Control Panel\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f | Out-Null
        # Curva MarkC 1-para-1 Linear de alta precisão
        $flatX = "00,00,00,00,00,00,00,00,c0,cc,0c,00,00,00,00,00,80,99,19,00,00,00,00,00,40,66,26,00,00,00,00,00,00,33,33,00,00,00,00,00"
        $flatY = "00,00,00,00,00,00,00,00,00,00,38,00,00,00,00,00,00,00,70,00,00,00,00,00,00,00,a8,00,00,00,00,00,00,00,e0,00,00,00,00,00"
        $regContent = "Windows Registry Editor Version 5.00`r`n`r`n[HKEY_CURRENT_USER\Control Panel\Mouse]`r`n`"SmoothMouseXCurve`"=hex:$flatX`r`n`"SmoothMouseYCurve`"=hex:$flatY"
        $tmpPath = [IO.Path]::Combine($env:TEMP, "mouse_temp.reg")
        [IO.File]::WriteAllText($tmpPath, $regContent, [Text.Encoding]::Unicode)
        Start-Process reg -ArgumentList "import `"$tmpPath`"" -Wait -WindowStyle Hidden
        Remove-Item -Path $tmpPath -ErrorAction SilentlyContinue
        Write-Host "  -> Mira Travar na Cabeça (DPI 1600) aplicada com sucesso." -ForegroundColor Green
    } else {
        # Lord Regis Sense - Import all .reg and apply reg add lines from .bat in lord-sense directory
        $lordDir = "$PSScriptRoot\lord-sense"
        if (Test-Path $lordDir) {
            Get-ChildItem -Path $lordDir -Filter "*.reg" | ForEach-Object {
                Start-Process reg -ArgumentList "import `"$($_.FullName)`"" -Wait -WindowStyle Hidden
            }
            Get-ChildItem -Path $lordDir -Filter "*.bat" | ForEach-Object {
                $lines = Get-Content $_.FullName
                foreach ($line in $lines) {
                    $trimmed = $line.Trim()
                    if ($trimmed.ToLower().StartsWith("reg.exe add") -or $trimmed.ToLower().StartsWith("reg add")) {
                        cmd.exe /c "$trimmed >nul 2>&1" | Out-Null
                    }
                }
            }
            Write-Host "  -> Arquivos .reg e scripts .bat de 'lord-sense' aplicados com sucesso." -ForegroundColor Green
        } else {
            Write-Host "  -> Pasta 'lord-sense' nao encontrada." -ForegroundColor Red
        }
    }

    # Prioridade do Processo e Multimídia
    Write-Host ""
    Write-Host "[5/7] Configurando prioridades do sistema (Win32PrioritySeparation)..." -ForegroundColor Cyan
    reg add "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 26 /f | Out-Null
    reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 10 /f | Out-Null
    Write-Host "  -> Ajustes de prioridade do processador aplicados." -ForegroundColor Green

    # Desativar USB Selective Suspend para menor latência
    Write-Host ""
    Write-Host "[6/7] Removendo latência USB (Desativando economia de energia das portas)..." -ForegroundColor Cyan
    reg add "HKLM\SYSTEM\CurrentControlSet\Services\USB" /v DisableSelectiveSuspend /t REG_DWORD /d 1 /f | Out-Null
    powercfg -setacvalueindex SCHEME_CURRENT SUB_USB USBSELECTIVE 0 2>$null
    powercfg -setdcvalueindex SCHEME_CURRENT SUB_USB USBSELECTIVE 0 2>$null
    powercfg -setactive SCHEME_CURRENT 2>$null
    Write-Host "  -> USB Selective Suspend desativado no plano de energia ativo." -ForegroundColor Green

    # Acessibilidade, Timer de Precisão e Filas
    Write-Host ""
    Write-Host "[7/7] Configurando acessibilidade, filas de dados e Timer de alta precisão..." -ForegroundColor Cyan
    reg add "HKCU\Control Panel\Accessibility\Keyboard Response" /v "Flags" /t REG_SZ /d "0" /f | Out-Null
    reg add "HKCU\Control Panel\Accessibility\ToggleKeys" /v "Flags" /t REG_SZ /d "0" /f | Out-Null
    reg add "HKCU\Control Panel\Accessibility\StickyKeys" /v "Flags" /t REG_SZ /d "0" /f | Out-Null
    reg add "HKCU\Control Panel\Accessibility\MouseKeys" /v "Flags" /t REG_SZ /d "0" /f | Out-Null
    
    # Queue size customizado conforme o polling rate selecionado
    reg add "HKLM\SYSTEM\CurrentControlSet\Services\mouclass\Parameters" /v MouseDataQueueSize /t REG_DWORD /d $queueSize /f | Out-Null
    reg add "HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters" /v KeyboardDataQueueSize /t REG_DWORD /d 20 /f | Out-Null
    
    reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f | Out-Null
    bcdedit /set useplatformtick yes 2>$null | Out-Null
    Write-Host "  -> Registros de filas (Tamanho: $queueSize), filtros e temporizadores otimizados." -ForegroundColor Green

    Write-Host "  -> Atualizando configuracoes de sensibilidade em tempo real..." -ForegroundColor Green
    try {
        $sig = '[DllImport("user32.dll")] public static extern bool SystemParametersInfo(int uAction, int uParam, IntPtr lpvParam, int fuWinIni);'
        $type = Add-Type -MemberDefinition $sig -Name Win32Utils -Namespace Win32 -PassThru
        $type::SystemParametersInfo(0x0004, 0, [IntPtr]::Zero, 0x0002) | Out-Null
        $type::SystemParametersInfo(0x0057, 0, [IntPtr]::Zero, 0x0002) | Out-Null
    } catch {}

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host " Otimizações aplicadas com SUCESSO!" -ForegroundColor Green
    Write-Host " Para que tudo tenha efeito:" -ForegroundColor Yellow
    Write-Host " 1. REINICIE o computador." -ForegroundColor Yellow
    Write-Host " 2. Abra o BlueStacks e configure a sensibilidade interna" -ForegroundColor Yellow
    Write-Host "    do Free Fire ao seu gosto." -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Green
}

# Loop de Menu
while ($true) {
    Show-Header
    Write-Host "Selecione uma opção:"
    Write-Host "1) Aplicar todas as Otimizações (DPI, FPS, Sensibilidade e Latência)" -ForegroundColor Green
    Write-Host "2) Ler os Segredos da Puxada Perfeita (Não Pinar / Não Pular Pixel)" -ForegroundColor Cyan
    Write-Host "3) Restaurar Configurações Originais (Desfazer tudo)" -ForegroundColor Yellow
    Write-Host "4) Sair" -ForegroundColor Red
    Write-Host ""
    $escolha = Read-Host "Opção (1-4)"
    
    switch ($escolha) {
        "1" {
            Apply-All-Optimizations
            Write-Host ""
            Read-Host "Pressione Enter para voltar ao menu..."
        }
        "2" {
            Show-Guia-Sensibilidade
        }
        "3" {
            Restore-Backup
            Write-Host ""
            Read-Host "Pressione Enter para voltar ao menu..."
        }
        "4" {
            exit
        }
    }
}
