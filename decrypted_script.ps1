param([switch]$Silent)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-Admin)) {
    $args2 = if ($Silent) { "-Silent" } else { "" }
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`" $args2"
    exit
}
function Apply-AllTweaks {
    param([System.Windows.Forms.Label]$StatusLabel,[System.Windows.Forms.ProgressBar]$Bar,[System.Windows.Forms.Form]$F)
    $steps = @(
        @{ Name="Criando ponto de restauracao Yuno7Fix..."; Action={
            Enable-ComputerRestore -Drive "C:\" -ErrorAction SilentlyContinue
            Checkpoint-Computer -Description "Yuno7Fix" -RestorePointType "MODIFY_SETTINGS" -ErrorAction SilentlyContinue
        }},
        @{ Name="Configurando mouse..."; Action={
            $reg="Windows Registry Editor Version 5.00`r`n`r`n[HKEY_CURRENT_USER\Control Panel\Mouse]`r`n`"MouseSensitivity`"=`"10`"`r`n`"MouseSpeed`"=`"1`"`r`n`"MouseThreshold1`"=`"6`"`r`n`"MouseThreshold2`"=`"10`"`r`n`"SmoothMouseXCurve`"=hex:00,00,00,00,00,00,00,00,40,2c,00,00,00,00,00,00,00,18,01,00,00,00,00,00,00,40,05,00,00,00,00,00,00,00,3c,00,00,00,00,00`r`n`"SmoothMouseYCurve`"=hex:00,00,00,00,00,00,00,00,00,b0,00,00,00,00,00,00,00,c0,08,00,00,00,00,00,00,40,0c,00,00,00,00,00,00,00,28,00,00,00,00,00"
            $tmp=[IO.Path]::Combine($env:TEMP,"y7m.reg")
            [IO.File]::WriteAllText($tmp,$reg,[Text.Encoding]::Unicode)
            Start-Process reg -ArgumentList "import `"$tmp`"" -Wait -WindowStyle Hidden
        }},
        @{ Name="Prioridade do processo e multimedia..."; Action={
            reg add "HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 26 /f|Out-Null
            reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 10 /f|Out-Null
        }},
        @{ Name="Desativando USB Selective Suspend..."; Action={
            reg add "HKLM\SYSTEM\CurrentControlSet\Services\USB" /v DisableSelectiveSuspend /t REG_DWORD /d 1 /f|Out-Null
            powercfg -setacvalueindex SCHEME_CURRENT SUB_USB USBSELECTIVE 0 2>&1|Out-Null
            powercfg -setdcvalueindex SCHEME_CURRENT SUB_USB USBSELECTIVE 0 2>&1|Out-Null
            powercfg -setactive SCHEME_CURRENT 2>&1|Out-Null
        }},
        @{ Name="Desativando acessibilidade e otimizando input..."; Action={
            reg add "HKCU\Control Panel\Accessibility\Keyboard Response" /v "Flags" /t REG_SZ /d "0" /f|Out-Null
            reg add "HKCU\Control Panel\Accessibility\ToggleKeys" /v "Flags" /t REG_SZ /d "0" /f|Out-Null
            reg add "HKCU\Control Panel\Accessibility\StickyKeys" /v "Flags" /t REG_SZ /d "0" /f|Out-Null
            reg add "HKCU\Control Panel\Accessibility\MouseKeys" /v "Flags" /t REG_SZ /d "0" /f|Out-Null
            reg add "HKLM\SYSTEM\CurrentControlSet\Services\mouclass\Parameters" /v MouseDataQueueSize /t REG_DWORD /d 20 /f|Out-Null
            reg add "HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters" /v KeyboardDataQueueSize /t REG_DWORD /d 20 /f|Out-Null
        }},
        @{ Name="Ativando GlobalTimerResolution (Windows 11)..."; Action={
            reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f|Out-Null
            bcdedit /set useplatformtick yes 2>&1|Out-Null
        }},
        @{ Name="Importando plano de energia Yuno7 Ultra..."; Action={
            $powPath="C:\Yuno7\Yuno7 Ultra.pow"
            if(Test-Path $powPath){
                $out=powercfg -import "$powPath" 2>&1|Out-String
                $m=[System.Text.RegularExpressions.Regex]::Match($out,'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
                if($m.Success){powercfg -setactive $m.Value 2>&1|Out-Null}
            }
        }},
        @{ Name="Registrando Mouse.exe na inicializacao..."; Action={
            $mouseExe="C:\Users\$env:USERNAME\Desktop\Mouse.exe"
            if(-not(Test-Path $mouseExe)){$mouseExe="$PSScriptRoot\Mouse.exe"}
            if(Test-Path $mouseExe){
                $ta=New-ScheduledTaskAction -Execute $mouseExe
                $tt=New-ScheduledTaskTrigger -AtLogOn
                $ts=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
                $tp=New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest -LogonType Interactive
                Register-ScheduledTask -TaskName "Yuno7-Mouse" -Action $ta -Trigger $tt -Settings $ts -Principal $tp -Force|Out-Null
            }
        }},
        @{ Name="Registrando SetTimerResolution na inicializacao..."; Action={
            $strExe="C:\Yuno7\SetTimerResolution.exe"
            if(-not(Test-Path $strExe)){$strExe="$PSScriptRoot\SetTimerResolution.exe"}
            if(Test-Path $strExe){
                $ta=New-ScheduledTaskAction -Execute $strExe -Argument "--resolution 5067 --no-console"
                $tt=New-ScheduledTaskTrigger -AtLogOn
                $ts=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -Priority 4
                $tp=New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest -LogonType Interactive
                Register-ScheduledTask -TaskName "Yuno7-SetTimerResolution" -Action $ta -Trigger $tt -Settings $ts -Principal $tp -Force|Out-Null
            }
        }},
        @{ Name="Registrando Yuno7 FIX na inicializacao..."; Action={
            $exePath=[System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
            if($exePath -like "*.exe"){
                $ta2=New-ScheduledTaskAction -Execute $exePath -Argument "-Silent"
            } else {
                $psExe="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
                $ta2=New-ScheduledTaskAction -Execute $psExe -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$exePath`" -Silent"
            }
            $tt2=New-ScheduledTaskTrigger -AtLogOn
            $ts2=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
            $tp2=New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest -LogonType Interactive
            Register-ScheduledTask -TaskName "Yuno7-FIX-Startup" -Action $ta2 -Trigger $tt2 -Settings $ts2 -Principal $tp2 -Force|Out-Null
        }}
    )
    $total=$steps.Count
    for($i=0;$i-lt$total;$i++){
        $step=$steps[$i]
        if($StatusLabel){$StatusLabel.Text=$step.Name;$F.Refresh()}
        try{& $step.Action}catch{}
        if($Bar){$Bar.Value=[int](($i+1)/$total*100);$F.Refresh()}
        Start-Sleep -Milliseconds 150
    }
}
if($Silent){Apply-AllTweaks;exit}
Start-Process "https://discord.gg/yunostore"
Start-Sleep -Milliseconds 400
Start-Process "https://www.youtube.com/@7yuno77"
$form=New-Object Windows.Forms.Form
$form.Text="Yuno7 FIX"
$form.ClientSize=New-Object Drawing.Size(500,420)
$form.StartPosition="CenterScreen"
$form.BackColor=[Drawing.Color]::FromArgb(18,0,0)
$form.FormBorderStyle="FixedDialog"
$form.MaximizeBox=$false
$form.MinimizeBox=$true
[Windows.Forms.Application]::EnableVisualStyles()
$form.Add_Paint({
    param($s,$e)
    $g=$e.Graphics;$g.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $rect=New-Object Drawing.Rectangle(0,0,500,420)
    $b=New-Object Drawing.Drawing2D.LinearGradientBrush((New-Object Drawing.PointF(0,0)),(New-Object Drawing.PointF(0,420)),[Drawing.Color]::FromArgb(28,4,4),[Drawing.Color]::FromArgb(55,8,8))
    $g.FillRectangle($b,$rect);$b.Dispose()
    $sb=New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(90,0,0));$g.FillRectangle($sb,50,155,400,1);$sb.Dispose()
    $sb2=New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(40,0,0));$g.FillRectangle($sb2,50,350,400,1);$sb2.Dispose()
})
$lblTitle=New-Object Windows.Forms.Label;$lblTitle.Text="Yuno7 FIX";$lblTitle.Font=New-Object Drawing.Font("Segoe UI",32,[Drawing.FontStyle]::Bold);$lblTitle.ForeColor=[Drawing.Color]::FromArgb(245,45,45);$lblTitle.BackColor=[Drawing.Color]::Transparent;$lblTitle.AutoSize=$true;$lblTitle.Location=New-Object Drawing.Point(130,45);$form.Controls.Add($lblTitle)
$lblSub=New-Object Windows.Forms.Label;$lblSub.Text="Performance & Input Optimizer";$lblSub.Font=New-Object Drawing.Font("Segoe UI",10);$lblSub.ForeColor=[Drawing.Color]::FromArgb(160,70,70);$lblSub.BackColor=[Drawing.Color]::Transparent;$lblSub.AutoSize=$true;$lblSub.Location=New-Object Drawing.Point(148,108);$form.Controls.Add($lblSub)
$btn=New-Object Windows.Forms.Button;$btn.Text="   APLICAR TUDO   ";$btn.Font=New-Object Drawing.Font("Segoe UI",16,[Drawing.FontStyle]::Bold);$btn.ForeColor=[Drawing.Color]::White;$btn.BackColor=[Drawing.Color]::FromArgb(145,0,0);$btn.FlatStyle="Flat";$btn.FlatAppearance.BorderColor=[Drawing.Color]::FromArgb(210,30,30);$btn.FlatAppearance.BorderSize=2;$btn.Size=New-Object Drawing.Size(360,68);$btn.Location=New-Object Drawing.Point(70,185);$btn.Cursor=[Windows.Forms.Cursors]::Hand;$form.Controls.Add($btn)
$lblStatus=New-Object Windows.Forms.Label;$lblStatus.Text="Pronto para aplicar as otimizacoes";$lblStatus.Font=New-Object Drawing.Font("Segoe UI",9);$lblStatus.ForeColor=[Drawing.Color]::FromArgb(160,70,70);$lblStatus.BackColor=[Drawing.Color]::Transparent;$lblStatus.AutoSize=$false;$lblStatus.Size=New-Object Drawing.Size(460,22);$lblStatus.Location=New-Object Drawing.Point(20,278);$lblStatus.TextAlign=[Drawing.ContentAlignment]::MiddleCenter;$form.Controls.Add($lblStatus)
$progress=New-Object Windows.Forms.ProgressBar;$progress.Size=New-Object Drawing.Size(380,6);$progress.Location=New-Object Drawing.Point(60,308);$progress.Style="Continuous";$progress.Visible=$false;$progress.BackColor=[Drawing.Color]::FromArgb(45,0,0);$form.Controls.Add($progress)
$lblFooter=New-Object Windows.Forms.Label;$lblFooter.Text="discord.gg/yunostore   |   youtube.com/@7yuno77";$lblFooter.Font=New-Object Drawing.Font("Segoe UI",8);$lblFooter.ForeColor=[Drawing.Color]::FromArgb(75,35,35);$lblFooter.BackColor=[Drawing.Color]::Transparent;$lblFooter.AutoSize=$false;$lblFooter.Size=New-Object Drawing.Size(460,20);$lblFooter.Location=New-Object Drawing.Point(20,390);$lblFooter.TextAlign=[Drawing.ContentAlignment]::MiddleCenter;$form.Controls.Add($lblFooter)
$glowDir=1;$glowVal=145
$timer=New-Object Windows.Forms.Timer;$timer.Interval=35
$timer.Add_Tick({
    $script:glowVal+=$script:glowDir*3
    if($script:glowVal-ge 195){$script:glowDir=-1}
    if($script:glowVal-le 100){$script:glowDir=1}
    if($btn.Enabled){$btn.BackColor=[Drawing.Color]::FromArgb($script:glowVal,0,0);$bord=[Math]::Min($script:glowVal+35,255);$btn.FlatAppearance.BorderColor=[Drawing.Color]::FromArgb($bord,25,25)}
})
$timer.Start()
$btn.Add_Click({
    $btn.Enabled=$false;$btn.Text="   Aplicando...";$timer.Stop()
    $btn.BackColor=[Drawing.Color]::FromArgb(90,0,0);$btn.FlatAppearance.BorderColor=[Drawing.Color]::FromArgb(120,0,0)
    $progress.Visible=$true;$progress.Value=0;$form.Refresh()
    Apply-AllTweaks -StatusLabel $lblStatus -Bar $progress -F $form
    $progress.Value=100
    $lblStatus.ForeColor=[Drawing.Color]::FromArgb(60,220,60)
    $lblStatus.Text="Fix Aplicado! Reinicie o Computador!"
    $btn.Text="   APLICADO! v";$btn.BackColor=[Drawing.Color]::FromArgb(0,90,0);$btn.FlatAppearance.BorderColor=[Drawing.Color]::FromArgb(0,180,0);$form.Refresh()
    [Windows.Forms.MessageBox]::Show("Fix Aplicado com Sucesso!`n`nReinicie o Computador para aplicar todas as mudancas.","Yuno7 FIX",[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Information)|Out-Null
})
[void]$form.ShowDialog();$timer.Stop()