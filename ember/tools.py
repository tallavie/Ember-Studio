# Ember Studio tools that run in Python (they need PIL): the title screen, and screenshots of a ROM in mGBA.
import os, sys, json, subprocess, tempfile, glob, time

HERE = os.path.dirname(os.path.abspath(__file__))
APP = getattr(sys, '_MEIPASS', None) or os.path.dirname(HERE)
KL_TOOLS = os.path.join(APP, 'tools', 'kl')


def temp_dir():
    # not %TEMP%: mGBA does not start Lua scripts for ROMs under the Windows temp folder (tested 17.10.2026)
    base = os.environ.get('LOCALAPPDATA') or tempfile.gettempdir()
    d = os.path.join(base, 'EmberStudio', 'work'); os.makedirs(d, exist_ok=True)
    return d


def run_mgba(exe, lua, rom, timeout):
    """mGBA at full speed on a copy of the ROM in its own empty folder (mGBA indexes every ROM next to the one it
    opens, so a folder full of ROMs makes it start very slowly); the folder is removed afterwards"""
    import shutil
    d = tempfile.mkdtemp(prefix='run_', dir=temp_dir())
    try:
        r = os.path.join(d, 'game.gba'); shutil.copyfile(rom, r)
        p = subprocess.Popen([exe, '-C', 'fpsTarget=600', '-C', 'audioSync=0', '-C', 'videoSync=0', '--script', lua, r])
        try: p.wait(timeout)
        except subprocess.TimeoutExpired: p.kill(); p.wait(5)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def title(rom_in, rom_out, logo=None, subtitle=None, hero=None, background='keep'):
    """the title screen: a new logo (picture), subtitle lines, a hero picture instead of Charizard"""
    sys.path.insert(0, KL_TOOLS)
    from gba import Rom
    import title as T
    rom = Rom(rom_in)
    log = []
    if logo or subtitle:
        if not logo: raise ValueError('a subtitle needs a logo picture too')
        log.append('logo: %d tiles' % T.build(rom, logo, subtitle or None))
    if hero:
        log.append('hero: %d tiles' % T.build_scene(rom, hero, background))
    rom.save(rom_out) if hasattr(rom, 'save') else open(rom_out, 'wb').write(rom.u8)
    return {'ok': True, 'log': '\n'.join(log)}


SHOT_LUA = r'''
local OUT = %s
local K = C.GBA_KEY
local presses = %s
callbacks:add("frame", function()
  local f = emu:currentFrame()
  for _, p in ipairs(presses) do if f == p then emu:addKey(K.START) end if f == p + 3 then emu:clearKeys(0x3FF) end end
  if f == %d then emu:screenshot(OUT) os.exit(0) end
end)
'''


def screenshot(rom, frame=900, presses=(), mgba=None):
    """run the ROM in mGBA at full speed and take a screenshot at that frame -> png path"""
    exe = mgba
    if not exe:
        import server
        exe = server.find_mgba()
    if not exe: raise RuntimeError('mGBA not found')
    d = temp_dir(); png = os.path.join(d, 'shot_%d.png' % int(time.time() * 1000)); lua = os.path.join(d, 'shot.lua')
    open(lua, 'w').write(SHOT_LUA % (json.dumps(png.replace('\\', '/')), '{' + ','.join(str(int(p)) for p in presses) + '}', int(frame)))
    run_mgba(exe, lua, rom, 60)
    if not os.path.isfile(png): raise RuntimeError('no screenshot was taken')
    return png


START_LUA = r'''
local OUT = %s
local TG, TN, TX, TY = %d, %d, %d, %d
local K = C.GBA_KEY
local SB1, OBJS, SB2 = %d, %d, %d
local held, holdUntil, arrived = nil, 0, nil
local LOG = io.open(OUT .. ".log", "w")
local function loc()
  local sb = emu:read32(SB1)
  if sb < 0x02000000 or sb > 0x0203FFFF then return -1, -1, 0, 0 end
  return emu:read8(sb + 4), emu:read8(sb + 5), emu:read16(OBJS + 0x10) - 7, emu:read16(OBJS + 0x12) - 7
end
callbacks:add("frame", function()
  local f = emu:currentFrame()
  if held and f >= holdUntil then emu:clearKeys(0x3FF) held = nil end
  local g, m, x, y = loc()
  if f %% 300 == 0 then LOG:write(string.format("f=%%d map=%%d.%%d pos=%%d,%%d\n", f, g, m, x, y)) LOG:flush() end
  if arrived then
    if f - arrived == 30 and SB2 ~= 0 then                -- the player is called TEST (save block 2 starts with the name)
      local s2 = emu:read32(SB2)
      if s2 >= 0x02000000 and s2 < 0x02040000 then
        local name = { 0xCE, 0xBF, 0xCD, 0xCE, 0xFF, 0xFF, 0xFF, 0xFF }
        for i = 1, 8 do emu:write8(s2 + i - 1, name[i]) end
      end
    end
    if f - arrived == 40 then emu:saveStateFile(OUT, 1) os.exit(0) end
    return
  end
  if g == TG and m == TN and x == TX and y == TY and f > 1000 then arrived = f emu:clearKeys(0x3FF) held = nil return end
  if f > 60 * 60 * 5 then os.exit(1) end
  if not held and f > 120 and f %% 20 == 0 then
    local key = (f %% 300 == 140) and K.START or K.A
    emu:addKey(key) held = key holdUntil = f + 3
  end
end)
'''


def startstate(rom, g, n, x, y, mgba=None, ram=None):
    """run a test ROM (made by the editor's "Play from here") through the intro at full speed until the player stands
    on (g.n, x, y), then save a state there -> state path"""
    exe = mgba
    if not exe:
        import server
        exe = server.find_mgba()
    if not exe: raise RuntimeError('mGBA not found')
    d = temp_dir(); state = os.path.join(d, 'play_%d.ss1' % int(time.time() * 1000)); lua = os.path.join(d, 'start.lua')
    ram = ram or {'sb1': 0x03005008, 'objs': 0x02036E38}             # FireRed: gSaveBlock1Ptr, gObjectEvents
    open(lua, 'w').write(START_LUA % (json.dumps(state.replace(os.sep, '/')), g, n, x, y, int(ram['sb1']), int(ram['objs']), int(ram.get('sb2') or 0)))
    run_mgba(exe, lua, rom, 90)
    if os.path.isfile(state): to_state_version(state, 10)
    if not os.path.isfile(state):
        last = ''
        try: last = open(state + '.log').read().strip().splitlines()[-1]
        except Exception: pass
        raise RuntimeError('the game did not reach the start spot (is it walkable?) ' + last)
    return state


def to_state_version(path, version):
    """the editor's emulator (lib/mgba, wasm 2.5.1) reads save states up to format 10, the native mGBA nightly writes 11.
    The state is a PNG with the GBA state in a zlib 'gbAs' chunk whose first byte is the format: set it and repack.
    (Tested 17.10.2026: a converted state loads and the game runs on - walking, menus.)"""
    import zlib, struct
    b = open(path, 'rb').read()
    if b[:8] != bytes([137, 80, 78, 71, 13, 10, 26, 10]): return
    out, p = bytearray(b[:8]), 8
    while p < len(b):
        n, t = struct.unpack('>I4s', b[p:p + 8]); d = b[p + 8:p + 8 + n]
        if t == b'gbAs':
            raw = bytearray(zlib.decompress(d))
            if raw[0] > version: raw[0] = version
            d = zlib.compress(bytes(raw))
        out += struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)
        p += 12 + n
    open(path, 'wb').write(out)
