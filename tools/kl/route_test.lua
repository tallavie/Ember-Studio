-- Walks a whole leg of the story in the real game (mGBA), following a path the editor computed (worldPath):
--   P = { out, g, n, x, y, steps = { {g, n, x, y, dir}, ... } }   dir = how to get onto that cell (up/down/left/right/warp)
-- The test ROM warps the player to the first cell after the intro. Messages are closed with A; if the player stands
-- still for a long time the test fails and says where.
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
local function finish(result, why)
  emu:screenshot(P.out .. ".png")
  local g, m, x, y = loc()
  L(result .. (why and (": " .. why) or "") .. string.format(" (at %d.%d %d,%d)", g, m, x, y))
  os.exit(result == "PASS" and 0 or 1)
end
local S = P.steps
local state, i, lastKey, still, lastDir = "intro", 2, "", 0, "down"
callbacks:add("frame", function()
  local f = emu:currentFrame()
  local g, m, x, y = loc()
  if f > 60 * 60 * 30 then finish("FAIL", "timeout at step " .. i .. "/" .. #S) end
  if state == "intro" then
    if g == P.g and m == P.n and x == P.x and y == P.y and f > 1000 then state = "walk" emu:clearKeys(0x3FF) L("start at " .. f) return end
    if f > 120 and f % 20 == 0 then emu:clearKeys(0x3FF) emu:addKey((f % 300 == 140) and K.START or K.A) elseif f % 20 == 3 then emu:clearKeys(0x3FF) end
    return
  end
  -- caught up with the path (also past skipped cells: ledges, warps)
  local found = false
  for j = i, #S do                                       -- also far ahead (ledges, warps, a scene that moved the player)
    local s = S[j]
    if s[1] == g and s[2] == m and s[3] == x and s[4] == y then i = j + 1 still = 0 found = true break end
  end
  if not found then for j = i - 1, math.max(1, i - 15), -1 do   -- or a little behind (pushed back by a scene)
    local s = S[j]
    if s[1] == g and s[2] == m and s[3] == x and s[4] == y then i = j + 1 break end
  end end
  if i > #S then emu:clearKeys(0x3FF) finish("PASS") end
  if f % 1800 == 0 then emu:screenshot(P.out .. "_" .. f .. ".png") end
  local k = g .. "." .. m .. ":" .. x .. "," .. y
  if k == lastKey then still = still + 1 else still = 0 lastKey = k end
  local d = S[i][5]
  if d == "warp" then d = lastDir else lastDir = d end
  local T = S[i]                                            -- off the path on the same map (a scene moved the player): head for it
  if T[1] == g and T[2] == m then
    local dx, dy = T[3] - x, T[4] - y
    if math.abs(dx) + math.abs(dy) > 1 or (still > 60 and (dx ~= 0 or dy ~= 0)) then
      if math.abs(dx) >= math.abs(dy) and dx ~= 0 then d = dx > 0 and "right" or "left" elseif dy ~= 0 then d = dy > 0 and "down" or "up" end
    end
  end   -- (old lists: the editor now writes the key a warp needs)
  emu:clearKeys(0x3FF)
  -- standing still: a message or a battle - press A (a direction here would move the battle cursor); now and then B
  -- (backs out of a menu) and a short try at walking on (someone who was in the way may have moved)
  local ph = still % 160
  local inBattle = (emu:read8(0x03003529) & 2) ~= 0       -- gMain.inBattle: in a battle only A (and B), never a direction
  if inBattle then
    local c = f % 48                                         -- B, up, left, A = FIGHT; then in the move menu up, left (= move 1),
    local mv = (f // 48) % 4                                 -- then right / down for this turn's move, and A
    if c < 3 then emu:addKey(K.B) elseif c >= 6 and c < 9 then emu:addKey(K.UP) elseif c >= 11 and c < 14 then emu:addKey(K.LEFT)
    elseif c >= 17 and c < 20 then emu:addKey(K.A)
    elseif c >= 26 and c < 29 then emu:addKey(K.UP) elseif c >= 31 and c < 34 then emu:addKey(K.LEFT)
    elseif c >= 36 and c < 39 then if mv % 2 == 1 then emu:addKey(K.RIGHT) end
    elseif c >= 40 and c < 43 then if mv >= 2 then emu:addKey(K.DOWN) end
    elseif c >= 45 then emu:addKey(K.A) end
  elseif still <= 30 or ph >= 140 then emu:addKey(DIR[d])
  elseif ph % 20 < 4 and ph < 120 then emu:addKey(K.A)
  elseif ph >= 124 and ph < 128 then emu:addKey(K.B) end
  if still > 60 * 400 then finish("FAIL", "stuck before step " .. i .. "/" .. #S .. string.format(" (next %d.%d %d,%d %s)", S[i][1], S[i][2], S[i][3], S[i][4], S[i][5])) end
end)
