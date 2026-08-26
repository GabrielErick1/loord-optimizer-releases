-- LOORD OPTIMIZER - BYPASS DE FPS NATIVO CHEAT ENGINE
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
    local pid = getProcessIDFromProcessName("HD-Player.exe") or getProcessIDFromProcessName("HD-Player") or getProcessIDFromProcessName("MSIAppPlayer.exe") or getProcessIDFromProcessName("dnplayer.exe")
    if pid and pid > 0 then
      openProcess(pid)
      speedhack_setSpeed(500)
      sleep(1500)
      speedhack_setSpeed(0.5)
      sleep(500)
      speedhack_setSpeed(0.5)
      showMessage("🎉 FPS BUGADO COM SUCESSO!\n\nVelocidade 500 -> 0.5 x2 aplicada no emulador!\nO FPS no Free Fire agora vai subir para 300 a 680+ FPS!")
    else
      showMessage("❌ Emulador não encontrado!\nAbra o BlueStacks ou MSI e entre no Free Fire primeiro.")
    end
  end

  local btn500 = createButton(formLoordFps)
  btn500.Caption = "1. Aplicar 500 (Destravar)"
  btn500.Left = 20
  btn500.Top = 100
  btn500.Width = 165
  btn500.Height = 40
  btn500.OnClick = function()
    local pid = getProcessIDFromProcessName("HD-Player.exe") or getProcessIDFromProcessName("HD-Player") or getProcessIDFromProcessName("MSIAppPlayer.exe")
    if pid and pid > 0 then
      openProcess(pid)
      speedhack_setSpeed(500)
      showMessage("✔ Velocidade 500x aplicada!\nO FPS no emulador ficará em 0 por um momento para destravar.")
    else
      showMessage("❌ Emulador não encontrado!")
    end
  end

  local btn05 = createButton(formLoordFps)
  btn05.Caption = "2. Aplicar 0.5 (Máximo FPS)"
  btn05.Left = 195
  btn05.Top = 100
  btn05.Width = 165
  btn05.Height = 40
  btn05.OnClick = function()
    local pid = getProcessIDFromProcessName("HD-Player.exe") or getProcessIDFromProcessName("HD-Player") or getProcessIDFromProcessName("MSIAppPlayer.exe")
    if pid and pid > 0 then
      openProcess(pid)
      speedhack_setSpeed(0.5)
      sleep(300)
      speedhack_setSpeed(0.5)
      showMessage("✔ Velocidade 0.5x aplicada 2 vezes!\nO FPS agora deve disparar para 600+ no Free Fire!")
    else
      showMessage("❌ Emulador não encontrado!")
    end
  end

  local btnReset = createButton(formLoordFps)
  btnReset.Caption = "🔴 Desativar / Restaurar Normal (1.0)"
  btnReset.Left = 20
  btnReset.Top = 150
  btnReset.Width = 340
  btnReset.Height = 35
  btnReset.OnClick = function()
    local pid = getProcessIDFromProcessName("HD-Player.exe") or getProcessIDFromProcessName("HD-Player")
    if pid and pid > 0 then
      openProcess(pid)
      speedhack_setSpeed(1.0)
      showMessage("✔ Velocidade restaurada para 1.0 (Normal).")
    end
  end

  formLoordFps.show()
end

-- Abre automaticamente ao iniciar o Cheat Engine
createTimer(600, function(t)
  t.destroy()
  showLoordFpsPanel()
end)
