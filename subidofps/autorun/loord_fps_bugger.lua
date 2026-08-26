-- Loord Optimizer - Free Fire 240+ FPS Auto Bugger
local function applyLoordFpsBug()
  local pid = getProcessIDFromProcessName("HD-Player.exe") or getProcessIDFromProcessName("HD-Player") or getProcessIDFromProcessName("dnplayer.exe")
  if pid and pid > 0 then
    openProcess(pid)
    -- Passo 1: 500 para destravar
    speedhack_setSpeed(500)
    sleep(350)
    -- Passo 2: 0.5 (1a vez)
    speedhack_setSpeed(0.5)
    sleep(200)
    -- Passo 3: 0.5 (2a vez para cravar)
    speedhack_setSpeed(0.5)
    
    local f = io.open("scratch_iso/fps_bug_status.txt", "w")
    if f then
      f:write("SUCCESS: FPS Bug 500 -> 0.5 -> 0.5 aplicado no PID " .. tostring(pid))
      f:close()
    end
  end
end

-- Registra funcao global para poder ser chamada
_G.applyLoordFpsBug = applyLoordFpsBug
