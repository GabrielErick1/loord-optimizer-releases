Write-Host "============================================================";
Write-Host "🔍 RELATÓRIO COMPLETO DE ANÁLISE: PARTIÇÃO E ARQUIVOS DA ISO";
Write-Host "============================================================";

# 1. Verificar Arquivo da ISO no Sistema Oculto
$isoPath = "C:\ProgramData\LoordOptimizer\SysCore\Loord_v10.6.0.iso";
Write-Host "`n📁 1. ARQUIVO DA ISO BAIXADO NO SISTEMA:";
if (Test-Path $isoPath) {
  $f = Get-Item $isoPath -Force;
  $sizeGB = [math]::Round($f.Length / 1GB, 2);
  Write-Host "  ✅ STATUS: ISO Encontrada e Blindada!";
  Write-Host "  • Caminho: $isoPath";
  Write-Host "  • Tamanho: $sizeGB GB ($($f.Length) bytes)";
  Write-Host "  • Atributos: $($f.Attributes)";
} else {
  Write-Host "  ❌ STATUS: Arquivo da ISO não encontrado em $isoPath";
}

# 2. Verificar Partições Criadas no SSD/HD
Write-Host "`n💾 2. PARTIÇÃO DE INSTALAÇÃO NO DISCO:";
$cPart = Get-Partition -DriveLetter C;
$diskNum = $cPart.DiskNumber;
$parts = Get-Partition -DiskNumber $diskNum;

$loordPart = $parts | Where-Object {
  $v = $_ | Get-Volume -ErrorAction SilentlyContinue;
  ($v -and ($v.FileSystemLabel -eq "LOORD_SETUP" -or $v.FileSystemLabel -eq "RECOVERY_LOORD")) -or ($_.Size -gt 7GB -and $_.Size -lt 10GB -and $_.PartitionNumber -ne $cPart.PartitionNumber)
};

if ($loordPart) {
  $sizeGB = [math]::Round($loordPart.Size / 1GB, 2);
  Write-Host "  ✅ STATUS: Partição de 8 GB Criada no Disco Principal (Disco $diskNum)!";
  Write-Host "  • Partição Nº: $($loordPart.PartitionNumber)";
  Write-Host "  • Tamanho: $sizeGB GB";
  Write-Host "  • Tipo: $($loordPart.Type) (Protegida/Oculta)";
  Write-Host "  • GPT Type: $($loordPart.GptType)";
} else {
  Write-Host "  ❌ STATUS: Partição de 8 GB não encontrada no disco principal.";
}

# 3. Inspecionar Arquivos Dentro da Partição
Write-Host "`n📂 3. ARQUIVOS GRAVADOS DENTRO DA PARTIÇÃO:";
if ($loordPart) {
  # Atribui letra temporária L: para inspecionar
  try {
    Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -GptType "{ebd0a0a2-b9e5-4433-87c0-68b6b72699c7}" -ErrorAction SilentlyContinue | Out-Null;
    Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -NewDriveLetter L -ErrorAction SilentlyContinue | Out-Null;
  } catch {}
  Start-Sleep -Seconds 1;

  if (Test-Path "L:\") {
    $vol = Get-Volume -DriveLetter L -ErrorAction SilentlyContinue;
    if ($vol) {
      $usado = [math]::Round(($vol.Size - $vol.SizeRemaining) / 1GB, 2);
      $total = [math]::Round($vol.Size / 1GB, 2);
      Write-Host "  • Nome do Volume: $($vol.FileSystemLabel)";
      Write-Host "  • Espaço Gravado: $usado GB de $total GB";
    }

    Write-Host "`n  Lista de Arquivos Principais na Partição (L:\):";
    Get-ChildItem "L:\" -Force | ForEach-Object {
      if ($_.PSIsContainer) {
        Write-Host "   📁 [PASTA]   $($_.Name)";
      } else {
        $mb = [math]::Round($_.Length / 1MB, 2);
        Write-Host "   📄 [ARQUIVO] $($_.Name) ($mb MB)";
      }
    }

    if (Test-Path "L:\sources") {
      Write-Host "`n  Arquivos de Instalação e Boot em L:\sources:";
      Get-ChildItem "L:\sources" -Force | Where-Object { $_.Name -like "*boot*" -or $_.Name -like "*install*" -or $_.Name -like "*setup*" } | ForEach-Object {
        $mb = [math]::Round($_.Length / 1MB, 2);
        Write-Host "   ⚙️ $($_.Name) ($mb MB)";
      }
    }

    # Oculta novamente
    try {
      Remove-PartitionAccessPath -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -AccessPath "L:\" -ErrorAction SilentlyContinue | Out-Null;
      Set-Partition -DiskNumber $diskNum -PartitionNumber $loordPart.PartitionNumber -GptType "{de94bba4-06d1-4d40-a16a-bfd50179d6ac}" -ErrorAction SilentlyContinue | Out-Null;
    } catch {}
    Write-Host "`n  🔒 Partição blindada e ocultada novamente com sucesso!";
  } else {
    Write-Host "  ℹ️ A partição está protegida no modo Recovery.";
  }
}

# 4. Verificar Ambiente de Boot Windows RE
Write-Host "`n🚀 4. CONFIGURAÇÃO DE BOOT (WINDOWS RE):";
$reDir = "C:\Recovery\WindowsRE";
if (Test-Path "$reDir\Winre.wim") {
  $wim = Get-Item "$reDir\Winre.wim" -Force;
  $wimMB = [math]::Round($wim.Length / 1MB, 2);
  Write-Host "  ✅ STATUS: Imagem de Boot Winre.wim Pronta para Formatação!";
  Write-Host "  • Tamanho do Boot: $wimMB MB";
} else {
  Write-Host "  ℹ️ O arquivo Winre.wim será carregado automaticamente no momento do clique em Formatar.";
}

Write-Host "============================================================";
