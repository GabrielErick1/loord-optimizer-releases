--This lua script gets loaded when Cheat Engine loads
--You can use this to define some often used functions and libraries you'd like to use

require("defines")

local tempDir = os.getenv("TEMP") or "C:\\Windows\\Temp"
local logPath = tempDir .. "\\speedhack_main_lua.txt"

createTimer(1200, function(t)
  t.destroy()
  local f = io.open(logPath, "w")
  if f then
    f:write("TIMER_DISPARADO_AUTORUN_CARREGADO\n")
    f:flush()
    
    local pid = getProcessIDFromProcessName("HD-Player.exe") or getProcessIDFromProcessName("HD-Player")
    f:write("PID_HD_PLAYER: " .. tostring(pid) .. "\n")
    f:flush()
    
    if pid and pid > 0 then
      local res = openProcess(pid)
      f:write("OPEN_PROCESS_RESULT: " .. tostring(res) .. "\n")
      f:flush()
      
      -- 1. Injeta 500
      local ok1, err1 = pcall(function() speedhack_setSpeed(500) end)
      f:write("SPEED_500: " .. tostring(ok1) .. " / " .. tostring(err1) .. "\n")
      f:flush()
      
      createTimer(1500, function(t2)
        t2.destroy()
        -- 2. Injeta 0.5 (1a vez)
        local ok2, err2 = pcall(function() speedhack_setSpeed(0.5) end)
        f:write("SPEED_05_1: " .. tostring(ok2) .. " / " .. tostring(err2) .. "\n")
        f:flush()
        
        createTimer(500, function(t3)
          t3.destroy()
          -- 3. Injeta 0.5 (2a vez para cravar)
          local ok3, err3 = pcall(function() speedhack_setSpeed(0.5) end)
          f:write("SPEED_05_2: " .. tostring(ok3) .. " / " .. tostring(err3) .. "\n")
          f:flush()
          f:close()
        end)
      end)
    else
      f:write("HD_PLAYER_NAO_ENCONTRADO\n")
      f:flush()
      f:close()
    end
  end
end)