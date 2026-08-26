-- Speedhack Auto Bugger for Free Fire (HD-Player.exe)
function bugFpsFreeFire(targetSpeed1, targetSpeed2)
  local speed1 = targetSpeed1 or 500
  local speed2 = targetSpeed2 or 0.5
  
  local procList = {"HD-Player.exe", "HD-Player", "dnplayer.exe", "Nox.exe", "MEmu.exe"}
  local attachedPid = nil
  
  for _, name in ipairs(procList) do
    local pid = getProcessIDFromProcessName(name)
    if pid and pid > 0 then
      openProcess(pid)
      attachedPid = pid
      break
    end
  end
  
  if attachedPid then
    -- Estagio 1: 500 para destravar limiter
    speedhack_setSpeed(speed1)
    sleep(350)
    -- Estagio 2: 0.5 para fixar maximo FPS
    speedhack_setSpeed(speed2)
    return true, attachedPid
  else
    return false, "Emulador nao encontrado. Abra o BlueStacks/MSI primeiro."
  end
end

function setSpeedhackCustom(speedVal)
  local procList = {"HD-Player.exe", "HD-Player", "dnplayer.exe", "Nox.exe", "MEmu.exe"}
  local attachedPid = nil
  for _, name in ipairs(procList) do
    local pid = getProcessIDFromProcessName(name)
    if pid and pid > 0 then
      openProcess(pid)
      attachedPid = pid
      break
    end
  end
  if attachedPid then
    speedhack_setSpeed(speedVal)
    return true, attachedPid
  else
    return false, "Emulador nao encontrado"
  end
end
