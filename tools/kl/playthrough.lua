-- Kachol-Lavan: plays the game from a plan (mGBA). P = { out, load = savestate or nil, save = savestate, plan = { ... } }
-- Plan actions (one after another):
--   { "walk", steps = { {g, n, x, y, dir}, ... } }        follow a path (from the editor's worldPath)
--   { "keys", seq = "A", frames = 600, untilFlag = f, untilMap = {g, n}, untilVar = {v, val} }   press keys until a condition
--   { "face", dir = "UP" }                                   turn (one short press)
--   { "talk", dir = "UP", frames = 600, untilFlag = .. }     face, then A through the dialogue (yes = A)
--   { "say", text = "..." }                                   a line in the log
-- Battles are handled whenever they start (FIGHT, a move, and switching after a faint). The log gets every step.
local K = C.GBA_KEY
local SB1 = 0x03005008
local LOG = io.open(P.out .. ".txt", "w")
local function L(s) LOG:write(s .. "\n") LOG:flush() end
local function sb() local s = emu:read32(SB1) if s < 0x02000000 or s > 0x0203FFFF then return nil end return s end
local function loc() local s = sb() if not s then return -1, -1, 0, 0 end return emu:read8(s + 4), emu:read8(s + 5), emu:read16(0x02036E38 + 0x10) - 7, emu:read16(0x02036E38 + 0x12) - 7 end
local function flag(f) local s = sb() if not s then return false end return (emu:read8(s + 0xEE0 + (f >> 3)) >> (f & 7)) & 1 == 1 end
local function var(v) local s = sb() if not s then return -1 end return emu:read16(s + 0x1000 + (v - 0x4000) * 2) end
local function setvar(v, x) local s = sb() if s then emu:write16(s + 0x1000 + (v - 0x4000) * 2, x) end end
local function inBattle() return (emu:read8(0x03003529) & 2) ~= 0 end
local function hp(i) return emu:read16(0x02024284 + i * 100 + 86) end
local DIR = { up = K.UP, down = K.DOWN, left = K.LEFT, right = K.RIGHT, UP = K.UP, DOWN = K.DOWN, LEFT = K.LEFT, RIGHT = K.RIGHT }
local KEY = { A = K.A, B = K.B, S = K.START, U = K.UP, D = K.DOWN, L = K.LEFT, R = K.RIGHT, E = K.SELECT }

local step, sub, t0, still, lastKey, started = 1, 1, 0, 0, "", false
local fainted, swAt = 0, -1
local function finish(res, why)
  emu:screenshot(P.out .. ".png")
  local g, m, x, y = loc()
  L(res .. (why and (": " .. why) or "") .. string.format(" (at %d.%d %d,%d, action %d)", g, m, x, y, step))
  if res == "DONE" and P.save then emu:saveStateFile(P.save) end
  os.exit(res == "DONE" and 0 or 1)
end

local function battle(f)
  local nf = 0 for i = 0, 5 do local h = hp(i) if emu:read32(0x02024284 + i * 100) ~= 0 and h == 0 then nf = nf + 1 end end
  if nf > fainted then fainted = nf swAt = f + 300 end
  if nf < fainted then fainted = nf end
  emu:clearKeys(0x3FF)
  if swAt > 0 and f >= swAt then
    local k = f - swAt
    if k % 12 == 0 and k < 12 * fainted then emu:addKey(K.DOWN) elseif k == 12 * fainted + 6 or k == 12 * fainted + 30 then emu:addKey(K.A) end
    if k > 12 * fainted + 60 then swAt = -1 end
    return
  end
  local g, m = loc()
  if g == 1 and m >= 63 and m <= 66 then                        -- the Safari: RUN (down, right, A), so the balls don't run out
    local c = f % 30
    if c < 3 then emu:addKey(K.B) elseif c >= 6 and c < 9 then emu:addKey(K.DOWN) elseif c >= 11 and c < 14 then emu:addKey(K.RIGHT) elseif c >= 17 and c < 20 then emu:addKey(K.A) end
    return
  end
  local c = f % 48                                              -- B (no to "switch?"), up, left, A = FIGHT; then up, left, (right/down
  local mv = (f // 48) % 4                                      -- for this turn's move) and A
  if c < 3 then emu:addKey(K.B) elseif c >= 6 and c < 9 then emu:addKey(K.UP) elseif c >= 11 and c < 14 then emu:addKey(KEY[BATTLE_FIGHT or "L"])
  elseif c >= 17 and c < 20 then emu:addKey(K.A)
  elseif c >= 26 and c < 29 then emu:addKey(K.UP) elseif c >= 31 and c < 34 then emu:addKey(K.LEFT)
  elseif c >= 36 and c < 39 then if mv % 2 == 1 then emu:addKey(K.RIGHT) end
  elseif c >= 40 and c < 43 then if mv >= 2 then emu:addKey(K.DOWN) end
  elseif c >= 45 then emu:addKey(K.A) end
end


-- { "gotoVar", var = 0x4000, targets = { [1] = {x, y, "UP"}, ... }, grid = { w = W, h = H, rows = { "..#", ... } }, presses = 3 }
-- reads the variable, walks (BFS on the grid, '.' = free) to the target cell, faces, presses A a few times
local function liveGrid()                                  -- the map as it is now (gBackupMapLayout) and where the people stand
  local w, h, p = emu:read32(0x03005040), emu:read32(0x03005044), emu:read32(0x03005048)
  local occ = {}
  for i = 1, 15 do local o = 0x02036E38 + i * 0x24 if (emu:read8(o) & 1) == 1 then occ[(emu:read16(o + 0x10) - 7) .. "," .. (emu:read16(o + 0x12) - 7)] = true end end
  local lay = emu:read32(0x02036DFC)                         -- gMapHeader.mapLayout: tilesets, to tell water (behaviours 0x10-0x15) from land
  local attr = nil
  if lay >= 0x08000000 and emu:read32(lay) == w - 15 then attr = { emu:read32(emu:read32(lay + 16) + 20), emu:read32(emu:read32(lay + 20) + 20) } end
  return { live = true, w = w - 15, h = h - 14, vw = w, p = p, occ = occ, attr = attr }
end
local function liveWater(grid, cell)
  if not grid.attr then return false end
  local id = cell & 0x3FF
  local b = id < 640 and emu:read32(grid.attr[1] + id * 4) or emu:read32(grid.attr[2] + (id - 640) * 4)
  b = b & 0x1FF
  return b >= 0x10 and b <= 0x15
end
local function dumpMap(g, m, x, y)                           -- the live map in the log: # wall, ~ water, P people, @ the player
  local G = liveGrid() L(string.format("map %d.%d %dx%d (player %d,%d)", g, m, G.w, G.h, x, y))
  for yy = math.max(0, y - 10), math.min(G.h - 1, y + 10) do local row = string.format("%3d ", yy) for xx = 0, G.w - 1 do
    local cell = emu:read16(G.p + ((yy + 7) * G.vw + xx + 7) * 2)
    row = row .. ((xx == x and yy == y) and "@" or G.occ[xx .. "," .. yy] and "P" or ((cell >> 10) & 3) ~= 0 and "#" or liveWater(G, cell) and "~" or ".") end L(row) end
end
local function bfs(grid, sx, sy, tx, ty)
  local W, H = grid.w, grid.h
  local function free(x, y)
    if x < 0 or y < 0 or x >= W or y >= H then return false end
    if grid.live then
      if x == tx and y == ty then return true end
      if grid.occ[x .. "," .. y] then return false end
      local cell = emu:read16(grid.p + ((y + 7) * grid.vw + x + 7) * 2)
      return ((cell >> 10) & 3) == 0 and not liveWater(grid, cell)
    end
    return grid.rows[y + 1]:sub(x + 1, x + 1) == "."
  end
  local prev, q, qi = {}, {{sx, sy}}, 1
  prev[sy * W + sx] = -1
  while qi <= #q do
    local c = q[qi] qi = qi + 1
    if c[1] == tx and c[2] == ty then break end
    for _, dd in ipairs({{0, 1}, {0, -1}, {1, 0}, {-1, 0}}) do
      local nx, ny = c[1] + dd[1], c[2] + dd[2]
      if free(nx, ny) and prev[ny * W + nx] == nil then prev[ny * W + nx] = c[2] * W + c[1] q[#q + 1] = {nx, ny} end
    end
  end
  if prev[ty * W + tx] == nil then return nil end
  local path, k = {}, ty * W + tx
  while k ~= -1 do table.insert(path, 1, {k % W, k // W}) k = prev[k] end
  return path
end
local gv = { path = nil, i = 1, phase = 0 }

local function cond(a)
  local g, m = loc()
  if a.untilFlag and flag(a.untilFlag) then return true end
  if a.untilNoFlag and not flag(a.untilNoFlag) then return true end
  if a.untilMap and g == a.untilMap[1] and m == a.untilMap[2] then return true end
  if a.untilVar and var(a.untilVar[1]) == a.untilVar[2] then return true end
  if a.untilParty and emu:read8(0x02024029) >= a.untilParty then return true end
  return false
end

callbacks:add("start", function() end)
if P.load then callbacks:add("frame", function() end) end
local loaded, resetT = false, false
local function tick()
  local f = emu:currentFrame()
  if P.load and not loaded then emu:loadStateFile(P.load) loaded = true resetT = true L("loaded " .. P.load) return end
  if not loaded then loaded = true t0 = f end
  if resetT then t0 = f resetT = false return end              -- the frame counter jumped with the loaded state
  if P.poke then for _, pv in ipairs(P.poke) do if f % 300 == 0 and not inBattle() then setvar(pv[1], pv[2]) end end end   -- e.g. let the HM script run again
  if f % 60 == 0 then                                           -- options: battle style SET, battle scene off, fast text
    local s2 = emu:read32(0x0300500C)
    if s2 >= 0x02000000 and s2 < 0x02040000 then local o = emu:read16(s2 + 0x14) emu:write16(s2 + 0x14, (o & ~7) | 2 | 0x200 | 0x400) end
  end
  if f % (P.shot or 3600) == 0 then emu:screenshot(P.out .. "_" .. f .. ".png") end
  if inBattle() then battle(f) still = 0 return end
  local a = P.plan[step]
  if not a then finish("DONE") end
  local g, m, x, y = loc()
  local d = f - t0
  if a[1] == "dump" then dumpMap(g, m, x, y) step = step + 1 t0 = f return end
  if a[1] == "say" then L("-- " .. a.text) step = step + 1 t0 = f return end
  if a[1] == "keys" or a[1] == "talk" or a[1] == "face" then
    emu:clearKeys(0x3FF)
    if a[1] == "face" then
      if d >= 16 and d < 24 then emu:addKey(DIR[a.dir]) end
      if d > 40 then step = step + 1 t0 = f end
      return
    end
    if a[1] == "talk" and d < 40 then if d >= 16 and d < 24 then emu:addKey(DIR[a.dir]) end return end   -- after the last step has ended
    local seq = a.seq or "A"
    local per = a.per or 24
    local ki = ((d // per) % #seq) + 1
    if d % per < 4 then local kk = KEY[seq:sub(ki, ki)] if kk then emu:addKey(kk) end end
    if (a.untilFlag or a.untilMap or a.untilVar or a.untilNoFlag or a.untilParty) and cond(a) and d > 30 then L(string.format("%d ok %s", step, a.note or a[1])) step = step + 1 t0 = f return end
    if d > (a.frames or 600) then
      if a.untilFlag or a.untilMap or a.untilVar or a.untilNoFlag or a.untilParty then finish("FAIL", "condition not reached: " .. (a.note or a[1])) end
      L(string.format("%d done %s", step, a.note or a[1])) step = step + 1 t0 = f
    end
    return
  end
  if a[1] == "goto" then a[1] = "gotoVar" a.targets = { [-1] = { a.x, a.y, a.face or "UP" } } end
  if a[1] == "gotoVar" then
    emu:clearKeys(0x3FF)
    if not gv.path then
      local v = a.var and var(a.var) or -1 local T = a.targets[v]
      if not T then finish("FAIL", "no target for var value " .. tostring(v)) end
      gv.T = T gv.path = bfs(a.grid or liveGrid(), x, y, T[1], T[2]) gv.i = 1 gv.phase = 0 gv.still = 0
      if not gv.path then finish("FAIL", "no grid path to " .. T[1] .. "," .. T[2]) end
      L(string.format("%d gotoVar %x = %d -> %d,%d", step, a.var or 0, v, T[1], T[2]))
    end
    if gv.phase == 0 then
      while gv.i <= #gv.path and gv.path[gv.i][1] == x and gv.path[gv.i][2] == y do gv.i = gv.i + 1 end
      if gv.i > #gv.path then gv.phase = 1 gv.t = f return end
      local nx, ny = gv.path[gv.i][1], gv.path[gv.i][2]
      local dn = nx > x and "right" or nx < x and "left" or ny > y and "down" or "up"
      gv.still = gv.still + 1
      if gv.still % 60 < 40 then emu:addKey(DIR[dn]) elseif gv.still % 60 < 44 then emu:addKey(K.B) end
      if gv.still > 3000 then finish("FAIL", "gotoVar stuck") end
      if gv.still % 300 == 299 and not a.grid then gv.path = bfs(liveGrid(), x, y, gv.T[1], gv.T[2]) or gv.path gv.i = 1 end
      if math.abs(nx - x) + math.abs(ny - y) == 0 then gv.still = 0 end
      return
    end
    local k = f - gv.t
    if k >= 16 and k < 24 then emu:addKey(DIR[gv.T[3]]) end
    if k > 40 and (k - 40) % 30 < 4 then emu:addKey(K.A) end
    if k > 40 + 30 * (a.presses or 4) then L(string.format("%d pressed at %d,%d", step, x, y)) gv.path = nil step = step + 1 t0 = f end
    return
  end
  if a[1] == "walk" then
    local S = a.steps
    for j = sub, #S do local s = S[j] if s[1] == g and s[2] == m and s[3] == x and s[4] == y then sub = j + 1 still = 0 break end end
    if sub > #S then L(string.format("%d walked %s", step, a.note or "")) step = step + 1 sub = 1 t0 = f emu:clearKeys(0x3FF) return end
    local k = g .. "." .. m .. ":" .. x .. "," .. y
    if k == lastKey then still = still + 1 else still = 0 lastKey = k end
    local T = S[sub]
    local dname = T[5]
    if a.lastSub ~= sub then a.lastSub = sub a.subAt = f end
    if f - a.subAt > 1200 and (f - a.subAt) % 600 == 0 then L(string.format("slow at %d.%d %d,%d (step %d -> %d.%d %d,%d) still %d battle %s", g, m, x, y, sub, T[1], T[2], T[3], T[4], still, tostring(inBattle and inBattle()))) if not a.dumped then a.dumped = true dumpMap(g, m, x, y) end end
    if not (T[1] == g and T[2] == m) and sub > 1 then        -- the next step is on another map: first get to the last step on this one
      for j = sub - 1, 1, -1 do local s = S[j] if s[1] == g and s[2] == m then
        if not (s[3] == x and s[4] == y) then T = s end
        break
      end end
    end
    if T[1] == g and T[2] == m then
      local dx, dy = T[3] - x, T[4] - y
      if dx ~= 0 or dy ~= 0 then                                  -- always toward the step from where we stand (off the path after a detour too)
        if math.abs(dx) >= math.abs(dy) and dx ~= 0 then dname = dx > 0 and "right" or "left" elseif dy ~= 0 then dname = dy > 0 and "down" or "up" end
      end
    end
    emu:clearKeys(0x3FF)
    if still > 200 and T[1] == g and T[2] == m then             -- someone stands in the way: a detour (live map) to a step further on
      if not a.detour and still % 120 == 81 then
        if still % 600 == 201 then L(string.format("blocked at %d.%d %d,%d (step %d -> %d,%d)", g, m, x, y, sub, T[3], T[4])) if not a.dumped then a.dumped = true dumpMap(g, m, x, y) end end
        for j = math.min(#S, sub + 2), math.min(#S, sub + 8) do local s2 = S[j]
          if s2[1] == g and s2[2] == m then L('bfs ' .. s2[3] .. ',' .. s2[4]) local pth = bfs(liveGrid(), x, y, s2[3], s2[4]) L('bfs done ' .. tostring(pth and #pth)) if pth then a.detour = pth a.di = 1 break end end
        end
      end
      if a.detour then
        while a.di <= #a.detour and a.detour[a.di][1] == x and a.detour[a.di][2] == y do a.di = a.di + 1 end
        if a.di > #a.detour then a.detour = nil still = 0 return end
        local nx, ny = a.detour[a.di][1], a.detour[a.di][2]
        if (f % 30) < 20 then emu:addKey(DIR[nx > x and "right" or nx < x and "left" or ny > y and "down" or "up"]) elseif (f % 30) < 24 then emu:addKey(K.B) end   -- B: a text may be open
        if still > 60 * 30 then a.detour = nil end
        if still > 60 * 120 then finish("FAIL", string.format("stuck on a detour (%s) at %d.%d %d,%d", a.note or "", g, m, x, y)) end
        return
      end
    end
    local ph = still % 160
    if still <= 30 or ph >= 140 then emu:addKey(DIR[dname])
    elseif ph % 20 < 4 and ph < 120 then emu:addKey((still // 160) % 3 == 2 and K.A or K.B)   -- B closes texts without talking again
    end
    if still > 60 * 120 then finish("FAIL", string.format("stuck walking (%s) before %d.%d %d,%d", a.note or "", T[1], T[2], T[3], T[4])) end
    return
  end
  finish("FAIL", "unknown action " .. tostring(a[1]))
end
callbacks:add("frame", function() local ok, err = pcall(tick) if not ok then L("LUA ERROR: " .. tostring(err)) emu:screenshot(P.out .. ".png") os.exit(2) end end)
