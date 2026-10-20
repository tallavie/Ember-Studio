-- Plays the new-game intro pressing A slowly, with a picture before every press. P = { out, every, frames }
local K = C.GBA_KEY
callbacks:add("frame", function()
  local f = emu:currentFrame()
  if f > P.frames then os.exit(0) end
  if f > 200 and f % P.every == 0 then emu:screenshot(P.out .. "_" .. f .. ".png") emu:clearKeys(0x3FF) emu:addKey(K.A)
  elseif f % P.every == 6 then emu:clearKeys(0x3FF) end
end)
