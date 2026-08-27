const { execSync } = require('child_process');

const iso = 'C:\\Users\\Gabriel\\Downloads\\Configuração emulador\\Nova pasta (4)\\isodoloord\\Loord v10.6.0).iso';

const psScript = `
  $iso = '${iso.replace(/'/g, "''")}';
  Write-Host "1. Montando ISO: $iso";
  $m = Mount-DiskImage -ImagePath $iso -PassThru -ErrorAction Stop;
  
  # Obter a letra de unidade de forma 100% compativel com PS 5.1 e PS 7+
  $isoVol = Get-DiskImage -ImagePath $iso | Get-Volume -ErrorAction SilentlyContinue;
  $driveLetter = $isoVol.DriveLetter;
  if (-not $driveLetter) {
    $cd = Get-Volume | Where-Object { $_.DriveType -eq 'CD-ROM' -and (Test-Path ($_.DriveLetter + ':\\sources\\boot.wim')) };
    $driveLetter = $cd.DriveLetter;
  }
  if (-not $driveLetter) {
    $driveLetter = (Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 5 -and (Test-Path ($_.DeviceID + '\\sources\\boot.wim')) }).DeviceID.Substring(0,1);
  }
  Write-Host "2. Letra da ISO montada: $driveLetter";
  
  if (-not $driveLetter) {
    throw "Nao foi possivel identificar a letra da ISO montada.";
  }
  
  $src = $driveLetter + ':\\';
  $dest = 'L:\\';
  Write-Host "3. Executando robocopy de $src para $dest";
  
  & robocopy $src $dest /E /R:1 /W:1 /MT:8 /NP /NFL /NDO /NJH /NJS | Out-Null;
  
  Write-Host "4. Robocopy finalizado. Verificando arquivos em L:";
  $hasBoot = Test-Path "L:\\sources\\boot.wim";
  $hasEsd = Test-Path "L:\\sources\\install.esd";
  Write-Host "Boot.wim: $hasBoot | Install.esd: $hasEsd";
  
  Dismount-DiskImage -ImagePath $iso -ErrorAction SilentlyContinue | Out-Null;
`;

try {
  const out = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\r?\n/g, ' ')}"`, { encoding: 'utf8' });
  console.log('Output:\n', out);
} catch (e) {
  console.error('Error:\n', e.stdout || e.message);
}
