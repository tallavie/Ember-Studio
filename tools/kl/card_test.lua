-- Opens the trainer card (START > the player's name) in the real game (mGBA) and takes a screenshot. P = { out, g, n, x, y }
local K = C.GBA_KEY
local SB1 = 0x03005008
local function sb() local s = emu:read32(SB1) if s < 0x02000000 or s > 0x0203FFFF then return nil end return s end
local function loc()
  local s = sb() if not s then return -1, -1, 0, 0 end
  return emu:read8(s + 4), emu:read8(s + 5), emu:read16(0x02036E38 + 0x10) - 7, emu:read16(0x02036E38 + 0x12) - 7
end
local state, t0 = "intro", 0
local function tap(key) emu:clearKeys(0x3FF) emu:addKey(key) end
local seq = { [60] = K.START, [120] = K.DOWN, [150] = K.DOWN, [180] = K.A }
callbacks:add("frame", function()
  local f = emu:currentFrame()
  local g, m, x, y = loc()
  if f > 60 * 60 * 5 then os.exit(1) end
  if state == "intro" then
    if g == P.g and m == P.n and x == P.x and y == P.y and f > 1000 then state = "card" t0 = f emu:clearKeys(0x3FF) return end
    if f > 120 and f % 20 == 0 then tap((f % 300 == 140) and K.START or K.A) elseif f % 20 == 3 then emu:clearKeys(0x3FF) end
  else
    local d = f - t0
    if seq[d] then tap(seq[d]) elseif seq[d - 4] then emu:clearKeys(0x3FF) end
    if d == 150 then emu:screenshot(P.out .. "_menu.png") end
    if d == 400 then emu:screenshot(P.out .. ".png") os.exit(0) end
  end
end)
