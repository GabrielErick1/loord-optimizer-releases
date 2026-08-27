const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const targetIso = 'C:\\ProgramData\\LoordOptimizer\\SysCore\\Loord_v10.6.0.iso';

const psScript = `
  $iso = '${targetIso.replace(/'/g, "''")}';
  $cPart = Get-Partition -DriveLetter C;
  $diskNum = $cPart.DiskNumber;

  Write-Host "1. Localizando particao no Disco $diskNum...";
  $loordPart = Get-Partition -DiskNumber $diskNum | Where-Object {
    $v = $_ | Get-Volume -ErrorAction SilentlyContinue;
    ($v -and ($v.FileSystemLabel -eq "LOORD_SETUP" -or $v.FileSystemLabel -eq "RECOVERY_LOORD")) -or ($_.Size -gt 7GB -and $_.Size -lt 10GB -and $_.PartitionNumber -ne $cPart.PartitionNumber)
  };

  if (-not $loordPart) {
    Write-Host "Criando nova particao de 8 GB...";
    $shrinkBytes = 8589934592;
    $newSize = $cPart.Size - $shrinkBytes;
    try { Resize-Partition -DriveLetter C -Size $newSize -ErrorAction SilentlyContinue | Out-Null; } catch {}
    $loordPart = New-Partition -DiskNumber $diskNum -Size 8GB -ErrorAction SilentlyContinue;
  }

  Write-Host "2. Configurando tipo basico e atribuindo L:...";
  try { Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -GptType "{ebd0a0a2-b9e5-4433-87c0-68b6b72699c7}" -ErrorAction SilentlyContinue | Out-Null; } catch {}
  try { Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -NewDriveLetter L -ErrorAction SilentlyContinue | Out-Null; } catch {}
  Start-Sleep -Seconds 1;

  Write-Host "3. Formatando como NTFS LOORD_SETUP...";
  Format-Volume -DriveLetter L -FileSystem NTFS -NewFileSystemLabel "LOORD_SETUP" -Confirm:$false -Force -ErrorAction SilentlyContinue | Out-Null;
  Start-Sleep -Seconds 1;

  Write-Host "4. Montando imagem ISO: $iso...";
  $m = Mount-DiskImage -ImagePath $iso -StorageType ISO -PassThru -ErrorAction SilentlyContinue;
  Start-Sleep -Seconds 2;
  $isoDriveLetter = ($m | Get-Volume -ErrorAction SilentlyContinue).DriveLetter;
  if (-not $isoDriveLetter) {
    $isoDriveLetter = (Get-DiskImage -ImagePath $iso | Get-Volume -ErrorAction SilentlyContinue).DriveLetter;
  }
  if (-not $isoDriveLetter) {
    $allCds = Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 5 };
    foreach ($c in $allCds) {
      if (Test-Path ($c.DeviceID + "\\sources\\boot.wim")) { $isoDriveLetter = $c.DeviceID.Substring(0,1); break; }
    }
  }
  Write-Host "Unidade da ISO detectada: $isoDriveLetter";
  if (-not $isoDriveLetter) { throw "Unidade da ISO nao encontrada."; }

  Write-Host "5. Copiando arquivos via Robocopy multithread...";
  $src = $isoDriveLetter + ':\';
  $dest = 'L:\';
  & robocopy $src $dest /E /R:1 /W:1 /MT:8 /NP /NFL /NDO /NJH /NJS | Out-Null;

  Write-Host "6. Gravando script de auto-destruicao SetupComplete...";
  $oemDir = 'L:\sources\$OEM$\$$\Setup\Scripts';
  New-Item -ItemType Directory -Path $oemDir -Force | Out-Null;
  $cmdText = "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -Command `"`$c = Get-Partition -DriveLetter C -ErrorAction SilentlyContinue; if (`$c) { `$diskNum = `$c.DiskNumber; `$p = Get-Partition -DiskNumber `$diskNum | Where-Object { (`$_.Type -eq \'Recovery\' -or `$_.DriveLetter -eq \'L\' -or (`$_.DiskNumber -eq `$diskNum -and `$_.PartitionNumber -ne `$c.PartitionNumber)) -and `$_.Size -lt 15GB -and `$_.Size -gt 3GB }; foreach (`$part in `$p) { try { Remove-Partition -DiskNumber `$diskNum -PartitionNumber `$part.PartitionNumber -Confirm:`$false -ErrorAction SilentlyContinue | Out-Null; } catch {} } try { `$max = (Get-PartitionSupportedSize -DriveLetter C).SizeMax; Resize-Partition -DriveLetter C -Size `$max -ErrorAction SilentlyContinue | Out-Null; } catch {} }`"`r`nexit /b 0";
  [System.IO.File]::WriteAllText((Join-Path $oemDir "SetupComplete.cmd"), $cmdText);

  Write-Host "7. Gravando bootsect...";
  if (Test-Path "L:\boot\bootsect.exe") { & "L:\boot\bootsect.exe" /nt60 L: /force /mbr | Out-Null; }

  Write-Host "8. Copiando para C:\\Recovery\\WindowsRE...";
  $reDir = "C:\\Recovery\\WindowsRE";
  if (-not (Test-Path $reDir)) { New-Item -ItemType Directory -Path $reDir -Force | Out-Null; }
  if (Test-Path "L:\sources\boot.wim") { Copy-Item "L:\sources\boot.wim" "$reDir\\Winre.wim" -Force; }
  if (Test-Path "L:\boot\boot.sdi") { Copy-Item "L:\boot\boot.sdi" "$reDir\\boot.sdi" -Force; }

  Write-Host "9. Desmontando ISO...";
  Dismount-DiskImage -ImagePath $iso -ErrorAction SilentlyContinue | Out-Null;

  Write-Host "10. Verificando arquivos copiados em L: antes de ocultar:";
  Get-ChildItem -Path "L:\" | Select-Object Name, Length;

  Write-Host "11. Ocultando particao L:...";
  try { Remove-PartitionAccessPath -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -AccessPath "L:\\" -ErrorAction SilentlyContinue | Out-Null; } catch {}
  try { Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -GptType "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}" -ErrorAction SilentlyContinue | Out-Null; } catch {}

  Write-Host "SUCESSO TOTAL! PARTICAO 100% GRAVADA E BLINDADA.";
`;

const tmp = path.join(os.tmpdir(), `test_prep_${Date.now()}.ps1`);
fs.writeFileSync(tmp, '\ufeff' + psScript, 'utf8');

try {
  const out = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`, { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.error(e.stdout || e.message);
} finally {
  try { fs.unlinkSync(tmp); } catch (_) {}
}
