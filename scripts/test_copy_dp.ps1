$iso = 'C:\ProgramData\LoordOptimizer\SysCore\Loord_v10.6.0.iso';
$cPart = Get-Partition -DriveLetter C;
$diskNum = $cPart.DiskNumber;

# 1. Monta ISO
$m = Mount-DiskImage -ImagePath $iso -StorageType ISO -PassThru;
Start-Sleep -Seconds 2;
$isoDrive = ($m | Get-Volume).DriveLetter + ":";
Write-Host "ISO Montada em $isoDrive";

# 2. Atribui L: via diskpart
$dp = @"
select disk $diskNum
select partition 4
set id=ebd0a0a2-b9e5-4433-87c0-68b6b72699c7
format fs=ntfs quick label="LOORD_SETUP"
assign letter=L
exit
"@
$dp | diskpart | Out-Null;
Start-Sleep -Seconds 2;

# 3. Copia tudo 1:1
Write-Host "Copiando todos os arquivos da ISO para L:\ ...";
& robocopy "$isoDrive\" "L:\" /E /R:1 /W:1 /MT:8 /NP /NFL /NDO /NJH /NJS | Out-Null;

# 4. Injeta SetupComplete
$oemDir = "L:\sources\`$OEM$\`$`$\Setup\Scripts";
New-Item -ItemType Directory -Path $oemDir -Force | Out-Null;
$cmdText = "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -Command `"`$c = Get-Partition -DriveLetter C -ErrorAction SilentlyContinue; if (`$c) { `$diskNum = `$c.DiskNumber; `$p = Get-Partition -DiskNumber `$diskNum | Where-Object { (`$_.Type -eq 'Recovery' -or `$_.DriveLetter -eq 'L' -or (`$_.DiskNumber -eq `$diskNum -and `$_.PartitionNumber -ne `$c.PartitionNumber)) -and `$_.Size -lt 15GB -and `$_.Size -gt 3GB }; foreach (`$part in `$p) { try { Remove-Partition -DiskNumber `$diskNum -PartitionNumber `$part.PartitionNumber -Confirm:`$false -ErrorAction SilentlyContinue | Out-Null; } catch {} } try { `$max = (Get-PartitionSupportedSize -DriveLetter C).SizeMax; Resize-Partition -DriveLetter C -Size `$max -ErrorAction SilentlyContinue | Out-Null; } catch {} }`"`r`nexit /b 0";
[System.IO.File]::WriteAllText((Join-Path $oemDir "SetupComplete.cmd"), $cmdText);

# 5. Bootsect
if (Test-Path "L:\boot\bootsect.exe") { & "L:\boot\bootsect.exe" /nt60 L: /force /mbr | Out-Null; }

# 6. Desmonta ISO
Dismount-DiskImage -ImagePath $iso -ErrorAction SilentlyContinue | Out-Null;

# 7. Exibe relatorio dos arquivos em L:\
Write-Host "=== ARQUIVOS GRAVADOS COM SUCESSO EM L:\ ===";
Get-ChildItem -Path "L:\" | Format-Table Name, Length, Mode -AutoSize;
Get-ChildItem -Path "L:\sources" | Select-Object -First 5 | Format-Table Name, Length, Mode -AutoSize;

# 8. Oculta particao L:
$dpHide = @"
select disk $diskNum
select partition 4
remove letter=L
set id=de94bba4-06d1-4d40-a16a-bfd50179d6ac
exit
"@
$dpHide | diskpart | Out-Null;
Write-Host "=== PARTICAO BLINDADA E OCULTA COM SUCESSO! ===";
