-- Plays the ferry scene (a test ROM whose trigger runs special 0x17B) and dumps video memory while it plays.
local K = C.GBA_KEY
local SB1 = 0x03005008
local function sb() local s = emu:read32(SB1) if s < 0x02000000 or s > 0x0203FFFF then return nil end return s end
local function loc() local s = sb() if not s then return -1, -1, 0, 0 end return emu:read8(s + 4), emu:read8(s + 5), emu:read16(0x02036E38 + 0x10) - 7, emu:read16(0x02036E38 + 0x12) - 7 end
local function dump(name, addr, len) local f = io.open(P.out .. "_" .. name .. ".bin", "wb") f:write(emu:readRange(addr, len)) f:close() end
local state, t0 = "intro", 0
callbacks:add("frame", function()
  local f = emu:currentFrame()
  local g, m, x, y = loc()
  if state == "intro" then
    if g == 3 and m == 0 and x == 33 and y == 10 and f > 1000 then state = "go" t0 = f emu:clearKeys(0x3FF) return end
    if f > 120 and f % 20 == 0 then emu:clearKeys(0x3FF) emu:addKey((f % 300 == 140) and K.START or K.A) elseif f % 20 == 3 then emu:clearKeys(0x3FF) end
  else
    local d = f - t0
    if d > 60 and d < 160 then emu:addKey(K.RIGHT) else emu:clearKeys(0x3FF) end
    if d % 60 == 0 then emu:screenshot(P.out .. "_" .. d .. ".png") end
    if d == 250 then dump("vram", 0x06000000, 0x18000) dump("pal", 0x05000000, 0x400) dump("oam", 0x07000000, 0x400) dump("io", 0x04000000, 0x60) end
    if d == 900 then os.exit(0) end
  end
end)
