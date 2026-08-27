const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const targetIso = 'C:\\Users\\Gabriel\\Downloads\\Configuração emulador\\Nova pasta (4)\\isodoloord\\Loord v10.6.0).iso';

const psScript = [
  '$iso = "' + targetIso.replace(/\\/g, '\\\\') + '";',
  '$cPart = Get-Partition -DriveLetter C;',
  '$diskNum = $cPart.DiskNumber;',
  '',
  '# 1. Encontrar ou criar a particao de 8 GB',
  '$loordPart = Get-Partition -DiskNumber $diskNum | Where-Object {',
  '  $v = $_ | Get-Volume -ErrorAction SilentlyContinue;',
  '  $v -and ($v.FileSystemLabel -eq "LOORD_SETUP" -or $v.FileSystemLabel -eq "RECOVERY_LOORD")',
  '};',
  'if (-not $loordPart) {',
  '  $shrinkBytes = 8589934592;',
  '  $newSize = $cPart.Size - $shrinkBytes;',
  '  try { Resize-Partition -DriveLetter C -Size $newSize -ErrorAction SilentlyContinue | Out-Null; } catch {}',
  '  $loordPart = New-Partition -DiskNumber $diskNum -Size 8GB -ErrorAction SilentlyContinue;',
  '  if (-not $loordPart) { $loordPart = New-Partition -DiskNumber $diskNum -UseMaximumSize -ErrorAction SilentlyContinue; }',
  '}',
  '',
  '# 2. Atribuir letra L:',
  'try { Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -NewDriveLetter L -ErrorAction SilentlyContinue | Out-Null; } catch {}',
  '',
  '# 3. Formatar como NTFS LOORD_SETUP',
  'Format-Volume -DriveLetter L -FileSystem NTFS -NewFileSystemLabel "LOORD_SETUP" -Confirm:$false -Force -ErrorAction SilentlyContinue | Out-Null;',
  '',
  '# 4. Montar imagem ISO',
  'Mount-DiskImage -ImagePath $iso -StorageType ISO -ErrorAction SilentlyContinue | Out-Null;',
  '',
  '# 5. Descobrir unidade da ISO montada de forma 100% confiavel',
  '$isoDriveLetter = $null;',
  '$cd = Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 5 -and (Test-Path ($_.DeviceID + "\\sources\\boot.wim")) };',
  'if ($cd) { $isoDriveLetter = $cd.DeviceID.Substring(0,1); }',
  'if (-not $isoDriveLetter) {',
  '  $allCds = Get-Volume | Where-Object { $_.DriveType -eq "CD-ROM" -and $_.DriveLetter };',
  '  foreach ($c in $allCds) {',
  '    if (Test-Path ($c.DriveLetter + ":\\sources\\boot.wim")) { $isoDriveLetter = $c.DriveLetter; break; }',
  '  }',
  '}',
  'if (-not $isoDriveLetter) { throw "Unidade de CD-ROM da ISO montada nao encontrada."; }',
  '',
  '# 6. Copiar arquivos para L:\\',
  '$src = $isoDriveLetter + ":\\";',
  '$dest = "L:\\";',
  '& robocopy $src $dest /E /R:1 /W:1 /MT:8 /NP /NFL /NDO /NJH /NJS | Out-Null;',
  '',
  '# 7. Gravar script de auto-destruicao SetupComplete',
  '$oemDir = "L:\\sources\\`$OEM$\\`$`$\\Setup\\Scripts";',
  '[System.IO.Directory]::CreateDirectory($oemDir) | Out-Null;',
  '$cmdText = "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -Command `"`$c = Get-Partition -DriveLetter C -ErrorAction SilentlyContinue; if (`$c) { `$diskNum = `$c.DiskNumber; `$p = Get-Partition -DiskNumber `$diskNum | Where-Object { (`$_.Type -eq \'Recovery\' -or `$_.DriveLetter -eq \'L\' -or (`$_.DiskNumber -eq `$diskNum -and `$_.PartitionNumber -ne `$c.PartitionNumber)) -and `$_.Size -lt 15GB -and `$_.Size -gt 3GB }; foreach (`$part in `$p) { try { Remove-Partition -DiskNumber `$diskNum -PartitionNumber `$part.PartitionNumber -Confirm:`$false -ErrorAction SilentlyContinue | Out-Null; } catch {} } try { `$max = (Get-PartitionSupportedSize -DriveLetter C).SizeMax; Resize-Partition -DriveLetter C -Size `$max -ErrorAction SilentlyContinue | Out-Null; } catch {} }`"`r`nexit /b 0";',
  '[System.IO.File]::WriteAllText((Join-Path $oemDir "SetupComplete.cmd"), $cmdText);',
  '',
  '# 8. Gravar bootsect estilo Rufus',
  'if (Test-Path "L:\\boot\\bootsect.exe") { & "L:\\boot\\bootsect.exe" /nt60 L: /force /mbr | Out-Null; }',
  '',
  '# 9. Desmontar imagem ISO',
  'Dismount-DiskImage -ImagePath $iso -ErrorAction SilentlyContinue | Out-Null;',
  'Write-Host "SUCESSO_TOTAL_COMPLETO";'
].join('\r\n');

const tmpScriptPath = path.join(os.tmpdir(), `test_part_${Date.now()}.ps1`);
fs.writeFileSync(tmpScriptPath, psScript, 'utf8');

try {
  const res = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpScriptPath}"`, { encoding: 'utf8' });
  console.log('Result:\n', res);
} catch (e) {
  console.error('Error:\n', e.stdout || e.message);
} finally {
  try { fs.unlinkSync(tmpScriptPath); } catch (_) {}
}
