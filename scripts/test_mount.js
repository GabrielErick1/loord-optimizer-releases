const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Garante que a ISO de teste existe no caminho limpo sem acentos
const cleanSysDir = 'C:\\ProgramData\\LoordOptimizer\\SysCore';
const cleanSysIso = path.join(cleanSysDir, 'Loord_v10.6.0.iso');

if (!fs.existsSync(cleanSysDir)) {
  fs.mkdirSync(cleanSysDir, { recursive: true });
}

// Se o arquivo original existir, copia para o caminho limpo
const origIso = path.join(__dirname, '..', 'isodoloord', 'Loord v10.6.0).iso');
if (fs.existsSync(origIso) && !fs.existsSync(cleanSysIso)) {
  fs.copyFileSync(origIso, cleanSysIso);
}

const psScript = `
  $iso = '${cleanSysIso.replace(/'/g, "''")}';
  Write-Host "1. Montando imagem ISO: $iso";
  $m = Mount-DiskImage -ImagePath $iso -StorageType ISO -PassThru;
  Start-Sleep -Seconds 2;
  $isoDriveLetter = ($m | Get-Volume).DriveLetter;
  if (-not $isoDriveLetter) {
    $isoDriveLetter = (Get-DiskImage -ImagePath $iso | Get-Volume).DriveLetter;
  }
  if (-not $isoDriveLetter) {
    $cd = Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 5 -and (Test-Path ($_.DeviceID + '\\sources\\boot.wim')) };
    if ($cd) { $isoDriveLetter = $cd.DeviceID.Substring(0,1); }
  }
  Write-Host "2. Unidade encontrada: $isoDriveLetter";
  if (-not $isoDriveLetter) { throw "Unidade nao encontrada."; }
  
  Write-Host "3. Verificando arquivos na unidade $isoDriveLetter :";
  Get-ChildItem ($isoDriveLetter + ':\\sources') | Select-Object -First 3 Name;
  
  Dismount-DiskImage -ImagePath $iso -ErrorAction SilentlyContinue | Out-Null;
  Write-Host "4. ISO desmontada com sucesso!";
`;

const tmpScriptPath = path.join(os.tmpdir(), `test_clean_mount_${Date.now()}.ps1`);
// Escreve com UTF8 com BOM para o PowerShell ler perfeitamente
fs.writeFileSync(tmpScriptPath, '\ufeff' + psScript, 'utf8');

try {
  const res = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpScriptPath}"`, { encoding: 'utf8' });
  console.log('Result:\n', res);
} catch (e) {
  console.error('Error:\n', e.stdout || e.message);
} finally {
  try { fs.unlinkSync(tmpScriptPath); } catch (_) {}
}
