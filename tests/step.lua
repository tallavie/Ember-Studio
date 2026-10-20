-- One story step in the real game (mGBA). run_all.py puts the step's settings in P above this text:
--   P = { out, g, n, x, y, arrive = 'spot' | 'map', face = dir, walk = dir, key = 'A' | 'B', var, expect, flag = { id, 0 | 1 },
--         stay = frames (the variable must NOT change for that long: something waits), within = frames (it must happen that fast: skipped) }
-- The test ROM (Emu.testRom) gives the team, sets the story stage and warps to (g.n, x, y) once the intro is over.
-- This script presses A through the intro, then turns to the person / walks onto the spot and keeps pressing the key
-- until the story variable reaches the expected stage (and the flag is right), or time runs out.
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
local function var(v) local s = sb() if not s then return -1 end return emu:read16(s + 0x1000 + (v - 0x4000) * 2) end
local function flag(f) local s = sb() if not s then return -1 end return (emu:read8(s + 0xEE0 + (f >> 3)) >> (f & 7)) & 1 end
local function ok()
  if var(P.var) ~= P.expect then return false end
  if P.flag and flag(P.flag[1]) ~= P.flag[2] then return false end
  return true
end
local held, holdUntil = nil, 0
local function press(key, frames) emu:clearKeys(0x3FF) emu:addKey(key) held = key holdUntil = emu:currentFrame() + frames end
local state, t0, passAt = "intro", 0, nil
local function go(s) state = s t0 = emu:currentFrame() L("-> " .. s .. " at " .. t0 .. ", stage " .. var(P.var)) end
local function finish(result, why)
  emu:screenshot(P.out .. ".png")
  L(result .. (why and (": " .. why) or "") .. string.format(" (stage %d, expected %d)", var(P.var), P.expect))
  os.exit(result == "PASS" and 0 or 1)
end

callbacks:add("frame", function()
  local f = emu:currentFrame()
  if held and f >= holdUntil then emu:clearKeys(0x3FF) held = nil end
  local g, m, x, y = loc()
  if f % 600 == 0 then L(string.format("f=%d %s map=%d.%d pos=%d,%d stage=%d", f, state, g, m, x, y, var(P.var))) end
  if passAt then
    if f - passAt > 240 then finish("PASS") end
    if not held and f % 20 == 0 then press(K[P.key], 3) end   -- close the last messages
    return
  end
  if P.stay then
    if state == "act" and var(P.var) ~= P.expect then finish("FAIL", "the story moved on, but it should wait") end
    if state == "act" and f - t0 > P.stay then finish("PASS") end
  elseif state ~= "intro" and state ~= "settle" and ok() then
    if P.within and state == "act" and f - t0 > P.within then finish("FAIL", string.format("it took %d frames (more than %d): the moment still played", f - t0, P.within)) end
    passAt = f L("passed at " .. f) return
  end
  if P.within and state == "act" and f - t0 > P.within then finish("FAIL", "not within " .. P.within .. " frames: the moment still played") end
  if f > 60 * 60 * 12 then finish("FAIL", "timeout in " .. state) end
  local d = f - t0
  if held then return end
  if state == "intro" then
    local there = g == P.g and m == P.n and (P.arrive == "map" or (x == P.x and y == P.y))
    if there and f > 1000 then emu:clearKeys(0x3FF) go("settle") return end
    if f > 120 and f % 20 == 0 then press((f % 300 == 140) and K.START or K.A, 3) end
  elseif state == "settle" then
    if d == 30 then
      emu:screenshot(P.out .. "_start.png")
      for i = 0, 15 do                                      -- the people on the map (gObjectEvents), for the log
        local o = 0x02036E38 + i * 0x24
        if emu:read8(o) & 1 == 1 then
          local id, ox, oy = emu:read8(o + 8), emu:read16(o + 0x10) - 7, emu:read16(o + 0x12) - 7
          L(string.format("  object %d: local id %d at %d,%d", i, id, ox, oy))
          if P.target and id == P.target[1] and (ox ~= P.target[2] or oy ~= P.target[3]) then
            finish("FAIL", string.format("person %d is at %d,%d in the game, not at %d,%d (a map script moves them)", id, ox, oy, P.target[2], P.target[3]))
          end
        end
      end
    end
    if d > 40 then go(P.face and "face" or (P.walk and "walk" or "act")) end
  elseif state == "face" then
    if d == 1 then press(DIR[P.face], 3) elseif d > 30 then go("act") end
  elseif state == "walk" then
    if d == 1 then press(DIR[P.walk], 32) elseif d > 70 then go("act") end
  elseif state == "act" then
    -- B never starts a conversation: the first press is A, then B answers "no" and closes the messages
    if d % 20 == 0 then press((P.key == "B" and d <= 20) and K.A or K[P.key], 3) end
    if d == 50 or d == 130 or d == 250 then emu:screenshot(P.out .. "_act" .. d .. ".png") L("  act " .. d .. ": stage " .. var(P.var) .. (P.flag and (", flag " .. flag(P.flag[1])) or "")) end
    if d > 60 * 60 * 8 then finish("FAIL", "the story did not move on") end
  end
end)
