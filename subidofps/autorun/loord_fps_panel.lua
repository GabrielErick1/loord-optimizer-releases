-- LOORD OPTIMIZER - BYPASS DE FPS NATIVO (FREE FIRE)
local function getEmulatorPid()
  return getProcessIDFromProcessName("HD-Player.exe") 
      or getProcessIDFromProcessName("HD-Player") 
      or getProcessIDFromProcessName("MSIAppPlayer.exe") 
      or getProcessIDFromProcessName("dnplayer.exe") 
      or getProcessIDFromProcessName("Nox.exe")
end

local function applySpeedhackThroughGui(speedValue)
  local mf = getMainForm()
  local pid = getEmulatorPid()
  if not pid or pid == 0 then
    return false, "Emulador nao encontrado"
  end

  openProcess(pid)
  
  if mf then
    if mf.cbSpeedhack and not mf.cbSpeedhack.Checked then
      mf.cbSpeedhack.Checked = true
    end
    if mf.edtSpeed then
      mf.edtSpeed.Text = tostring(speedValue)
    end
    if mf.btnSetSpeed then
      mf.btnSetSpeed.click()
    end
  end
  
  -- Fallback para funcao nativa caso o formulario nao esteja acessivel
  pcall(function() speedhack_setSpeed(speedValue) end)
  return true
end

local function executeBypassSequence()
  local mf = getMainForm()
  local pid = getEmulatorPid()
  if not pid or pid == 0 then
    showMessage("❌ Emulador não encontrado!\nAbra o BlueStacks ou MSI com o Free Fire aberto.")
    return
  end

  openProcess(pid)
  
  -- 1. Ativa o Speedhack no Cheat Engine
  if mf and mf.cbSpeedhack then
    mf.cbSpeedhack.Checked = true
  end

  -- 2. Sobe para 500 (FPS vai a 0 e quebra a trava da Unity)
  if mf and mf.edtSpeed and mf.btnSetSpeed then
    mf.edtSpeed.Text = "500"
    mf.btnSetSpeed.click()
  end
  pcall(function() speedhack_setSpeed(500) end)
  
  sleep(1500)
  
  -- 3. Aplica 0.5 (duas vezes seguidas para travar a taxa de 630+ FPS)
  if mf and mf.edtSpeed and mf.btnSetSpeed then
    mf.edtSpeed.Text = "0.5"
    mf.btnSetSpeed.click()
    sleep(400)
    mf.btnSetSpeed.click()
  end
  pcall(function() 
    speedhack_setSpeed(0.5)
    sleep(400)
    speedhack_setSpeed(0.5)
  end)

  showMessage("🎉 FPS BUGADO COM SUCESSO!\n\n✔ Sequência 500 -> 0.5 (2x) aplicada diretamente no motor do emulador!\nO FPS no Free Fire agora vai subir para 300 a 680+ FPS!")
end

-- Criar a janela visual integrada
local formLoordFps = nil
local function showLoordFpsPanel()
  if formLoordFps ~= nil then
    formLoordFps.show()
    return
  end

  formLoordFps = createForm(true)
  formLoordFps.Caption = "⚡ LOORD OPTIMIZER - BYPASS FPS 630+ (FREE FIRE)"
  formLoordFps.Width = 380
  formLoordFps.Height = 250
  formLoordFps.Position = "poScreenCenter"
  formLoordFps.Color = 0x18181b

  local lbl = createLabel(formLoordFps)
  lbl.Caption = "🔥 BYPASS DE FPS 240Hz+ / 630+ FPS (SPEEDHACK)"
  lbl.Left = 15
  lbl.Top = 15
  lbl.Font.Color = 0x38bdf8
  lbl.Font.Size = 9
  lbl.Font.Style = "[fsBold]"

  local btnBug = createButton(formLoordFps)
  btnBug.Caption = "⚡ BUGAR FPS (500 -> 0.5 x2 AUTO)"
  btnBug.Left = 20
  btnBug.Top = 45
  btnBug.Width = 340
  btnBug.Height = 45
  btnBug.Font.Style = "[fsBold]"
  btnBug.OnClick = function()
    executeBypassSequence()
  end

  local btn500 = createButton(formLoordFps)
  btn500.Caption = "1. Aplicar 500 (Destravar)"
  btn500.Left = 20
  btn500.Top = 100
  btn500.Width = 165
  btn500.Height = 40
  btn500.OnClick = function()
    applySpeedhackThroughGui(500)
    showMessage("✔ Velocidade 500x aplicada!\nO FPS no emulador ficará em 0 por um momento para destravar.")
  end

  local btn05 = createButton(formLoordFps)
  btn05.Caption = "2. Aplicar 0.5 (Máximo FPS)"
  btn05.Left = 195
  btn05.Top = 100
  btn05.Width = 165
  btn05.Height = 40
  btn05.OnClick = function()
    applySpeedhackThroughGui(0.5)
    sleep(300)
    applySpeedhackThroughGui(0.5)
    showMessage("✔ Velocidade 0.5x aplicada 2 vezes!\nO FPS agora deve disparar para 600+ no Free Fire!")
  end

  local btnReset = createButton(formLoordFps)
  btnReset.Caption = "🔴 Desativar / Restaurar Normal (1.0)"
  btnReset.Left = 20
  btnReset.Top = 150
  btnReset.Width = 340
  btnReset.Height = 35
  btnReset.OnClick = function()
    applySpeedhackThroughGui(1.0)
    showMessage("✔ Velocidade restaurada para 1.0 (Normal).")
  end

  formLoordFps.show()
end

createTimer(600, function(t)
  t.destroy()
  local pid = getEmulatorPid()
  if pid and pid > 0 then
    openProcess(pid)
  end
  showLoordFpsPanel()
end)
