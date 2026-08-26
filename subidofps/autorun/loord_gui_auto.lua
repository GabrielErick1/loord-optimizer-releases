-- Test Cheat Engine GUI automation
local function setupSpeedhackGui()
  local pid = getProcessIDFromProcessName("HD-Player.exe") or getProcessIDFromProcessName("HD-Player")
  if pid and pid > 0 then
    openProcess(pid)
    
    -- Ativa o Speedhack no GUI principal
    local mf = getMainForm()
    if mf and mf.cbSpeedhack then
      mf.cbSpeedhack.Checked = true
    end
  end
end

createTimer(1000, function(t)
  t.destroy()
  setupSpeedhackGui()
end)
