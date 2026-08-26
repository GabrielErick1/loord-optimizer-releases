-- Cheat Engine Auto-Speedhack for Free Fire (HD-Player.exe)
-- Executa com direitos de Administrador sem erros

local function executeFpsBugSequence()
  local targetProcess = "HD-Player.exe"
  local pid = getProcessIDFromProcessName(targetProcess) or getProcessIDFromProcessName("HD-Player") or getProcessIDFromProcessName("dnplayer.exe") or getProcessIDFromProcessName("Nox.exe")
  
  if pid and pid > 0 then
    openProcess(pid)
    -- Passo 1: 500 (Destrava o limite de FPS do Free Fire e zera o FPS momentaneamente)
    speedhack_setSpeed(500)
    sleep(1500)
    -- Passo 2: 0.5 (Acelera a taxa de quadros no motor Unity)
    speedhack_setSpeed(0.5)
    sleep(500)
    -- Passo 3: 0.5 (Segunda aplicacao para cravar nos 600+ FPS)
    speedhack_setSpeed(0.5)
    
    print("[Loord Optimizer] FPS Bug aplicado com sucesso em PID: " .. tostring(pid))
  end
end

-- Se Cheat Engine for aberto, executa a calibracao
if getProcessIDFromProcessName("HD-Player.exe") or getProcessIDFromProcessName("HD-Player") then
  createTimer(500, function(t)
    t.destroy()
    executeFpsBugSequence()
  end)
end
