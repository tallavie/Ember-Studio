-- A realistic-team gym battle: the player starts next to the leader, faces them and keeps pressing A (first move,
-- no thinking). Result: WIN when the badge flag gets set, LOSE when the player is sent away from the gym map.
--   P = { out, g, n, x, y, face, badge, frames }
local K = C.GBA_KEY
local SB1 = 0x03005008
local function sb() local s = emu:read32(SB1) if s < 0x02000000 or s > 0x0203FFFF then return nil end return s end
local function loc() local s = sb() if not s then return -1, -1, 0, 0 end return emu:read8(s + 4), emu:read8(s + 5), emu:read16(0x02036E38 + 0x10) - 7, emu:read16(0x02036E38 + 0x12) - 7 end
local function flag(f) local s = sb() if not s then return false end return (emu:read8(s + 0xEE0 + (f >> 3)) >> (f & 7)) & 1 == 1 end
local state, t0, arrived = "intro", 0, false
local fainted, swAt = 0, -1
local function hp(i) return emu:read16(0x02024284 + i * 100 + 86) end
local LOG = io.open(P.out .. ".txt", "w")
local function done(res) emu:screenshot(P.out .. ".png") LOG:write(res .. "\n") LOG:close() os.exit(0) end
callbacks:add("frame", function()
  local f = emu:currentFrame()
  local g, m, x, y = loc()
  if state == "intro" then
    if g == P.g and m == P.n and x == P.x and y == P.y and f > 1000 then state = "go" t0 = f emu:clearKeys(0x3FF) arrived = true return end
    if f > 120 and f % 20 == 0 then emu:clearKeys(0x3FF) emu:addKey((f % 300 == 140) and K.START or K.A) elseif f % 20 == 3 then emu:clearKeys(0x3FF) end
    if f > 60 * 60 * 3 then done("NOSTART") end
    return
  end
  local d = f - t0
  if flag(P.badge) then done("WIN at " .. d) end
  if arrived and (g ~= P.g or m ~= P.n) and d > 200 then done("LOSE (sent to " .. g .. "." .. m .. ") at " .. d) end
  if d == 30 then emu:clearKeys(0x3FF) emu:addKey(K[P.face]) elseif d == 40 then emu:clearKeys(0x3FF) end
  local nf = 0 for i = 0, 2 do if hp(i) == 0 then nf = nf + 1 end end
  if nf > fainted then fainted = nf swAt = d + 300 end           -- a Pokémon fainted: in a moment, pick the next one
  if swAt > 0 and d >= swAt then                                -- party screen: down to the next living one, A, A (shift)
    local k = d - swAt
    if k % 12 == 0 and k < 12 * fainted then emu:clearKeys(0x3FF) emu:addKey(K.DOWN)
    elseif k == 12 * fainted + 6 or k == 12 * fainted + 30 then emu:clearKeys(0x3FF) emu:addKey(K.A)
    elseif k % 12 == 4 then emu:clearKeys(0x3FF) end
    if k > 12 * fainted + 60 then swAt = -1 end
  elseif d > 60 then                                         -- B (says no to "switch?", closes menus), up, left, A (FIGHT), A (move 1)
    local c = d % 30
    emu:clearKeys(0x3FF)
    if c < 3 then emu:addKey(K.B) elseif c >= 6 and c < 9 then emu:addKey(K.UP) elseif c >= 11 and c < 14 then emu:addKey(K.LEFT)
    elseif (c >= 17 and c < 20) or (c >= 24 and c < 27) then emu:addKey(K.A) end
  end
  if nf >= 3 then done("LOSE (all fainted) at " .. d) end
  if d % 600 == 0 then emu:screenshot(P.out .. "_" .. d .. ".png") end
  if d > P.frames then done("TIMEOUT") end
end)
