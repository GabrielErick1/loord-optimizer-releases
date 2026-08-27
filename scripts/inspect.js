const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ps = `
  # Atribui temporariamente a letra L: para inspecionar os arquivos
  try { Set-Partition -DiskNumber 1 -PartitionNumber 4 -NewDriveLetter L -ErrorAction SilentlyContinue | Out-Null } catch {}
  Start-Sleep -Seconds 1;

  Write-Host "=== ARQUIVOS NA RAIZ DA PARTIÇÃO (L:) ===";
  Get-ChildItem -Path "L:\\" -Force | Format-Table Name, Length, Mode -AutoSize;

  Write-Host "=== ARQUIVOS DENTRO DA PASTA SOURCES (BOOT & INSTALADOR) ===";
  Get-ChildItem -Path "L:\\sources" -Force | Select-Object -First 10 | Format-Table Name, Length, Mode -AutoSize;

  Write-Host "=== ESPAÇO UTILIZADO NA PARTIÇÃO ===";
  $vol = Get-Volume -DriveLetter L -ErrorAction SilentlyContinue;
  if ($vol) {
    [PSCustomObject]@{
      Label = $vol.FileSystemLabel
      TamanhoTotalGB = [math]::Round($vol.Size / 1GB, 2)
      EspacoUsadoGB = [math]::Round(($vol.Size - $vol.SizeRemaining) / 1GB, 2)
      EspacoLivreGB = [math]::Round($vol.SizeRemaining / 1GB, 2)
    } | Format-List
  }

  # Oculta novamente a letra L: para manter blindado
  try { Remove-PartitionAccessPath -DiskNumber 1 -PartitionNumber 4 -AccessPath "L:\\" -ErrorAction SilentlyContinue | Out-Null } catch {}
`;

const tmp = path.join(os.tmpdir(), `inspect_files_${Date.now()}.ps1`);
fs.writeFileSync(tmp, '\ufeff' + ps, 'utf8');

try {
  const out = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`, { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.error(e.stdout || e.message);
} finally {
  try { fs.unlinkSync(tmp); } catch (_) {}
}
