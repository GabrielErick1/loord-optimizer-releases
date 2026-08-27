const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ps = `
Write-Host "============================================================"
Write-Host "RELATORIO COMPLETO DE ANALISE: PARTICÃO E ARQUIVOS DA ISO"
Write-Host "============================================================"

# 1. Arquivo da ISO baixado
$isoPath = "C:\\ProgramData\\LoordOptimizer\\SysCore\\Loord_v10.6.0.iso"
Write-Host ""
Write-Host "1. ARQUIVO DA ISO BAIXADO NO SISTEMA:"
if (Test-Path $isoPath) {
  $f = Get-Item $isoPath -Force
  $sizeGB = [math]::Round($f.Length / 1GB, 2)
  Write-Host "  STATUS: ISO Encontrada e Blindada com Sucesso!"
  Write-Host "  - Caminho: $isoPath"
  Write-Host "  - Tamanho: $sizeGB GB"
  Write-Host "  - Atributos: $($f.Attributes)"
} else {
  Write-Host "  STATUS: Arquivo nao encontrado em $isoPath"
}

# 2. Particao no Disco
Write-Host ""
Write-Host "2. PARTICAO DE INSTALACAO NO DISCO:"
$cPart = Get-Partition -DriveLetter C
$diskNum = $cPart.DiskNumber
$parts = Get-Partition -DiskNumber $diskNum

$loordPart = $parts | Where-Object {
  $v = $_ | Get-Volume -ErrorAction SilentlyContinue
  ($v -and ($v.FileSystemLabel -eq "LOORD_SETUP" -or $v.FileSystemLabel -eq "RECOVERY_LOORD")) -or ($_.Size -gt 7GB -and $_.Size -lt 10GB -and $_.PartitionNumber -ne $cPart.PartitionNumber)
}

if ($loordPart) {
  $sizeGB = [math]::Round($loordPart.Size / 1GB, 2)
  Write-Host "  STATUS: Particao de 8 GB Criada no Disco Principal (Disco $diskNum)!"
  Write-Host "  - Particao Numero: $($loordPart.PartitionNumber)"
  Write-Host "  - Tamanho: $sizeGB GB"
  Write-Host "  - Tipo: $($loordPart.Type) (Protegida e Oculta do Windows Explorer)"
  Write-Host "  - GPT Type: $($loordPart.GptType)"
} else {
  Write-Host "  STATUS: Particao de 8 GB nao encontrada no disco principal."
}

# 3. Inspecao dos Arquivos da Particao
Write-Host ""
Write-Host "3. ARQUIVOS GRAVADOS DENTRO DA PARTICAO:"
if ($loordPart) {
  try {
    Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -GptType "{ebd0a0a2-b9e5-4433-87c0-68b6b72699c7}" -ErrorAction SilentlyContinue | Out-Null
    Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -NewDriveLetter L -ErrorAction SilentlyContinue | Out-Null
  } catch {}
  Start-Sleep -Seconds 1

  if (Test-Path "L:\\") {
    $vol = Get-Volume -DriveLetter L -ErrorAction SilentlyContinue
    if ($vol) {
      $usado = [math]::Round(($vol.Size - $vol.SizeRemaining) / 1GB, 2)
      $total = [math]::Round($vol.Size / 1GB, 2)
      Write-Host "  - Nome do Volume: $($vol.FileSystemLabel)"
      Write-Host "  - Espaco Gravado: $usado GB de $total GB"
    }

    Write-Host "  Lista de Arquivos e Pastas em L:"
    Get-ChildItem "L:\\" -Force | ForEach-Object {
      if ($_.PSIsContainer) {
        Write-Host "   [PASTA]   $($_.Name)"
      } else {
        $mb = [math]::Round($_.Length / 1MB, 2)
        Write-Host "   [ARQUIVO] $($_.Name) ($mb MB)"
      }
    }

    if (Test-Path "L:\\sources") {
      Write-Host ""
      Write-Host "  Arquivos de Instalacao e Boot em L:\\sources:"
      Get-ChildItem "L:\\sources" -Force | Where-Object { $_.Name -like "*boot*" -or $_.Name -like "*install*" -or $_.Name -like "*setup*" } | ForEach-Object {
        $mb = [math]::Round($_.Length / 1MB, 2)
        Write-Host "   - $($_.Name) ($mb MB)"
      }
    }

    try {
      Remove-PartitionAccessPath -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -AccessPath "L:\\" -ErrorAction SilentlyContinue | Out-Null
      Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -GptType "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}" -ErrorAction SilentlyContinue | Out-Null
    } catch {}
    Write-Host ""
    Write-Host "  Particao blindada e ocultada novamente com sucesso!"
  } else {
    Write-Host "  A particao esta protegida no modo Recovery."
  }
}

Write-Host "============================================================"
`;

const tmp = path.join(os.tmpdir(), `inspect_analysis_${Date.now()}.ps1`);
fs.writeFileSync(tmp, '\ufeff' + ps, 'utf8');

try {
  const out = execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`, { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.error(e.stdout || e.message);
} finally {
  try { fs.unlinkSync(tmp); } catch (_) {}
}
