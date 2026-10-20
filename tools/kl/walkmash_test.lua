-- Talks to whoever stands next to the player in the real game (mGBA) and takes screenshots. P = { out, g, n, x, y, face }

local K = C.GBA_KEY
local SB1 = 0x03005008
local function sb() local s = emu:read32(SB1) if s < 0x02000000 or s > 0x0203FFFF then return nil end return s end
local function loc()
  local s = sb() if not s then return -1, -1, 0, 0 end
  return emu:read8(s + 4), emu:read8(s + 5), emu:read16(0x02036E38 + 0x10) - 7, emu:read16(0x02036E38 + 0x12) - 7
end
local state, t0 = "intro", 0
local function tap(key) emu:clearKeys(0x3FF) emu:addKey(key) end
callbacks:add("frame", function()
  local f = emu:currentFrame()
  local g, m, x, y = loc()
  if f > 60 * 60 * 5 then emu:screenshot(P.out .. "_timeout.png") os.exit(1) end
  if state == "intro" then
    if g == P.g and m == P.n and x == P.x and y == P.y and f > 1000 then state = "shop" t0 = f emu:clearKeys(0x3FF) return end
    if f > 120 and f % 20 == 0 then tap((f % 300 == 140) and K.START or K.A) elseif f % 20 == 3 then emu:clearKeys(0x3FF) end
  else
    local d = f - t0
    if d == 60 then emu:clearKeys(0x3FF) emu:addKey(K[P.face]) elseif d == 90 then emu:clearKeys(0x3FF) end
    if P.mash then                                  -- keep pressing A (a whole battle), pictures along the way
      if d >= 100 and d % 30 == 0 then tap(K.A) elseif d >= 100 and d % 30 == 4 then emu:clearKeys(0x3FF) end
      if d % 150 == 0 then emu:screenshot(P.out .. "_" .. d .. ".png") local g2, m2 = loc() local fh = io.open(P.out .. ".txt", "a") fh:write(d .. " " .. g2 .. "." .. m2 .. string.char(10)) fh:close() end
      if d >= P.mash then emu:screenshot(P.out .. ".png") os.exit(0) end
      return
    end
    if d == 100 or d == 220 or d == 340 then tap(K.A) elseif d == 104 or d == 224 or d == 344 then emu:clearKeys(0x3FF) end
    if d == 300 then emu:screenshot(P.out .. "_menu.png") end
    if d == 480 then emu:screenshot(P.out .. ".png") os.exit(0) end
  end
end)
