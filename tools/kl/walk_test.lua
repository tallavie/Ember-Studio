-- Walks across one map seam in the real game (mGBA). walk_seams.py puts the settings in P above this text:
--   P = { out, g, n, x, y, dir = 'up'|'down'|'left'|'right', eg, en }
-- The test ROM (Emu.testRom) warps the player to (g.n, x, y) after the intro; then the direction is held until the
-- player stands on map eg.en (PASS) or time runs out (FAIL, with where the player got stuck).
local K = C.GBA_KEY
local SB1 = 0x03005008
local LOG = io.open(P.out .. ".txt", "w")
local function L(s) LOG:write(s .. "\n") LOG:flush() end
local DIR = { up = K.UP, down = K.DOWN, left = K.LEFT, right = K.RIGHT }
local function sb() local s = emu:read32(SB1) if s < 0x02000000 or s > 0x0203FFFF then return nil end return s end
local function loc()
  local s = sb() if not s then return -1, -1, 0, 0 end
  return emu:read8(s + 4), emu:read8(s + 5), emu:read16(0x02036E38 + 0x10) - 7, emu:read16(0x02036E38 + 0x12) - 7
end
local state, t0 = "intro", 0
local function finish(result, why)
  emu:screenshot(P.out .. ".png")
  local g, m, x, y = loc()
  L(result .. (why and (": " .. why) or "") .. string.format(" (at %d.%d %d,%d)", g, m, x, y))
  os.exit(result == "PASS" and 0 or 1)
end
callbacks:add("frame", function()
  local f = emu:currentFrame()
  local g, m, x, y = loc()
  if f > 60 * 60 * 6 then finish("FAIL", "timeout in " .. state) end
  if state == "intro" then
    if g == P.g and m == P.n and x == P.x and y == P.y and f > 1000 then state = "settle" t0 = f emu:clearKeys(0x3FF) L("arrived at " .. f) return end
    if f > 120 and f % 20 == 0 then emu:clearKeys(0x3FF) emu:addKey((f % 300 == 140) and K.START or K.A) elseif f % 20 == 3 then emu:clearKeys(0x3FF) end
  elseif state == "settle" then
    if f - t0 > 60 then state = "walk" t0 = f emu:addKey(DIR[P.dir]) end
  elseif state == "walk" then
    if g == P.eg and m == P.en then
      if f - t0 > 2 then emu:clearKeys(0x3FF) finish("PASS") end
    elseif f - t0 > 60 * 20 then emu:clearKeys(0x3FF) finish("FAIL", "did not reach " .. P.eg .. "." .. P.en) end
  end
end)
