-- Opens the town map in the real game (mGBA) and takes a screenshot. town_test runs it with P = { out, g, n, x, y }.
-- The test ROM gives the Town Map (item 361) and warps to (g.n, x, y); here it is registered to SELECT and opened.
local K = C.GBA_KEY
local SB1 = 0x03005008
local function sb() local s = emu:read32(SB1) if s < 0x02000000 or s > 0x0203FFFF then return nil end return s end
local function loc()
  local s = sb() if not s then return -1, -1, 0, 0 end
  return emu:read8(s + 4), emu:read8(s + 5), emu:read16(0x02036E38 + 0x10) - 7, emu:read16(0x02036E38 + 0x12) - 7
end
local state, t0 = "intro", 0
callbacks:add("frame", function()
  local f = emu:currentFrame()
  local g, m, x, y = loc()
  if f > 60 * 60 * 5 then emu:screenshot(P.out .. ".png") os.exit(1) end
  if state == "intro" then
    if g == P.g and m == P.n and x == P.x and y == P.y and f > 1000 then state = "open" t0 = f emu:clearKeys(0x3FF) return end
    if f > 120 and f % 20 == 0 then emu:clearKeys(0x3FF) emu:addKey((f % 300 == 140) and K.START or K.A) elseif f % 20 == 3 then emu:clearKeys(0x3FF) end
  elseif state == "open" then
    local d = f - t0
    if d == 60 then emu:write16(sb() + 0x296, 361) end
    if d == 90 then emu:addKey(K.SELECT) end
    if d == 95 then emu:clearKeys(0x3FF) end
    if d == 300 then emu:screenshot(P.out .. ".png") os.exit(0) end
  end
end)
